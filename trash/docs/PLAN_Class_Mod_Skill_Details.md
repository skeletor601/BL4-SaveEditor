# Plan: Class Mod Tab Upgrade — Skill Details Popup + Visuals

Upgrade the **Unified Item Builder → Class Mod** tab so that clicking a skill opens a card showing that skill’s **icon** and **description**. Descriptions (and optionally icons) come from a **scraped dataset** stored as JSON.

---

## 1. Current state

- **Location**: `web/src/pages/beta/UnifiedItemBuilderPage.tsx` (Class Mod block ~6128–6455).
- **Data**: Skills come from API `accessories/class-mod/builder-data` → `skillsByClass[classId]` = array of `{ skillNameEN, skillIds }`. Source CSV: `class_mods/Skills.csv` (columns: class_ID, class_name, skill_name_EN, skill_ID_1…5).
- **UI**: Each skill is a row with name, `{id1, id2, …}`, and Min / − / input / + / Max. No description or icon today.

---

## 2. Data: skill details JSON

- **Purpose**: Store, per skill, a short description and an icon URL (or path) for the popup.
- **Key**: Use **skill name (EN)** as primary key. If the same name appears for multiple classes, we can extend to `"className|skillNameEN"` later.
- **Where to store** (pick one):
  - **Option A**: `web/public/data/skill_details.json` — frontend fetches it directly (no API change).
  - **Option B**: `api/data/skill_details.json` — add a small API route (e.g. `GET /api/skill-details` or under existing class-mod route) that returns this JSON.
- **Schema (example)**:
  ```json
  {
    "Age of Ice": {
      "description": "Rank 1: … Rank 5: …",
      "iconUrl": "/data/skill_icons/age_of_ice.png"
    },
    "Gut Punch": { "description": "…", "iconUrl": "…" }
  }
  ```
- **Icon strategy**: Either scrape icon URLs (if the source site has stable URLs) or scrape/download images into the repo (e.g. `web/public/data/skill_icons/`) and reference by path. Latter is more reliable long-term.

---

## 3. Scraping the website

- **Source**: You’ll need to choose the **exact website** (e.g. Borderlands wiki, official BL4 skills page, or another guide). Once we have the URL and an example skill page (or list page), we can design the scraper.
- **What to scrape**:
  - **Required**: Skill description / effect text (per rank or combined).
  - **Optional**: Skill icon (image URL or file to download).
- **How**:
  - **One-off script** (e.g. `scripts/scrape_skill_details.js`): Node + `cheerio` (HTML parse) or `puppeteer` (if the content is JS-rendered). Script reads `class_mods/Skills.csv` for the list of `skill_name_EN` (and class), hits the site, extracts description (and icon), and writes `skill_details.json` (and downloads icons if we store them locally).
  - **Matching**: Match scraped rows to our skills by `skill_name_EN` (and optionally class name). Handle small name differences (e.g. trim, replace underscores) if the site uses slightly different labels.
- **Legal / ToS**: Check the target site’s terms of use and robots.txt; use a reasonable crawl delay and identify the scraper if required.

---

## 4. UI: skill details popup (card)

- **Trigger**: When the user **clicks the skill name** (or a small “info” icon next to it), open a **modal/card**.
- **Content**:
  - Skill **icon** (if we have it in the JSON).
  - Skill **name** (we already have it: `skill.skillNameEN`).
  - **Description** from `skill_details.json` for that name (and class if we key by class).
- **Behavior**:
  - Click outside or “Close” to dismiss.
  - Don’t trigger when clicking the Min/−/+/Max controls (only the name or info icon).
- **Implementation**:
  - Add state, e.g. `selectedSkillForDetail: { skillNameEN: string, classId?: string } | null`.
  - Load `skill_details.json` once (e.g. fetch from `/data/skill_details.json` or from API) and keep in state/context, or fetch on first open.
  - Render a modal/dialog that shows `skill_details[selectedSkillForDetail.skillNameEN]` (icon + description). If missing, show “No description available.”

---

## 5. Visual features (extras)

- **Skill row**:
  - Make the skill name (or a dedicated info icon) clearly clickable (cursor pointer, hover underline or icon).
  - Optional: show a small icon thumbnail in the list row if we have icons.
- **Card**:
  - Use the same panel/border style as the rest of the Class Mod tab so it feels consistent.
  - Optional: show skill IDs or “Rank 1–5” hint if the description is rank-based.
- **Empty state**: If a skill has no entry in `skill_details.json`, show “Description not yet added” (and still show name/icon if we have icon).

You can add more visuals (e.g. tooltips, better spacing, icons in the main list) once the popup and data pipeline work.

---

## 6. Implementation order

1. **Decide** where to store the JSON (`web/public/data/` vs `api/data/`) and the exact **scrape source URL** (and one example skill page).
2. **Define** the final `skill_details.json` schema (and whether we key by `skillNameEN` only or `className|skillNameEN`).
3. **Scraper**: Implement `scripts/scrape_skill_details.js` (and optional icon download), run it, commit `skill_details.json` (and icons if local).
4. **Data loading**: In the app, load skill details (fetch JSON or API) when the Class Mod tab is active (or on first open of a skill card).
5. **UI**: Add `selectedSkillForDetail` state, make skill name (or info icon) open the card, and render the modal with icon + description from the JSON.
6. **Polish**: Apply the visual tweaks (clickable style, optional list icons, empty state).

---

## 7. Files to touch (summary)

| Area | Files |
|------|--------|
| Data | New: `web/public/data/skill_details.json` (or `api/data/` + route) |
| Scraper | New: `scripts/scrape_skill_details.js` |
| Icons (optional) | New: `web/public/data/skill_icons/*.png` (or similar) |
| UI | `web/src/pages/beta/UnifiedItemBuilderPage.tsx` — Class Mod skills block: click handler, modal, fetch/details display |

---

## Next step

**Choose the website** to scrape (e.g. “Borderlands wiki BL4 Amon skills” or an official URL) and share:
- The base URL (e.g. list of all skills or one class’s skills).
- One example skill page URL (so we can identify where the description and icon are in the HTML).

Then we can implement the scraper and the JSON shape, and wire up the popup in the Class Mod tab.
