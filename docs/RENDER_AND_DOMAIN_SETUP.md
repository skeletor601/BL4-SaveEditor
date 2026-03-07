# Render + bl4editor.com Setup (production, when ready)

Use this guide **when you are ready for production** to connect your Web Service and Static Site on Render to **https://bl4editor.com**.

- **Staging (no domain):** Deploy first using Render default URLs and a staging key. See **STAGING_DEPLOY.md**. Keep bl4editor.com as “Coming Soon” until then.
- **Production (this doc):** After feature parity, attach the domain and optionally remove staging protection.

---

## 1. Know your two services

| Service type | What it runs | Your custom domain |
|--------------|--------------|--------------------|
| **Web Service** | Node API (decrypt/encrypt, sync, presets, add-item, decode-items). Uses the repo’s **Dockerfile** so Python is available for scripts. | `api.bl4editor.com` (recommended) |
| **Static Site** | Built React app from `web/`. Users open this in the browser. | `bl4editor.com` (and optionally `www.bl4editor.com`) |

---

## 2. Web Service (API)

1. In Render: open your **Web Service** for this repo.
2. **Build & deploy**
   - **Environment:** Docker (so Render uses the repo’s `Dockerfile`).
   - **Dockerfile path:** `Dockerfile` (repo root).
   - **Root directory:** leave blank (Docker build context is repo root).
3. **Start command:** Leave blank; the Dockerfile already sets `CMD ["node", "api/dist/index.js"]`.
4. **Environment variables**
   - `PORT` – Render sets this automatically; the app reads it.
   - (Optional) `NODE_ENV=production` – already set in the Dockerfile.
5. After deploy, note the **Render URL**, e.g. `https://bl4-aio-api.onrender.com`.
6. **Custom domain (API)**
   - In the Web Service → **Settings** → **Custom Domains**, add: `api.bl4editor.com`.
   - Render will show the DNS target (e.g. a CNAME like `bl4-aio-api.onrender.com` or similar). You’ll use this in step 4.

---

## 3. Static Site (frontend)

1. In Render: open your **Static Site** for this repo.
2. **Build settings**
   - **Root directory:** `web`
   - **Build command:**  
     `npm ci && npm run build`  
     (or `npm install && npm run build` if you don’t commit `package-lock.json`).
   - **Publish directory:** `dist`  
     (Render will use `web/dist` because root is `web`).
3. **Environment variable (required)**  
   So the app talks to your API:
   - **Key:** `VITE_API_URL`  
   - **Value:** your API URL:
     - If you added the custom domain: `https://api.bl4editor.com`
     - Otherwise: your Web Service URL, e.g. `https://bl4-aio-api.onrender.com`
4. **Custom domain (site)**
   - In the Static Site → **Settings** → **Custom Domains**, add: `bl4editor.com`.
   - Optionally add: `www.bl4editor.com`.
   - Note the DNS target Render shows (e.g. CNAME to `bl4editor.onrender.com` or similar).

---

## 4. DNS at your domain registrar

Where you bought **bl4editor.com**, add the records Render tells you. Typical setup:

| Type | Name / Host | Value / Target |
|------|-------------|----------------|
| **CNAME** | `api` | (exactly what Render shows for `api.bl4editor.com`, e.g. `bl4-aio-api.onrender.com`) |
| **CNAME** | `@` or `bl4editor.com` | (exactly what Render shows for `bl4editor.com`, e.g. `bl4editor.onrender.com`) |
| **CNAME** | `www` | (same as `@` if Render tells you to, or what they show for `www`) |

- Some registrars use `@` for the root domain; others use the full name `bl4editor.com`.
- Render may give you an **A** record instead of CNAME for the root; use what they show.
- Save DNS and wait 5–60 minutes for propagation.

---

## 5. HTTPS

Render provides HTTPS for your services and custom domains. No extra setup if you use Render’s DNS targets.

---

## 6. After DNS propagates

1. **API:** Open `https://api.bl4editor.com/health` (or your Web Service URL + `/health`). You should see a healthy response.
2. **Site:** Open `https://bl4editor.com`. The editor should load and use the API (e.g. decrypt, Character presets, Backpack add-item) without “service unavailable” errors.

---

## 7. If the API is on a different Render URL

If you don’t use `api.bl4editor.com` and keep the default Render URL (e.g. `https://bl4-aio-api.onrender.com`):

- Set **Static Site** env: `VITE_API_URL=https://bl4-aio-api.onrender.com`.
- Rebuild the Static Site so the new URL is baked in.
- The app will then call that API when users use https://bl4editor.com.

---

## 8. Checklist

- [ ] Web Service: Docker, build succeeds, service is “Live”.
- [ ] Web Service: Custom domain `api.bl4editor.com` added (optional but nice).
- [ ] Static Site: Root `web`, build command and publish directory set, **VITE_API_URL** set to API URL.
- [ ] Static Site: Custom domain `bl4editor.com` (and optionally `www`) added.
- [ ] DNS: CNAME (or A) for `api` and for `@`/`www` pointing to Render’s targets.
- [ ] Visit `https://bl4editor.com` and test: load save, decrypt, edit, download.

Your domain is **https://bl4editor.com** (note: `https` and no typo). The steps above get both the site and the API running and, if you use the custom API domain, keep everything under **bl4editor.com**.

---

## 9. Troubleshooting: "Service unavailable"

If users see **"Service unavailable. Check your connection and try again..."** when using **Sync All Backpack Item Levels to Character Level** (or decrypt, presets, add-item, etc.):

| Cause | What to check / do |
|-------|--------------------|
| **Frontend not pointing at API** | Static Site must have env **`VITE_API_URL`** set to your API URL (e.g. `https://api.bl4editor.com` or your Web Service URL). Rebuild the Static Site after changing it. |
| **API not reachable** | In a browser, open `https://api.bl4editor.com/health` (or your Web Service URL + `/health`). You should see a healthy JSON response. If it fails or times out, the API is down or DNS is wrong. |
| **Render free tier cold start** | On free tier, the Web Service sleeps after ~15 min idle. The first request after that can time out or return 502/503. The app will suggest "Wait 30 seconds and try again." User can retry once the API has woken up. |
| **API crash (500)** | Check the Web Service **Logs** on Render. If `save_mutate.py` or Python is missing, or the script errors, you’ll see it there. Ensure the Dockerfile includes the `scripts/` folder and Python. |
| **CORS** | If the browser blocks the request (e.g. wrong API URL), you get a network error. Double-check `VITE_API_URL` and that the API allows your site origin in CORS (the repo’s API should allow any origin for `/api/*`). |
