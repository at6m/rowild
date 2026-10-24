// Inventories case and item artwork stored in the `case-images` Supabase bucket.
//
// Items are served from /api/case-images/items/<assetId>.png. The server prefers
// a file in the bucket and only then falls back to the Roblox thumbnail, so this
// lists every item that still has no uploaded artwork. No Roblox calls are made.
//
// Usage: node scripts/report-missing-case-images.mjs [output.md]
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)

const base = env.SUPABASE_URL.replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function listFolder(prefix) {
  const names = new Set()
  for (let offset = 0; offset < 5000; offset += 1000) {
    const response = await fetch(`${base}/storage/v1/object/list/case-images`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!response.ok) throw new Error(`Could not list ${prefix}: ${response.status} ${await response.text()}`)
    const rows = await response.json()
    for (const row of rows) names.add(row.name)
    if (rows.length < 1000) break
  }
  return names
}

const [itemFiles, mainFiles] = await Promise.all([listFolder('items'), listFolder('main')])

const response = await fetch(`${base}/rest/v1/rorisk_cases?select=case_id,name,image_url,active,sort_order,items&order=sort_order`, { headers })
if (!response.ok) throw new Error(`Could not load cases: ${response.status} ${await response.text()}`)
const cases = await response.json()

const perCase = []
const covers = []
const assets = new Map()

for (const entry of cases) {
  const items = Array.isArray(entry.items) ? entry.items : []
  const caseRows = []
  for (const item of items) {
    const match = String(item?.image || '').match(/\/api\/case-images\/items\/(\d+)\.png/)
    const assetId = Number(match?.[1] || item?.assetId || item?.itemId)
    if (!Number.isSafeInteger(assetId) || assetId <= 0) continue
    const hasArtwork = itemFiles.has(`${assetId}.png`)
    caseRows.push({ assetId, itemName: String(item?.name || `Asset ${assetId}`).trim(), hasArtwork })
    const known = assets.get(assetId)
    if (known) known.cases.add(entry.name)
    else assets.set(assetId, { assetId, itemName: String(item?.name || `Asset ${assetId}`).trim(), cases: new Set([entry.name]), hasArtwork })
  }
  perCase.push({ name: entry.name, active: entry.active, rows: caseRows })

  const cover = String(entry.image_url || '')
  if (cover.startsWith('/api/case-images/main/')) {
    // Case covers carry a ?v= cache-busting suffix that is not part of the object name.
    const objectPath = cover.slice('/api/case-images/'.length).split('?')[0]
    if (!mainFiles.has(objectPath.split('/').pop())) covers.push({ caseName: entry.name, objectPath })
  }
}

const missingAssets = [...assets.values()].filter((asset) => !asset.hasArtwork).sort((first, second) => first.itemName.localeCompare(second.itemName))
const missingSlots = perCase.reduce((total, entry) => total + entry.rows.filter((row) => !row.hasArtwork).length, 0)

const lines = []
lines.push('# Case artwork audit')
lines.push('')
lines.push(`Generated ${new Date().toISOString().slice(0, 10)} • ${cases.length} cases • ${assets.size} unique item assets.`)
lines.push('')
lines.push(`- Item assets with no uploaded artwork: **${missingAssets.length}** (${missingSlots} item slots across all cases).`)
lines.push(`- Case cover images missing from storage: **${covers.length}**.`)
lines.push('')
lines.push('## How to add the artwork')
lines.push('')
lines.push('1. Supabase dashboard → **Storage** → bucket `case-images` → **New folder** named `items` (the `main` folder exists already; `items` does not yet, and a folder only appears once it holds a file).')
lines.push('2. Upload a square PNG named exactly `<assetId>.png` (for example `21070012.png`). The full object path becomes `case-images/items/21070012.png`.')
lines.push('   Do not create a second bucket — `items` is a folder inside the existing `case-images` bucket, next to `main`.')
lines.push('3. Case covers go to the same bucket’s `main` folder with the filename listed below.')
lines.push('4. No redeploy and no database change is needed — the server now serves an uploaded file first and only falls back to the Roblox thumbnail when the file is absent.')
lines.push('5. Bulk upload instead of the dashboard: `node scripts/upload-item-images.mjs <folder>` uploads every `<assetId>.png` in that folder to `case-images/items/` (add `--dry-run` to preview).')
lines.push('')
lines.push('## Missing case cover images')
lines.push('')
if (!covers.length) {
  lines.push('None — every `/api/case-images/main/...` cover already exists in storage.')
} else {
  lines.push('| Case | File | Upload to |')
  lines.push('| --- | --- | --- |')
  for (const cover of covers) {
    lines.push(`| ${cover.caseName} | \`${cover.objectPath.split('/').pop()}\` | \`case-images/${cover.objectPath}\` |`)
  }
}
lines.push('')
lines.push('## Missing item artwork by case')
lines.push('')
for (const entry of perCase) {
  const missing = entry.rows.filter((row) => !row.hasArtwork)
  if (!missing.length) continue
  lines.push(`### ${entry.name}${entry.active ? '' : ' (inactive)'} — ${missing.length} of ${entry.rows.length} items need artwork`)
  lines.push('')
  lines.push('| Item | Asset ID | File | Upload to |')
  lines.push('| --- | --- | --- | --- |')
  for (const row of missing) {
    lines.push(`| ${row.itemName} | ${row.assetId} | \`${row.assetId}.png\` | \`case-images/items/${row.assetId}.png\` |`)
  }
  lines.push('')
}
lines.push('## Unique asset IDs')
lines.push('')
lines.push('Upload these once even when several cases share them.')
lines.push('')
lines.push('| Asset ID | Item | Cases |')
lines.push('| --- | --- | --- |')
for (const asset of missingAssets) {
  lines.push(`| ${asset.assetId} | ${asset.itemName} | ${[...asset.cases].join(', ')} |`)
}
lines.push('')

const outputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, 'MISSING-CASE-IMAGES.md')
fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`Wrote ${path.relative(root, outputPath)}: ${missingAssets.length} unique assets, ${missingSlots} item slots, ${covers.length} covers.`)
