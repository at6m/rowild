// Cumulative XP thresholds per level, taken from the XP Breakdown table.
// Raw XP (as stored in rorisk_users.xp) is compared directly against these
// values, matching the back-end function rorisk_level_for_xp.
export const XP_THRESHOLDS = [
  0, 0.1, 100, 250, 500, 800, 1200, 1900, 3000, 4500, 6200, 8300,
  10800, 13800, 17300, 21300, 25800, 30900, 36600, 42900, 50000, 58000,
  67000, 77000, 87500, 99000, 111500, 125000, 139500, 156000, 175000,
  197000, 223000, 255000, 293000, 339000, 394000, 460000, 537000, 629000,
  740000, 878000, 1036000, 1214000, 1413000, 1634000, 1879000, 2149000,
  2445000, 2770000, 3127000, 3513000, 3934000, 4389000, 4882000,
  5412000, 5983000, 6596000, 7253000, 7956000, 8700000, 9500000,
  10350000, 11260000, 12220000, 13240000, 14320000, 15460000, 16660000,
  17930000, 19270000, 20670000, 22150000, 23700000, 25340000, 27050000,
  28840000, 30720000, 32680000, 34730000, 37000000, 40000000, 43000000,
  47000000, 51000000, 56000000, 61000000, 67000000, 73000000, 80000000,
  87000000, 96000000, 106000000, 118000000, 133000000, 150000000,
  170000000, 195000000, 225000000, 260000000, 300000000, 350000000,
  410000000, 480000000, 560000000, 650000000, 750000000, 850000000,
  960000000, 1080000000, 1200000000, 1335000000, 1485000000, 1655000000,
  1850000000, 2070000000, 2340000000, 2655000000, 3030000000, 3475000000,
  4200000000, 5000000000, 6000000000, 7200000000, 8500000000, 10000000000,
  11700000000, 13500000000, 15500000000, 18000000000,
]

export const MAX_LEVEL = XP_THRESHOLDS.length - 1

export function levelFromXp(rawXp) {
  const xp = Math.max(0, Number(rawXp) || 0)
  if (xp < XP_THRESHOLDS[1]) return 0
  let level = 0
  for (let index = 1; index < XP_THRESHOLDS.length; index += 1) {
    if (XP_THRESHOLDS[index] > xp) break
    level = index
  }
  return level
}

export function xpAtLevel(level) {
  const index = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(level) || 0)))
  return Math.round(XP_THRESHOLDS[index])
}

export function levelProgress(rawXp) {
  const xp = Math.max(0, Number(rawXp) || 0)
  const level = levelFromXp(xp)
  const start = xpAtLevel(level)
  const end = xpAtLevel(level + 1)
  return {
    level,
    xp,
    xpStart: start,
    xpNeeded: Math.max(1, end - start),
    progress: level >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, ((xp - start) / Math.max(1, end - start)) * 100)),
  }
}
