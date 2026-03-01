#!/usr/bin/env python3
"""
Empty the community parts DB and re-scrape from the configured Google Sheet sources.
Run from project root:
  python -m tools.reset_and_rescrape_db
  or
  .\venv\Scripts\python.exe -m tools.reset_and_rescrape_db
"""
import os
import sys

def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(project_root, "master_search", "db", "community_parts_db.json")

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"Removed: {db_path}")
        except OSError as e:
            print(f"Could not remove DB file: {e}")
            sys.exit(1)
    else:
        print("DB file not found (already empty or first run).")

    from tools.community_db_updater import update_community_db
    result = update_community_db(project_root)
    print(result.message)
    print(f"Output: {result.output_path}")

    from tools.build_universal_parts_db import build_universal_db
    u_count, u_path = build_universal_db(project_root)
    print(f"Universal DB rebuilt: {u_count} rows -> {u_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
