# Launch BL4 Editor to the Internet (A to Z)

**Goal:** Get the BL4 AIO Save Editor live at **https://BL4Editor.com** using Render, from a cold start. This guide assumes you have never deployed a web app or used GitHub/Render before.

**What you’ll have when done:** One URL (https://BL4Editor.com) that loads the app; the same site handles the API. No separate “api” subdomain unless you want it later.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Background images (so themes show the right wallpaper)](#2-background-images-so-themes-show-the-right-wallpaper)
3. [Test the app locally (optional but recommended)](#3-test-the-app-locally-optional-but-recommended)
4. [Put your project on GitHub](#4-put-your-project-on-github)
5. [Create a Render account and one Web Service](#5-create-a-render-account-and-one-web-service)
6. [Connect GitHub to Render and create the service](#6-connect-github-to-render-and-create-the-service)
7. [Add your custom domain (BL4Editor.com)](#7-add-your-custom-domain-bl4editorcom)
8. [Point your domain to Render (DNS)](#8-point-your-domain-to-render-dns)
9. [Go live and verify](#9-go-live-and-verify)
10. [Checklist and troubleshooting](#10-checklist-and-troubleshooting)

---

## 1. Prerequisites

Before you start, have these ready:

- **A computer** with the BL4 AIO Web project (this repo) on it.
- **A GitHub account.** If you don’t have one: go to [github.com](https://github.com), click **Sign up**, and create a free account.
- **Your domain BL4Editor.com** already purchased and access to its **DNS settings** (where you bought it: GoDaddy, Namecheap, Google Domains, Cloudflare, etc.).
- **Git** installed. Check by opening a terminal (PowerShell on Windows, Terminal on Mac) and typing:
  ```bash
  git --version
  ```
  If you see a version number, you’re good. If not, install from [git-scm.com](https://git-scm.com/).

---

## 2. Background images (so themes show the right wallpaper)

The app has 8 themes (Ion, Lava, Phoenix, Violet, etc.). Each theme can show a different background image. Those images must be in the **web** app’s public folder so they’re included when you build and deploy.

### Where the images live

- **Folder:** `web/public/BG_Themes/`
- **Exact filenames (case matters):**
  - `Ion.png`
  - `Lava.png`
  - `Phoenix.png`
  - `Violet.png`
  - `Blue_Balls.png`
  - `Artic Hex.png` (note: space, not underscore)
  - `Carbon_Flux.png`
  - `Platinum.png`

### How to get the images

**Option A – You have the desktop BL4 Save Editor**

1. Open the desktop app’s install folder and find the `BG_Themes` folder.
2. Copy every `.png` from that folder into:
   ```
   BL4_AIO_Web\web\public\BG_Themes\
   ```
3. If any file is named with a space (e.g. `Artic Hex.png`), keep it exactly like that.

**Option B – Copy from the desktop repo (if you have it)**

If your desktop app source is in a folder like `Borderlands4-SaveEditor-3.4.5.2`:

1. Go to that folder’s `BG_Themes` directory.
2. Copy all `.png` files into:
   ```
   BL4_AIO_Web\web\public\BG_Themes\
   ```

**Option C – No images**

If you don’t add any images, the app still runs; you’ll just see a solid dark background instead of the themed wallpapers. You can add images later and redeploy.

### Check that they’re in the right place

Open `web\public\BG_Themes\` in File Explorer. You should see the 8 PNG files listed above. When you deploy to Render, this folder is part of the project and gets built into the site, so the backgrounds will work there too.

---

## 3. Test the app locally (optional but recommended)

This confirms the app and API work before you push to GitHub and deploy.

### One-service mode (same as production)

From the **repo root** (the folder that contains `api`, `web`, and `Dockerfile`):

1. **Build the web app** (so it uses the same origin for the API):
   ```bash
   cd web
   set VITE_API_URL=
   npm ci
   npm run build
   cd ..
   ```
   On Mac/Linux use `export VITE_API_URL=` instead of `set VITE_API_URL=`.

2. **Run the API** (it will serve the built web app from `web/dist` if that folder exists):
   ```bash
   cd api
   npm ci
   npm run build
   cd ..
   node api/dist/index.js
   ```
   Or from repo root: `node api/dist/index.js` (with `api` and `web` built as above).

3. Open a browser to: **http://localhost:3001**
   - You should see the BL4 Editor.
   - Change the theme in the header; the background image should change if you added the PNGs in Step 2.
   - Try a feature that uses the API (e.g. Master Search or Save Tools) to confirm the API works.

4. Stop the server with `Ctrl+C` in the terminal.

If that works, you’re ready to push to GitHub and deploy.

---

## 4. Put your project on GitHub

You need the code on GitHub so Render can pull it and build/deploy.

### 4.1 Open a terminal in your project

- **Windows:** In File Explorer, go to the folder `BL4_AIO_Web` (repo root), then in the address bar type `powershell` and press Enter.
- **Mac/Linux:** Open Terminal, then run:
  ```bash
  cd /path/to/BL4_AIO_Web
  ```
  (Replace with the real path to your project.)

### 4.2 Initialize Git (if this folder isn’t a Git repo yet)

Run:

```bash
git init
```

If you already see a `.git` folder or have used `git` here before, you can skip this.

### 4.3 Ignore files you don’t want on GitHub

Make sure you have a `.gitignore` so `node_modules`, build output, and secrets aren’t pushed. If the file doesn’t exist, create it in the repo root with at least:

```
node_modules/
api/node_modules/
web/node_modules/
dist/
web/dist/
.env
.env.local
*.log
```

(Your project may already have a fuller `.gitignore`; that’s fine.)

### 4.4 Add all files and commit

```bash
git add .
git status
```

Review the list; you should **not** see `node_modules` or `.env`. Then:

```bash
git commit -m "BL4 Editor web app ready for deploy"
```

### 4.5 Create a new repo on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click the **+** (top right) → **New repository**.
3. **Repository name:** e.g. `BL4_AIO_Web` or `bl4-editor`.
4. **Public.**
5. **Do not** check “Add a README” (you already have code).
6. Click **Create repository**.

### 4.6 Connect your folder to GitHub and push

GitHub will show “push an existing repository from the command line.” In your project folder run (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name):

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

If GitHub asks for a password, use a **Personal Access Token** (Settings → Developer settings → Personal access tokens) instead of your account password.

After this, your code is on GitHub. Any time you make changes:

```bash
git add .
git commit -m "Describe what you changed"
git push
```

Render will redeploy when you push (if you enable auto-deploy in the next steps).

---

## 5. Create a Render account and one Web Service

You will use **one** service type: **Web Service** (not Static Site). That single service runs the Docker image that serves both the React app and the API.

### 5.1 Sign up for Render

1. Go to [render.com](https://render.com).
2. Click **Get Started for Free**.
3. Sign up with your **GitHub** account (easiest so Render can see your repos).

### 5.2 Create a new Web Service

1. In the Render dashboard, click **New +** → **Web Service**.
2. You’ll be asked to connect a repository; we’ll do that in the next section.

---

## 6. Connect GitHub to Render and create the service

### 6.1 Connect the repo

1. If Render shows “Connect a repository,” click **Connect account** or **Configure account** and authorize GitHub.
2. Find your repo (e.g. `BL4_AIO_Web`) in the list and click **Connect** (or **Select**).
3. If you don’t see it, click **Configure account** and give Render access to the right GitHub account/organization.

### 6.2 Configure the Web Service

Use these settings exactly (unless you have a reason to change them):

| Setting | Value |
|--------|--------|
| **Name** | `bl4-editor` (or any name you like) |
| **Region** | Choose one close to you or your users |
| **Branch** | `main` (or whatever branch you push to) |
| **Root Directory** | Leave **blank** (Render uses the repo root) |
| **Environment** | **Docker** |
| **Dockerfile Path** | `Dockerfile` (repo root) |
| **Instance Type** | Free (or a paid plan if you want no cold starts) |

### 6.3 Start command

Leave **Start Command** blank. The Dockerfile already has:

```dockerfile
CMD ["node", "api/dist/index.js"]
```

Render will use that.

### 6.4 Environment variables (optional)

- For a **public** site: leave **Environment** empty (no `STAGING_KEY`).
- If you want to hide the site behind a key while testing, add:
  - **Key:** `STAGING_KEY`
  - **Value:** a long random string you keep secret (and use in the app’s staging gate if you have one).

### 6.5 Health check (recommended)

So Render knows the app is running, set the health check path:

1. After creating the service, go to **Settings**.
2. Find **Health Check Path** (under “Building & Deploying” or “Health”).
3. Set it to: **`/api/health`**
4. Save.

Click **Create Web Service** (or **Deploy**).

### 6.6 First deploy

Render will:

1. Clone your repo
2. Build the Docker image (installs Node, Python, builds API and web app)
3. Start the container

The first build can take several minutes. When it’s done, the service will show **Live** and you’ll get a URL like:

**https://bl4-editor.onrender.com**

Open that URL: you should see the BL4 Editor. The API is at the same host under `/api`, e.g.:

**https://bl4-editor.onrender.com/api/health**

If that works, next step is to use your own domain.

---

## 7. Add your custom domain (BL4Editor.com)

### 7.1 Open the service’s settings

1. In Render, open your **Web Service** (e.g. `bl4-editor`).
2. Go to the **Settings** tab.
3. Find the **Custom Domains** section.

### 7.2 Add the domain

1. Click **Add Custom Domain**.
2. Enter: **BL4Editor.com** (or **bl4editor.com**; Render usually normalizes to lowercase).
3. Click **Save** (or **Add**).

Render will show a message like “We need a CNAME (or A) record pointing to …” and give you a **value** (e.g. `bl4-editor.onrender.com` or a similar hostname). **Keep this page open**; you’ll use that value in the next section.

You can also add **www.BL4Editor.com** if you want; Render will show a second DNS target for `www`.

---

## 8. Point your domain to Render (DNS)

You must tell the internet: “When someone goes to BL4Editor.com, send them to Render.” You do that at the place where you manage DNS for BL4Editor.com (your registrar or DNS provider).

### 8.1 Find where DNS is managed

- You bought the domain at **GoDaddy / Namecheap / Google Domains / Cloudflare / etc.**  
- Log in there and find **DNS**, **Manage DNS**, **DNS Settings**, or **Nameservers**.

### 8.2 Add the record Render gave you

Render usually gives you one of:

- **CNAME** for the root domain or for `www`
- Or an **A** record (an IP address)

Do **exactly** what Render’s “Custom Domains” page says. Typical cases:

**If Render says “Add a CNAME”:**

| Type | Name / Host | Value / Target / Points to |
|------|-------------|-----------------------------|
| CNAME | `@` (or leave blank, or `BL4Editor.com` depending on provider) | The hostname Render gave you, e.g. `bl4-editor.onrender.com` |

- Some registrars use `@` for “root domain.”  
- Some want **Name** = `www` for www and a separate row for the “naked” domain.  
- **No** `https://` in the value; just the hostname, e.g. `bl4-editor.onrender.com`.

**If Render says “Add an A record”:**

| Type | Name | Value |
|------|------|--------|
| A | `@` (or blank) | The IP address Render shows |

### 8.3 Optional: www

If you added **www.BL4Editor.com** in Render:

- Add another CNAME: **Name** = `www`, **Value** = same target as Render shows for `www` (often the same as the root).

### 8.4 Save and wait

- Click **Save** (or **Add record**) at your DNS provider.
- DNS can take **5–60 minutes** (sometimes longer). Render will show a status like “Pending” until it sees the correct record, then it will issue HTTPS and show “Active” or a green check.

Do **not** add both a CNAME and an A record for the same name unless your provider or Render explicitly says so.

---

## 9. Go live and verify

### 9.1 Wait for DNS and HTTPS

- In Render → your service → **Custom Domains**, wait until BL4Editor.com shows as **Active** or with a green check.
- Then open: **https://BL4Editor.com**

You should see the BL4 Editor. The browser should show a padlock (HTTPS).

### 9.2 Quick checks

- **Home page:** Loads and looks correct.
- **Theme / background:** Change the theme in the header; the background image should change if you added the PNGs in Step 2.
- **API:** Open **https://BL4Editor.com/api/health** in a new tab. You should see something like `{"ok":true,"timestamp":"..."}`.
- **Features:** Try Master Search, Save Tools (e.g. decrypt), or any feature that uses the API; they should work without “service unavailable.”

### 9.3 If you use www

- **https://www.BL4Editor.com** should also work (and you can set a redirect to the non-www version in Render if you prefer).

---

## 10. Checklist and troubleshooting

### Launch checklist

- [ ] Background images in `web/public/BG_Themes/` (all 8 PNGs) if you want themed wallpapers.
- [ ] Local test: built web with `VITE_API_URL=` and ran `node api/dist/index.js`; app and API work at http://localhost:3001.
- [ ] Project on GitHub: `git add`, `commit`, `push` to `main` (or your chosen branch).
- [ ] Render: **one** **Web Service**, **Docker**, Dockerfile at repo root, branch `main`, no root directory.
- [ ] Render deploy: build succeeds, service is **Live**, default Render URL works.
- [ ] Custom domain: BL4Editor.com added in Render → Settings → Custom Domains.
- [ ] DNS: CNAME (or A) at your registrar pointing to the value Render gave you.
- [ ] https://BL4Editor.com loads the app; https://BL4Editor.com/api/health returns OK.

### One service, not two

- You use **one** Render **Web Service** (Docker). You do **not** create a separate “Static Site” for this setup.
- The same service serves the React app at `/` and the API at `/api`. No `VITE_API_URL` is needed in Render for this.

### Build fails on Render

- Check the **Build logs** in Render. Common issues:
  - Missing files: ensure all data folders (`grenade`, `repkit`, `shield`, `heavy`, `class_mods`, `enhancement`, `scripts`, `master_search`, `weapon_edit`, etc.) are in the repo and not in `.gitignore`.
  - Dockerfile path must be `Dockerfile` at repo root; Root Directory must be blank.

### Domain not working / “Pending”

- Wait 15–60 minutes after changing DNS.
- Confirm the CNAME (or A) **value** matches **exactly** what Render shows (no typo, no `https://`).
- Use a DNS lookup tool (e.g. [whatsmydns.net](https://www.whatsmydns.net)) and check that BL4Editor.com resolves to Render’s hostname or IP.

### Background images don’t show

- Confirm the 8 PNG files are in `web/public/BG_Themes/` with the exact names listed in Section 2.
- Redeploy (push a small change and let Render rebuild, or use **Manual Deploy** in Render).

### API “service unavailable” on the live site

- Open https://BL4Editor.com/api/health. If it fails, the container may be crashing or not listening on `PORT`. Check Render **Logs** for errors.
- Ensure you didn’t set `VITE_API_URL` for this one-service setup; the app should call `/api/...` on the same origin.

---

When everything is checked, your app is live at **https://BL4Editor.com** with one Render Web Service, your custom domain, and (if you added the PNGs) theme backgrounds working end to end.
