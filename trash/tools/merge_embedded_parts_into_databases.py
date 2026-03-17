"""
Compare embedded_parts_export.csv to all current databases (Master List CSVs + weapon_edit)
and add any missing codes to the appropriate category CSV(s), then rebuild universal.

- Grenade (typeId 245) -> master_search/db/Borderlands 4 Item Parts Master List - Grenades.csv
- Shield (typeId 237) -> master_search/db/Borderlands 4 Item Parts Master List - Shields.csv
- Repkit (typeId 243) -> master_search/db/Borderlands 4 Item Parts Master List - Repkits.csv
- Element (typeId 1) -> master_search/db/Borderlands 4 Item Parts Master List - Weapon Elemental.csv
- Enhancements (typeId 247, 264, 284, 286, 296, 299, etc.) -> ... - Enhancements.csv
- Weapons (other typeIds e.g. 13, 14, 267) -> weapon_edit/all_weapon_part.csv

Run from project root: python -m tools.merge_embedded_parts_into_databases
"""

import csv
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EMBEDDED_CSV = PROJECT_ROOT / "reference htmls" / "embedded_parts_export.csv"
DB_DIR = PROJECT_ROOT / "master_search" / "db"
UNIVERSAL_JSON = DB_DIR / "universal_parts_db.json"

# typeId -> (csv path relative to PROJECT_ROOT, code column style)
# Style: "TypeID_ID" = code is {Type ID:ID} from columns Type ID, ID
#        "Grenade_perk_main_ID_Part_ID" = Grenade CSV uses Grenade_perk_main_ID and Part_ID
CATEGORY_CONFIG = [
    (245, DB_DIR / "Borderlands 4 Item Parts Master List - Grenades.csv", "TypeID_ID", ["Manufacturer", "Name", "Part String", "Type ID", "ID", "Stats", "Effects", "Comments"]),
    (237, DB_DIR / "Borderlands 4 Item Parts Master List - Shields.csv", "TypeID_ID", ["Manufacturer", "Name", "Part String", "Type ID", "ID", "Stats", "Effects", "Comments"]),
    (243, DB_DIR / "Borderlands 4 Item Parts Master List - Repkits.csv", "TypeID_ID", ["Manufacturer", "Name", "Part String", "Type ID", "ID", "Stats", "Effects", "Comments"]),
    (1, DB_DIR / "Borderlands 4 Item Parts Master List - Weapon Elemental.csv", "TypeID_ID", ["String", "Element", "Type ID", "ID", "Description"]),
]

# Enhancements: multiple typeIds
ENHANCEMENT_TYPE_IDS = {247, 264, 284, 286, 296, 299}
ENHANCEMENTS_CSV = DB_DIR / "Borderlands 4 Item Parts Master List - Enhancements.csv"
ENHANCEMENTS_HEADER = ["Manufacturer", "Name", "Part String", "Type ID", "ID", "Stats", "Effects"]

# Weapons: all other typeIds go to weapon_edit/all_weapon_part.csv
WEAPON_CSV = PROJECT_ROOT / "weapon_edit" / "all_weapon_part.csv"
WEAPON_HEADER = ["Manufacturer & Weapon Type ID", "Manufacturer", "Weapon Type", "Part ID", "Part Type", "String", "Stat"]


def _numeric_part_id(part_id: str, full_id: str) -> int:
    """Extract numeric part id for code {typeId:partId}."""
    if ":" in part_id:
        return int(part_id.split(":")[-1])
    if ":" in full_id:
        return int(full_id.split(":")[-1])
    return int(part_id) if part_id.isdigit() else 0


def _code_from_row(type_id: int, part_id: str, full_id: str) -> str:
    num = _numeric_part_id(part_id, full_id)
    return f"{{{type_id}:{num}}}"


def load_existing_codes_from_universal() -> Set[str]:
    if not UNIVERSAL_JSON.exists():
        return set()
    with open(UNIVERSAL_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    rows = data.get("rows") or []
    return {r.get("code", "").strip() for r in rows if r.get("code")}


def load_existing_codes_from_csv(path: Path, style: str) -> Set[str]:
    if not path.exists():
        return set()
    codes: Set[str] = set()
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if style == "TypeID_ID":
                tid = r.get("Type ID", "").strip()
                iid = r.get("ID", "").strip()
                if tid and iid:
                    try:
                        codes.add(f"{{{int(tid)}:{int(iid)}}}")
                    except ValueError:
                        pass
    return codes


def load_existing_codes_from_weapon_csv(path: Path) -> Set[str]:
    if not path.exists():
        return set()
    codes: Set[str] = set()
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            prefix = r.get("Manufacturer & Weapon Type ID", "").strip()
            part_id = r.get("Part ID", "").strip()
            if prefix and part_id:
                try:
                    codes.add(f"{{{int(prefix)}:{int(part_id)}}}")
                except ValueError:
                    pass
    return codes


def load_embedded_rows() -> List[Dict[str, Any]]:
    if not EMBEDDED_CSV.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with open(EMBEDDED_CSV, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(dict(r))
    return rows


def row_to_grenades_shields_repkits(emb: Dict[str, Any], type_id: int, num_id: int) -> Dict[str, str]:
    return {
        "Manufacturer": (emb.get("manufacturer") or "").strip(),
        "Name": (emb.get("name") or "").strip(),
        "Part String": (emb.get("spawn_code") or "").strip(),
        "Type ID": str(type_id),
        "ID": str(num_id),
        "Stats": (emb.get("stats") or "").strip(),
        "Effects": (emb.get("effects") or "").strip(),
        "Comments": (emb.get("description") or "").strip(),
    }


def row_to_elemental(emb: Dict[str, Any], type_id: int, num_id: int) -> Dict[str, str]:
    return {
        "String": (emb.get("spawn_code") or emb.get("name") or "").strip(),
        "Element": (emb.get("name") or "").strip(),
        "Type ID": str(type_id),
        "ID": str(num_id),
        "Description": (emb.get("stats") or emb.get("description") or "").strip(),
    }


def row_to_enhancements(emb: Dict[str, Any], type_id: int, num_id: int) -> Dict[str, str]:
    return {
        "Manufacturer": (emb.get("manufacturer") or "").strip(),
        "Name": (emb.get("name") or "").strip(),
        "Part String": (emb.get("spawn_code") or "").strip(),
        "Type ID": str(type_id),
        "ID": str(num_id),
        "Stats": (emb.get("stats") or "").strip(),
        "Effects": (emb.get("effects") or "").strip(),
    }


def row_to_weapon(emb: Dict[str, Any], type_id: int, num_id: int) -> Dict[str, str]:
    return {
        "Manufacturer & Weapon Type ID": str(type_id),
        "Manufacturer": (emb.get("manufacturer") or "").strip(),
        "Weapon Type": (emb.get("weaponType") or emb.get("context") or "").strip(),
        "Part ID": str(num_id),
        "Part Type": (emb.get("partType") or "").strip(),
        "String": (emb.get("spawn_code") or "").strip(),
        "Stat": (emb.get("stats") or "").strip(),
    }


def main() -> None:
    print("Loading embedded export and existing databases...")
    embedded = load_embedded_rows()
    if not embedded:
        print(f"No rows in {EMBEDDED_CSV}")
        sys.exit(1)
    universal_codes = load_existing_codes_from_universal()
    print(f"  Embedded rows: {len(embedded)}, Universal codes: {len(universal_codes)}")

    # Load existing codes per category
    existing_by_category: Dict[str, Set[str]] = {}
    for type_id, path, style, _ in CATEGORY_CONFIG:
        existing_by_category[str(type_id)] = load_existing_codes_from_csv(path, style)
    existing_by_category["enhancements"] = load_existing_codes_from_csv(ENHANCEMENTS_CSV, "TypeID_ID")
    existing_by_category["weapon"] = load_existing_codes_from_weapon_csv(WEAPON_CSV)

    # Collect new rows per target CSV
    to_grenades: List[Dict[str, str]] = []
    to_shields: List[Dict[str, str]] = []
    to_repkits: List[Dict[str, str]] = []
    to_elemental: List[Dict[str, str]] = []
    to_enhancements: List[Dict[str, str]] = []
    to_weapons: List[Dict[str, str]] = []

    for emb in embedded:
        try:
            type_id = int(emb.get("typeId") or 0)
        except (TypeError, ValueError):
            continue
        part_id = (emb.get("partId") or "").strip()
        full_id = (emb.get("fullId") or "").strip()
        num_id = _numeric_part_id(part_id, full_id)
        code = _code_from_row(type_id, part_id, full_id)
        # Add if missing from the *category* database (so each CSV is complete); universal is rebuilt at the end
        if type_id == 245:
            if code not in existing_by_category["245"]:
                to_grenades.append(row_to_grenades_shields_repkits(emb, type_id, num_id))
                existing_by_category["245"].add(code)
        elif type_id == 237:
            if code not in existing_by_category["237"]:
                to_shields.append(row_to_grenades_shields_repkits(emb, type_id, num_id))
                existing_by_category["237"].add(code)
        elif type_id == 243:
            if code not in existing_by_category["243"]:
                to_repkits.append(row_to_grenades_shields_repkits(emb, type_id, num_id))
                existing_by_category["243"].add(code)
        elif type_id == 1:
            if code not in existing_by_category["1"]:
                to_elemental.append(row_to_elemental(emb, type_id, num_id))
                existing_by_category["1"].add(code)
        elif type_id in ENHANCEMENT_TYPE_IDS:
            if code not in existing_by_category["enhancements"]:
                to_enhancements.append(row_to_enhancements(emb, type_id, num_id))
                existing_by_category["enhancements"].add(code)
        else:
            if code not in existing_by_category["weapon"]:
                to_weapons.append(row_to_weapon(emb, type_id, num_id))
                existing_by_category["weapon"].add(code)

    # Append to CSVs
    def append_csv(path: Path, header: List[str], rows: List[Dict[str, str]]) -> None:
        if not rows:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        file_exists = path.exists()
        with open(path, "a", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
            if not file_exists:
                w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in header})
        print(f"  Appended {len(rows)} row(s) to {path.name}")

    header_gr = ["Manufacturer", "Name", "Part String", "Type ID", "ID", "Stats", "Effects", "Comments"]
    append_csv(DB_DIR / "Borderlands 4 Item Parts Master List - Grenades.csv", header_gr, to_grenades)
    append_csv(DB_DIR / "Borderlands 4 Item Parts Master List - Shields.csv", header_gr, to_shields)
    append_csv(DB_DIR / "Borderlands 4 Item Parts Master List - Repkits.csv", header_gr, to_repkits)
    append_csv(DB_DIR / "Borderlands 4 Item Parts Master List - Weapon Elemental.csv", ["String", "Element", "Type ID", "ID", "Description"], to_elemental)
    append_csv(ENHANCEMENTS_CSV, ENHANCEMENTS_HEADER, to_enhancements)
    append_csv(WEAPON_CSV, WEAPON_HEADER, to_weapons)

    total_added = len(to_grenades) + len(to_shields) + len(to_repkits) + len(to_elemental) + len(to_enhancements) + len(to_weapons)
    if total_added == 0:
        print("No missing codes to add.")
    else:
        print(f"Total new rows added: {total_added}. Rebuilding universal DB...")
        subprocess.run(
            [sys.executable, "-m", "tools.build_universal_parts_db"],
            cwd=str(PROJECT_ROOT),
            check=True,
        )
    print("Done.")


if __name__ == "__main__":
    main()
