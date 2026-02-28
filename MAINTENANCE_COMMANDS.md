# Python commands for maintaining the BL4 AIO build

Run all commands from the **project root**: `c:\BL4\Borderlands4-SaveEditor-3.4.5.2`

---

## 1. Building the EXE

| Command | Purpose |
|--------|---------|
| `python build_exe.py` | Generate spec, collect data, and build `dist/BL4_AIO.exe` |
| `python build_exe.py --spec-only` | Only generate `BL4_AIO.spec` (no build) |

**Dependencies (if needed):**
```text
pip install pyinstaller pillow pyyaml pycryptodome pandas PyQt6
```

**Alternative (Windows):**
```text
build_windows.bat
```
or
```text
.\build_windows.ps1
```

---

## 2. Parts databases

### Merge codes for db (add missing parts from your file)
```text
python -m tools.merge_codes_for_db "C:\Users\picas\Desktop\codes for db.txt"
```
- Merges missing parts from your tab-separated file (Code, Name, Manufacturer, Item Type, Part Type, Description, Note) into:
  - `weapon_edit/elemental.csv` (type 1)
  - `grenade/grenade_main_perk.csv`, `shield/shield_main_perk.csv`, `repkit/repkit_main_perk.csv`, `heavy/heavy_main_perk.csv`
  - `master_search/db/universal_parts_db.json`
- Also writes new rows to `master_search/db/sources/codes_for_db.json` so future `build_universal_parts_db` keeps them.
- **Omit the path** to use default: `%USERPROFILE%\Desktop\codes for db.txt`.

### Rebuild universal parts DB
| Command | Purpose |
|--------|---------|
| `python -m tools.build_universal_parts_db` | Rebuild `master_search/db/universal_parts_db.json` from sources + Master List CSVs + app part CSVs (weapon_edit, grenade, shield, repkit, heavy, enhancement). Run after adding/editing any of those CSVs or files in `master_search/db/sources/`. |

---

## 3. Optional checks and one-off tools

| Command | Purpose |
|--------|---------|
| `python -m tools.check_skin_coverage` | Check that all named weapon skins from the “codes for db” file are present in `master_search/db/weapon_skins.json`. |
| `python -m tools.merge_item_editor_html_into_db` | Load Item Editor HTML, extract parts, merge into universal_parts_db.json. |
| `python -m tools.merge_part_lookup_into_db` | Load Part-Lookup HTML CSV and merge into universal_parts_db.json. |
| `python -m tools.reset_and_rescrape_db` | Reset and rescrape the parts DB (see script for details). |

---

## 4. Assets and content

| Command | Purpose |
|--------|---------|
| `python scripts/generate_dashboard_icons.py` | Regenerate neon-style dashboard icons in `assets/icons/`. |
| `python scripts/scrape_game8_weapon_skins.py` | Scrape weapon skin images (filenames must match `weapon_skins.json` "value"). |
| `python scripts/yaml_to_godrolls.py "path\to\file.yaml"` | Convert YAML to godrolls (example in apps scripts.txt). |

---

## 5. Typical maintenance flows

**After editing part CSVs or adding a new “codes for db” file:**
```text
python -m tools.merge_codes_for_db "C:\Users\picas\Desktop\codes for db.txt"
python -m tools.build_universal_parts_db
```

**Before a release (commit → build → release):**
```text
git add .
git commit -m "Your message"
python build_exe.py
```
Then create the release on GitHub and attach `dist/BL4_AIO.exe`.

**Only refresh universal DB from existing sources (no new file):**
```text
python -m tools.build_universal_parts_db
```
