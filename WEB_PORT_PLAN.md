# BL4 AIO Web Port Plan

## 1. Overview

This document maps the desktop BL4 Save Editor / Master Search (Python + PyQt6) to a web-based, mobile-first application. The goal is to preserve dashboard layout, navigation, menus, feature categories, 8 themes, and overall cyberpunk dark / neon feel while enabling online use and phone-friendly UX.

**Constraints:** Save-file import/edit is client-side only (no uploads). Backend provides version check, parts manifest, optional parts search, and admin parts-library updates.

---

## 2. EXE → Web Mapping

### 2.1 Major Screens / Tabs (from EXE)

| EXE Section | Web Route | Notes |
|-------------|-----------|--------|
| Dashboard (6 cards) | `/` | Home; grid of Character, Inventory, Weapon Toolbox, Accessories, Master Search, News |
| Character | `/save-tools/character` | Select save, character, YAML (phase 2) |
| Inventory | `/save-tools/inventory` | Parts translator, backpack (phase 2) |
| Weapon Toolbox | `/save-tools/weapon-toolbox` | Wpn Gen, Wpn Edit (phase 2) |
| Accessories | `/save-tools/accessories` | Class mod, grenade, shield, repkit, heavy (phase 2) |
| Master Search | `/master-search` | **V1:** Search, filters, favorites, legend highlights, lightbox |
| News & Updates | `/` (dashboard card) or `/news` | Fetched from API or static |
| Parts Translator | `/save-tools/parts-translator` | Single/batch converter (phase 2) |
| Backpack | `/save-tools/backpack` | Item list + editor (phase 2) |
| Settings / Credits | `/settings` | Theme picker, toggles, about/credits |

### 2.2 Pages / Routes Summary

```
/                     Dashboard (card grid)
/master-search        Master Search (search, filters, table, lightbox)
/save-tools           Save Tools hub (placeholder + file import/export)
/save-tools/character
/save-tools/inventory
/save-tools/weapon-toolbox
/save-tools/accessories
/save-tools/parts-translator
/save-tools/backpack
/settings             Theme, toggles, about/credits
```

---

## 3. Component Tree (Outline)

```
App
├── ThemeProvider (CSS vars + theme name)
├── Layout
│   ├── AppHeader (title, Open/Save/Save As placeholders, theme dropdown, Credits link)
│   ├── AppNav (desktop: top tabs or sidebar; mobile: hamburger + drawer or bottom nav)
│   └── Footer (credits, status)
├── Pages
│   ├── DashboardPage (grid of 6 cards → routes)
│   ├── MasterSearchPage
│   │   ├── SearchBar + Filters (category, part type, sort, manufacturer, favorites only)
│   │   ├── PartsTable (virtualized) with Favorite star, Code, Item Type, Rarity, Part Name, Effect
│   │   ├── LegendHighlight (legendary row styling)
│   │   └── Lightbox (image preview modal)
│   ├── SaveToolsHubPage
│   │   ├── FileDropzone / FileInput (client-side only)
│   │   ├── ExportDownload (client-side export)
│   │   └── Placeholder cards for Character, Inventory, Weapon, Accessories, Parts Translator, Backpack
│   └── SettingsPage
│       ├── ThemeSelector (8 themes)
│       ├── Toggles (future)
│       └── AboutCredits
└── Shared
    ├── Card, Button, Input, Select, Modal
    └── usePartsData, useFavorites (localStorage)
```

---

## 4. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/version` | Latest version, changelog, download links (EXE) |
| GET | `/parts/manifest` | Datasets available + version/hash |
| GET | `/parts/search` | Optional server-side search (v1 can be client-side only) |
| GET | `/parts/data` | Optional: serve full or chunked parts JSON/CSV for client |
| GET | `/news` | News/updates text or JSON |
| POST | `/admin/update` | One-button parts library updater (pull source, rebuild indexes); protect with secret or omit in public deploy |

Response shapes (conceptual):

- `GET /version` → `{ version, changelog?, downloadUrl? }`
- `GET /parts/manifest` → `{ datasets: { name, version, hash, updatedAt }[] }`
- `GET /parts/search?q=...&category=...` → `{ items: Part[] }` (if implemented server-side)

---

## 5. Data Model & Caching

- **Parts (Master Search):**  
  - Source: CSVs / JSON from EXE (e.g. `master_search/db`, `godrolls.json`, item localization).  
  - Web: Backend can serve static JSON or build SQLite + endpoint; frontend caches in memory and optionally in `localStorage` or IndexedDB for offline.  
  - Favorites: stored in `localStorage` only (e.g. `bl4-favorites.json` export/import as in EXE).

- **Version / News:**  
  - Backend reads `version_info.txt` and `news.txt` (or env/config) and serves via `/version` and `/news`.

- **Save files:**  
  - Never sent to server. File read via `<input type="file">` and FileReader; export via blob download. Parser/encoder stubs in frontend (phase 2).

- **Themes:**  
  - No backend. Theme id in `localStorage`; CSS variables + Tailwind for 8 themes (Ion, Lava, Phoenix, Violet, Blue_Balls, Artic_Hex, Carbon_Flux, Platinum).

---

## 6. Mobile UX Notes

- **Navigation:** Desktop: top bar + horizontal tabs or sidebar. Mobile: hamburger menu opening a drawer, or bottom nav (e.g. Home, Master Search, Save Tools, Settings).
- **Dashboard:** Grid becomes 1–2 columns on small screens; cards stay tappable with large hit areas.
- **Master Search:** Table becomes card list or stacked rows on narrow screens; filters collapse into a sheet or modal; virtualized list for performance.
- **Save Tools:** Single-column forms; file picker and download buttons remain client-side and touch-friendly.
- **Touch:** All buttons/controls min ~44px; avoid hover-only actions; keyboard focus visible for a11y.

---

## 7. Hosting Recommendations (No GitHub Hosting)

Use any of the following; the app does not depend on GitHub for hosting.

- **Option A – Cloudflare**  
  - **Frontend:** Cloudflare Pages (connect repo from GitLab, Bitbucket, or direct upload; or use Wrangler CLI).  
  - **Backend:** Cloudflare Workers (Node-compatible or TS) for `/health`, `/version`, `/parts/*`, `/news`; or a small Node server on a VPS/other host.  
  - **Storage:** Cloudflare R2 for parts CSV/JSON and images (optional).

- **Option B – Render**  
  - **Frontend:** Static Site (build command: `npm run build`, publish `web/dist`).  
  - **Backend:** Web Service (Node, `api/` with `npm start`).  
  - **Data:** Render PostgreSQL (when moving off SQLite) or keep SQLite on ephemeral disk for dev/small deploys.

- **Option C – Vercel**  
  - **Frontend:** Vercel (import project, set root to `web`, build `npm run build`).  
  - **Backend:** Vercel Serverless Functions in `/api` or separate Node service elsewhere.

- **Option D – Netlify**  
  - **Frontend:** Netlify (build `web`, publish `web/dist`).  
  - **Backend:** Netlify Functions or external Node host.

- **Option E – VPS / Any Node host**  
  - Serve `web/dist` with nginx or static middleware; run Node API on same or subdomain.  
  - Use SQLite (or Postgres) and local/R2/S3 for parts data.

Deploy and run steps are in **README_WEB.md**.

---

## 8. Theme System (8 Themes)

Themes from EXE `theme_manager.py`: **Ion, Lava, Phoenix, Violet, Blue_Balls, Artic_Hex, Carbon_Flux, Platinum.**

- Each theme maps to a set of CSS variables (e.g. `--color-accent`, `--color-bg`, `--color-panel`, `--font-mono`).  
- Optional: per-theme background image (from `BG_Themes/` or web equivalents).  
- Tailwind: use `var(--color-accent)` etc. in classes; theme switcher in Settings and optionally in header.

---

## 9. Feature Parity (Transition)

To keep all features working during the transition:

- **V1 web:** Dashboard, Master Search (search, filters, favorites, legend highlights, lightbox), Settings (themes, about/credits), Save Tools hub with client-side file import/export and placeholder sections.  
- **Phase 2:** Character, Inventory, Weapon Toolbox, Accessories, Parts Translator, Backpack, YAML/Base85 logic (stubs in place; implement parsers/encoders to match EXE behavior).  
- Backend serves version and parts manifest so the web app can prompt for EXE updates and parts library updates; admin/update can run on a schedule or one-button from a protected admin page.

This plan keeps the EXE as the reference; the web app replicates UI/flow and data consumption so that when phase 2 is implemented, behavior aligns with the desktop app.
