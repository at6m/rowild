import { levelProgress, xpAtLevel, MAX_LEVEL } from '../lib/Xp'
import { xpRankForLevel } from '../lib/Ranks'

const scope = { 'data-v-3b2e0e04': '' }

const amount = (value) => Math.floor(Number(value) || 0).toLocaleString('en-US')
const integer = (value) => Math.floor(Number(value) || 0).toLocaleString('en-US')

function CurrencyRow({ currency, value, profit = false }) {
  const number = Number(value) || 0
  const tone = profit ? (number > 0 ? ' profit-positive' : number < 0 ? ' profit-negative' : '') : ''
  return <div className={`stat-value-row${tone}`} {...scope}><img className="Coins-icon" src={currency === 'rocoins' ? '/assets/currency/rocoin.2d3febd5.svg' : '/assets/currency/coin.svg'} alt="" {...scope} /><span {...scope}>{amount(number)}</span></div>
}

function CurrencyCard({ title, coins, rocoins, profit = false }) {
  return <div className="stat-card" {...scope}><div className="stat-card-header" {...scope}><span className="stat-card-title" {...scope}>{title}</span></div><div className="stat-card-value" {...scope}><CurrencyRow currency="coins" value={coins} profit={profit} /><CurrencyRow currency="rocoins" value={rocoins} profit={profit} /></div></div>
}

function StatisticCard({ title, value }) {
  return <div className="stat-card" {...scope}><div className="stat-card-header" {...scope}><span className="stat-card-title" {...scope}>{title}</span></div><div className="stat-card-value" {...scope}><span {...scope}>{integer(value)}</span></div></div>
}

function StatisticsModal({ user }) {
  const field = (key) => Math.max(0, Math.floor(Number(user?.[key]) || 0))
  const coins = {
    deposit: field('total_deposited_coins'),
    withdraw: field('total_withdrawn_coins'),
    rewards: field('total_rewards_coins'),
    bet: field('total_wagered_coins'),
    won: field('total_won_coins'),
  }
  const rocoins = {
    bet: field('total_wagered_rocoins'),
    won: field('total_won_rocoins'),
  }
  const rawXp = Math.max(0, Math.floor(Number(user?.xp) || 0))
  const progress = levelProgress(rawXp)
  // Prefer XP over the stored level so the modal stays correct even before the
  // level column is backfilled from xp.
  const level = rawXp > 0 ? progress.level : Math.max(0, Math.floor(Number(user?.level) || 0))
  const rank = xpRankForLevel(level)
  const nextLevelXp = level >= MAX_LEVEL ? xpAtLevel(level) : xpAtLevel(level + 1)
  const xpIntoLevel = level >= MAX_LEVEL ? 0 : Math.max(0, rawXp - progress.xpStart)

  return <div className="modal-user-stats" {...scope}><div className="stats-content" {...scope}>
    <div className="stats-header" {...scope}><h2 className="stats-title" {...scope}>User Statistics</h2></div>
    <div className="stats-section" {...scope}>
      <h3 className="section-title" {...scope}>Progress</h3>
      <div className="stats-cards" {...scope}>
        <StatisticCard title="Level" value={level} />
        <StatisticCard title="XP" value={rawXp} />
        <div className="stat-card" {...scope}><div className="stat-card-header" {...scope}><span className="stat-card-title" {...scope}>Current Rank</span></div><div className="stat-card-value" {...scope}><div className="stat-value-row" {...scope}><img className="Coins-icon" src={rank.icon} alt="" {...scope} /><span {...scope}>{rank.name}</span></div></div></div>
        <div className="stat-card" {...scope}>
          <div className="stat-card-header" {...scope}><span className="stat-card-title" {...scope}>Next Level</span></div>
          <div className="stat-card-value" {...scope}>
            <div className="stat-value-row" {...scope}><span {...scope}>{level >= MAX_LEVEL ? 'Max level' : `${integer(xpIntoLevel)} / ${integer(nextLevelXp - progress.xpStart)} XP`}</span></div>
          </div>
          <div className="stat-progress" {...scope}><div className="stat-progress-fill" style={{ width: `${progress.progress}%` }} {...scope} /></div>
        </div>
      </div>
    </div>
    <div className="stats-section" {...scope}>
      <h3 className="section-title" {...scope}>Financial Statistics</h3>
      <div className="stats-cards" {...scope}>
        <CurrencyCard title="Total Deposited" coins={coins.deposit} rocoins={0} />
        <CurrencyCard title="Total Withdrawn" coins={coins.withdraw} rocoins={0} />
        <CurrencyCard title="Total Profit" coins={coins.won - coins.bet} rocoins={rocoins.won - rocoins.bet} profit />
        <CurrencyCard title="Rewards Claimed" coins={coins.rewards} rocoins={0} />
      </div>
    </div>
    <div className="stats-grid" {...scope}>
      <div className="stats-section" {...scope}>
        <h3 className="section-title" {...scope}>Game Statistics</h3>
        <div className="stats-cards" {...scope}>
          <StatisticCard title="Total Bets" value={field('total_bets')} />
          <CurrencyCard title="Total Wagered" coins={coins.bet} rocoins={rocoins.bet} />
          <CurrencyCard title="Total Won" coins={coins.won} rocoins={rocoins.won} />
          <CurrencyCard title="Total Lost" coins={Math.max(0, coins.bet - coins.won)} rocoins={Math.max(0, rocoins.bet - rocoins.won)} />
        </div>
      </div>
    </div>
  </div></div>
}

export default StatisticsModal
