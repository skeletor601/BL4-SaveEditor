"""
build_universal_db.py - Build ONE universal database from ALL feeder CSVs.

Universal schema per item:
  code, name, manufacturer, category, partType, weaponType, description,
  rarity, element, character, perkName, perkDescription, redText, spawnCode, dlc

Replaces build_parts_db.js as the single source of truth.
Run: python scripts/build_universal_db.py
"""

import json
import csv
import re
import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent

universal = []
seen_codes = set()

HEAVY_TYPE_IDS = {273, 275, 282, 289}

def add(entry):
    code = entry.get('code', '')

    # Override: heavy type IDs should always be category "Heavy" not "Weapon"
    if code:
        m = code.strip().lstrip('{').split(':')
        if len(m) >= 1 and m[0].isdigit() and int(m[0]) in HEAVY_TYPE_IDS:
            if entry.get('category') == 'Weapon':
                entry['category'] = 'Heavy'

    if code and code in seen_codes:
        for i, existing in enumerate(universal):
            if existing.get('code') == code:
                # Merge: fill in blank fields from existing, keep non-blank from new
                merged = dict(existing)
                for k, v in entry.items():
                    if v:
                        if not merged.get(k):
                            merged[k] = v
                        elif k == 'description' and len(str(v)) > len(str(merged[k])):
                            merged[k] = v
                        elif k == 'category' and v == 'Heavy':
                            merged[k] = v  # Heavy overrides Weapon
                universal[i] = merged
                return
    if code:
        seen_codes.add(code)
    universal.append(entry)

def read_csv_file(path):
    rows = []
    if not path.exists():
        print(f"  [WARN] Not found: {path}")
        return rows
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if row:
                rows.append(row)
    return rows

def blank_entry(**kwargs):
    entry = {
        'code': '', 'name': '', 'manufacturer': '', 'category': '', 'partType': '',
        'weaponType': '', 'description': '', 'rarity': '', 'element': '',
        'character': '', 'perkName': '', 'perkDescription': '', 'redText': '',
        'spawnCode': '', 'dlc': '',
    }
    entry.update(kwargs)
    return entry

def parse_red_text(text):
    """Split 'desc. Red Text: flavor' into (desc, red_text)."""
    if not text:
        return '', ''
    if 'Red Text:' in text:
        parts = text.split('Red Text:', 1)
        return parts[0].strip().rstrip('.'), parts[1].strip()
    return text, ''


# ══════════════════════════════════════════════════
# WEAPONS — weapon_rarity.csv FIRST (has rarity tier), then all_weapon_part_EN.csv
# ══════════════════════════════════════════════════
print("Processing weapons...")

# weapon_rarity.csv has the rarity tier (Legendary/Pearl/Common/etc.) — process FIRST
for row in read_csv_file(ROOT / 'weapon_edit/weapon_rarity.csv'):
    if len(row) < 7: continue
    tid, mfg, wt, pid, _, rarity, name = row[0], row[1], row[2], row[3], row[4], row[5], row[6]
    add(blank_entry(code=f'{{{tid}:{pid}}}', name=name, manufacturer=mfg, category='Weapon',
                     partType='Rarity', weaponType=wt, description=name,
                     rarity=rarity, perkName=name))

# all_weapon_part_EN.csv has all the parts (barrels, grips, etc.)
for row in read_csv_file(ROOT / 'weapon_edit/all_weapon_part_EN.csv'):
    if len(row) < 6: continue
    tid, mfg, wt, pid, pt, spawn = row[0], row[1], row[2], row[3], row[4], row[5]
    stat = row[6] if len(row) > 6 else ''
    desc = row[7] if len(row) > 7 else ''

    barrel_m = re.search(r'part_(?:unique_)?barrel_\d*_?(\w+)', spawn or '', re.I)
    barrel_name = barrel_m.group(1).replace('_', ' ').title() if barrel_m else ''
    leg_m = re.search(r'comp_05_(?:legendary_)?(\w+)', spawn or '', re.I)
    perk_name = leg_m.group(1).replace('_', ' ').title() if leg_m else ''
    perk_desc, red_text = parse_red_text(stat)
    rarity = stat.split(' ')[0] if pt == 'Rarity' and stat and stat.split(' ')[0] in ('Common','Uncommon','Rare','Epic','Legendary','Pearl') else ''

    add(blank_entry(
        code=f'{{{tid}:{pid}}}', name=barrel_name or perk_name or spawn,
        manufacturer=mfg, category='Weapon', partType=pt, weaponType=wt,
        description=stat or desc, rarity=rarity,
        perkName=perk_name if pt == 'Rarity' else barrel_name,
        perkDescription=perk_desc, redText=red_text, spawnCode=spawn,
    ))

for row in read_csv_file(ROOT / 'weapon_edit/elemental.csv'):
    if len(row) < 3: continue
    add(blank_entry(code=f'{{{row[0]}:{row[1]}}}', name=row[2] or f'Element {row[1]}',
                     category='Element', partType='Element', element=row[2]))

# ══════════════════════════════════════════════════
# SHIELDS
# ══════════════════════════════════════════════════
print("Processing shields...")
SHIELD_MFG = {279:'Maliwan', 283:'Vladof', 287:'Tediore', 293:'Order', 300:'Ripper', 306:'Jakobs', 312:'Daedalus', 321:'Torgue'}

for row in read_csv_file(ROOT / 'shield/shield_main_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, category='Shield',
                     partType=pt, description=desc or stat,
                     perkName=stat if 'Perk' in pt else '',
                     spawnCode=row[5] if len(row) > 5 else ''))

for row in read_csv_file(ROOT / 'shield/manufacturer_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    mfg = SHIELD_MFG.get(int(mid), mid) if mid.isdigit() else mid
    perk_desc, red_text = parse_red_text(desc)
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, manufacturer=mfg,
                     category='Shield', partType=pt, description=desc or stat,
                     rarity='Legendary' if 'Legendary' in pt or 'Legendary' in stat else '',
                     perkName=stat if 'Legendary' in pt else '',
                     perkDescription=perk_desc, redText=red_text,
                     spawnCode=row[6] if len(row) > 6 else ''))

# ══════════════════════════════════════════════════
# GRENADES
# ══════════════════════════════════════════════════
print("Processing grenades...")
GRENADE_MFG = {263:'Maliwan', 267:'Jakobs', 270:'Daedalus', 272:'Order', 278:'Ripper', 291:'Vladof', 298:'Torgue', 311:'Tediore'}

for row in read_csv_file(ROOT / 'grenade/grenade_main_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, category='Grenade',
                     partType=pt, description=desc or stat))

for row in read_csv_file(ROOT / 'grenade/manufacturer_rarity_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    mfg = GRENADE_MFG.get(int(mid), mid) if mid.isdigit() else mid
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, manufacturer=mfg,
                     category='Grenade', partType=pt, description=desc or stat,
                     rarity='Legendary' if 'Legendary' in pt else '',
                     perkName=stat if 'Legendary' in pt else '',
                     perkDescription=desc))

# ══════════════════════════════════════════════════
# REPKITS
# ══════════════════════════════════════════════════
print("Processing repkits...")
REPKIT_MFG = {277:'Daedalus', 265:'Jakobs', 266:'Maliwan', 285:'Order', 274:'Ripper', 290:'Tediore', 261:'Torgue', 269:'Vladof'}

for row in read_csv_file(ROOT / 'repkit/repkit_main_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, category='Repkit',
                     partType=pt, description=desc or stat))

for row in read_csv_file(ROOT / 'repkit/repkit_manufacturer_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    mfg = REPKIT_MFG.get(int(mid), mid) if mid.isdigit() else mid
    perk_desc, red_text = parse_red_text(desc)
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, manufacturer=mfg,
                     category='Repkit', partType=pt, description=desc or stat,
                     rarity='Legendary' if 'Legendary' in pt else '',
                     perkName=stat if 'Legendary' in pt else '',
                     perkDescription=perk_desc, redText=red_text,
                     spawnCode=row[6] if len(row) > 6 else ''))

# ══════════════════════════════════════════════════
# HEAVY
# ══════════════════════════════════════════════════
print("Processing heavy...")
HEAVY_MFG = {282:'Vladof', 273:'Torgue', 275:'Ripper', 289:'Maliwan'}

for row in read_csv_file(ROOT / 'heavy/heavy_main_perk_EN.csv'):
    if len(row) < 4: continue
    mid, pid, pt, stat = row[0], row[1], row[2], row[3]
    desc = row[4] if len(row) > 4 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, category='Heavy',
                     partType=pt, description=desc or stat,
                     spawnCode=row[5] if len(row) > 5 else ''))

for row in read_csv_file(ROOT / 'heavy/heavy_manufacturer_perk_EN.csv'):
    if len(row) < 5: continue
    mid, pid, pt = row[0], row[1], row[2]
    stat = row[4] if len(row) > 4 else ''
    desc = row[5] if len(row) > 5 else ''
    mfg = HEAVY_MFG.get(int(mid), mid) if mid.isdigit() else mid
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=stat or pt, manufacturer=mfg,
                     category='Heavy', partType=pt, description=desc or stat,
                     rarity='Legendary' if 'Legendary' in str(stat) else '',
                     spawnCode=row[7] if len(row) > 7 else ''))

# ══════════════════════════════════════════════════
# ENHANCEMENTS
# ══════════════════════════════════════════════════
print("Processing enhancements...")
for row in read_csv_file(ROOT / 'enhancement/Enhancement_manufacturers.csv'):
    if len(row) < 4: continue
    mid, mfg_name, pid, perk_name = row[0], row[1], row[2], row[3]
    desc = row[5] if len(row) > 5 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=perk_name, manufacturer=mfg_name,
                     category='Enhancement', partType='Core Perk',
                     description=desc or perk_name, perkName=perk_name, perkDescription=desc))

for row in read_csv_file(ROOT / 'enhancement/Enhancement_perk.csv'):
    if len(row) < 3: continue
    mid, pid, perk_name = row[0], row[1], row[2]
    desc = row[4] if len(row) > 4 else ''
    add(blank_entry(code=f'{{{mid}:{pid}}}', name=perk_name, category='Enhancement',
                     partType='Stat Perk', description=desc or perk_name))

for row in read_csv_file(ROOT / 'enhancement/Enhancement_rarity.csv'):
    if len(row) < 4: continue
    mid, mfg_name, rid, rarity = row[0], row[1], row[2], row[3]
    add(blank_entry(code=f'{{{mid}:{rid}}}', name=f'{mfg_name} {rarity}',
                     manufacturer=mfg_name, category='Enhancement', partType='Rarity',
                     rarity=rarity))

# ══════════════════════════════════════════════════
# CLASS MODS
# ══════════════════════════════════════════════════
print("Processing class mods...")
CLASS_NAMES = {'255': 'Amon', '259': 'Harlowe', '256': 'Rafa', '254': 'Vex', '404': 'C4SH'}

for row in read_csv_file(ROOT / 'class_mods/Class_perk.csv'):
    if len(row) < 2: continue
    add(blank_entry(code=f'{{234:{row[0]}}}', name=row[1], category='Class Mod',
                     partType='Perk', description=row[1]))

for row in read_csv_file(ROOT / 'class_mods/Class_rarity_name.csv'):
    if len(row) < 5: continue
    cid, cname, rarity, name_code, name_en = row[0], row[1], row[2], row[3], row[4]
    char = CLASS_NAMES.get(cid, cname)
    add(blank_entry(code=f'{{{cid}:{name_code}}}', name=f'{char} - {name_en}',
                     manufacturer=char, category='Class Mod', partType='Name',
                     description=name_en, rarity='Legendary' if rarity == 'legendary' else 'Normal',
                     character=char))

for row in read_csv_file(ROOT / 'class_mods/Skills.csv'):
    if len(row) < 5: continue
    cid, cname, skill_name = row[0], row[1], row[2]
    char = CLASS_NAMES.get(cid, cname)
    for i in range(4, min(9, len(row))):
        sid = row[i].strip()
        if sid and sid.isdigit():
            add(blank_entry(code=f'{{{cid}:{sid}}}', name=f'{char} - {skill_name}',
                             manufacturer=char, category='Class Mod', partType='Skill',
                             description=skill_name, character=char))

# Class mod rarity IDs
CLASS_RARITY_IDS = {
    '254': {'Common': 217, 'Uncommon': 218, 'Rare': 219, 'Epic': 220},
    '256': {'Common': 66, 'Uncommon': 67, 'Rare': 68, 'Epic': 69},
    '259': {'Common': 224, 'Uncommon': 223, 'Rare': 222, 'Epic': 221},
    '255': {'Common': 70, 'Uncommon': 69, 'Rare': 68, 'Epic': 67},
    '404': {'Common': 52, 'Uncommon': 53, 'Rare': 54, 'Epic': 55},
}
for cid, rarities in CLASS_RARITY_IDS.items():
    char = CLASS_NAMES.get(cid, cid)
    for rarity, pid in rarities.items():
        add(blank_entry(code=f'{{{cid}:{pid}}}', name=f'{rarity} Rarity',
                         manufacturer=char, category='Class Mod', partType='Rarity',
                         rarity=rarity, character=char))

# Legendary comp IDs from Class_legendary_map.csv
for row in read_csv_file(ROOT / 'class_mods/Class_legendary_map.csv'):
    if len(row) < 4: continue
    cid, cname, name_id, card_id = row[0], row[1], row[2], row[3]
    char = CLASS_NAMES.get(cid, cname)
    add(blank_entry(code=f'{{{cid}:{card_id}}}', name='Legendary Rarity',
                     manufacturer=char, category='Class Mod', partType='Rarity',
                     rarity='Legendary', character=char))

# ══════════════════════════════════════════════════
# SUPPLEMENTAL
# ══════════════════════════════════════════════════
print("Processing supplemental...")
supp_path = ROOT / 'api/data/supplemental_parts.json'
if supp_path.exists():
    supp = json.load(open(supp_path, encoding='utf-8'))
    added = 0
    for entry in supp:
        code = entry.get('code', '')
        if code and code not in seen_codes:
            add(blank_entry(
                code=code, name=entry.get('partName', entry.get('itemType', '')),
                manufacturer=entry.get('manufacturer', ''),
                category=entry.get('category', ''),
                partType=entry.get('partType', ''),
                weaponType=entry.get('weaponType', ''),
                description=entry.get('effect', entry.get('itemType', '')),
                rarity=entry.get('rarity', ''),
            ))
            added += 1
    print(f"  Added {added} supplemental entries")

# ══════════════════════════════════════════════════
# SAVE
# ══════════════════════════════════════════════════
from collections import Counter
cats = Counter(e['category'] for e in universal)

print(f"\nTotal: {len(universal)} entries")
for c, n in cats.most_common():
    print(f"  {c}: {n}")

output = {
    'generated_at_utc': datetime.datetime.utcnow().isoformat(),
    'source': 'build_universal_db.py',
    'schema_version': '1.0',
    'total': len(universal),
    'fields': ['code', 'name', 'manufacturer', 'category', 'partType', 'weaponType',
               'description', 'rarity', 'element', 'character', 'perkName',
               'perkDescription', 'redText', 'spawnCode', 'dlc'],
    'rows': universal,
}

with open(ROOT / 'master_search/db/universal_parts_db.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

with open(ROOT / 'api/data/parts.json', 'w', encoding='utf-8') as f:
    json.dump(universal, f, indent=2, ensure_ascii=False)

print(f"\nSaved to universal_parts_db.json ({len(universal)} entries)")
print("Saved to parts.json")
