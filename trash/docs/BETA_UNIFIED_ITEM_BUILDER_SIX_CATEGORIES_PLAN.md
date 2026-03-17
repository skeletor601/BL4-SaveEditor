# Beta: Unified Item Builder — Plan for All 6 Build Sections (Weapon Parity)

**Goal:** Extend the Unified Item Builder so **every** item category has the same UX as the current **Weapon** section: category-specific data, Manufacturer/Type selectors, Level/Seed, Add other parts, Random item, **God roll (wired for future)**, Auto fill where applicable, collapsible part-dropdown build section, same codec + Current build parts + Copy + Add to Backpack + Item guidelines.

**Meta spec:** Follow `docs/UNIFIED_BUILDER_META.md` for the required UX/logic patterns (quantities everywhere, multi-select+qty stacks, code cleanup, copy decoded, god roll wiring).

**Scope:** 6 build sections to implement (Weapon is already done):

1. **Class Mod**
2. **RepKit**
3. **Enhancement**
4. **Grenade**
5. **Heavy**
6. **Shield**

---

## 1. Reference: Current Weapon Section (What to Replicate)

For **Weapon** we already have:

| Area | Behavior |
|------|----------|
| **Data** | Fetched from `weapon-gen/data` when `category === "weapon"`. `WeaponGenData`: manufacturers, weaponTypes, mfgWtIdList, partsByMfgTypeId, rarityByMfgTypeId, legendaryByMfgTypeId, pearlByMfgTypeId, elemental, **godrolls** (optional). |
| **Selectors** | Manufacturer dropdown → Weapon type dropdown → derives `mfgWtId` (single id used in decoded header). |
| **Header row** | Level, Seed, **Add other parts**, **Random item**, **God roll**, **Auto fill** (same visual style: bordered boxes, min-h 44px, touch-friendly). |
| **Build section** | Collapsible `<details>` “Weapon build (dropdowns)” with part slots from `WEAPON_PART_ORDER` (Rarity, Legendary Type, Pearl Type, Element 1/2, Body, Barrel, …). Each slot: dropdown (None, Add other parts, options) + quantity. “Add other parts” in dropdown opens shared Add-other-parts modal. |
| **Decoded build** | `buildDecodedFromWeaponSlots()` builds first line: `mfgWtId, 0, 1, level| 2, seed||` + part tokens + ` \|`. |
| **Random item** | Picks random mfg+weaponType, level 1–50, seed, fills all slots from data (rarity, legendary/pearl if applicable, elements, parts). |
| **God roll** | Button opens modal; list from `weaponData.godrolls`; on select → set `liveDecoded`, close modal. **Wired for future:** if `godrolls` is missing or empty, button is disabled; when JSON exists, it just works. |
| **Auto fill** | Validates manufacturer, type, level, rarity (and Legendary/Pearl type if needed); fills empty part slots with random valid options; shows warning modal on validation failure. |
| **Shared** | Same Live codec (Base85 ⇄ Deserialized), Current build parts (parsed from first line), Copy, Add to Backpack, Flag, Item guidelines at bottom. Add-other-parts and quantity modals are shared. |

---

## 2. Per-Category Plan (Same Structure for All 6)

For **each** of the 6 categories below, do the following in the same way as Weapon.

### 2.1 Data and API

| Category   | API endpoint (existing)                    | Data shape (existing) |
|-----------|---------------------------------------------|------------------------|
| Class Mod | `GET /accessories/class-mod/builder-data`   | Class mod builder data (manufacturers, classes, perks, etc.) |
| RepKit    | `GET /accessories/repkit/builder-data`     | RepkitBuilderData (mfgs, raritiesByMfg, prefix, firmware, resistance, universalPerks, legendaryPerks, modelsByMfg) |
| Enhancement | `GET /accessories/enhancement/builder-data` | EnhancementBuilderData (manufacturers, rarityMap247, secondary247) |
| Grenade   | `GET /accessories/grenade/builder-data`    | GrenadeBuilderData (mfgs, raritiesByMfg, element, firmware, universalPerks, legendaryPerks, mfgPerks) |
| Heavy     | `GET /accessories/heavy/builder-data`      | Heavy builder data (manufacturers, types, parts, etc.) |
| Shield    | `GET /accessories/shield/builder-data`     | ShieldBuilderData (mfgs, mfgTypeById, raritiesByMfg, element, firmware, universalPerks, energyPerks, armorPerks, legendaryPerks, modelsByMfg) |

- When user selects a category, fetch that category’s builder-data (same pattern as `useEffect` for `weapon-gen/data` when `category === "weapon"`).
- **God roll:** Extend each API’s response type (or front-end type) with an optional `godrolls?: { name: string; decoded: string }[]`. No JSON needed now; wire the UI so when the array is present and non-empty, the God roll button is enabled and the modal shows the list; when absent or empty, button is disabled and tooltip says “No god rolls loaded” (same as weapon). No backend change required for “future”: add optional field to types and handle empty in UI.

### 2.2 Selectors (Manufacturer / Type)

- **Class Mod:** Manufacturer (or equivalent) + Class/Type as needed by existing builder data (same as current Class Mod builder: e.g. manufacturer + class).
- **RepKit:** Manufacturer dropdown (from `mfgs`); optionally subtype if data has it. Derive a single “header id” (e.g. mfgId or mfgTypeId) for building the decoded line.
- **Enhancement:** Manufacturer (from `manufacturers`) and any type/rarity selectors the enhancement builder uses.
- **Grenade:** Manufacturer (from `mfgs`); derive header id for decoded.
- **Heavy:** Manufacturer + weapon type (or equivalent) from heavy builder data; derive header id.
- **Shield:** Manufacturer (from `mfgs`); Shield has Energy/Armor type from `mfgTypeById` — use it where it affects part lists. Derive header id.

Each category must have a clear “current selection” that drives:
- Which part slots and options are shown.
- How the first decoded line header is built (e.g. `typeId, 0, 1, level| 2, seed||` with the correct typeId for that category: e.g. 245 grenade, 246 shield, 243 repkit, 244 heavy; class mod and enhancement from existing builders).

### 2.3 Header Row (Same for All 6)

For **every** category, show the same row of controls (same layout and styling as Weapon):

- **Level** (number input 1–50)
- **Seed** (number input)
- **Add other parts** (opens shared modal)
- **Random item** (category-specific random: pick random manufacturer/type, level, seed, fill part slots from category data)
- **God roll** (opens modal; list from `categoryData.godrolls`; if missing/empty, button disabled, “No god rolls loaded” for future)
- **Auto fill** (where applicable: fill empty part slots with random valid options; validation + warning modal like weapon)

Implementation: one shared “header row” component or block that receives `category` and category-specific handlers and data (e.g. `onRandom`, `onGodRoll`, `godrolls`, `onAutoFill`, `showAutoFill`). For categories that don’t support Auto fill yet, can hide or disable it until logic is defined.

### 2.4 Collapsible “[Category] build” Section

- **Weapon:** Already exists: “Weapon build (dropdowns)” with `WEAPON_PART_ORDER` and slot dropdowns.
- **Class Mod / RepKit / Enhancement / Grenade / Heavy / Shield:** Add a collapsible `<details>` “Class Mod build”, “RepKit build”, … that:
  - Renders only when `category === "class-mod"` (etc.) and that category’s data is loaded.
  - Uses a **category-specific part order** (like `WEAPON_PART_ORDER`): define e.g. `GRENADE_PART_ORDER`, `SHIELD_PART_ORDER`, … from existing builder data (which part types and how many slots).
  - Each row: part type label, dropdown (None, Add other parts, … options from data), quantity where applicable.
  - “Add other parts” in any dropdown opens the **same** Add-other-parts modal; on confirm, append tokens to decoded (same as weapon).
  - Selections and quantities live in category-specific state (e.g. `grenadeSlotSelections`, `grenadeSlotQuantities`) and drive a category-specific `buildDecodedFromXSlots()`.

Define part order and option sources per category from existing API data (e.g. Grenade: Rarity, Element, Firmware, Universal perks, Legendary, Mfg perks; Shield: Rarity, Type, Element, Firmware, Universal, Energy/Armor perks, Legendary; etc.).

### 2.5 Building the Decoded Line

- **Weapon:** `buildDecodedFromWeaponSlots(weaponData, mfgWtId, level, seed, weaponSlotSelections, weaponSlotQuantities, extraTokens)`.
- **Each other category:** Implement `buildDecodedFromGrenadeSlots`, `buildDecodedFromShieldSlots`, etc., using:
  - Correct header format for that item type (first number = typeId for that category; same `| 2, seed||` and trailing ` |`).
  - Part tokens from that category’s slot selections and quantities (and “extra” tokens if we allow Add-other-parts to append for that category).
- When category or slot state changes, call the appropriate `buildDecodedFromXSlots` and set `liveDecoded` (same as weapon’s `rebuildWeaponDecoded` + `useEffect`).

### 2.6 Random Item (Per Category)

- **Weapon:** Already implemented: random mfg+weaponType, level, seed, fill all slots.
- **Class Mod / RepKit / Enhancement / Grenade / Heavy / Shield:** Implement `handleRandomGrenade`, `handleRandomShield`, etc.: pick random manufacturer (and type if applicable), set level 1–50, set seed, fill all part slots from that category’s data with random valid options. Reuse same UX (one button “Random item” in the header row).

### 2.7 God Roll (Wired for Future)

- **Weapon:** Modal with `weaponData.godrolls`; on select → set `liveDecoded`.
- **All others:** Same pattern:
  - Add optional `godrolls?: { name: string; decoded: string }[]` to each category’s data type (or treat as optional in UI).
  - God roll button: enabled only when `categoryData?.godrolls?.length > 0`; otherwise disabled, title “No god rolls loaded”.
  - Modal: when opened and godrolls exist, list them; on select → set `liveDecoded`, close modal.
  - No need to add JSON files now; when you add them later (e.g. to API or static data), the UI is already wired.

### 2.8 Auto Fill (Where Applicable)

- **Weapon:** Validates manufacturer, type, level, rarity (and Legendary/Pearl type); fills empty slots with random valid parts; warning modal on failure.
- **Others:** For each category that has a well-defined “slot” model (Grenade, Shield, RepKit, Heavy, Class Mod, Enhancement), implement validation + fill-empty-slots logic similarly. If a category’s slot structure is unclear, implement “Random item” first and add Auto fill in a follow-up.

### 2.9 Shared Pieces (Unchanged)

- Live codec (Base85 ⇄ Deserialized), Copy, Add to Backpack, Flag.
- Current build parts (parsed from first line; reorder, remove, edit quantity).
- Item guidelines at bottom.
- Add-other-parts modal and quantity modal (shared; already filter by `itemType` or universal; keep working for all categories).
- When “Add other parts” adds a part for a non-weapon category, append to decoded the same way (minimal header if needed, then append tokens).

---

## 3. Implementation Order (Recommended)

1. **Grenade** — API and data shape already; similar to weapon (manufacturer, rarities, perks). Define `GRENADE_PART_ORDER` and header typeId (245).
2. **Shield** — Same idea; Energy/Armor from `mfgTypeById`; typeId 246.
3. **RepKit** — typeId 243; prefix, firmware, resistance, universal, legendary.
4. **Heavy** — typeId 244; manufacturer + type and part slots from heavy builder.
5. **Class Mod** — Use existing class-mod builder-data; define part order and header format from current behavior.
6. **Enhancement** — Manufacturers + perks/rarities; define part order and header format.

For each category:

- Add state (e.g. `grenadeData`, `grenadeMfgId`, `grenadeSlotSelections`, `grenadeSlotQuantities`).
- Fetch data when `category === "grenade"` (etc.).
- Add “Grenade build” collapsible section with slot dropdowns.
- Implement `buildDecodedFromGrenadeSlots`, `handleRandomGrenade`, God roll modal (with `grenadeData?.godrolls`), Auto fill if applicable.
- Wire God roll button to modal; leave `godrolls` empty until you have JSON.

---

## 4. File and State Strategy

- **Single page:** Keep everything in `UnifiedItemBuilderPage.tsx` (or split into a few components by category if the file gets too large: e.g. `WeaponBuildSection`, `GrenadeBuildSection`, …).
- **State:** Category-scoped state per build type (e.g. `weaponData`, `grenadeData`, `shieldData`, …; `weaponSlotSelections` / `grenadeSlotSelections`, …). When switching category, the appropriate section is shown and its state is used to rebuild decoded when that category is selected.
- **Decoded line:** When category is weapon, rebuild from weapon state; when grenade, from grenade state; etc. When user pastes decoded or Base85, we still parse and show Current build parts; if we want to “hydrate” slot selections from pasted decoded, that can be a later enhancement (optional).

---

## 5. Success Criteria

- User can select **Weapon**, **Class Mod**, **RepKit**, **Enhancement**, **Grenade**, **Heavy**, or **Shield** and see:
  - Same top structure: Item category → Live codec → **[Category] build** (collapsible) with same header row: Level, Seed, Add other parts, Random item, God roll, Auto fill (if applicable).
  - Category-specific dropdowns and part slots that drive the decoded line.
  - Same codec, Current build parts, Copy, Add to Backpack, Item guidelines.
- God roll is wired for all 6 non-weapon categories (button + modal); when `godrolls` is populated later, it works without further UI changes.
- All 6 build sections behave “exactly like” the current Weapon section in layout and interaction pattern.

---

## 6. Summary Table: 6 Build Sections

| # | Category   | Data API                              | Selectors        | Part slots from        | Header typeId (ref) | God roll      |
|---|------------|----------------------------------------|------------------|-------------------------|----------------------|---------------|
| 1 | Weapon     | `weapon-gen/data`                      | Mfg + Weapon type| WEAPON_PART_ORDER       | mfgWtId              | Wired (data)  |
| 2 | Class Mod  | `accessories/class-mod/builder-data`  | Per class-mod UI | Class-mod part order    | TBD from builder     | Wired (future)|
| 3 | RepKit     | `accessories/repkit/builder-data`     | Manufacturer     | Repkit part order       | 243                  | Wired (future)|
| 4 | Enhancement| `accessories/enhancement/builder-data` | Manufacturer etc.| Enhancement part order  | TBD from builder     | Wired (future)|
| 5 | Grenade    | `accessories/grenade/builder-data`     | Manufacturer     | Grenade part order      | 245                  | Wired (future)|
| 6 | Heavy      | `accessories/heavy/builder-data`       | Mfg + Type       | Heavy part order        | 244                  | Wired (future)|
| 7 | Shield     | `accessories/shield/builder-data`      | Manufacturer     | Shield part order       | 246                  | Wired (future)|

Weapon = 1; the other 6 (Class Mod, RepKit, Enhancement, Grenade, Heavy, Shield) get the same treatment and God roll wired for future use.

---

*Doc version: 1.0. Next: implement Grenade (then Shield, RepKit, Heavy, Class Mod, Enhancement) following this plan.*
