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
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Scarlett expects these; we add "code" so copy-paste uses {xx:yy}
UNIVERSAL_COLUMNS = [
    "source",
    "code",
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
]

# Map alternate column names into our schema
COLUMN_ALIASES: Dict[str, str] = {
    "Part_ID": "ID",
    "Part ID": "ID",
    "Part_type": "Part Type",
    "Part Type": "Part Type",
    "Stat": "Stats (Level 50, Common)",
    "Stats": "Stats (Level 50, Common)",
    "Stats (Level 50, Common)": "Stats (Level 50, Common)",
    "Effects": "Effects",
    "Requirements": "Requirements",
    "Manufacturer": "Manufacturer",
    "Weapon Type": "Weapon Type",
    "String": "String",
    "Model Name": "Model Name",
    "Part String": "String",
    "Name": "Model Name",
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
    passthrough: List[Dict[str, str]] = []
    for r in all_rows:
        k = _row_key(r)
        if not k:
            passthrough.append(r)
            continue
        if k not in seen or _score_row(r) > _score_row(seen[k]):
            seen[k] = r
    merged = passthrough + list(seen.values())

    # 5) Ensure every row has a code if we have ID
    for r in merged:
        if not _safe_str(r.get("code")) and _safe_str(r.get("ID")):
            r["code"] = "{" + r["ID"] + "}"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
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
