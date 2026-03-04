# BL4 Editor – Online Release Plan (Render + bl4editor.com)

This plan covers deploying the BL4 AIO Web app to **Render** and using your custom domain **bl4editor.com**.

---

## 1. Architecture options

### Option A (recommended): Single Web Service

- **One** Render **Web Service** (Docker).
- Serves the React app at `https://bl4editor.com` and the API at `https://bl4editor.com/api`.
- No CORS issues; one domain, one SSL cert.

### Option B: Two services

- **Static Site**: React app at `https://bl4editor.com` (or `https://www.bl4editor.com`).
- **Web Service**: API at `https://api.bl4editor.com`.
- Set `VITE_API_URL=https://api.bl4editor.com` when building the web app.
- CORS is already permissive (`origin: true`).

---

## 2. What the app needs at runtime

- **Node.js** (API): Fastify, reads CSVs/JSON from repo root.
- **Python 3**: Used by API for `scripts/decode_serials.py`, `scripts/encode_serial.py`, `scripts/save_mutate.py` (run with `cwd` = repo root).
- **Data under repo root**:  
  `scripts/`, `master_search/`, `weapon_edit/`, `grenade/`, `repkit/`, `shield/`, `heavy/`, `class_mods/`, `enhancement/`, plus root files like `b_encoder.py`, `decoder_logic.py`, `lookup.py`, `resource_loader.py`, etc.

The existing `Dockerfile` does not copy all of these (e.g. missing `grenade/`, `repkit/`, `shield/`, `heavy/`, `class_mods/`, `enhancement/`). The plan below fixes that for Option A.

---

## 3. Option A – Single service (step-by-step)

### 3.1 Update Dockerfile for production

1. **Copy all data the API and Python scripts need** (so paths like `getPath("class_mods/...")` and `REPO_ROOT` resolve):

   - Keep: `scripts/`, `master_search/`, `weapon_edit/`, `api/`, root Python/data files.
   - Add: `grenade/`, `repkit/`, `shield/`, `heavy/`, `class_mods/`, `enhancement/`.
   - Add: `web/` (for building the frontend).

2. **Build the web app inside the image** (so the same server can serve it):

   - Set `VITE_API_URL=` (empty) so the frontend uses relative `/api` (same origin).
   - Run `npm run build` in `web/`.
   - Copy `web/dist` into a known path (e.g. `/app/web/dist`).

3. **Serve static files and API from one process**:

   - Use `@fastify/static` to serve `web/dist` at `/`.
   - Register all existing API routes under prefix **`/api`** (so `/api/save/decrypt`, `/api/parts/search`, etc.).
   - Add an SPA fallback: for non-API GET requests that don’t match a file, serve `web/dist/index.html` (so client-side routing works for `/character`, `/accessories`, etc.).

4. **Listen on `PORT`** (Render sets this).

Result: one container that serves `https://bl4editor.com` (SPA) and `https://bl4editor.com/api/*` (API). No `VITE_API_URL` needed in Render; the frontend is built with relative `/api`.

### 3.2 Render Web Service setup

1. **Create a new Web Service**:
   - Connect your Git repo (e.g. GitHub).
   - **Environment**: Docker.
   - **Dockerfile path**: `Dockerfile` (repo root).
   - **Branch**: e.g. `main`.

2. **Environment variables** (if you use them):
   - `NODE_ENV=production` (optional; Dockerfile can set it).
   - `STAGING_KEY`: leave unset for public release; set only if you want staging protection.

3. **Instance type**: Start with the free or lowest paid tier; upgrade if the app hits timeouts or memory limits (Python + Node + data files).

4. **Custom domain**:
   - In Render: **Settings → Custom Domains** → Add `bl4editor.com`.
   - Render will show the required DNS records (usually a CNAME for `bl4editor.com` → your Render host, or an A record).
   - At your DNS provider (where bl4editor.com is registered), add the CNAME (or A) record as shown.
   - Optional: add `www.bl4editor.com` and redirect to `bl4editor.com` if you want.

5. **Deploy**: Push to the connected branch; Render builds the Docker image and deploys. After DNS propagates, `https://bl4editor.com` and `https://bl4editor.com/api/...` will work.

### 3.3 Checklist for Option A

- [ ] Dockerfile copies: `api/`, `scripts/`, `master_search/`, `weapon_edit/`, `grenade/`, `repkit/`, `shield/`, `heavy/`, `class_mods/`, `enhancement/`, and any root Python/data files the API or scripts reference.
- [ ] Dockerfile installs Python 3 and runs `npm run build` for `web/` with `VITE_API_URL=` (empty).
- [ ] API serves static from `web/dist` and registers all routes under `/api`.
- [ ] SPA fallback: GET requests that are not files and not `/api/*` serve `index.html`.
- [ ] Render Web Service uses that Dockerfile; custom domain `bl4editor.com` added and DNS updated.
- [ ] After deploy, test: open `https://bl4editor.com`, then test save decode/encode, Master Search, accessories, etc.

---

## 4. Option B – Two services (short)

- **Static Site** (Render):
  - Build command: `cd web && npm ci && VITE_API_URL=https://api.bl4editor.com npm run build`.
  - Publish directory: `web/dist`.
  - Custom domain: `bl4editor.com` (or `www.bl4editor.com`).

- **Web Service** (Render, Docker):
  - Use the same Dockerfile as in Option A but **without** building or serving the web app (API only).
  - Custom domain: `api.bl4editor.com`.
  - CORS is already open; no code change needed for that.

- **DNS**: CNAME (or A) for `bl4editor.com` → Static Site; CNAME for `api.bl4editor.com` → Web Service.

---

## 5. Security and secrets

- **Staging**: If you set `STAGING_KEY` on Render, the API will require the `X-Staging-Key` header for all non-health routes. For a public release, leave `STAGING_KEY` unset.
- **Secrets**: No API keys are required for the current feature set. If you add auth or external APIs later, use Render’s **Environment** (secret) variables and never commit them.

---

## 6. Post-release checks

- [ ] `https://bl4editor.com` loads the app.
- [ ] `https://bl4editor.com/api/health` (or equivalent) returns OK.
- [ ] Master Search, Weapon Toolbox, Accessories (Grenade, RepKit, Shield, Heavy, Class Mod, Enhancement) load and use the API.
- [ ] Save decrypt/encode and add-to-backpack (or equivalent) work.
- [ ] Custom domain shows a valid TLS cert (Render provides this automatically).

---

## 7. Summary

| Item | Recommendation |
|------|----------------|
| **Domain** | `bl4editor.com` (and optionally `www` → redirect) |
| **Deploy style** | Option A: one Docker Web Service serving SPA + API at `/api` |
| **Dockerfile** | Extend to copy all data dirs, build web with empty `VITE_API_URL`, serve static + SPA fallback, mount API under `/api` |
| **Render** | One Web Service, Docker, custom domain `bl4editor.com` |
| **Env** | No `VITE_API_URL` in Render for Option A; optional `STAGING_KEY` for staging |

If you want, the next step is to implement the Dockerfile and API changes (static serving + `/api` prefix and SPA fallback) in the repo so you can deploy Option A as-is on Render.
