import { randomInt, randomUUID } from 'node:crypto'

/**
 * Cosmetic live-bet activity.
 *
 * The public Live Bets panel used to sit empty whenever real players were not
 * betting. This module keeps it alive with bets from a fixed cast of accounts.
 * The feed is deliberately in memory: nothing is written to a game table, no
 * balance moves, no RNG seed is consumed, and a restart simply re-seeds it.
 *
 * Realism rules:
 *  - amounts are 50–1250 Coins ending in 0, 5 or 1; case bets use the real case
 *    price instead, because a case can only be opened for its listed amount;
 *  - multipliers come from the same tables the games use, so nothing impossible
 *    appears — dice uses the 0.95 * 10000 / tickets curve, mines the SQL payout
 *    curve, blackjack only 0 / 1 / 2 / 2.5, cases item value / case price.
 */

const SIM_USERS = [
  ['boun', 63], ['gucci8008', 41], ['roadto2k1day', 78], ['Mbrohio', 22], ['sweripper', 55],
  ['rira', 34], ['towa', 87], ['tape', 18], ['mentaltwo', 46], ['faithless', 71],
  ['luca2xp', 29], ['limbo', 58], ['kami', 95], ['dripp', 37], ['hidice', 12],
  ['ares', 66], ['shanee', 49], ['BrainW', 82], ['cryyan', 25], ['WFU', 90],
  ['dzers0n', 44], ['Arak', 57], ['Jester', 31], ['cj8e2', 68], ['champion242701', 25],
  ['maksioXtreme', 52], ['88tears', 39], ['Beasteakz', 76], ['Nynkei', 20], ['somuchbtc', 61],
]

const DEFAULT_AVATAR = '/assets/users/default-avatar.png'
const TIMER_KEY = Symbol.for('rorisk.simulatedBets.timer')
const ACCOUNT_TTL_MS = 10 * 60 * 1000
const CASE_TTL_MS = 10 * 60 * 1000
const STORE_LIMIT = 200
const BACKLOG_MIN = 18

// Every whole amount the simulator may bet outside cases: 50–1250, last digit 0/5/1.
const COIN_AMOUNTS = Array.from({ length: 1201 }, (_, index) => index + 50)
  .filter((amount) => [0, 5, 1].includes(amount % 10))

// Win tickets the dice contract accepts (100–9300) that people actually use.
const DICE_TICKETS = [200, 250, 300, 500, 750, 950, 1000, 1250, 1500, 1900, 2000, 2500, 3333, 4750, 5000, 6666, 7500, 8000, 9000]

const store = []
let accountCache = { key: '', at: 0, accounts: [] }
let caseCache = { key: '', at: 0, cases: [] }

const pick = (list) => list[randomInt(0, list.length)]

function minesMultiplier(reveals, mines) {
  let multiplier = 0.9
  for (let index = 0; index < reveals; index += 1) {
    multiplier = (multiplier * (25 - index)) / (25 - mines - index)
  }
  return Math.max(0.9, Math.floor(multiplier * 100) / 100)
}

function chanceWeight(item) {
  const parsed = Number.parseFloat(String(item?.chance ?? '').replace('%', ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function weightedItem(items) {
  const weights = items.map(chanceWeight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = Math.random() * total
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return items[index]
  }
  return items[items.length - 1]
}

export function diceBet(account, betAmount) {
  const tickets = pick(DICE_TICKETS)
  const multiplier = Math.floor((9500 / tickets) * 10000) / 10000
  const won = randomInt(0, 10000) < tickets
  return { ...account, method: 'dice', currency: 'coins', bet_amount: betAmount, multiplier, won, payout_amount: won ? Math.floor(betAmount * multiplier) : 0 }
}

export function minesBet(account, betAmount) {
  const mines = randomInt(1, 13)
  const safeTiles = 25 - mines
  const reveals = randomInt(1, Math.min(safeTiles, 9) + 1)
  const won = Math.random() < 0.42
  // A bust keeps the multiplier of the last safe tile, exactly like the SQL
  // contract: the row is written with the multiplier already earned, payout 0.
  const multiplier = won ? minesMultiplier(reveals, mines) : reveals > 1 ? minesMultiplier(reveals - 1, mines) : 0.9
  return { ...account, method: 'mines', currency: 'coins', bet_amount: betAmount, multiplier, won, payout_amount: won ? Math.floor(betAmount * multiplier) : 0 }
}

export function blackjackBet(account, betAmount) {
  const roll = Math.random()
  // The settle contract stores payout / wager, so only these four values exist.
  const [multiplier, won] = roll < 0.47 ? [0, false] : roll < 0.55 ? [1, false] : roll < 0.95 ? [2, true] : [2.5, true]
  return { ...account, method: 'blackjack', currency: 'coins', bet_amount: betAmount, multiplier, won, payout_amount: Math.floor(betAmount * multiplier) }
}

export function caseBet(account, cases, currency) {
  const options = cases.filter((entry) => entry.currency === currency && Array.isArray(entry.items) && entry.items.length)
  if (!options.length) return null
  const chosen = pick(options)
  const count = Math.min(randomInt(1, 4), Math.max(1, Math.floor(60000 / Math.max(1, chosen.price))))
  const betAmount = chosen.price * count
  if (!Number.isSafeInteger(betAmount) || betAmount < 1) return null
  const item = weightedItem(chosen.items)
  const itemPrice = Number(currency === 'rocoins' ? item.rocoinPrice : item.coinPrice) || 0
  const payout = Math.max(0, Math.round(itemPrice * count))
  return { ...account, method: 'cases', currency: chosen.currency, bet_amount: betAmount, multiplier: Math.round((payout / betAmount) * 10000) / 10000, won: payout >= betAmount, payout_amount: payout }
}

export function generateSimulatedBet({ accounts, cases }) {
  const account = pick(accounts)
  const currency = Math.random() < 0.82 ? 'coins' : 'rocoins'
  const roll = Math.random()
  if (roll < 0.45) return diceBet(account, pick(COIN_AMOUNTS))
  if (roll < 0.68 && cases.length) {
    const bet = caseBet(account, cases, currency)
    if (bet) return bet
  }
  if (roll < 0.86) return minesBet(account, pick(COIN_AMOUNTS))
  return blackjackBet(account, pick(COIN_AMOUNTS))
}

function fallbackAccounts() {
  return SIM_USERS.map(([username, level]) => ({ user_uuid: null, username, avatar_headshot: DEFAULT_AVATAR, level, rank: 'user' }))
}

/**
 * Creates the cast once and caches it. These are ordinary profile rows so the
 * feed shows real levels and avatars; they never sign in and never hold bets.
 */
export async function ensureSimulatedAccounts(env, supabaseRequest) {
  const key = String(env.SUPABASE_URL || '')
  if (accountCache.key === key && Date.now() - accountCache.at < ACCOUNT_TTL_MS && accountCache.accounts.length) return accountCache.accounts

  try {
    const names = SIM_USERS.map(([username]) => username)
    const query = new URLSearchParams({ select: 'uuid,username,level,rank,avatar_headshot,coins,rocoins', username: `in.(${names.join(',')})` })
    const existing = await supabaseRequest(env, `/rest/v1/rorisk_users?${query}`)
    const rows = Array.isArray(existing) ? existing : []
    const found = new Set(rows.map((row) => row.username))
    const missing = SIM_USERS.filter(([username]) => !found.has(username))
    if (missing.length) {
      await supabaseRequest(env, '/rest/v1/rorisk_users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(missing.map(([username, level]) => ({
          username,
          avatar_headshot: DEFAULT_AVATAR,
          coins: randomInt(15000, 480000),
          rocoins: randomInt(0, 4200),
          level,
          rank: 'user',
          joined_at: new Date(Date.now() - randomInt(3, 60) * 24 * 60 * 60 * 1000).toISOString(),
        }))),
      })
      const created = await supabaseRequest(env, `/rest/v1/rorisk_users?${query}`)
      rows.length = 0
      rows.push(...(Array.isArray(created) ? created : []))
    }
    const accounts = rows.map((row) => ({
      user_uuid: row.uuid,
      username: row.username,
      avatar_headshot: row.avatar_headshot || DEFAULT_AVATAR,
      level: Number(row.level) || 0,
      rank: row.rank || 'user',
      coins: Number(row.coins) || 0,
      rocoins: Number(row.rocoins) || 0,
    }))
    if (!accounts.length) return fallbackAccounts()
    accountCache = { key, at: Date.now(), accounts }
    return accounts
  } catch (error) {
    console.warn('[live-bets] account lookup failed:', error instanceof Error ? error.message : error)
    return fallbackAccounts()
  }
}

async function loadCases(env, supabaseRequest) {
  const key = String(env.SUPABASE_URL || '')
  if (caseCache.key === key && Date.now() - caseCache.at < CASE_TTL_MS && caseCache.cases.length) return caseCache.cases

  try {
    const query = new URLSearchParams({ active: 'eq.true', select: 'name,coin_amount,rocoin_amount,items', limit: '80' })
    const rows = await supabaseRequest(env, `/rest/v1/rorisk_cases?${query}`)
    const cases = []
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row.items) || !row.items.length) continue
      const coinPrice = Number(row.coin_amount)
      const rocoinPrice = Number(row.rocoin_amount)
      if (Number.isFinite(coinPrice) && coinPrice > 0) cases.push({ currency: 'coins', price: coinPrice, items: row.items })
      if (Number.isFinite(rocoinPrice) && rocoinPrice > 0) cases.push({ currency: 'rocoins', price: rocoinPrice, items: row.items })
    }
    caseCache = { key, at: Date.now(), cases }
    return cases
  } catch {
    return []
  }
}

function remember(bet, createdAt = new Date().toISOString()) {
  const row = { ...bet, uuid: randomUUID(), created_at: createdAt, updated_at: createdAt }
  store.unshift(row)
  if (store.length > STORE_LIMIT) store.length = STORE_LIMIT
  return row
}

export function simulatedBets(limit = 30) {
  return store.slice(0, Math.min(50, Math.max(1, limit)))
}

export function simulatedBetCount() {
  return store.length
}

/**
 * Seeds a short backlog so the panel is populated on the first paint, then adds
 * one bet every 5–30 seconds. Safe to call from both dev and preview servers.
 */
export function startSimulatedBets(env, supabaseRequest) {
  if (String(env.LIVE_BETS_SIMULATION || '').toLowerCase() === 'off') return null
  if (!env.SUPABASE_URL) return null

  const existing = globalThis[TIMER_KEY]
  if (existing?.timer) return existing.timer

  const state = { timer: null, warned: false }
  globalThis[TIMER_KEY] = state

  const tick = async () => {
    try {
      const accounts = await ensureSimulatedAccounts(env, supabaseRequest)
      const cases = await loadCases(env, supabaseRequest)
      remember(generateSimulatedBet({ accounts, cases }))
    } catch (error) {
      if (!state.warned) {
        state.warned = true
        console.warn('[live-bets] simulation paused:', error instanceof Error ? error.message : error)
      }
    }
  }

  const schedule = () => {
    state.timer = setTimeout(async () => {
      await tick()
      schedule()
    }, randomInt(5000, 30001))
    state.timer.unref?.()
  }

  void (async () => {
    try {
      const accounts = await ensureSimulatedAccounts(env, supabaseRequest)
      const cases = await loadCases(env, supabaseRequest)
      let offset = randomInt(6, 20) * 1000
      for (let index = 0; index < BACKLOG_MIN; index += 1) {
        remember(generateSimulatedBet({ accounts, cases }), new Date(Date.now() - offset).toISOString())
        offset += randomInt(6, 26) * 1000
      }
    } catch (error) {
      console.warn('[live-bets] seed skipped:', error instanceof Error ? error.message : error)
    }
    schedule()
  })()

  return state.timer
}
