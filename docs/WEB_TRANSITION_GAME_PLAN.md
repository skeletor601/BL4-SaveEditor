# BL4 AIO Web — Technical Game Plan: Full Online Version

**Primary objective:** Make the service usable by anyone with an internet connection — no local installs, no external tools, no manual file manipulation outside the browser.

**Key constraints:** All encrypt/decrypt via backend API; no client-side crypto for core save operations; no third-party save editor APIs; mobile-first; clean separation (API / frontend / static assets); performance on lower-end devices; clear flow: upload → decrypt → edit → encrypt → download.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User (browser, any device)                                              │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React SPA, Vite)                                              │
│  • Routes: /, /character/*, /inventory/*, /weapon-toolbox/*,             │
│    /accessories/*, /master-search, /settings                             │
│  • SaveContext: holds saveData, saveUserId, savePlatform, rawYamlUtf8,    │
│    rawBytesBase64; calls API for decrypt/encrypt/decode-items             │
│  • No crypto: decrypt/encrypt only via fetch to backend                  │
│  • Static: parts list cached from API; themes, layout                     │
└─────────────────────────────────────────────────────────────────────────┘
                    │  /api/*  (proxied in dev; same-origin or configurable in prod)
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node/Fastify) — api/                                            │
│  • Save routes: decrypt, encrypt, decode-items (Python script for decode)  │
│  • Parts routes: manifest, data, search                                   │
│  • Health, version, news, admin                                           │
│  • Body limit 15MB for .sav base64                                        │
└─────────────────────────────────────────────────────────────────────────┘
                    │  spawn Python (decode_serials.py) when needed
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PYTHON HELPERS (repo root)                                               │
│  • scripts/decode_serials.py — item serial decode + lookup (decoder_logic, │
│    lookup.py, bl4_decoder_py)                                             │
│  • Used only by API; not exposed to client                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow (core):**

1. User selects .sav file and enters User ID (Epic/Steam).
2. Frontend reads file to ArrayBuffer → base64, POST `/api/save/decrypt` with `user_id`, `sav_data`.
3. Backend decrypts (saveCrypto.ts), returns `yaml_content`, `platform`, `raw_bytes_base64`.
4. Frontend parses YAML into `saveData`, stores in SaveContext; user edits (Character, Inventory/Backpack, YAML, etc.).
5. For download: if no edits, POST `raw_bytes_base64` + `user_id` + `platform` to `/api/save/encrypt`; else POST `yaml_content` + `user_id` + `platform`. Backend encrypts, returns binary .sav.
6. Frontend triggers download of the .sav file.

---

## 2. Required Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness (Render, load balancers). |
| POST | `/save/decrypt` | Body: `user_id`, `sav_data` (base64). Returns `yaml_content`, `platform`, `raw_bytes_base64`. |
| POST | `/save/encrypt` | Body: `user_id`, `platform`, and either `yaml_content` or `raw_bytes_base64`; optional `filename`. Returns binary .sav or JSON if `?metadata=1`. |
| POST | `/save/decode-items` | Body: `serials` (string[]). Returns decoded item names/types/levels (via Python script). |
| GET | `/parts/manifest` | Parts dataset metadata. |
| GET | `/parts/data` | Full parts list for Master Search / Parts Translator. |
| GET | `/parts/search` | Optional query/category search. |
| GET | `/version` | App version, changelog. |
| GET | `/news` | News/updates. |
| POST | `/admin/update` | (Optional) Parts library update; protect with secret. |

**Already implemented:** `/save/decrypt`, `/save/encrypt`, `/save/decode-items`, `/parts/*`, `/health`, `/version`, `/news`, `/admin/update`.

---

## 3. Logic to Migrate from Desktop to Backend

| Desktop source | Current backend | Notes |
|----------------|-----------------|------|
| save_game_controller decrypt/encrypt | api/src/lib/saveCrypto.ts | Done (Node; matches desktop algorithm). |
| save_game_controller get_yaml_string, update_yaml_object | N/A | Frontend holds YAML/object; no backend state. |
| decoder_logic + lookup (item decode) | scripts/decode_serials.py + POST /save/decode-items | Done (spawn Python). |
| bl4_functions.process_and_load_items | Partially | Backend only decodes single serials; “all items” list could be API that accepts full YAML and returns processed list (future). |
| bl4_functions.add_item_to_backpack | Not yet | Could be POST /save/add-item (yaml_content + serial + flag) → return new yaml_content. |
| bl4_functions.sync_inventory_item_levels | Not yet | Could be POST /save/sync-levels (yaml_content) → return new yaml_content. |
| unlock_logic.* (World/Character presets) | Not yet | Could be POST /save/apply-preset (yaml_content, preset_name, params) → return new yaml_content. |
| save_game_controller.apply_character_data | Frontend only | characterData.ts applyCharacterData; no API needed unless we want server-side validation. |
| save_game_controller.update_item | Not yet | Could be POST /save/update-item (yaml_content, path, new_item_data) → return new yaml_content. |

**Must stay server-side:** Decrypt, encrypt, any operation that modifies binary or YAML in a way that must match desktop exactly (unlock presets, sync levels, add_item, update_item). These can be added as new endpoints that accept YAML and return YAML.

---

## 4. Logic to Remain Client-Side

- **Parsing/editing of save structure:** YAML parse/stringify (e.g. yaml library in browser); reading/writing character fields, currency, inventory slots (inventoryData.ts, characterData.ts).
- **UI state:** SaveContext (saveData, selection, form state); theme; Master Search filters/favorites (localStorage).
- **Parts Translator (decoded input):** Parsing decoded serial strings and looking up parts from `/parts/data` (partsTranslator.ts).
- **No crypto:** No AES/zlib/Base85 for .sav on client; no secret keys.

---

## 5. UI Sections for Web Parity with Desktop

| Desktop section | Web route | Status |
|-----------------|-----------|--------|
| Dashboard (cards) | `/` | Done. |
| Character → Select Save | `/character/select-save` | Done (upload .sav, User ID, decrypt, download). |
| Character → Character | `/character/character` | Done (name, level, XP, spec, cash, eridium, Apply). World/Character buttons present, disabled. |
| Character → YAML | `/character/yaml` | Done (YAML view + tree). |
| Inventory → Parts Translator | `/inventory/parts-translator` | Done (decoded input, translate). |
| Inventory → Backpack | `/inventory/backpack` | Done (tree, decode via API, deserialized code box). |
| Weapon Toolbox (Weapon Gen, Weapon Edit, Item Edit) | `/weapon-toolbox/*` | Placeholders. |
| Accessories (Class mod, Grenade, etc.) | `/accessories/*` | Placeholders. |
| Master Search | `/master-search` | Done. |
| Settings | `/settings` | Done. |

**Not required for “full online”:** Scan save folders (desktop-only); backup to local disk (user downloads instead).

---

## 6. Security Considerations

- **No persistence of saves on server:** Decrypt/encrypt are stateless; no storage of user_id or .sav content.
- **User ID in requests:** Sent in body; consider not logging full User ID. No auth; service is anonymous.
- **Body size:** 15MB limit to avoid DoS; sufficient for .sav.
- **CORS:** Currently `origin: true`; for production, restrict to frontend origin(s).
- **Admin route:** Protect `/admin/update` with secret (env); do not expose in public docs.
- **Python script:** Invoked only by backend with sanitized serials; no user-controlled paths.

---

## 7. Hosting Implications (Render)

- **Backend (Node):** Deploy `api/` as a web service. Build: `npm install`, start: `node dist/index.js` or `npm start`. Set `PORT` from Render. No Python on Render unless a Python service is added; if Render runs Node only, `/save/decode-items` must be replaced by a Node/port of the decoder or a separate Python worker. *Current setup assumes Python is available where Node runs (e.g. same repo deployed with Python runtime, or decode run elsewhere).*
- **Frontend (SPA):** Build `web/` with Vite; serve static files (e.g. from same backend or separate static site). API base URL must point to backend (e.g. `https://api.example.com` or relative if same host).
- **Single-service option:** Serve SPA from Node (e.g. fastify-static for `web/dist`) and mount API under `/api` so one URL works; then frontend uses relative `/api` and no CORS for same origin.
- **Memory/CPU:** Decrypt/encrypt and Python decode are CPU-bound; large .sav or many decode-items calls may need timeouts or rate limits on free tier.

---

## 8. Step-by-Step Implementation Phases

- **Phase 1 — Stability and accessibility**  
  - Configurable API base URL for production.  
  - Single place for API client (base URL + fetch).  
  - Clear “API unavailable” handling (e.g. on decrypt or app load).  
  - No new features; ensure upload → decrypt → edit → encrypt → download works when frontend and API are deployed.

- **Phase 2 — Backend parity for save mutations**  
  - POST `/save/add-item` (add item to backpack).  
  - POST `/save/sync-levels` (sync inventory levels to character level).  
  - POST `/save/apply-preset` (unlock World/Character presets).  
  - Wire Character tab “Sync levels” and World/Character buttons to these endpoints.

- **Phase 3 — Weapon Toolbox / Accessories**  
  - Weapon Gen, Weapon Edit, Item Edit (and Class mod, Grenade, Shield, etc.) as needed; share decode/encode with backend where required.

- **Phase 4 — Polish**  
  - Rate limits, timeouts, error messages; optional “Export backup” before destructive presets; mobile layout tweaks.

---

## 9. Phase 1 Scope (Implement Now)

1. **API base URL**  
   - Frontend reads `import.meta.env.VITE_API_URL` (or empty for same-origin).  
   - All save/parts/news/version fetches use this base (e.g. `${base}/save/decrypt`).

2. **Centralized API client**  
   - One small module (e.g. `apiClient.ts`) that builds URL and calls fetch; used by SaveContext, BackpackView, PartsTranslatorView, MasterSearch, Dashboard, etc.

3. **API unavailable handling**  
   - If decrypt or a critical fetch fails with network/5xx, show a clear message (e.g. “Service unavailable. Check your connection and try again.”) and do not assume API is present.

4. **No new features** in Phase 1; no new endpoints, no new UI beyond connection-error messaging.
