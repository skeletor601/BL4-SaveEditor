"""Legacy helper for older HTML sources.

Current app builds rely on our JSON databases and scarlett.html only.
This script is kept for reference and is not used by the runtime app.
"""

import sys
from pathlib import Path

def main():
    project_root = str(Path(__file__).resolve().parent.parent)
    last_total = 0

    # 1) Part-Lookup (legacy)
    try:
        from tools.merge_part_lookup_into_db import merge_into_db as merge_lookup
        u, a, n = merge_lookup(project_root)
        last_total = n
        print(f"Part-Lookup.html: {u} updated, {a} added → {n} total rows")
    except Exception as e:
        print(f"Part-Lookup merge failed: {e}", file=sys.stderr)

    # 2) Item Editor HTML (legacy, may be missing in newer builds)
    try:
        from tools.merge_item_editor_html_into_db import merge_into_db as merge_editor
        u, a, n = merge_editor(project_root)
        last_total = n
        print(f"Item Editor HTML: {u} updated, {a} added → {n} total rows")
    except Exception as e:
        print(f"Item Editor merge failed (legacy source, safe to ignore): {e}", file=sys.stderr)

    print(f"All HTML merges done. Total rows in DB: {last_total}.")

if __name__ == "__main__":
    main()
