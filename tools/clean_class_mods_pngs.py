#!/usr/bin/env python3
"""
Remove class_mods PNGs with corrupted or non-ASCII filenames so the EXE can extract cleanly.
Keeps only files matching: [a-zA-Z0-9_!]+_[1-4].png (e.g. el_corazon_2.png).

Run from project root: python -m tools.clean_class_mods_pngs
Use --dry-run to only print what would be removed.
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASS_MODS = ROOT / "class_mods"
SUBDIRS = ("Amon", "Harlowe", "Rafa", "Vex")
# Only keep PNGs whose name (without .png) is ASCII and ends with _1, _2, _3, or _4
KEEP_PATTERN = re.compile(r"^[a-zA-Z0-9_!]+_[1-4]$")


def safe_print(msg):
    """Print without triggering console encoding errors."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"))


def should_keep(name):
    if not name.lower().endswith(".png"):
        return True  # don't touch non-png
    stem = name[:-4]  # without .png
    try:
        stem.encode("ascii")
        ascii_ok = True
    except UnicodeEncodeError:
        ascii_ok = False
    return ascii_ok and bool(KEEP_PATTERN.match(stem))


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        safe_print("DRY RUN - no files will be deleted\n")
    removed = 0
    kept = 0
    for sub in SUBDIRS:
        subdir = CLASS_MODS / sub
        if not subdir.is_dir():
            continue
        try:
            entries = list(os.scandir(subdir))
        except OSError:
            continue
        for entry in entries:
            if not entry.name.lower().endswith(".png"):
                continue
            if should_keep(entry.name):
                kept += 1
                continue
            removed += 1
            safe_display = entry.name.encode("ascii", "replace").decode("ascii")
            if dry_run:
                safe_print(f"Would remove: class_mods/{sub}/{safe_display}")
            else:
                try:
                    os.remove(entry.path)  # entry.path = correct filesystem path from OS
                    safe_print(f"Removed: class_mods/{sub}/{safe_display}")
                except OSError:
                    safe_print(f"Could not remove: class_mods/{sub}/{safe_display}")
                    removed -= 1
    safe_print(f"\nKept: {kept} | Removed: {removed}")
    if dry_run and removed:
        safe_print("Run without --dry-run to actually delete.")


if __name__ == "__main__":
    main()
