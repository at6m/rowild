import { useEffect, useRef, useState } from 'react'
import SiteIcon from '../components/Icons'
import Bets from '../components/Bets'
import { levelProgress as xpLevelProgress } from '../lib/Xp'
import { UPGRADER_LOCKED, UPGRADER_LOCKED_MESSAGE } from '../lib/GameLocks'
import { notify } from '../lib/Notifications'

const banners = [
  { src: '/assets/banners/rewards.52a9b29c.png', alt: 'Claim your free rewards', width: 1080, height: 420 },
  { src: '/assets/banners/rowild-release.png', alt: 'RoWild is now live', width: 1080, height: 420 },
]

const originals = [
  ['X-Roulette', '/assets/games/previews/xr.webm', 'slide', 'wide', '/x-roulette', true],
  ['Blackjack', '/assets/games/previews/blackjack.webm', 'blackjack', '', '/blackjack'],
  ['Upgrader', '/assets/games/previews/upgrader.webm', 'upgrader', '', '/upgrader'],
  ['Mines', '/assets/games/previews/mines.webm', 'mines', '', '/mines'],
  ['Dice', '/assets/games/previews/dice.webm', 'dice', '', '/dice', true],
  ['Case Battles', '/assets/games/previews/casebattles.webm', 'battles', '', '/battles'],
  ['Cases', '/assets/games/previews/cases.webm', 'cases', '', '/cases'],
]

const methods = [
  ['btc', '/assets/payments/btc.79d4fc52.png'],
  ['eth', '/assets/payments/eth.png'],
  ['ltc', '/assets/payments/ltc.png'],
  ['sol', '/assets/payments/solana.png'],
  ['usdt', '/assets/payments/tether.png'],
  ['usdc', '/assets/payments/usdc.png'],
  ['robux', '/assets/payments/robux.2244c5eb.png'],
  ['limiteds', '/assets/payments/valk.3e69ac3a.png'],
]

// Picked once per page load, so the Welcome Back character changes on every reload.
const welcomeCharacterVideo = Math.random() < 0.5
  ? '/assets/backgrounds/home2.webm'
  : '/assets/backgrounds/home3.webm'

function levelTheme(level) {
  if (level >= 100) return 'red'
  if (level >= 75) return 'orange'
  if (level >= 50) return 'purple'
  if (level >= 25) return 'green'
  return 'blue'
}

function HomeBanner() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const [dragWidth, setDragWidth] = useState(420)
  const [stageWidth, setStageWidth] = useState(0)
  const timerRef = useRef(null)
  const bannerRef = useRef(null)
  const dragStartRef = useRef(0)
  const didDragRef = useRef(false)

  const clearAutoAdvance = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const startAutoAdvance = () => {
    clearAutoAdvance()
    timerRef.current = window.setInterval(
      () => setCurrentIndex((index) => (index + 1) % banners.length),
      8000,
    )
  }

  const goTo = (index) => {
    if (index !== currentIndex) {
      setHoveredIndex(null)
      setCurrentIndex(index)
      startAutoAdvance()
    }
  }

  useEffect(() => {
    timerRef.current = window.setInterval(
      () => setCurrentIndex((index) => (index + 1) % banners.length),
      8000,
    )
    return () => clearAutoAdvance()
  }, [])

  useEffect(() => {
    const measureStage = () => setStageWidth(bannerRef.current?.clientWidth || 0)
    measureStage()
    window.addEventListener('resize', measureStage)
    return () => window.removeEventListener('resize', measureStage)
  }, [])

  const getSlot = (index) => {
    let slot = index - currentIndex
    if (slot > 1) slot -= banners.length
    if (slot < -1) slot += banners.length
    return slot
  }

  const poses = stageWidth > 0 && stageWidth < 640
    ? {
        '-1': { x: -70, scale: 0.76, rotate: -2, opacity: 0.4, z: 1 },
        0: { x: -50, scale: 1, rotate: 0, opacity: 1, z: 3 },
        1: { x: -30, scale: 0.76, rotate: 2, opacity: 0.4, z: 1 },
      }
    : {
        '-1': { x: -78, scale: 0.82, rotate: -2, opacity: 0.45, z: 1 },
        0: { x: -50, scale: 1, rotate: 0, opacity: 1, z: 3 },
        1: { x: -22, scale: 0.82, rotate: 2, opacity: 0.45, z: 1 },
      }

  const finishDrag = () => {
    if (!isDragging) return
    const delta = dragDelta
    setIsDragging(false)
    setDragDelta(0)
    if (Math.abs(delta) >= 50) {
      const direction = delta < 0 ? 1 : -1
      setCurrentIndex((index) => (index + direction + banners.length) % banners.length)
      startAutoAdvance()
    } else startAutoAdvance()
    if (didDragRef.current) window.setTimeout(() => { didDragRef.current = false }, 40)
  }

  return (
    <section className="banner-section" data-v-656b4aa4="" data-v-30c4bf74="">
      <div className="banner-mask-x" onMouseEnter={clearAutoAdvance} onMouseLeave={() => { setHoveredIndex(null); if (!isDragging) startAutoAdvance() }} data-v-656b4aa4="">
        <div
          ref={bannerRef}
          className={`banner-mask-y${isDragging ? ' is-dragging' : ''}`}
          onPointerMove={(event) => {
            if (!isDragging) return
            const delta = event.clientX - dragStartRef.current
            setDragDelta(delta)
            if (Math.abs(delta) > 6) didDragRef.current = true
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          data-v-656b4aa4=""
        >
          <div className="banner-stage" data-v-656b4aa4="">
            {banners.map((banner, index) => {
              const slot = getSlot(index)
              const dragProgress = isDragging ? Math.max(-1, Math.min(1, dragDelta / (0.55 * dragWidth))) : 0
              const pose = slot === 0 && dragProgress !== 0
                ? { x: -50 + 38 * dragProgress, scale: 1, rotate: 2 * dragProgress, opacity: 1, z: 4 }
                : (poses[slot] || { x: slot < 0 ? -160 : 60, scale: 0.7, rotate: 4 * (slot < 0 ? -1 : 1), opacity: 0, z: 0 })
              const hovered = !isDragging && hoveredIndex === index
              const scale = hovered ? pose.scale * (slot === 0 ? 1.04 : 1.06) : pose.scale
              const opacity = hovered && slot !== 0 ? Math.min(1, pose.opacity + 0.45) : pose.opacity
              return (
                <div
                  className={`banner-slide${isDragging && index === currentIndex ? ' no-transition' : ''}`}
                  data-v-656b4aa4=""
                  key={banner.src}
                  tabIndex="0"
                  onClick={() => {
                    if (didDragRef.current) didDragRef.current = false
                    else if (index !== currentIndex) goTo(index)
                  }}
                  onPointerDown={(event) => {
                    if (index !== currentIndex || (event.button !== undefined && event.button !== 0)) return
                    setIsDragging(true)
                    didDragRef.current = false
                    dragStartRef.current = event.clientX
                    setDragWidth(bannerRef.current?.clientWidth || 420)
                    setDragDelta(0)
                    clearAutoAdvance()
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    transform: `translateX(${pose.x}%) translateY(-50%) scale(${scale}) rotateZ(${pose.rotate}deg)`,
                    opacity,
                    zIndex: pose.z,
                    filter: 'drop-shadow(rgba(0, 0, 0, 0.3) 0 0 0.3rem)',
                    pointerEvents: pose.opacity < 0.05 ? 'none' : 'auto',
                  }}
                >
                  <div className="banner-slide-inner" data-v-656b4aa4="">
                    <img src={banner.src} alt={banner.alt} width={banner.width} height={banner.height} draggable="false" data-v-656b4aa4="" />
                  </div>
                </div>
              )
            })}
            <button className="banner-hit banner-hit-left" type="button" aria-label="Show previous banner" onClick={() => goTo((currentIndex - 1 + banners.length) % banners.length)} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={() => setHoveredIndex((currentIndex - 1 + banners.length) % banners.length)} onMouseLeave={() => setHoveredIndex(null)} data-v-656b4aa4="" />
            <button className="banner-hit banner-hit-right" type="button" aria-label="Show next banner" onClick={() => goTo((currentIndex + 1) % banners.length)} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={() => setHoveredIndex((currentIndex + 1) % banners.length)} onMouseLeave={() => setHoveredIndex(null)} data-v-656b4aa4="" />
          </div>
        </div>
      </div>
      <div className="banner-dots" data-v-656b4aa4="">
        {banners.map((banner, index) => (
          <button
            key={banner.src}
            className={`banner-dot${index === currentIndex ? ' active' : ''}`}
            data-v-656b4aa4=""
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </section>
  )
}

function HomeWelcome({ user, onRewards }) {
  const username = user?.username || 'Guest'
  const avatar = user?.avatar_headshot || user?.avatar || '/assets/users/default-avatar.png'
  const xp = Number(user?.xp)
  const hasXp = Number.isFinite(xp) && xp > 0
  const level = hasXp ? xpLevelProgress(xp).level : Math.max(0, Math.floor(Number(user?.level) || 0))
  const levelProgress = hasXp ? xpLevelProgress(xp).progress : 0
  return (
    <div className="home-welcome" data-v-21735a18="" data-v-30c4bf74="">
      <div className="welcome-panel" data-v-21735a18="">
        <div className="welcome-content" data-v-21735a18="">
          <div className="welcome-top" data-v-21735a18="">
            <div className="welcome-avatar" data-v-21735a18="">
              <div className="welcome-avatar-inner" data-v-21735a18="">
                <div className="avatar-image user-avatar" data-v-6adb23f8="" data-v-21735a18=""><img src={avatar} alt="avatar" data-v-6adb23f8="" /></div>
              </div>
            </div>
            <div className="welcome-heading" data-v-21735a18="">
              <div className="welcome-label" data-v-21735a18="">Welcome Back</div>
              <div className="welcome-username" data-v-21735a18="">{username}</div>
            </div>
          </div>
          <div className="level-progress-section" data-v-21735a18="">
            <div className={`box-level level-${levelTheme(level)}`} data-v-ff759fba="" data-v-21735a18=""><div className="level-inner" data-v-ff759fba="">{level}</div></div>
            <div className="progress-container" data-v-21735a18="">
              <div className="progress-arrow" style={{ left: `${levelProgress}%` }} data-v-21735a18=""><SiteIcon name="chevron-down" data-v-21735a18="" /></div>
              <div className="progress-bar" data-v-21735a18=""><div className="progress-fill" style={{ width: `${levelProgress}%` }} data-v-21735a18="" /></div>
            </div>
            <div className={`box-level level-${levelTheme(Math.min(100, level + 1))}`} data-v-ff759fba="" data-v-21735a18=""><div className="level-inner" data-v-ff759fba="">{Math.min(100, level + 1)}</div></div>
          </div>
          <button className="rewards-btn" type="button" onClick={onRewards} data-v-21735a18="">View Daily Rewards</button>
        </div>
        <div className="welcome-visual" aria-hidden="true" data-v-21735a18="">
          <img className="welcome-item" src="/assets/images/federation.png" alt="" data-v-21735a18="" />
          <video className="welcome-character" src={welcomeCharacterVideo} autoPlay muted loop playsInline preload="auto" data-v-21735a18="" />
        </div>
      </div>
    </div>
  )
}
