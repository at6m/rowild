import { MAX_COIN_AMOUNT, MIN_DEPOSIT_COINS, MIN_WITHDRAW_COINS, applyIpn, createDeposit, createWithdrawal, fetchDepositByPaymentId, listMethods, nowPaymentsEnabled, priceFor, publicDeposit, refreshDeposit, verifyIpnSignature } from './nowpayments.js'

// The estimate route is the only public endpoint that spends the merchant API
// quota, so it is rate limited per client IP.
const ESTIMATE_WINDOW_MS = 60 * 1000
const ESTIMATE_LIMIT = 30
const estimateHits = new Map()

function allowEstimate(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const ip = forwarded || String(request.socket?.remoteAddress || 'unknown')
  const now = Date.now()
  const hits = (estimateHits.get(ip) || []).filter((time) => now - time < ESTIMATE_WINDOW_MS)
  if (hits.length >= ESTIMATE_LIMIT) {
    estimateHits.set(ip, hits)
    return false
  }
  hits.push(now)
  estimateHits.set(ip, hits)
  if (estimateHits.size > 5000) {
    for (const [key, times] of estimateHits) {
      if (!times.some((time) => now - time < ESTIMATE_WINDOW_MS)) estimateHits.delete(key)
    }
  }
  return true
}

export async function handlePaymentsRequest({ request, response, url, env, api }) {
  const { sendJson, readJson, sendText, readRawBody, supabaseRequest, requestSessionUser, startRealtimeSession, COINS_PER_USD } = api

  if (request.method === 'GET' && url.pathname === '/api/payments/nowpayments/config') {
    const enabled = nowPaymentsEnabled(env)
    const [deposits, withdrawals] = enabled
      ? await Promise.all([listMethods(env, 'deposit'), listMethods(env, 'withdraw')])
      : [[], []]
    sendJson(response, 200, {
      enabled,
      provider: 'nowpayments',
      coinsPerUsd: COINS_PER_USD,
      minCoinAmount: MIN_DEPOSIT_COINS,
      maxCoinAmount: MAX_COIN_AMOUNT,
      minWithdrawCoinAmount: MIN_WITHDRAW_COINS,
      deposits,
      withdrawals,
    })
    return true
  }

  if (request.method === 'GET' && url.pathname === '/api/payments/nowpayments/estimate') {
    if (!nowPaymentsEnabled(env)) throw new Error('Crypto payments are not configured on this server.')
    if (!allowEstimate(request)) {
      sendJson(response, 429, { error: 'Too many requests. Please slow down and try again in a minute.' })
      return true
    }
    const usdAmount = Number(url.searchParams.get('usdAmount') || 10)
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) throw new Error('Enter a valid amount.')
    const quote = await priceFor(env, url.searchParams.get('currency'), usdAmount)
    sendJson(response, 200, quote)
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/payments/nowpayments/deposit') {
    const sessionUser = requestSessionUser(request, env)
    if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')
    const body = await readJson(request)
    const payment = await createDeposit({ env, supabaseRequest, user: sessionUser, coinAmount: body.coinAmount, key: body.currency, coinsPerUsd: COINS_PER_USD, request })
    sendJson(response, 200, { payment })
    return true
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/payments/nowpayments/deposit/')) {
    const sessionUser = requestSessionUser(request, env)
    if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')
    const paymentId = decodeURIComponent(url.pathname.slice('/api/payments/nowpayments/deposit/'.length))
    if (!/^[0-9]{1,24}$/.test(paymentId)) throw new Error('The deposit reference is invalid.')
    const deposit = await fetchDepositByPaymentId(supabaseRequest, env, paymentId)
    if (!deposit || deposit.user_uuid !== sessionUser.uuid) throw new Error('Deposit not found.')
    const result = await refreshDeposit({ env, supabaseRequest, deposit })
    if (result.user) startRealtimeSession(request, response, env, result.user)
    sendJson(response, 200, { deposit: publicDeposit(deposit, result), verificationUnavailable: Boolean(result.unavailable) })
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/payments/nowpayments/withdraw') {
    const sessionUser = requestSessionUser(request, env)
    if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')
    const body = await readJson(request)
    const { withdrawal, user } = await createWithdrawal({
      env,
      supabaseRequest,
      user: sessionUser,
      coinAmount: body.coinAmount,
      key: body.currency,
      address: body.address,
      memo: body.memo,
      coinsPerUsd: COINS_PER_USD,
    })
    if (user) startRealtimeSession(request, response, env, user)
    sendJson(response, 200, { withdrawal })
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/payments/nowpayments/ipn') {
    const rawBody = await readRawBody(request)
    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new Error('Invalid payment callback payload.')
    }
    if (!verifyIpnSignature(payload, request.headers['x-nowpayments-sig'], env.NOWPAYMENTS_IPN_SECRET)) {
      throw new Error('Invalid payment callback signature.')
    }
    // The callback is only an accelerator: the cashier's poll credits the same
    // deposit through the same RPC, so a duplicate or late IPN is harmless.
    await applyIpn({ env, supabaseRequest, payload }).catch((error) => {
      console.warn('[nowpayments] ipn failed', payload?.payment_id, error instanceof Error ? error.message : error)
    })
    sendText(response, 200, 'ok')
    return true
  }

  return false
}
