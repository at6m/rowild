# Security audit — RoRisk V2

Audit date: 2026-10-20
Scope: all 361 files in the project (Vite/React frontend, the `server/` API plugin,
`scripts/`, `supabase/migrations/`), plus the installed 137-package dependency tree.

## Verdict

**No malware.** No stealer, keylogger, RAT, dropper, persistence, or hidden command
execution. This codebase is materially more security-conscious than typical leaks.

Verified absent:

| Check | Result |
| --- | --- |
| `child_process` / `exec` / `spawn` / PowerShell / shell | none |
| `eval` / `new Function` / `vm` / dynamic code loading | none |
| base64/`atob` payloads | only `base64url` for HMAC-signed sessions and challenges |
| browser-profile, cookie-db, wallet, `.ssh`, `homedir`, `APPDATA` access | none |
| keylogging, screen capture, webcam/mic, clipboard reads | none (clipboard *writes* only, for copy buttons) |
| env/credential exfiltration | none; secrets stay behind the Vite server middleware |
| `dangerouslySetInnerHTML` / `innerHTML` / `document.write` | none |
| lockfile resolved hosts | 162/162 `registry.npmjs.org` |
| dependency install scripts | only `fsevents` (macOS watcher) |
| installed `node_modules` malicious-pattern scan | no hits |

Outbound hosts referenced by the server: `users.roblox.com`, `thumbnails.roblox.com`,
`www.roblox.com`, `www.rolimons.com`, `eos.greymass.com`, `api.hcaptcha.com`,
`api.oxapay.com`, and the configured Supabase URL. All are expected for the product.

Good security properties already present:

- Session tokens are HMAC-SHA256 signed and compared with `timingSafeEqual`
  (`server/index.js`), challenges expire after 15 minutes.
- `vite.config.js` uses `envPrefix: 'PUBLIC_CLIENT_'`, so unfprefixed server env vars
  are never exposed to the client bundle.
- `npm run build` runs `scripts/audit-production-secrets.mjs`, which fails the build if
  a Supabase service key, `RORISK_USER_SECRET` or `HCAPTCHA_SECRET` value appears in
  `dist/`, or if source maps are emitted. It passed: 274 files, no secrets, no maps.
- `.env` and `.env.*` are gitignored; `.env.example` ships empty placeholders only.
- `npm audit --omit=dev`: **0 vulnerabilities**. Two high-severity advisories exist in
  dev-only build tooling (`npm audit fix` available).

## Runtime status

`npm ci` + `npm run dev` boots cleanly (Vite 8, port 5174 in this run). With no `.env`:

- Frontend fully renders: home, sidebar, banners, games grid, live bets, chat panel,
  rain pool, footer; Sign In modal, Dice and Coinflip pages render and are interactive.
- `GET /api/bets` returns `200 {"games":[]}` (intentional empty fallback).
- Data-backed endpoints return `503` ("temporarily unavailable") because Supabase is
  not configured: `/api/coinflip/games`, `/api/cases` (400).
- Chat rain falls back to in-memory state, as logged on startup.

Nothing in the code prevents the site from running; the missing piece is external
configuration (Supabase project + migrations, OxaPay keys, hCaptcha keys).

## Non-malicious issues worth knowing

- `npm run lint` fails with 6 errors in `src/Pages/Coinflip.jsx` (`react-hooks/refs`:
  refs read during render, plus one "impure function during render") and 2
  `exhaustive-deps` warnings in `Mines.jsx` / `Blackjack.jsx`. Build and runtime are
  unaffected, but the rules-of-hooks violations can cause stale animation timing.
- The dev server binds `0.0.0.0` and the API is served through it, so on a shared
  network the site (and sign-in endpoints) is reachable from other devices.
  `allowedHosts` pins the production host but Vite does not restrict LAN IPs.
- OAuth callback origins are derived from `request.headers.host` in `server/auth.js`
  and `server/index.js`; host-header injection is mitigated by Supabase's redirect
  allowlist but worth pinning to a configured base URL.
- The project is a leaked replica of a third-party site; the repo README itself states
  it was published to harm the original operator. Treat the code as untrusted in
  provenance even though it is not malicious code.
