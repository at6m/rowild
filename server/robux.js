import { randomUUID } from 'node:crypto'

const MIN_ROCOINS = 14
const ROCOINS_PER_ROBUX = 2

/**
 * Robux withdrawals are reserved (RoCoins already deducted) the moment a player
 * asks for one, exactly like crypto withdrawals. An admin pays them out from the
 * dashboard, which completes or cancels-and-refunds the request.
 */
export async function handleRobuxRequest({ request, response, url, env, api }) {
  const { sendJson, readJson, supabaseRequest, requestSessionUser, startRealtimeSession } = api

  if (request.method !== 'POST' || url.pathname !== '/api/robux/withdraw') return false

  const sessionUser = requestSessionUser(request, env)
  if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')

  const body = await readJson(request)
  const coins = Math.trunc(Number(body?.coins))
  if (!Number.isSafeInteger(coins) || coins < MIN_ROCOINS) {
    throw new Error(`Enter a Robux withdrawal of at least ${MIN_ROCOINS} RoCoins.`)
  }
  const robux = Math.floor(coins / ROCOINS_PER_ROBUX)
  if (robux < 7) throw new Error('The minimum Robux withdrawal is 7 R$.')

  const result = await supabaseRequest(env, '/rest/v1/rpc/reserve_rorisk_robux_withdrawal', {
    method: 'POST',
    body: JSON.stringify({
      p_uuid: randomUUID(),
      p_user_uuid: sessionUser.uuid,
      p_rocoins: coins,
      p_robux: robux,
    }),
  })

  if (result?.user) startRealtimeSession(request, response, env, result.user)
  sendJson(response, 200, {
    withdrawal: {
      id: result?.withdrawal?.uuid || null,
      coins,
      robux,
      afterTaxRobux: Math.floor(robux * 0.7),
      status: result?.withdrawal?.status || 'pending',
    },
  })
  return true
}
