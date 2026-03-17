# BL4 AIO Web – Run & Deploy

This document explains how to run the web app and API locally and how to deploy to **non-GitHub** hosts (e.g. Cloudflare, Render, Vercel, Netlify, or your own server).

---

## Prerequisites

- **Node.js** 18+ and **npm** (ensure `node` and `npm` are on your PATH)
- (Optional) **Git** if you clone the repo

---

## 1. Run locally

### 1.1 Backend (API)

```bash
cd api
npm install
cp .env.example .env
npm run dev
```

- API runs at **http://localhost:3001**
- Endpoints: `GET /health`, `GET /version`, `GET /news`, `GET /parts/manifest`, `GET /parts/search?q=...`, `POST /admin/update`

### 1.2 Frontend (Web)

In a **second terminal**:

```bash
cd web
npm install
npm run dev
```

- App runs at **http://localhost:5173**
- Vite proxies `/api/*` to `http://localhost:3001/*`, so the app talks to the local API.

### 1.3 Sample .env (API)

`api/.env` (copy from `api/.env.example`):

```env
PORT=3001
NODE_ENV=development
# PARTS_SOURCE_URL=
# ADMIN_SECRET=
```

### 1.4 Build for production (local check)

**API:**

```bash
cd api
npm run build
npm start
```

**Web:**

```bash
cd web
npm run build
npm run preview
```

- `web/dist` is the static output. Point any static file server at it.
- For production, the browser must reach the API. Either:
  - Serve the static site and API on the same host (e.g. nginx or a Node server that serves `web/dist` and proxies `/api` to the API), or
  - Set `VITE_API_URL` when building the web app to the full API URL (e.g. `https://api.yoursite.com`) and ensure the API is deployed and CORS allows your frontend origin.

---

## 2. Deploy (no GitHub hosting)

You can host the repo on **GitLab**, **Bitbucket**, or **direct upload**; the app does not require GitHub for hosting.

### Option A: Cloudflare

- **Frontend:** Cloudflare Pages  
  - Connect your repo (GitLab/Bitbucket) or upload `web/dist` (e.g. with Wrangler).  
  - Build: `cd web && npm ci && npm run build`  
  - Publish directory: `web/dist`
- **Backend:** Cloudflare Workers (Node-compatible) or a small Node server elsewhere.  
  - If you use a separate Node host, set the Worker or Pages env `VITE_API_URL` to that API URL and rebuild the frontend.
- **Storage:** Optional Cloudflare R2 for parts/CSV/images.

### Option B: Render

- **Frontend:** Render **Static Site**  
  - Build: `cd web && npm install && npm run build`  
  - Publish: `web/dist`
- **Backend:** Render **Web Service**  
  - Root: `api`  
  - Build: `npm install && npm run build`  
  - Start: `npm start`
- **Env:** Set `PORT` (Render provides it). For frontend to call API, set **VITE_API_URL** to the Render backend URL (e.g. `https://your-api.onrender.com`) in the Static Site build env, then rebuild.

### Option C: Vercel

- **Frontend:** Import project, set root to `web`, build `npm run build`, output `web/dist` (or Vercel default).
- **Backend:** Deploy `api` as a second project (Node server) or use Vercel Serverless Functions under `/api` that proxy to your Node API. Set **VITE_API_URL** to the backend URL if frontend and API are on different domains.

### Option D: Netlify

- **Frontend:** Build command `cd web && npm install && npm run build`, publish `web/dist`.
- **Backend:** Netlify Functions or a separate Node host. Set **VITE_API_URL** in the build env if the API is on another domain.

### Option E: Your own VPS / server

- Serve `web/dist` with nginx (or any static server).
- Run the API with Node: `cd api && npm run build && npm start` (use a process manager like systemd or PM2).
- Optionally put nginx in front and proxy `/api` to the Node process.

---

## 3. Environment summary

| Variable        | Where   | Purpose |
|----------------|---------|---------|
| `PORT`         | API     | Server port (default 3001). |
| `NODE_ENV`     | API     | `development` / `production`. |
| `PARTS_SOURCE_URL` | API | Optional; URL for `/admin/update` to pull parts data. |
| `ADMIN_SECRET` | API     | Optional; secret for `POST /admin/update`. |
| `VITE_API_URL` | Web (build) | Full API URL when frontend and API are on different origins. Leave unset if you proxy `/api` from the same host. |

---

## 4. Feature parity note

All features of the desktop app are preserved in the **plan** (see **WEB_PORT_PLAN.md**). The first web release (v1) includes:

- Dashboard, Master Search (search, filters, favorites, legend highlights, lightbox), Settings (8 themes, about/credits), Save Tools hub with **client-side only** file import/export and placeholders for Character, Inventory, Weapon Toolbox, Accessories, Parts Translator, Backpack.

Phase 2 will add the full save editing logic (parsers/encoders) so behavior matches the EXE; stubs and architecture are already in place.
