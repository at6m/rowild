const TOUCH_INTERVAL_MS = 20000
const touchedAt = new Map()

/**
 * Records that a player was just active. Called from the session endpoint, which the
 * client polls every few seconds, so the write is throttled to one per player per
 * 20 seconds and failures are swallowed: presence must never break a request.
 */
export async function touchPresence(env, supabaseRequest, user) {
  const uuid = user?.uuid || user?.id
  if (!uuid || typeof supabaseRequest !== 'function') return
  const now = Date.now()
  if (now - (touchedAt.get(uuid) || 0) < TOUCH_INTERVAL_MS) return
  touchedAt.set(uuid, now)
  if (touchedAt.size > 20000) touchedAt.clear()
  try {
    await supabaseRequest(env, '/rest/v1/rorisk_presence?on_conflict=user_uuid', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_uuid: uuid, last_seen_at: new Date(now).toISOString() }),
    })
  } catch {
    // The RTP/presence migration may not be applied yet, or the database may be
    // momentarily unavailable. The admin dashboard falls back to the socket registry.
  }
}
