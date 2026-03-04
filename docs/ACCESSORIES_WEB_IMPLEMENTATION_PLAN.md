# Accessories Web Implementation Plan

This plan brings the desktop Accessories tab (from Borderlands4-SaveEditor) to the web app: **Class Mod**, **Enhancement**, **RepKit**, **Grenade**, **Shield**, and **Heavy** — each with a **UI builder** that matches the desktop (dropdowns, quantity/multiplier, list pickers, decode ↔ Base85 sync, Add to Backpack).

---

## 1. What the Accessories Tab Leads To (Desktop Source)

**main_window.py** (desktop):

- **Section:** `SECTION_ACCESSORIES` → `SectionWithSubNav` with 6 sub-tabs:
  1. **Class Mod** → `QtClassModEditorTab`
  2. **Enhancement** → `QtEnhancementEditorTab`
  3. **RepKit** → `QtRepkitEditorTab`
  4. **Grenade** → `QtGrenadeEditorTab`
  5. **Shield** → `QtShieldEditorTab`
  6. **Heavy** → `QtHeavyWeaponEditorTab`

- Each tab: `add_to_backpack_requested.emit(serial, flag)` for adding the built item to the save.
- Web already has **AccessoriesPage** with the same 6 routes (`class-mod`, `enhancement`, `repkit`, `grenade`, `shield`, `heavy`) but currently all render a **single generic AccessoryEditView** (decode/encode + add to backpack, no builder).

---

## 2. Desktop UI Builder Pattern (Per Subcategory)

Common pattern across **Grenade**, **RepKit**, **Shield**, **Heavy** (and partly Enhancement):

1. **Output group**
   - Raw (decoded) text area + Copy.
   - Base85 text area + Copy + Flag combo + **Add to Backpack**.
   - Two-way sync: editing decoded updates Base85; editing Base85 updates decoded (weapon-tab style).

2. **Base attributes**
   - **Manufacturer** dropdown (mfg_id) — drives rarity and mfg-specific perks.
   - **Level** (e.g. 50).
   - **Rarity** dropdown (populated from mfg + Part_type Rarity).

3. **Perks / parts**
   - **Scrollable radio groups** (single choice): e.g. Element, Firmware, Prefix, Resistance, Barrel.
   - **Scrollable checkbox groups** (multi): e.g. Mfg Perks.
   - **Dual list boxes** (available ↔ selected) with:
     - **Multiplier/quantity** (1–999) for “add with quantity”.
     - **» / «** move buttons, **Clear**.
     - Optional “(N) Name” stacking in selected list (e.g. “(3) Some Perk”).
   - **Legendary** list: same dual-list, often single-select; items store `(part_id, manufacturer_id)` for cross-mfg legendaries (output as `{mfg_id:part_id}` or `{part_id}` when same mfg).
   - **Universal** list: dual-list with multiplier; part_id under a fixed type_id (e.g. 245).

4. **Decoded string format (example: Grenade)**
   - Header: `{mfg_id}, 0, 1, {level}| 2, 305||`
   - Parts: rarity `{rarity_id}`, legendary/universal/mfg perks, then element/firmware under type 245: `{245:[id1 id2]}` or `{245:id}`.
   - Legendary from other mfg: `{other_mfg_id:part_id}` or `{other_mfg_id:[...]}`.

5. **Data source**
   - Each tab loads **main + manufacturer CSVs** (e.g. `grenade_main_perk`, `manufacturer_rarity_perk`).
   - Columns used: Manufacturer ID, Part_type (Rarity, Perk, Legendary Perk, Element, Firmware, etc.), Part_ID, Stat, Description.
   - When **master list** CSVs exist (e.g. “Borderlands 4 Item Parts Master List - Grenades.csv”), desktop can be extended to use them; web **item-edit** API already prefers master list when present.

**Enhancement** tab: manufacturer + rarity dropdowns, level; **perks grid** (checkboxes per manufacturer); **stacking** dual-list with multiplier; **“Builder 247”** dual-list with multiplier. Different CSV layout (enhancement_data).

**Class Mod** tab: **Class** (Amon, Harlowe, Rafa, Vex), **Rarity**, **Name**; **Legendary** list; **Skills** tree/table with **per-skill point widgets** (Min / − / value / + / Max) and **skill images** (Phase 4); **Perks** list. Uses class_mods CSVs + JSON (Skills, Class_perk, Class_rarity_name, Class_legendary_map). Images for skills are a Phase 4 add.

---

## 3. Merge New Databases Into Master Data for Builders

You added **master list** CSVs (and one TSV) per category. Web already uses them for **item-edit** (decode/edit existing items). For **builders**, we need one coherent data source per category:

| Category   | Existing CSVs | New master list you added | Action |
|-----------|----------------|----------------------------|--------|
| Grenade   | grenade_main_perk, manufacturer_rarity_perk | `Borderlands 4 Item Parts Master List - Grenades.csv` | Already used by item-edit API. Use same source for **accessories/grenade** builder (single API that returns “builder” shape: mfg list, rarity by mfg, perks by part_type, etc.). |
| Shield    | shield_main_perk, manufacturer_perk | `Borderlands 4 Item Parts Master List - Shields.csv` | Same: single API for builder data, prefer master list when present. |
| RepKit    | repkit_main_perk, repkit_manufacturer_perk | `Borderlands 4 Item Parts Master List - Repkits.csv` | Same. |
| Heavy     | heavy_main_perk, heavy_manufacturer_perk | `Borderlands 4 Item Parts Master List - Heavy Weapons.tsv` | Add TSV support in API (or convert TSV→CSV once). Point heavy builder to same “heavy parts” API. |
| Enhancement | Enhancement_perk, Enhancement_manufacturers, Enhancement_rarity | (none in glob; add if you have one) | Enhancement builder can use existing enhancement CSVs; if you add a master list later, merge same way. |
| Class mod | Class_perk, Class_rarity_name, Skills, Class_legendary_map + JSON | (class_mods already has CSVs + JSON) | No new “master list” required; use existing class_mods data. |

**Concrete merge steps:**

1. **Heavy:** Support `heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv` in API (read TSV, same column mapping as CSV: Type ID, ID, Name, Part String, Stats, etc.) so heavy item-edit and heavy builder share one source.
2. **Enhancement:** If you add a “Borderlands 4 Item Parts Master List - Enhancements.csv” (or similar), add it under `enhancement/` and have enhancement builder (and item-edit if we add enhancement there) use it when present.
3. **Grenade / Shield / RepKit:** Already have master list CSVs; **no file merge** needed — just ensure **builder API** loads the same data (master list preferred, fallback to main+mfg CSVs) and exposes a **builder-specific shape** (mfgs, rarities per mfg, part types, lists of perks with part_id, type_id, label, etc.).

So “merge” here means: **one data pipeline per category** (master list if present, else legacy CSVs), and **one API route per category** that returns data in the shape the **web UI builder** needs (not only the flat “parts list” used by item-edit).

---

## 4. Implementation Order and Grenade-First Plan

### Phase 1 – Data and API for builders

1. **Accessory builder data API (per category)**
   - Add e.g. `GET /accessories/grenade/builder-data` that returns:
     - `mfgs`: `{ id, name }[]`
     - `raritiesByMfg`: `Record<mfgId, { id, label }[]>`
     - `partTypes`: e.g. `{ element: PartRow[], firmware: PartRow[], mfgPerks: PartRow[], legendary: PartRow[], universal: PartRow[] }` (or equivalent) so the web can render dropdowns and lists.
   - Reuse existing item-edit data loading (master list or main+mfg CSVs) and **reshape** for builder (group by Part_type, by Manufacturer ID, etc.).
   - Repeat pattern for shield, repkit, heavy (and enhancement/class mod with their own shapes).

2. **Heavy master list**
   - Add TSV reader where we currently only have CSV (or convert Heavy Weapons.tsv to CSV once) and point heavy builder + item-edit to it.

3. **Optional: merge script**
   - If you want to physically merge “new” CSVs into existing ones (e.g. merge “Borderlands 4 Item Parts Master List - Grenades.csv” rows into a single “grenade_parts.csv”), we can add a small script; functionally we already “merge” by preferring master list when present in code.

### Phase 2 – Grenade builder (first tab)

1. **Route**
   - Keep `/accessories/grenade` but render a **GrenadeBuilderView** (or `AccessoryGrenadeView`) instead of the generic AccessoryEditView when the sub-route is `grenade`.

2. **UI (match desktop)**
   - **Output:** Raw (decoded) + Base85 text areas; Copy for each; Flag combo; Add to Backpack.
   - **Two-way sync** between decoded and Base85 (same pattern as Weapon Edit / Item Edit).
   - **Base attributes:** Manufacturer dropdown, Level input, Rarity dropdown (options from API, dependent on manufacturer).
   - **Perks:**
     - **Mfg Perks:** checkboxes (multi), from API for selected mfg.
     - **Element:** radio (single), from main CSV Part_type Element.
     - **Firmware:** radio (single), from main CSV Part_type Firmware.
     - **Legendary:** dual list (available ↔ selected), single-select; items have (part_id, mfg_id); in rebuild, same-mfg as `{part_id}`, other-mfg as `{mfg_id:part_id}` or `{mfg_id:[...]}`.
     - **Universal:** dual list with **quantity/multiplier** (1–999); move »/«, Clear; selected items can show “(N) Name”; part_id under type 245 in decoded string.

3. **Rebuild decoded string (same logic as desktop)**
   - Header: `{mfg_id}, 0, 1, {level}| 2, 305||`
   - Append rarity: `{rarity_id}` if selected.
   - Append mfg perks: `{part_id}` for each checked.
   - Legendary: same mfg → `{part_id}`; other mfg → `{mfg_id:part_id}` or list form.
   - Universal: `{245:[...]}` or `{245:id}` (group by type 245).
   - Element + Firmware: collect part_ids, emit `{245:[...]}` or `{245:id}`.
   - Trailing space + `|`.
   - On any change (mfg, level, rarity, checkboxes, radio, list changes), run rebuild and update decoded then encode to Base85.

4. **Add to Backpack**
   - Same as today: send current Base85 + flag to save API; show message on success/failure.

5. **Copy / Clean Code (optional)**
   - Copy decoded / Base85; optional “Clean Code” button reusing existing Clean Code dialog (group like codes).

### Phase 3 – Other builders (Shield, RepKit, Heavy, Enhancement, Class Mod)

- **Shield:** Same pattern; different mfg_ids, part types (Element, Firmware, Legendary, Energy, Armor, Universal), same dual-list + multiplier where applicable.
- **RepKit:** Same pattern; part types (Prefix, Resistance, Firmware, Legendary, Universal).
- **Heavy:** Same pattern; part types (Barrel, Element, Firmware, Barrel Acc, Body Acc, etc.); use heavy builder API + heavy master list (TSV supported).
- **Enhancement:** Manufacturer + Rarity + Level; perk checkboxes by mfg; stacking list with multiplier; “Builder 247” list with multiplier; different decoded format — implement from qt_enhancement_editor_tab.py.
- **Class Mod:** Class, Rarity, Name; Legendary list; **Skills** (tree/table + point widgets); Perks list; decoded format from class mod encoder. **Phase 4** can add skill images.

### Phase 4 – Class Mod skill images

- Load skill images (paths or URLs) from the same place as desktop (e.g. class_mods skill assets).
- Render in the skills section of the Class Mod builder.

---

## 5. Grenade Builder – Data Shape (Example)

**API `GET /accessories/grenade/builder-data`** could return:

```ts
{
  mfgs: [ { id: 291, name: "Vladof" }, ... ],
  raritiesByMfg: {
    291: [ { id: 1, label: "Common - ..." }, { id: 2, label: "Uncommon - ..." }, ... ]
  },
  element: [ { partId: 24, stat: "Corrosive Status", description: "..." }, ... ],
  firmware: [ { partId: 1, stat: "God Killer", description: "..." }, ... ],
  universalPerks: [ { partId: 21, stat: "Duration Augment", ... }, ... ],
  legendaryPerks: [ { partId: 7, mfgId: 291, stat: "Blockbuster", mfgName: "Vladof", ... }, ... ]
}
```

For “Mfg Perks” we need **per-mfg** lists; that’s either:

- Return `mfgPerks: Record<mfgId, PartRow[]>` and the frontend uses `mfgPerks[mfgId]` when manufacturer changes, or
- Frontend calls `GET /accessories/grenade/builder-data?mfg=291` to get perks for that mfg.

Same idea for **rarity** options (per mfg): either in `raritiesByMfg` or a single list when mfg is selected.

---

## 6. File and Route Layout (Web)

- **Pages:** Keep `AccessoriesPage.tsx`; add one view per subcategory:
  - `accessories/GrenadeBuilderView.tsx`
  - `accessories/ShieldBuilderView.tsx`
  - `accessories/RepkitBuilderView.tsx`
  - `accessories/HeavyBuilderView.tsx`
  - `accessories/EnhancementBuilderView.tsx`
  - `accessories/ClassModBuilderView.tsx`
- **Routing:** In `AccessoriesPage`, render the corresponding builder view per route (e.g. `path="grenade"` → `GrenadeBuilderView`), so each sub-tab has its own UI and data.
- **API:** New route group under e.g. `/accessories`:
  - `GET /accessories/grenade/builder-data`
  - `GET /accessories/shield/builder-data`
  - … (and optionally `?mfg=...` for per-mfg data where it simplifies the response).

---

## 7. Summary Checklist

| # | Task | Notes |
|---|------|------|
| 1 | Examine Accessories → sub-tabs | Done: Class Mod, Enhancement, RepKit, Grenade, Shield, Heavy. |
| 2 | Examine each py tab’s UI builder | Done: output group, base attrs, radio/checkbox/dual-list, multiplier, rebuild_output logic. |
| 3 | Merge new DBs | Prefer master list per folder when present; add TSV for heavy; single builder-data API per category. |
| 4 | Grenade builder first | New API + GrenadeBuilderView: mfg/level/rarity, mfg perks (checkboxes), element/firmware (radio), legendary (dual-list), universal (dual-list + qty); rebuild decoded string; sync Base85; Add to Backpack. |
| 5 | Then Shield, RepKit, Heavy | Same pattern, category-specific part types and decoded format. |
| 6 | Enhancement builder | Mfg/rarity/level, perk grids, stacking + Builder 247 lists with multiplier. |
| 7 | Class Mod builder | Class/rarity/name, legendary, skills (point widgets), perks; Phase 4 add skill images. |

Once this plan is agreed, the next step is **implementing the Grenade builder** (API + GrenadeBuilderView + rebuild logic) so the web matches the desktop grenade tab behavior, including quantity on dropdowns and all important parts.
