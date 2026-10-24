export async function handleRaceRequest({ request, response, url, env, api }) {
  const { sendJson, supabaseRequest, requestSessionUser, startRealtimeSession } = api

  if (request.method === 'GET' && url.pathname === '/api/race') {
    const sessionUser = requestSessionUser(request, env)
    const state = await supabaseRequest(env, '/rest/v1/rpc/rorisk_race_state', {
      method: 'POST',
      body: JSON.stringify({ p_user_uuid: sessionUser?.uuid || null }),
    })
    sendJson(response, 200, state)
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/race/claim') {
    const sessionUser = requestSessionUser(request, env)
    if (!sessionUser?.uuid) throw new Error('Please sign in to perform this action.')
    const result = await supabaseRequest(env, '/rest/v1/rpc/claim_rorisk_race_reward', {
      method: 'POST',
      body: JSON.stringify({ p_user_uuid: sessionUser.uuid }),
    })
    if (result?.user) startRealtimeSession(request, response, env, result.user)
    sendJson(response, 200, {
      success: true,
      amount: Math.max(0, Math.trunc(Number(result?.amount) || 0)),
      user: result?.user || null,
    })
    return true
  }

  return false
}
