# NCS Data Extraction Guide

How to extract item codes, class mod data, skill IDs, and part numbers from NCS parsed game files for the BL4 AIO Save Editor.

---

## Overview

The game's item serialization uses `{typeId:partId}` codes. For example:
- `{9:83}` = Jakobs Shotgun (type 9), Hellwalker legendary rarity (part 83)
- `{255:70}` = Amon class mod (type 255), Common rarity (part 70)
- `{245:88}` = Grenade base (type 245), Skillcraft firmware (part 88)

These codes come from the `serialindex` field in the NCS parsed JSON files. The NCS parser we use is **Borderlands-4.NcsParser** which outputs structured JSON with full type information.

---

## Tools Required

1. **Borderlands-4.NcsParser** — parses game `.ncs` files into structured JSON
   - Output location: `output/json/` folder
   - Produces `pakchunkX-Windows_Y_P-Nexus-Data-TABLENAME.json` files
2. **FModel** — for extracting texture assets (skill icons, etc.) from `.pak` files

---

## Key NCS Files

| File Pattern | Contains |
|---|---|
| `pakchunkX-Windows_Y_P-Nexus-Data-inv4.json` | **THE MAIN FILE** — all item definitions with serialindex codes |
| `pakchunkX-Windows_Y_P-Nexus-Data-skilltrees_data4.json` | Skill tree structures, node positions, icon paths |
| `pakchunkX-Windows_Y_P-Nexus-Data-uitooltipdata4.json` | Skill/item descriptions and stat text |
| `pakchunkX-Windows_Y_P-Nexus-Data-character_info4.json` | Character definitions |
| `pakchunkX-Windows_Y_P-Nexus-Data-ItemPoolList4.json` | Loot pools, boss drop tables |
| `pakchunkX-Windows_Y_P-Nexus-Data-inv_name_part4.json` | Item name parts (class mod names, weapon names) |
| `pakchunkX-Windows_Y_P-Nexus-Data-display_data4.json` | Display names for UI |
| `pakchunkX-Windows_Y_P-Nexus-Data-Firmware4.json` | Firmware definitions |

The `_0_P` suffix = base game, `_12_P` = DLC content. Compare DLC files against base game files to find what's new.

---

## How serialindex Works

Every item, part, and component in `inv4.json` has a `serialindex` block:

```json
"serialindex": {
  "__typeFlags": 515,
  "value": {
    "status": { "value": "Active" },
    "index": { "value": "83" },        // <-- THIS IS THE PART ID
    "_category": { "value": "inv_type" },
    "_scope": { "value": "Sub" }        // "Root" for type IDs, "Sub" for parts
  }
}
```

- **`_scope: "Root"`** = this is a **type ID** (the first number in `{typeId:partId}`)
- **`_scope: "Sub"`** = this is a **part ID** (the second number in `{typeId:partId}`)
- **`index`** = the numeric code

---

## Extracting Weapon Codes

### Step 1: Find the weapon root type

Search `inv4.json` for the weapon manufacturer+type entry. Example for Jakobs Shotgun:

```json
"jak_sg": {
  "value": {
    "inv": { "value": "JAK_SG" },
    "serialindex": {
      "value": {
        "index": { "value": "9" },      // Type ID = 9
        "_scope": { "value": "Root" }
      }
    }
  }
}
```

### Step 2: Find legendary entries under it

In the `__dep_entries` array, look for `comp_05_legendary_XXXX`:

```json
"comp_05_legendary_hellwalker": {
  "value": {
    "inv_comp": { "value": "comp_05_legendary_Hellwalker" },
    "serialindex": {
      "value": {
        "index": { "value": "83" },      // Part ID = 83
        "_scope": { "value": "Sub" }
      }
    }
  }
}
```

Result: `{9:83}` = Hellwalker legendary rarity.

### Step 3: Find the barrel

Look for `part_barrel_XX_XXXX` entries:

```json
"part_barrel_01_hellwalker": {
  "value": {
    "barrel": { "value": "part_barrel_01_Hellwalker" },
    "serialindex": {
      "value": {
        "index": { "value": "82" }       // Barrel Part ID = 82
      }
    }
  }
}
```

Result: `{9:82}` = Hellwalker barrel.

### Step 4: Check for Pearlescent rarity

Pearlescent weapons have `"pearlescent": "pearlescent"` in their `basetags` AND `"rarity'06_pearlescent'"` in their value, instead of the normal `"legendary": "legendary"` tag. Quick grep:

```bash
# Find all pearlescent weapons
python3 -c "
import re
with open('inv4.json') as f: text = f.read()
for m in re.finditer(r'\"(comp_05_legendary_\w+)\":\s*\{', text):
    chunk = text[m.start():m.start()+800]
    if 'pearlescent' in chunk.lower():
        print(m.group(1))
"
```

### Known Weapon Type IDs

| Type ID | Manufacturer | Weapon Type |
|---|---|---|
| 2 | Daedalus | Pistol |
| 3 | Jakobs | Pistol |
| 4 | Order | Pistol |
| 5 | Tediore | Pistol |
| 6 | Torgue | Pistol |
| 7 | Ripper | Shotgun |
| 8 | Daedalus | Shotgun |
| 9 | Jakobs | Shotgun |
| 10 | Maliwan | Shotgun |
| 11 | Tediore | Shotgun |
| 12 | Torgue | Shotgun |
| 13 | Daedalus | Assault Rifle |
| 14 | Tediore | Assault Rifle |
| 15 | Order | Assault Rifle |
| 17 | Torgue | Assault Rifle |
| 18 | Vladof | Assault Rifle |
| 16 | Vladof | Sniper |
| 19 | Ripper | SMG |
| 20 | Daedalus | SMG |
| 21 | Maliwan | SMG |
| 22 | Vladof | SMG |
| 23 | Ripper | Sniper |
| 24 | Jakobs | Sniper |
| 25 | Maliwan | Sniper |
| 26 | Order | Sniper |
| 27 | Jakobs | Assault Rifle |
| 273 | Torgue | Heavy |
| 275 | Ripper | Heavy |
| 282 | Vladof | Heavy |
| 289 | Maliwan | Heavy |

---

## Extracting Class Mod Codes

### Step 1: Find the class mod root

Search for `classmod_XXXX` in `inv4.json`:

```json
"classmod_paladin": {
  "value": {
    "inv": { "value": "classmod_paladin" },
    "itembasename": { "value": "NexusSerialized, ..., Forgeknight Class Mod" },
    "playerclassidentifier": { "value": "Char_Paladin" },
    "serialindex": {
      "value": {
        "index": { "value": "255" },     // Class Type ID = 255
        "_scope": { "value": "Root" }
      }
    }
  }
}
```

### Step 2: Extract rarity part IDs

In the `__dep_entries`, find `comp_01_common` through `comp_04_epic`:

```json
"comp_01_common": { "serialindex": { "value": { "index": { "value": "70" } } } }
"comp_02_uncommon": { "serialindex": { "value": { "index": { "value": "69" } } } }
"comp_03_rare": { "serialindex": { "value": { "index": { "value": "68" } } } }
"comp_04_epic": { "serialindex": { "value": { "index": { "value": "67" } } } }
```

Result: Amon Common = `{255:70}`, Uncommon = `{255:69}`, etc.

### Step 3: Extract class mod body names

Look for `class_mod_body` dep entries with names like `body_01` through `body_10`:

```json
"body_01": {
  "value": {
    "class_mod_body": { "value": "body_01" },
    "nameparts": [ { "value": "inv_name_part'np_cm_pal_01'" } ],  // Name = "Guardian"
    "serialindex": { "value": { "index": { "value": "1" } } }     // Body Part ID = 1
  }
}
```

Normal bodies are IDs 1-10. Legendary bodies are IDs 11-15 + higher numbers for DLC legendaries.

### Step 4: Extract legendary comp IDs

```json
"comp_05_legendary_01": {
  "value": {
    "serialindex": { "value": { "index": { "value": "221" } } }   // Legendary rarity Part ID
  }
}
```

### Step 5: Extract skill point IDs

Look for `passive_points` dep entries. Each skill has 5 tiers (tier_1 through tier_5):

```json
"passive_blue_1_1_tier_1": {
  "value": {
    "passive_points": { "value": "passive_blue_1_1_tier_1" },
    "passives": [{
      "progressgraph": { "value": "progress_graph'Progress_DS_Trunk_Duplicate'" },
      "nodename": { "value": "Trunk - Row 1 - 1" }
    }],
    "serialindex": { "value": { "index": { "value": "194" } } }   // Skill tier 1 ID
  }
}
```

The 5 tier IDs for one skill go into `Skills.csv` as `skill_ID_1,skill_ID_2,skill_ID_3,skill_ID_4,skill_ID_5`.

### Known Class Mod Type IDs

| Type ID | Character | Internal Name |
|---|---|---|
| 234 | (shared) | Class Mod Perks |
| 254 | Vex | DarkSiren |
| 255 | Amon | Paladin |
| 256 | Rafa | ExoSoldier |
| 259 | Harlowe | Gravitar |
| 404 | C4SH | RoboDealer |

---

## Extracting Gear Codes (Shields, Grenades, Repkits, etc.)

Same pattern as weapons. Search for the manufacturer root entry and its sub-entries.

### Gear Type IDs

| Category | Base Type ID | Description |
|---|---|---|
| Shield (base) | 246 | Universal shield perks |
| Shield (Armor) | 237 | Armor-type shield perks |
| Shield (Energy) | 248 | Energy-type shield perks |
| Grenade | 245 | Grenade perks, firmware, elements |
| Repkit | 243 | Repkit perks, firmware |
| Heavy | 244 | Heavy weapon perks |
| Enhancement | 247 | Enhancement stat perks |
| Element | 1 | Weapon elements |

### Shield Manufacturer IDs

| Mfg ID | Manufacturer | Shield Type |
|---|---|---|
| 279 | Maliwan | Energy |
| 283 | Vladof | Armor |
| 287 | Tediore | Armor |
| 293 | Order | Energy |
| 300 | Ripper | Energy |
| 306 | Jakobs | Armor |
| 312 | Daedalus | Energy |
| 321 | Torgue | Armor |

### Grenade Manufacturer IDs

| Mfg ID | Manufacturer |
|---|---|
| 263 | Maliwan |
| 267 | Jakobs |
| 270 | Daedalus |
| 272 | Order |
| 278 | Ripper |
| 291 | Vladof |
| 298 | Torgue |
| 311 | Tediore |

### Repkit Manufacturer IDs

| Mfg ID | Manufacturer |
|---|---|
| 261 | Torgue |
| 265 | Jakobs |
| 266 | Maliwan |
| 269 | Vladof |
| 274 | Ripper |
| 277 | Daedalus |
| 285 | Order |
| 290 | Tediore |

---

## Extracting Skill Names, Descriptions, and Icon Mappings

### CRITICAL: Icon-to-Skill Mapping (skilltrees_data4.json)

**DO NOT guess which icon file goes with which skill by position order.** The game mixes icon colors across trees. For example, `c4sh_passive_blue_06` is actually "Luck Be a Robot" which belongs to the GREEN tree, and `c4sh_passive_red_23` is actually "Fast Hands" from the BLUE tree.

The ONLY reliable mapping is in `skilltrees_data4.json`. Each skill node has BOTH an `icon` field and a `tooltip` field side by side:

```json
{
  "name": { "value": "Trunk - Row 1 - 1" },
  "icon": { "value": "Asset'/Game/DLC/Cowbell/uiresources/skill_icons/passives/c4sh_passive_blue_01.c4sh_passive_blue_01'" },
  "tooltip": { "value": "uitooltipdata'tooltip_robo_passive_14_TakeThePot'" }
}
```

This tells you: icon file `c4sh_passive_blue_01` = skill "TakeThePot" (Passive_14 = "Take the Pot").

**Extract the full mapping with this script:**

```python
import re, json

with open('skilltrees_data4.json', 'r') as f:
    text = f.read()

icons = re.findall(
    r'"icon":\s*\{[^}]*"value":\s*"Asset[^"]*/(c4sh_passive_(?:blue|red|green)_\d+)', text)
tooltips = re.findall(
    r'"tooltip":\s*\{[^}]*"value":\s*"uitooltipdata\'tooltip_robo_passive_(\d+_\w+)\'"', text)

for i in range(min(len(icons), len(tooltips))):
    print(f'{icons[i]} -> {tooltips[i]}')
```

**Important notes:**
- Some icons appear in multiple trees (e.g. `blue_11` appears 3 times for Devil's Tines variants across all trees)
- Stat nodes with `nodetype=None` may not have tooltip references — these are generic stat boost nodes without unique icons
- The number of icons (101) exceeds the number of tooltip-mapped skills (85) because stat nodes reuse icons

### Tooltip internal names vs display names

The tooltip key like `tooltip_robo_passive_01_TableFLip` contains the INTERNAL name ("TableFlip"), NOT the display name ("Fast Hands"). You need a mapping table from internal→display. The display names come from the `uitooltipdata4.json` header fields or from in-game observation.

Example mappings that are NOT obvious:
- `TableFLip` → "Fast Hands"
- `HeroCall` → "Insurance"
- `Steam` → "Splash the Pot"
- `TheFuries` → "Hot Hand"
- `BoneShrapnel` → "Trick Shot"
- `RideWithTheDevil` → "A Blur of Fingers and Brass"
- `Unchained` (31) → "Unleashed"
- `Unchained` (38) → "Ride to Ruin" (yes, two different skills share the internal name)

### Skill stat descriptions from uitooltipdata4.json

Search for tooltip entries matching the character prefix (e.g. `tooltip_robo_passive_`). Each has a `formattext` field with the stat description:

```json
"formattext": {
  "value": "robodealer_UI, GUID, [secondary]Reload Speed:[/secondary] {0} {1}"
}
```

**Extract all descriptions:**

```python
import re

with open('uitooltipdata4.json', 'r') as f:
    text = f.read()

for m in re.finditer(
    r'tooltip_robo_passive_(\d+)_(\w+).*?"formattext".*?"value":\s*"([^"]+)"',
    text, re.DOTALL):
    num, name, desc = m.group(1), m.group(2), m.group(3)
    # Clean markup
    desc = re.sub(r'RoboDealer_Passives_UI,\s*\w+,\s*', '', desc)
    desc = re.sub(r'\[/?(?:secondary|flavor|newline|rd_color|primary)\]', '', desc)
    print(f'Passive_{num} ({name}): {desc.strip()}')
```

**Tags to strip:** `[secondary]`, `[/secondary]`, `[newline]`, `[flavor]`, `[/flavor]`, `[rd_color]`, `[/rd_color]`, `[primary]`, `[/primary]`, `[nowrap]`, `[fire_icon]`, `[fire]`, etc.

`{0} {1}` = dynamic values filled by the game engine (percentages, numbers).
`$VALUE$` = alternative template placeholder used by some skills.

Skills with only flavor text (no stat description) need manual enrichment from in-game:
- These have descriptions like "I bring a fork." or "Truth is... the game was rigged from the start."
- They're typically capstone or special interaction skills

### Class Mod Legendary Descriptions from ui_stat4.json

Search for `uistat_cm_{char}_legendary_` entries:

```python
import re

with open('ui_stat4.json', 'r') as f:
    text = f.read()

# Descriptions
for m in re.finditer(
    r'"uistat_cm_robo_legendary_(\w+?)".*?"formattext".*?"value":\s*"([^"]+)"',
    text, re.DOTALL):
    name = m.group(1)
    if '_redtext' not in name:
        print(f'{name}: {m.group(2)[:200]}')

# Red text
for m in re.finditer(
    r'"uistat_cm_robo_legendary_(\w+_redtext)".*?"formattext".*?"value":\s*"([^"]+)"',
    text, re.DOTALL):
    print(f'RED {m.group(1)}: {m.group(2)}')
```

These descriptions go into `web/src/data/classModNameDescriptions.ts` for the hover card popups.

### Weapon Legendary Descriptions from ui_stat4.json

Same file, search for `uistat_WEAPONNAME_desc` and `uistat_WEAPONNAME_red_text`:

```python
# Example: search for all weapon descriptions
for m in re.finditer(
    r'"uistat_(\w+?)_(?:desc|red_text)".*?"formattext".*?"value":\s*"([^"]+)"',
    text, re.DOTALL):
    print(f'{m.group(1)}: {m.group(2)[:200]}')
```

The description format is: `[rarity_legendary]PerkName[/rarity_legendary] - Effect description`
Red text format: flavor text (goes in the Description column of the CSV)

---

## Extracting Skill Icons

### Step 1: Get icon paths from skilltrees_data4.json

Icon paths follow this pattern:
```
/Game/DLC/Cowbell/uiresources/skill_icons/passives/c4sh_passive_blue_01
/Game/DLC/Cowbell/uiresources/skill_icons/augments/c4sh_augment_red_03
/Game/DLC/Cowbell/uiresources/skill_icons/trait/vh_trait_c4sh
```

Base game characters use a different path pattern:
```
/Game/uiresources/_shared/assets/ico_ui_art_passives/{CharName}/ico_passive_{char}_{skill}
```

### Step 2: Extract with FModel

1. Open FModel, point at BL4 install directory
2. The `/Game/` path maps to the **Content** folder in FModel
3. Navigate: **Content > DLC > [DLC_NAME] > uiresources > skill_icons > passives**
4. Select all textures, right-click > **Save Texture (.png)**
5. Also grab from `trait/` and `augments/` if needed

**Important FModel notes:**
- DLC pak files must be loaded first (Archives menu)
- The `Content` folder is at the top level, alongside `Config`, `Plugins`, etc.
- NCS parsed data does NOT contain actual image files — only asset path references
- The Cheat Engine UE5Dumper tool cannot extract textures either — it's for runtime memory inspection only

### Step 3: Map icons to skills BEFORE renaming

**DO NOT rename by icon number order.** Use the skilltrees_data mapping (see "Icon-to-Skill Mapping" section above). The icon file `c4sh_passive_blue_01` might map to a completely different skill than you'd expect.

### Step 4: Rename for the app

The app generates icon filenames via `getClassModSkillIconFilename()`:
- Strip diacritics (NFD normalize)
- Strip apostrophes (`'` and `'`)
- Spaces → underscores
- Remove non-alphanumeric (except `_` and `!`)
- Lowercase
- Add class suffix (`_1` Vex, `_2` Rafa, `_3` Harlowe, `_4` Amon, `_5` C4SH)
- Add `.png`

Example: `"Before She Knows You're Dead"` → `before_she_knows_youre_dead_5.png`

### Step 5: Color tint icons by TREE, not by icon filename

**CRITICAL:** Tint by the skill's ACTUAL TREE, not by the icon's filename color. The game reuses icons across trees — `c4sh_passive_blue_06` belongs to the GREEN tree (Luck Be a Robot), so it gets GREEN tinting, not blue.

Existing character icons have color tints baked in. New character icons from FModel are grayscale/white on transparent. Tint them with Python:

```python
from PIL import Image
import numpy as np
import os

def tint_image(path, tint_rgb):
    img = Image.open(path).convert('RGBA')
    arr = np.array(img, dtype=np.float32)
    lum = (0.299 * arr[:,:,0] + 0.587 * arr[:,:,1] + 0.114 * arr[:,:,2]) / 255.0
    arr[:,:,0] = lum * tint_rgb[0]
    arr[:,:,1] = lum * tint_rgb[1]
    arr[:,:,2] = lum * tint_rgb[2]
    Image.fromarray(arr.clip(0,255).astype(np.uint8), 'RGBA').save(path)

BLUE = (60, 140, 255)
RED = (255, 80, 60)
GREEN = (60, 220, 120)
NEUTRAL = (200, 200, 200)  # For shared skills like Devil's Tines

# Tint each icon by its SKILL TREE, not filename
for skill_name in blue_tree_skills:
    tint_image(f'class_mods/C4SH/{skill_name}_5.png', BLUE)
for skill_name in red_tree_skills:
    tint_image(f'class_mods/C4SH/{skill_name}_5.png', RED)
for skill_name in green_tree_skills:
    tint_image(f'class_mods/C4SH/{skill_name}_5.png', GREEN)
# Shared skills
tint_image('class_mods/C4SH/devils_tines_5.png', NEUTRAL)
```

The skill tree assignment for color-coding is also used in the frontend (`UnifiedItemBuilderPage.tsx`) via `C4SH_BLUE_SKILLS`, `C4SH_RED_SKILLS`, `C4SH_GREEN_SKILLS` Sets that color the skill names in the UI.

### Step 6: Place icons

Put renamed + tinted PNGs in `class_mods/{CHARACTER_NAME}/`. The API serves them via:
`GET /accessories/class-mod/skill-icon/{className}/{filename}`

---

## Diffing for DLC Updates

When a new DLC drops:

1. **Save a control group** — copy the pre-DLC NCS parser output somewhere safe
2. **Re-parse** after the DLC update
3. **Find new files** — DLC content appears in new pakchunk variants (e.g. `_12_P`)
4. **Compare** — base game files (`_0_P`) are typically unchanged; all new content is additive
5. **Extract** — use the methods above to get codes from the new files

Quick diff command:
```bash
# Find files in post-DLC that don't exist in pre-DLC
for f in post_dlc/parsed/*.json; do
  base=$(basename "$f")
  [ ! -f "pre_dlc/parsed/$base" ] && echo "NEW: $base"
done
```

---

## Database Files to Update

After extracting codes, update these files:

| File | What goes in it |
|---|---|
| `weapon_edit/all_weapon_part_EN.csv` | Weapon barrels, bodies, accessories, rarities |
| `weapon_edit/weapon_rarity.csv` | Weapon rarity dropdown entries (Common-Pearl) |
| `weapon_edit/elemental.csv` | Weapon element options |
| `shield/shield_main_perk_EN.csv` | Shield firmware, universal perks |
| `shield/manufacturer_perk_EN.csv` | Shield manufacturer legendaries, rarities |
| `grenade/grenade_main_perk_EN.csv` | Grenade firmware, elements, universal perks |
| `grenade/manufacturer_rarity_perk_EN.csv` | Grenade manufacturer legendaries, rarities |
| `repkit/repkit_main_perk_EN.csv` | Repkit firmware, universal perks |
| `repkit/repkit_manufacturer_perk_EN.csv` | Repkit manufacturer legendaries, rarities |
| `heavy/heavy_main_perk_EN.csv` | Heavy weapon firmware, perks |
| `heavy/heavy_manufacturer_perk_EN.csv` | Heavy weapon manufacturer parts |
| `enhancement/Enhancement_manufacturers.csv` | Enhancement core perks |
| `enhancement/Enhancement_perk.csv` | Enhancement stat perks |
| `enhancement/Enhancement_rarity.csv` | Enhancement rarities |
| `class_mods/Skills.csv` | Skill names + 5-tier IDs per character |
| `class_mods/Class_rarity_name.csv` | Class mod names (normal + legendary) |
| `class_mods/Class_legendary_map.csv` | Legendary name → item card ID mapping |
| `class_mods/Class_perk.csv` | Class mod perks (type 234) |
| `class_mods/{CharName}_skills_full.json` | Skill descriptions for popup cards |

Then rebuild: `node scripts/build_parts_db.js`

This generates `api/data/parts.json` and `master_search/db/universal_parts_db.json` from all the CSVs above.

**IMPORTANT:** The build script reads from ALL these CSV sources. Weapons come from `weapon_edit/all_weapon_part_EN.csv` + `elemental.csv`. If a CSV isn't listed in the build script, items won't appear in Master Search or the Parts Translator.

**weapon_rarity.csv** is a SEPARATE file that feeds the weapon builder's rarity dropdown specifically. It's NOT read by the build script. New legendaries need to be added to BOTH `all_weapon_part_EN.csv` AND `weapon_rarity.csv`.

### Enrichment Checklist

For each new item, ensure the database entry has:
- **Weapons**: barrel damage stats, fire rate, accuracy, shot count, legendary perk name, perk description, red/flavor text
- **Shields**: legendary perk name, perk effect description, red text, model stats (capacity, regen, delay)
- **Grenades**: legendary perk name, payload description, red text
- **Repkits**: legendary perk name, augment effect description, red text
- **Class mods**: legendary body name, skill param reference, stat bonus type

Source for enrichment:
- `ui_stat4.json` — weapon/gear descriptions via `uistat_ITEMNAME_desc` and `uistat_ITEMNAME_red_text`
- `uitooltipdata4.json` — skill descriptions via `tooltip_CHAR_passive_XX_Name`
- `inv4.json` barrel entries — damage attributes, fire rate, projectiles per shot, burst count

---

## Adding a New Character (Checklist)

When a new playable character is added:

### Phase 1: Extract data from NCS
1. Find class mod root in `inv4.json` → get **class type ID** (Root serialindex)
2. Extract **rarity IDs** (comp_01_common through comp_04_epic serialindex values)
3. Extract **body IDs** (body_01 through body_10 + legendary bodies)
4. Extract **legendary comp IDs** (comp_05_legendary_01 through _06 + DLC legendaries)
5. Extract **skill tier IDs** from passive_points entries (5 tiers per skill)
6. Extract **class mod name parts** from `inv_name_part4.json` (np_cm_CHAR_01 through _10 + leg names)
7. Map **icon files to skills** using `skilltrees_data4.json` icon+tooltip pairs (DO NOT GUESS)
8. Extract **skill descriptions** from `uitooltipdata4.json` formattext fields
9. Extract **legendary class mod descriptions** from `ui_stat4.json` (uistat_cm_CHAR_legendary_*)
10. Check for **Pearlescent** items (look for `pearlescent` tag in basetags)

### Phase 2: Update CSVs
1. `class_mods/Skills.csv` — all skills with 5-tier IDs
2. `class_mods/Class_rarity_name.csv` — normal + legendary names with name_codes
3. `class_mods/Class_legendary_map.csv` — legendary name → item card ID mapping

### Phase 3: Create supporting files
1. `class_mods/{NAME}_skills_full.json` — flat array format: `[{ name, type, description, stats[] }]`
   - Must match format of `Amon_skills_full.json` (flat array, NOT nested object)
   - Skill names must EXACTLY match what's in `Skills.csv`
2. `web/src/data/classModNameDescriptions.ts` — add legendary + normal class mod name descriptions
   - Legendary entries need full perk description + red text
   - Normal entries can be simple "Character standard class mod."

### Phase 4: Extract + process icons
1. Use **FModel** (Content > DLC > [NAME] > uiresources > skill_icons > passives)
2. Map icon files to skills using `skilltrees_data4.json` (Step 7 above) — **NOT by position order**
3. Rename to `{skill_name_underscored}_{suffix}.png` matching `getClassModSkillIconFilename()` output
4. Handle hyphens: the function strips hyphens, so "Trick-Taker" → `tricktaker_5.png` not `trick-taker_5.png`
5. Handle apostrophes: stripped, so "Dealer's Bluff" → `dealers_bluff_5.png`
6. Tint by **actual skill tree** color, not icon filename color
7. Place in `class_mods/{NAME}/`

### Phase 5: Update code files
1. `api/src/data/classModBuilder.ts` — CLASS_IDS, CLASS_NAMES, PER_CLASS_RARITIES
2. `api/src/routes/accessories.ts` — add to allowedClasses array
3. `web/src/pages/beta/UnifiedItemBuilderPage.tsx`:
   - CLASS_MOD_CLASS_IDS, CLASS_MOD_PER_CLASS_RARITIES, suffixMap
   - Add color-coding Sets (e.g. C4SH_BLUE_SKILLS, C4SH_RED_SKILLS, C4SH_GREEN_SKILLS)
   - Add `getC4SHSkillColor()` function and conditional in skill name rendering
4. `web/src/pages/accessories/ClassModBuilderView.tsx` — CLASS_IDS, suffixMap
5. `web/src/components/SkillCardPopup.tsx` — suffixMap
6. `web/src/data/classModNameDescriptions.ts` — character type union + color + all name entries
7. `web/src/components/ClassModNameHoverCard.tsx` — character color theme (border, gradient, badge, name color)
8. `scripts/build_parts_db.js` — CLASS_IDS_MAP

### Phase 6: Rebuild and verify
1. Run `node scripts/build_parts_db.js` — verify entry count increased
2. Check that skills appear in class mod builder dropdown
3. Check that icons display correctly with proper tree colors
4. Check that clicking skill names shows popup with description
5. Check that clicking legendary class mod names shows hover card with perk description
6. Check that "Max All Skills" button works for new character

---

## Lessons Learned (Cowbell DLC, March 2026)

1. **NCS parser output format matters.** The older `ncs_automation` parser produces flat string/numeric pools. The **Borderlands-4.NcsParser** produces structured JSON with typed fields and `serialindex` — use this one.

2. **DLC content is additive.** The Cowbell DLC added 546 new files in a `_12_P` pakchunk. Zero base game files were modified. All diffing should look for new pakchunk variants.

3. **Icon filenames do NOT match skill tree colors.** The game internally names icons `c4sh_passive_blue_XX` but those icons can belong to any tree. Always use the `skilltrees_data4.json` mapping.

4. **Two different parsers produce different folder structures.** The `ncs_automation` parser outputs to `parsed/`, `decompressed/`, `ncs_files/`. The `Borderlands-4.NcsParser` outputs to `output/json/` with `_metadata.json` companion files.

5. **`weapon_rarity.csv` is separate from `all_weapon_part_EN.csv`.** New legendaries must go in BOTH files or they won't appear in the weapon builder's rarity dropdown.

6. **The build script (`build_parts_db.js`) generates both `parts.json` and `universal_parts_db.json`.** Both must be rebuilt. The script now includes weapon CSVs + elemental.csv as of the Cowbell update.

7. **Pearl rarity detection:** Search for `"pearlescent"` in the `basetags` of `comp_05_legendary_*` entries. Not all legendaries are pearl — only specific ones tagged with `rarity'06_pearlescent'`.

8. **Class mod skill descriptions come from two places:** stat-based descriptions from `uitooltipdata4.json`, and legendary class mod perk descriptions from `ui_stat4.json`. Both need to be extracted.

9. **Some skills have only flavor text in the NCS data** (capstones, special interactions). These need manual enrichment from in-game observation or community wikis.

10. **`usePersistedState` does not work with JavaScript Sets.** If you change a `useState<string>` to `useState<Set<string>>`, it will break localStorage serialization. Use plain `useState` for Sets.

11. **`replace_all` in the Edit tool is dangerous.** It can catch variable names in declarations, turning `moddedWeaponSpecialModes` into `moddedWeaponSpecialModess`. Always verify after bulk renames.

12. **The NCS `inv4.json` does NOT contain actual numeric stat values** (damage, fire rate, accuracy). It contains column NAME references to external UE data tables. The actual numbers are in the game's data tables, not extractable from NCS alone. Barrel stat strings in the CSVs were originally obtained from in-game observation or lootlemon.
