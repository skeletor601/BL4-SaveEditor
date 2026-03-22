# Modded Weapon Generator Rebuild — Final Plan

## Core Principle
Every gun is unique. Parts are chosen from randomized pools, not fixed lists.
Each underbarrel has a companion recipe. Shield/Enhancement/ClassMod cross-inserts
rotate randomly. Heavy parts are mixed per-recipe.

## What Stays The Same
1. Auto-fill stock base first, then add mods
2. Vladof magazine `{18:14}` on every gun (no COV)
3. Grenade reload mode — adds grenade block when selected
4. Inf ammo mode — stays as-is
5. Visual barrel pool — same list, random per gun
6. Flight barrel `{11:75}` — every gun, last position
7. Damage stacking exemplar `{9:[28 32 40 55 59 62 68...]}` — every gun
8. UI selector for grenade-reload vs inf-ammo
9. Skin selection — random non-Christmas, shiny collapsed
10. DPS estimator, traits display

## New Architecture

### Step 1: Pick Random Underbarrel + Apply Companion Recipe

Each underbarrel has a "companion recipe" — specific parts that synergize with it.
Generator picks ONE underbarrel randomly, then applies its full recipe.

| Underbarrel | Code | Companions |
|---|---|---|
| Seamstress | `{26:77}` | `{13:[12x4]}` Daedalus SG ammo + `{6:68}` DAD SMG barrel acc + `{292:[9xN]}` Tediore Enh + `{286:[1xN]}` Ventilator + Full-auto + Two-Shot + Exemplar |
| Fuel Rod Discharge | `{7:80}` | `{282:[18x2]}` Vladof explosive + `{22:[72xN]}` Vladof dmg heavy + Two-Shot + Rowans + Fire Rate |
| Space Laser | `{13:75}` | `{6:[33xN]}` DAD SMG + `{13:[12x5]}` DAD SG + `{5:[26xN]}` MAL pistol + Full-auto + Rowans x14 |
| Attack Drone | `{5:80}` | `{22:[72xN]}` Vladof dmg extreme + Full-auto + Two-Shot x16 + Exemplar large |
| Airstrike | `{17:45}` | `{3:[6xN]}` Jakobs crit + `{22:[72xN]}` Vladof dmg + Full-auto + grenade reload compatible + enhancement stacks |
| Shock Field | `{25:48}` | `{14:[3xN]}` stability heavy + Two-Shot + Rowans + Exemplar massive |
| Laser Wire | `{21:53}` | `{273:[mixed]}` heavy accs + `{282:18}` + `{289:[3 19]}` + Ventilator + Full-auto + Exemplar + Tediore Enh |
| Beam Tosser | `{10:43}` | `{6:[33xN]}` DAD SMG + `{292:[9xN]}` Tediore Enh double + Two-Shot + Rowans |
| Gas Trap | `{19:46}` | `{3:[6xN]}` Jakobs crit heavy + `{13:[12xN]}` DAD SG + `{27:[15xN]}` extreme fire rate + `{6:[33xN]}` DAD SMG |
| Singularity GL | `{25:49}` | `{22:[72xN]}` Vladof dmg + `{13:[12xN]}` DAD SG + `{18:[31xN]}` VLA AR barrel + `{14:[3xN]}` stability + `{3:[6xN]}` Jakobs crit |
| Deathsphere | `{15:68}` | `{278:[10xN]}` Ripper grenade + `{5:[26xN]}` MAL pistol + Two-Shot + Exemplar |
| Big Rocket | `{16:54}` | `{289:[17xN]}` Two-Shot heavy + Rowans + `{22:[72xN]}` Vladof dmg + heavy barrel accs |
| Overdrive | `{18:90}` | `{282:[17 18]}` Vladof heavy + Two-Shot + Rowans + Fire Rate + Full-auto |
| Mystical UB | `{8:56}` | `{6:[33xN]}` DAD SMG + `{3:[6xN]}` Jakobs crit + Rowans + enhancement stacks |
| Zip Rockets | `{22:50}`+`{22:55}` | `{289:[17xN]}` Two-Shot + Vladof heavy parts + Rowans + `{18:[31xN]}` VLA AR barrel |
| Extra Barrel | `{18:69}` | `{282:[17 18]}` Vladof heavy + Rowans + Fire Rate + `{22:[72xN]}` Vladof dmg |
| Double Flintlocks | `{27:56}` | `{3:[6xN]}` Jakobs crit + Rowans heavy + `{14:[3xN]}` stability |
| Energy Disk | `{10:44}` | `{6:[33xN]}` DAD SMG + Two-Shot + Rowans + `{5:[26xN]}` MAL pistol |
| Energy Burst | `{4:44}` | `{3:[6xN]}` Jakobs crit + Rowans + Two-Shot + `{14:[3xN]}` stability |
| Kill Drone | `{15:43}` | `{289:[17xN]}` Two-Shot + Exemplar + `{22:[72xN]}` Vladof dmg + Rowans |
| Spread Launcher | TBD | Two-Shot + Rowans + heavy barrel accs |
| Micro Rockets | TBD | Two-Shot + Vladof dmg + Rowans |

### Step 2: Random Shield Cross-Insert (every gun, randomized)

Pick ONE random shield pattern per gun from a pool:
- `{246:[22 22 23 23 26 26 25 25 24 24 31 39 40 45 46 58 58]}` (Terra's pattern)
- `{306:N}` Jakobs Shield (random N from pool)
- `{312:N}` Daedalus Shield
- `{279:N}` Maliwan Shield
- `{287:[9xN]}` Tediore Shield (random stack count 10-50)
- `{300:N}` Ripper Shield
- Just the shield body `{246:[random subset]}` with random parts
- Sometimes NO shield cross (20% chance)

### Step 3: Random Enhancement Cross-Insert (every gun, randomized)

Pick 1-3 random enhancement manufacturers per gun:
- `{299:[1 1 9 9 2 2 3 3]}` Daedalus (Accelerator)
- `{268:[1 1 9 9 2 2 3 3]}` Jakobs
- `{271:[1 1 9 9 2 2 3 3]}` Maliwan (Mixologist)
- `{292:[9xN]}` Tediore (random stack 10-48)
- `{284:[1xN 2xN 9xN]}` Atlas enhancement (from Airstrike companion)
- `{264:[9xN]}` Hyperion enhancement
- `{296:[3xN]}` Ripper enhancement
- `{281:[1xN]}` Order enhancement (movement speed!)
- Sometimes just 1, sometimes all 3, completely random

### Step 4: Random Class Mod Perks (every gun, randomized)

Pick random class mod perk IDs from pool `{234:[...]}`:
- Pool: [21, 22, 23, 26, 28, 30, 31, 42]
- Random 3-8 unique IDs picked
- Random stack counts per ID (2-15)
- Total stacks: 15-50 range
- Different combo every time

### Step 5: Random Heavy Parts (per underbarrel recipe)

Not every gun gets the same heavy parts. Each underbarrel recipe specifies which heavy parts it uses:
- `{289:[17xN]}` Two-Shot (most recipes, but stack count varies 5-15)
- `{273:[29 27]}` Torgue scanning + fire rate (some recipes)
- `{282:[17 18]}` Vladof explosive + additional barrels (some recipes)
- `{289:[3 19]}` Maliwan proxy + aerodynamics (some recipes)
- `{275:[various]}` Ripper heavy parts (some recipes)

### Step 6: Full-Auto (NOT every gun)

Full-auto only applied when the underbarrel recipe includes it (~60% of recipes):
- `{281:[3xN]}` Free Charger (N=12-36)
- `{275:[23xN]}` Heat Exchange (N=9-28)
- `{26:30}` Order SR Mag (when full-auto is on)

### Step 7: Movement Speed Enhancement

Random 30% chance per gun:
- `{281:[1xN]}` Order Enhancement movement speed stacks (N=10-30)

## New Grenade Recipes to Add (7 new, allow IDs 70/71)

1. "Elemental Barrage" — lingering: 34x5 66x5 72x5 29x3 40x3 65x3 25x1 30x1
2. "Wall of Pain" — hybrid: 72x46 35x25 39x25 65x25 74x25 75x25 79x25 40x12 30x5 76x1
3. "Plasma Burst" — hybrid: 73x23 72x9 40x5 78x5 38x4 29x1 31x1 32x1 33x1 34x1 68x1 79x1
4. "Artillery Marathon" — artillery: 21x14 53x12 52x6 54x3 55x2
5. "Missile Rain" — artillery: 47x90 55x25 29x15 40x10 22x6 36x4 79x3 30x2
6. "Bouncer Barrage" — mirv: 52x20 40x3 35x2 81x2 24x1 29x1 32x1
7. "Pure Explosive" — hybrid: 72x184 44x5 5x2 23x1 24x1 39x1 40x1 46x1 57x1 69x1 78x1

## Implementation Order
1. Add 7 new grenade recipes to JSON + allow 70/71
2. Create underbarrel recipes JSON with companion parts
3. Refactor generateModdedWeapon.ts:
   a. Pick random underbarrel + apply companion recipe
   b. Randomize shield cross-insert from pool
   c. Randomize enhancement cross-insert from pool
   d. Randomize class mod perks from pool
   e. Apply full-auto only when recipe specifies
   f. Movement speed enhancement 30% chance
4. Remove all fixed "every gun" parts (old system)
5. Test diversity — generate 10 guns, verify all different

## Files to Modify
- `web/src/lib/generateModdedWeapon.ts` — main refactor
- `web/public/data/grenade_visual_recipes.json` — add 7 recipes
- `web/public/data/underbarrel_recipes.json` — NEW: underbarrel companion recipes
