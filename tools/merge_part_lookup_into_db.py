"""
Extract part data from master_search/db/Part-Lookup.html (embedded CSV),
compare to master_search/db/universal_parts_db.json, and merge:
- Update existing rows with missing names, descriptions, effects from HTML.
- Add rows that exist in HTML but not in DB.

Run from project root: python -m tools.merge_part_lookup_into_db
"""

import csv
import io
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Manufacturer|Item Type -> Type ID (prefix for code). From Part-Lookup.html familyIdToManufacturer + manufacturerToFamilyId.
MANUFACTURER_TO_FAMILY_ID: Dict[str, int] = {
    "Element|Element": 1,
    "Daedalus|Pistol": 2,
    "Jakobs|Pistol": 3,
    "Order|Pistol": 4,
    "Tediore|Pistol": 5,
    "Torgue|Pistol": 6,
    "Ripper|Shotgun": 7,
    "Daedalus|Shotgun": 8,
    "Jakobs|Shotgun": 9,
    "Maliwan|Shotgun": 10,
    "Tediore|Shotgun": 11,
    "Torgue|Shotgun": 12,
    "Daedalus|Assault Rifle": 13,
    "Tediore|Assault Rifle": 14,
    "Order|Assault Rifle": 15,
    "Vladof|Sniper": 16,
    "Torgue|Assault Rifle": 17,
    "Vladof|Assault Rifle": 18,
    "Ripper|SMG": 19,
    "Daedalus|SMG": 20,
    "Maliwan|SMG": 21,
    "Vladof|SMG": 22,
    "Ripper|Sniper": 23,
    "Jakobs|Sniper": 24,
    "Maliwan|Sniper": 25,
    "Order|Sniper": 26,
    "Jakobs|Assault Rifle": 27,
    "Classmods|Classmod": 234,
    "Shield|Armor Shield": 237,
    "Repkit|Repkit": 243,
    "Grenade|Grenade": 245,
    "Shield|Shield": 246,
    "Enhancement|Enhancement": 247,
    "Shield|Energy Shield": 248,
    "Siren|Classmod": 254,
    "Paladin|Classmod": 255,
    "Exo Soldier|Classmod": 256,
    "Gravitar|Classmod": 259,
    "Torgue|Repkit": 261,
    "Maliwan|Grenade": 263,
    "Hyperion|Enhancement": 264,
    "Jakobs|Repkit": 265,
    "Maliwan|Repkit": 266,
    "Jakobs|Grenade": 267,
    "Jakobs|Enhancement": 268,
    "Vladof|Repkit": 269,
    "Daedalus|Grenade": 270,
    "Maliwan|Enhancement": 271,
    "Order|Grenade": 272,
    "Torgue|Heavy Weapon": 273,
    "Ripper|Repkit": 274,
    "Ripper|Heavy Weapon": 275,
    "Daedalus|Repkit": 277,
    "Ripper|Grenade": 278,
    "Maliwan|Shield": 279,
    "Order|Enhancement": 281,
    "Vladof|Heavy Weapon": 282,
    "Vladof|Shield": 283,
    "Atlas|Enhancement": 284,
    "Order|Repkit": 285,
    "COV|Enhancement": 286,
    "Tediore|Shield": 287,
    "Maliwan|Heavy Weapon": 289,
    "Tediore|Repkit": 290,
    "Vladof|Grenade": 291,
    "Tediore|Enhancement": 292,
    "Order|Shield": 293,
    "Ripper|Enhancement": 296,
    "Torgue|Grenade": 298,
    "Daedalus|Enhancement": 299,
    "Ripper|Shield": 300,
    "Torgue|Enhancement": 303,
    "Jakobs|Shield": 306,
    "Vladof|Enhancement": 310,
    "Tediore|Grenade": 311,
    "Daedalus|Shield": 312,
    "Torgue|Shield": 321,
}
# Fallback: Manufacturer -> { Item Type -> Type ID } for non-weapon and special
MANUFACTURER_MAP: Dict[str, Dict[str, int]] = {
    "Daedalus": {"Assault Rifle": 13, "Pistol": 2, "SMG": 20, "Shotgun": 8, "Shield": 312, "Repkit": 277, "Grenade": 270, "Enhancement": 299, "Heavy": 35, "Ordnance": 35},
    "Jakobs": {"Assault Rifle": 27, "Pistol": 3, "Shotgun": 9, "Sniper": 24, "Shield": 306, "Repkit": 265, "Grenade": 267, "Enhancement": 268, "Heavy": 35, "Ordnance": 35},
    "Hyperion": {"Assault Rifle": 22, "Pistol": 7, "SMG": 22, "Sniper": 22, "Shotgun": 22, "Classmod": 30, "Shield": 31, "Repkit": 32, "Grenade": 33, "Enhancement": 264, "Heavy": 35, "Ordnance": 35},
    "Tediore": {"Assault Rifle": 14, "Pistol": 5, "Shotgun": 11, "Shield": 287, "Repkit": 290, "Grenade": 311, "Enhancement": 292, "Heavy": 35, "Ordnance": 35},
    "Torgue": {"Assault Rifle": 17, "Pistol": 6, "Shotgun": 12, "Shield": 321, "Repkit": 261, "Grenade": 298, "Enhancement": 303, "Heavy": 273, "Ordnance": 273},
    "Vladof": {"Assault Rifle": 18, "SMG": 22, "Sniper": 16, "Shield": 283, "Repkit": 269, "Grenade": 291, "Enhancement": 310, "Heavy": 282, "Ordnance": 282},
    "Maliwan": {"SMG": 21, "Sniper": 25, "Shotgun": 10, "Shield": 279, "Repkit": 266, "Grenade": 263, "Enhancement": 271, "Heavy": 289, "Ordnance": 289},
    "Atlas": {"Assault Rifle": 27, "Pistol": 12, "SMG": 27, "Sniper": 27, "Shotgun": 27, "Classmod": 30, "Shield": 31, "Repkit": 32, "Grenade": 33, "Enhancement": 284, "Heavy": 35, "Ordnance": 35},
    "COV": {"Assault Rifle": 28, "Pistol": 13, "SMG": 28, "Sniper": 28, "Shotgun": 28, "Classmod": 30, "Shield": 31, "Repkit": 32, "Grenade": 33, "Enhancement": 286, "Heavy": 35, "Ordnance": 35},
    "Ripper": {"SMG": 19, "Sniper": 23, "Shotgun": 7, "Shield": 300, "Repkit": 274, "Grenade": 278, "Enhancement": 296, "Heavy": 275, "Ordnance": 275},
    "Borg": {"Assault Rifle": 29, "Pistol": 14, "SMG": 29, "Sniper": 29, "Shotgun": 29, "Classmod": 30, "Shield": 31, "Repkit": 32, "Grenade": 33, "Enhancement": 34, "Heavy": 35, "Ordnance": 35},
    "Order": {"Assault Rifle": 15, "Pistol": 4, "Sniper": 26, "Shield": 293, "Repkit": 285, "Grenade": 272, "Enhancement": 281, "Heavy": 35, "Ordnance": 35},
    "Shield": {"Armor Shield": 237, "Firmware": 246, "Resistance": 246, "Perk": 246, "Energy Shield": 248, "Daedalus": 312, "Jakobs": 306, "Maliwan": 279, "Order": 293, "Ripper": 300, "Tediore": 287, "Torgue": 321, "Vladof": 283},
    "Enhancements": {"Atlas": 284, "Ripper": 296, "CoV": 286, "Daedalus": 299, "Hyperion": 264, "Jakobs": 268, "Maliwan": 271, "Order": 281, "Tediore": 292, "Torgue": 303, "Vladof": 310, "Firmware": 247, "Main Body": 247, "Stats": 247, "Secondary Rarity": 247},
}


def _safe(s: Any) -> str:
    return (s or "").strip()


def _get_type_id(manufacturer: str, item_type: str) -> Optional[int]:
    key = f"{manufacturer}|{item_type}"
    if key in MANUFACTURER_TO_FAMILY_ID:
        return MANUFACTURER_TO_FAMILY_ID[key]
    m = MANUFACTURER_MAP.get(manufacturer, {})
    return m.get(item_type)


def extract_csv_from_html(html_path: Path) -> str:
    text = html_path.read_text(encoding="utf-8", errors="replace")
    start = "const embeddedCSVData = `"
    end = "`;"
    i = text.find(start)
    if i < 0:
        return ""
    i += len(start)
    # Find the closing backtick-quote that ends this template literal (last `; before "// Function to load")
    j = text.find("// Function to load", i)
    if j < 0:
        j = len(text)
    chunk = text[i:j]
    # Remove trailing `; from the CSV content
    if chunk.rstrip().endswith("`;"):
        chunk = chunk.rstrip()[:-2]
    return chunk.strip()


def parse_embedded_csv(csv_text: str) -> List[Dict[str, str]]:
    """Parse CSV with columns: Manufacturer, Item Type, ID, Part Type, Model Name, Description, Effects"""
    rows: List[Dict[str, str]] = []
    buf = io.StringIO(csv_text)
    reader = csv.reader(buf)
    header = next(reader, None)
    if not header:
        return rows
    # Normalize header
    header = [h.strip() for h in header]
    for row in reader:
        if len(row) < 4:
            continue
        # Pad to at least 7 columns
        while len(row) < 7:
            row.append("")
        manufacturer = _safe(row[0])
        item_type = _safe(row[1]) or "Unknown"
        part_id = _safe(row[2])
        part_type = _safe(row[3])
        model_name = _safe(row[4])
        description = _safe(row[5])
        effects = _safe(row[6])
        # Clean trailing backtick from last field if present
        if effects.endswith("`"):
            effects = effects[:-1].strip()
        if not manufacturer and not part_id:
            continue
        rows.append({
            "Manufacturer": manufacturer,
            "Weapon Type": item_type,
            "ID": part_id,
            "Part Type": part_type,
            "Model Name": model_name,
            "Description": description,
            "Effects": effects,
        })
    return rows


def html_rows_to_parts(html_rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Convert HTML CSV rows to universal DB row shape; add code."""
    out: List[Dict[str, str]] = []
    for r in html_rows:
        manufacturer = r.get("Manufacturer", "")
        item_type = r.get("Weapon Type", "")
        part_id = r.get("ID", "")
        if not part_id:
            continue
        type_id = _get_type_id(manufacturer, item_type)
        if type_id is None:
            type_id = 0
        code = f"{{{type_id}:{part_id}}}" if type_id else f"{{{part_id}}}"
        pt = r.get("Part Type", "")
        model = r.get("Model Name", "")
        desc = r.get("Description", "")
        effects = r.get("Effects", "")
        # CSV sometimes has part string in Part Type column (e.g. DAD_AR.part_barrel_01_c)
        part_string = pt if (pt and "." in pt) else (model if (model and "." in model) else "")
        part_type = pt if (pt and "." not in pt) else ""
        row = {
            "source": "Part-Lookup.html",
            "code": code,
            "Manufacturer": manufacturer,
            "Weapon Type": item_type,
            "ID": part_id,
            "Part Type": part_type,
            "String": part_string,
            "Model Name": model if model != part_string else "",
            "Stats (Level 50, Common)": desc,
            "Effects": effects,
            "Requirements": "",
            "Stats": desc or effects,
        }
        if row["Model Name"] == "" and model and model != part_string:
            row["Model Name"] = model
        out.append(row)
    return out


def merge_into_db(project_root: str) -> Tuple[int, int, int]:
    """
    Load Part-Lookup.html CSV and universal_parts_db.json.
    Update DB rows with missing names/descriptions/effects from HTML.
    Add HTML rows that are missing from DB.
    Returns (updated_count, added_count, total_db_rows).
    """
    root = Path(project_root)
    html_path = root / "master_search" / "db" / "Part-Lookup.html"
    db_path = root / "master_search" / "db" / "universal_parts_db.json"

    if not html_path.exists():
        raise FileNotFoundError(f"Part-Lookup.html not found: {html_path}")
    csv_text = extract_csv_from_html(html_path)
    if not csv_text:
        raise ValueError("Could not extract embedded CSV from Part-Lookup.html")

    html_parts = html_rows_to_parts(parse_embedded_csv(csv_text))
    code_to_html: Dict[str, Dict[str, str]] = {}
    for p in html_parts:
        c = _safe(p.get("code", ""))
        if c:
            code_to_html[c] = p
    # Also index by String+ID for matching when code differs
    string_id_to_html: Dict[str, Dict[str, str]] = {}
    for p in html_parts:
        s = _safe(p.get("String", "")) or _safe(p.get("Model Name", ""))
        i = _safe(p.get("ID", ""))
        if s and i:
            string_id_to_html[f"{s.lower()}|{i}"] = p

    if not db_path.exists():
        # Create minimal DB from HTML only
        cols = list(html_parts[0].keys()) if html_parts else []
        payload = {"generated_at_utc": "", "sources": [], "columns": cols, "rows": html_parts}
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0, len(html_parts), len(html_parts)

    payload = json.loads(db_path.read_text(encoding="utf-8"))
    rows: List[Dict[str, str]] = payload.get("rows", [])
    columns = payload.get("columns", [])

    updated = 0
    added = 0
    seen_codes = set()
    for r in rows:
        code = _safe(r.get("code", ""))
        if not code and r.get("ID"):
            code = "{" + _safe(r["ID"]) + "}"
        if code:
            seen_codes.add(code)
        html_row = code_to_html.get(code)
        if not html_row:
            s = _safe(r.get("String", ""))
            i = _safe(r.get("ID", ""))
            if s and i:
                html_row = string_id_to_html.get(f"{s.lower()}|{i}")
        if html_row:
            # Fill in missing fields (count at most one update per row)
            row_updated = False
            if not _safe(r.get("Model Name")) and _safe(html_row.get("Model Name")):
                r["Model Name"] = html_row["Model Name"]
                row_updated = True
            if not _safe(r.get("Stats (Level 50, Common)")) and _safe(html_row.get("Stats (Level 50, Common)")):
                r["Stats (Level 50, Common)"] = html_row["Stats (Level 50, Common)"]
                row_updated = True
            if not _safe(r.get("Effects")) and _safe(html_row.get("Effects")):
                r["Effects"] = html_row["Effects"]
                row_updated = True
            if not _safe(r.get("String")) and _safe(html_row.get("String")):
                r["String"] = html_row["String"]
                row_updated = True
            if not _safe(r.get("Part Type")) and _safe(html_row.get("Part Type")):
                r["Part Type"] = html_row["Part Type"]
                row_updated = True
            if row_updated:
                updated += 1

    # Add rows from HTML that are not in DB
    all_cols = list(columns) if columns else []
    if rows and "code" not in all_cols:
        all_cols = ["source", "code", "Manufacturer", "Weapon Type", "ID", "Part Type", "String", "Model Name", "Stats (Level 50, Common)", "Effects", "Requirements", "Stats"]
    for p in html_parts:
        code = _safe(p.get("code", ""))
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)
        for col in all_cols:
            if col not in p:
                p[col] = ""
        rows.append(p)
        added += 1

    payload["rows"] = rows
    payload["columns"] = all_cols if all_cols else (list(rows[0].keys()) if rows else [])
    db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return updated, added, len(rows)


def main() -> None:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    updated, added, total = merge_into_db(project_root)
    print(f"Merge complete: {updated} rows updated with HTML data, {added} new rows added. Total rows in DB: {total}")


if __name__ == "__main__":
    main()
