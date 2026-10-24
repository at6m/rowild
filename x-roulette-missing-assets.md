# X-Roulette missing assets

Snapshot of `/x-roulette` taken on 2026-10-23T20:26:21.329Z against the local dev server (`http://localhost:5174`).

## Result

- The reel contained **40 limited items**; **40 of 40** had no artwork available.
- Each of those requests returned **HTTP 200 with a 266-byte placeholder SVG** (`image/svg+xml`: a dark cube on `#161722`), which is what makes the wheel look blank/grey. None of them returned an image.
- No file is missing from the repository. Every local asset the page needs (rank badges, coin icons, skull tile, default avatar, background) loads fine — the missing pictures are Roblox item thumbnails fetched at runtime.

## Why they cannot be fetched

The page renders `/api/limited-items/<assetId>/image` for every reel card. That route lives in [server/assets.js](server/assets.js#L40) and calls `sendLimitedImage()` in [server/index.js](server/index.js#L831), which:

1. asks `limitedImageData(assetId)` for the image;
2. that resolves the art through `https://thumbnails.roblox.com/v1/assets?...` (10 s timeout) and then downloads the returned CDN URL;
3. if either request throws, it responds with `LIMITED_IMAGE_PLACEHOLDER` (server/index.js#L824) instead of an error.

On this machine `thumbnails.roblox.com` resolves (`195.175.254.2`, `2a01:358:4014:a00::3`) but never completes a connection, and `https://www.roblox.com` also fails (`000`), while unrelated hosts respond normally. So every thumbnail falls through to the placeholder. Because the fallback is a `200`, DevTools shows no failed requests — only empty tiles.

The reel is re-rolled from the whole limited catalog each round, so the exact 40 items change. This list is the set that was on the wheel at the time of the audit; the same failure applies to every other catalog item, because they all go through the same route.

## Missing assets (audited reel)

| # | Item | Asset ID | Image endpoint | Response | Time |
| - | ---- | -------- | -------------- | -------- | ---- |
| 1 | ): Red Grind | `20573086` | `/api/limited-items/20573086/image` | placeholder SVG | 5654 ms |
| 2 | ): Star Tailslide | `26011378` | `/api/limited-items/26011378/image` | placeholder SVG | 10022 ms |
| 3 | A Lucky Presence | `380201576` | `/api/limited-items/380201576/image` | placeholder SVG | 9828 ms |
| 4 | Bandage | `20418682` | `/api/limited-items/20418682/image` | placeholder SVG | 5661 ms |
| 5 | Black Iron Bucket of Ultimate Pwnage | `128159108` | `/api/limited-items/128159108/image` | placeholder SVG | 92 ms |
| 6 | Blizzaria Warlock | `105341547` | `/api/limited-items/105341547/image` | placeholder SVG | 9163 ms |
| 7 | Blue Queen of the Night | `553970606` | `/api/limited-items/553970606/image` | placeholder SVG | 10017 ms |
| 8 | Blue Wistful Wink | `583721561` | `/api/limited-items/583721561/image` | placeholder SVG | 10024 ms |
| 9 | Chronoinitium: The Harbinger Helm | `124745913` | `/api/limited-items/124745913/image` | placeholder SVG | 5655 ms |
| 10 | CW Ultimate: Rose Quartz Rebellion | `228449574` | `/api/limited-items/228449574/image` | placeholder SVG | 10021 ms |
| 11 | Dark Assassin | `73791866` | `/api/limited-items/73791866/image` | placeholder SVG | 10016 ms |
| 12 | Dark Star Top Hat | `92142710` | `/api/limited-items/92142710/image` | placeholder SVG | 96 ms |
| 13 | Death Metal Headphones | `182509980` | `/api/limited-items/182509980/image` | placeholder SVG | 1214 ms |
| 14 | Dominus Astra | `162067148` | `/api/limited-items/162067148/image` | placeholder SVG | 93 ms |
| 15 | Dominus Praefectus | `527365852` | `/api/limited-items/527365852/image` | placeholder SVG | 2707 ms |
| 16 | Duke of the Fallen Federation | `1340199684` | `/api/limited-items/1340199684/image` | placeholder SVG | 18 ms |
| 17 | Eccentric Shop Teacher | `26943368` | `/api/limited-items/26943368/image` | placeholder SVG | 10023 ms |
| 18 | Emerald Ambassador | `66330060` | `/api/limited-items/66330060/image` | placeholder SVG | 10024 ms |
| 19 | Extinct Egg of Dino On Ice | `31156903` | `/api/limited-items/31156903/image` | placeholder SVG | 281 ms |
| 20 | Gold 8-Bit Headphones | `383507353` | `/api/limited-items/383507353/image` | placeholder SVG | 7996 ms |
| 21 | Golden Crown of Warlords | `1743906481` | `/api/limited-items/1743906481/image` | placeholder SVG | 4451 ms |
| 22 | Green Martian Space Helmet | `12313606` | `/api/limited-items/12313606/image` | placeholder SVG | 10015 ms |
| 23 | Karlie’s Winter Krown | `11814935276` | `/api/limited-items/11814935276/image` | placeholder SVG | 5656 ms |
| 24 | Neon Lights Bowler and Mustache | `187845483` | `/api/limited-items/187845483/image` | placeholder SVG | 10009 ms |
| 25 | Neon Pink Crazy Crown | `638087256` | `/api/limited-items/638087256/image` | placeholder SVG | 10008 ms |
| 26 | NFL Draft Chain | `9527968627` | `/api/limited-items/9527968627/image` | placeholder SVG | 6602 ms |
| 27 | Pink Galaxy Gaze | `440738448` | `/api/limited-items/440738448/image` | placeholder SVG | 10009 ms |
| 28 | Poseidon | `24533767` | `/api/limited-items/24533767/image` | placeholder SVG | 12 ms |
| 29 | Purple Ice Crown | `193696364` | `/api/limited-items/193696364/image` | placeholder SVG | 3320 ms |
| 30 | Purple Shaggy | `172309861` | `/api/limited-items/172309861/image` | placeholder SVG | 10006 ms |
| 31 | Real Flaming Hot Stunnas | `417458345` | `/api/limited-items/417458345/image` | placeholder SVG | 96 ms |
| 32 | Roblocop | `48156111` | `/api/limited-items/48156111/image` | placeholder SVG | 4453 ms |
| 33 | Scythe Sayer | `63695803` | `/api/limited-items/63695803/image` | placeholder SVG | 10005 ms |
| 34 | Sorcus' Sword of Judgement | `53623322` | `/api/limited-items/53623322/image` | placeholder SVG | 10015 ms |
| 35 | Spec Omega Biograft Energy Sword | `98411325` | `/api/limited-items/98411325/image` | placeholder SVG | 90 ms |
| 36 | The Agonizingly Ugly Bucket of Doom | `1286490` | `/api/limited-items/1286490/image` | placeholder SVG | 10020 ms |
| 37 | Vaiobot's Moneylicious Tie | `30371876` | `/api/limited-items/30371876/image` | placeholder SVG | 5659 ms |
| 38 | Vlad the Impaler, IV | `15013006` | `/api/limited-items/15013006/image` | placeholder SVG | 10019 ms |
| 39 | Wanwood Sombrero | `156105465` | `/api/limited-items/156105465/image` | placeholder SVG | 10016 ms |
| 40 | Wings of Liberty | `416832622` | `/api/limited-items/416832622/image` | placeholder SVG | 10023 ms |

## Local assets that do load

| Asset | Used for | Status |
| ----- | -------- | ------ |
| `/assets/images/skull.5e8dd863.png` | skull / losing tile | OK |
| `/assets/currency/rocoin.2d3febd5.svg`, `/assets/currency/coin.svg` | currency icons | OK |
| `/assets/rewards/legacy/coin.12f4bce8.svg` | legacy coin icon | OK |
| `/assets/users/default-avatar.png` | fallback avatar in the bets list | OK |
| `/assets/ranks/*.svg` (rust, bronze, silver, gold, diamond, emerald, ruby, admin, mod, partner) | rank badges | OK |
| `/assets/backgrounds/main.c55d6769.png` | page background | OK |
| `/assets/branding/logos/rowild.png` | header logo | OK |

## Fixing it

- On a network that can reach Roblox's thumbnail host, these URLs start returning real PNGs with no code change (each asset is cached for 24 h after the first success).
- To stop depending on Roblox entirely, store the art yourself and serve it first. Either upload the pictures to the Supabase `case-images` bucket as `items/<assetId>.png` and add that lookup at the top of `sendLimitedImage()` (the same pattern the case artwork route in [server/assets.js](server/assets.js#L12) uses), or put the images under `public/assets/` and point the reel's `image` fields at those paths.
