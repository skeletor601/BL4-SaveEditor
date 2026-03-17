# How to Test the BL4 Web App (No Coding Needed)

Follow these steps in order. You’ll open two windows (one for the “server,” one for the website) and then use your browser.

---

## Step 1: Install Node.js (One-Time)

1. Go to **https://nodejs.org**
2. Download the **LTS** version (green button).
3. Run the installer. Accept the defaults and click Next until it finishes.
4. **Close any open terminals or Command Prompt windows** (so they pick up Node).
5. You do **not** need to install anything else.

---

## Step 2: Open a Terminal on Your Project

**Option A – From File Explorer**

1. Open File Explorer and go to: `C:\BL4\BL4_AIO_Web`
2. Click the **address bar** at the top (where it shows the path).
3. Type `cmd` and press **Enter**.  
   A black Command Prompt window will open **in that folder**.

**Option B – From Start menu**

1. Press the **Windows** key, type `cmd`, and press **Enter**.
2. In the Command Prompt, type exactly (then press Enter):

   ```text
   cd C:\BL4\BL4_AIO_Web
   ```

---

## Step 3: Start the Backend (API)

1. In the same terminal, type exactly and press **Enter** after each line:

   ```text
   cd api
   npm install
   ```

   Wait until it finishes (no red errors).

2. Then type:

   ```text
   npm run dev
   ```

3. You should see something like: `Server listening at http://0.0.0.0:3001`  
   **Leave this window open.** Do not close it.

---

## Step 4: Start the Website (Second Terminal)

1. Open a **new** Command Prompt (Windows key → type `cmd` → Enter).
2. Type exactly and press **Enter**:

   ```text
   cd C:\BL4\BL4_AIO_Web\web
   npm install
   ```

   Wait until it finishes.

3. Then type:

   ```text
   npm run dev
   ```

4. You should see something like: `Local: http://localhost:5173/`  
   **Leave this window open too.**

---

## Step 5: Open the App in Your Browser

1. Open **Chrome**, **Edge**, or **Firefox**.
2. In the address bar type: **http://localhost:5173**
3. Press **Enter**.

You should see the **BL4 AIO** dashboard with dark theme and the six cards (Character, Inventory, Weapon Toolbox, etc.).

---

## What to Try

- **Dashboard** – You’re already there. Click any card (e.g. **Master Search**).
- **Master Search** – Use the search box, try filters, click a row to open the detail popup, use the star to add favorites.
- **Theme** – Use the **Theme** dropdown in the top-right and pick another theme (e.g. Lava, Violet).
- **Settings** – Click **Credits** in the top-right (or open **Settings** from the menu) to see About and theme buttons.
- **Save Tools** – Click **Save Tools**, then **Open (choose file)** to pick a file (nothing is uploaded). Try **Save / Export** to download a small test file.

---

## If Something Goes Wrong

**“npm is not recognized”**

- Install Node.js from https://nodejs.org (Step 1) and then **close and reopen** Command Prompt.

**“gyp ERR!” or “Could not find Visual Studio” when running `npm install` in the `api` folder**

- The project no longer needs Visual Studio. If you see this, the `api` folder may have old files. Do this:
  1. Close Command Prompt.
  2. In File Explorer go to `C:\BL4\BL4_AIO_Web\api`.
  3. Delete the folder named `node_modules` (and the file `package-lock.json` if you see it).
  4. Open Command Prompt again, run `cd C:\BL4\BL4_AIO_Web\api`, then `npm install`, then `npm run dev`.

**“Cannot find module” or install errors in `api` or `web`**

- Make sure you ran `npm install` in **that** folder (`api` or `web`) and it finished without red errors.

**Blank page at http://localhost:5173**

- Check that **both** terminals are still running (`npm run dev` in `api` and in `web`).
- Try **http://127.0.0.1:5173** instead.

**Port already in use**

- Close any other program that might be using the same port, or restart the computer and run Step 3 and Step 4 again.

---

## When You’re Done Testing

- In **both** Command Prompt windows, press **Ctrl+C** once to stop the servers.
- Then you can close the windows.

Next time you want to test, repeat **Step 3** (start API) and **Step 4** (start website), then open **http://localhost:5173** in your browser.
