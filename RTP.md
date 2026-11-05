# Per-player RTP

Every game can run at a custom return-to-player rate for a single player. RTP is the
share of everything that player wagers that comes back to them over time.

- `0` — the player wagers and never receives anything back.
- `100` — the player returns exactly 100% of what they wager over time.
- `200` — the player returns double what they wager over time.
- **default** — no row, or `rtp_percent = null`. The game keeps the exact RTP it shipped
  with, so a new player is untouched until an admin says otherwise.

The rate is read when a game settles a bet, so an edit in Supabase applies to the next
bet with no redeploy and no cache to clear.

## Stored procedure

`public.rorisk_rtp_settings`

| column | meaning |
| --- | --- |
| `user_uuid` | the player, references `rorisk_users.uuid` |
| `game` | `all`, or one of `dice`, `mines`, `blackjack`, `coinflip`, `cases`, `upgrader`, `xroulette`, `battles` |
| `rtp_percent` | `0`–`200`; `null` keeps the game's original rate |
| `note` | free text for the admin |

A game-specific row overrides an `all` row. Examples:

```sql
-- This player returns 150% on every game.
insert into public.rorisk_rtp_settings (user_uuid, game, rtp_percent, note)
values ('<player uuid>', 'all', 150, 'streamer promo')
on conflict (user_uuid, game) do update
  set rtp_percent = excluded.rtp_percent, note = excluded.note;

-- ...except dice, which stays at the original rate.
insert into public.rorisk_rtp_settings (user_uuid, game, rtp_percent)
values ('<player uuid>', 'dice', null)
on conflict (user_uuid, game) do update set rtp_percent = null;

-- Back to default everywhere: delete the rows.
delete from public.rorisk_rtp_settings where user_uuid = '<player uuid>';
```

Find a player's UUID with:

```sql
select uuid, username from public.rorisk_users where username = 'someone';
```

`public.rorisk_rtp_overview` joins the two tables and shows the effective rate per row.
The table is part of the `supabase_realtime` publication, so an admin screen subscribed
to it updates the moment a value changes.

## How the rate is applied

Each game settles a payout and then scales it by `configured ÷ original`:

| game | original RTP |
| --- | --- |
| dice | 95% |
| mines | 90% |
| blackjack | 99.5% |
| coinflip | 97.5% |
| cases | computed from the case's own item table |
| upgrader | 90% |
| x-roulette | 97% |
| case battles | 97% |

So `200` pays a winning bet 2.105× a normal dice payout, `0` pays nothing, and `null`
pays exactly what the game always paid. The original rates live in
`public.rorisk_rtp_defaults`; the scaling itself is in
`public.rorisk_rtp_effective`, `public.rorisk_rtp_factor_from` and
`public.rorisk_scale_payout`.

Every settled row records the rate it used (`rtp_percent`, or `rtp_percent` on the bet
for x-roulette) so an admin can audit exactly what was applied.

Mines and blackjack capture the rate when the round starts, so a change mid-hand never
alters a hand already in progress. Dice, coinflip, cases, upgrader, x-roulette and
battles read it at settlement.

## Applying the schema

```bash
npx supabase db push --include-all
```

Or paste `supabase/migrations/20261105000000_create_rorisk_rtp.sql` into the Supabase
SQL editor.
