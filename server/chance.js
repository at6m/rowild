import { createHash } from 'node:crypto'

/**
 * Per-player win chance, mirroring public.rorisk_chance_forced.
 *
 * 50 (or no value) is the game's own RNG and leaves the outcome untouched.
 * Below 50 turns that fraction of natural wins into losses (0 = always lose);
 * above 50 turns that fraction of natural losses into wins (100 = always win).
 */
export const DEFAULT_CHANCE = 50

export function chanceForced(naturalWin, chance, ticket) {
  if (naturalWin === null || naturalWin === undefined) return naturalWin
  if (chance === null || chance === undefined) return naturalWin
  const value = Number(chance)
  if (!Number.isFinite(value) || value === DEFAULT_CHANCE) return naturalWin
  if (value <= 0) return false
  if (value >= 100) return true
  const draw = Number.isFinite(Number(ticket)) ? Number(ticket) : 0
  if (value < DEFAULT_CHANCE) return naturalWin && draw >= 1 - value / DEFAULT_CHANCE
  return naturalWin || draw < (value - DEFAULT_CHANCE) / DEFAULT_CHANCE
}

/** Uniform 0-1 draw from a seed, matching the SQL slice used by the RPCs. */
export function chanceUniform(seed) {
  const hash = createHash('sha256').update(String(seed)).digest('hex')
  return Number.parseInt(hash.slice(0, 13), 16) / 2 ** 52
}

/** Resolves a player's chance for one game (exact row, then `all`). */
export async function chancePercentFor(env, supabaseRequest, userUuid, game) {
  if (!userUuid) return null
  try {
    const value = await supabaseRequest(env, '/rest/v1/rpc/rorisk_chance_effective', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_uuid: userUuid, p_game: game }),
    })
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  } catch {
    // A missing table or a provider hiccup leaves the game on its own RNG.
    return null
  }
}

/** Pre-decides a blackjack deal at the extreme ends of the scale. */
export function blackjackForcedOutcome(chance, seed) {
  if (chance === null || chance === undefined) return null
  const value = Number(chance)
  if (!Number.isFinite(value) || value === DEFAULT_CHANCE) return null
  const draw = chanceUniform(`${seed}:blackjack:chance`)
  if (value >= 100) return 'win'
  if (value <= 0) return 'loss'
  if (value > DEFAULT_CHANCE) return draw < (value - DEFAULT_CHANCE) / DEFAULT_CHANCE ? 'win' : null
  return draw < (DEFAULT_CHANCE - value) / DEFAULT_CHANCE ? 'loss' : null
}

/**
 * Rewrites the top of a shuffled blackjack deck so the opening hand lands the
 * chosen way: a player natural 21 against a dealer that must bust, or a stiff
 * 16 against a dealer 20. Later hit/stand decisions are still the player's.
 */
export function forceBlackjackDeal(deck, outcome) {
  if (!Array.isArray(deck) || deck.length < 10) return deck
  const working = deck.map((card) => ({ ...card }))
  const take = (ranks) => {
    const index = working.findIndex((card) => ranks.includes(card.rank))
    if (index < 0) return working.shift()
    return working.splice(index, 1)[0]
  }
  const front = outcome === 'win'
    ? [take(['A']), take(['9']), take(['K', 'Q', 'J', '10']), take(['7']), take(['K', 'Q', 'J', '10'])]
    : [take(['10', 'J', 'Q', 'K']), take(['K', 'Q', 'J', '10']), take(['6']), take(['Q', 'J', '10', 'K']), take(['5'])]
  return [...front, ...working]
}
