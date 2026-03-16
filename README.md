# BL4 AIO Save Editor

> **Live editor → [bl4editor.com](https://bl4editor.com)**

An all-in-one Borderlands 4 save editing platform — browser-based and desktop. Build modded weapons, search the full parts database, edit every item type, and manage your save backpack without installing anything.

---

## 🌐 Web Editor — bl4editor.com

The full editor runs in your browser at **[bl4editor.com](https://bl4editor.com)** — no install, no account, works on desktop and phone.

### Features

| Feature | What it does |
|---|---|
| **Unified Item Builder** | Build or edit weapons, grenades, shields, class mods, repkits, and heavy weapons from a single page with live Base85 ↔ deserialized sync |
| **Modded Weapon Generator** | One-click generates OP/insane modded weapons with stacked damage, underbarrels, visual barrels, and skin injection |
| **DPS Estimator** | Live damage-per-second estimate based on barrel stats and stacked parts |
| **Master Search** | Search all 9,600+ parts by name, manufacturer, rarity, or type with hover previews and part detail cards |
| **Backpack Manager** | Add, remove, duplicate, and upgrade items directly in your save |
| **Parts Translator** | Paste a raw code and see every part decoded into plain English |
| **Skin Preview** | Real-time weapon skin previews while you build |
| **Save Decrypt / Encrypt** | Load a `.sav` file with your Epic or Steam User ID, edit, and re-export as `.sav`, `.json`, or `.yaml` |

---

## 🚀 Desktop Download

Windows standalone executable — no install required.

**→ [Releases](https://github.com/skeletor601/BL4-SaveEditor/releases)**

The desktop app includes everything in the web editor plus:
- Direct save file access (no manual decrypt/encrypt)
- Offline use
- 8 selectable themes

---

## 🛠 Tech Stack

**Web frontend** — React + TypeScript + Vite + Tailwind CSS
**API** — Fastify (Node.js) · save decrypt/encrypt · parts database · encode/decode
**Desktop** — Python 3.11 + PyQt6 + PyInstaller
**Parts database** — 9,600+ entries covering all item categories, built from game data CSVs

---

## ⚠️ Disclaimer

Unofficial project — not affiliated with Gearbox Software or 2K Games. Use responsibly.

---

## 💬 Contact / Support

Discord: **DrLecter6969**
GitHub Issues are welcome.
