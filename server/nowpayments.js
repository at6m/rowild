import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'

/**
 * NOWPayments crypto cashier.
 *
 * Deposits use the payment API: the server asks for one payment in the payer's
 * coin, stores it against the user, and NOWPayments returns a one-time address
 * and an exact amount. Confirmation arrives twice — as an IPN webhook and from
 * the cashier's status poll — and both go through the same idempotent RPC, so a
 * deposit can only ever be credited once.
 *
 * Withdrawals are reserved locally and paid out by hand from the NOWPayments
 * dashboard (see scripts/payout.mjs); the server never holds dashboard
 * credentials or a 2FA seed.
 */

const API_BASE = 'https://api.nowpayments.io/v1'
const CURRENCIES_TTL_MS = 5 * 60 * 1000
const MIN_AMOUNT_TTL_MS = 10 * 60 * 1000
const ESTIMATE_TTL_MS = 60 * 1000
const STATUS_POLL_INTERVAL_MS = 4000

export const MIN_DEPOSIT_COINS = 100
export const MAX_COIN_AMOUNT = 100000000
export const MIN_WITHDRAW_COINS = 1000

// The tile order the cashier has always shown. `options` lists the
// NOWPayments currency codes that satisfy each tile, in preference order: the
// first one the merchant account actually accepts wins, so an account without,
// say, Solana USDC simply falls back to another network instead of breaking.
export const CRYPTO_METHODS = [
  { key: 'btc', name: 'Bitcoin', ticker: 'BTC', icon: '/assets/payments/btc.79d4fc52.png', options: [['btc', 'BTC']], withdraw: false },
  { key: 'eth', name: 'Ethereum', ticker: 'ETH', icon: '/assets/payments/eth.png', options: [['eth', 'ETH']], withdraw: false },
  { key: 'sol', name: 'Solana', ticker: 'SOL', icon: '/assets/payments/solana.png', options: [['sol', 'SOL']], withdraw: true },
  { key: 'ltc', name: 'Litecoin', ticker: 'LTC', icon: '/assets/payments/ltc.png', options: [['ltc', 'LTC']], withdraw: true },
  { key: 'usdt', name: 'Tether', ticker: 'USDT', icon: '/assets/payments/tether.png', options: [['usdttrc20', 'TRC-20'], ['usdterc20', 'ERC-20'], ['usdtsol', 'SOL'], ['usdtbsc', 'BEP-20']], withdraw: true },
  { key: 'usdc', name: 'USDC', ticker: 'USDC', icon: '/assets/payments/usdc.png', options: [['usdcsol', 'SOL'], ['usdcbsc', 'BEP-20'], ['usdcmatic', 'Polygon'], ['usdc', 'ERC-20']], withdraw: false },
  { key: 'bnb', name: 'BNB', ticker: 'BNB', icon: '/assets/payments/bnb.png', options: [['bnbbsc', 'BEP-20'], ['bnb', 'BNB']], withdraw: false },
  { key: 'trx', name: 'Tron', ticker: 'TRX', icon: '/assets/payments/trx.png', options: [['trx', 'TRC-20']], withdraw: false },
  { key: 'xmr', name: 'Monero', ticker: 'XMR', icon: '/assets/payments/xmr.png', options: [['xmr', 'Monero']], withdraw: false },
]

// NOWPayments reports more states than the ledger needs; anything that means
// "the money is on chain and irreversible" is credited as paid.
const STATUS_MAP = {
  waiting: 'pending',
  confirming: 'confirming',
  confirmed: 'paid',
  sending: 'paid',
  finished: 'paid',
  partially_paid: 'partially_paid',
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
}

let currencyCache = { key: '', at: 0, codes: null }
const minAmountCache = new Map()
const estimateCache = new Map()
const lastStatusCheck = new Map()

export const mapPaymentStatus = (status) => STATUS_MAP[String(status || '').toLowerCase()] || 'pending'

function settings(env = {}) {
  const apiKey = String(env.NOWPAYMENTS_API_KEY || '').trim()
  return { enabled: Boolean(apiKey), apiKey }
}

export function nowPaymentsEnabled(env = {}) {
  return settings(env).enabled
}

async function nowPaymentsRequest(env, path, options = {}) {
  const { apiKey } = settings(env)
  if (!apiKey) throw new Error('Crypto payments are not configured on this server.')
  const upstream = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    signal: AbortSignal.timeout(20000),
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const text = await upstream.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { /* non-JSON error body */ }
  if (!upstream.ok || payload?.status === false) {
    const message = payload?.message || payload?.error?.message || payload?.error
    throw new Error(typeof message === 'string' && message ? message : 'The payment provider rejected this request.')
  }
  return payload
}

/**
 * Currency codes this merchant account can actually accept. A failed lookup
 * returns the last known set (or null, meaning "assume configured"), so a
 * provider hiccup never empties the cashier.
 */
export async function availableCurrencies(env) {
  const { apiKey } = settings(env)
  if (!apiKey) return null
  if (currencyCache.key === apiKey && Date.now() - currencyCache.at < CURRENCIES_TTL_MS) return currencyCache.codes
  try {
    const payload = await nowPaymentsRequest(env, '/currencies')
    const codes = Array.isArray(payload?.currencies) ? payload.currencies.map((code) => String(code).toLowerCase()) : null
    if (codes?.length) {
      currencyCache = { key: apiKey, at: Date.now(), codes }
      return codes
    }
  } catch {
    // Fall through to the cached value.
  }
  return currencyCache.key === apiKey ? currencyCache.codes : null
}

function pickOption(method, codes) {
  if (!Array.isArray(codes) || !codes.length) return method.options[0]
  const available = new Set(codes)
  return method.options.find(([code]) => available.has(code)) || null
}

export async function listMethods(env, kind = 'deposit') {
  const codes = await availableCurrencies(env)
  return CRYPTO_METHODS
    .filter((method) => (kind === 'withdraw' ? method.withdraw : true))
    .map((method) => {
      const option = pickOption(method, codes)
      return {
        key: method.key,
        name: method.name,
        ticker: method.ticker,
        icon: method.icon,
        network: option ? option[1] : method.options[0][1],
        available: Boolean(option),
      }
    })
}

async function methodForKey(env, kind, key) {
  const wanted = String(key || '').trim().toLowerCase()
  const method = CRYPTO_METHODS.find((entry) => entry.key === wanted && (kind === 'withdraw' ? entry.withdraw : true))
  if (!method) throw new Error('The selected cryptocurrency is invalid.')
  const codes = await availableCurrencies(env)
  const option = pickOption(method, codes)
  if (!option) throw new Error(`${method.name} is temporarily unavailable. Please pick another cryptocurrency.`)
  return { ...method, payCurrency: option[0], network: option[1] }
}

/**
 * Minimum payment in USD for a currency, straight from the provider. Its value
 * moves with network fees, so it is never hard-coded here.
 */
export async function minimumUsd(env, payCurrency) {
  const cached = minAmountCache.get(payCurrency)
  if (cached && Date.now() - cached.at < MIN_AMOUNT_TTL_MS) return cached.value
  try {
    const payload = await nowPaymentsRequest(env, `/min-amount?currency_from=${encodeURIComponent(payCurrency)}&fiat_equivalent=usd`)
    const value = Number(payload?.fiat_equivalent)
    if (Number.isFinite(value) && value > 0) {
      minAmountCache.set(payCurrency, { value, at: Date.now() })
      return value
    }
  } catch {
    // Unknown minimum: let the provider reject the payment instead.
  }
  return null
}

export async function estimateCryptoAmount(env, payCurrency, usdAmount) {
  const cacheKey = `${payCurrency}|${usdAmount}`
  const cached = estimateCache.get(cacheKey)
  if (cached && Date.now() - cached.at < ESTIMATE_TTL_MS) return cached.value
  const payload = await nowPaymentsRequest(env, `/estimate?amount=${encodeURIComponent(usdAmount)}&currency_from=usd&currency_to=${encodeURIComponent(payCurrency)}`)
  const amount = Number(payload?.estimated_amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Unable to quote this cryptocurrency right now.')
  estimateCache.set(cacheKey, { value: amount, at: Date.now() })
  return amount
}

export async function priceFor(env, key, usdAmount = 10) {
  const method = await methodForKey(env, 'deposit', key)
  const amount = await estimateCryptoAmount(env, method.payCurrency, usdAmount)
  return { key: method.key, name: method.name, network: method.network, payCurrency: method.payCurrency, priceUsd: usdAmount / amount, minimumUsd: await minimumUsd(env, method.payCurrency) }
}

export function ipnCallbackUrl(request, env) {
  const configured = String(env.NOWPAYMENTS_IPN_BASE_URL || '').trim().replace(/\/$/, '')
  const forwardedProtocol = String(request?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim()
  const inferred = forwardedProtocol === 'https' && request?.headers?.host ? `https://${request.headers.host}` : ''
  const base = configured || inferred
  if (!base || !/^https:\/\//i.test(base) || /https:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(base)) {
    throw new Error('Set NOWPAYMENTS_IPN_BASE_URL to the public HTTPS URL of this site.')
  }
  return `${base}/api/payments/nowpayments/ipn`
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]))
  }
  return value
}

/**
 * NOWPayments signs the IPN body with HMAC-SHA512 over the payload serialised
 * with its keys sorted recursively — not over the raw request bytes.
 */
export function verifyIpnSignature(payload, signature, secret) {
  if (!secret || !signature) return false
  const expected = createHmac('sha512', secret).update(JSON.stringify(sortDeep(payload))).digest('hex')
  const supplied = String(signature).trim().toLowerCase()
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer)
}

export function publicDeposit(deposit, result = {}) {
  const credited = Boolean(result.credited) || Boolean(deposit.credited)
  const status = credited ? 'paid' : result.status || deposit.status
  const expired = status === 'expired' || (status === 'pending' && deposit.expires_at && Date.now() > new Date(deposit.expires_at).getTime())
  return {
    orderId: deposit.uuid,
    paymentId: deposit.track_id,
    coinAmount: Number(deposit.coin_amount) || 0,
    usdAmount: Number(deposit.usd_amount) || 0,
    payAmount: Number(deposit.pay_amount) || 0,
    currency: deposit.pay_currency,
    network: deposit.network,
    address: deposit.address,
    memo: deposit.memo || null,
    qrCode: deposit.qr_code || null,
    status,
    credited,
    expired: Boolean(expired),
    expiresAt: deposit.expires_at || null,
  }
}

export async function createDeposit({ env, supabaseRequest, user, coinAmount, key, coinsPerUsd, request }) {
  if (!user?.uuid) throw new Error('Please sign in to perform this action.')
  if (!settings(env).enabled) throw new Error('Crypto deposits are not configured on this server.')
  const coins = Math.trunc(Number(coinAmount))
  if (!Number.isSafeInteger(coins) || coins < MIN_DEPOSIT_COINS || coins > MAX_COIN_AMOUNT) {
    throw new Error(`Enter a deposit amount between ${MIN_DEPOSIT_COINS.toLocaleString('en-US')} and ${MAX_COIN_AMOUNT.toLocaleString('en-US')} Coins.`)
  }

  const method = await methodForKey(env, 'deposit', key)
  const usdAmount = Number((coins / coinsPerUsd).toFixed(2))
  const minimum = await minimumUsd(env, method.payCurrency)
  if (minimum !== null && usdAmount < minimum) {
    throw new Error(`The minimum ${method.name} deposit is $${minimum.toFixed(2)}.`)
  }

  const orderId = randomUUID()
  await supabaseRequest(env, '/rest/v1/rorisk_crypto_deposits', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ uuid: orderId, user_uuid: user.uuid, coin_amount: coins, usd_amount: usdAmount, pay_currency: method.ticker, network: method.network, status: 'creating', provider_payload: { provider: 'nowpayments', pay_currency: method.payCurrency } }),
  })

  // Without a publicly reachable origin the callback is simply omitted: the
  // cashier's status poll credits the deposit anyway, which keeps local dev and
  // fresh deployments working instead of failing to create an address at all.
  let callbackUrl = null
  try { callbackUrl = ipnCallbackUrl(request, env) } catch { /* no public origin: rely on polling */ }

  let payment
  try {
    payment = await nowPaymentsRequest(env, '/payment', {
      method: 'POST',
      body: {
        price_amount: usdAmount,
        price_currency: 'usd',
        pay_currency: method.payCurrency,
        ...(callbackUrl ? { ipn_callback_url: callbackUrl } : {}),
        order_id: orderId,
        order_description: `RoWild Coins deposit ${orderId}`,
      },
    })
  } catch (error) {
    await supabaseRequest(env, `/rest/v1/rorisk_crypto_deposits?uuid=eq.${orderId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
    }).catch(() => {})
    throw error
  }

  const paymentId = String(payment?.payment_id || '')
  if (!paymentId || !payment?.pay_address || !Number.isFinite(Number(payment?.pay_amount))) {
    await supabaseRequest(env, `/rest/v1/rorisk_crypto_deposits?uuid=eq.${orderId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
    }).catch(() => {})
    throw new Error('NOWPayments did not return a valid deposit address.')
  }

  const qrCode = await QRCode.toDataURL(String(payment.pay_address), { margin: 1, width: 512, errorCorrectionLevel: 'M' }).catch(() => null)
  const status = mapPaymentStatus(payment.payment_status)
  await supabaseRequest(env, `/rest/v1/rorisk_crypto_deposits?uuid=eq.${orderId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      track_id: paymentId,
      pay_amount: Number(payment.pay_amount),
      pay_currency: method.ticker,
      network: method.network,
      address: String(payment.pay_address),
      memo: payment.payin_extra_id ? String(payment.payin_extra_id) : null,
      qr_code: qrCode,
      status,
      expires_at: payment.expiration_estimate_date || null,
      provider_payload: { provider: 'nowpayments', payment_id: paymentId, payment_status: payment.payment_status, pay_currency: method.payCurrency, payment },
      updated_at: new Date().toISOString(),
    }),
  })

  return publicDeposit({
    uuid: orderId,
    track_id: paymentId,
    coin_amount: coins,
    usd_amount: usdAmount,
    pay_amount: payment.pay_amount,
    pay_currency: method.ticker,
    network: method.network,
    address: payment.pay_address,
    memo: payment.payin_extra_id || null,
    qr_code: qrCode,
    status,
    credited: false,
    expires_at: payment.expiration_estimate_date || null,
  })
}

export async function fetchDepositByPaymentId(supabaseRequest, env, paymentId) {
  const query = new URLSearchParams({ track_id: `eq.${paymentId}`, select: '*', limit: '1' })
  const rows = await supabaseRequest(env, `/rest/v1/rorisk_crypto_deposits?${query}`)
  return Array.isArray(rows) ? rows[0] || null : null
}

async function finalizeDeposit({ env, supabaseRequest, payment, orderId }) {
  const status = mapPaymentStatus(payment?.payment_status)
  const result = await supabaseRequest(env, '/rest/v1/rpc/finalize_rorisk_crypto_deposit', {
    method: 'POST',
    body: JSON.stringify({
      p_order_uuid: orderId || null,
      p_track_id: String(payment?.payment_id || ''),
      p_status: status,
      p_payload: { provider: 'nowpayments', payment },
    }),
  })
  return {
    status,
    credited: status === 'paid' || Boolean(result?.deposit?.credited),
    user: result?.user || null,
    deposit: result?.deposit || null,
  }
}

/**
 * Same idempotent path as the webhook, used when the cashier polls: an IPN that
 * cannot reach a local dev server still credits through here.
 */
export async function refreshDeposit({ env, supabaseRequest, deposit }) {
  if (deposit.credited) return { status: 'paid', credited: true, user: null }
  if (deposit.provider_payload?.provider !== 'nowpayments' || !deposit.track_id) {
    return { status: deposit.status, credited: false }
  }

  const last = lastStatusCheck.get(deposit.uuid) || 0
  if (Date.now() - last < STATUS_POLL_INTERVAL_MS) return { status: deposit.status, credited: false, throttled: true }
  lastStatusCheck.set(deposit.uuid, Date.now())

  let payment
  try {
    payment = await nowPaymentsRequest(env, `/payment/${encodeURIComponent(deposit.track_id)}`)
  } catch {
    return { status: deposit.status, credited: false, unavailable: true }
  }

  const status = mapPaymentStatus(payment?.payment_status)
  // Writing every poll would churn the ledger row for no reason.
  if (status === deposit.status && status !== 'paid') return { status, credited: false }

  try {
    return await finalizeDeposit({ env, supabaseRequest, payment: { ...payment, payment_id: payment?.payment_id || deposit.track_id }, orderId: deposit.uuid })
  } catch {
    return { status: deposit.status, credited: false, unavailable: true }
  }
}

export async function applyIpn({ env, supabaseRequest, payload }) {
  const orderId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(payload?.order_id || '')) ? String(payload.order_id) : null
  return finalizeDeposit({ env, supabaseRequest, payment: payload, orderId })
}

/**
 * Withdrawals are reserved immediately so the balance can never be spent twice,
 * then paid out from the dashboard. The crypto estimate is informational: the
 * operator sends the live amount shown by NOWPayments.
 */
export async function createWithdrawal({ env, supabaseRequest, user, coinAmount, key, address, memo, coinsPerUsd }) {
  if (!user?.uuid) throw new Error('Please sign in to perform this action.')
  if (!settings(env).enabled) throw new Error('Crypto withdrawals are not configured on this server.')
  const coins = Math.trunc(Number(coinAmount))
  const destination = String(address || '').trim()
  if (!Number.isSafeInteger(coins) || coins < MIN_WITHDRAW_COINS || coins > MAX_COIN_AMOUNT) {
    throw new Error(`Enter a withdrawal amount between ${MIN_WITHDRAW_COINS.toLocaleString('en-US')} and ${MAX_COIN_AMOUNT.toLocaleString('en-US')} Coins.`)
  }
  if (destination.length < 8 || destination.length > 256) throw new Error('Enter a valid withdrawal address.')

  const method = await methodForKey(env, 'withdraw', key)
  const usdAmount = Number((coins / coinsPerUsd).toFixed(2))
  const cryptoAmount = Number((await estimateCryptoAmount(env, method.payCurrency, usdAmount)).toPrecision(12))

  const withdrawalId = randomUUID()
  const reserved = await supabaseRequest(env, '/rest/v1/rpc/reserve_rorisk_crypto_withdrawal', {
    method: 'POST',
    body: JSON.stringify({
      p_uuid: withdrawalId,
      p_user_uuid: user.uuid,
      p_coin_amount: coins,
      p_usd_amount: usdAmount,
      p_crypto_amount: cryptoAmount,
      p_currency: method.ticker,
      p_network: method.network,
      p_address: destination,
      p_memo: String(memo || '').trim().slice(0, 200) || null,
    }),
  })

  await supabaseRequest(env, `/rest/v1/rorisk_crypto_withdrawals?uuid=eq.${withdrawalId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'pending',
      provider_payload: { provider: 'nowpayments', manual_payout: true, pay_currency: method.payCurrency, estimated_crypto_amount: cryptoAmount },
      updated_at: new Date().toISOString(),
    }),
  })

  return {
    user: reserved?.user || null,
    withdrawal: { id: withdrawalId, coinAmount: coins, usdAmount, cryptoAmount, currency: method.ticker, network: method.network, payCurrency: method.payCurrency, status: 'pending' },
  }
}
