# Weapon Generator (Wpn Gen) – Rebuild Plan

This document is the **authoritative plan** to rebuild the web Weapon Gen so it matches the desktop EXE in structure, data, and behavior. No UI code should be written until this plan is agreed and dataset/API are verified.

---

## 1. Desktop EXE – What It Uses (Verified from Source)

### 1.1 Data sources (all under app resource root)

| Purpose | Desktop path | File | Notes |
|--------|---------------|------|------|
| **Weapon parts** | `weapon_edit/` | `all_weapon_part.csv` or `all_weapon_part_EN.csv` | Primary Weapon Gen DB. Columns: `Manufacturer & Weapon Type ID`, `Manufacturer`, `Weapon Type`, `Part ID`, `Part Type`, `String`, `Stat`, `Description`. |
| **Elemental** | `weapon_edit/` | `elemental.csv` | Columns: `Elemental_ID`, `Part_ID`, `Stat`. Same for all manufacturers/types. |
| **Rarity** | `weapon_edit/` | `weapon_rarity.csv` | Columns: `Manufacturer & Weapon Type ID`, `Manufacturer`, `Weapon Type`, `Part ID`, `Part Type`, `Stat`, `Description`. Rarity = unique `Stat` (Common, Uncommon, Rare, Epic, Legendary). Legendary Type = rows where `Stat == 'Legendary'`, display `Part ID - Description`. |
| **God rolls** | app root | `godrolls.json` | `[{ "name": "...", "decoded": "...|" }]`. |
| **Skins list** | 1) `master_search/db/weapon_skins.json` 2) fallback `master_search/scarlett.html` (SKINS2) | List of `{ label, value }`. | Same as Master Search / Scarlett. |
| **Skin images** | `master_search/skin_images/` | `<token>.png` | e.g. `Cosmetics_Weapon_Mat02_LavaRock.png`. Special: `Cosmetics_Weapon_Shiny_*` (except Ultimate) → use `Cosmetics_Weapon_Shiny_bloodstarved.png`. |

The desktop **Weapon Generator uses only** the above. It does **not** use Master Search’s universal_parts_db / community_parts_db for the part dropdowns; those are for the Master Search tab. The **dedicated Weapon Gen dataset** is `weapon_edit/all_weapon_part*.csv` + `weapon_edit/elemental.csv` + `weapon_edit/weapon_rarity.csv`.

### 1.2 Filtering and IDs

- **Manufacturer** and **Weapon Type** are chosen from unique values in `all_weapon_part` (same CSV).
- **Manufacturer & Weapon Type ID** (`m_id`) = single integer per (Manufacturer, Weapon Type), from that CSV.
- All part dropdowns (except Element 1/2) are filtered by `m_id`: only rows where `Manufacturer & Weapon Type ID == m_id`. Element 1/2 use `elemental.csv` as-is (no m_id filter).
- Rarity / Legendary Type options come from `weapon_rarity.csv` filtered by the same `m_id`.
- Part IDs in the decoded string are the numeric `Part ID` from the CSV (or `Part_ID` for elemental). Element format in decoded string: `{1:part_id}`. Other parts: `{part_id}`.

### 1.3 Desktop UI layout (top → bottom, vertically scrollable)

1. **Output (read-only)**  
   - Two areas in a grid: **Deserialized** (multi-line, min 6 / max 24 lines), **Base85** (multi-line, min 5 / max 18 lines).  
   - Updated whenever the builder state changes (or when “Add to Gun” is used for skin).

2. **Controls (one row)**  
   - Manufacturer (combo), Weapon Type (combo), Level (input), Seed (input), 🎲 random-seed button.

3. **Parts (scrollable)**  
   - One **scroll area** containing a **grid** of **GroupBoxes**. Each group has a **title** (part type name) and **one or more dropdowns** inside.  
   - Grid positions (row, col) from `PART_LAYOUT`:
     - (0,0) Rarity | (0,1) Legendary Type  
     - (1,0) Element 1 | (1,1) Element 2  
     - (2,0) Body | (2,1) Body Accessory (4 slots)  
     - (3,0) Barrel | (3,1) Barrel Accessory (4 slots)  
     - (4,0) Magazine | (4,1) Stat Modifier  
     - (5,0) Grip | (5,1) Foregrip  
     - (6,0) Manufacturer Part (4 slots) | (6,1) Scope  
     - (7,0) Scope Accessory (4 slots) | (7,1) Underbarrel  
     - (8,0) Underbarrel Accessory (3 slots)  
   - Rarity combo: values = **Stat** only (Common, Uncommon, Rare, Epic, Legendary), not “Part ID - Stat”.  
   - When Rarity = “Legendary”, **Legendary Type** group is shown; its combo = “Part ID - Description”.  
   - Other part combos: “Part ID - Stat” or “Part ID” when Stat empty.  
   - Multi-slot groups: multiple combos stacked in the same GroupBox (e.g. 4× Body Accessory).

4. **Action row**  
   - Select Flag (combo: 1, 3, 5, 17, 33, 65, 129 with labels), God Roller (button), Check for Updates (button), Add to Backpack (button).

5. **Skin section (at bottom)**  
   - GroupBox “Skin”:  
     - Skin dropdown (min width ~260px).  
     - When a skin is selected and an image exists: **preview frame** with image (e.g. 240×120), skin name, token text, hint (“Tip: images live in master_search/skin_images/<token>.png”), and **“Add to Gun”** button.  
   - **“Add to Gun”** = take current weapon’s decoded string, append the skin block (`"c", "<token>" |`), re-encode to Base85, and **write the result into the Deserialized and Base85 read-only areas**. So the skin code is effectively “pasted” into the builder output.  
   - Clicking the preview image can open a fullscreen lightbox (optional for web).

### 1.4 Build → decode/Base85 flow

- **Header:** `{m_id}, 0, 1, {level}| 2, {seed}||`
- **Parts order:** Rarity (or Legendary Type if Legendary) → Element 1 → Element 2 → all other part combos. Format: `{part_id}` or `{1:part_id}` for elements.
- **Trailing:** ` |` then, if skin applied, append ` "c", "<token>" |`.
- Full decoded string is encoded with `b_encoder.encode_to_base85()` and shown in both Deserialized and Base85 fields.
- Rarity (non-Legendary): lookup `weapon_rarity_df` by `m_id` and selected `Stat`, use row where `Description` is empty to get `Part ID`. Legendary: use Part ID from Legendary Type combo (first token before “ - ”).

---

## 2. Web – Current vs Required

### 2.1 Dataset verification (must confirm before coding)

- **Question:** Is `weapon_edit/` (all_weapon_part*.csv, elemental.csv, weapon_rarity.csv) present in the **web repo** at a path the API can read (e.g. same repo root as `api/`), or is it only in the desktop app folder?  
- **Current API** (`api/src/data/weaponGen.ts`) uses `repoRoot = join(__dirname, "..", "..", "..")` from `api/src/data/`, i.e. parent of `api/`. So it expects `weapon_edit/` at that parent. **Confirm** that in your deployment the API process has access to these CSVs (same repo or copied data).  
- **Part IDs and mapping:** Use the **same** CSVs and the **same** logic as desktop (m_id from manufacturer+weapon type; filter parts by m_id; rarity by Stat + Legendary Type by Description). Do **not** use a different parts DB (e.g. Master Search DB) for Weapon Gen dropdowns.  
- **Skin images:** Desktop uses `master_search/skin_images/<token>.png`. The web repo may not have these. Options: (a) Copy/sync skin images into the web repo and serve them (e.g. from `web/public/` or API), or (b) Show a placeholder when image is missing. **Decide** and document.

### 2.2 What to remove / not build on

- Do **not** extend the current web Weapon Gen page. Treat it as **wrong structure**.
- **Reset:** Replace the Weapon Gen view with a **new implementation** that follows this plan (scrollable, grouped dropdowns, same data, skin with “Add to Gun” updating Deserialized/Base85).

### 2.3 API contract (keep or adjust)

- **GET /weapon-gen/data** – Single payload is acceptable, but it **must** expose:
  - Same dataset as desktop: manufacturers, weapon types, `m_id` list, parts by `m_id` and part type (with Part ID and label “Part ID - Stat” or “Part ID”), rarity options by `m_id` (Stat only for Rarity; for Legendary Type: Part ID + Description), elemental list, godrolls, skins list.
- Rarity in the API should allow the frontend to show **Stat** only (Common, Uncommon, Rare, Epic, Legendary) and to resolve Part ID for non-Legendary from the same table (row where Stat = selected and Description empty). Legendary Type: list of { partId, description }.
- Skin preview: if images are served, the API or static hosting must provide a URL pattern (e.g. `/skin-images/<token>.png` or path in `web/public`).

---

## 3. Rebuild Plan (Implementation Order)

1. **Dataset and API**
   - Confirm location of `weapon_edit/` and `master_search/db/weapon_skins.json` (and optionally `master_search/skin_images/`) for the running API.
   - Ensure **GET /weapon-gen/data** reads the **same** CSVs and godrolls/skins as desktop and returns the structure above (including Rarity as Stat-only + Legendary Type as partId+description).
   - If skin images are used, add a way to serve them (static or API route) and document the URL pattern.

2. **New Weapon Gen page (clean)**
   - **Layout:** Single vertically scrollable page. Order: Output (Deserialized + Base85) → Controls (Manufacturer, Type, Level, Seed, 🎲) → **Scrollable** parts area → Action row (Flag, God Roller, Check for Updates, Add to Backpack) → Skin section.
   - **Parts area:** Grid of **grouped sections**. Each group = one part type (Rarity, Legendary Type, Element 1, Element 2, Body, Body Accessory, …) with one or more dropdowns. Match desktop’s PART_LAYOUT and MULTI_SELECT_SLOTS. Use theme CSS variables only.
   - **State:** Clear separation: (1) builder state (manufacturer, weaponType, level, seed, partSelections, skinToken), (2) output state (decoded string, base85 string). No mixed “paste box” logic; output is always derived from builder + skin.

3. **Behavior**
   - Changing manufacturer/weapon type: recompute `m_id`, repopulate part dropdowns from API data for that `m_id`, clear or reset part selections.
   - Any change to level, seed, or part selection: rebuild decoded string (same formula as desktop), call encode API, update Deserialized and Base85 display.
   - **Skin:** Dropdown + optional preview image. “Add to Gun” = append skin block to current decoded string, re-encode, set Deserialized and Base85 (same as desktop).
   - God Roller: modal with preset list; “Add to Backpack” (encode + add-item); “Customize God Roll” (navigate to Weapon Edit with decoded pasted).
   - Add to Backpack: use current Base85 and selected flag; call existing save/add-item and refresh save context.

4. **Theme**
   - All controls and panels use CSS variables (e.g. `--color-accent`, `--color-text`, `--color-panel-border`) so the page respects the selected theme.

5. **Check for Updates**
   - Desktop runs a “Check for library updates” flow (e.g. community DB). For web, either implement a similar API or hide/disable the button until defined. Do not leave a no-op button that implies DB update if it doesn’t exist.

---

## 4. Open Points (Confirm Before Coding)

- **Dataset location:** Where exactly does the web app (API) read `weapon_edit/` from in your repo/deploy? Same repo root as `api/`?
- **Skin images:** Should the web show skin preview images? If yes, where will `master_search/skin_images/*.png` come from (copy into repo, or serve from desktop app path)?
- **Rarity dropdown:** Confirm desktop shows only **Stat** (Common, Uncommon, Rare, Epic, Legendary) in the Rarity combo; Legendary Type is a separate combo with “Part ID - Description”. Web will match this.
- **Check for Updates:** Should the web Weapon Gen have this button at all for now, or hide it until a web-equivalent flow exists?

Once these are confirmed, implementation can proceed in the order above with no further changes to the overall structure.
