# Item Edit Tab – Design (Grenade, Shield, Repkit, Heavy)

## Goal
Add a new **Item Edit** tab on the dashboard that works like **Weapon Edit** but for **Grenades, Shields, Repkits, and Heavy weapons**: same UX with a **scrollable/selectable parts library** and a **detailed current-item parts list**.

---

## How Weapon Edit Works (Reference)

### Data
- **all_weapon_part.csv**: `Manufacturer & Weapon Type ID`, `Manufacturer`, `Weapon Type`, `Part ID`, `Part Type`, `String`, `Stat`
- Elemental, skin, weapon name, rarity CSVs
- Parts are grouped by **Weapon Type** then **Manufacturer**; each part has Part ID, Part Type, String, Stat

### UI Flow
1. **Load from backpack** (scroll list of weapons) → pick one → populates Serial B85 + Decoded.
2. **Serial B85** and **Decoded** (plain text) stay in sync; decoding/encoding via `bl4_functions` + `b_encoder`.
3. **Decoded** is parsed into a list of **parts** (e.g. `{13:4}`, `{1:12}`, `{247:76}`, skin `"c", 42`). Each part is looked up in the CSV to get Part Type, String, Stat.
4. **Current weapon parts** are shown in a **parts list** (one row per part): Part Type, String, Stat, with **Move up / Move down / Remove**.
5. **Add part** opens a **parts library dialog**:
   - Scrollable area with **collapsible categories** (Elemental, then one per Weapon Type).
   - Each category expands to show **Manufacturer** groups, then **checkboxes per part** (Part ID | Part Type | String | Stat), optional qty.
   - **Confirm** → selected parts are appended (with correct `{mfg:id}` or `{mfg:[ids]}`) into the decoded serial and the parts list is refreshed.
6. **Update weapon / Add to backpack** work on the current decoded/B85.

### Parsing
- `_parse_component_string(component_str)`: regex for `{(\d+)(?::(\d+|\[[\d\s]+\]))?\}` and `"c",\s*(\d+)` → list of dicts `{type, id, raw}` or `{type, mfg_id, sub_id, raw}`, etc.
- Decoded line format: e.g. `310, 0, 1, 50| 2, 1081|| {4} {247:76} {1} {9}|` (prefix block then part tokens).

---

## Current Grenade / Shield / Repkit / Heavy Tabs

- **No parts library dialog**: they use fixed **perk groups** (radio/checkbox/list by category: Firmware, Element, Mfg Perks, Legendary, Universal, etc.).
- **No “current item parts list”**: the serial is built from the selected perks, not from an editable list of part codes.
- **Data**: each has `*_main_perk.csv` and `*_manufacturer_perk.csv` (or similar) with columns like `Grenade_perk_main_ID`/`Shield_perk_main_ID`, `Part_ID`, `Part_type`, `Stat`, `Manufacturer ID`, etc.

---

## Item Edit Tab – Proposed Behavior

### 1. Dashboard
- **New tab**: label **"Item Edit"**, icon e.g. 🛠️ or same as current item icons, key e.g. `item_edit`.
- **Single tab** (not four); item type chosen **inside** the tab.

### 2. Item Type Selector
- **Combo or button group**: **Grenade | Shield | Repkit | Heavy**.
- On change: load the corresponding part CSVs and rebuild the **parts library** and any “current item” state for that type.

### 3. Layout (mirror Weapon Edit where possible)
- **Load from backpack**: scroll list of **items of the selected type** (grenades OR shields OR repkits OR heavies). Selecting one loads its Serial B85 + Decoded and parses into the **current parts list**.
- **Serial B85** and **Decoded** (raw) text areas, synced like Weapon Edit.
- **Update item** / **Add to backpack** (and flag combo if applicable).
- **Parts section**:
  - Header: **“Parts”** (or “Grenade parts” / “Shield parts” / …), **Refresh**, **Add part**.
  - **Current item parts list**: scrollable list of **each part** in the current decoded item:
    - Show: **Part type**, **Part name/String**, **Effect (Stat)** (and optional code `{xx:yy}`).
    - **Move up**, **Move down**, **Remove** per row (same idea as weapon).
  - **Add part** opens the **parts library dialog** for the **current item type**.

### 4. Parts Library Dialog (per item type)
- **Scrollable** area; **collapsible categories** by:
  - **Grenade**: e.g. Firmware, Augment, Status, Payload, Stats, then manufacturer perks (from manufacturer_rarity_perk) grouped by Manufacturer ID or type.
  - **Shield**: e.g. Firmware, Elemental Resistance, Perk, then manufacturer groups (from shield_main_perk + manufacturer_perk).
  - **Repkit**: e.g. Prefix, Resistance, Firmware, Legendary, Universal (from repkit_main_perk + repkit_manufacturer_perk).
  - **Heavy**: e.g. Barrel, Barrel Accessory, Body Accessory, Element, Firmware (from heavy_main_perk + heavy_manufacturer_perk).
- Each category expands to show **selectable parts** (checkbox per part, optional qty if needed).
- Part display: **Part ID | Part type | String/Name | Stat** (or equivalent columns from the CSV).
- **Confirm** → build part codes (e.g. `{245:1}`, `{270:5}` for grenade; same `{typeId:partId}` style), append to decoded, refresh **current parts list**.

### 5. Data Sources (existing CSVs)
| Item Type | Main CSV(s) | Mfg/Other CSV | Type ID(s) |
|-----------|-------------|---------------|------------|
| Grenade   | grenade_main_perk.csv (Grenade_perk_main_ID, Part_ID, Part_type, Stat) | manufacturer_rarity_perk.csv | 245, 263, 267, 270, … |
| Shield    | shield_main_perk.csv | manufacturer_perk.csv | 237, 246, 248, 279, 283, … |
| Repkit    | repkit_main_perk.csv | repkit_manufacturer_perk.csv | 243, 261, 265, … |
| Heavy     | heavy_main_perk.csv | heavy_manufacturer_perk.csv | 273, 275, 282, 289 |

- Use existing `resource_loader.get_grenade_data_path`, `get_shield_data_path`, `get_repkit_data_path`, `get_heavy_data_path` and current `*_EN` suffix for language.

### 6. Serial Format (decoded)
- Same style as existing grenade/shield/repkit/heavy tabs: **prefix block** (mfg, level, rarity, etc.) then **part tokens** `{id}` or `{typeId:partId}` or `{typeId:[id id …]}`.
- **Parse**: reuse same regex idea as weapon `_parse_component_string` to get part codes from the decoded string; then for each code, look up in the **current item type’s** CSV(s) to get Part type, String, Stat for the **current parts list**.
- **Regenerate**: from **current parts list** (ordered) build the part token string and prefix block, then encode to B85.

### 7. Backpack Integration
- **Load from backpack**: filter main window’s inventory by **item type** (grenade / shield / repkit / heavy) and show only those items; on select, call same “load from item” logic (serial B85 + decoded → parse → parts list).
- **Add to backpack**: emit same signal as other tabs (`add_to_backpack_requested`) with serial + decoded; main window adds to backpack (item type already known from context).

### 8. Localization
- Reuse existing `grenade_tab`, `shield_tab`, `repkit_tab`, `heavy_weapon_tab` UI strings where applicable.
- Add keys for “Item Edit”, “Parts”, “Add part”, “Parse serial to show parts”, etc., under a new `item_edit_tab` section or re-use weapon_editor_tab labels where it makes sense.

---

## Implementation Outline

1. **New file**: `qt_item_edit_tab.py`
   - Class `ItemEditTab(QWidget)` with:
     - Item type selector (Grenade / Shield / Repkit / Heavy).
     - Load-from-backpack list (filtered by type), Serial B85, Decoded, Update, Add to backpack, flag combo.
     - Parts section: header + Refresh + Add part; **parts list layout** (current item parts); **open_add_part_dialog()** for the library.
   - Data loading: per type load the two CSVs; build a unified “all parts” list or grouped structure for the library and for lookup (typeId:partId → Part type, String, Stat).
   - Parsing: extract part codes from decoded string (same regex as weapon); resolve each code against current type’s data; fill `parts_data` and **display_parts()**.
   - Regenerate: from `parts_data` build part token string + prefix; set decoded; encode B85.
   - Parts library dialog: for current type, show collapsible categories (by Part_type or manufacturer), checkboxes per part; on confirm, append selected as part codes and refresh.

2. **main_window.py**
   - Import `ItemEditTab` (or `QtItemEditTab`).
   - In `_add_tabs()`, instantiate and add: `self.add_tab(self.item_edit_tab, self.loc['tabs']['item_edit'], "item_edit", "🛠️")`.
   - Add `item_edit` to `tab_keys` and default `loc['tabs']` (e.g. `'item_edit': 'Item Edit'`).
   - Connect `add_to_backpack_requested` and any `update_item_requested` if needed; ensure “load from backpack” can receive items of the selected type (reuse or mirror weapon editor’s backpack loading).

3. **Optional**: Refactor shared “parts list row” (part type, string, stat, move up/down, remove) into a small helper or widget used by both Weapon Edit and Item Edit to keep UI consistent.

4. **Localization**: Add `item_edit` (and optionally `item_edit_tab`) strings in `ui_localization*.json`.

---

## Summary

| Feature | Weapon Edit | Item Edit (target) |
|--------|-------------|--------------------|
| Tab name | Weapon Edit | Item Edit |
| Item types | Weapons only | Grenade, Shield, Repkit, Heavy (selector inside tab) |
| Parts library | Yes (by Weapon Type + Manufacturer) | Yes (by Part_type / category + manufacturer per type) |
| Current parts list | Yes (type, string, stat, reorder, remove) | Yes (same idea) |
| Load from backpack | Yes | Yes (filter by selected type) |
| Add part → dialog | Yes | Yes (same pattern) |
| Serial format | Decoded + B85 | Same style per existing grenade/shield/repkit/heavy |

This design reuses Weapon Edit’s patterns (parts library, current parts list, parse/regenerate) and applies them to the four non-weapon item types using their existing CSVs and serial formats.
