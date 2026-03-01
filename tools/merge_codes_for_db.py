#!/usr/bin/env python3
"""
Merge missing parts from "codes for db.txt" into:
  - weapon_edit/elemental.csv (type_id 1)
  - grenade/grenade_main_perk.csv (245)
  - shield/shield_main_perk.csv (246, 237, 248)
  - repkit/repkit_main_perk.csv (243)
  - heavy/heavy_main_perk.csv (244)
  - master_search/db/universal_parts_db.json (all other codes)

Input file: tab-separated, columns: Code, Name, Manufacturer, Item Type, Part Type, Description, Note
Only lines with Code matching {digits:digits} are processed.

Run from project root: python -m tools.merge_codes_for_db [path_to_codes_for_db.txt]
Default path: same script name on Desktop if run without arg.
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

# Project root (parent of tools/)
ROOT = Path(__file__).resolve().parent.parent
CODE_RE = re.compile(r"^\{(\d+):(\d+)\}$")


def parse_user_file(path: Path):
    """Yield (type_id, part_id, name, manufacturer, item_type, part_type, description, note)."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i == 0 and line.strip().lower().startswith("code"):
                continue  # skip header
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) < 2:
                continue
            code = parts[0].strip()
            m = CODE_RE.match(code)
            if not m:
                continue
            type_id, part_id = int(m.group(1)), int(m.group(2))
            name = parts[1] if len(parts) > 1 else ""
            manufacturer = parts[2] if len(parts) > 2 else ""
            item_type = parts[3] if len(parts) > 3 else ""
            part_type = parts[4] if len(parts) > 4 else ""
            description = parts[5] if len(parts) > 5 else ""
            note = parts[6] if len(parts) > 6 else ""
            yield (type_id, part_id, name, manufacturer, item_type, part_type, description, note)


def load_elemental(path: Path):
    out = {}  # (elem_id, part_id) -> stat
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                eid = int(row.get("Elemental_ID", 0))
                pid = int(row.get("Part_ID", 0))
                out[(eid, pid)] = row.get("Stat", "").strip()
            except (ValueError, TypeError):
                pass
    return out


def load_grenade(path: Path):
    out = set()  # (main_id, part_id)
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                mid = int(row.get("Grenade_perk_main_ID", 0))
                pid = int(row.get("Part_ID", 0))
                out.add((mid, pid))
            except (ValueError, TypeError):
                pass
    return out


def load_shield(path: Path):
    out = set()
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                mid = int(row.get("Shield_perk_main_ID", 0))
                pid = int(row.get("Part_ID", 0))
                out.add((mid, pid))
            except (ValueError, TypeError):
                pass
    return out


def load_repkit(path: Path):
    out = set()
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                mid = int(row.get("Repkit_perk_main_ID", 0))
                pid = int(row.get("Part_ID", 0))
                out.add((mid, pid))
            except (ValueError, TypeError):
                pass
    return out


def load_heavy(path: Path):
    out = set()
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                mid = int(row.get("Heavy_perk_main_ID", 0))
                pid = int(row.get("Part_ID", 0))
                out.add((mid, pid))
            except (ValueError, TypeError):
                pass
    return out


def main():
    if len(sys.argv) > 1:
        user_path = Path(sys.argv[1])
    else:
        user_path = Path.home() / "Desktop" / "codes for db.txt"
    if not user_path.exists():
        print(f"File not found: {user_path}")
        sys.exit(1)

    # Collect from user file
    elemental_new = {}   # (1, part_id) -> stat
    grenade_new = []     # (245, part_id, part_type, stat)
    shield_new = []      # (main_id, part_id, part_type, stat, description)
    repkit_new = []      # (243, part_id, part_type, stat, description)
    heavy_new = []       # (244, part_id, part_type, stat, description)
    universal_new = []  # list of row dicts for universal_parts_db

    for type_id, part_id, name, manufacturer, item_type, part_type, description, note in parse_user_file(user_path):
        stat = (description or note or part_type or name).strip()
        code = f"{{{type_id}:{part_id}}}"

        if type_id == 1:
            elemental_new[(1, part_id)] = stat or "None"
        elif type_id == 245:
            pt = part_type or "Perk"
            grenade_new.append((245, part_id, pt, stat or name))
        elif type_id in (246, 237, 248):
            pt = part_type or "Perk"
            shield_new.append((type_id, part_id, pt, stat or name, description))
        elif type_id == 243:
            pt = part_type or "Perk"
            repkit_new.append((243, part_id, pt, stat or name, description))
        elif type_id == 244:
            pt = part_type or "Perk"
            heavy_new.append((244, part_id, pt, stat or name, description))
        else:
            universal_new.append({
                "source": "codes_for_db",
                "code": code,
                "Manufacturer": manufacturer,
                "Weapon Type": item_type,
                "ID": str(part_id),
                "Part Type": part_type,
                "String": name,
                "Model Name": name,
                "Stats (Level 50, Common)": stat,
                "Effects": "",
                "Requirements": "",
                "Stats": stat,
            })

    # Load existing DBs
    elem_path = ROOT / "weapon_edit" / "elemental.csv"
    existing_elem = load_elemental(elem_path)
    grenade_path = ROOT / "grenade" / "grenade_main_perk.csv"
    existing_grenade = load_grenade(grenade_path)
    shield_path = ROOT / "shield" / "shield_main_perk.csv"
    existing_shield = load_shield(shield_path)
    repkit_path = ROOT / "repkit" / "repkit_main_perk.csv"
    existing_repkit = load_repkit(repkit_path)
    heavy_path = ROOT / "heavy" / "heavy_main_perk.csv"
    existing_heavy = load_heavy(heavy_path)

    # Elemental: add missing (1, part_id)
    added_elem = 0
    for (eid, pid), stat in sorted(elemental_new.items()):
        if (eid, pid) not in existing_elem:
            existing_elem[(eid, pid)] = stat
            added_elem += 1
    if added_elem:
        rows = [{"Elemental_ID": 1, "Part_ID": pid, "Stat": stat} for (_, pid), stat in sorted(existing_elem.items())]
        with open(elem_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["Elemental_ID", "Part_ID", "Stat"])
            w.writeheader()
            w.writerows(rows)
        print(f"Elemental: added {added_elem} rows -> {elem_path}")

    # Grenade: add missing (245, part_id)
    to_add_g = [(t, p, pt, s) for (t, p, pt, s) in grenade_new if (t, p) not in existing_grenade]
    if to_add_g:
        existing_rows = []
        with open(grenade_path, "r", encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            fieldnames = r.fieldnames or ["Grenade_perk_main_ID", "Part_ID", "Part_type", "Stat"]
            for row in r:
                existing_rows.append(row)
        for t, p, pt, s in sorted(to_add_g, key=lambda x: (x[0], x[1])):
            existing_rows.append({
                "Grenade_perk_main_ID": str(t), "Part_ID": str(p), "Part_type": pt, "Stat": s
            })
        with open(grenade_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["Grenade_perk_main_ID", "Part_ID", "Part_type", "Stat"])
            w.writeheader()
            w.writerows(existing_rows)
        print(f"Grenade: added {len(to_add_g)} rows -> {grenade_path}")

    # Shield: add missing
    to_add_s = [(t, p, pt, s, d) for (t, p, pt, s, d) in shield_new if (t, p) not in existing_shield]
    if to_add_s:
        existing_rows = []
        with open(shield_path, "r", encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            fn = r.fieldnames or ["Shield_perk_main_ID", "Part_ID", "Part_type", "Stat", "Description"]
            for row in r:
                existing_rows.append(row)
        for t, p, pt, s, d in sorted(to_add_s, key=lambda x: (x[0], x[1])):
            existing_rows.append({
                "Shield_perk_main_ID": str(t), "Part_ID": str(p), "Part_type": pt, "Stat": s, "Description": d or ""
            })
        with open(shield_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["Shield_perk_main_ID", "Part_ID", "Part_type", "Stat", "Description"])
            w.writeheader()
            w.writerows(existing_rows)
        print(f"Shield: added {len(to_add_s)} rows -> {shield_path}")

    # Repkit: add missing
    to_add_r = [(t, p, pt, s, d) for (t, p, pt, s, d) in repkit_new if (t, p) not in existing_repkit]
    if to_add_r:
        existing_rows = []
        with open(repkit_path, "r", encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                existing_rows.append(row)
        for t, p, pt, s, d in sorted(to_add_r, key=lambda x: (x[0], x[1])):
            existing_rows.append({
                "Repkit_perk_main_ID": str(t), "Part_ID": str(p), "Part_type": pt, "Stat": s, "Description": d or ""
            })
        with open(repkit_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["Repkit_perk_main_ID", "Part_ID", "Part_type", "Stat", "Description"])
            w.writeheader()
            w.writerows(existing_rows)
        print(f"Repkit: added {len(to_add_r)} rows -> {repkit_path}")

    # Heavy: add missing
    to_add_h = [(t, p, pt, s, d) for (t, p, pt, s, d) in heavy_new if (t, p) not in existing_heavy]
    if to_add_h:
        existing_rows = []
        with open(heavy_path, "r", encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                existing_rows.append(row)
        for t, p, pt, s, d in sorted(to_add_h, key=lambda x: (x[0], x[1])):
            existing_rows.append({
                "Heavy_perk_main_ID": str(t), "Part_ID": str(p), "Part_type": pt, "Stat": s, "Description": d or ""
            })
        with open(heavy_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["Heavy_perk_main_ID", "Part_ID", "Part_type", "Stat", "Description"])
            w.writeheader()
            w.writerows(existing_rows)
        print(f"Heavy: added {len(to_add_h)} rows -> {heavy_path}")

    # Universal: add missing codes
    uni_path = ROOT / "master_search" / "db" / "universal_parts_db.json"
    if not uni_path.exists():
        print("Universal DB not found, skipping.")
    elif universal_new:
        with open(uni_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        rows = data.get("rows", [])
        existing_codes = {r.get("code", "").strip().lower() for r in rows if r.get("code")}
        added_uni = 0
        for r in universal_new:
            if (r.get("code") or "").strip().lower() not in existing_codes:
                rows.append(r)
                existing_codes.add((r.get("code") or "").strip().lower())
                added_uni += 1
        if added_uni:
            data["rows"] = rows
            with open(uni_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Universal: added {added_uni} rows -> {uni_path}")
        # Persist universal_new to sources so build_universal_parts_db includes them on rebuild
        sources_dir = ROOT / "master_search" / "db" / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)
        codes_src = sources_dir / "codes_for_db.json"
        existing_list = []
        if codes_src.exists():
            try:
                with open(codes_src, "r", encoding="utf-8") as f:
                    existing_list = json.load(f)
                if not isinstance(existing_list, list):
                    existing_list = []
            except Exception:
                existing_list = []
        seen = {r.get("code", "").strip().lower() for r in existing_list}
        for r in universal_new:
            c = (r.get("code") or "").strip().lower()
            if c and c not in seen:
                existing_list.append(r)
                seen.add(c)
        if existing_list:
            with open(codes_src, "w", encoding="utf-8") as f:
                json.dump(existing_list, f, ensure_ascii=False, indent=2)
            print(f"Sources: {len(existing_list)} rows -> {codes_src}")

    print("Done.")


if __name__ == "__main__":
    main()
