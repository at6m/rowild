import { getRealtimeOnlineUsers } from './chat.js'

const ONLINE_WINDOW_MS = 60 * 1000
const GAMES = new Set(['all', 'dice', 'mines', 'blackjack', 'coinflip', 'cases', 'upgrader', 'xroulette', 'battles'])
const PLAYER_FIELDS = 'uuid,username,avatar_headshot,coins,rocoins,rank,level,xp,joined_at'

function httpError(message, status, code) {
  const error = new Error(message)
  error.status = status
  if (code) error.code = code
  return error
}

function isMissingTable(error) {
  return /relation .* does not exist|schema cache|could not find the table|PGRST205/i.test(String(error?.message || ''))
}

// PostgREST filters are comma/star sensitive; keep search terms to plain words.
function safeSearchTerm(value) {
  return String(value || '').replace(/[(),*%\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/**
 * Minimal PostgREST client that also surfaces the total row count, which the shared
 * supabaseRequest helper does not expose. Keys fall back exactly like the rest of the
 * server: the new-style secret first, then the legacy service-role JWT.
 */
async function query(env, path, { method = 'GET', body, prefer } = {}) {
  const keys = [...new Set([env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean))]
  if (!env.SUPABASE_URL || !keys.length) throw httpError('Server credentials are not configured.', 503)
  let lastError
  for (const [index, key] of keys.entries()) {
    const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        apikey: key,
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let payload
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    if (response.ok) {
      const range = response.headers.get('content-range') || ''
      const total = Number(range.split('/')[1])
      return { data: payload, total: Number.isFinite(total) ? total : null }
    }
    lastError = new Error(payload?.message || payload?.hint || `Supabase request failed (${response.status}).`)
    if (![401, 403].includes(response.status) || index === keys.length - 1) throw lastError
  }
  throw lastError || new Error('Supabase request failed.')
}

/**
 * Every admin route re-reads the rank from the database instead of trusting the
 * signed cookie, so demoting a player takes effect on the next request.
 */
async function requireAdmin({ request, env, api }) {
  const session = api.requestSessionUser(request, env)
  if (!session?.uuid) throw httpError('Please sign in with an administrator account.', 401, 'UNAUTHENTICATED')
  const { data } = await query(env, `/rest/v1/rorisk_users?uuid=eq.${encodeURIComponent(session.uuid)}&select=uuid,username,rank&limit=1`)
  const account = data?.[0]
  if (!account) throw httpError('Your account could not be found. Please sign in again.', 401, 'UNAUTHENTICATED')
  if (String(account.rank || '').toLowerCase() !== 'admin') {
    throw httpError('This area is for administrators only.', 403, 'FORBIDDEN')
  }
  return account
}

async function readRtp(env) {
  try {
    const [settings, defaults] = await Promise.all([
      query(env, '/rest/v1/rorisk_rtp_settings?select=user_uuid,game,rtp_percent,note'),
      query(env, '/rest/v1/rorisk_rtp_defaults?select=game,label,default_rtp&order=default_rtp.desc'),
    ])
    return { ready: true, settings: settings.data || [], defaults: defaults.data || [] }
  } catch (error) {
    if (isMissingTable(error)) return { ready: false, settings: [], defaults: [] }
    throw error
  }
}

async function readPresence(env) {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  try {
    const { data } = await query(env, `/rest/v1/rorisk_presence?select=user_uuid,last_seen_at&last_seen_at=gte.${encodeURIComponent(since)}&order=last_seen_at.desc&limit=500`)
    return Array.isArray(data) ? data : []
  } catch {
    // Presence is optional: without the table we still know who holds a socket.
    return []
  }
}

function onlineUserIds(presence) {
  const ids = new Set(presence.map((row) => row.user_uuid).filter(Boolean))
  for (const user of getRealtimeOnlineUsers()) {
    if (user.uuid) ids.add(user.uuid)
  }
  return ids
}

function groupSettings(settings) {
  const grouped = new Map()
  for (const row of settings) {
    if (!row?.user_uuid) continue
    const current = grouped.get(row.user_uuid) || {}
    current[row.game] = row.rtp_percent === null ? null : Number(row.rtp_percent)
    grouped.set(row.user_uuid, current)
  }
  return grouped
}

async function overview(context) {
  const { env, url, api, response } = context
  await requireAdmin(context)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 20))
  const search = safeSearchTerm(url.searchParams.get('search'))
  const offset = (page - 1) * limit

  let playersPath = `/rest/v1/rorisk_users?select=${PLAYER_FIELDS}&order=joined_at.desc&limit=${limit}&offset=${offset}`
  if (search) {
    const term = encodeURIComponent(`*${search}*`)
    playersPath += `&or=(username.ilike.${term},email.ilike.${term})`
  }

  const [playersResult, rtp, presence] = await Promise.all([
    query(env, playersPath, { prefer: 'count=exact' }),
    readRtp(env),
    readPresence(env),
  ])

  const online = onlineUserIds(presence)
  const grouped = groupSettings(rtp.settings)
  const total = playersResult.total ?? (playersResult.data?.length || 0)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const players = (playersResult.data || []).map((player) => ({
    ...player,
    online: online.has(player.uuid),
    settings: grouped.get(player.uuid) || {},
  }))

  const customized = new Set(
    rtp.settings.filter((row) => row.rtp_percent !== null && row.rtp_percent !== undefined).map((row) => row.user_uuid),
  ).size

  api.sendJson(response, 200, {
    players,
    defaults: rtp.defaults,
    rtpReady: rtp.ready,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      currentPage: page,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    },
    stats: {
      players: total,
      online: online.size,
      customized,
      games: rtp.defaults.length,
    },
    search,
    serverTime: Date.now(),
  })
}

async function live(context) {
  const { env, api, response } = context
  await requireAdmin(context)
  const presence = await readPresence(env)
  const seenAt = new Map(presence.map((row) => [row.user_uuid, row.last_seen_at]))
  const registry = new Map(getRealtimeOnlineUsers().map((player) => [player.uuid, player]))
  const ids = onlineUserIds(presence)
  if (ids.size === 0) {
    api.sendJson(response, 200, { players: [], serverTime: Date.now() })
    return
  }

  const list = [...ids].slice(0, 200)
  const { data } = await query(
    env,
    `/rest/v1/rorisk_users?uuid=in.(${list.join(',')})&select=uuid,username,avatar_headshot,coins,rocoins,rank,level`,
  )
  const players = (data || []).map((player) => ({
    ...player,
    lastSeenAt: seenAt.get(player.uuid) || null,
    room: registry.get(player.uuid)?.room || null,
    sessions: registry.get(player.uuid)?.sessions || 0,
  }))
  players.sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || '')))

  api.sendJson(response, 200, { players, serverTime: Date.now() })
}

function parseRtpEntries(body) {
  const entries = Array.isArray(body?.settings) ? body.settings.slice(0, 24) : []
  if (!entries.length) throw httpError('There is nothing to save.', 400)
  const clears = []
  const upserts = []
  for (const entry of entries) {
    const game = String(entry?.game || '').trim()
    if (!GAMES.has(game)) throw httpError('That game is not recognised.', 400)
    const raw = entry?.rtp
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      clears.push(game)
      continue
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || value > 200) {
      throw httpError('RTP must be between 0 and 200, or default.', 400)
    }
    upserts.push({ game, rtp_percent: Math.round(value * 100) / 100 })
  }
  return { upserts, clears }
}

async function saveRtp(context) {
  const { request, env, api, response } = context
  await requireAdmin(context)
  const body = await api.readJson(request)
  const userUuid = String(body?.userUuid || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userUuid)) {
    throw httpError('That player is not valid.', 400)
  }
  const { upserts, clears } = parseRtpEntries(body)

  try {
    if (upserts.length) {
      await query(env, '/rest/v1/rorisk_rtp_settings?on_conflict=user_uuid,game', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: upserts.map((entry) => ({ ...entry, user_uuid: userUuid })),
      })
    }
    for (const game of clears) {
      await query(env, `/rest/v1/rorisk_rtp_settings?user_uuid=eq.${userUuid}&game=eq.${encodeURIComponent(game)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
      })
    }
  } catch (error) {
    if (isMissingTable(error)) {
      throw httpError('The RTP tables are not installed yet. Apply the Supabase migration first.', 409, 'RTP_NOT_INSTALLED')
    }
    throw error
  }

  const { data } = await query(env, `/rest/v1/rorisk_rtp_settings?user_uuid=eq.${userUuid}&select=game,rtp_percent,updated_at`)
  const settings = groupSettings(data || [])
  api.sendJson(response, 200, { settings: settings.get(userUuid) || {}, rows: data || [] })
}

async function resetRtp(context) {
  const { request, env, api, response } = context
  await requireAdmin(context)
  const body = await api.readJson(request)
  const userUuid = String(body?.userUuid || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userUuid)) {
    throw httpError('That player is not valid.', 400)
  }
  try {
    await query(env, `/rest/v1/rorisk_rtp_settings?user_uuid=eq.${userUuid}`, { method: 'DELETE', prefer: 'return=minimal' })
  } catch (error) {
    if (isMissingTable(error)) {
      throw httpError('The RTP tables are not installed yet. Apply the Supabase migration first.', 409, 'RTP_NOT_INSTALLED')
    }
    throw error
  }
  api.sendJson(response, 200, { settings: {} })
}

export async function handleAdminRequest(context) {
  const { request, url, response, api } = context
  if (!url.pathname.startsWith('/api/admin')) return false

  try {
    if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
      await overview(context)
      return true
    }
    if (url.pathname === '/api/admin/live' && request.method === 'GET') {
      await live(context)
      return true
    }
    if (url.pathname === '/api/admin/rtp' && request.method === 'POST') {
      await saveRtp(context)
      return true
    }
    if (url.pathname === '/api/admin/rtp/reset' && request.method === 'POST') {
      await resetRtp(context)
      return true
    }
    api.sendJson(response, 404, { error: 'Not found.' })
    return true
  } catch (error) {
    api.sendJson(response, error?.status || 400, { error: error?.message || 'Unable to complete that request.', code: error?.code })
    return true
  }
}
