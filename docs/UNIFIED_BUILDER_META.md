# Unified Builder Meta (Weapon + Grenade parity)

This doc captures the **meta rules** we’ve established while implementing the Beta Unified builder. Treat this as the **standard** for all upcoming builder sections (Shield / RepKit / Heavy / Class Mod / Enhancement).

---

## UX / Layout meta (required)

- **One source of truth**: the page’s `liveDecoded` is authoritative; everything else (Base85, parts panel) syncs from it.
- **Live codec block**:
  - Two textareas: **Base85** and **Deserialized**.
  - Action buttons under the codec:
    - **Copy Base85**
    - **Copy Code** (copies decoded/deserialized text)
    - **Add to Backpack** + **Flag** selector
  - Immediately under the **Deserialized** textarea: **Code cleanup** button.
- **Build section per category**: each category gets a collapsible `<details>` “X build (dropdowns)” with:
  - Top “header row” controls: **Manufacturer (+ Type if needed)**, **Level**, **Seed**, **Add other parts**, **Random item**, **God roll** (wired for future), **Auto fill**.
  - Slot dropdown grid under it.
- **Touch-first**: min-height 44px buttons/inputs, modals work on mobile.

---

## Part selection + quantities meta (required)

- **Every dropdown slot supports quantity** where stacking makes sense (Weapon already does; Grenade now does).
- **Universal “Add other parts”** is available anywhere (either as a dedicated button and/or as a dropdown option), and it uses the same quantity modal and append logic.

### Multi-select with different quantities (pattern to reuse)

When users need **multiple parts**, each with **its own quantity**, we use this pattern (implemented for Grenade Universal perks):

- **State**:
  - `qtyById: Record<number, number>` (what’s in the build)
  - `selectedIds: Set<number>` (what the user has checked in the modal)
  - `applyQty: string` + `search: string`
- **UI**:
  - A “Select …” button opens a modal with a searchable checkbox list.
  - User selects several items → enters “Qty for selected” → clicks **Apply**.
  - Back in the builder section, show the selected items as a list with:
    - per-item qty input
    - remove button
- **Serialization**:
  - Expand `qtyById` into repeated IDs and emit as a single token when the format supports it (e.g. `{typeId:[...]}`).

Use this same pattern for Shield/RepKit/Heavy/etc anywhere we have “perk stacks”, “secondary lists”, or “multi picks with different counts”.

### Grenade-specific meta

- **Legendary perks (grenade)**:
  - Represented as `{mfgId:partId}` (or `{partId}` when same-mfg) and displayed in the parts list using a **short legendary name** (parsed from `stat`).
  - Legendary selection in the builder can be single or multi (via the modal), but all stacks serialize into `{245:...}` or `{mfgId:...}` as appropriate.
- **Element, firmware, manufacturer perks, universal perks**:
  - All stacks are combined into `{245:...}` tokens; the parts list shows only **short perk names** (e.g. “Shock”, “Splinter Augment”, etc.).
- **Random/Auto fill**:
  - Stack sizes for any grenade part (Element, Firmware, Mfg Perk, Universal Perk) are capped to **1–5**.

### Shield-specific meta

- **Legendary perks (shield)**:
  - Always modeled as a **multi-select** (“Legendary perks (multi-select)”) with per-perk qty.
  - Keys are composite `mfgId:partId` to avoid collisions.
  - Serialization:
    - If no legendary perks selected → use **model part** for that manufacturer.
    - Same-mfg legendaries emit as repeated `{partId}` tokens.
    - Cross-mfg legendaries group into `{mfgId:[ids...]}`.
  - Parts list shows `Manufacturer: ShortName` for shield legendaries.
- **Elemental Resistance**:
  - Labeled “Elemental Resistance (multi-select)” and uses the same multi-select+qty pattern.
  - All stacks (element, firmware, universal) are combined into `{246:...}`.
  - Parts list shows only the **element name** (e.g. “Shock”, “Fire”) for these tokens.
- **Energy/Armor perks**:
  - Always visible, regardless of shield type, each with its own multi-select and stack list.
  - Show warnings:
    - Energy perks: “May not work properly on armor shields.”
    - Armor perks: “May not work properly on energy shields.”
  - Serialized as `{248:...}` (energy) and `{237:...}` (armor) with stacked IDs.
- **Display rules (parts list)**:
  - For shield tokens `{246:x}`, `{248:x}`, `{237:x}` and legendary tokens, we show only a **short name**:
    - Elemental & firmware: just the element/firmware name.
    - Universal/Energy/Armor perks: short perk name (e.g. “Sturdy”, “Turtle”, “Amp”).
    - Legendary perks: `Mfg: ShortName`.
- **Random/Auto fill**:
  - Stack sizes for Element, Firmware, Universal, Energy, Armor, and Legendary perks are capped to **1–5**.

---

## Random / Auto fill meta (required)

- **Random item**: chooses valid values for the category and fills **all** slots.
- **Auto fill**: user picks the “high intent” controls first (e.g. Manufacturer + Rarity + Legendary type when required), then Auto fill fills the rest.
  - For stack-based systems, Auto fill must create **stacks** (not just single qty=1).
  - Auto fill should show a warning modal when prerequisites are missing (same pattern as Weapon/Grenade).

---

## God rolls meta (wired for future)

- Every category has a **God roll** button and modal wired to `data.godrolls?: { name; decoded }[]`.
- If `godrolls` is missing/empty: disable button and show “No god rolls loaded”.
- When `godrolls` is populated later, no UI rework should be required.

---

## Code cleanup meta (required)

- Use the existing cleaning logic (`CleanCodeDialog` + `cleanDecodedString()`).
- Confirm text in Unified builder:
  - `are you sure? This may alter the effects of your current code 1`
- Place the **Code cleanup** button directly below the decoded textarea in the codec block.

