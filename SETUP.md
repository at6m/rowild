# RoRisk V2 — step-by-step setup

The UI runs today with no configuration. Everything data-backed (accounts, games,
cases, chat persistence, payments) needs a Supabase project plus its 46 SQL migrations.
`RORISK_USER_SECRET` in `.env` is already generated for you.

Never commit `.env`; it is gitignored. **Do not paste the service-role key into chat** —
put it in `.env` only.

## 1. Create the Supabase project (5 min)

1. Sign in at <https://supabase.com/dashboard> → **New project**.
2. Pick an organization, name it `rorisk-dev`, choose the region closest to you, and
   save the **database password** somewhere safe (the CLI needs it in step 3).
3. Wait until the project status shows **Active** (~2 minutes).

## 2. Copy three values into `.env`

In the project: **Project Settings → API**.

| Supabase field | `.env` variable |
| --- | --- |
| Project URL (`https://xxxx.supabase.co`) | `SUPABASE_URL` |
| `service_role` secret key | `SUPABASE_SERVICE_ROLE_KEY` (server only) |
| new-style secret key (`sb_secret_...`), if shown | `SUPABASE_SECRET_KEY` |

Either key column works — the server accepts both and prefers `SUPABASE_SECRET_KEY`.
The service-role key bypasses row-level security; it must never reach the browser
(the project's own build audit enforces this).

## 3. Apply the 46 migrations

Recommended (no Docker required):

```bash
cd C:/Users/akusl/Downloads/RoRisk-V2-main
npx supabase login                       # opens the browser once
npx supabase link --project-ref <project-ref>   # ref is in the dashboard URL
npx supabase db push --include-all       # asks for the DB password
npx supabase migration list              # every migration should show under "remote"
```

Alternative: open **SQL Editor** and paste the files from `supabase/migrations/` one at
a time, oldest filename first (they are timestamp-prefixed).

This creates the `rorisk_*` tables, the `case-images` / `casino-images` storage buckets,
the seeded casino games, the welcome case, profile-sync triggers, and the promo-code
tables used by the Redeem tab (see [PROMO-CODES.md](PROMO-CODES.md) for creating codes).

## 4. Configure Supabase Auth

**Authentication → URL Configuration**:

- Site URL: `http://localhost:5174` (use 5173 if you run on Vite's default port)
- Redirect URLs: `http://localhost:5174/**` and `http://localhost:5174/recover`

**Authentication → Providers**:

- Email: enabled (needed for Sign In / Register / password reset).
- Google (optional): enable it, then add a Google OAuth client ID/secret. The app's
  Google button redirects through `/api/auth/google/start` → Supabase
  `/auth/v1/authorize`.

## 5. hCaptcha (required for Roblox account linking)

1. Create a site at <https://dashboard.hcaptcha.com>.
2. Add `localhost` as an allowed domain.
3. Put the **site key** in `HCAPTCHA_SITE_KEY` and the **secret** in `HCAPTCHA_SECRET`.
4. For a throwaway dev setup you can use hCaptcha's public test keys:
   site key `10000000-ffff-ffff-ffff-000000000001`,
   secret `0x0000000000000000000000000000000000000000`.

The frontend reads the site key from `GET /api/auth/config`, so no rebuild is needed
after changing it.

Roblox lookups run from the server, not the browser. On networks where Roblox is filtered
the first connection can take 20-30s while the TCP handshake is retried; the server keeps
that connection alive so later steps are fast. If `curl https://users.roblox.com/v1/users/1`
times out on the machine running the server, Roblox linking cannot work there at all.

## 6. NOWPayments (every crypto deposit and withdrawal)

1. Create a merchant account at <https://account.nowpayments.io> and finish verification.
2. **Settings → API keys**: create a key and copy it into `NOWPAYMENTS_API_KEY`. The key only needs
   payment permission — payouts are sent by hand (see section 7), so no payout key, dashboard
   password or 2FA seed belongs in this project.
3. **Store settings → IPN**: copy the IPN secret key into `NOWPAYMENTS_IPN_SECRET`. Every callback
   is rejected unless its `x-nowpayments-sig` header matches this secret.
4. Set `NOWPAYMENTS_IPN_BASE_URL` to the **public HTTPS origin** of the site, e.g.
   `https://rowild.lol`. NOWPayments posts to `<origin>/api/payments/nowpayments/ipn`. On localhost
   that URL is unreachable, so expose the dev server while testing
   (`cloudflared tunnel --url http://localhost:5174`) and use the tunnel origin. Without it the
   cashier still works — the deposit screen polls the provider directly — but confirmations arrive
   late.
5. Restart the server. `GET /api/payments/nowpayments/config` should report `enabled: true` and the
   coin tiles your account can accept.

How deposits work: `POST /api/payments/nowpayments/deposit` asks NOWPayments for one payment in the
chosen coin, stores the returned address, exact crypto amount, memo/tag and expiry against the
user, and the cashier renders that address with a QR code. The modal polls
`GET /api/payments/nowpayments/deposit/<payment_id>` every five seconds, and the IPN webhook posts
to `/api/payments/nowpayments/ipn`; both paths call the same idempotent
`finalize_rorisk_crypto_deposit` RPC, so a deposit is credited exactly once, whichever arrives first.
Statuses map as: `waiting`/`confirming` → pending, `confirmed`/`sending`/`finished` → paid and
credited, `partially_paid` stays pending for a manual top-up, and `failed`/`refunded`/`expired` are
shown in the transaction history without crediting anything.

Minimum amounts come from NOWPayments (`/v1/min-amount`) because they move with network fees: a
deposit below the minimum is refused before an address is created, with the exact figure in the
message. The cashier's $1 floor (100 Coins) is only the site-side minimum.

Tiles map to NOWPayments currency codes: BTC, ETH, SOL, LTC, USDT (TRC-20, falling back to ERC-20 /
SOL / BEP-20), USDC (SOL / BEP-20 / Polygon / ERC-20), BNB (BEP-20), TRX and XMR. A tile whose code
your account does not support reports "not configured" instead of creating a broken payment.

## 7. Crypto withdrawals (manual payouts)

A withdrawal request reserves the Coins immediately (the balance can never be spent twice) and
creates a `pending` row in `rorisk_crypto_withdrawals`; nothing is sent automatically. To settle
requests, list what is waiting:

```bash
node scripts/payout.mjs
```

Send each withdrawal from the NOWPayments dashboard (**Payouts → single payout**) to the address
and amount shown, then record it so the history leaves "pending":

```bash
node scripts/payout.mjs <uuid> paid <transaction_hash>
node scripts/payout.mjs <uuid> failed "reason"   # cancels and refunds the Coins
```

Pending and confirmed deposits and withdrawals appear in the profile dropdown under
**Transactions** (read from the crypto ledger through `GET /api/transactions`).

## 8. Live Bets simulation (cosmetic)

The homepage Live Bets panel would otherwise sit empty whenever real players are quiet, so the
server keeps a cosmetic feed going from 20 profile rows — `boun`, `gucci8008`, `roadto2k1day`,
`Mbrohio`, `sweripper`, `rira`, `towa`, `tape`, `mentaltwo`, `faithless`, `luca2xp`, `limbo`,
`kami`, `dripp`, `hidice`, `ares`, `shanee`, `BrainW`, `cryyan`, `WFU`. They are ordinary rows in
`rorisk_users` with no email and no Roblox link, so they cannot sign in.

One bet appears every **5–30 seconds**, picked from dice, mines, blackjack and cases. Amounts are
50–1250 Coins ending in 0, 5 or 1; case bets use the real case price instead. Multipliers come
from the real payout tables (dice `0.95 * 10000 / tickets`, the mines curve, blackjack
`0 / 1 / 2 / 2.5`, cases item value ÷ case price), so nothing impossible is ever shown.

Nothing is written to a game table, no balance moves and no seed is consumed: the feed lives in
the server process and is merged into `GET /api/bets` with the real bets. Restarting the server
re-seeds it with a short backlog. Set `LIVE_BETS_SIMULATION=off` to disable it and show only real
activity.

## 9. Restart and verify

```bash
npm run dev        # http://localhost:5173
```

Expected after configuration:

- `GET /api/auth/config` returns your hCaptcha site key.
- `GET /api/coinflip/games` and `/api/cases` return `200` instead of `503`/`400`.
- Register with an email, then the Roblox verification modal generates a phrase to paste
  into your Roblox profile blurb.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `This service is temporarily unavailable` | `SUPABASE_URL` or keys still empty, or migrations not applied |
| `relation ... does not exist` | migration set incomplete — rerun `npx supabase db push --include-all` |
| `Authentication is temporarily unavailable` | missing Supabase service key |
| Roblox verification fails | hCaptcha keys missing/incorrect, or the code was not saved to the Roblox profile |
| `This service is temporarily unavailable` when linking Roblox | the server cannot open a connection to Roblox (`users.roblox.com`, `www.roblox.com`, `thumbnails.roblox.com`) — ISP filtering, a VPN the Roblox edge refuses, or a firewall. The server now waits up to 30s for the first cold connection and reports the network problem instead. Test with `curl -m 30 https://users.roblox.com/v1/users/1` |
| Deposit says payments are not configured | `NOWPAYMENTS_API_KEY` is empty, or the coin tile's currency code is not enabled on that account — check `GET /api/payments/nowpayments/config` |
| Deposit pays out but Coins never arrive | `NOWPAYMENTS_IPN_SECRET` or `NOWPAYMENTS_IPN_BASE_URL` is wrong, so callbacks are rejected; the cashier's five-second poll still credits it while the modal is open — compare the provider's payment status with the row in `rorisk_crypto_deposits` |
| Deposit refused with "minimum ... deposit is $X" | NOWPayments' live minimum for that coin is above the requested amount (network fees); deposit more or pick another coin |
| Withdrawal stays pending forever | payouts are manual: send it in the dashboard, then `node scripts/payout.mjs <uuid> paid <txid>` |
| `supabase link` asks for a password you lost | reset it in **Project Settings → Database** |
| Item thumbnails show a blank grey box | `thumbnails.roblox.com` is unreachable from your network (ISP DNS filtering or an offline machine) — the server now falls back to a placeholder |
| `npm run dev` exits with `DEPTH_ZERO_SELF_SIGNED_CERT` / `fetch failed` | fixed: an unreachable Roblox thumbnail host used to become an unhandled promise rejection. If it happens again, check `thumbnails.roblox.com` resolves to a real Roblox IP |
| Casino/case images 503 or grey item boxes | the `casino-images` and `case-images` storage buckets are empty by design — upload your art to them in Supabase → Storage. Item art uses `case-images/items/<assetId>.png`; run `node scripts/report-missing-case-images.mjs` to regenerate the upload checklist in [MISSING-CASE-IMAGES.md](MISSING-CASE-IMAGES.md) |
