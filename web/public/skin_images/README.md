# Skin preview images

The Weapon Gen and Weapon Edit tabs show a preview image for the selected skin. Images are loaded from this folder.

**Filename format:** `{token}.png` — e.g. `Cosmetics_Weapon_Mat01_Synthwave.png`, `Cosmetics_Weapon_Shiny_bloodstarved.png`. Tokens match the `value` field in `master_search/db/weapon_skins.json`.

**How to add images:**

1. **From the desktop project:** Copy all `*.png` files from the desktop app’s `master_search/skin_images` folder into this folder (`web/public/skin_images/`).

2. **From this repo:** If you have run `python scripts/scrape_game8_weapon_skins.py` from the repo root, that populates `master_search/skin_images/`. Then from the `web/` directory run:
   ```bash
   npm run copy-skin-images
   ```
   to copy those images into `web/public/skin_images/`.

If no image exists for a token, the skin selector still works; the preview area will show the skin name and token only.

**Skins not on Game8 (no public image source yet):**  
Mech Yeah (Mat46), Assault (Mat47), Boltron (Mat48), Furboy (Mat49), Spicy Iguana (Mat50). IGN, Fandom, and Steam DLC pages do not list or picture these. Placeholder images can be generated with:
```bash
python scripts/create_missing_skin_placeholders.py
```
To use real images when you find them (e.g. from a wiki, screenshot, or future guide), save PNGs in this folder with the exact token filename (e.g. `Cosmetics_Weapon_Mat46_MechYeah.png`); they will override the placeholders.
