# Modded Weapon Cross-Part Research
Source: save-editor.be/GZO/Codes.html — analyzed 2026-03-15

## The Core Technique
Top modded weapons cross-insert **legendary rarity tokens from other weapons** to import those weapons' unique effects into the host gun. The game reads all rarity/barrel tokens and activates their behaviors.

## High-Value Cross-Manufacturer Parts

| Code | Source | Part Name | Effect |
|------|--------|-----------|--------|
| `{11:82}` | Tediore SG | Eigenburst (rarity) | Appears in every top Uxhiha build — imports Eigenburst unique behavior |
| `{289:1}` | Maliwan HW | Bottled Lightning (rarity) | Imports Bottled Lightning behavior |
| `{289:26}` | Maliwan HW | Strike Twice (barrel) | Bottled Lightning's unique barrel |
| `{13:73}` | Daedalus AR | Star Helix (rarity) | Imports Star Helix behavior |
| `{18:63}` | Vladof AR | Lucian's Flank (rarity) | Imports Lucian's behavior |
| `{17:56}` | Torgue AR | Cold Shoulder (rarity) | Imports Cold Shoulder behavior |
| `{321:7}` | Torgue Shield | Firewerks (rarity) | Cross-item type — shield rarity in a weapon! |
| `{273:1}` | Torgue HW | Reticle Homing | Projectiles home to reticle cursor |
| `{273:21}` | Torgue HW | Micro Missile Launcher (barrel) | |
| `{273:29}` | Torgue HW | Scanning barrel acc | Rockets home toward nearby targets |
| `{275:4}` | Ripper HW | Compound barrel acc | Increased damage per enemy hit |
| `{282:29}` | Vladof HW | Minigun Barrel | |
| `{21:53}` | Maliwan SM | Laser Wire underbarrel | Spawns Laser Wire area denial |
| `{303:1}` | Torgue Enhancement | Head Ringer | +25% damage to guns with Torgue-licensed parts |
| `{292:9}` | Tediore Enhancement | Divider (Core Perk) | |
| `{6:68}` | Torgue PS | Jakobs Ricochet | Shots bounce — same effect from different prefix than {7:74} |
| `{26:30}` | Order SR | Magazine | Ripper-licensed mag behavior |

## Rowan's Charge Stack Patterns
Creators vary the stack count — not always 7:
- 2 stacks: Terra-Morpheous Rowan's Charge build
- 3 stacks: Terra-Morpheous Anarchy, Bottled Lightning
- 7 stacks: Muffin Mantra (full infinite ammo)
Current generator always does 7 — could vary 2-7.

## Exemplar Stacks (Ynot AI weapons)
`{9:[28 32 40 55 59 62 68 ...]}` — Ynot uses massive exemplar arrays.
Currently excluded from our generator per locked rules. Keep excluded for stability.

## Build Patterns by Creator

### Uxhiha style
- Always starts with `{11:82}` (Eigenburst rarity cross-insert)
- Heavy stacking of individual parts (50-100x same part)
- Uses `{289:1}` (Bottled Lightning), `{292:[9x10]}`, `{303:[1x7]}`

### Terra-Morpheous style
- Multiple cross-prefix legendary rarities in one gun
- 2-3 Rowan's Charge stacks (not 7)
- Complex elemental combos `{1:[9 10]}` dual elemental
- Homing tokens from prefix 273

### Muffin style
- Full 7x Rowan's Charge
- Cross-manufacturer mag `{26:30}` (Order SR mag)
- Grouped elementals `{1:[12 19]}`
- Stability stacks `{14:[3x22+]}`

## Godroll Name Analysis

### Convergence (prefix 7, Ripper SG)
- `{64}` = "Asymptotic" unique barrel
- `{74}` = **Jakobs Ricochet** manufacturer part — the god-roll maker
- Renamed: "Jakobs Ricochet Convergence"

### Bod (prefix 8, Daedalus SG)
- `{1:11}` = **Cryo** element
- `{52}` = "All-Arounder" barrel (counts as SG + AR simultaneously)
- `{76}` = **Torgue Sticky Gyrojets** — sticky + Cryo combo
- `{11}` = Hyperion Absorb Shield, `{80}` = Daedalus SR Ammo
- Renamed: "Cryo Sticky Bod"

## Generator Improvement Ideas
1. Add a pool of cross-manufacturer legendary rarity tokens to optionally cross-insert
2. Add `{11:82}` (Eigenburst) as a toggleable "Eigenburst mode"
3. Vary Rowan's Charge stacks 2-7 instead of always 7
4. Add Laser Wire `{21:53}` as an underbarrel option
5. Add heavy weapon homing parts `{273:29}`, `{275:4}` as bonus cross-parts
6. Add `{303:1}` Torgue Enhancement when Torgue-licensed parts present
