export async function handlePromosRequest({ request, response, url, env, api }) {
  const { sendJson, readJson, supabaseRequest, requestSessionUser, startRealtimeSession } = api

  if (request.method === 'POST' && url.pathname === '/api/promo-codes/redeem') {
    const sessionUser = requestSessionUser(request, env)
    if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')
    const body = await readJson(request)
    const code = String(body.code || '').trim()
    if (!code) throw new Error('Enter a promo code to redeem.')
    const result = await supabaseRequest(env, '/rest/v1/rpc/redeem_rorisk_promo_code', {
      method: 'POST',
      body: JSON.stringify({ p_user_uuid: sessionUser.uuid, p_code: code }),
    })
    if (result?.user) startRealtimeSession(request, response, env, result.user)
    sendJson(response, 200, {
      success: true,
      code: result?.code || code.toUpperCase(),
      rewardType: result?.rewardType === 'coins' ? 'coins' : 'rocoins',
      amount: Math.max(0, Math.trunc(Number(result?.amount) || 0)),
      user: result?.user || null,
    })
    return true
  }

  return false
}
