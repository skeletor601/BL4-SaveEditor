#!/usr/bin/env python3
"""Compare NCS data between dates to find new DLC items + all Pearlescent weapons."""
import json, re, os
from collections import defaultdict

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

def extract_all_codes(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # PASS 1: Build root_type_id map from entries with non-null values
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

    # PASS 2: Extract all Sub entries using the root_type_map
    items = {}
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
                dep_str = json.dumps(dep_obj)
                is_pearl = 'pearlescent' in dep_str.lower()

                for idx, scope in find_si(dep_obj):
                    if scope in ('Sub', ''):
                        code = "{" + root_type_id + ":" + idx + "}"
                        items[code] = {
                            'root': root_name,
                            'part': dep_name,
                            'is_pearl': is_pearl
                        }

    return items, root_type_map


MFG = {'bor': 'Ripper', 'dad': 'Daedalus', 'jak': 'Jakobs', 'mal': 'Maliwan',
       'ord': 'Order', 'ted': 'Tediore', 'tor': 'Torgue', 'vla': 'Vladof',
       'atl': 'Atlas', 'cov': 'COV', 'hyp': 'Hyperion', 'borg': 'Ripper'}
WTYPE = {'ar': 'Assault Rifle', 'ps': 'Pistol', 'sg': 'Shotgun', 'sm': 'SMG',
         'sr': 'Sniper', 'hw': 'Heavy'}

base_path = 'C:/Users/picas/Desktop/BL4_NCS_Tool/ncs_automation/NCS-data/'
old_path = base_path + '2026-03-29/parsed_v3/'
new_path = base_path + '2026-04-01/parsed_v3/'

# Load universal DB for names
with open('C:/BL4/BL4_AIO_Web/master_search/db/universal_parts_db.json', 'r', encoding='utf-8') as f:
    udb = json.load(f)
db_map = {row.get('code', ''): row for row in udb.get('rows', [])}

def describe(code, info):
    db = db_map.get(code, {})
    name = db.get('partName', info['part'])
    mfg = db.get('manufacturer', '')
    wt = db.get('weaponType', '')
    cat = db.get('category', '')
    if not mfg:
        parts = info['root'].split('_')
        mfg = MFG.get(parts[0], '')
        wt = WTYPE.get(parts[1], '') if len(parts) > 1 else ''
    return name, mfg, wt, cat

# ========== OLD DATA (Mar 29) ==========
print("Loading old data (Mar 29)...")
old_0, _ = extract_all_codes(old_path + 'pakchunk4-Windows_0_P-Nexus-Data-inv4.json')
old_12, _ = extract_all_codes(old_path + 'pakchunk4-Windows_12_P-Nexus-Data-inv4.json')
old_all = {**old_0, **old_12}
print(f"  _0_P: {len(old_0)}, _12_P: {len(old_12)}")
print(f"  Combined: {len(old_all)}, Pearls: {sum(1 for v in old_all.values() if v['is_pearl'])}")

# ========== NEW DATA (Apr 1) ==========
print("\nLoading new data (Apr 1)...")
new_0, _ = extract_all_codes(new_path + 'pakchunk4-Windows_0_P-Nexus-Data-inv4.json')
new_12, _ = extract_all_codes(new_path + 'pakchunk4-Windows_12_P-Nexus-Data-inv4.json')
new_13, _ = extract_all_codes(new_path + 'pakchunk4-Windows_13_P-Nexus-Data-inv4.json')
new_all = {**new_0, **new_12, **new_13}
print(f"  _0_P: {len(new_0)}, _12_P: {len(new_12)}, _13_P: {len(new_13)}")
print(f"  Combined: {len(new_all)}, Pearls: {sum(1 for v in new_all.values() if v['is_pearl'])}")

# ========== DIFF ==========
truly_new = set(new_all.keys()) - set(old_all.keys())
# Also find items added to Cowbell _12_P since base _0_P (DLC items)
dlc_items = set(new_12.keys()) - set(new_0.keys())
print(f"\nTruly new since Mar 29: {len(truly_new)}")
print(f"DLC items (_12_P not in _0_P): {len(dlc_items)}")

# ========== ALL PEARLESCENT ==========
all_items = {**old_all, **new_all}
all_pearl_codes = sorted([c for c, v in all_items.items() if v['is_pearl']])

print(f"\n{'='*80}")
print(f"ALL PEARLESCENT WEAPONS ({len(all_pearl_codes)})")
print(f"{'='*80}")
for code in all_pearl_codes:
    info = all_items[code]
    name, mfg, wt, cat = describe(code, info)
    new_tag = " [NEW since Mar29]" if code in truly_new else ""
    dlc_tag = " [DLC]" if code in dlc_items else ""
    print(f"  {code} | {mfg} {wt} | {name} | raw: {info['part']}{dlc_tag}{new_tag}")

# ========== DLC ITEMS (non-quest) ==========
print(f"\n{'='*80}")
print(f"DLC ITEMS - Cowbell/New ({len(dlc_items)} in _12_P not in _0_P)")
print(f"{'='*80}")

skip = {'invdef', 'pickup', 'inv_', 'health_booster', 'io_pickup', 'def_sum'}
by_root = defaultdict(list)
for code in dlc_items:
    info = new_12[code]
    by_root[info['root']].append((code, info))

for root in sorted(by_root.keys()):
    if any(root.startswith(s) for s in skip):
        continue
    entries = by_root[root]
    parts = root.split('_')
    mfg_name = MFG.get(parts[0], parts[0])
    wt_name = WTYPE.get(parts[1], '') if len(parts) > 1 else ''

    cat = 'Other'
    if 'shield' in root: cat = 'Shield'
    elif 'grenade' in root: cat = 'Grenade'
    elif 'repair_kit' in root: cat = 'Repkit'
    elif 'enhancement' in root: cat = 'Enhancement'
    elif 'classmod' in root: cat = 'Class Mod'
    elif 'turret' in root: cat = 'Turret/NPC'
    elif 'terminal' in root: cat = 'Terminal/NPC'
    elif 'hover' in root: cat = 'Hover Drive'
    elif 'gunship' in root: cat = 'Gunship/NPC'
    elif wt_name: cat = 'Weapon (' + wt_name + ')'

    print(f"\n  [{cat}] {mfg_name} {wt_name} ({root}):")
    for code, info in sorted(entries, key=lambda x: int(re.search(r':(\d+)', x[0]).group(1))):
        name, _, _, _ = describe(code, info)
        pearl = " [PEARL]" if info['is_pearl'] else ""
        in_db = "" if code in db_map else " [NOT IN DB]"
        print(f"    {code} {name}{pearl}{in_db}")

# ========== TRULY NEW (Apr 1 vs Mar 29) ==========
if truly_new:
    print(f"\n{'='*80}")
    print(f"TRULY NEW since Mar 29 ({len(truly_new)})")
    print(f"{'='*80}")
    by_root2 = defaultdict(list)
    for code in truly_new:
        info = new_all[code]
        by_root2[info['root']].append((code, info))
    for root in sorted(by_root2.keys()):
        if any(root.startswith(s) for s in skip):
            continue
        entries = by_root2[root]
        parts = root.split('_')
        mfg_name = MFG.get(parts[0], parts[0])
        wt_name = WTYPE.get(parts[1], '') if len(parts) > 1 else ''
        print(f"\n  {mfg_name} {wt_name} ({root}):")
        for code, info in sorted(entries, key=lambda x: int(re.search(r':(\d+)', x[0]).group(1))):
            name, _, _, _ = describe(code, info)
            pearl = " [PEARL]" if info['is_pearl'] else ""
            print(f"    {code} {name}{pearl}")
