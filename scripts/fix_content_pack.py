#!/usr/bin/env python3
"""Fix contentPack in universal_parts_db.json.
Only items whose codes exist in _12_P but NOT _0_P should be tagged 'Cowbell'."""
import json, os

def find_si(obj):
    results = []
    if isinstance(obj, dict):
        if 'serialindex' in obj:
            si = obj['serialindex']
            sv = si.get('value', {}) if isinstance(si, dict) else {}
            if isinstance(sv, dict):
                idx = sv.get('index', {})
                idx = idx.get('value', '') if isinstance(idx, dict) else str(idx)
                scope = sv.get('_scope', {})
                scope = scope.get('value', '') if isinstance(scope, dict) else str(scope)
                if idx:
                    results.append((idx, scope))
        for k, v in obj.items():
            if k != 'serialindex':
                results.extend(find_si(v))
    elif isinstance(obj, list):
        for v in obj:
            results.extend(find_si(v))
    return results

def extract_codes(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    root_type_map = {}
    for rec in data['inv']['records']:
        for entry in rec['entries']:
            root_name = None
            for k in entry:
                if not k.startswith('__'):
                    root_name = k
                    break
            if not root_name:
                continue
            root_val = entry.get(root_name)
            if root_val is None:
                continue
            for idx, scope in find_si(root_val):
                if scope == 'Root':
                    root_type_map[root_name] = idx
                    break
    codes = set()
    for rec in data['inv']['records']:
        for entry in rec['entries']:
            root_name = None
            for k in entry:
                if not k.startswith('__'):
                    root_name = k
                    break
            if not root_name:
                continue
            root_type_id = root_type_map.get(root_name)
            if not root_type_id:
                continue
            for dep in entry.get('__dep_entries', []):
                if not isinstance(dep, dict):
                    continue
                dep_name = None
                for k in dep:
                    if not k.startswith('__') and k != 'depTableName':
                        dep_name = k
                        break
                if not dep_name:
                    continue
                dep_obj = dep.get(dep_name) or {}
                for idx, scope in find_si(dep_obj):
                    if scope in ('Sub', ''):
                        codes.add("{" + root_type_id + ":" + idx + "}")
    return codes

ncs_path = 'C:/Users/picas/Desktop/BL4_NCS_Tool/ncs_automation/NCS-data/2026-04-01/parsed_v3/'

print("Extracting _0_P codes (base game)...")
codes_0 = extract_codes(ncs_path + 'pakchunk4-Windows_0_P-Nexus-Data-inv4.json')
print(f"  {len(codes_0)} codes")

print("Extracting _12_P codes (Cowbell DLC)...")
codes_12 = extract_codes(ncs_path + 'pakchunk4-Windows_12_P-Nexus-Data-inv4.json')
print(f"  {len(codes_12)} codes")

dlc_only = codes_12 - codes_0
print(f"DLC-only codes: {len(dlc_only)}")

# Save DLC codes for reference
dlc_codes_path = 'C:/BL4/BL4_AIO_Web/api/data/dlc_codes.json'
with open(dlc_codes_path, 'w') as f:
    json.dump({"Cowbell": sorted(dlc_only)}, f, indent=2)
print(f"Saved DLC codes to {dlc_codes_path}")

# Fix universal_parts_db.json
db_path = 'C:/BL4/BL4_AIO_Web/master_search/db/universal_parts_db.json'
with open(db_path, 'r', encoding='utf-8') as f:
    db = json.load(f)

rows = db.get('rows', [])
tagged = 0
cleared = 0
for row in rows:
    code = row.get('code', '')
    if code in dlc_only:
        row['contentPack'] = 'Cowbell'
        tagged += 1
    else:
        if row.get('contentPack'):
            cleared += 1
        row.pop('contentPack', None)

with open(db_path, 'w', encoding='utf-8') as f:
    json.dump(db, f, indent=2)

print(f"\nFixed universal_parts_db.json:")
print(f"  Tagged as Cowbell: {tagged}")
print(f"  Cleared incorrect tags: {cleared}")
print(f"  Total rows: {len(rows)}")
