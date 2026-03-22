# Decoded Modded Weapon Codes — Recipe Analysis

All codes decoded from community builds (bl4editor.com) and save-editor.be.
Purpose: analyze part combinations to build "micro recipes" for the random generator.

## Community Builds (bl4editor.com)

### 1. Riddled Eviscerating Rainmaker (Ripper Sniper, seed 3006)
```
23, 0, 1, 50| 2, 3006|| {6:53} {1:11} {22:[72 72 72 72]} {2} {4} {58} {58} {58} {58} {16} {28} {31} {34} {43} {44} {50} {52} {4:16} {6:44} {27:[15 15 15]} {14:[3 3 3 3]} {16:[68 68 68]} {24:[75 75 75]} {11:75}|
```
- **Visual barrel**: {6:53} (Daedalus SMG barrel 53)
- **Element**: {1:11} = Cryo
- **Key parts**: {22:[72x4]} Vladof SMG dmg, {27:[15x3]} fire rate, {14:[3x4]} stability, {16:[68x3]} Vladof AR barrel acc, {24:[75x3]} Vladof Pistol barrel
- **Underbarrel**: None visible
- **Cross-inserts**: {4:16} Jakobs AR, {6:44} Daedalus SMG
- **Flight barrel**: {11:75} yes
- **Notable**: Compact code, no grenade block, no heavy accessories

### 2. Onion — TK Wave + Space Laser (Jakobs Pistol, seed 3006)
```
3, 0, 1, 50| 2, 3006|| {13:72} {1:14} {306:8} {6:[33 33 33 33 33 33]} {12:58} {80} {58} {2} {3} {49} {4:16} {17} {18} {28} {32} {42} {24} {13:[12 12 12 12 12]} {5:[26 26 26 26]} {27:[75x14]} {22:[72x11]} {6}x24 {289:[17x5]} {11:75} {6:[68 16 16]} {5:[26 26]} {281:[3x15]} {275:[23x9]} {13:75}|
```
- **Visual barrel**: {13:72} (Tediore AR barrel 72)
- **Element**: {1:14} = Shock
- **Shield cross**: {306:8} Jakobs Shield
- **Key parts**: {6:[33x6]} Daedalus SMG, {12:58} COV Shotgun, {13:[12x5]} Tediore AR, {5:[26x4]} Maliwan Pistol
- **Stacking**: {27:[75x14]} Rowan's Charge heavy, {22:[72x11]} Vladof SMG dmg
- **Full-auto**: {281:[3x15]} Free Charger, {275:[23x9]} Heat Exchange
- **Heavy**: {289:[17x5]} Two-Shot
- **Flight**: {11:75} + {13:75}
- **Notable**: Cross-prefix heavy (24 repeated {6} tokens), shield cross-insert

### 3. Chuck — Drone Invasion (Tediore AR, seed 82)
```
14, 0, 1, 50| 2, 82|| {35} {34} {2} {3} {8} {58} {56} {1} {21} {32} {33} {42} {1:14} {281:[3x12]}|
```
- **Visual barrel**: None explicit (uses stock barrel)
- **Element**: {1:14} = Shock
- **Key parts**: {35} {34} {8} {58} {56} — rarity + accessories
- **Full-auto**: {281:[3x12]} Free Charger
- **Notable**: Very simple/compact code, minimal cross-inserts

### 4. Forsaken Chaos (Tediore Shotgun, seed 82)
```
11, 0, 1, 50| 2, 82|| {9:85} {2} {6} {77}x8 {26:30} {281:[3x38]} {275:[23x23]} {6:68} {289:[17x15]} {286:[1x18]} {1:18} {26:77} {13:[12x4]} {11:75} {292:[9x48]}|
```
- **Visual barrel**: {9:85} (Jakobs Shotgun barrel 85)
- **Element**: {1:18} (element 18)
- **Key parts**: {77}x8 body accessories stacked, {26:77} Seamstress underbarrel
- **Full-auto**: {281:[3x38]} Free Charger (38!), {275:[23x23]} Heat Exchange (23!)
- **Heavy**: {289:[17x15]} Two-Shot (15!)
- **Ventilator**: {286:[1x18]}
- **Enhancement**: {292:[9x48]} Tediore Enhancement (48!)
- **Seamstress**: Yes ({26:77}) + {13:[12x4]}
- **Flight**: {11:75}
- **Notable**: Heavy stacking, Seamstress build, massive Free Charger/Heat Exchange

### 5. Sudden Looming Kaleidosplode (Jakobs Shotgun, seed 82)
```
9, 0, 1, 50| 2, 82|| {278:12} {2} {5} {10:56} {4:1} {59} {13:[13 77 9 9 13]} {40} {3} {1:10} {13:[12x8]} {3:[6x24]} {62} {55} {4:16} {27:[15x131 75x9]} {78} {6:[33x10]} {19:46} {11:[75 8 11]} {23}|
```
- **Visual barrel**: {278:12} (Ripper Grenade mfg barrel 12)
- **Element**: {1:10} = Corrosive
- **Key parts**: {10:56} Maliwan SMG, {4:1} Jakobs AR, {13:[13 77 9 9 13]} mixed Tediore AR
- **Massive stacking**: {27:[15x131 75x9]} — 131 fire rate + 9 Rowan's Charge in ONE token!
- **Cross-inserts**: {3:[6x24]} Jakobs Pistol crit, {6:[33x10]} Daedalus SMG, {13:[12x8]} Tediore AR
- **Underbarrel**: {19:46} COV Sniper underbarrel
- **Flight**: {11:[75 8 11]} grouped
- **Notable**: Extreme fire rate stacking (131!), cross-manufacturer chaos

### 6. Frangible Fatal Rainmaker (Daedalus Pistol, seed 3006)
```
2, 0, 1, 50| 2, 3006|| {321:7} {1:[11 8]} {23:58} {27:[78 75 13]} {25:[73 32]} {2} {5} {15} {26:30} {281:[3x36]} {10:49} {275:[23x9]} {29} {42} {8:48} {3:[6x6]} {23:31} {5:69} {11:31} {6:[33x12 65]} {3:34} {19:28} {16:12} {14:[83 30 50 52]} {70} {267:[1 3]} {245:[25 39 25 38 40 40 66 52 21 62 68 47 41 64 43 45 73 74 80 79]} {291:6} {22} {11:[37 75]} {65} {66} {63}|
```
- **Visual barrel**: {321:7} (Torgue Shield mfg 7 — very unusual cross-prefix!)
- **Element**: {1:[11 8]} = Cryo + element 8
- **Grenade block**: {245:[25 39 25 38 40 40 66 52 21 62 68 47 41 64 43 45 73 74 80 79]} — 20 perks
- **Grenade anchors**: {291:6} Vladof grenade, {267:[1 3]} Jakobs Grenade mfg
- **Full-auto**: {281:[3x36]} Free Charger, {275:[23x9]} Heat Exchange
- **Key parts**: {27:[78 75 13]} mixed Rowan's, {25:[73 32]} Vladof Pistol, {14:[83 30 50 52]} Tediore AR mixed
- **Cross-inserts**: {3:[6x6]} Jakobs crit, {6:[33x12 65]} Daedalus SMG, {23:31}/{23:58} Ripper SMG
- **Underbarrel**: {19:28} COV Sniper
- **Flight**: {11:[37 75]}
- **Notable**: Has grenade reload recipe! Cross-prefix rarity from Shield mfg. Very diverse part sources.

### 7. Hot Slugger (Jakobs Shotgun, seed 1)
```
9, 0, 1, 50| 2, 1|| {11:82} {2} {6} {5} {74} {79} {55} {59} {62} {13} {23} {28} {32} {35} {31} {40} {37} {68} {48} {47} {64} {1:59}|
```
- **Visual barrel**: None (stock Jakobs Shotgun)
- **Rarity**: {11:82} Pearl (Eigenburst)
- **Element**: {1:59} = Cryo
- **Key parts**: All single-stack — {74} {79} {55} {59} {62} — various accessories
- **Notable**: Lightly modded, mostly just part additions without heavy stacking. Clean god-roll style.

### 8. Engorged Performative Handcannon (Daedalus SMG, seed 3287)
```
6, 0, 1, 50| 2, 3287|| {78} {2} {4} {77} {67} {64}x75 {65}x10 {66}x16 {16} {23} {30} {34} {39} {70} {80} {1:[56 53]}|
```
- **Visual barrel**: None explicit
- **Element**: {1:[56 53]} = Shock + element 53
- **Key parts**: {64}x75 — 75 copies of body part 64! {65}x10, {66}x16 — massive single-part stacking
- **Notable**: Extreme stacking of individual parts. Brute force approach — one part repeated 75 times.

## Save-Editor.be Codes

### 9. Debauched Breathless Kaleidosplode cryo/rad (Daedalus SMG, seed 3006)
(Code from community — need to decode separately)

### 10. Scattering Vestigial Anarchy (Vladof Pistol, seed 3006)
(Short code — need to decode)

### 11. Mass-Produced Insurgent Onslaught (Vladof SMG, seed 82)
(Need to decode from full API response)

### 12. Detonated Eliminating Convergence (Ripper AR, seed 3006)
(Need to decode from full API response)

---

## Pattern Analysis

### Common Patterns Across All Guns:
1. **Each gun has a unique combination of cross-prefix parts** — not all guns use the same set
2. **Stacking varies wildly** — from 3x to 131x depending on the gun's purpose
3. **Not every gun has heavy accessories** — some are clean with minimal cross-inserts
4. **Element is specific to the build** — Cryo guns use cryo parts, Shock guns use shock
5. **Some guns have grenade reload blocks, others don't**
6. **Full-auto ({281:3} + {275:23}) appears on about half the guns, not all**
7. **Flight barrel {11:75} appears on most but not all**
8. **Seamstress ({26:77}) only on specific builds — not added to everything**
9. **Rowan's Charge ({27:75}) stacking varies per build — some have 9, some have 0**

### 9. Plasma Coil kinetic/rad (Torgue AR, seed 82)
```
17, 0, 1, 50| 2, 82|| {278:12} {52} {5} {4} {63} {14} {24} {28} {29} {39} {74} {26:[30 30]} {15:[23 47]} {21:62} {8} {55} {16:86} {27:75} {9:[28 32 40 55 59 62 68...x84]} {2:70} {291:8} {245:[40x3 72 73...mixed...72 34 38x3 78x4 38 29 33 31 68 79 32 40 40]} {291:[6x8]} {281:[3x36]} {275:[23x28]} {6:68} {289:[17x15]} {286:[1x18]} {1:18} {26:77} {13:[12x4]} {11:75} {292:[9x48]}|
```
- **Visual barrel**: {278:12} (Ripper Grenade mfg barrel)
- **Element**: {1:18}
- **Grenade reload**: YES — {291:8} + {245:[...53 perks]} + {291:[6x8]}
- **Exemplar**: {9:[28 32 40 55 59 62 68...x84]} — 84 stacks cycling 7 IDs
- **Full-auto**: {281:[3x36]} + {275:[23x28]}
- **Heavy**: {289:[17x15]} Two-Shot
- **Ventilator**: {286:[1x18]}
- **Seamstress**: {26:77} + {13:[12x4]}
- **Enhancement**: {292:[9x48]}
- **Flight**: {11:75}
- **Notable**: Full kitchen sink build — grenade reload + Seamstress + heavy stacking

---

## Recipe Pattern Analysis

### Identified Build Archetypes:

**Type A: "Clean Sniper" (Rainmaker style)**
- Minimal parts, no grenade block, no heavy accessories
- Focus: cross-prefix barrel stacks + fire rate + crit damage
- Parts: visual barrel + element + {22:[72xN]} + {27:[15xN]} + {14:[3xN]} + flight
- No full-auto, no exemplar, no enhancements

**Type B: "Grenade Reload Beast" (Plasma Coil / Frangible Fatal Rainmaker style)**
- Grenade reload block {245:[...]} + {291:8} anchors
- Full-auto ({281:[3xN]} + {275:[23xN]})
- Heavy Two-Shot ({289:[17xN]})
- Exemplar cycling
- Seamstress underbarrel possible
- Enhancement/Divider stacking
- Kitchen sink — uses everything

**Type C: "Pure Chaos" (Onion / Kaleidosplode style)**
- Massive cross-prefix part stacking (24+ tokens of one part)
- Extreme fire rate ({27:[15x131]})
- Cross-prefix barrels from many weapon types
- May or may not have full-auto
- Creative combinations — shield cross-inserts, unusual underbarrels

**Type D: "Simple Modded" (Chuck / Hot Slugger style)**
- Compact code, lightly modded
- Just a few key parts added to a stock weapon
- Maybe Free Charger for full-auto
- No heavy accessories, no grenade block
- Close to a god roll with a few extras

**Type E: "Stacker" (Forsaken Chaos / Engorged Handcannon style)**
- One or two parts stacked to extreme (48-75 copies)
- Full-auto + Ventilator + Heavy Two-Shot
- Seamstress possible
- Focused on maximizing one stat through brute stacking

### Key Differences From Current Generator:
- Current generator adds ALL of these to EVERY gun: heavy accessories, full-auto, ventilator, exemplar, MIRV inserts, class mod perks, shield cross, 4 enhancement cross-inserts, divider
- Real modded guns pick and choose — each is a curated recipe
- Stacking ratios are specific to the build, not random ranges
- Some guns are intentionally simple — not everything needs 30+ cross-inserts
- Element is tied to the build concept, not randomly slapped on
- Grenade reload is a specific build archetype, not universal
