import { useEffect, useMemo, useRef, useState } from 'react'
import SiteIcon from '../components/Icons'
import { notify } from '../lib/Notifications'

const GAME_ORDER = ['all', 'dice', 'mines', 'blackjack', 'coinflip', 'cases', 'upgrader', 'xroulette', 'battles']
const GAME_LABELS = {
  all: 'All games',
  dice: 'Dice',
  mines: 'Mines',
  blackjack: 'Blackjack',
  coinflip: 'Coinflip',
  cases: 'Cases',
  upgrader: 'Upgrader',
  xroulette: 'X-Roulette',
  battles: 'Case battles',
}
const QUICK_RTP = [0, 50, 100, 150, 200]
const LIVE_POLL_MS = 2500
const DELTA_LIFETIME_MS = 4000
const DEFAULT_AVATAR = '/assets/users/default-avatar.png'
const COIN_ICON = '/assets/currency/coin.svg'
const ROCOIN_ICON = '/assets/currency/rocoin.2d3febd5.svg'
const WITHDRAWAL_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'all', label: 'All' },
]
const WITHDRAWAL_TYPES = [
  { key: 'all', label: 'All types' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'robux', label: 'Robux' },
]
// Wording matches the transaction history so the same status reads the same everywhere.
const STATUS_LABELS = { pending: 'Pending', completed: 'Completed', canceled: 'Canceled' }

function format(value) {
  return Math.floor(Number(value) || 0).toLocaleString('en-US')
}

function joinedLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function seenLabel(value) {
  const seen = new Date(value).getTime()
  if (!Number.isFinite(seen)) return 'just now'
  const seconds = Math.max(0, Math.round((Date.now() - seen) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.round(seconds / 60)}m ago`
}

async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Unable to reach the admin service.')
    error.code = payload.code
    error.status = response.status
    throw error
  }
  return payload
}

function draftFor(player) {
  const next = { __dirty: false }
  for (const game of GAME_ORDER) {
    const value = player.settings?.[game]
    next[game] = value === null || value === undefined ? '' : String(value)
  }
  return next
}

function Balance({ value, delta }) {
  return (
    <span className="admin-balance">
      <img src={COIN_ICON} alt="" />
      <span>{format(value)}</span>
      {delta > 0 && <span className="admin-delta up">+{format(delta)}</span>}
      {delta < 0 && <span className="admin-delta down">-{format(Math.abs(delta))}</span>}
    </span>
  )
}

function WithdrawalCard({ item, txid, reason, onTxid, onReason, onSettle, busy }) {
  const pending = item.status === 'pending'
  return (
    <article className="admin-wd">
      <div className="admin-wd-main">
        <span className={`admin-wd-kind is-${item.kind}`}>{item.kind === 'crypto' ? 'Crypto' : 'Robux'}</span>
        <span className="admin-wd-player">
          <img src={item.avatar || DEFAULT_AVATAR} alt="" />
          <span>{item.username || 'Unknown player'}</span>
        </span>
        <span className="admin-wd-amount">
          <img src={item.kind === 'crypto' ? COIN_ICON : ROCOIN_ICON} alt="" />
          <strong>{format(item.coins)}</strong>
          <small>
            {item.kind === 'crypto'
              ? `$${item.usd.toFixed(2)} · ~${item.cryptoAmount} ${item.currency} on ${item.network}`
              : `R$ ${format(item.robux)} · ${format(item.robuxAfterTax)} after tax`}
          </small>
        </span>
        <span className={`admin-status is-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
      </div>
      <div className="admin-wd-meta">
        <span className="admin-wd-dest">
          {item.kind === 'crypto'
            ? `${item.currency} · ${item.network} · ${item.address}${item.memo ? ` · memo ${item.memo}` : ''}`
            : `Roblox ID ${item.robloxId || '—'}`}
        </span>
        <span className="admin-wd-date">Requested {joinedLabel(item.createdAt)}</span>
      </div>
      {item.cancelReason && (
        <div className="admin-wd-reason">
          <strong>Reason:</strong> {item.cancelReason}
        </div>
      )}
      {pending && (
        <div className="admin-wd-actions">
          {item.kind === 'crypto' && (
            <input
              className="admin-wd-input"
              type="text"
              placeholder="Payout transaction hash (optional)"
              value={txid}
              onChange={(event) => onTxid(event.target.value)}
            />
          )}
          <input
            className="admin-wd-input"
            type="text"
            placeholder="Reason if you cancel (required)"
            maxLength={300}
            value={reason}
            onChange={(event) => onReason(event.target.value)}
          />
          <button type="button" className="admin-btn primary" disabled={Boolean(busy)} onClick={() => onSettle(item, 'completed')}>
            {busy === 'completed' ? 'Saving…' : 'Mark completed'}
          </button>
          <button type="button" className="admin-btn ghost" disabled={Boolean(busy) || !String(reason || '').trim()} onClick={() => onSettle(item, 'canceled')}>
            {busy === 'canceled' ? 'Saving…' : 'Cancel & refund'}
          </button>
        </div>
      )}
    </article>
  )
}

function PlayerRow({ player, expanded, onToggle }) {
  const active = player.settings?.all
  const overrides = GAME_ORDER.filter((game) => game !== 'all' && player.settings?.[game] !== undefined && player.settings?.[game] !== null)
  const customised = (active !== null && active !== undefined) || overrides.length > 0
  const summary = active !== null && active !== undefined
    ? `${active}%${overrides.length ? ` +${overrides.length} game${overrides.length > 1 ? 's' : ''}` : ''}`
    : overrides.length
      ? `${overrides.length} game${overrides.length > 1 ? 's' : ''}`
      : 'default'

  return (
    <button type="button" className={`admin-row admin-player-row${expanded ? ' is-open' : ''}`} onClick={onToggle}>
      <span className="admin-player">
        <span className="admin-avatar">
          <img src={player.avatar_headshot || DEFAULT_AVATAR} alt="" />
          {player.online && <i className="admin-online-dot" title="Online now" />}
        </span>
        <span className="admin-player-text">
          <span className="admin-player-name">{player.username || 'Unknown player'}</span>
          <span className="admin-player-meta">
            {player.rank && player.rank !== 'user' ? <em className={`admin-rank rank-${player.rank}`}>{player.rank}</em> : null}
            <span>Level {Math.max(0, Number(player.level) || 0)}</span>
          </span>
        </span>
      </span>
      <span className="admin-cell"><Balance value={player.coins} delta={player.coinDelta || 0} /></span>
      <span className="admin-cell admin-cell-rocoin">
        <img src={ROCOIN_ICON} alt="" />
        <span>{format(player.rocoins)}</span>
        {player.rocoinDelta > 0 && <span className="admin-delta up">+{format(player.rocoinDelta)}</span>}
        {player.rocoinDelta < 0 && <span className="admin-delta down">-{format(Math.abs(player.rocoinDelta))}</span>}
      </span>
      <span className="admin-cell">
        <span className={`admin-rtp-pill${customised ? ' is-custom' : ''}`}>{summary}</span>
      </span>
      <span className="admin-cell admin-cell-muted">{joinedLabel(player.joined_at)}</span>
      <span className="admin-cell admin-cell-action">
        <span className="admin-manage">Manage RTP<SiteIcon name="chevron-down" className={expanded ? 'is-open' : ''} /></span>
      </span>
    </button>
  )
}

function RtpEditor({ player, defaults, draft, onChange, onQuick, onSave, onReset, saving, resetting, disabled }) {
  const defaultFor = useMemo(() => new Map(defaults.map((entry) => [entry.game, Number(entry.default_rtp)])), [defaults])

  return (
    <div className="admin-rtp">
      <div className="admin-rtp-head">
        <div>
          <h3>RTP for {player.username || 'this player'}</h3>
          <p>0 returns nothing, 200 returns double, default keeps each game’s original rate.</p>
        </div>
        <span className="admin-rtp-badge">Changes apply from the next bet</span>
      </div>

      <div className="admin-rtp-list">
        {GAME_ORDER.map((game) => {
          const value = draft[game] ?? ''
          const original = defaultFor.get(game)
          const isOverride = String(value).trim() !== ''
          const numeric = Number(value)
          const isCustom = isOverride && Number.isFinite(numeric) && original !== undefined && Math.abs(numeric - original) > 0.001
          return (
            <div className="admin-rtp-row" key={game}>
              <div className="admin-rtp-game">
                <span>{GAME_LABELS[game]}</span>
                <small>{game === 'all' ? 'applies to every game unless a game row overrides it' : `original ${original ?? '--'}%`}</small>
              </div>
              <div className={`admin-rtp-input${isOverride ? (isCustom ? ' is-custom' : ' is-original') : ''}`}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="200"
                  step="0.5"
                  placeholder="default"
                  value={value}
                  disabled={disabled}
                  onChange={(event) => onChange(game, event.target.value)}
                />
                <span>%</span>
              </div>
              <div className="admin-rtp-quick">
                {QUICK_RTP.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={String(value).trim() === String(preset) ? 'is-active' : ''}
                    disabled={disabled}
                    onClick={() => onQuick(game, preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <button type="button" className="admin-rtp-default" disabled={disabled || !isOverride} onClick={() => onQuick(game, null)}>
                Default
              </button>
            </div>
          )
        })}
      </div>

      <div className="admin-rtp-actions">
        <button type="button" className="admin-btn primary" disabled={disabled || saving || !draft.__dirty} onClick={onSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="admin-btn ghost" disabled={disabled || saving || resetting} onClick={onReset}>
          {resetting ? 'Resetting…' : 'Reset all to default'}
        </button>
      </div>
    </div>
  )
}

function Admin({ user, onSignIn }) {
  const [status, setStatus] = useState('loading')
  const [failure, setFailure] = useState(null)
  const [overview, setOverview] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selectedUuid, setSelectedUuid] = useState(null)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [online, setOnline] = useState([])
  const [presenceReady, setPresenceReady] = useState(true)
  const [withdrawals, setWithdrawals] = useState(null)
  const [wdStatus, setWdStatus] = useState('pending')
  const [wdType, setWdType] = useState('all')
  const [wdLoading, setWdLoading] = useState(false)
  const [wdError, setWdError] = useState(null)
  const [wdReload, setWdReload] = useState(0)
  const [settling, setSettling] = useState(null)
  const [txids, setTxids] = useState({})
  const [reasons, setReasons] = useState({})
  const [deltas, setDeltas] = useState({})
  const [reloadKey, setReloadKey] = useState(0)
  const previousBalances = useRef(new Map())

  const players = useMemo(() => overview?.players || [], [overview])
  const selected = players.find((player) => player.uuid === selectedUuid) || null

  useEffect(() => {
    const handler = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 350)
    return () => window.clearTimeout(handler)
  }, [search])

  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    const controller = new AbortController()
    const load = async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (query) params.set('search', query)
        const payload = await adminFetch(`/api/admin/overview?${params.toString()}`, { signal: controller.signal })
        if (cancelled) return
        setOverview(payload)
        setPresenceReady(payload.presenceReady !== false)
        setStatus('ready')
        setFailure(null)
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return
        setStatus('error')
        setFailure({ message: error.message, code: error.code, status: error.status })
      }
    }
    void load()
    return () => { cancelled = true; controller.abort() }
  }, [page, query, user, reloadKey])

  useEffect(() => {
    if (status !== 'ready' || !user) return undefined
    let disposed = false
    let timer
    const schedule = () => {
      if (disposed) return
      timer = window.setTimeout(poll, LIVE_POLL_MS)
    }
    const poll = async () => {
      try {
        const payload = await adminFetch('/api/admin/live')
        if (disposed) return
        setPresenceReady(payload.presenceReady !== false)
        setOnline(payload.players || [])
        setDeltas((current) => {
          const next = { ...current }
          for (const player of payload.players || []) {
            const previous = previousBalances.current.get(player.uuid)
            const coinDelta = previous ? Number(player.coins) - Number(previous.coins) : 0
            const rocoinDelta = previous ? Number(player.rocoins) - Number(previous.rocoins) : 0
            if (coinDelta || rocoinDelta) next[player.uuid] = { coins: coinDelta, rocoins: rocoinDelta, at: Date.now() }
            previousBalances.current.set(player.uuid, { coins: Number(player.coins) || 0, rocoins: Number(player.rocoins) || 0 })
          }
          return next
        })
      } catch {
        // A transient failure should not wipe the list; the next poll retries.
      }
      schedule()
    }
    void poll()
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [status, user])

  useEffect(() => {
    if (status !== 'ready' || !user) return undefined
    let cancelled = false
    const controller = new AbortController()
    const load = async () => {
      setWdLoading(true)
      try {
        const payload = await adminFetch(`/api/admin/withdrawals?status=${wdStatus}&type=${wdType}`, { signal: controller.signal })
        if (cancelled) return
        setWithdrawals(payload)
        setWdError(null)
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return
        setWdError(error.message)
      } finally {
        if (!cancelled) setWdLoading(false)
      }
    }
    void load()
    return () => { cancelled = true; controller.abort() }
  }, [status, user, wdStatus, wdType, wdReload])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDeltas((current) => {
        const entries = Object.entries(current).filter(([, value]) => Date.now() - value.at < DELTA_LIFETIME_MS)
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries)
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const togglePlayer = (player) => {
    if (selectedUuid === player.uuid) {
      setSelectedUuid(null)
      setDraft({})
      return
    }
    setSelectedUuid(player.uuid)
    setDraft(draftFor(player))
  }

  const dirtyGames = useMemo(() => {
    if (!selected) return []
    return GAME_ORDER.filter((game) => {
      const stored = selected.settings?.[game]
      const storedValue = stored === null || stored === undefined ? '' : String(stored)
      return String(draft[game] ?? '').trim() !== storedValue.trim()
    })
  }, [draft, selected])

  const changeDraft = (game, value) => {
    setDraft((current) => ({ ...current, [game]: value, __dirty: true }))
  }

  const quickDraft = (game, preset) => {
    setDraft((current) => ({ ...current, [game]: preset === null ? '' : String(preset), __dirty: true }))
  }

  const saveRtp = async () => {
    if (!selected) return
    const entries = GAME_ORDER
      .filter((game) => dirtyGames.includes(game))
      .map((game) => {
        const raw = String(draft[game] ?? '').trim()
        if (!raw) return { game, rtp: null }
        const value = Number(raw)
        return { game, rtp: Number.isFinite(value) ? Math.min(200, Math.max(0, value)) : null }
      })
    if (!entries.length) { notify({ type: 'info', message: 'Nothing has changed yet.' }); return }
    try {
      setSaving(true)
      const payload = await adminFetch('/api/admin/rtp', {
        method: 'POST',
        body: JSON.stringify({ userUuid: selected.uuid, settings: entries }),
      })
      setOverview((current) => current ? {
        ...current,
        players: current.players.map((player) => player.uuid === selected.uuid ? { ...player, settings: payload.settings || {} } : player),
      } : current)
      setDraft(draftFor({ ...selected, settings: payload.settings || {} }))
      notify({ type: 'success', message: `RTP updated for ${selected.username || 'the player'}.` })
    } catch (error) {
      notify({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  const resetRtp = async () => {
    if (!selected) return
    try {
      setResetting(true)
      await adminFetch('/api/admin/rtp/reset', {
        method: 'POST',
        body: JSON.stringify({ userUuid: selected.uuid }),
      })
      setOverview((current) => current ? {
        ...current,
        players: current.players.map((player) => player.uuid === selected.uuid ? { ...player, settings: {} } : player),
      } : current)
      setDraft(draftFor({ ...selected, settings: {} }))
      notify({ type: 'success', message: 'Every game is back to its original RTP for that player.' })
    } catch (error) {
      notify({ type: 'error', message: error.message })
    } finally {
      setResetting(false)
    }
  }

  const settleWithdrawal = async (item, action) => {
    try {
      setSettling(`${item.id}:${action}`)
      await adminFetch(item.kind === 'crypto' ? '/api/admin/withdrawals/crypto' : '/api/admin/withdrawals/robux', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          action,
          txid: action === 'completed' ? txids[item.id] || undefined : undefined,
          reason: action === 'canceled' ? reasons[item.id] || undefined : undefined,
        }),
      })
      notify({
        type: 'success',
        message: action === 'completed'
          ? `${item.kind === 'crypto' ? 'Crypto' : 'Robux'} withdrawal marked completed.`
          : `${item.kind === 'crypto' ? 'Crypto' : 'Robux'} withdrawal canceled and refunded.`,
      })
      setTxids((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      setReasons((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      setWdReload((value) => value + 1)
    } catch (error) {
      notify({ type: 'error', message: error.message })
    } finally {
      setSettling(null)
    }
  }

  const liveRows = online.map((player) => ({
    ...player,
    coinDelta: deltas[player.uuid]?.coins || 0,
    rocoinDelta: deltas[player.uuid]?.rocoins || 0,
  }))

  const playersWithDeltas = players.map((player) => ({
    ...player,
    coinDelta: deltas[player.uuid]?.coins || 0,
    rocoinDelta: deltas[player.uuid]?.rocoins || 0,
  }))

  if (!user) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <h1>Admin dashboard</h1>
          <p>Sign in with an administrator account to see players, live balances and RTP controls.</p>
          <button type="button" className="admin-btn primary" onClick={onSignIn}>Sign in</button>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="admin-page">
        <div className="admin-loading"><span /><span /><span /></div>
      </div>
    )
  }

  if (status === 'error' && failure?.status === 403) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <h1>Administrators only</h1>
          <p>Your account does not have the admin rank. Ask an owner to set <code>rank = &apos;admin&apos;</code> on your row in <code>rorisk_users</code>.</p>
          <a className="admin-btn ghost" href="/">Back to the casino</a>
        </div>
      </div>
    )
  }

  if (status === 'error' && failure?.status === 401) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <h1>Session expired</h1>
          <p>{failure.message}</p>
          <button type="button" className="admin-btn primary" onClick={onSignIn}>Sign in again</button>
        </div>
      </div>
    )
  }

  const pagination = overview?.pagination
  const stats = overview?.stats || {}
  const defaults = overview?.defaults || []

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div className="admin-title">
          <h1>Admin dashboard</h1>
          <p>Players, live balances and per-player return-to-player controls.</p>
        </div>
        <div className={`admin-live-pill${liveRows.length ? ' is-live' : ''}`}>
          <i />
          {liveRows.length ? `${liveRows.length} player${liveRows.length > 1 ? 's' : ''} online` : 'No one online'}
        </div>
      </header>

      {failure && status === 'error' && (
        <div className="admin-banner error">
          <strong>Could not load the dashboard.</strong>
          <span>{failure.message}</span>
          <button type="button" className="admin-btn ghost" onClick={() => { setStatus('loading'); setReloadKey((value) => value + 1) }}>Retry</button>
        </div>
      )}

      {overview && !overview.rtpReady && (
        <div className="admin-banner warning">
          <strong>RTP tables are not installed yet.</strong>
          <span>Run <code>npx supabase db push --include-all</code> once; the player list and live balances already work without them.</span>
        </div>
      )}

      {overview && overview.presenceReady === false && (
        <div className="admin-banner warning">
          <strong>Live presence is not installed yet.</strong>
          <span>Run <code>npx supabase db push --include-all</code> to add <code>rorisk_presence</code>; until then the online list can only show players connected to this server instance.</span>
        </div>
      )}

      <section className="admin-stats">
        <article className="admin-stat">
          <span>Players</span>
          <strong>{format(stats.players)}</strong>
          <small>registered accounts</small>
        </article>
        <article className="admin-stat">
          <span>Online now</span>
          <strong>{format(stats.online)}</strong>
          <small>seen in the last minute</small>
        </article>
        <article className="admin-stat accent">
          <span>Custom RTP</span>
          <strong>{format(stats.customized)}</strong>
          <small>players with an override</small>
        </article>
        <article className="admin-stat">
          <span>Games</span>
          <strong>{format(stats.games || GAME_ORDER.length - 1)}</strong>
          <small>tunable game rates</small>
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Withdrawals</h2>
            <p>Crypto and Robux requests reserve the player’s balance. Completing pays it out; canceling refunds it.</p>
          </div>
          <span className="admin-panel-tag">{format(withdrawals?.counts?.total)} pending</span>
        </div>

        <div className="admin-wd-tools">
          <div className="admin-wd-tabs">
            {WITHDRAWAL_TABS.map((tab) => (
              <button type="button" key={tab.key} className={wdStatus === tab.key ? 'is-active' : ''} onClick={() => setWdStatus(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="admin-wd-tabs">
            {WITHDRAWAL_TYPES.map((option) => (
              <button type="button" key={option.key} className={wdType === option.key ? 'is-active' : ''} onClick={() => setWdType(option.key)}>
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="admin-btn ghost" disabled={wdLoading} onClick={() => setWdReload((value) => value + 1)}>
            {wdLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {withdrawals?.robuxReady === false && (
          <div className="admin-banner warning">
            <strong>Robux withdrawals are not installed yet.</strong>
            <span>Run <code>npx supabase db push --include-all</code> to add the queue; crypto requests already list here.</span>
          </div>
        )}

        {wdError && (
          <div className="admin-banner error">
            <strong>Could not load withdrawals.</strong>
            <span>{wdError}</span>
          </div>
        )}

        <div className="admin-wd-list">
          {withdrawals?.items?.length ? withdrawals.items.map((item) => (
            <WithdrawalCard
              key={`${item.kind}-${item.id}`}
              item={item}
              txid={txids[item.id] || ''}
              reason={reasons[item.id] || ''}
              onTxid={(value) => setTxids((current) => ({ ...current, [item.id]: value }))}
              onReason={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
              onSettle={settleWithdrawal}
              busy={settling?.startsWith(`${item.id}:`) ? settling.split(':')[1] : null}
            />
          )) : (
            <div className="admin-empty">
              {wdLoading && !withdrawals
                ? 'Loading withdrawals…'
                : wdStatus === 'pending'
                  ? 'No withdrawals are waiting.'
                  : 'No withdrawals in this view.'}
            </div>
          )}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Online players</h2>
            <p>Balances refresh every {LIVE_POLL_MS / 1000} seconds; green and red show movement since the last refresh.</p>
          </div>
          <span className="admin-panel-tag">{liveRows.length} live</span>
        </div>
        {liveRows.length === 0 ? (
          <div className="admin-empty">
            {presenceReady ? 'Nobody is connected right now.' : 'Presence tracking is not installed yet, so online players cannot be listed.'}
          </div>
        ) : (
          <div className="admin-live-grid">
            {liveRows.map((player) => (
              <article className="admin-live-card" key={player.uuid}>
                <div className="admin-live-top">
                  <span className="admin-avatar">
                    <img src={player.avatar_headshot || DEFAULT_AVATAR} alt="" />
                    <i className="admin-online-dot" />
                  </span>
                  <div className="admin-live-name">
                    <span>{player.username || 'Unknown player'}</span>
                    <small>{player.rank && player.rank !== 'user' ? `${player.rank} · ` : ''}seen {seenLabel(player.lastSeenAt)}</small>
                  </div>
                </div>
                <div className="admin-live-balances">
                  <Balance value={player.coins} delta={player.coinDelta} />
                  <span className="admin-balance">
                    <img src={ROCOIN_ICON} alt="" />
                    <span>{format(player.rocoins)}</span>
                    {player.rocoinDelta > 0 && <span className="admin-delta up">+{format(player.rocoinDelta)}</span>}
                    {player.rocoinDelta < 0 && <span className="admin-delta down">-{format(Math.abs(player.rocoinDelta))}</span>}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>All players</h2>
            <p>Select a player to set a rate for every game at once, or for a single game.</p>
          </div>
          <label className="admin-search">
            <SiteIcon name="search" />
            <input
              type="text"
              value={search}
              placeholder="Search username or email"
              onChange={(event) => { setSearch(event.target.value); setSelectedUuid(null) }}
            />
          </label>
        </div>

        <div className="admin-table-head">
          <span>Player</span>
          <span>Coins</span>
          <span>RoCoins</span>
          <span>RTP</span>
          <span>Joined</span>
          <span />
        </div>

        <div className="admin-table">
          {playersWithDeltas.length === 0 ? (
            <div className="admin-empty">{query ? `No players match “${query}”.` : 'No players yet.'}</div>
          ) : playersWithDeltas.map((player) => (
            <div className="admin-player-block" key={player.uuid}>
              <PlayerRow
                player={player}
                expanded={selectedUuid === player.uuid}
                onToggle={() => togglePlayer(player)}
              />
              {selectedUuid === player.uuid && (
                <RtpEditor
                  player={player}
                  defaults={defaults}
                  draft={draft}
                  disabled={!overview?.rtpReady}
                  saving={saving}
                  resetting={resetting}
                  onChange={changeDraft}
                  onQuick={quickDraft}
                  onSave={saveRtp}
                  onReset={resetRtp}
                />
              )}
            </div>
          ))}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="admin-pagination">
            <button type="button" className="admin-btn ghost" disabled={!pagination.hasPrevPage} onClick={() => { setSelectedUuid(null); setDraft({}); setPage((value) => Math.max(1, value - 1)) }}>Previous</button>
            <span>Page {pagination.page} of {pagination.totalPages} · {format(pagination.total)} players</span>
            <button type="button" className="admin-btn ghost" disabled={!pagination.hasNextPage} onClick={() => { setSelectedUuid(null); setDraft({}); setPage((value) => value + 1) }}>Next</button>
          </div>
        )}
      </section>
    </div>
  )
}

export default Admin
