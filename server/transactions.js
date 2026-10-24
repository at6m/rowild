/**
 * Transaction history for the profile dropdown.
 *
 * The client used to read a `transactions` array that no endpoint ever filled,
 * so the list was always empty — pending deposits in particular never appeared.
 * This endpoint reads the crypto ledger (deposits and withdrawals) for the
 * signed-in account and normalises it to the row shape that modal renders.
 */

const STATUS_ALIASES = {
  pending: 'pending',
  new: 'pending',
  waiting: 'pending',
  creating: 'pending',
  confirming: 'pending',
  partially_paid: 'pending',
  processing: 'pending',
  reserved: 'pending',
  paid: 'completed',
  credited: 'completed',
  complete: 'completed',
  completed: 'completed',
  confirmed: 'completed',
  expired: 'expired',
  failed: 'canceled',
  refunded: 'canceled',
  rejected: 'canceled',
  canceled: 'canceled',
  cancelled: 'canceled',
}

const stateFor = (status) => STATUS_ALIASES[String(status || '').toLowerCase()] || 'pending'

function depositRow(deposit) {
  return {
    uuid: deposit.uuid,
    type: 'crypto deposit',
    state: stateFor(deposit.status),
    status: deposit.status,
    amount: Number(deposit.coin_amount) || 0,
    currency: 'coins',
    method: `${deposit.pay_currency || 'Crypto'} · ${deposit.network || ''}`.trim(),
    details: `${deposit.pay_currency || 'Crypto'} deposit`,
    address: deposit.address || null,
    txid: deposit.provider_payload?.payment?.payin_hash || deposit.provider_payload?.signature || deposit.track_id || null,
    created_at: deposit.created_at,
    expires_at: deposit.expires_at || null,
  }
}

function withdrawalRow(withdrawal) {
  return {
    uuid: withdrawal.uuid,
    type: 'crypto withdrawal',
    state: stateFor(withdrawal.status),
    status: withdrawal.status,
    // Withdrawals take coins out of the balance, so the row is negative.
    amount: -(Number(withdrawal.coin_amount) || 0),
    currency: 'coins',
    method: `${withdrawal.currency} · ${withdrawal.network}`,
    details: `${withdrawal.currency} withdrawal`,
    address: withdrawal.address || null,
    txid: withdrawal.provider_payload?.txid || withdrawal.provider_payload?.hash || withdrawal.track_id || null,
    created_at: withdrawal.created_at,
  }
}

export async function handleTransactionsRequest({ request, response, url, env, api }) {
  const { sendJson, supabaseRequest, requestSessionUser } = api

  if (request.method !== 'GET' || url.pathname !== '/api/transactions') return false

  const sessionUser = requestSessionUser(request, env)
  if (!sessionUser?.uuid) {
    sendJson(response, 401, { error: 'Please sign in to view your transactions.' })
    return true
  }

  const query = new URLSearchParams({
    user_uuid: `eq.${sessionUser.uuid}`,
    select: '*',
    order: 'created_at.desc',
    limit: '50',
  })

  const [deposits, withdrawals] = await Promise.all([
    supabaseRequest(env, `/rest/v1/rorisk_crypto_deposits?${query}`),
    supabaseRequest(env, `/rest/v1/rorisk_crypto_withdrawals?${query}`),
  ])

  const transactions = [
    ...(Array.isArray(deposits) ? deposits : []).map(depositRow),
    ...(Array.isArray(withdrawals) ? withdrawals : []).map(withdrawalRow),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  sendJson(response, 200, { transactions })
  return true
}
