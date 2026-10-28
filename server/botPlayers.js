import { createHash, randomInt } from 'node:crypto'
import { ensureSimulatedAccounts } from './liveBets.js'

/**
 * Named players who turn up to real users' open lobbies.
 *
 * Someone opens a case battle or a coinflip game and one of these accounts takes
 * a seat after an 8-35 second wait, so an open lobby fills instead of sitting
 * empty. Nothing is simulated in a fake table: battle seats are added through the
 * same `add_rorisk_battle_bots` contract the lobby's own bot button uses, and
 * coinflips are joined as the bot's real profile row through
 * `join_rorisk_coinflip`, which settles the round like any other opponent.
 *
 * Attendance is in memory: schedules are dropped on restart and rebuilt by the
 * periodic sweep, and only lobbies that are still open when the timer fires are
 * attended.
 */

export const ATTENDANCE_PLAYERS = [
  'dzers0n', 'Arak', 'Jester', 'cj8e2', 'champion242701',
  'maksioXtreme', '88tears', 'Beasteakz', 'Nynkei', 'somuchbtc',
]

const DEFAULT_AVATAR = '/assets/users/default-avatar.png'
const MIN_WAIT_MS = 8000
// Kept a little under 35s so the tick and the join request still land inside it.
const MAX_WAIT_MS = 32000
const TICK_MS = 2000
const SWEEP_MS = 60 * 1000
const RETRY_MS = 20 * 1000
const PENDING_KEY = Symbol.for('rorisk.botAttendance.pending')
const TIMER_KEY = Symbol.for('rorisk.botAttendance.timer')

const waitTime = () => randomInt(MIN_WAIT_MS, MAX_WAIT_MS + 1)

function queue() {
  if (!globalThis[PENDING_KEY]) globalThis[PENDING_KEY] = new Map()
  return globalThis[PENDING_KEY]
}

/** Reserves a seat time for a lobby. Returns null when the lobby is already queued. */
export function scheduleBotAttendance(kind, uuid) {
  if (!uuid) return null
  const pending = queue()
  const key = `${kind}:${uuid}`
  if (pending.has(key)) return pending.get(key)
  const entry = { kind, uuid, dueAt: Date.now() + waitTime(), busy: false }
  pending.set(key, entry)
  return entry
}

function freeSlots(row) {
  const occupied = new Set((Array.isArray(row.players) ? row.players : []).map((player) => Number(player.slot)))
  const total = Math.max(0, Number(row.player_count) || 0)
  return Array.from({ length: total }, (_, slot) => slot).filter((slot) => !occupied.has(slot))
}

function availableName(row) {
  const taken = new Set((Array.isArray(row.players) ? row.players : []).map((player) => String(player.username || '')))
  const free = ATTENDANCE_PLAYERS.filter((name) => !taken.has(name))
  return free.length ? free[randomInt(0, free.length)] : null
}

function optionsOf(row) {
  return row.options && typeof row.options === 'object' ? row.options : {}
}

async function battleRow(env, supabaseRequest, uuid) {
  const query = new URLSearchParams({ uuid: `eq.${uuid}`, select: '*', limit: '1' })
  const rows = await supabaseRequest(env, `/rest/v1/rorisk_battles?${query}`)
  return rows?.[0] || null
}

async function attendBattle({ env, supabaseRequest, api, entry }) {
  const row = await battleRow(env, supabaseRequest, entry.uuid)
  if (!row || row.state !== 'created') return 'done'
  const options = optionsOf(row)
  // Invite-only and affiliate lobbies are not public, so nobody wanders in.
  if (options.private === true || options.affiliateOnly === true) return 'done'
  const slots = freeSlots(row)
  const username = availableName(row)
  if (!slots.length || !username) return 'done'

  // Seat the player's real profile picture, not a placeholder.
  const accounts = await ensureSimulatedAccounts(env, supabaseRequest)
  const avatar = accounts.find((account) => account.username === username)?.avatar_headshot || DEFAULT_AVATAR

  await supabaseRequest(env, '/rest/v1/rpc/add_rorisk_battle_bots', {
    method: 'POST',
    body: JSON.stringify({
      p_battle_uuid: row.uuid,
      p_creator_uuid: row.creator_uuid,
      p_bots: [{ slot: slots[0], username, avatar }],
    }),
  })

  const updated = await battleRow(env, supabaseRequest, row.uuid)
  if (updated) api.broadcastRealtime({ type: 'battleUpdate', game: api.publicBattle(updated) })
  // Keep filling empty seats one arrival at a time, like a lobby that is warming up.
  if (updated && updated.state === 'created' && freeSlots(updated).length && availableName(updated)) return 'again'
  return 'done'
}

async function attendCoinflip({ env, supabaseRequest, api, entry }) {
  const game = await api.coinflipGameByUuid(env, entry.uuid)
  if (!game || game.state !== 'created' || game.opponent_uuid || game.opponent_is_bot) return 'done'

  const currency = game.currency === 'rocoins' ? 'rocoins' : 'coins'
  const amount = Number(game.amount) || 0
  const accounts = await ensureSimulatedAccounts(env, supabaseRequest)
  // Only the ten named regulars attend, never the wider live-bets cast.
  const candidates = accounts.filter((account) => account.user_uuid
    && ATTENDANCE_PLAYERS.includes(account.username)
    && account.user_uuid !== game.creator_uuid
    && Number(currency === 'coins' ? account.coins : account.rocoins) >= amount)
  if (!candidates.length) return 'done'

  const block = await api.latestEosBlock(env)
  const hash = createHash('sha512').update(`${game.server_seed}-${block.blockId}`).digest('hex')
  const ticket = Number.parseInt(hash.slice(0, 16), 16) % 1000000

  // Wallets move between the balance read and the join, so try a few players.
  for (const bot of candidates.sort(() => Math.random() - 0.5).slice(0, 4)) {
    try {
      await supabaseRequest(env, '/rest/v1/rpc/join_rorisk_coinflip', {
        method: 'POST',
        body: JSON.stringify({
          p_game_uuid: game.uuid,
          p_user_uuid: bot.user_uuid,
          p_bot: false,
          p_eos_block_id: block.blockId,
          p_eos_block_number: block.blockNumber,
          p_ticket: ticket,
        }),
      })
      const updated = await api.coinflipGameByUuid(env, game.uuid)
      if (updated) api.broadcastRealtime({ type: 'coinflip', game: api.publicCoinflipGame(updated) })
      return 'done'
    } catch {
      // Seat taken or that wallet can no longer cover the wager; try the next one.
    }
  }
  return 'retry'
}

async function sweep({ env, supabaseRequest }) {
  const battles = await supabaseRequest(env, '/rest/v1/rorisk_battles?state=eq.created&select=uuid&limit=50')
  for (const row of Array.isArray(battles) ? battles : []) scheduleBotAttendance('battle', row.uuid)
  const games = await supabaseRequest(env, '/rest/v1/rorisk_coinflip_games?state=eq.created&opponent_uuid=is.null&opponent_is_bot=eq.false&select=uuid&limit=50')
  for (const row of Array.isArray(games) ? games : []) scheduleBotAttendance('coinflip', row.uuid)
}

/**
 * Starts the attendance loop. Joins nothing by itself until a lobby is scheduled
 * (on creation or by the sweep), and every timer is unref'd so it never keeps a
 * process alive on its own.
 */
export function startBotAttendance(env, supabaseRequest, api) {
  if (String(env.BOT_ATTENDANCE || '').toLowerCase() === 'off') return null
  if (!env.SUPABASE_URL || !api?.broadcastRealtime) return null
  if (globalThis[TIMER_KEY]) return globalThis[TIMER_KEY]

  const state = { tick: null, sweep: null, warned: false }
  globalThis[TIMER_KEY] = state
  const pending = queue()

  const run = async () => {
    const now = Date.now()
    for (const [key, entry] of pending) {
      if (entry.busy || entry.dueAt > now) continue
      entry.busy = true
      try {
        const outcome = entry.kind === 'battle'
          ? await attendBattle({ env, supabaseRequest, api, entry })
          : await attendCoinflip({ env, supabaseRequest, api, entry })
        if (outcome === 'again') entry.dueAt = Date.now() + waitTime()
        else if (outcome === 'retry') entry.dueAt = Date.now() + RETRY_MS
        else pending.delete(key)
      } catch (error) {
        entry.dueAt = Date.now() + RETRY_MS
        if (!state.warned) {
          state.warned = true
          console.warn('[bot-attendance] paused:', error instanceof Error ? error.message : error)
        }
      } finally {
        entry.busy = false
      }
    }
  }

  state.tick = setInterval(() => { void run() }, TICK_MS)
  state.tick.unref?.()
  state.sweep = setInterval(() => {
    sweep({ env, supabaseRequest }).catch((error) => {
      if (!state.warned) {
        state.warned = true
        console.warn('[bot-attendance] sweep skipped:', error instanceof Error ? error.message : error)
      }
    })
  }, SWEEP_MS)
  state.sweep.unref?.()
  void sweep({ env, supabaseRequest }).catch(() => {})

  return state.tick
}
