# Case artwork audit

Generated 2026-10-21 • 22 cases • 127 unique item assets.

- Item assets with no uploaded artwork: **127** (131 item slots across all cases).
- Case cover images missing from storage: **0**.

## How to add the artwork

1. Supabase dashboard → **Storage** → bucket `case-images` → **New folder** named `items` (the `main` folder exists already; `items` does not yet, and a folder only appears once it holds a file).
2. Upload a square PNG named exactly `<assetId>.png` (for example `21070012.png`). The full object path becomes `case-images/items/21070012.png`.
   Do not create a second bucket — `items` is a folder inside the existing `case-images` bucket, next to `main`.
3. Case covers go to the same bucket’s `main` folder with the filename listed below.
4. No redeploy and no database change is needed — the server now serves an uploaded file first and only falls back to the Roblox thumbnail when the file is absent.
5. Bulk upload instead of the dashboard: `node scripts/upload-item-images.mjs <folder>` uploads every `<assetId>.png` in that folder to `case-images/items/` (add `--dry-run` to preview).

## Missing case cover images

None — every `/api/case-images/main/...` cover already exists in storage.

## Missing item artwork by case

### Welcome Chicken — 2 of 2 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Telamon's Chicken Suit | 24112667 | `24112667.png` | `case-images/items/24112667.png` |
| Fried Chicken Egg | 4786883113 | `4786883113.png` | `case-images/items/4786883113.png` |

### Dominus Delight — 7 of 7 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Dominus Empyreus | 21070012 | `21070012.png` | `case-images/items/21070012.png` |
| Dominus Infernus | 31101391 | `31101391.png` | `case-images/items/31101391.png` |
| Dominus Aureus | 138932314 | `138932314.png` | `case-images/items/138932314.png` |
| DIY Dominus Empyreus | 151789690 | `151789690.png` | `case-images/items/151789690.png` |
| Dominus Formidulosus | 4255053867 | `4255053867.png` | `case-images/items/4255053867.png` |
| Dominus Praefectus | 527365852 | `527365852.png` | `case-images/items/527365852.png` |
| Dominus Vespertilio | 96103379 | `96103379.png` | `case-images/items/96103379.png` |

### Headphone Fiasco — 12 of 12 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| WC Ultimates: Aquamarine Attitude | 323417812 | `323417812.png` | `case-images/items/323417812.png` |
| WC Ultimates: Pink Diamond Distraction | 315549204 | `315549204.png` | `case-images/items/315549204.png` |
| CW Ultimate: Ruby Rapture | 583635712 | `583635712.png` | `case-images/items/583635712.png` |
| WC Ultimates: Citrine Celebration | 1191152570 | `1191152570.png` | `case-images/items/1191152570.png` |
| WC Ultimates - Garnet Gratitude | 2566024668 | `2566024668.png` | `case-images/items/2566024668.png` |
| CW Ultimate: Amethyst Addiction | 188004500 | `188004500.png` | `case-images/items/188004500.png` |
| CW Ultimate: Sapphire Serenity | 188888052 | `188888052.png` | `case-images/items/188888052.png` |
| WC Ultimates: Sugilite Satisfaction | 878908562 | `878908562.png` | `case-images/items/878908562.png` |
| WC Ultimates: Peridot Panic | 553858732 | `553858732.png` | `case-images/items/553858732.png` |
| CW Ultimate: Rose Quartz Rebellion | 228449574 | `228449574.png` | `case-images/items/228449574.png` |
| CW Ultimate: Wulfinite Will | 286524947 | `286524947.png` | `case-images/items/286524947.png` |
| Recycled Cardboard Headphones | 154415221 | `154415221.png` | `case-images/items/154415221.png` |

### Purple Haze — 7 of 7 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Dominus Empyreus | 21070012 | `21070012.png` | `case-images/items/21070012.png` |
| Purple Sparkle Time Fedora | 63043890 | `63043890.png` | `case-images/items/63043890.png` |
| Bling $$ Necklace | 33171947 | `33171947.png` | `case-images/items/33171947.png` |
| Purple Queen of the Night | 553971858 | `553971858.png` | `case-images/items/553971858.png` |
| Purple Crystal Circlet | 151327351 | `151327351.png` | `case-images/items/151327351.png` |
| White Ninja Headband of the Unimpeachable Soul | 11297746 | `11297746.png` | `case-images/items/11297746.png` |
| Purple Bubble Trouble | 362051999 | `362051999.png` | `case-images/items/362051999.png` |

### Valkyrie Vault — 5 of 5 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Ice Valkyrie | 4390891467 | `4390891467.png` | `case-images/items/4390891467.png` |
| Valkyrie Helm | 1365767 | `1365767.png` | `case-images/items/1365767.png` |
| Blackvalk Shades | 175134718 | `175134718.png` | `case-images/items/175134718.png` |
| Emerald Valk Shades | 3210243135 | `3210243135.png` | `case-images/items/3210243135.png` |
| Valkyrie 3000 | 74214775 | `74214775.png` | `case-images/items/74214775.png` |

### Rainbow Rush — 5 of 5 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Rainbow Shaggy | 64082730 | `64082730.png` | `case-images/items/64082730.png` |
| Rainbowrath: The Avenger | 346686597 | `346686597.png` | `case-images/items/346686597.png` |
| Rainbow Periastron Omega | 159229806 | `159229806.png` | `case-images/items/159229806.png` |
| Rainbow Fedora | 82332012 | `82332012.png` | `case-images/items/82332012.png` |
| Rainbow Pixels Bandana | 3267569146 | `3267569146.png` | `case-images/items/3267569146.png` |

### Golden Ticket — 4 of 4 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Tix Shaggy | 382881373 | `382881373.png` | `case-images/items/382881373.png` |
| Tixvalk | 382881237 | `382881237.png` | `case-images/items/382881237.png` |
| Lord of the Tixeration | 382880833 | `382880833.png` | `case-images/items/382880833.png` |
| Tixsplosion | 6512277 | `6512277.png` | `case-images/items/6512277.png` |

### Ice Prince — 3 of 3 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Diademed Barbarian Prince | 18821202 | `18821202.png` | `case-images/items/18821202.png` |
| Pretty Pretty Princess | 53039427 | `53039427.png` | `case-images/items/53039427.png` |
| Princess Hat | 1032641 | `1032641.png` | `case-images/items/1032641.png` |

### Deviled Egg — 2 of 2 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Deviled Egg | 110706148 | `110706148.png` | `case-images/items/110706148.png` |
| Terrordactyl Egg | 76692790 | `76692790.png` | `case-images/items/76692790.png` |

### Cryptic Commando — 3 of 3 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Virtual Commando | 362081769 | `362081769.png` | `case-images/items/362081769.png` |
| Virtual BLOXcon Headphones | 130106467 | `130106467.png` | `case-images/items/130106467.png` |
| Black Cat Scarf | 1609384691 | `1609384691.png` | `case-images/items/1609384691.png` |

### Dual Wield — 6 of 6 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Dual Illumina | 101191388 | `101191388.png` | `case-images/items/101191388.png` |
| Illumina | 16641274 | `16641274.png` | `case-images/items/16641274.png` |
| WC Ultimates: Aquamarine Attitude | 323417812 | `323417812.png` | `case-images/items/323417812.png` |
| Windforce | 77443704 | `77443704.png` | `case-images/items/77443704.png` |
| Crazy Glasses | 16646369 | `16646369.png` | `case-images/items/16646369.png` |
| Icicles Swordpack | 1229962410 | `1229962410.png` | `case-images/items/1229962410.png` |

### Green Machine — 5 of 5 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Merely's Green Sparkle Time Hoverboard | 215392741 | `215392741.png` | `case-images/items/215392741.png` |
| Treehugger Visor | 9910514 | `9910514.png` | `case-images/items/9910514.png` |
| Spec Alpha Biograft Energy Sword | 11999235 | `11999235.png` | `case-images/items/11999235.png` |
| Earth Day 2011 Tie | 50430337 | `50430337.png` | `case-images/items/50430337.png` |
| Earth Day 2010 Cap | 25977727 | `25977727.png` | `case-images/items/25977727.png` |

### Pink Panther — 6 of 6 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Pink Sparkle Time Fedora | 334663683 | `334663683.png` | `case-images/items/334663683.png` |
| Neon Pink Crazy Crown | 638087256 | `638087256.png` | `case-images/items/638087256.png` |
| Windforce | 77443704 | `77443704.png` | `case-images/items/77443704.png` |
| Neon Pink Top Hat | 376806474 | `376806474.png` | `case-images/items/376806474.png` |
| Merely's Pink Sparkle Time Hoverboard | 456226536 | `456226536.png` | `case-images/items/456226536.png` |
| Violently Pink Egg of Violent Opinions | 24826771 | `24826771.png` | `case-images/items/24826771.png` |

### Hell's Halo — 7 of 7 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Red Crown of Ozymandias | 9465511 | `9465511.png` | `case-images/items/9465511.png` |
| Ruby Crystal Circlet | 323476069 | `323476069.png` | `case-images/items/323476069.png` |
| Crimson Shaggy | 293316320 | `293316320.png` | `case-images/items/293316320.png` |
| 8-Bit HP Bar | 10159610478 | `10159610478.png` | `case-images/items/10159610478.png` |
| Crimson Evil Eye | 1016184756 | `1016184756.png` | `case-images/items/1016184756.png` |
| Dark Crimson Egg of Nemesis | 27398610 | `27398610.png` | `case-images/items/27398610.png` |
| Fiery Egg of Egg Testing | 27345567 | `27345567.png` | `case-images/items/27345567.png` |

### Violet Void — 4 of 4 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Gucci Spiked Basketball Bag | 6803400584 | `6803400584.png` | `case-images/items/6803400584.png` |
| Brown Gucci Blondie Bag (3.0) | 9731869178 | `9731869178.png` | `case-images/items/9731869178.png` |
| Gucci GG Marmont Bag | 6803403781 | `6803403781.png` | `case-images/items/6803403781.png` |
| Gucci Geometric Bag | 6803398976 | `6803398976.png` | `case-images/items/6803398976.png` |

### Royal Federation — 9 of 9 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Lord of the Federation | 88885069 | `88885069.png` | `case-images/items/88885069.png` |
| Archduke of the Federation | 293316452 | `293316452.png` | `case-images/items/293316452.png` |
| Lady of the Federation | 207207782 | `207207782.png` | `case-images/items/207207782.png` |
| Duchess of the Federation | 439984665 | `439984665.png` | `case-images/items/439984665.png` |
| Archduchess of the Federation | 878889105 | `878889105.png` | `case-images/items/878889105.png` |
| Earl of the Federation | 146134358 | `146134358.png` | `case-images/items/146134358.png` |
| Emerald Starstone of the Federation | 1513251995 | `1513251995.png` | `case-images/items/1513251995.png` |
| Sapphire Starstone of the Federation | 1744246930 | `1744246930.png` | `case-images/items/1744246930.png` |
| Disgraced Starstone of the Federation | 4390888537 | `4390888537.png` | `case-images/items/4390888537.png` |

### Black Knight — 6 of 6 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Darkheart | 16895215 | `16895215.png` | `case-images/items/16895215.png` |
| A Dark Presence | 20908915 | `20908915.png` | `case-images/items/20908915.png` |
| Dark Assassin | 73791866 | `73791866.png` | `case-images/items/73791866.png` |
| Dark Spellbook of the Forgotten | 56561579 | `56561579.png` | `case-images/items/56561579.png` |
| Dark Lord | 68358679 | `68358679.png` | `case-images/items/68358679.png` |
| Egg of All-Devouring Darkness | 76692291 | `76692291.png` | `case-images/items/76692291.png` |

### Eureka Gold — 7 of 7 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Dominus Aureus | 138932314 | `138932314.png` | `case-images/items/138932314.png` |
| Golden Antlers | 193659065 | `193659065.png` | `case-images/items/193659065.png` |
| Domino Crown | 1031429 | `1031429.png` | `case-images/items/1031429.png` |
| Gold King of the Night | 439945864 | `439945864.png` | `case-images/items/439945864.png` |
| Golden Fabergé Egg of Hivemind | 31149244 | `31149244.png` | `case-images/items/31149244.png` |
| Gold ROBLOX Music Video Award | 8795521 | `8795521.png` | `case-images/items/8795521.png` |
| Golden Teapot of Pwnage | 1594180 | `1594180.png` | `case-images/items/1594180.png` |

### Emerald Cyclops — 5 of 5 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Emerald Crystal Circlet | 74939231 | `74939231.png` | `case-images/items/74939231.png` |
| Emerald Eye | 1185264 | `1185264.png` | `case-images/items/1185264.png` |
| Emerald Evil Eye | 1016185535 | `1016185535.png` | `case-images/items/1016185535.png` |
| Shinestone Eyes: Emerald Extreme | 553726283 | `553726283.png` | `case-images/items/553726283.png` |
| Emerald Gucci Blondie Bag (3.0) | 9838318899 | `9838318899.png` | `case-images/items/9838318899.png` |

### Royal Red — 6 of 6 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Duke of the Federation | 128158708 | `128158708.png` | `case-images/items/128158708.png` |
| Duke of the Fallen Federation | 1340199684 | `1340199684.png` | `case-images/items/1340199684.png` |
| Red Void Star | 1191135761 | `1191135761.png` | `case-images/items/1191135761.png` |
| Red Tango | 16652251 | `16652251.png` | `case-images/items/16652251.png` |
| Fool of the Federation | 402303179 | `402303179.png` | `case-images/items/402303179.png` |
| Agonizingly Red Bucket of Cheer | 102605392 | `102605392.png` | `case-images/items/102605392.png` |

### Super Kawaii — 7 of 7 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Super Super Happy Face | 494291269 | `494291269.png` | `case-images/items/494291269.png` |
| Purple Super Happy Joy | 376812961 | `376812961.png` | `case-images/items/376812961.png` |
| Green Super Happy Joy | 323191596 | `323191596.png` | `case-images/items/323191596.png` |
| So Super Excited - Purple | 2568804274 | `2568804274.png` | `case-images/items/2568804274.png` |
| So Super Excited - Blue | 2569001052 | `2569001052.png` | `case-images/items/2569001052.png` |
| So Super Excited - Pink | 2568801198 | `2568801198.png` | `case-images/items/2568801198.png` |
| Flower Power | 17138062 | `17138062.png` | `case-images/items/17138062.png` |

### King Seer — 13 of 13 items need artwork

| Item | Asset ID | File | Upload to |
| --- | --- | --- | --- |
| Overseer Overlord | 286511038 | `286511038.png` | `case-images/items/286511038.png` |
| Overseer Short Sword | 156467990 | `156467990.png` | `case-images/items/156467990.png` |
| Overseer Armor Pauldrons | 357832740 | `357832740.png` | `case-images/items/357832740.png` |
| Overseer's Axe | 127506324 | `127506324.png` | `case-images/items/127506324.png` |
| Overseer Warlord's Sword | 483308034 | `483308034.png` | `case-images/items/483308034.png` |
| Overseer Guardia | 553720598 | `553720598.png` | `case-images/items/553720598.png` |
| Overseer Hooded Cloak | 286511631 | `286511631.png` | `case-images/items/286511631.png` |
| Crown Of the Overseer Overlord | 1320952795 | `1320952795.png` | `case-images/items/1320952795.png` |
| Overseer Wings of Terror | 1587175771 | `1587175771.png` | `case-images/items/1587175771.png` |
| Overseer Overload Headphones | 928819079 | `928819079.png` | `case-images/items/928819079.png` |
| Major Overseer | 153558902 | `153558902.png` | `case-images/items/153558902.png` |
| Overseer's Eye | 82665932 | `82665932.png` | `case-images/items/82665932.png` |
| Overseer All-Seeing Pendant | 483306493 | `483306493.png` | `case-images/items/483306493.png` |

## Unique asset IDs

Upload these once even when several cases share them.

| Asset ID | Item | Cases |
| --- | --- | --- |
| 10159610478 | 8-Bit HP Bar | Hell's Halo |
| 20908915 | A Dark Presence | Black Knight |
| 102605392 | Agonizingly Red Bucket of Cheer | Royal Red |
| 878889105 | Archduchess of the Federation | Royal Federation |
| 293316452 | Archduke of the Federation | Royal Federation |
| 1609384691 | Black Cat Scarf | Cryptic Commando |
| 175134718 | Blackvalk Shades | Valkyrie Vault |
| 33171947 | Bling $$ Necklace | Purple Haze |
| 9731869178 | Brown Gucci Blondie Bag (3.0) | Violet Void |
| 16646369 | Crazy Glasses | Dual Wield |
| 1016184756 | Crimson Evil Eye | Hell's Halo |
| 293316320 | Crimson Shaggy | Hell's Halo |
| 1320952795 | Crown Of the Overseer Overlord | King Seer |
| 188004500 | CW Ultimate: Amethyst Addiction | Headphone Fiasco |
| 228449574 | CW Ultimate: Rose Quartz Rebellion | Headphone Fiasco |
| 583635712 | CW Ultimate: Ruby Rapture | Headphone Fiasco |
| 188888052 | CW Ultimate: Sapphire Serenity | Headphone Fiasco |
| 286524947 | CW Ultimate: Wulfinite Will | Headphone Fiasco |
| 73791866 | Dark Assassin | Black Knight |
| 27398610 | Dark Crimson Egg of Nemesis | Hell's Halo |
| 68358679 | Dark Lord | Black Knight |
| 56561579 | Dark Spellbook of the Forgotten | Black Knight |
| 16895215 | Darkheart | Black Knight |
| 110706148 | Deviled Egg | Deviled Egg |
| 151789690 | DIY Dominus Empyreus | Dominus Delight |
| 18821202 | Diademed Barbarian Prince | Ice Prince |
| 4390888537 | Disgraced Starstone of the Federation | Royal Federation |
| 1031429 | Domino Crown | Eureka Gold |
| 138932314 | Dominus Aureus | Dominus Delight, Eureka Gold |
| 21070012 | Dominus Empyreus | Dominus Delight, Purple Haze |
| 4255053867 | Dominus Formidulosus | Dominus Delight |
| 31101391 | Dominus Infernus | Dominus Delight |
| 527365852 | Dominus Praefectus | Dominus Delight |
| 96103379 | Dominus Vespertilio | Dominus Delight |
| 101191388 | Dual Illumina | Dual Wield |
| 439984665 | Duchess of the Federation | Royal Federation |
| 1340199684 | Duke of the Fallen Federation | Royal Red |
| 128158708 | Duke of the Federation | Royal Red |
| 146134358 | Earl of the Federation | Royal Federation |
| 25977727 | Earth Day 2010 Cap | Green Machine |
| 50430337 | Earth Day 2011 Tie | Green Machine |
| 76692291 | Egg of All-Devouring Darkness | Black Knight |
| 74939231 | Emerald Crystal Circlet | Emerald Cyclops |
| 1016185535 | Emerald Evil Eye | Emerald Cyclops |
| 1185264 | Emerald Eye | Emerald Cyclops |
| 9838318899 | Emerald Gucci Blondie Bag (3.0) | Emerald Cyclops |
| 1513251995 | Emerald Starstone of the Federation | Royal Federation |
| 3210243135 | Emerald Valk Shades | Valkyrie Vault |
| 27345567 | Fiery Egg of Egg Testing | Hell's Halo |
| 17138062 | Flower Power | Super Kawaii |
| 402303179 | Fool of the Federation | Royal Red |
| 4786883113 | Fried Chicken Egg | Welcome Chicken |
| 439945864 | Gold King of the Night | Eureka Gold |
| 8795521 | Gold ROBLOX Music Video Award | Eureka Gold |
| 193659065 | Golden Antlers | Eureka Gold |
| 31149244 | Golden Fabergé Egg of Hivemind | Eureka Gold |
| 1594180 | Golden Teapot of Pwnage | Eureka Gold |
| 323191596 | Green Super Happy Joy | Super Kawaii |
| 6803398976 | Gucci Geometric Bag | Violet Void |
| 6803403781 | Gucci GG Marmont Bag | Violet Void |
| 6803400584 | Gucci Spiked Basketball Bag | Violet Void |
| 4390891467 | Ice Valkyrie | Valkyrie Vault |
| 1229962410 | Icicles Swordpack | Dual Wield |
| 16641274 | Illumina | Dual Wield |
| 207207782 | Lady of the Federation | Royal Federation |
| 88885069 | Lord of the Federation | Royal Federation |
| 382880833 | Lord of the Tixeration | Golden Ticket |
| 153558902 | Major Overseer | King Seer |
| 215392741 | Merely's Green Sparkle Time Hoverboard | Green Machine |
| 456226536 | Merely's Pink Sparkle Time Hoverboard | Pink Panther |
| 638087256 | Neon Pink Crazy Crown | Pink Panther |
| 376806474 | Neon Pink Top Hat | Pink Panther |
| 483306493 | Overseer All-Seeing Pendant | King Seer |
| 357832740 | Overseer Armor Pauldrons | King Seer |
| 553720598 | Overseer Guardia | King Seer |
| 286511631 | Overseer Hooded Cloak | King Seer |
| 928819079 | Overseer Overload Headphones | King Seer |
| 286511038 | Overseer Overlord | King Seer |
| 156467990 | Overseer Short Sword | King Seer |
| 483308034 | Overseer Warlord's Sword | King Seer |
| 1587175771 | Overseer Wings of Terror | King Seer |
| 127506324 | Overseer's Axe | King Seer |
| 82665932 | Overseer's Eye | King Seer |
| 334663683 | Pink Sparkle Time Fedora | Pink Panther |
| 53039427 | Pretty Pretty Princess | Ice Prince |
| 1032641 | Princess Hat | Ice Prince |
| 362051999 | Purple Bubble Trouble | Purple Haze |
| 151327351 | Purple Crystal Circlet | Purple Haze |
| 553971858 | Purple Queen of the Night | Purple Haze |
| 63043890 | Purple Sparkle Time Fedora | Purple Haze |
| 376812961 | Purple Super Happy Joy | Super Kawaii |
| 82332012 | Rainbow Fedora | Rainbow Rush |
| 159229806 | Rainbow Periastron Omega | Rainbow Rush |
| 3267569146 | Rainbow Pixels Bandana | Rainbow Rush |
| 64082730 | Rainbow Shaggy | Rainbow Rush |
| 346686597 | Rainbowrath: The Avenger | Rainbow Rush |
| 154415221 | Recycled Cardboard Headphones | Headphone Fiasco |
| 9465511 | Red Crown of Ozymandias | Hell's Halo |
| 16652251 | Red Tango | Royal Red |
| 1191135761 | Red Void Star | Royal Red |
| 323476069 | Ruby Crystal Circlet | Hell's Halo |
| 1744246930 | Sapphire Starstone of the Federation | Royal Federation |
| 553726283 | Shinestone Eyes: Emerald Extreme | Emerald Cyclops |
| 2569001052 | So Super Excited - Blue | Super Kawaii |
| 2568801198 | So Super Excited - Pink | Super Kawaii |
| 2568804274 | So Super Excited - Purple | Super Kawaii |
| 11999235 | Spec Alpha Biograft Energy Sword | Green Machine |
| 494291269 | Super Super Happy Face | Super Kawaii |
| 24112667 | Telamon's Chicken Suit | Welcome Chicken |
| 76692790 | Terrordactyl Egg | Deviled Egg |
| 382881373 | Tix Shaggy | Golden Ticket |
| 6512277 | Tixsplosion | Golden Ticket |
| 382881237 | Tixvalk | Golden Ticket |
| 9910514 | Treehugger Visor | Green Machine |
| 74214775 | Valkyrie 3000 | Valkyrie Vault |
| 1365767 | Valkyrie Helm | Valkyrie Vault |
| 24826771 | Violently Pink Egg of Violent Opinions | Pink Panther |
| 130106467 | Virtual BLOXcon Headphones | Cryptic Commando |
| 362081769 | Virtual Commando | Cryptic Commando |
| 2566024668 | WC Ultimates - Garnet Gratitude | Headphone Fiasco |
| 323417812 | WC Ultimates: Aquamarine Attitude | Headphone Fiasco, Dual Wield |
| 1191152570 | WC Ultimates: Citrine Celebration | Headphone Fiasco |
| 553858732 | WC Ultimates: Peridot Panic | Headphone Fiasco |
| 315549204 | WC Ultimates: Pink Diamond Distraction | Headphone Fiasco |
| 878908562 | WC Ultimates: Sugilite Satisfaction | Headphone Fiasco |
| 11297746 | White Ninja Headband of the Unimpeachable Soul | Purple Haze |
| 77443704 | Windforce | Dual Wield, Pink Panther |
