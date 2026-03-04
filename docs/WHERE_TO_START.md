# Where to Start (and What to Do When)

You want the **full app finished** before you share any link. Here’s the order that makes sense.

---

## Right now: develop and test **locally** (no Render yet)

You don’t need to deploy to Render until you’re ready to share. Until then, run everything on your PC and test in your browser (and on your phone on the same Wi‑Fi if you want).

### 1. Start the API (backend)

1. Open a terminal (PowerShell or Command Prompt).
2. Go to the API folder:
   ```bash
   cd c:\BL4\BL4_AIO_Web\api
   ```
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
4. Leave this terminal open. When it’s ready you’ll see something like “Listening at http://0.0.0.0:3001”.

### 2. Start the web app (frontend)

1. Open a **second** terminal.
2. Go to the web folder:
   ```bash
   cd c:\BL4\BL4_AIO_Web\web
   ```
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
4. In the terminal you’ll see a URL, usually **http://localhost:5173**. Open that in your browser.

### 3. Test the full flow locally

- Upload a .sav, enter your Steam/Epic ID, click Decrypt.
- Use Character (presets, sync levels), Backpack (add item), Master Search, etc.
- Click Download .sav and check the file.

No staging key, no deployment—everything stays on your machine. When you’re happy with how it works locally, you can think about putting it online.

---

## When the app is “complete enough” for you

- **Option A – Still not sharing:** Keep testing locally. Add or fix features until you’re satisfied.
- **Option B – Test on real internet (still not public):** Deploy to Render as **staging** (see **STAGING_DEPLOY.md**). You’ll get a Render URL and use a secret key so only you (and anyone you give the key to) can use it. Good for testing on your phone when you’re not on your home Wi‑Fi. **Do not** connect bl4editor.com yet; keep that as “Coming Soon.”
- **Option C – Ready to share:** Deploy to Render, attach **bl4editor.com** (see **RENDER_AND_DOMAIN_SETUP.md**), and optionally turn off the staging key so everyone can use it.

---

## Summary

| Goal | What to do |
|------|------------|
| **Finish and test the app** | Use **local only**: run API + web as above, test at http://localhost:5173. No Render, no link to share. |
| **Test on the internet without going public** | Later: deploy to Render **staging** (secret key, default Render URL). bl4editor.com stays “Coming Soon.” |
| **Share the real link** | When you’re ready: deploy production and connect bl4editor.com. |

So: **start and stay local** until the app feels complete. Deploy when you want to test on real URLs or when you’re ready to share.
