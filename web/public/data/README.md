# Curated lists for the modded weapon generator

These JSON files are used by **Beta → Unified Item Builder → Weapon Builder → Generate modded weapon**. You can edit them manually to add or remove parts.

## visual_heavy_barrels.json

- **Purpose:** One code is picked at random and pasted **to the left of the first barrel** in the deserialized string (game reads left-to-right, so this barrel drives the visual).
- **Format:** Array of `{ "name": "Display name", "code": "{prefix:part}" }`.
- **Example entries:**
  - `{ "name": "Onslaught", "code": "{22:68}" }`
  - `{ "name": "Mantra", "code": "{10:62}" }`
  - `{ "name": "Disc Jockey", "code": "{275:[30]}" }`
- Add any visual-effect or heavy weapon barrel you want. Get codes from the universal database (Master Search) or from the game data.

## desirable_underbarrels.json

- **Purpose:** When the generator adds an underbarrel, it picks one code at random from this list (instead of from the full edit data).
- **Format:** Same as above: `{ "name": "Display name", "code": "{prefix:part}" }`.
- Tracker Dart / Tracker Grenade are excluded when the list was generated; you can remove or add any underbarrel codes.

## Regenerating from the database

From the project root, run:

```bash
python -m tools.build_curated_barrel_underbarrel_json
```

This overwrites both JSON files with barrels/underbarrels extracted from `master_search/db/universal_parts_db.json`. Edit the generated files afterward to add or remove entries.
