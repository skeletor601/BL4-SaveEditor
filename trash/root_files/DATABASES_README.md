# BL4 AIO Web – Databases & Data Files Reference

This document lists every database and data file used by the app for **Master Search** and each **builder**, with their file paths (relative to the repo root). Use this when updating or regenerating data.

---

## Incorrect part codes (`{xx:xx:yy}` — fix required)

Part codes in this project use **one colon**: `{typeId:partId}` e.g. `{284:1}` or `{296:11}`.  
Some entries were incorrectly changed to **two colons** (`{xx:xx:yy}`), e.g. `{13:13:2}` instead of `{13:2}`.

**Files that contain incorrectly formatted codes** (and need correction):

| File | Path (from repo root) | Notes |
|------|------------------------|--------|
| Universal parts DB | `master_search/db/universal_parts_db.json` | Many rows with `{a:a:b}` style codes; correct form is `{a:b}`. |
| Parts JSON | `api/data/parts.json` | Same incorrect codes (likely copy or same source). |

**Correct format:** `{typeId:partId}` — exactly one colon, e.g. `{13:2}`, `{2:1}`, `{8:3}`, `{20:5}`, `{27:3}`, `{3:3}`, `{9:1}`.  
**Incorrect format:** `{typeId:typeId:partId}` — two colons, e.g. `{13:13:2}`, `{2:2:1}`.

No CSV or TSV data files in the repo currently contain the incorrect pattern; only the two JSON files above are affected. After fixing the source or regenerating with `node scripts/build_parts_db.js`, ensure the build script outputs correct `{x:y}` codes so the problem does not reappear.

---

## Master Search

Master Search gets results from the **parts API** (`/api/parts/search`). The API loads parts in this order (first existing file wins):

| # | Database / file | Path (from repo root) |
|---|----------------------------------|------------------------|
| 1 | Universal parts DB (primary) | `master_search/db/universal_parts_db.json` |
| 2 | Universal parts (API data copy) | `api/data/universal_parts_db.json` |
| 3 | Parts JSON (fallback) | `api/data/parts.json` |

**Summary:** Master Search effectively uses **`master_search/db/universal_parts_db.json`** when present; otherwise `api/data/universal_parts_db.json` or `api/data/parts.json`.

---

## Weapon Builder

Weapon Builder uses the **weapon gen** API. Data is loaded from:

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Weapon parts (EN preferred) | `weapon_edit/all_weapon_part_EN.csv` or `weapon_edit/all_weapon_part.csv` |
| Elemental (fallback) | `weapon_edit/elemental.csv` |
| Weapon elemental (master list) | `master_search/db/Borderlands 4 Item Parts Master List - Weapon Elemental.csv` |
| Weapon rarity | `weapon_edit/weapon_rarity.csv` |
| God rolls | `godrolls.json` or `data/godrolls.json` or `web/public/data/godrolls.json` |
| Weapon skins | `master_search/db/weapon_skins.json` |
| Universal parts (for Master Unlock / gaps) | `master_search/db/universal_parts_db.json` |

---

## Shield Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Main perks (EN preferred) | `shield/shield_main_perk_EN.csv` or `shield/shield_main_perk.csv` |
| Manufacturer perks (EN preferred) | `shield/manufacturer_perk_EN.csv` or `shield/manufacturer_perk.csv` |

---

## Grenade Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Main perks (EN preferred) | `grenade/grenade_main_perk_EN.csv` or `grenade/grenade_main_perk.csv` |
| Manufacturer/rarity perks (EN preferred) | `grenade/manufacturer_rarity_perk_EN.csv` or `grenade/manufacturer_rarity_perk.csv` |

---

## Repkit Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Main perks (EN preferred) | `repkit/repkit_main_perk_EN.csv` or `repkit/repkit_main_perk.csv` |
| Manufacturer perks (EN preferred) | `repkit/repkit_manufacturer_perk_EN.csv` or `repkit/repkit_manufacturer_perk.csv` |
| Master list (stats/effects merge) | `repkit/Borderlands 4 Item Parts Master List - Repkits.csv` |

---

## Class Mod Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Rarity / name options | `class_mods/Class_rarity_name.csv` |
| Skills | `class_mods/Skills.csv` |
| Perks | `class_mods/Class_perk.csv` |
| Legendary name → item card mapping | `class_mods/Class_legendary_map.csv` |

---

## Heavy Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Main perks (EN preferred) | `heavy/heavy_main_perk_EN.csv` or `heavy/heavy_main_perk.csv` |
| Manufacturer perks (EN preferred) | `heavy/heavy_manufacturer_perk_EN.csv` or `heavy/heavy_manufacturer_perk.csv` |
| Master list (TSV, stats/effects merge) | `heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv` |

---

## Enhancement Builder

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Manufacturers & perks | `enhancement/Enhancement_manufacturers.csv` |
| Perk list (247 / secondary) | `enhancement/Enhancement_perk.csv` |
| Rarity mapping | `enhancement/Enhancement_rarity.csv` |

---

## Weapon Edit (Weapon Editor)

Used when editing an existing weapon (decode/edit/encode). Same parts as Weapon Builder, plus:

| Database / file | Path (from repo root) |
|----------------------------------|------------------------|
| Weapon parts (EN preferred) | `weapon_edit/all_weapon_part_EN.csv` or `weapon_edit/all_weapon_part.csv` |
| Universal parts (fill missing part rows) | `master_search/db/universal_parts_db.json` |
| Elemental | `weapon_edit/elemental.csv` |

---

## Item Edit (Grenade / Shield / Repkit / Heavy edit)

Uses **master list** CSVs when present (env override supported). Same logical files as the corresponding builders:

| Item type | Master list path (from repo root) |
|-----------|-----------------------------------|
| Grenade | `grenade/Borderlands 4 Item Parts Master List - Grenades.csv` |
| Shield | `shield/Borderlands 4 Item Parts Master List - Shields.csv` |
| Repkit | `repkit/Borderlands 4 Item Parts Master List - Repkits.csv` |
| Heavy | `heavy/Borderlands 4 Item Parts Master List - Heavy.csv` |

(Heavy Builder uses the TSV `heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv`; Item Edit config references the CSV path above.)

---

## Building the universal parts DB (Master Search + parts API)

The script **`scripts/build_parts_db.js`** produces:

- **`api/data/parts.json`**
- **`master_search/db/universal_parts_db.json`**

It reads from (all paths from repo root):

| Phase | Source | Path |
|-------|--------|------|
| 1 | Shield main perks | `shield/shield_main_perk_EN.csv` |
| 1 | Shield manufacturer perks | `shield/manufacturer_perk_EN.csv` |
| 1 | Grenade main perks | `grenade/grenade_main_perk_EN.csv` |
| 1 | Grenade manufacturer/rarity perks | `grenade/manufacturer_rarity_perk_EN.csv` |
| 1 | Repkit main perks | `repkit/repkit_main_perk_EN.csv` |
| 1 | Repkit manufacturer perks | `repkit/repkit_manufacturer_perk_EN.csv` |
| 1 | Enhancement manufacturers | `enhancement/Enhancement_manufacturers.csv` |
| 1 | Enhancement rarity | `enhancement/Enhancement_rarity.csv` |
| 1 | Enhancement perks | `enhancement/Enhancement_perk.csv` |
| 1 | Class mod rarity/names | `class_mods/Class_rarity_name.csv` |
| 1 | Class mod perks | `class_mods/Class_perk.csv` |
| 1 | Class mod skills | `class_mods/Skills.csv` |
| 1 | Heavy main perks | `heavy/heavy_main_perk_EN.csv` |
| 1 | Heavy manufacturer perks | `heavy/heavy_manufacturer_perk_EN.csv` |
| 2 | Weapon parts export | `reference htmls/embedded_parts_export.csv` |
| 3 | Master database | `reference htmls/BL4_master_database.csv` |

Run from repo root: `node scripts/build_parts_db.js`

---

## Quick index: file path → used by

| Path | Used by |
|------|---------|
| `api/data/parts.json` | Parts API, Master Search (fallback) |
| `api/data/universal_parts_db.json` | Parts API, Master Search (fallback) |
| `master_search/db/universal_parts_db.json` | Master Search, Parts API, Weapon Builder/Edit, build script output |
| `master_search/db/Borderlands 4 Item Parts Master List - Weapon Elemental.csv` | Weapon Builder (elemental) |
| `master_search/db/weapon_skins.json` | Weapon Builder (skins) |
| `weapon_edit/all_weapon_part*.csv` | Weapon Builder, Weapon Edit |
| `weapon_edit/elemental.csv` | Weapon Builder, Weapon Edit |
| `weapon_edit/weapon_rarity.csv` | Weapon Builder |
| `godrolls.json`, `data/godrolls.json`, `web/public/data/godrolls.json` | Weapon Builder |
| `shield/shield_main_perk*.csv`, `shield/manufacturer_perk*.csv` | Shield Builder, build script |
| `grenade/grenade_main_perk*.csv`, `grenade/manufacturer_rarity_perk*.csv` | Grenade Builder, build script |
| `repkit/repkit_main_perk*.csv`, `repkit/repkit_manufacturer_perk*.csv` | Repkit Builder, build script |
| `repkit/Borderlands 4 Item Parts Master List - Repkits.csv` | Repkit Builder, Item Edit |
| `class_mods/Class_rarity_name.csv`, `Class_perk.csv`, `Skills.csv`, `Class_legendary_map.csv` | Class Mod Builder, build script (first 3) |
| `heavy/heavy_main_perk*.csv`, `heavy/heavy_manufacturer_perk*.csv` | Heavy Builder, build script |
| `heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv` | Heavy Builder |
| `heavy/Borderlands 4 Item Parts Master List - Heavy.csv` | Item Edit (heavy) |
| `enhancement/Enhancement_manufacturers.csv`, `Enhancement_perk.csv`, `Enhancement_rarity.csv` | Enhancement Builder, build script |
| `grenade/Borderlands 4 Item Parts Master List - Grenades.csv` | Item Edit (grenade) |
| `shield/Borderlands 4 Item Parts Master List - Shields.csv` | Item Edit (shield) |
| `reference htmls/embedded_parts_export.csv` | build script |
| `reference htmls/BL4_master_database.csv` | build script |

---

*Last updated from codebase: api/src/data (parts, weaponGen, weaponEdit, shieldBuilder, grenadeBuilder, repkitBuilder, classModBuilder, heavyBuilder, enhancementBuilder, itemEdit) and scripts/build_parts_db.js.*
