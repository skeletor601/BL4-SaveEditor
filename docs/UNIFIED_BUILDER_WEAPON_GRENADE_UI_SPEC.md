## Unified Builder UI/UX Spec (Weapon + Grenade)

This document captures the **current intended UI/UX patterns** for `UnifiedItemBuilderPage` (Unified Builder), based on the Weapon and Grenade sections. The goal is to replicate these patterns consistently for **Shield, Repkit, Heavy, Enhancement, Class Mod**, etc.

Source file: `web/src/pages/beta/UnifiedItemBuilderPage.tsx`

---

## Core principles (apply everywhere)

- **Themed controls only**: avoid native `<select>` dropdown lists for anything that looks like “part picking”. Use themed panels and themed modals so everything matches the app skin.
- **Mobile-first touch targets**: minimum height ~44px for tappable controls; spacing and scroll areas should not “trap” users.
- **Multi-select by default for parts**: “parts” are generally stackable; the UI should support selecting multiple entries per part-type unless the game/system truly enforces single choice.
- **Consistent add-from-database entry point**:
  - If a picker is for parts, the modal should include a **primary, visible** button at the top: **“➕ Add part from database…”** (opens the global DB picker modal).
  - This button should be in the **same location** across pickers (top of the modal content, above the list).
- **Quantity model consistency**:
  - Multi-select pickers follow: **Select parts → Add selected (N) → Quantity modal** (one qty applied to all selected).
  - Quantity defaults to `"1"` and clamps to `1..99`.
  - After apply, the selection closes and updates the build immediately.
- **Selected items are editable**:
  - After selecting parts, show them as a list under that part group with:
    - label (truncated safely)
    - per-entry qty input (except when the part type is intentionally single/qty-less)
    - remove button.

---

## Weapon tab: how it looks + how it works

### Header controls

The Weapon builder header is a horizontal group with themed controls:

- **Manufacturer**: themed **radio-list modal**, single-select (no qty, no DB).  
  Implementation: `showWeaponMfgModal`, opened by a button showing current selection.
- **Weapon type**: themed **radio-list modal**, single-select (no qty, no DB).  
  Implementation: `showWeaponTypeModal`, options filtered by manufacturer (`weaponTypesForManufacturer`).
- **Level** and **Seed**: numeric inputs (still native inputs, but visually themed via shared classes).
- **Actions**:
  - **Add other parts**: opens the global database picker modal `showAddPartsModal`.
  - **Random item**
  - **God roll**
  - **Auto fill**

### Part groups (core UX pattern)

Weapon parts are rendered as collapsible `details` groups. Each group includes:

- A **“Select parts…”** button that opens a themed modal for that part type.
- Selected entries displayed below with per-entry qty and remove.

### Part picker modal (multi-select “radio list”)

Weapon uses a dedicated picker modal controlled by:

- `weaponPartPickerPartType`
- `weaponPartPickerChecked`
- `weaponPartPickerShowQty`
- `weaponPartPickerQty`

Modal behavior:

- The list is a **themed “radio/checkbox circle”** (custom CSS class `weapon-part-radio`).
- Includes top button **“➕ Add part from database…”** which closes picker and opens `showAddPartsModal`.
- Footer button: **“Add selected (N)”**
  - If `partType === "Rarity"`, add immediately with qty `"1"` (no qty modal).
  - Else open qty modal and apply same qty to all selected.

### Add parts from database (global)

Weapon supports global database parts via `showAddPartsModal` and `appendToDecoded(tokens)`.

This modal is shared; it’s not weapon-specific. It should remain accessible from:

- Header action button “Add other parts”
- Inside every part picker modal via “➕ Add part from database…”

---

## Grenade tab: how it looks + how it works (target state)

Grenade has been aligned to the Weapon patterns so it should be the template for other non-weapon item tabs.

### Header controls

- **Manufacturer**: themed **radio-list modal**, single-select (no qty, no DB).  
  Implementation: `showGrenadeMfgModal` opened by a button.
- **Level** and **Seed**: numeric inputs.
- **Add other parts**: opens global `showAddPartsModal`.
- **Random item**, **God roll**, **Auto fill**.

### Grenade part groups (same as weapon)

Grenade uses the same “part groups” layout:

- `details` group per part type (Rarity, Legendary, Element, Firmware, Mfg Perk, Universal Perk)
- “Select parts…” button
- selected list with qty/remove (Rarity entries are qty-less by design)

### Grenade part picker modal (same structure as weapon)

Grenade picker state mirrors Weapon:

- `grenadePartPickerPartType`
- `grenadePartPickerChecked`
- `grenadePartPickerShowQty`
- `grenadePartPickerQty`

Modal behavior matches Weapon:

- Themed “radio list”
- “➕ Add part from database…”
- “Add selected (N)” with qty modal (except Rarity)

### “Mfg Perk” logic (important rule)

Grenade previously had **4 separate mfg perk dropdowns** (capped). The intended UX is:

- **One** “Mfg Perk” group
- **Multi-select, no cap** (works like weapon part groups)

### Grenade decoded build logic

Grenade build uses multi-select storage:

- `grenadePartSelections: Record<partType, {label, qty}[]>`

And build function:

- `buildDecodedFromGrenadeSelections(...)` (new) which:
  - Rarity: resolves label to ID from `raritiesByMfg`, adds `{id}`
  - Legendary: supports `{mfgId:partId}` style labels (cross-mfg grouping)
  - Mfg Perk: repeats `{id}` qty times
  - Element/Firmware/Universal Perk: grouped under type `245` as `{245:[...ids...]}` or `{245:id}`
  - Extra DB tokens appended after normal build tokens.

---

## “Add parts from database” coverage (current)

### Present

- **Weapon**:
  - Header “Add other parts”
  - Inside every part picker modal (“➕ Add part from database…”)
- **Grenade**:
  - Header “Add other parts”
  - Inside every part picker modal (“➕ Add part from database…”)

### Not present (by design)

- Manufacturer / Weapon type / Grenade manufacturer:
  - These are not “parts”; they should be themed single-select modals with no DB and no qty.

---

## Current build parts panel (all categories)

The **Current build parts** side panel is the canonical way to visualize and edit the first decoded line across Weapon, Grenade, Shield, Repkit, etc.

### Card layout (per part)

Each part card follows this vertical structure:

- **Row 1 – ID + name**:  
  `YY - Name of part/perk`  
  - `YY` is the inner id from `{XX:YY}` (the outer type or manufacturer `XX` is not shown).
  - If only a single-number token `{YY}` is present, `YY` is used directly.
- **Row 2 – Description / info / notes** (when Descriptive IDs are ON):  
  - Pulled from the builder data `description` fields when available (e.g., “Adds 200% damage to next shot when shields are full”).  
  - Falls back to the “stat” portion of the label (text after the first `" - "`), if no explicit description is provided.
- **Row 3 – Item type label (bottom of content)**:  
  - A short, lowercased type such as:
    - `rarity`, `element`, `firmware`
    - `legendary perk`, `universal perk`, `manufacturer perk`
    - `energy perk`, `armor perk`, `model`, etc.
  - This row is rendered **directly above** the qty/edit row and aligned:
    - Centered for `universal perk`
    - Left-aligned for all other types.
- **Row 4 – Qty row (bottom of card)**:  
  - Left: `×N` (or `x1` when qty is 1).  
  - Right: **“Edit qty”** button that opens the inline qty editor for that token.

### Behavior

- **Ordering**: up/down arrows on the left of each card reorder the parts; this rewrites the first decoded line and re-encodes Base85 automatically.
- **Removal**: the `×` button on the right of each card removes that token from the build.
- **Descriptive IDs toggle**:
  - When ON: show full `YY - Name`, description, and type label as described above.
  - When OFF: show just the raw resolved label (`getPartLabel`) and omit the extra description/type rows, keeping the cards more compact.

Internally, item types and descriptions are resolved per category:

- **Weapon**: via `weaponPartTypeByRaw` and `weaponPartDescriptionByRaw`.
- **Grenade**: via `grenadePartTypeByRaw` and `grenadePartDescriptionByRaw`.
- **Shield**: via `shieldPartTypeByRaw` and `shieldPartDescriptionByRaw`.
- **Repkit**: via `repkitPartDescriptionByRaw` (types will be added when Repkit is fully migrated).

These maps are keyed by the raw token form (`{typeId:partId}`, `{mfgId:partId}`, etc.) so the panel remains accurate regardless of how the item was constructed (Unified tabs, DB picker, or pasted decoded/Base85).

---

## RepKit tab: specifics and data notes

RepKit is now fully migrated to the unified pattern and has a few data-specific behaviors.

### Header and groups

- Header matches Shield style:
  - Manufacturer radio-list modal
  - Level / Seed inputs
  - Actions: Add other parts, Random item, God roll, Auto fill.
- Part groups (`REPKIT_PART_ORDER`):
  - `Rarity` (single entry, qty-less in UI but encoded once)
  - `Prefix` (single entry)
  - `Firmware` (single entry)
  - `Resistance` (multi-select with qty)
  - `Legendary Perks` (multi-select with qty; group label & picker header use this exact wording)
  - `Universal perks` (multi-select with qty)

Each group uses the standard **Select parts… → picker modal → optional qty popup → list with qty + remove** flow.

### RepKit picker labels

- **Primary data source**: `repkit/repkit_main_perk_EN.csv` and `repkit/repkit_manufacturer_perk[_EN].csv`.
  - Columns used: `Part_ID`, `Part_type`, `Name`, `Stat`, `Description`.
- **Universal perks** (`Perk`, `Splat`, `Nova`, etc. in the CSV):
  - Back-end builds `RepkitBuilderPart` as:
    - `stat` = `Name` (short name, e.g. `Everlasting`, `Shock Splat`)
    - `description` = `Stat`/`Description` and any extra text from the master CSV (`Stats`, `Effects`, `Comments`), concatenated.
  - UI label format:
    - If `description` is distinct from name: **`partId - Name - Description`**  
      e.g. `21 - Everlasting - +20% Capacity and Duration`
    - Otherwise: **`partId - Name`**.
- **Legendary perks**:
  - Built from manufacturer CSV; each row provides `partId`, `mfgId`, `mfgName`, `Stat` (used as the short name, e.g. `Chrome`, `Cardiac Shot`), and optional `Description`.
  - UI label format:
    - If `description` exists and differs from name: **`mfgId:partId - Name - Description`**
    - Else: **`mfgId:partId - Name`**.
  - Group label in the UI is **“Legendary Perks”** (not just “Legendary”).
- **Prefix / Firmware / Resistance**:
  - Use the same `Name` + `Description` pipeline as universal perks.
  - Labels are `partId - Name` or `partId - Name - Description` depending on data.

### RepKit decoded build logic (unified)

- Selections live in:
  - `repkitPartSelections: Record<string, { label: string; qty: string }[]>`.
- Build function:
  - `buildDecodedFromRepkitSelections(data, mfgId, level, seed, repkitPartSelections, repkitExtraTokens)`.
- Behavior:
  - `Rarity` → resolve label to id via `raritiesByMfg[mfgId]`, push `{id}` once.
  - `Prefix` / `Firmware` → take the first selection each, resolve to `partId` and add once to type 243.
  - `Resistance`:
    - Multiple selections, each with qty, expanded into ids under type 243.
    - Also sets boolean flags (`hasCombustion`, `hasRadiation`, etc.) to add the appropriate “model plus” ids.
  - `Universal perks` → ids expanded by qty and appended to type 243.
  - `Legendary Perks`:
    - Same cross-manufacturer handling as the original `buildDecodedFromRepkitSlots`: local mfg legendaries become `{id}`, others grouped as `{mfgId:[ids...]}`.
  - `modelsByMfg[mfgId]` still contributes a `{modelId}` token after rarity.
  - Any `extraTokens` from the DB picker are appended at the end.

---

## Enhancement tab: specifics and data notes

Enhancement in the Unified Builder mirrors the standalone Enhancement builder, but with the unified **part-groups + picker modal** UX and the shared Current build parts panel.

### Header and groups

- Header matches other accessory tabs:
  - Manufacturer radio-list modal (from `EnhancementBuilderData.manufacturers`).
  - Level / Seed inputs (shared global state).
  - Actions: **Add other parts**, **Random item**, **God roll** (wired, optional data).
- Part groups (`ENHANCEMENT_PART_ORDER`):
  - `Rarity` (single; qty fixed to 1 in UI and encoded once).
  - `Manufacturer perks` (multi-select; indices 1/2/3/9 from the selected manufacturer).
  - `Legendary Perks` (UI label; internally keyed as `Stacked perks`):
    - Multi-select of other manufacturers’ perks (indices 1/2/3/9), grouped by manufacturer.
  - `Universal Perks` (UI label; internally keyed as `Builder 247`):
    - Multi-select of “247” stats (secondary_247) from the Enhancement builder data.

Each group uses the standard **Select parts… → picker modal → optional qty popup → list with qty + remove** flow. Quantity is:

- Fixed to `"1"` for `Rarity`.
- Editable per-entry (1–99) for all other groups.

### Enhancement picker labels

- **Primary data source**: `GET /accessories/enhancement/builder-data` → `EnhancementBuilderData`:
  - `manufacturers: Record<string, { code, name, perks, rarities }>`
  - `rarityMap247: Record<string, number>`
  - `secondary247: { code, name }[]`
- **Rarity**:
  - Labels are just the rarity names (e.g. `Common`, `Rare`, `Legendary`) taken from `rarities` for the current manufacturer, ordered by `ENHANCEMENT_RARITY_ORDER`.
- **Manufacturer perks**:
  - For the current manufacturer, filter `perks` to `index ∈ [1,2,3,9]`.
  - Label format: **`[index] Name`**, e.g. `[1] Sure Shot`.
- **Legendary Perks** (Stacked perks):
  - For every *other* manufacturer, again filter `perks` to indices `1/2/3/9`.
  - Label format: **`mfgCode:index - Name — MfgName`**, e.g. `284:1 - Sure Shot — Atlas`.
- **Universal Perks** (Builder 247):
  - From `secondary247`, label format: **`code - Name`**, e.g. `101 - Fire Rate Boost`.

### Enhancement decoded build logic (unified)

- Selections live in:
  - `enhancementPartSelections: Record<string, { label: string; qty: string }[]>`.
- Build function:
  - `buildDecodedFromEnhancementSelections(data, mfgName, level, seed, enhancementPartSelections, enhancementExtraTokens)`.
- Behavior:
  - **Header**: `mfg.code, 0, 1, level| 2, seed||`.
  - **Rarity**:
    - Resolve label via `manufacturers[mfgName].rarities[rarityLabel]` → push `{rarityId}`.
    - Also resolve 247 rarity via `rarityMap247[rarityLabel]` → push `{247:rarity247Id}` if present.
  - **Manufacturer perks**:
    - Parse each label’s `index` from `[index] Name`; add `{index}` once per unique index (UI ignores per-entry qty here, matching the standalone builder).
  - **Legendary Perks** (Stacked perks):
    - Parse each label’s leading `mfgCode:index` and expand by qty:
      - Group into `stackedPerks: Record<mfgCode, number[]>`.
      - For each `mfgCode`, push `{mfgCode:[idx1 idx2 …]}` with ids sorted ascending.
  - **Universal Perks** (Builder 247):
    - Parse `code` from `code - Name` and expand by qty.
    - If there is at least one, push a single `{247:[code1 code2 …]}` token.
  - **Extra tokens**:
    - Any tokens from the global “Add other parts” modal (for category `enhancement`) are appended after the core Enhancement tokens.

Enhancement uses the shared Current build parts panel with the same **Descriptive IDs** rules; there is no special per-token override map yet (labels come from the universal `parts/data` lookup or raw tokens).

---

## Heavy tab: specifics and data notes

Heavy in the Unified Builder mirrors the standalone Heavy builder logic but uses the unified **part-groups + picker modal** UX and the shared Current build parts panel.

### Header and groups

- Header matches other accessory tabs:
  - Manufacturer radio-list modal (from `HeavyBuilderData.mfgs`).
  - Level / Seed inputs (shared global state).
  - Actions: **Add other parts**, **Random item**, **God roll** (if presets exist in `heavyBuilderData.godrolls`).
- Part groups (`HEAVY_PART_ORDER`):
  - `Rarity` (single; qty fixed to 1 in UI and encoded once, using per-manufacturer rarities).
  - `Element` (single; element type applied to the heavy).
  - `Firmware` (single; firmware perk).
  - `Barrel` (single; main barrel model).
  - `Barrel Accessory` (multi-select; stackable perks).
  - `Body Accessory` (multi-select; stackable perks).

All groups use the standard **Select parts… → picker modal → optional qty popup → list with qty + remove** flow. Quantity is:

- Fixed to `"1"` for `Rarity`, `Element`, `Firmware`, and `Barrel` (one of each).
- Editable per-entry (1–99) for `Barrel Accessory` and `Body Accessory`.

### Heavy picker data and labels

- **Primary data source**: `GET /accessories/heavy/builder-data` → `HeavyBuilderData`:
  - Built by `api/src/data/heavyBuilder.ts` from:
    - Per-manufacturer CSV: `heavy/heavy_manufacturer_perk_EN.csv`
    - Master TSV: `heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv`
  - Shapes:
    - `mfgs: { id, name }[]`
    - `raritiesByMfg: Record<mfgId, HeavyBuilderRarity[]>`
    - `barrel: HeavyBuilderPart[]`
    - `element: HeavyBuilderPart[]`
    - `firmware: HeavyBuilderPart[]`
    - `barrelAccPerks: HeavyBuilderPart[]`
    - `bodyAccPerks: HeavyBuilderPart[]`
    - `bodiesByMfg: Record<mfgId, modelId | null>`
- Label rules:
  - `Rarity`: take display text from `raritiesByMfg[mfgId]`, ordered by rarity; labels are the raw `label` strings.
  - `Element` / `Firmware`: labels are `"partId - stat"` using `HeavyBuilderPart.partId` and `stat`.
  - `Barrel`: labels are `"partId - stat"`; `stat` text comes from manufacturer CSV plus merged master TSV descriptions.
  - `Barrel Accessory`:
    - `heavyBuilder` composes a desktop-style stat string:  
      `"<barrel subtype> - <stat> - <description> - ID:<part_id>"`.
    - Picker labels are `"partId - stat"`, where `stat` already includes the subtype and concise description.
  - `Body Accessory`:
    - `heavyBuilder` composes: `"<manufacturer> - <stat> - ID:<part_id>"`.
    - Picker labels are again `"partId - stat"`.

### Heavy decoded build logic (unified)

- Selections live in:
  - `heavyPartSelections: Record<string, { label: string; qty: string }[]>`.
- Build function:
  - `buildDecodedFromHeavySelections(data, mfgId, level, seed, heavyPartSelections, heavyExtraTokens)`.
- Behavior (high level):
  - **Header**: use `HEAVY_TYPE_ID` (244) + manufacturer id + level/seed in the same header pattern as other accessories.
  - **Rarity**:
    - Resolve rarity id by matching the label against `raritiesByMfg[mfgId]` → push `{rarityId}` once.
  - **Barrel / Element / Firmware**:
    - Parse leading `partId` from labels like `"id - stat"`.
    - Push the corresponding heavy tokens once each (matching the standalone heavy encoding).
  - **Barrel Accessory / Body Accessory**:
    - Parse `partId` from labels; expand by qty and push tokens in the correct type slots, preserving the same semantics as the original heavy builder.
  - **Extra tokens**:
    - Any tokens from the global “Add other parts” modal (for category `heavy`) are appended after the core Heavy tokens into `heavyExtraTokens`.

### Heavy + Descriptive IDs / part names

- **Base labels** for the Current build parts panel come from the universal parts DB:
  - `GET /api/parts/data` → `universalParts` → `partsByCode: Map<code, label>`.
  - Universal DB is generated by `tools/build_universal_parts_db.py` using:
    - `master_search/db/sources/parts_database_canon_v2_split_columns.csv`
    - category CSVs (`Borderlands 4 Item Parts Master List - *.csv`, heavy TSV, app CSVs, etc.)
    - merged reference data from:
      - `tools/merge_embedded_parts_into_databases.py` (embedded_parts_export.csv → category CSVs + rebuild universal)
      - `tools/merge_reference_save_editor_into_db.py` (RARITY_TSV from `reference htmls/save-editor.html`)
      - `tools/merge_item_editor_html_into_db.py` (EMBEDDED_GAME_DATA_BASE64 from `Borderlands Item Editor and Save Editor.html`).
- **Heavy-specific description and part-type overrides**:
  - `heavyPartDescriptionByRaw: Map<string, string>` and `heavyPartTypeByRaw: Map<string, string>` are built from `HeavyBuilderData` and used when `category === "heavy"`:
    - If a decoded token code (e.g. `{282:14}`) is found in `heavyPartDescriptionByRaw`, the Current build parts list shows the shorter, merged heavy description instead of the generic universal DB label.
    - `heavyPartTypeByRaw` tells the panel whether to show it as “Barrel”, “Barrel Accessory”, “Body Accessory”, etc.
- **Angel's Share card fix**:
  - The heavy perk `{282:14}` now has a proper perk name **“Angel's Share”** in the canonical source:
    - `master_search/db/sources/parts_database_canon_v2_split_columns.csv` row for `{282:14}` was updated so its name/label column contains `Angel's Share`.
  - After rebuilding the universal DB (`python -m tools.build_universal_parts_db`), the Heavy tab’s Current build parts list displays this code as:
    - `14 – Angel's Share` at the top of the card, with the full cooldown description shown below.

---

## Implementation checklist for other tabs (Shield / Repkit / Heavy / Enhancement / Class Mod)

For each new tab section, implement in this order:

1. **Header**:
   - Manufacturer as themed radio-list modal (single-select)
   - Any other “category selectors” (e.g., shield type) as themed radio-list modal (single-select)
   - Level/Seed inputs
   - Header actions include “Add other parts” → `showAddPartsModal`

2. **Part groups**:
   - Represent each part bucket as a `details` group like Weapon/Grenade.
   - Use the same **Select parts…** button → opens a picker modal.
   - Always render a selected list with qty/remove.

3. **Picker modal**:
   - Mirror the Weapon/Grenade picker modal structure:
     - Themed header + close
     - “➕ Add part from database…” button at top
     - Themed radio list items
     - Footer “Add selected (N)”
     - Qty modal stage for non-rarity part types

4. **Data model**:
   - Store selections as:
     - `Record<string, { label: string; qty: string }[]>`
   - Only deviate if a part type is *truly* “only one allowed” (rare; avoid unless required).

5. **Build function**:
   - Create `buildDecodedFrom<X>Selections(...)` analogous to grenade:
     - Resolve labels → part IDs
     - Group tokens by type IDs
     - Apply qty expansion rules
     - Append global DB extra tokens

6. **Auto-fill + random**:
   - Update these helpers to write into the new selection structure (arrays of `{label, qty}`), not old slot-based maps.

---

## Class Mod tab: high-level plan

Class Mods will be the most complex because they mix:

- Manufacturer, character/class, and sometimes **tree-specific** bonuses.
- Multiple perk “slots” with unique rules (e.g. fixed vs. random perks, caps on how many can roll).
- Overlaps with weapon/shield stats (kill skills, action skill bonuses, etc.).

### Data model (target)

- **Builder data endpoint**: `GET /accessories/class-mod/builder-data` returning:
  - `mfgs: { id, name }[]`
  - `classes: { id, name }[]` (or embedded into `mfgTypeById`-style map if needed)
  - `raritiesByMfg: Record<mfgId, { id, label }[]>`
  - `primaryPerks: ClassModBuilderPart[]` (core class mod effects)
  - `secondaryPerks: ClassModBuilderPart[]` (kill skills, stat boosts)
  - `treePerks: ClassModBuilderPart[]` (if some perks are locked to a skill tree)
  - `universalPerks: ClassModBuilderPart[]` (shared perks usable on any class)
  - `legendaryPerks: ClassModBuilderLegendaryPart[]` (if there are class-mod-specific legendaries)
  - `modelsByMfgClass?: Record<key, number | null>` if the base model depends on both mfg + class.

Each `ClassModBuilderPart` should mirror the other builders:

- `partId: number`
- `stat: string` (short name)
- `description?: string` (full effect text)

### UI structure

- **Header**:
  - Manufacturer radio modal.
  - Class/character radio modal (e.g. “Sirena”, “Ripper”, etc.).
  - Level / Seed.
  - Actions: Add other parts, Random item, God roll (if presets exist), Auto fill.

- **Part groups** (example target set):
  - `Rarity` (single)
  - `Primary Perks` (multi-select, small cap per design, e.g. 1–3)
  - `Secondary Perks` (multi-select, cap per design)
  - `Tree Perks` (optional, grouped by tree if necessary)
  - `Universal Perks` (shared pool across classes)
  - `Legendary Perks` (if class-specific legendary COMs exist)

Each group will still use the **same part-group + picker modal pattern** as Weapon/Grenade/Shield/Repkit:

- “Select parts…” → picker modal with:
  - “➕ Add part from database…” on top.
  - Radio-style multi-select list.
  - “Add selected (N)” button → qty modal for stackable types.
- Selected chips under each group with label + qty + remove.

### Decoded build logic (sketch)

Class Mods will get their own builder:

- `buildDecodedFromClassModSelections(data, mfgId, classId, level, seed, selections, extraTokens)`

Responsibilities:

- Map `Rarity` label → rarity id, push `{id}`.
- Determine the base model id (may depend on mfg + class).
- Gather perk ids into appropriate type tokens:
  - e.g. `{TYPE_PRIMARY:[ids...]}`, `{TYPE_SECONDARY:[ids...]}`, `{TYPE_TREE:[ids...]}`, etc.
  - Expand based on qty where the game supports stacking.
- Integrate cross-manufacturer or cross-class legendary logic if present.
- Append DB `extraTokens` at the end.

### Open questions / to resolve when implementing

- Exact type IDs and limits for:
  - How many primary/secondary perks a COM can legitimately roll.
  - Whether some perks are **exclusive** to certain classes or trees.
- How the existing save-editor encodes class mods (we’ll likely mirror its scheme the way we did for Repkits, using its CSVs/TSVs as the ground truth).

Once those details are clarified from the reference CSVs/HTML, Class Mods can be wired using the same **Unified Builder + Current build parts** patterns already proven for Weapon, Grenade, Shield, and Repkit.

---

## Known remaining inconsistencies (future work)

- Weapon Skin selector still uses a native `<select>`; it should eventually become a themed picker like the others.
- Shield/Repkit sections currently still follow older “dropdown + special modal” patterns; they should be migrated to the same “part group + unified picker modal” model.

