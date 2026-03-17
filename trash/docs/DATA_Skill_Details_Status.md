# Skill details data – what we have vs what we need

**Goal:** Have all data needed for the Class Mod skill card (icon + name + type + description + optional stats) for all 4 characters. No UI built yet – data only.

---

## What we already have

### 1. Per-character skill text (name, type, description)

| File | Character | Format |
|------|-----------|--------|
| `class_mods/Amon_en.json` | Amon | Array of `{ "name", "type", "description" }` |
| `class_mods/Harlowe_en.json` | Harlowe | Same |
| `class_mods/Rafa_en.json` | Rafa | Same |
| `class_mods/Vex_en.json` | Vex | Same |

- **name** – e.g. `"Bolt Action"`, `"Gut Punch"`
- **type** – e.g. `"Passive"`, `"Augment"`, `"Capstone"`, `"Kill Skill"`, `"Minion Skill"`, `"Overdrive Skill"`
- **description** – full explanation (e.g. *"Whenever Amon Reloads, his Guns gain Bonus Shock Damage for a Duration."*)

So we already have **name + type + description for all four characters** in the same folder layout as the rest of class mod data.

### 2. Skill list and IDs (for builder logic)

- **`class_mods/Skills.csv`** – one row per skill per class: `class_ID`, `class_name`, `skill_name_EN`, `skill_ID_1` … `skill_ID_5`. Used by the builder API and by the Unified Item Builder to know which skills exist and their part codes.

### 3. Icons

- **Location:** `class_mods/Amon/`, `class_mods/Harlowe/`, `class_mods/Rafa/`, `class_mods/Vex/` (one folder per character).
- **Filename rule:** `{normalized_skill_name}{suffix}.png`  
  - Normalize: lowercase, spaces → `_`, strip accents/special chars.  
  - Suffix: Vex `_1`, Rafa `_2`, Harlowe `_3`, Amon `_4`.  
  - Example: Amon’s “Bolt Action” → `bolt_action_4.png`.
- **Serving:** API route `GET /accessories/class-mod/skill-icon/:className/:filename` already serves these (used by the standalone Class Mod Builder). Icons just need to exist in those folders.

---

## What we might still want (optional)

The reference card also had **numeric stats**, e.g.:

- `Bonus Shock Damage: +6%`
- `Duration: 4 seconds`

Those are **rank-specific** values (they change per point in the skill). The current `*_en.json` files do **not** include these; they only have the generic description.

- If we want those stats, we’d need to **add** them (e.g. a `stats` array or per-rank object) and fill them from somewhere (e.g. Maxroll, or manual entry).
- If we’re fine with **only** icon + name + type + description for the first version, we don’t need to scrape anything else – the data is already there.

---

## Maxroll (for future stats / scraping)

- **URL:** https://maxroll.gg/borderlands-4/planner  
- **Character switcher:** Yes – can switch between characters at the top.
- **Technical:** The planner is **client-rendered** (JS). A simple HTTP GET only returns the shell (nav/footer); skill names, descriptions, and any stats are loaded by the app. So:
  - To **scrape** Maxroll we’d need a **headless browser** (e.g. Puppeteer/Playwright) to render the page, then extract the skill DOM or network payloads.
  - There’s no obvious public API or static JSON endpoint; data is likely bundled or fetched by the SPA.

So for “get the data first”:

- **Right now:** We already have the data needed for **icon + name + type + description** for all 4 characters (existing JSON + icon folders).
- **Later (if we want stats):** We can add a scraper (or manual data entry) and extend the `*_en.json` schema (e.g. `stats` or `ranks`) when we’re ready to build that part.

---

## Summary

| Data | Amon | Harlowe | Rafa | Vex | Notes |
|------|------|---------|------|-----|--------|
| Skill names + types + descriptions | ✅ | ✅ | ✅ | ✅ | In `class_mods/{Character}_en.json` |
| Skill IDs (for builder) | ✅ | ✅ | ✅ | ✅ | In `class_mods/Skills.csv` |
| Icons | Folder exists | Folder exists | Folder exists | Folder exists | Use existing filename rule + API |
| Per-rank stats (e.g. +6%, 4s) | ❌ | ❌ | ❌ | ❌ | Optional; would need Maxroll scrape or manual entry |

**Bottom line:** For the card you described (icon + name + type + explanation), the data is already in repo: use the four `*_en.json` files and the existing icon folders/API. No scrape required unless we add stats later. When you’re ready to build the UI, we can wire this up; no extra data step needed unless you want the numeric stats too.

---

## Full card data files (created)

**Written:** `class_mods/Amon_skills_full.json`, `Harlowe_skills_full.json`, `Rafa_skills_full.json`, `Vex_skills_full.json`.

Each is an array of `{ name, type, description, stats }`. Name/type/description are filled from existing `*_en.json`. **stats** is an array for lines like "Bonus Shock Damage: +6%" and "Duration: 4 seconds"; it is **empty** for all skills because the Maxroll planner is JS-rendered and our scraper's selectors did not find the tooltip DOM. To fill stats later: run the scraper with `headless: false`, inspect the page, and update selectors in `scripts/scrape_maxroll_skills.js`; or capture the planner's network requests for a JSON data URL; or add stats manually. The card UI can use these files as-is; stats will show when populated.

**Mobalytics:** A second scraper targets [Mobalytics BL4 Build Planner](https://mobalytics.gg/borderlands-4/planner/builds) (`scripts/scrape_mobalytics_skills.js`). Run with `npm run scrape-mobalytics-skills`. Like Maxroll, the page is client-rendered; on first run it also extracted 0 skills. Snapshots are saved to `class_mods/_mobalytics_planner_snapshot.html`. If you have other sites (e.g. bl4skills.com or a wiki), we can add scrapers for those or refine selectors using the saved HTML.
