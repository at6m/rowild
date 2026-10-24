import { useState } from 'react'
import ModalAnimation from './ModalAnimation'
import { XP_THRESHOLDS as xpThresholds } from '../lib/Xp'

const scope = { 'data-v-9f785c6e': '' }
const asset = (name) => `/assets/rewards/current/${name}`


const tiers = [
  {
    name: 'Rust', start: 1, end: 19, xp: '0.1 - 42,900', keys: 107,
    icon: 'rust.0b56e484.svg', key: 'rust.134c5f3a.png',
    detailKeys: [2, 1, 2, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 10, 10, 10],
  },
  {
    name: 'Bronze', start: 20, end: 39, xp: '50,000 - 629,000', keys: 78,
    icon: 'bronze.f59206cb.svg', key: 'bronze.357608b3.png',
    detailKeys: [5, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8],
  },
  {
    name: 'Silver', start: 40, end: 59, xp: '740,000 - 7,956,000', keys: 142,
    icon: 'silver.81ba8fbc.svg', key: 'silver.e8a99d8a.png',
    detailKeys: [10, 1, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 12, 12, 12, 12],
  },
  {
    name: 'Gold', start: 60, end: 79, xp: '8,700,000 - 34,730,000', keys: 158,
    icon: 'gold.49b1d38b.svg', key: 'gold.34bcbc8a.png',
    detailKeys: [15, 3, 3, 3, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10, 12, 12],
  },
  {
    name: 'Diamond', start: 80, end: 99, xp: '37,000,000 - 260,000,000', keys: 115,
    icon: 'diamond.e915302c.svg', key: 'diamond.e0b428f6.png',
    detailKeys: [15, 1, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 10],
  },
  {
    name: 'Emerald', start: 100, end: 119, xp: '300,000,000 - 3,475,000,000', keys: 373,
    icon: 'emerald.2fc26a46.svg', key: 'emerald.3f96ded5.png',
    detailKeys: [50, 2, 4, 6, 6, 10, 10, 10, 10, 10, 20, 10, 10, 20, 25, 25, 30, 35, 40, 40],
  },
  {
    name: 'Ruby', start: 120, end: 129, xp: '4,200,000,000 - 18,000,000,000', keys: 250,
    icon: 'ruby.550e6038.svg', key: 'ruby.46f86d1d.png',
    detailKeys: [20, 20, 20, 20, 25, 25, 30, 30, 30, 30],
  },
]

const rates = [
  { name: 'X-Roulette, Slide', xp: '100 XP' },
  { name: 'Cases, battles, blackjack, dice, mines, limbo, upgrader', xp: '88 XP' },
  { name: 'Coinflip', xp: '10 XP' },
  { name: 'Cancelled, voided, or refunded bets', xp: '0 XP' },
]

const formatXp = (value) => value < 1 ? String(value) : Number(value).toLocaleString('en-US')

function TierRow({ tier, open, onToggle }) {
  const range = `${formatXp(xpThresholds[tier.start])} - ${formatXp(xpThresholds[tier.end])}`
  const details = tier.detailKeys.map((keys, index) => {
    const level = tier.start + index
    const xp = formatXp(xpThresholds[level])
    return { level, xp, keys }
  })

  return <>
    <button className="xp-row xp-row-tier" type="button" onClick={onToggle} {...scope}>
      <span className="xp-tier" {...scope}><img src={asset(tier.icon)} alt="" {...scope} />{tier.name}</span>
      <span className="xp-num" {...scope}>{tier.start} - {tier.end}</span>
      <span className="xp-num" {...scope}>{range}</span>
      <span className="xp-keys" {...scope}>
        <img src={asset(tier.key)} alt="" {...scope} />
        <span className="xp-num" {...scope}>{tier.keys}</span>
        <svg className={`xp-caret${open ? ' is-open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" {...scope}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="#8aa4bb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...scope} />
        </svg>
      </span>
    </button>
    {open && <div {...scope}>{details.map((detail) => <div className="xp-row xp-row-child" key={detail.level} {...scope}>
      <span className="xp-tier" {...scope}><img src={asset(tier.icon)} alt="" {...scope} />{tier.name}</span>
      <span className="xp-num" {...scope}>{detail.level}</span>
      <span className="xp-num" {...scope}>{detail.xp}</span>
      <span className="xp-keys" {...scope}><img src={asset(tier.key)} alt="" {...scope} /><span className="xp-num" {...scope}>{detail.keys}</span></span>
    </div>)}</div>}
  </>
}

function XPBreakdownModal({ onClose }) {
  const [openTier, setOpenTier] = useState(null)
  const [showRates, setShowRates] = useState(false)
  const [closing, setClosing] = useState(false)

  return <ModalAnimation label="XP Breakdown" closeRequest={closing} onClose={onClose} showClose={false}>
    <div className="xp-breakdown" {...scope}>
      <button className="xp-close" type="button" aria-label="Close" onClick={() => setClosing(true)} {...scope}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...scope}>
          <path d="M15 5L5 15" stroke="#b2c5d6" strokeWidth="1.5" strokeLinecap="round" {...scope} />
          <path d="M5 5L15 15" stroke="#b2c5d6" strokeWidth="1.5" strokeLinecap="round" {...scope} />
        </svg>
      </button>
      <div className="xp-head" {...scope}>
        <h2 {...scope}>XP Breakdown</h2>
        <p {...scope}>Level up to get more keys to unlock the bonus cases!</p>
      </div>
      <div className="xp-table" {...scope}>
        <div className="xp-row xp-row-head" {...scope}><span {...scope}>Tier</span><span {...scope}>Level</span><span {...scope}>Total XP</span><span {...scope}>Keys</span></div>
        {tiers.map((tier) => <TierRow key={tier.name} tier={tier} open={openTier === tier.name} onToggle={() => setOpenTier(openTier === tier.name ? null : tier.name)} />)}
      </div>
      <button className="xp-how" type="button" onClick={() => setShowRates(!showRates)} {...scope}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...scope}>
          <path fill="#8ec4ff" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" {...scope} />
          <path fill="#162937" d="M13 17.2h-2v-2h2v2zm1.8-8.4c0 1.7-1.25 2.45-2.2 3.15-.7.5-1 1-.1 1.75V14h-2v-.55c0-1.2.55-1.9 1.45-2.55.9-.65 1.25-1.05 1.25-1.85 0-.75-.6-1.3-1.5-1.3-.85 0-1.45.45-1.65 1.25H8.4A3.3 3.3 0 0 1 12 5.9c1.95 0 3.8 1.25 3.8 3.9z" {...scope} />
        </svg>
        How is XP calculated?
      </button>
      {showRates && <div className="xp-rates" {...scope}>
        <p {...scope}>XP is awarded from the wager, not from whether you win or lose. Rates per 1 coin:</p>
        {rates.map((rate) => <div className="xp-rate-row" key={rate.name} {...scope}><span {...scope}>{rate.name}</span><span className="xp-num" {...scope}>{rate.xp}</span></div>)}
      </div>}
    </div>
  </ModalAnimation>
}

export default XPBreakdownModal
