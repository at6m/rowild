// Scans src/ for /assets/... references and reports which files are missing on disk.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const srcDir = path.join(root, 'src')
const publicDir = path.join(root, 'public')

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(jsx?|css)$/.test(entry.name) ? [full] : []
  })
}

const files = walk(srcDir)
const seen = new Map()

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(/['"`](\/assets\/[^'"`\s)]+)['"`]/g)) {
    const asset = match[1]
    const rel = file.slice(root.length + 1)
    if (!seen.has(asset)) seen.set(asset, new Set())
    seen.get(asset).add(rel)
  }
}

const missing = []
for (const [asset, users] of seen) {
  const target = path.join(publicDir, decodeURIComponent(asset))
  if (!fs.existsSync(target)) missing.push({ asset, users: [...users] })
}

missing.sort((a, b) => a.asset.localeCompare(b.asset))
console.log(`checked ${seen.size} unique asset paths, missing ${missing.length}`)
for (const entry of missing) console.log(`MISSING ${entry.asset}  <- ${entry.users.join(', ')}`)
