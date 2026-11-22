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

/** Decides whether this round is forced, and which way. */
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

function handValue(cards) {
  let value = 0
  let aces = 0
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card?.rank === 'A') { value += 11; aces += 1 }
    else if (['K', 'Q', 'J'].includes(card?.rank)) value += 10
    else value += Math.max(0, Math.trunc(Number(card?.rank) || 0))
  }
  while (value > 21 && aces > 0) { value -= 10; aces -= 1 }
  return value
}

function isNatural(cards) {
  return Array.isArray(cards) && cards.length === 2 && handValue(cards) === 21
}

/**
 * Mirrors settleBlackjack: the dealer hits until 17+ and hands are compared
 * against that final total. `startIndex` is where the dealer starts drawing.
 */
function dealResult(playerCards, dealerCards, deck, startIndex) {
  const dealer = dealerCards.map((card) => ({ ...card }))
  let index = startIndex
  while (handValue(dealer) < 17 && index < deck.length) {
    dealer.push(deck[index])
    index += 1
    if (dealer.length > 10) break
  }
  const playerValue = handValue(playerCards)
  const dealerValue = handValue(dealer)
  if (playerValue > 21) return 'lose'
  if (isNatural(playerCards) && !isNatural(dealerCards)) return 'won'
  if (isNatural(playerCards) && isNatural(dealerCards)) return 'push'
  if (isNatural(dealerCards)) return 'lose'
  if (dealerValue > 21 || playerValue > dealerValue) return 'won'
  if (playerValue === dealerValue) return 'push'
  return 'lose'
}

/**
 * True when the freshly shuffled deck already lands the forced result and the
 * player cannot undo it with the obvious move: standing, hitting once, or
 * doubling all resolve the same way. Deals with an Ace up, a dealer natural,
 * or a split-able pair are skipped so there is no insurance or split detour.
 */
export function blackjackDealIsForced(deck, outcome) {
  if (!Array.isArray(deck) || deck.length < 12) return false
  const playerCards = [deck[0], deck[2]]
  const dealerCards = [deck[1], deck[3]]
  if (dealerCards[0]?.rank === 'A' || isNatural(dealerCards)) return false
  if (playerCards[0]?.rank === playerCards[1]?.rank) return false
  const wanted = outcome === 'win' ? 'won' : 'lose'
  const stand = dealResult(playerCards, dealerCards, deck, 4)
  if (stand !== wanted) return false
  // A natural is settled on the deal, so there is no hit to defend against.
  if (isNatural(playerCards)) return outcome === 'win'
  const hit = dealResult([...playerCards, deck[4]], dealerCards, deck, 5)
  if (hit !== wanted) return false
  // Doubling draws exactly one card too, so the hit result already covers it.
  return hit === wanted
}

/**
 * Draws fresh seeded shuffles until one natively produces the forced result.
 * The hands therefore keep the game's normal distribution (varied totals,
 * dealer busts, the occasional natural) instead of a fixed scripted deal.
 */
export function findForcedBlackjackDeck({ createDeck, outcome, attempts = 600 }) {
  if (typeof createDeck !== 'function') return null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const deck = createDeck(attempt)
    if (blackjackDealIsForced(deck, outcome)) return deck
  }
  return null
}

/**
 * Last-resort deal if the search is exhausted: a low hand against a dealer that
 * must bust (win), or a stiff hand whose next card busts (loss).
 */
export function forcedBlackjackDeck(deck, outcome) {
  const working = deck.map((card) => ({ ...card }))
  const take = (ranks) => {
    const index = working.findIndex((card) => ranks.includes(card.rank))
    if (index < 0) return working.shift()
    return working.splice(index, 1)[0]
  }
  const front = outcome === 'win'
    ? [take(['4']), take(['10', 'J', 'Q', 'K']), take(['6']), take(['6']), take(['10', 'J', 'Q', 'K'])]
    : [take(['10', 'J', 'Q', 'K']), take(['K', 'Q', 'J', '10']), take(['2']), take(['K', 'Q', 'J', '10']), take(['K', 'Q', 'J', '10'])]
  return [...front, ...working]
}
