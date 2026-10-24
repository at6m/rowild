// Uploads item artwork into the `case-images` bucket's `items/` folder.
//
// Every PNG whose filename is a Roblox asset id (for example 21070012.png) is
// uploaded to case-images/items/21070012.png, which is the path
// /api/case-images/items/<assetId>.png reads before falling back to Roblox.
// Existing files are overwritten, so re-running after fixing an image is safe.
//
// Usage: node scripts/upload-item-images.mjs <folder> [--dry-run]
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const folderArg = args.find((arg) => !arg.startsWith('--'))

if (!folderArg) {
  console.error('Usage: node scripts/upload-item-images.mjs <folder> [--dry-run]')
  process.exit(1)
}

const folder = path.resolve(process.cwd(), folderArg)
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`Not a folder: ${folder}`)
  process.exit(1)
}

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
if (!base || !key) {
  console.error('SUPABASE_URL and a service key must be set in .env')
  process.exit(1)
}

const files = fs.readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /^\d+\.png$/i.test(name))

if (!files.length) {
  console.error(`No <assetId>.png files found in ${folder}`)
  process.exit(1)
}

const skipped = fs.readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^\d+\.(jpe?g|webp|avif)$/i.test(entry.name))
  .map((entry) => entry.name)

for (const name of skipped) console.warn(`Skipped ${name}: convert it to ${path.parse(name).name}.png first.`)

let uploaded = 0
const failures = []
for (const name of files.sort()) {
  if (dryRun) {
    console.log(`would upload ${name} -> case-images/items/${name.toLowerCase()}`)
    continue
  }
  const body = fs.readFileSync(path.join(folder, name))
  const response = await fetch(`${base}/storage/v1/object/case-images/items/${name.toLowerCase()}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
      'cache-control': 'no-cache',
    },
    body,
  })
  if (response.ok) {
    uploaded += 1
    console.log(`uploaded ${name} (${body.length} bytes)`)
  } else {
    failures.push(name)
    console.error(`failed ${name}: ${response.status} ${(await response.text()).slice(0, 200)}`)
  }
}

if (dryRun) console.log(`Dry run: ${files.length} file(s) would be uploaded.`)
else console.log(`Done: ${uploaded} uploaded, ${failures.length} failed${skipped.length ? `, ${skipped.length} skipped` : ''}.`)
if (failures.length) process.exit(1)
