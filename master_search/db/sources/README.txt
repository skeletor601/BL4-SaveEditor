Drop additional database files here to merge into the universal parts DB.
This lets you combine the community Google Sheets data with 5000+ item lists
from other sources into one Master Search (Scarlett) database.

Supported formats:
- JSON: file with "rows" array, or "data" array, or root-level array of objects.
  Each object can use different column names; common aliases are mapped automatically.
- CSV: header row required. Column names are mapped to the universal schema.

After adding files, run from project root:
  python -m tools.build_universal_parts_db

Then open Master Search (Scarlett) — it loads db/universal_parts_db.json
(and falls back to community_parts_db.json if universal is missing).

Column mapping (incoming -> universal):
  Part ID, Part_ID -> ID
  Part Type, Part_type -> Part Type
  Stat, Stats -> Stats (Level 50, Common)
  Manufacturer & Weapon Type ID, Manufacturer ID, *_perk_main_ID -> ID (if ID empty)
  String, Model Name, Manufacturer, Weapon Type, Effects, Requirements -> same names

Duplicate rows (same String + Part Type + ID) are merged into one; the row with
the most filled columns is kept.
