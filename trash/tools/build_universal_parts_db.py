"""
Build a single universal parts DB from:
  - master_search/db/sources/ (any JSON/CSV you drop there)
  - master_search/db/*.csv (e.g. "Borderlands 4 Item Parts Master List - *.csv")
  - App part CSVs (weapon_edit, grenade, shield, heavy, repkit)

Community DB is no longer used. Output: master_search/db/universal_parts_db.json
Scarlett loads only universal_parts_db.json.

Each row gets a "code" field in BL modding format: {prefix:part} e.g. {245:1} or {13:4}.
Run from project root: python -m tools.build_universal_parts_db
"""

import csv
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Scarlett expects these; we add "code" so copy-paste uses {xx:yy}
UNIVERSAL_COLUMNS = [
    "source",
    "code",
    "Category",
    "Specific Category",
    "Item Type",
    "Manufacturer",
    "Weapon Type",
    "ID",
    "Part Type",
    "String",
    "Model Name",
    "Stats (Level 50, Common)",
    "Effects",
    "Requirements",
    "Stats",
    "Elemental",
    "Canonical Name",
    "Is Legendary",
    "Matched Legendary Name",
    "Unique Effect",
    "Visual Unique Barrel",
    "Search Text",
    "canonicalManufacturer",
    "canonicalPartType",
    "canonicalRarity",
]

CANONICAL_MANUFACTURERS = [
    "Atlas",
    "COV",
    "Daedalus",
    "Hyperion",
    "Jakobs",
    "Maliwan",
    "Order",
    "Ripper",
    "Tediore",
    "Torgue",
    "Vladof",
]
_CANONICAL_MFG_MAP = {m.lower(): m for m in CANONICAL_MANUFACTURERS}
_RARITY_VALUES = ("Pearl", "Legendary", "Epic", "Rare", "Uncommon", "Common")

# Legendary item names (sync with web/src/data/partsData.ts LEG_NAMES). Rows whose name
# matches one of these get Rarity = "Legendary" so sort/filter by rarity works without name lookup.
LEGENDARY_NAMES = [
    "Accumulator", "Acey May", "Aching Roil", "Adrenaline Pump", "Aegon's Dream", "AF1000", "Anarchy", "ARC-TAN",
    "Asher's Rise", "Assuit", "Atling Gun", "Autocannibal", "Avatar", "Besieger", "Big Banger", "Binger",
    "Bio-Robot", "Birt's Bees", "Blacksmith",
    "Blockbuster", "Blood Analyzer", "Bloodstarved", "Bloody Lumberjack", "Blind Box", "Body Counter", "Bonnie and Clyde",
    "Boomslang", "Borstel Ballista", "Bottled Lightning", "Bod", "Budget Deity", "Bubbles", "Bugbear",
    "Bully", "Buster", "Buoy", "Buzz Axe", "Champion", "Chaumurky", "Chuck", "Cindershelly", "Cold Shoulder",
    "Collector", "Combo", "Compleation", "Complex Root", "Conflux", "Convergence", "Countermeasure",
    "Dancer", "Darkbeast", "DAD_AR_Barrel_02", "Defibrillator", "Destructo Disco", "Devourer", "Director", "Disc Jockey",
    "Disruptor", "Divided Focus", "Doeshot", "Dog Movement", "Driver", "Elementalist", "Eigenburst",
    "Entangler", "Entropic", "Esgrimidor", "Evolver", "Extra Medium", "Extension", "Fashionista",
    "Faulty Detonator", "Filántropo", "Finnity XXX-L", "Firebreak", "Firepot", "Firewerks", "First Impression",
    "Fisheye", "Fleabag", "Flashpan", "Forsaken Chaos", "Forge Master", "Frangible", "Furnace", "Fuse",
    "Gamma Void", "Gatherer", "Glacier", "G.M.R", "Golden God", "Goalkeeper", "Goremaster", "Generator", "Grenazerker",
    "Guardian Angel", "Gummy", "Hair Trigger", "Handcannon", "Hardpoint", "Hat Trick", "Healthraiser",
    "Heavyweight", "Hellfire", "Hellwalker", "Hephaestian", "Hero of Bullet", "Hopscotch", "Hot Slugger",
    "Hoarder", "Husky Friend", "Hydrator", "Icon", "Illusionist", "Inscriber", "Inkling", "Instigator",
    "Jackhammer", "Jelly", "Jetsetter", "Junction", "Kaoson", "Kaleidosplode", "Katagawa's Revenge",
    "Kickballer", "Kill Spring", "King's Gambit", "Kindread Spirits", "Lame", "Lamplighter", "Laser Disker",
    "Lead Balloon", "Linebacker", "Looper", "Lucian's Flank", "Lucky Clover", "Luty Madlad", "Ladykiller",
    "Maestro", "Mantra", "Matador's Match", "Mercredi", "Mercurious", "Midnight Defiance", "Missilaser",
    "Misericorde", "Multistrike", "Murmur", "Nexus", "Noisy Cricket", "Oak-Aged Cask", "Ohm I Got",
    "Onion", "Onslaught", "Oscar Mike", "Ouroboros", "Overdriver", "Pacemaker", "Pandoran Momento",
    "Parallaxis", "Phantom Flame", "Plasma Coil", "Potato Thrower IV", "Prince Harming", "Primadiem", "Principal", "Power Cycle", "Protean Cell", "Pumper", "Quencher", "Quicksilver", "Queen's Rest", "Quintain",
    "Rainbow Vomit", "Rainmaker", "Rangefinder", "Ravenfire", "Reactor", "Recursive", "Roach",
    "Rooker", "Rowan's Charge", "Rowdy Rider", "Roulette", "Ruby's Grasp", "San Saba Songbird",
    "Scattershot", "Scientist", "Scion", "Seventh Sense", "Shatterwight", "Shalashaska", "Sho Kunai",
    "Sideshow", "Sidewinder", "Sparky Shield", "Spinning Blade", "Sprezzatura", "Steward", "Stop Gap",
    "Stray", "Streamer", "Studfinder", "Super Soldier", "Sure Shot", "Sweet Embrace", "Swarm",
    "Star Helix Underbarrel", "Symmetry", "T.K's Wave", "Tankbuster", "Technomancer", "Teen Witch", "Timekeeper's New Shield",
    "Toile", "Transmitter", "Trauma Bond", "Triple Bypass", "Trooper", "Truck", "UAV", "Undead Eye",
    "Undershield", "Urchin", "Value-Add", "Valuepalooza", "Vamoose", "Viking", "War Paint",
    "Waterfall", "Watts 4 Dinner", "Whiskey Foxtrot", "Wombo Combo", "X-Initiator", "Y-Initiator",
    "Z-Initiator", "Zipper", "Short Circuit", "Skeptic",
]


def _norm_name(s: str) -> str:
    """Normalize for legendary name match (same as frontend norm())."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower()).strip()


def _row_blob(row: Dict[str, str]) -> str:
    """Searchable blob of all string fields (same idea as frontend blob())."""
    parts = []
    for k, v in row.items():
        if v and isinstance(v, str) and v.strip():
            parts.append(v.strip().lower())
    return " ".join(parts)


def _is_legendary_by_name(row: Dict[str, str]) -> bool:
    """True if key name-like fields match a legendary name.
    Uses exact/contained matching, but keeps very short names (<=3 chars) exact-only
    to avoid false positives like 'Bod' matching 'Body'.
    """
    candidates = [
        _safe_str(row.get("Matched Legendary Name", "")),
        _safe_str(row.get("Canonical Name", "")),
        _safe_str(row.get("String", "")),
        _safe_str(row.get("Model Name", "")),
        _safe_str(row.get("Stats", "")),
        _safe_str(row.get("Elemental", "")),
    ]
    norm_candidates = [_norm_name(c) for c in candidates if _norm_name(c)]
    if not norm_candidates:
        return False
    for leg in LEGENDARY_NAMES:
        ln = _norm_name(leg)
        if not ln:
            continue
        for cn in norm_candidates:
            if len(ln) <= 3:
                if cn == ln:
                    return True
            else:
                if cn == ln or ln in cn:
                    return True
    return False

# Regex for BL modding code already present in source (e.g. {1:55}, {13:90})
_CODE_PATTERN = re.compile(r"^\s*\{\s*\d+\s*:\s*\d+\s*\}\s*$")

# Map alternate column names into our schema
COLUMN_ALIASES: Dict[str, str] = {
    "Code": "code",
    "code": "code",  # preserve when already in {n:m} form
    "name": "String",
    "rarity": "canonicalRarity",
    "weapon_type": "Weapon Type",
    "element": "Elemental",
    "part_type": "Part Type",
    "description": "Stats (Level 50, Common)",
    "Part_ID": "ID",
    "Part ID": "ID",
    "Part_type": "Part Type",
    "Part Type": "Part Type",
    "Item Type": "Item Type",
    "Category": "Category",
    "General Category": "Category",
    "Specific Category": "Specific Category",
    "Stat": "Stats (Level 50, Common)",
    "Stats": "Stats (Level 50, Common)",
    "Stats (Level 50, Common)": "Stats (Level 50, Common)",
    "Elemental": "Elemental",
    "Effects": "Effects",
    "Requirements": "Requirements",
    "Manufacturer": "Manufacturer",
    "Weapon Type": "Weapon Type",
    "String": "String",
    "Model Name": "Model Name",
    "Part String": "String",
    "Name": "String",
    "Canonical Name": "Canonical Name",
    "Canonical Rarity": "canonicalRarity",
    "Is Legendary": "Is Legendary",
    "Matched Legendary Name": "Matched Legendary Name",
    "Unique Effect": "Unique Effect",
    "uniqueEffect": "Unique Effect",
    "Visual Unique Barrel": "Visual Unique Barrel",
    "visualUniqueBarrel": "Visual Unique Barrel",
    "Search Text": "Search Text",
    "Description": "Stats (Level 50, Common)",
    "perk_name_EN": "Stats (Level 50, Common)",
    "manufacturers_name": "Manufacturer",
}

# Columns that provide the "prefix" (first number in {prefix:part}) for code
PREFIX_COLUMNS = [
    "Type ID",
    "Manufacturer & Weapon Type ID",
    "Grenade_perk_main_ID",
    "Shield_perk_main_ID",
    "Repkit_perk_main_ID",
    "Heavy_perk_main_ID",
    "Manufacturer ID",
    "manufacturers_ID",
]

# Columns that provide the "part" (second number) for code
PART_ID_COLUMNS = ["ID", "Part ID", "Part_ID", "perk_ID"]


def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _canonical_manufacturer(v: str) -> str:
    s = _safe_str(v).lower()
    if not s:
        return ""
    if s in _CANONICAL_MFG_MAP:
        return _CANONICAL_MFG_MAP[s]
    if s == "daedukus":
        return "Daedalus"
    if s == "children of the vault":
        return "COV"
    return ""


def _canonical_part_type(primary: str, secondary: str = "") -> str:
    s = _safe_str(primary) or _safe_str(secondary)
    s = re.sub(r"\s+", " ", s)
    return s


def _canonical_rarity(row: Dict[str, str]) -> str:
    existing = _safe_str(row.get("canonicalRarity", "")) or _safe_str(row.get("Rarity", ""))
    if existing:
        e = existing.lower()
        if e in ("pearlescent", "pearl"):
            return "Pearl"
        for val in _RARITY_VALUES:
            if e == val.lower():
                return val
    b = _row_blob(row)
    if re.search(r"\b(pearlescent|pearl)\b", b):
        return "Pearl"
    if _is_legendary_by_name(row):
        return "Legendary"
    if re.search(r"\blegendary\b", b):
        return "Legendary"
    if re.search(r"\bepic\b", b):
        return "Epic"
    if re.search(r"\brare\b", b):
        return "Rare"
    if re.search(r"\buncommon\b", b):
        return "Uncommon"
    if re.search(r"\bcommon\b", b):
        return "Common"
    return ""


def _build_code(raw: Dict[str, Any]) -> str:
    """Build BL modding code {prefix:part} from raw row."""
    prefix = None
    for col in PREFIX_COLUMNS:
        if col in raw and _safe_str(raw[col]):
            try:
                prefix = int(raw[col])
                break
            except (TypeError, ValueError):
                pass
    part = None
    for col in PART_ID_COLUMNS:
        if col in raw and _safe_str(raw[col]):
            try:
                part = int(raw[col])
                break
            except (TypeError, ValueError):
                pass
    if prefix is not None and part is not None:
        return f"{{{prefix}:{part}}}"
    if part is not None:
        return f"{{{part}}}"
    return ""


def _normalize_row(raw: Dict[str, Any], source_name: str) -> Dict[str, str]:
    """Convert a raw row into a row with UNIVERSAL_COLUMNS. Adds 'code' from Type ID + ID (or similar)."""
    out: Dict[str, str] = {c: "" for c in UNIVERSAL_COLUMNS}
    out["source"] = source_name
    existing_code = _safe_str(raw.get("code", "") or raw.get("Code", ""))
    if existing_code and _CODE_PATTERN.match(existing_code):
        out["code"] = existing_code
    else:
        out["code"] = _build_code(raw)

    for key, value in raw.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        val = _safe_str(value)
        if not val:
            continue
        if key in UNIVERSAL_COLUMNS:
            out[key] = val
            continue
        if key in COLUMN_ALIASES:
            out[COLUMN_ALIASES[key]] = val
            continue
        key_lower = key.lower()
        for col in UNIVERSAL_COLUMNS:
            if col.lower() == key_lower:
                out[col] = val
                break
        else:
            if "Stat" in key and not out.get("Stats (Level 50, Common)"):
                out["Stats (Level 50, Common)"] = val
            elif "Effect" in key and not out.get("Effects"):
                out["Effects"] = val
            elif key == "Description" and not out.get("Stats (Level 50, Common)"):
                out["Stats (Level 50, Common)"] = val

    return out


def _row_key(r: Dict[str, str]) -> str:
    s = _safe_str(r.get("String", ""))
    p = _safe_str(r.get("Part Type", ""))
    i = _safe_str(r.get("ID", ""))
    c = _safe_str(r.get("code", ""))
    if c:
        return c.lower()
    if s or p or i:
        return f"{s}|{p}|{i}".lower()
    return ""


def _score_row(r: Dict[str, str]) -> int:
    return sum(1 for k in UNIVERSAL_COLUMNS if _safe_str(r.get(k, "")))


def _load_json_rows(path: Path) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    for key in ("rows", "data", "items", "parts"):
        if isinstance(data.get(key), list):
            return data[key]
    return []


def _load_csv_rows(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({k.strip(): v for k, v in r.items() if k})
    return rows


# App part CSVs to include (relative to project root) so Scarlett has 5500+ parts
EXTRA_PART_CSV_PATHS = [
    "weapon_edit/all_weapon_part.csv",
    "weapon_edit/all_weapon_part_EN.csv",
    "grenade/grenade_main_perk.csv",
    "grenade/manufacturer_rarity_perk.csv",
    "shield/shield_main_perk.csv",
    "shield/manufacturer_perk.csv",
    "repkit/repkit_main_perk.csv",
    "repkit/repkit_manufacturer_perk.csv",
    "heavy/heavy_main_perk.csv",
    "heavy/heavy_manufacturer_perk.csv",
    "enhancement/Enhancement_perk.csv",
    "enhancement/Enhancement_manufacturers.csv",
]


def build_universal_db(project_root: str) -> Tuple[int, str]:
    """
    Merge sources dir + master_search/db/*.csv + app part CSVs into universal_parts_db.json.
    Community DB is not used. Returns (total_rows, output_path).
    """
    root = Path(project_root)
    db_dir = root / "master_search" / "db"
    sources_dir = db_dir / "sources"
    out_path = db_dir / "universal_parts_db.json"

    all_rows: List[Dict[str, str]] = []

    def add_file(path: Path, source_name: str, load_json: bool) -> None:
        if not path.exists():
            return
        try:
            if load_json:
                raw_list = _load_json_rows(path)
            else:
                raw_list = _load_csv_rows(path)
            for r in raw_list:
                if isinstance(r, dict) and any(_safe_str(v) for v in r.values()):
                    norm = _normalize_row(r, source_name)
                    if any(norm.get(c) for c in UNIVERSAL_COLUMNS if c not in ("source", "code")):
                        all_rows.append(norm)
        except Exception:
            pass

    # 1) master_search/db/sources/*.json and *.csv
    if sources_dir.exists():
        for path in sorted(sources_dir.iterdir()):
            if path.suffix.lower() == ".json":
                add_file(path, path.stem, load_json=True)
            elif path.suffix.lower() == ".csv":
                add_file(path, path.stem, load_json=False)

    # 2) master_search/db/*.csv (e.g. Borderlands 4 Item Parts Master List - *.csv), skip README
    if db_dir.exists():
        for path in sorted(db_dir.glob("*.csv")):
            if "README" in path.name.upper():
                continue
            add_file(path, path.stem, load_json=False)

    # 3) App part CSVs
    for rel in EXTRA_PART_CSV_PATHS:
        path = root / rel.replace("/", os.sep)
        name = Path(rel).stem
        add_file(path, name, load_json=False)

    # 4) Dedupe by code (or String|Part Type|ID); keep row with most filled columns
    seen: Dict[str, Dict[str, str]] = {}
    key_has_unique_effect: Dict[str, bool] = {}
    passthrough: List[Dict[str, str]] = []
    for r in all_rows:
        k = _row_key(r)
        if not k:
            passthrough.append(r)
            continue
        is_unique_true = _safe_str(r.get("Unique Effect", "")).lower() == "true"
        if k not in key_has_unique_effect:
            key_has_unique_effect[k] = is_unique_true
        else:
            key_has_unique_effect[k] = key_has_unique_effect[k] or is_unique_true
        if k not in seen or _score_row(r) > _score_row(seen[k]):
            seen[k] = r
    merged = passthrough + list(seen.values())

    # Preserve Unique Effect if any source row for the dedupe key marked True.
    for r in merged:
        k = _row_key(r)
        if k and key_has_unique_effect.get(k):
            r["Unique Effect"] = "True"

    # 5) Ensure every row has a code if we have ID
    for r in merged:
        if not _safe_str(r.get("code")) and _safe_str(r.get("ID")):
            r["code"] = "{" + r["ID"] + "}"

    # 6) Fill missing Rarity conservatively
    for r in merged:
        has_rarity = _safe_str(r.get("Rarity", "")) or _safe_str(r.get("canonicalRarity", ""))
        is_leg_marked = _safe_str(r.get("Is Legendary", "")).lower() == "true"
        if not has_rarity and (is_leg_marked or _is_legendary_by_name(r)):
            r["Rarity"] = "Legendary"

    # 7) Canonical normalized fields for reliable app filtering while keeping legacy fields intact
    for r in merged:
        cm = _canonical_manufacturer(_safe_str(r.get("Manufacturer", "")))
        cp = _canonical_part_type(_safe_str(r.get("Specific Category", "")), _safe_str(r.get("Part Type", "")))
        cr = _canonical_rarity(r)
        r["canonicalManufacturer"] = cm
        r["canonicalPartType"] = cp
        r["canonicalRarity"] = cr
        if not _safe_str(r.get("Model Name", "")) and _safe_str(r.get("Canonical Name", "")):
            r["Model Name"] = _safe_str(r.get("Canonical Name", ""))
        if not _safe_str(r.get("String", "")) and _safe_str(r.get("Canonical Name", "")):
            r["String"] = _safe_str(r.get("Canonical Name", ""))
        if not _safe_str(r.get("Manufacturer", "")) and cm:
            r["Manufacturer"] = cm
        if not _safe_str(r.get("Part Type", "")) and cp:
            r["Part Type"] = cp
        rarity_existing = _safe_str(r.get("Rarity", "")).lower()
        if cr == "Pearl":
            r["Rarity"] = "Pearl"
        elif rarity_existing in ("pearlescent", "pearl"):
            r["Rarity"] = "Pearl"
        elif not rarity_existing and cr:
            r["Rarity"] = cr

    # 8) Backup existing universal DB before overwrite so rollback is one file copy
    backup_path = ""
    if out_path.exists():
        backups_dir = db_dir / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
        backup_path = str(backups_dir / f"universal_parts_db_{stamp}.json")
        shutil.copy2(out_path, backup_path)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "backup_of_previous": backup_path,
        "sources": [
            {"name": "master_search/db/sources/", "path": "*.json, *.csv"},
            {"name": "master_search/db/", "path": "*.csv (Master List etc.)"},
            {"name": "app_parts", "path": "weapon_edit, grenade, shield, repkit, heavy"},
        ],
        "columns": UNIVERSAL_COLUMNS,
        "rows": merged,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return len(merged), str(out_path)


def main() -> None:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    count, path = build_universal_db(project_root)
    print(f"Universal parts DB written: {count} rows -> {path}")


if __name__ == "__main__":
    main()
