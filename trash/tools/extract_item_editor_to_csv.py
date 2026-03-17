"""
Extract all parts data from "reference htmls/Borderlands Item Editor and Save Editor.html"
into a single CSV (~5500 rows). Optionally compare to master_search/db/universal_parts_db.json
and report why our DB has 9000+ rows.

Run from project root:
  python -m tools.extract_item_editor_to_csv
Output: master_search/db/sources/item_editor_parts.csv
"""

import csv
import json
from pathlib import Path

# Reuse extraction from merge_item_editor_html_into_db
from tools.merge_item_editor_html_into_db import (
    extract_embedded_base64,
    decompress_game_data,
    collect_parts_from_game_data,
    part_obj_to_universal_row,
)


def _safe(s) -> str:
    return (str(s or "").strip())


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    html_path = root / "reference htmls" / "Borderlands Item Editor and Save Editor.html"
    if not html_path.exists():
        html_path = root / "master_search" / "db" / "Borderlands Item Editor and Save Editor.html"
    if not html_path.exists():
        print(f"ERROR: HTML not found at {html_path}")
        return

    b64 = extract_embedded_base64(html_path)
    if not b64:
        print("ERROR: Could not extract EMBEDDED_GAME_DATA_BASE64 from HTML")
        return

    game_data = decompress_game_data(b64)
    raw_parts = collect_parts_from_game_data(game_data)
    rows = [part_obj_to_universal_row(p) for p in raw_parts]

    # CSV columns (include all we have)
    columns = [
        "source", "code", "Manufacturer", "Weapon Type", "ID", "Part Type",
        "String", "Model Name", "Stats (Level 50, Common)", "Effects", "Requirements", "Stats",
    ]
    out_path = root / "master_search" / "db" / "sources" / "item_editor_parts.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (r.get(k) or "") for k in columns})

    print(f"Extracted {len(rows)} rows from Item Editor HTML -> {out_path}")

    # Compare to universal_parts_db.json
    db_path = root / "master_search" / "db" / "universal_parts_db.json"
    if not db_path.exists():
        print("No universal_parts_db.json to compare.")
        return

    payload = json.loads(db_path.read_text(encoding="utf-8"))
    db_rows = payload.get("rows", [])
    db_codes = set()
    db_code_to_row = {}
    for r in db_rows:
        code = _safe(r.get("code", ""))
        if not code and r.get("ID"):
            code = "{" + _safe(r.get("ID", "")) + "}"
        if code:
            db_codes.add(code)
            db_code_to_row[code] = r

    ie_codes = {_safe(r.get("code", "")) for r in rows if _safe(r.get("code", ""))}
    only_in_db = db_codes - ie_codes
    only_in_ie = ie_codes - db_codes
    in_both = db_codes & ie_codes

    print()
    print("--- Comparison with universal_parts_db.json ---")
    print(f"  Item Editor (HTML) unique part codes: {len(ie_codes)}")
    print(f"  DB total rows:                        {len(db_rows)}")
    print(f"  DB unique part codes (by code):      {len(db_codes)}")
    print(f"  In both (by code):                    {len(in_both)}")
    print(f"  Only in DB (not in Item Editor):      {len(only_in_db)}")
    print(f"  Only in Item Editor (not in DB):     {len(only_in_ie)}")

    # Why 9000+? Check duplicates in DB: same code, multiple rows
    from collections import Counter
    code_counts = Counter()
    for r in db_rows:
        code = _safe(r.get("code", ""))
        if not code and r.get("ID"):
            code = "{" + _safe(r.get("ID", "")) + "}"
        if code:
            code_counts[code] += 1
    dup_codes = {c for c, n in code_counts.items() if n > 1}
    dup_total = sum(n - 1 for n in code_counts.values() if n > 1)
    print()
    print("--- Duplicates in DB (same code, multiple rows) ---")
    print(f"  Codes that appear more than once: {len(dup_codes)}")
    print(f"  Extra rows due to duplicates:    {dup_total}")

    # Sample of codes only in DB (where did they come from?)
    sample_only_db = list(only_in_db)[:15]
    print()
    print("  Sample codes only in DB (first 15):")
    for code in sample_only_db:
        r = db_code_to_row.get(code, {})
        part_type = _safe(r.get("Part Type", ""))
        string = _safe(r.get("String", ""))[:50]
        print(f"    {code}  Part Type={part_type}  String={string}")

    # Write short report
    report_path = root / "master_search" / "db" / "sources" / "item_editor_vs_db_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"Item Editor HTML parts: {len(rows)} rows, {len(ie_codes)} unique codes\n")
        f.write(f"universal_parts_db.json: {len(db_rows)} rows, {len(db_codes)} unique codes\n")
        f.write(f"Duplicate rows in DB (same code): {dup_total} extra rows across {len(dup_codes)} codes\n")
        f.write(f"Only in DB: {len(only_in_db)} codes (from other sources: community CSV, BL4 Master List, etc.)\n")
        f.write(f"Only in Item Editor: {len(only_in_ie)} codes\n")
    print()
    print(f"Report written to {report_path}")


if __name__ == "__main__":
    main()
