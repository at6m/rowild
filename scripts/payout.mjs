/**
 * Manual crypto payouts.
 *
 * Withdrawals are reserved (coins already deducted) the moment a user requests
 * one. Send the crypto from the NOWPayments dashboard, then record it here so
 * the ledger and the user's history leave "pending":
 *
 *   node scripts/payout.mjs                          # list withdrawals waiting
 *   node scripts/payout.mjs <uuid> paid <txid>       # payout sent
 *   node scripts/payout.mjs <uuid> failed [note]     # refund the coins
 */
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV || 'production', '.', '')
const url = String(env.SUPABASE_URL || '').replace(/\/$/, '')
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ''

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env first.')
  process.exit(1)
}

async function rest(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Request failed with ${response.status}.`)
  return body
}

async function listPending() {
  const query = new URLSearchParams({
    status: 'in.(pending,reserved,creating)',
    select: 'uuid,created_at,user_uuid,coin_amount,usd_amount,crypto_amount,currency,network,address,memo',
    order: 'created_at.asc',
    limit: '50',
  })
  const rows = await rest(`/rest/v1/rorisk_crypto_withdrawals?${query}`)
  if (!Array.isArray(rows) || !rows.length) {
    console.log('No withdrawals waiting for a payout.')
    return
  }
  for (const row of rows) {
    console.log([
      row.uuid,
      new Date(row.created_at).toISOString(),
      `${Number(row.coin_amount).toLocaleString('en-US')} Coins = $${Number(row.usd_amount).toFixed(2)}`,
      `~${row.crypto_amount} ${row.currency}`,
      row.network,
      row.address,
      row.memo ? `memo: ${row.memo}` : '',
      `user ${row.user_uuid}`,
    ].filter(Boolean).join('  |  '))
  }
  console.log(`\n${rows.length} withdrawal(s). Send each one from the NOWPayments dashboard, then run:`)
  console.log('  node scripts/payout.mjs <uuid> paid <transaction_hash>')
}

async function finalize(uuid, outcome, detail) {
  const paid = outcome === 'paid' || outcome === 'complete'
  const payload = {
    p_uuid: uuid,
    p_track_id: detail && !paid ? null : detail || null,
    p_status: paid ? 'complete' : 'failed',
    p_payload: { provider: 'nowpayments', manual_payout: true, ...(paid ? { txid: detail || null } : { note: detail || null }), settled_at: new Date().toISOString() },
  }
  const result = await rest('/rest/v1/rpc/finalize_rorisk_crypto_withdrawal', { method: 'POST', body: JSON.stringify(payload) })
  const withdrawal = result?.withdrawal
  console.log(`${paid ? 'Marked paid' : 'Cancelled and refunded'}: ${withdrawal?.uuid} (${withdrawal?.status})`)
  if (!paid && result?.user) console.log(`Refunded ${Number(withdrawal?.coin_amount || 0).toLocaleString('en-US')} Coins.`)
}

const [uuid, outcome, detail] = process.argv.slice(2)

try {
  if (!uuid) {
    await listPending()
  } else if (!['paid', 'complete', 'failed'].includes(outcome)) {
    console.error('Usage: node scripts/payout.mjs <uuid> paid <txid> | node scripts/payout.mjs <uuid> failed [note]')
    process.exitCode = 1
  } else {
    await finalize(uuid, outcome, detail)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
