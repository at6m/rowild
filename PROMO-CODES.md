# Promo codes

The Redeem tab inside the cashier (`Wallet → Redeem`) now redeems real promo codes.
Codes live in Supabase, so a new code is live the moment the row exists — no deploy or restart.

## One-time setup

Apply the migration to your Supabase project:

```bash
supabase db push
```

or paste [`supabase/migrations/20261021020000_create_rorisk_promo_codes.sql`](supabase/migrations/20261021020000_create_rorisk_promo_codes.sql)
into the Supabase SQL Editor and run it.

It creates:

| Object | Purpose |
| --- | --- |
| `public.rorisk_promo_codes` | The codes staff create. |
| `public.rorisk_promo_redemptions` | Audit log of who redeemed what and when. |
| `public.create_rorisk_promo_code(...)` | Convenience helper for creating a code with validation. |
| `public.redeem_rorisk_promo_code(user_uuid, code)` | Server-only function that credits the balance and records the redemption. |

Only the service role can read or write these tables; the browser never talks to them directly.

## Creating a code

### Option A — Supabase Table Editor (fastest)

1. Open **Table Editor → `rorisk_promo_codes` → Insert row**.
2. Fill in:

| Column | Meaning |
| --- | --- |
| `code` | What players type, 3–32 chars (`A-Z`, `0-9`, `_`, `-`). Stored uppercase; matching is case-insensitive. |
| `reward_type` | `coins` or `rocoins`. |
| `amount` | Whole number of Coins/RoCoins to grant. Must be > 0. |
| `max_redemptions` | Total redemptions allowed. Leave `null` for unlimited. |
| `per_user_limit` | Redemptions per account (default `1`). |
| `starts_at` | Defaults to now; set a future time to schedule a drop. |
| `expires_at` | Leave `null` for no expiry. |
| `active` | Set `false` to pause a code without deleting its history. |
| `note` | Internal memo (campaign, owner, reason). |

3. Save. The code is redeemable immediately.

### Option B — SQL

```sql
-- 50,000 Coins, 500 total redemptions, one per player, expires in 7 days
select public.create_rorisk_promo_code(
  'LAUNCH50K',
  'coins',
  50000,
  500,
  1,
  now(),
  now() + interval '7 days',
  'Launch campaign'
);

-- 10 RoCoins, 100 redemptions, three per player, no expiry
select public.create_rorisk_promo_code('ROCOIN10', 'rocoins', 10, 100, 3);
```

Useful follow-ups:

```sql
-- Pause a code
update public.rorisk_promo_codes set active = false where code = 'LAUNCH50K';

-- See how a code is doing
select code, reward_type, amount, redeemed_count, max_redemptions, active, expires_at
from public.rorisk_promo_codes order by created_at desc;

-- Who redeemed it
select r.code, u.username, r.amount, r.reward_type, r.redeemed_at
from public.rorisk_promo_redemptions r
join public.rorisk_users u on u.uuid = r.user_uuid
order by r.redeemed_at desc
limit 50;
```

## Redemption flow

`POST /api/promo-codes/redeem` with `{ "code": "LAUNCH50K" }`:

1. Requires the signed-in `rorisk_session` cookie; otherwise it answers
   `Please sign in to perform this action.`
2. `redeem_rorisk_promo_code` locks the code row, then checks active state,
   start/expiry window, global redemption cap and the per-user cap.
3. Credits `coins` or `rocoins` on `rorisk_users` and appends a row to
   `rorisk_promo_redemptions`, incrementing `redeemed_count`.
4. Returns the updated user, which the client applies straight to the header
   balance (the one-second session refresh in `src/App.jsx` also picks it up).

Every failure returns a player-readable message (`This promo code has expired.`,
`You have already redeemed this promo code.`, …) that the Redeem tab shows as a notification.

## Notes

- Codes are matched case-insensitively; the stored value is uppercased.
- Deleting a code removes its redemption history (`on delete cascade`). Prefer
  `active = false` so the audit trail survives.
- The Affiliate Code box on the same tab posts to the existing
  `/api/affiliates/redeem` endpoint.
