"""
Run all HTML → universal DB merges in order:
  1. Part-Lookup.html (embedded CSV)
  2. Borderlands Item Editor and Save Editor.html (embedded gzip+base64 game data)

Run from project root: python -m tools.merge_all_html_into_db
"""

import sys
from pathlib import Path

def main():
    project_root = str(Path(__file__).resolve().parent.parent)
    last_total = 0

    # 1) Part-Lookup
    try:
        from tools.merge_part_lookup_into_db import merge_into_db as merge_lookup
        u, a, n = merge_lookup(project_root)
        last_total = n
        print(f"Part-Lookup.html: {u} updated, {a} added → {n} total rows")
    except Exception as e:
        print(f"Part-Lookup merge failed: {e}", file=sys.stderr)

    # 2) Item Editor
    try:
        from tools.merge_item_editor_html_into_db import merge_into_db as merge_editor
        u, a, n = merge_editor(project_root)
        last_total = n
        print(f"Item Editor HTML: {u} updated, {a} added → {n} total rows")
    except Exception as e:
        print(f"Item Editor merge failed: {e}", file=sys.stderr)

    print(f"All HTML merges done. Total rows in DB: {last_total}.")

if __name__ == "__main__":
    main()
