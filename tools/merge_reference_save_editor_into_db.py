"""
Extract part codes from reference htmls/save-editor.html (RARITY_TSV block),
compare to master_search/db/universal_parts_db.json, and add any missing rows.

Run from project root: python -m tools.merge_reference_save_editor_into_db
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set


def extract_rarity_tsv(html_path: Path) -> str:
    text = html_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(
        r"const\s+RARITY_TSV\s*=\s*String\.raw`([^`]+)`",
        text,
        re.DOTALL,
    )
    if not m:
        return ""
    return m.group(1).strip()


def parse_tsv(tsv: str) -> List[Dict[str, str]]:
    """Parse TSV; header: Manufacturer, Item Type, Item Type String, Item Type ID, Item ID, Legendary, Comment."""
    lines = [ln for ln in tsv.splitlines() if ln.strip()]
    if not lines:
        return []
    header = lines[0].split("\t")
    rows: List[Dict[str, str]] = []
    for line in lines[1:]:
        parts = line.split("\t")
        row = {}
        for i, h in enumerate(header):
            if i < len(parts):
                row[h.strip()] = (parts[i] or "").strip()
        rows.append(row)
    return rows


def row_to_code(row: Dict[str, str]) -> str:
    type_id = (row.get("Item Type ID") or "").strip()
    item_id = (row.get("Item ID") or "").strip()
    if type_id and item_id and type_id.isdigit() and item_id.isdigit():
        return f"{{{type_id}:{item_id}}}"
    return ""


def row_to_universal(row: Dict[str, str], code: str) -> Dict[str, str]:
    """Build a universal_parts_db row from reference TSV row."""
    return {
        "source": "reference save-editor (RARITY_TSV)",
        "code": code,
        "Manufacturer": row.get("Manufacturer", ""),
        "Weapon Type": row.get("Item Type", ""),
        "ID": row.get("Item ID", ""),
        "Part Type": row.get("Item Type", ""),
        "String": row.get("Item Type String", ""),
        "Model Name": row.get("Legendary", "") or row.get("Item Type String", ""),
        "Stats (Level 50, Common)": "",
        "Effects": "",
        "Requirements": "",
        "Stats": "",
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ref_html = root / "reference htmls" / "save-editor.html"
    db_path = root / "master_search" / "db" / "universal_parts_db.json"

    if not ref_html.exists():
        print(f"Reference HTML not found: {ref_html}")
        return

    tsv = extract_rarity_tsv(ref_html)
    if not tsv:
        print("Could not extract RARITY_TSV from save-editor.html")
        return

    ref_rows = parse_tsv(tsv)
    ref_codes: Dict[str, Dict[str, str]] = {}
    for r in ref_rows:
        code = row_to_code(r)
        if code and code not in ref_codes:
            ref_codes[code] = row_to_universal(r, code)

    print(f"Reference HTML: {len(ref_codes)} unique part codes")

    if not db_path.exists():
        print(f"DB not found: {db_path}")
        return

    data: Dict[str, Any] = json.loads(db_path.read_text(encoding="utf-8", errors="replace"))
    rows: List[Dict[str, str]] = list(data.get("rows") or [])

    existing: Set[str] = set()
    for r in rows:
        c = (r.get("code") or "").strip()
        if c:
            existing.add(c)

    missing = [code for code in ref_codes if code not in existing]
    if not missing:
        print("No missing codes; universal DB already has all reference parts.")
        return

    print(f"Adding {len(missing)} missing rows to universal_parts_db.json")
    for code in sorted(missing):
        rows.append(ref_codes[code])

    data["rows"] = rows
    if "sources" in data and isinstance(data["sources"], list):
        if not any(s.get("name") == "reference save-editor" for s in data["sources"] if isinstance(s, dict)):
            data["sources"].append({
                "name": "reference htmls/save-editor.html (RARITY_TSV)",
                "path": "merged by merge_reference_save_editor_into_db.py",
            })

    db_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {db_path} ({len(rows)} total rows)")


if __name__ == "__main__":
    main()
