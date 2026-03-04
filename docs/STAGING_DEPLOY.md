# Staging deploy on Render (no custom domain)

Use Render’s **default URLs** for real-world testing (mobile upload/decrypt/encrypt/download) without exposing an incomplete editor on **bl4editor.com**. Keep bl4editor.com as a “Coming Soon” splash until feature parity is ready.

---

## Protection layer

- **Access key:** Staging build requires a key (env `VITE_STAGING_KEY` / `STAGING_KEY`). Users see an “Enter access key” screen until they submit the correct key (or use `?key=YOUR_KEY` in the URL). Session-only (sessionStorage).
- **Hidden route:** You can share the app at `/beta` (e.g. `https://your-static.onrender.com/beta?key=YOUR_KEY`) so the main path can show something else later if needed.
- **API:** When `STAGING_KEY` is set on the API, every request (except `GET /` and `GET /health`) must send header `X-Staging-Key: <STAGING_KEY>` or the API returns 401.
- **Robots:** When `VITE_STAGING_KEY` is set, the app injects `<meta name="robots" content="noindex, nofollow">` so search engines don’t index the staging site.
- **Do not advertise** the staging URL publicly; share only with testers who have the key.

---

## 1. Web Service (API) – staging

1. In Render, open your **Web Service** for this repo.
2. **Build:** Docker (use repo root `Dockerfile`).
3. **Environment variables**
   - `STAGING_KEY` = a secret string (e.g. a long random password). **Required for staging.** Use the same value as `VITE_STAGING_KEY` on the static site so the frontend can send it.
4. **Custom domain:** Leave **empty**. Use only the default Render URL (e.g. `https://bl4-aio-api.onrender.com`).
5. Deploy and note the service URL.

---

## 2. Static Site (frontend) – staging

1. In Render, open your **Static Site** for this repo.
2. **Root directory:** `web`
3. **Build command:** `npm ci && npm run build` (or `npm install && npm run build`)
4. **Publish directory:** `dist`
5. **Environment variables**
   - `VITE_API_URL` = your **Web Service** URL (e.g. `https://bl4-aio-api.onrender.com`) — no trailing slash.
   - `VITE_STAGING_KEY` = **same value** as `STAGING_KEY` on the API (so the gate accepts it and the app sends it on every request).
6. **Custom domain:** Leave **empty**. Use only the default Render URL (e.g. `https://bl4-aio-web.onrender.com`).
7. Build and deploy. Open the static site URL; you should see the staging gate. Enter the key (or visit `?key=YOUR_KEY`) to reach the editor. Test upload → decrypt → edit → encrypt → download on desktop and mobile.

---

## 3. Do not connect bl4editor.com yet

- **Do not** add bl4editor.com (or api.bl4editor.com) as a custom domain on Render for this staging deploy.
- Keep **bl4editor.com** as your “Coming Soon” splash (hosted wherever it is now).
- When you’re ready for production and feature parity, follow `docs/RENDER_AND_DOMAIN_SETUP.md` to attach the domain and optionally remove or change the staging key behavior.

---

## 4. Quick checklist

- [ ] API: Docker, `STAGING_KEY` set, no custom domain, deploy successful.
- [ ] Static site: Root `web`, `VITE_API_URL` and `VITE_STAGING_KEY` set, no custom domain, deploy successful.
- [ ] Open static URL → see gate → enter key (or `?key=...`) → use editor.
- [ ] Test full flow on a phone (upload .sav, decrypt, edit, download).
- [ ] bl4editor.com remains “Coming Soon” and is not pointed at this staging deploy.
