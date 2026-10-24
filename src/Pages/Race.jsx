import { useCallback, useEffect, useState } from 'react'
import { notify } from '../lib/Notifications'

const pageScope = { 'data-v-0e940f3a': '' }
const podiumScope = { 'data-v-59edd702': '' }
const statsScope = { 'data-v-5c5c2a36': '' }
const rowScope = { 'data-v-04f03a4f': '' }
const timerScope = { 'data-v-233720ce': '' }

const ribbons = {
  1: '/assets/race/place-ribbon-1.dd1dfd16.svg',
  2: '/assets/race/place-ribbon-2.87e86a0b.svg',
  3: '/assets/race/place-ribbon-3.4d16accb.svg',
}
const ordinals = { 1: 'st', 2: 'nd', 3: 'rd' }
const podiumOrder = [2, 1, 3]

const integer = (value) => Math.floor(Number(value) || 0).toLocaleString('en-US')

function projectedPrize(pool, place) {
  if (place === 1) return Math.floor(pool * 0.5)
  if (place === 2) return Math.floor(pool * 0.3)
  if (place === 3) return Math.floor(pool * 0.2)
  return 0
}

function RaceTimer({ endsAt, offset }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])
  const remaining = Math.max(0, new Date(endsAt).getTime() - (now + offset))
  const total = Math.floor(remaining / 1000)
  const text = `${String(Math.floor(total / 86400) * 24 + Math.floor(total % 86400 / 3600)).padStart(3, '0')}:${String(Math.floor(total % 3600 / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  return <div className="race-timer is-compact" {...timerScope}><div className="timer-compact" {...timerScope}>{text.split('').map((value, index) => value === ':' ? <div className="compact-colon" key={`colon-${index}`} {...timerScope}>:</div> : <div className="compact-digit" key={`digit-${index}`} {...timerScope}><div className="flip-number" key={value} {...timerScope}>{value}</div></div>)}</div></div>
}

function Avatar({ entry, scope = podiumScope }) {
  return <div className="avatar-image" data-v-6adb23f8="" {...scope}><img src={entry?.avatar || '/assets/users/default-avatar.png'} alt="" data-v-6adb23f8="" {...scope} /></div>
}

function PodiumCard({ entry, place, prize }) {
  return <div className={`race-special-rank rank-${place}`} {...podiumScope}>
    <div className="rank-card" {...podiumScope}>
      <div className="rank-card-bg" aria-hidden="true" {...podiumScope}>
        <div className="rank-card-base" {...podiumScope} />
        <img className="rank-card-scene rank-card-scene--blend" src="/assets/race/race-card-pattern.99d1addb.png" alt="" {...podiumScope} />
        <img className="rank-card-scene" src="/assets/race/race-card-pattern.99d1addb.png" alt="" {...podiumScope} />
        <div className="rank-card-glow" {...podiumScope} />
        <div className="rank-flag" {...podiumScope}>
          <img className="rank-flag-img" src="/assets/race/race-flag.0ad9c9c0.png" alt="" {...podiumScope} />
          <img className="rank-flag-img rank-flag-img--soft" src="/assets/race/race-flag.0ad9c9c0.png" alt="" {...podiumScope} />
        </div>
      </div>
      <div className="race-special-rank-user" {...podiumScope}>
        <div className="user-avatar" {...podiumScope}><Avatar entry={entry} /></div>
        <span className="user-username" {...podiumScope}>{entry?.username || '--'}</span>
      </div>
      <div className="points-pill" {...podiumScope}>
        <span className="points-label" {...podiumScope}>points:</span>
        <span className="points-value" {...podiumScope}>
          <span className="points-icon" {...podiumScope}><img src="/assets/race/points.6eb375c8.svg" alt="" {...podiumScope} /></span>
          <span className="points-amount" {...podiumScope}>{integer(entry?.points)}</span>
        </span>
      </div>
      <div className="rank-divider" {...podiumScope} />
      <div className="race-special-rank-prize" {...podiumScope}>
        <div className="prize-button" {...podiumScope}>
          <span className="prize-coin" {...podiumScope}><img src="/assets/race/prize-coin.4c029a97.svg" alt="" {...podiumScope} /></span>
          <span className="prize-amount" {...podiumScope}>{integer(prize)}</span>
        </div>
      </div>
    </div>
    <div className="rank-badge" {...podiumScope}>
      <img className="rank-badge-ribbon" src={ribbons[place]} alt="" {...podiumScope} />
      <span className="rank-badge-text" {...podiumScope}>
        <span className="rank-badge-num" {...podiumScope}>{place}</span>
        <span className="rank-badge-ord" {...podiumScope}>{ordinals[place]}&nbsp;</span>
        <span className="rank-badge-place" {...podiumScope}>PLACE</span>
      </span>
    </div>
  </div>
}

function PlacementRow({ entry, place, prize }) {
  return <div className="leaderboard-user-element" {...rowScope}>
    <div className="element-inner" {...rowScope}>
      <div className="inner-pos" {...rowScope}>{place}</div>
      <div className={`inner-user${entry ? '' : ' user-hidden'}`} {...rowScope}>
        <div className="user-avatar" {...rowScope}><Avatar entry={entry} scope={rowScope} /></div>
        <span className="user-username" {...rowScope}>{entry?.username || '--'}</span>
      </div>
      <div className="inner-wagered" {...rowScope}>
        <div className="wagered-content" {...rowScope}>
          <img src="/assets/race/points.6eb375c8.svg" alt="" {...rowScope} />
          <div className="content-value" {...rowScope}><span {...rowScope}>{integer(entry?.points)}</span></div>
        </div>
      </div>
      <div className="inner-prize" {...rowScope}>
        <div className="prize-content" {...rowScope}>
          <img src="/assets/race/prize-coin.4c029a97.svg" alt="" {...rowScope} />
          <div className="content-value" {...rowScope}><span {...rowScope}>{integer(prize)}</span></div>
        </div>
      </div>
    </div>
  </div>
}

function Race({ user, onSignIn }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [serverOffset, setServerOffset] = useState(0)
  const userId = user?.uuid || user?.id || null

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/race', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to load the weekly race.')
      setServerOffset(new Date(payload.serverTime).getTime() - Date.now())
      setState(payload)
      setError('')
    } catch (nextError) {
      setError(nextError.message || 'Unable to load the weekly race.')
    }
  }, [])

  useEffect(() => {
    document.title = 'Weekly Race - RoWild.lol'
    const kickoff = window.setTimeout(() => { void load() }, 0)
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 15000)
    const onVisible = () => { if (!document.hidden) void load() }
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])

  const claim = async () => {
    if (!userId) return onSignIn?.()
    if (!state?.claimable) return
    setClaiming(true)
    try {
      const response = await fetch('/api/race/claim', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to claim your race reward.')
      if (payload.user) window.dispatchEvent(new CustomEvent('rorisk:user-update', { detail: { user: payload.user } }))
      notify({ type: 'success', message: `Claimed ${integer(payload.amount)} Coins from the weekly race.` })
      await load()
    } catch (nextError) {
      notify({ type: 'error', message: nextError.message || 'Unable to claim your race reward.' })
    } finally {
      setClaiming(false)
    }
  }

  const race = state?.race
  const leaderboard = Array.isArray(state?.leaderboard) ? state.leaderboard : []
  const pool = Number(race?.prizePool) || 500000
  const byPlace = (place) => leaderboard[place - 1]
  const me = state?.me
  const claimable = Number(state?.claimable) || 0

  return <div className="race" {...pageScope}>
    <div className="race-hero-image" {...pageScope}>
      <img src="/assets/race/race.87859592.png" alt="Weekly Race" {...pageScope} />
      <div className="race-hero-overlay" {...pageScope}>
        <div className="hero-copy" {...pageScope}>
          <div className="hero-title" data-text="weekly race" {...pageScope}>weekly race</div>
          <div className="hero-prize" {...pageScope}>
            <span className="hero-coin" {...pageScope}>
              <img className="hero-coin-white" src="/assets/race/hero-prize-coin.f9dc7e4f.svg" alt="" {...pageScope} />
              <img className="hero-coin-fill" src="/assets/race/hero-prize-coin.f9dc7e4f.svg" alt="" {...pageScope} />
            </span>
            <div className="hero-amount" data-text="500,000" {...pageScope}>{integer(pool)}</div>
          </div>
        </div>
        {race ? <RaceTimer endsAt={race.endsAt} offset={serverOffset} /> : <div className="race-timer is-compact" {...timerScope}><div className="timer-compact" {...timerScope}><div className="compact-digit" {...timerScope}><div className="flip-number" {...timerScope}>-</div></div></div></div>}
      </div>
    </div>
    <div className="race-stats" {...statsScope}>
      <div className="race-stats-title" {...statsScope}>Your stats</div>
      <div className="race-stats-side" {...statsScope}>
        <div className="stats-chip stats-chip--place" {...statsScope}>
          <span className="stats-chip-label" {...statsScope}>Your Place:</span>
          <span className="stats-chip-value" {...statsScope}>
            <span className="stats-chip-icon stats-chip-icon--medal" {...statsScope}><img src="/assets/race/race-medal.9794a12f.svg" alt="" {...statsScope} /></span>
            {me?.place ? `#${me.place}` : '--'}
          </span>
        </div>
        <div className="stats-chip stats-chip--points" {...statsScope}>
          <span className="stats-chip-label" {...statsScope}>Points:</span>
          <span className="stats-chip-value" {...statsScope}>
            <span className="stats-chip-icon stats-chip-icon--points" {...statsScope}><img src="/assets/race/points.6eb375c8.svg" alt="" {...statsScope} /></span>
            {integer(me?.points)}
          </span>
        </div>
      </div>
      <div className="race-stats-side race-stats-side--right" {...statsScope}>
        <div className="stats-chip stats-chip--won" {...statsScope}>
          <span className="stats-chip-label" {...statsScope}>won:</span>
          <span className="stats-chip-icon stats-chip-icon--flag" {...statsScope}><img src="/assets/race/race-flag-won.4c0e8144.svg" alt="" {...statsScope} /></span>
          <span className="stats-chip-value stats-chip-value--won" {...statsScope}>{integer(state?.won)} Races</span>
        </div>
        <button className="stats-claim" type="button" disabled={claiming || claimable <= 0} onClick={claim} {...statsScope}>
          {claiming ? 'Claiming...' : claimable > 0 ? `Claim ${integer(claimable)}` : 'Claim Rewards'}
        </button>
      </div>
    </div>
    {error && <div className="state-banner error" {...pageScope}>{error}</div>}
    <div className="race-special-ranks" {...podiumScope}>
      {podiumOrder.map((place) => {
        const entry = byPlace(place)
        const prize = entry?.prize > 0 ? entry.prize : projectedPrize(pool, place)
        return <PodiumCard key={place} entry={entry} place={place} prize={prize} />
      })}
    </div>
    <div className="race-ranks" {...pageScope}>
      <div className="ranks-header" {...rowScope}>
        <div className="rank-pos" {...rowScope}>place</div>
        <div className="rank-user" {...rowScope}>User</div>
        <div className="rank-wagered" {...rowScope}>points</div>
        <div className="rank-prize" {...rowScope}>Prize</div>
      </div>
      <div className="ranks-content" {...pageScope}>
        <div className="content-list fade-enter-active" {...pageScope}>
          {leaderboard.slice(3).map((entry, index) => {
            const place = index + 4
            const prize = entry?.prize > 0 ? entry.prize : projectedPrize(pool, place)
            return <PlacementRow key={entry.uuid} entry={entry} place={place} prize={prize} />
          })}
          {leaderboard.length <= 3 && <div className="race-empty" {...pageScope}>No points earned yet. Wager on any game to join the race.</div>}
        </div>
      </div>
    </div>
  </div>
}

export default Race
