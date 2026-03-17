# Beta: Unified Item Builder — Plan & Implementation Order

**Goal:** One page where users can **build and edit any item** (weapon, grenade, shield, class mod, repkit, heavy, enhancement) with weapon-builder–style behavior: add any parts, set quantities per part, and see the current build at a glance. This doc is the single source of truth for the Beta experiment.

---

## 1. Reference: “Borderlands Item Editor and Save Editor” HTML

**File:** `reference htmls/Borderlands Item Editor and Save Editor.html`

### 1.1 Structure

- **Tabs at top:** Item Editor | Item Roll Generator | Profile Editor | Save Editor.
- **Item Editor** is one surface for all item types (weapon, grenade, shield, etc.); type is chosen inside the tab, not via separate tabs.

### 1.2 Item Editor flow (single page)

1. **Parse existing serial (optional)**  
   - Paste item code or use “Random Item.”  
   - Parses into Item Properties + Parts.

2. **Item Properties**  
   - **Manufacturer** (required) → **Item Type** (required, filtered by manufacturer).  
   - Level, Random Seed, Firmware Lock, Buyback Flag, Skin Customization.  
   - **Item Guidelines** (when type has them): required-part checkboxes, “Master Unlock,” “Descriptive IDs.”

3. **Parts section**  
   - **Quick-add sub-tabs:**  
     - **Part Builder:** Part Type (`{#}`, `{#:#}`, `{#:[# # #]}`), Type ID, Part ID, “Browse,” “Add Part.”  
     - **Manual Entry:** Paste part codes (one per line or space-separated), “Add Parts from Codes.”  
   - **Parts container:** List of added parts with **Grouped / List / Compact** view toggles.  
   - No per-slot dropdowns; everything is “add a part” + optional quantity/array.

4. **Output**  
   - Generated Item Code (editable textarea).  
   - Serialized Base85, State Flag, Copy, Add to Backpack.

### 1.3 Takeaways from reference

- **One item at a time:** Manufacturer + Item Type define the “current” item; parts are generic (`{#}`, `{#:#}`, `{#:[...]}`).  
- **Part Builder + Manual Entry** cover both structured and freeform part entry.  
- **Single output** (decoded + Base85) shared for the current item.  
- **Parts list** is the main representation of the build (grouped/list/compact), not a separate “search” panel.

---

## 2. Current BL4 AIO Web (Gear Forge)

- **Build mode:** 7 builders (Weapon, Class Mod, Enhancement, RepKit, Grenade, Shield, Heavy); each has its own UI and (except weapon) no “add other parts” or universal part picker.  
- **Edit mode:** Serial Editor only (decode/edit/encode any serial; Add Part modal with universal parts grid).  
- **Weapon Builder:** Part slots + “Add other parts” dropdown → universal part picker → **quantity modal** → part(s) applied to build; quantities editable; deserialized view with drag-reorder.  
- **Shared:** Live Codec (Base85 ⇄ Deserialized) at Gear Forge level; **side panel = “Mini Master Search”** (search parts, quick filters, manufacturer; click part → quantity modal → copy or inject into weapon builder / decoded).

---

## 3. User ideas (and how we use them)

| Idea | Use in plan |
|------|------------------|
| **a.** Combine all builders into one tab | **Yes.** One “Unified Item Builder” in Beta: single tab, item kind chosen inside (Manufacturer + Item Type or a single category selector). |
| **b.** Add “other parts” everywhere + quantity from UI/dropdown | **Yes.** Every part addition (from slot dropdown or “Add other parts”) uses the same universal part picker + **quantity modal**; support changing quantity of already-added parts. |
| **c.** Remove Master Search from side panel → replace with parts listing from universal editor | **Yes.** Side panel becomes **“Current build parts”** (parsed tokens/parts from the decoded string), not search. Optional: small “Search parts to add” inside the main builder area. |

---

## 4. Senior UI/UX recommendations (beyond a–c)

1. **Single “item context” at the top**  
   - One control (e.g. **Category:** Weapon | Grenade | Shield | Class Mod | RepKit | Heavy | Enhancement) or **Manufacturer + Item Type** (like reference).  
   - Rest of the page is “this item”: properties (level, firmware, skin if applicable), part list, and output. No switching between seven separate builder UIs.

2. **One output, one source of truth**  
   - One decoded string and one Base85; live codec stays. All part additions/edits/quantities update this single build. Parse-existing-serial and “Random item” (god roll) prefill this.

3. **Parts list as primary build representation**  
   - **Side panel = current build parts** (from decoded string): each token as a row (code, optional name/type, quantity if applicable), with **Move up / Move down / Remove** and optional **Edit quantity**.  
   - Matches reference “parts container” and Serial Editor’s list; no separate “Mini Master Search” in the side panel.

4. **Unified “Add part” entry points**  
   - **Part Builder** (like reference): choose format `{#}`, `{#:#}`, `{#:[# # #]}`, pick Type ID + Part ID (or Browse), set quantity → Add Part.  
   - **Add other parts** (like weapon builder): universal part picker (filters: manufacturer, rarity, part type, search) → pick part(s) → **quantity modal** → add to build.  
   - **Manual entry:** paste lines of part codes → parse and append with optional default quantity.  
   - Every path flows into the same decoded string and parts list.

5. **Quantity everywhere**  
   - When adding a part (from Part Builder, Add other parts, or slot dropdown if we keep slots): always offer **quantity** (modal or inline); support `{prefix:[id id id]}` and multiple single tokens.  
   - In the **current build parts** list: show quantity per part where applicable; allow “Edit quantity” to change count and re-serialize.

6. **Optional: guidelines per item type**  
   - Like reference: for types that have required-part rules, show a small “Item guidelines” block (required part checkboxes, Master Unlock) so power users can satisfy game rules without leaving the page.

7. **Mobile-first**  
   - Touch-friendly targets, modals that work on small screens, collapsible sections so “Item properties” and “Part Builder” don’t overwhelm.

---

## 5. Target behavior (summary)

- **One page in Beta:** “Unified Item Builder.”  
- **Top:** Item context (Category or Manufacturer + Item Type); optional Parse serial / Random item.  
- **Item properties:** Level, Seed, Firmware, Buyback, Skin (when applicable).  
- **Main area:**  
  - Part Builder (`{#}`, `{#:#}`, `{#:[...]}`, Type ID, Part ID, Browse, quantity, Add Part).  
  - “Add other parts” (universal picker + quantity modal).  
  - Optional Manual entry (paste codes + add).  
  - Live decoded + Base85 (or single codec block).  
- **Side panel:** **Current build parts** list (parsed from decoded), with reorder, remove, edit quantity; no Mini Master Search here.  
- **Actions:** Copy, Add to Backpack, Generate modded item (if applicable).  
- **Optional:** “Search parts to add” (compact) inside main area that reuses universal parts API and injects into build with quantity.

---

## 6. Implementation steps (order)

Do these in order so each step has a clear deliverable and the next step can build on it.

### Phase 1 — Beta entry and shell

| Step | Task | Deliverable |
|------|------|-------------|
| 1.1 | Add route and entry from Beta page: e.g. `/beta/unified-item-builder` and a card “Unified Item Builder” on BetaPage. | Clicking “Unified Item Builder” opens the new experiment page. |
| 1.2 | Create `UnifiedItemBuilderPage` (or `UnifiedItemBuilderView`): layout with placeholder sections: **Item context** (dropdown: Weapon | Grenade | Shield | …), **Item properties** (Level, Firmware, etc.), **Part Builder** (placeholder), **Output** (shared Live Codec: decoded + Base85). Reuse existing codec state/logic (decode/encode API) at page level. | One page with all sections; codec works when pasting decoded or Base85. |
| 1.3 | Implement **Item context** so it drives which “guidelines” or hints we show (e.g. “Firmware does not apply to weapons”). No per-category builder UIs yet; single serial is built only via manual edit or paste. | Changing category updates hints/visibility of options (e.g. Firmware only for non-weapon). |

### Phase 2 — Part Builder and “Add part” flows

| Step | Task | Deliverable |
|------|------|-------------|
| 2.1 | Add **Part Builder** UI: Part Type (`{#}`, `{#:#}`, `{#:[# # #]}`), Type ID dropdown, Part ID (input + optional Browse), quantity, “Add Part” button. On Add: append correct token(s) to decoded string and refresh codec. | User can add simple, typed, and array parts from Part Builder into the shared decoded string. |
| 2.2 | Integrate **universal parts API** (e.g. `parts/data`) and add **“Add other parts”** control: opens modal with search + filters (manufacturer, rarity, part type). On select part(s) → open **quantity modal** (reuse pattern from WeaponGenView) → append to decoded. | “Add other parts” adds any part from DB to the build with chosen quantity. |
| 2.3 | Add **quantity modal** component (or reuse from weapon builder) used by Part Builder and Add other parts: “Quantity for &lt;part&gt;” → apply `{n:[id id …]}` or repeated tokens. | Single quantity flow for all add-part entry points. |
| 2.4 | Optional: **Manual entry** — textarea “Paste part codes (one per line or space-separated)” + “Add Parts from Codes” that parses and appends to decoded. | User can paste e.g. `{13:90}` lines and add in bulk. |

### Phase 3 — Side panel: Current build parts (replace Mini Master Search)

| Step | Task | Deliverable |
|------|------|-------------|
| 3.1 | Build **parsed parts list** from current decoded string (reuse parsing from Serial Editor / WeaponEditView: `parseComponentString`-style). Each row: code, optional label (from lookup), quantity if array. | Side panel shows “Current build parts” with one row per token. |
| 3.2 | Add **Move up / Move down / Remove** per row; on change, rebuild decoded string from the ordered list and sync Base85. | User can reorder and remove parts from the side list; codec updates. |
| 3.3 | Add **Edit quantity** for applicable rows (e.g. `{13:[2 2 2]}` → change to 5 → `{13:[2 2 2 2 2]}`). | Quantity of existing parts editable from the list. |
| 3.4 | In Gear Forge (or only in Beta): **Replace “Mini Master Search” side panel** with this **Current build parts** panel when the Unified Item Builder is the active view. (If Unified lives only under Beta, then only on the Beta unified builder page; no change to main Gear Forge side panel yet.) | Same layout idea as “replace Master Search with parts listing” but scoped to the experiment. |

### Phase 4 — Unify part selection and quantities across the page

| Step | Task | Deliverable |
|------|------|-------------|
| 4.1 | If we keep any “slot” or “category” dropdowns (e.g. for weapon barrel, grip), make each one open the **same universal part browser** with filters pre-filled by slot/category, and use the **same quantity modal** on select. | No separate “weapon-only” part picker; one picker, many entry points. |
| 4.2 | Ensure **Part Builder** and **Add other parts** and any slot dropdown all write to the **same** decoded state and **Current build parts** list. | Single source of truth; no duplicate state. |

### Phase 5 — Polish and optional features

| Step | Task | Deliverable |
|------|------|-------------|
| 5.1 | **Parse existing serial:** “Paste item code” that decodes (or accepts decoded) and prefills Item Properties + parts list. | User can paste a code and continue editing. |
| 5.2 | **Random item / God roll** (per category): prefill with a random valid build for the selected type. | One-click “Random item” for the current category. |
| 5.3 | **Item guidelines** (optional): for types with required-part data, show checkboxes “Required part X present” and “Master Unlock” (like reference). | Power users can satisfy in-game rules. |
| 5.4 | **Add to Backpack** and **Copy** actions wired to current Base85/decoded. | Same behavior as Serial Editor / weapon builder. |
| 5.5 | Responsive and **mobile**: touch targets, modals, collapsible sections. | Usable on phone. |

---

## 7. Where this lives

- **Beta only at first:** All of the above is implemented under **Beta → Unified Item Builder**.  
- **Gear Forge unchanged** until we’re happy: keep current Build/Edit mode, 7 builders, and Mini Master Search as-is.  
- **Later:** If the experiment works, we can (a) add a “Unified Item Builder” option to Gear Forge (Build mode) and (b) optionally replace the side panel there with Current build parts when that builder is active.

---

## 8. Files to create or touch (high level)

- **New:** `web/src/pages/beta/UnifiedItemBuilderPage.tsx` (or under `web/src/pages/` with a Beta route).  
- **New (optional):** `web/src/components/unified-item-builder/PartBuilderBlock.tsx`, `CurrentBuildPartsPanel.tsx`, `UnifiedQuantityModal.tsx`.  
- **Reuse:**  
  - Decode/encode: existing API (`save/decode-items`, `save/encode-serial`).  
  - Parts data: `parts/data`, universal parts DB.  
  - Parsing: WeaponEditView / weapon builder parsing for decoded tokens.  
  - Quantity modal pattern: WeaponGenView’s `pendingQtyPart` flow.  
- **Update:**  
  - `BetaPage.tsx`: add card/link to Unified Item Builder.  
  - `App.tsx`: route `/beta/unified-item-builder` (or similar).  
  - Later: Gear Forge if we promote the experiment.

---

## 9. Success criteria for Beta

- User can open **Beta → Unified Item Builder** and:  
  - Select item category (or Manufacturer + Type).  
  - Add parts via Part Builder, “Add other parts,” and (optionally) manual paste.  
  - Set and edit quantity for parts.  
  - See **Current build parts** in the side panel and reorder/remove/edit quantity there.  
  - See one decoded string and one Base85 stay in sync.  
  - Copy and Add to Backpack.  
- Feedback: short in-app feedback (e.g. “Was this useful?” or link to Discord/GitHub) so we can iterate.

---

---

## 10. Reference: Firmware Lock & Buyback Flag (from source HTML)

From `reference htmls/Borderlands Item Editor and Save Editor.html`:

- **Firmware Lock:** Adds the section ` 9, 1|` to the decoded item code (in the flags segment between the first `|` and `||`). Example: `typeId, 0, 1, level| 9, 1| 2, seed|| {parts}|`. The reference UI stated it applies to Ordnance, Repkit, Shield, Class Mod, and Enhancements, and that “Firmware does NOT work on Weapons”; we do not restrict by item type—all items can set it.
- **Buyback Flag:** Adds the section ` 10, 1|` to the code, same placement. Parsed and serialized the same way as Firmware Lock. Likely used so the game can treat the item as buyback-eligible (e.g. at vendors).

Parser (reference): the segment between the first `|` and `||` is split by `|`; each sub-segment `id, value` sets firmware (9, 1), buyback (10, 1), or seed (2, value).

---

*Doc version: 1.0. Next: start with Phase 1 (steps 1.1–1.3), then Phase 2 (2.1–2.4).*
