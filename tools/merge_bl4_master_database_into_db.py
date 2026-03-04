"""
Merge reference htmls/BL4_master_database.csv into master_search/db/universal_parts_db.json.
Adds any part codes that exist in the reference CSV but are missing from our universal DB.
This is the canonical "friend's full list" so Scarlett / Master Search and item/weapon edit
fallback can resolve every code.

Run from project root: python -m tools.merge_bl4_master_database_into_db
"""

import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set


def normalize_code(code: str) -> str:
    s = (code or "").strip()
    m = re.match(r"\{(\d+):(\d+)\}", s)
    if m:
        return f"{{{m.group(1)}:{m.group(2)}}}"
    m = re.match(r"\{(\d+)\}", s)
    if m:
        return f"{{{m.group(1)}}}"
    return s


def parse_code_for_id(code: str) -> str:
    """Return the part ID (second number) from {typeId:partId}."""
    m = re.match(r"\{(\d+):(\d+)\}", (code or "").strip())
    if m:
        return m.group(2)
    m = re.match(r"\{(\d+)\}", (code or "").strip())
    if m:
        return m.group(1)
    return ""


def row_to_universal(r: Dict[str, str], code: str) -> Dict[str, str]:
    """Build a universal_parts_db row from BL4_master_database.csv row."""
    part_id = parse_code_for_id(code)
    stats = (r.get("Description") or r.get("Info") or r.get("Elemental") or "").strip()
    return {
        "source": "BL4_master_database.csv (reference)",
        "code": code,
        "Manufacturer": (r.get("Manufacturer") or "").strip(),
        "Weapon Type": (r.get("Item Type") or "").strip(),
        "ID": part_id,
        "Part Type": (r.get("Part Type") or "").strip(),
        "String": (r.get("Name") or "").strip(),
        "Model Name": (r.get("Part Type") or r.get("Name") or "").strip(),
        "Stats (Level 50, Common)": stats,
        "Effects": "",
        "Requirements": "",
        "Stats": stats,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ref_csv = root / "reference htmls" / "BL4_master_database.csv"
    db_path = root / "master_search" / "db" / "universal_parts_db.json"

    if not ref_csv.exists():
        print(f"Reference CSV not found: {ref_csv}")
        return

    # Load reference CSV
    ref_rows: List[Dict[str, str]] = []
    with open(ref_csv, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            ref_rows.append({k.strip(): (v or "").strip() for k, v in r.items() if k})

    ref_by_code: Dict[str, Dict[str, str]] = {}
    for r in ref_rows:
        code_raw = r.get("Code") or r.get("code") or ""
        code = normalize_code(code_raw)
        if not code:
            continue
        if code not in ref_by_code:
            ref_by_code[code] = row_to_universal(r, code)

    print(f"Reference BL4_master_database.csv: {len(ref_by_code)} unique part codes")

    if not db_path.exists():
        print(f"DB not found: {db_path}")
        return

    data: Dict[str, Any] = json.loads(db_path.read_text(encoding="utf-8", errors="replace"))
    rows: List[Dict[str, str]] = list(data.get("rows") or [])

    existing: Set[str] = set()
    for row in rows:
        c = (row.get("code") or "").strip()
        if c:
            existing.add(normalize_code(c))

    missing = [code for code in ref_by_code if code not in existing]
    if not missing:
        print("No missing codes; universal DB already contains all reference parts.")
        return

    print(f"Adding {len(missing)} missing rows to universal_parts_db.json")
    for code in sorted(missing):
        rows.append(ref_by_code[code])

    data["rows"] = rows
    if "sources" in data and isinstance(data["sources"], list):
        if not any(
            isinstance(s, dict) and "BL4_master_database" in str(s.get("name", ""))
            for s in data["sources"]
        ):
            data["sources"].append({
                "name": "reference htmls/BL4_master_database.csv",
                "path": "merged by merge_bl4_master_database_into_db.py",
            })

    db_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {db_path} ({len(rows)} total rows)")


if __name__ == "__main__":
    main()
