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

## Extracting Skill Names and Descriptions

### Skill names from skilltrees_data4.json

Search for the character's tree entries. Each node has:
- Position (`"Trunk - Row 1 - 1"`)
- Tooltip reference (`"tooltip_robo_passive_01_TableFLip"`)
- Icon path (`"/Game/DLC/Cowbell/uiresources/skill_icons/passives/c4sh_passive_blue_01"`)
- Node type (passive, augment, capstone)

### Skill descriptions from uitooltipdata4.json

Search for tooltip entries matching the character prefix (e.g. `tooltip_robo_passive_`). Each has a `formattext` field with the stat description:

```json
"formattext": {
  "value": "robodealer_UI, GUID, [secondary]Reload Speed:[/secondary] {0} {1}"
}
```

Tags to strip: `[secondary]`, `[/secondary]`, `[newline]`, `[flavor]`, `[/flavor]`, `[rd_color]`, `[/rd_color]`, `[primary]`, `[/primary]`.
`{0} {1}` = dynamic values filled by the game engine.

---

## Extracting Skill Icons

### Step 1: Get icon paths from skilltrees_data4.json

Icon paths follow this pattern:
```
/Game/DLC/Cowbell/uiresources/skill_icons/passives/c4sh_passive_blue_01
/Game/DLC/Cowbell/uiresources/skill_icons/augments/c4sh_augment_red_03
/Game/DLC/Cowbell/uiresources/skill_icons/trait/vh_trait_c4sh
```

### Step 2: Extract with FModel

1. Open FModel, point at BL4 install directory
2. Navigate: **Content > DLC > [DLC_NAME] > uiresources > skill_icons > passives**
3. Select all textures, right-click > **Save Texture (.png)**

### Step 3: Rename for the app

The app generates icon filenames via `getClassModSkillIconFilename()`:
- Strip diacritics (NFD normalize)
- Strip apostrophes (`'` and `'`)
- Spaces → underscores
- Remove non-alphanumeric (except `_` and `!`)
- Lowercase
- Add class suffix (`_1` Vex, `_2` Rafa, `_3` Harlowe, `_4` Amon, `_5` C4SH)
- Add `.png`

Example: `"Before She Knows You're Dead"` → `before_she_knows_youre_dead_5.png`

### Step 4: Color tint icons

Existing character icons have color tints baked in. New character icons from FModel are grayscale/white. Tint them with Python:

```python
from PIL import Image
import numpy as np

def tint_image(path, tint_rgb):
    img = Image.open(path).convert('RGBA')
    arr = np.array(img, dtype=np.float32)
    lum = (0.299 * arr[:,:,0] + 0.587 * arr[:,:,1] + 0.114 * arr[:,:,2]) / 255.0
    arr[:,:,0] = lum * tint_rgb[0]
    arr[:,:,1] = lum * tint_rgb[1]
    arr[:,:,2] = lum * tint_rgb[2]
    Image.fromarray(arr.clip(0,255).astype(np.uint8), 'RGBA').save(path)

# Blue tree
tint_image("skill_icon.png", (60, 140, 255))
# Red tree
tint_image("skill_icon.png", (255, 80, 60))
# Green tree
tint_image("skill_icon.png", (60, 220, 120))
```

### Step 5: Place icons

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

---

## Adding a New Character (Checklist)

When a new playable character is added:

1. **Extract from NCS**: class type ID, rarity IDs, body IDs, legendary IDs, skill tier IDs
2. **Update CSVs**: `Skills.csv`, `Class_rarity_name.csv`, `Class_legendary_map.csv`
3. **Create skills JSON**: `class_mods/{NAME}_skills_full.json` (flat array format)
4. **Extract + tint icons**: FModel → rename → tint → place in `class_mods/{NAME}/`
5. **Update code files**:
   - `api/src/data/classModBuilder.ts` — CLASS_IDS, CLASS_NAMES, PER_CLASS_RARITIES
   - `api/src/routes/accessories.ts` — allowedClasses array
   - `web/src/pages/beta/UnifiedItemBuilderPage.tsx` — CLASS_MOD_CLASS_IDS, CLASS_MOD_PER_CLASS_RARITIES, suffixMap
   - `web/src/pages/accessories/ClassModBuilderView.tsx` — CLASS_IDS, suffixMap
   - `web/src/components/SkillCardPopup.tsx` — suffixMap
   - `web/src/data/classModNameDescriptions.ts` — character type union + color
   - `web/src/components/ClassModNameHoverCard.tsx` — character color theme
   - `scripts/build_parts_db.js` — CLASS_IDS_MAP
6. **Rebuild**: `node scripts/build_parts_db.js`
