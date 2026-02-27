Dashboard / home screen icons (used on the main dashboard cards and in the left nav).

Expected filenames (PNG):
  character.png
  inventory.png
  weapon_toolbox.png
  accessories.png
  master_search.png
  home.png

The app loads these via resource_loader from assets/icons/<name>.png. If a file is missing, the dashboard falls back to an emoji character for that card.

To make your own: replace these PNGs with images of the same names. Recommended size: at least 160x160 for the dashboard cards (they are scaled). The left nav uses a smaller size (18x18).

You can regenerate placeholder icons with:
  python scripts/generate_dashboard_icons.py
