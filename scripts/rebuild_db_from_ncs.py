#!/usr/bin/env python3
"""
Rebuild universal_parts_db.json from scratch using NCS parsed data + CSV enrichment.
Every entry gets: code, name, category, partType, manufacturer, rarity, effect, element.

Usage: python scripts/rebuild_db_from_ncs.py
"""
import json, re, os, csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NCS_BASE = Path(r"C:\Users\picas\Desktop\BL4_NCS_Tool\ncs_automation\NCS-data\2026-03-29\parsed_v3")
INV4 = NCS_BASE / "pakchunk4-Windows_12_P-Nexus-Data-inv4.json"
UI_STAT = NCS_BASE / "pakchunk4-Windows_12_P-Nexus-Data-ui_stat4.json"
OUTPUT = ROOT / "master_search" / "db" / "universal_parts_db.json"
PARTS_JSON = ROOT / "api" / "data" / "parts.json"

# ── Manufacturer ID → Name maps ───────────────────────────────────────────────

WEAPON_TYPE_IDS = {
    2: ("Daedalus", "Pistol"), 3: ("Jakobs", "Pistol"), 4: ("Order", "Pistol"),
    5: ("Tediore", "Pistol"), 6: ("Torgue", "Pistol"),
    7: ("Ripper", "Shotgun"), 8: ("Daedalus", "Shotgun"), 9: ("Jakobs", "Shotgun"),
    10: ("Maliwan", "Shotgun"), 11: ("Tediore", "Shotgun"), 12: ("Torgue", "Shotgun"),
    13: ("Daedalus", "Assault Rifle"), 14: ("Tediore", "Assault Rifle"),
    15: ("Order", "Assault Rifle"), 17: ("Torgue", "Assault Rifle"),
    18: ("Vladof", "Assault Rifle"), 27: ("Jakobs", "Assault Rifle"),
    16: ("Vladof", "Sniper"), 23: ("Ripper", "Sniper"), 24: ("Jakobs", "Sniper"),
    25: ("Maliwan", "Sniper"), 26: ("Order", "Sniper"),
    19: ("Ripper", "SMG"), 20: ("Daedalus", "SMG"), 21: ("Maliwan", "SMG"),
    22: ("Vladof", "SMG"),
}

HEAVY_MFGS = {244: "Universal", 273: "Torgue", 275: "Ripper", 282: "Vladof", 289: "Maliwan"}
SHIELD_MFGS = {246: "Universal", 248: "Universal Energy", 237: "Universal Armor",
               279: "Maliwan", 283: "Vladof", 287: "Tediore", 293: "Order",
               300: "Ripper", 306: "Jakobs", 312: "Daedalus", 321: "Torgue"}
GRENADE_MFGS = {245: "Universal", 263: "Maliwan", 267: "Jakobs", 270: "Daedalus",
                272: "Order", 278: "Ripper", 291: "Vladof", 298: "Torgue", 311: "Tediore"}
REPKIT_MFGS = {243: "Universal", 261: "Torgue", 265: "Jakobs", 266: "Maliwan",
               269: "Vladof", 274: "Ripper", 277: "Daedalus", 285: "Order", 290: "Tediore"}
ENH_MFGS = {247: "Universal", 284: "Atlas", 286: "COV", 299: "Daedalus", 264: "Hyperion",
            268: "Jakobs", 271: "Maliwan", 296: "Ripper", 292: "Tediore",
            281: "The Order", 303: "Torgue", 310: "Vladof"}
CLASS_IDS = {234: "Shared", 254: "Vex", 255: "Amon", 256: "Rafa", 259: "Harlowe", 404: "C4SH"}

# Determine category from typeId
def get_category_and_mfg(type_id):
    tid = int(type_id)
    if tid in WEAPON_TYPE_IDS:
        mfg, wtype = WEAPON_TYPE_IDS[tid]
        return "Weapon", mfg, wtype
    if tid in HEAVY_MFGS:
        return "Heavy", HEAVY_MFGS[tid], "Heavy Weapon"
    if tid in SHIELD_MFGS:
        return "Shield", SHIELD_MFGS[tid], None
    if tid in GRENADE_MFGS:
        return "Grenade", GRENADE_MFGS[tid], None
    if tid in REPKIT_MFGS:
        return "Repkit", REPKIT_MFGS[tid], None
    if tid in ENH_MFGS:
        return "Enhancement", ENH_MFGS[tid], None
    if tid in CLASS_IDS:
        return "Class Mod", CLASS_IDS[tid], None
    if tid == 1:
        return "Element", None, None
    return None, None, None

# ── CSV readers ───────────────────────────────────────────────────────────────

def read_csv(rel_path):
    full = ROOT / rel_path
    if not full.exists():
        return []
    rows = []
    with open(full, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({k.strip(): (v or "").strip() for k, v in row.items() if k})
    return rows

# ── Parse ui_stat4.json for descriptions ──────────────────────────────────────

print("Loading ui_stat4.json...")
ui_stat_text = (UI_STAT).read_text(encoding="utf-8")

def clean_desc(raw):
    if not raw:
        return ""
    # Strip NCS localization: "TableName, GUID, ActualText"
    text = re.sub(r'^[\w_]+,\s*[0-9A-Fa-f]{20,40},\s*', '', raw)
    # Strip markup tags
    text = re.sub(r'\[/?(rarity_legendary|rarity_pearlescent|secondary|flavor|newline|rd_color|primary|nowrap|fire_icon|fire|ice_icon|ice|shock_icon|shock|corrosive_icon|corrosive|radiation_icon|radiation|dark_icon|dark|light_icon|light)\]', '', text, flags=re.I)
    text = text.replace('{mod}', 'X%').replace('{duration}', 'Xs').replace('{0} {1}', 'X%').replace('$VALUE$', 'X%')
    return re.sub(r'\s{2,}', ' ', text).strip()

# Extract all uistat entries
ui_descs = {}  # name -> { desc, redText }
for m in re.finditer(r'"(uistat_[\w]+)"[\s\S]{1,500}?"formattext"[\s\S]{1,200}?"value":\s*"([^"]+)"', ui_stat_text):
    key = m.group(1).lower()
    val = clean_desc(m.group(2))
    if len(val) < 4:
        continue
    desc_m = re.match(r'^uistat_(.+?)_desc$', key)
    red_m = re.match(r'^uistat_(.+?)_red_?text$', key)
    enh_m = re.match(r'^uistat_enh_core_(\w+)$', key)
    if desc_m:
        name = desc_m.group(1)
        ui_descs.setdefault(name, {})["desc"] = val
    elif red_m:
        name = red_m.group(1)
        ui_descs.setdefault(name, {})["redText"] = val
    elif enh_m:
        name = enh_m.group(1)
        ui_descs.setdefault(name, {})["desc"] = val

print(f"  {len(ui_descs)} ui_stat descriptions loaded")

def lookup_desc(name):
    """Try to find a description for an item name."""
    clean = re.sub(r'[^a-z0-9]', '', name.lower())
    if clean in ui_descs:
        d = ui_descs[clean]
        r = d.get("desc", "")
        if d.get("redText"):
            r += ('\n"' + d["redText"] + '"') if r else ('"' + d["redText"] + '"')
        return r
    return ""

# ── Read ALL CSV data sources ─────────────────────────────────────────────────

print("\nReading CSV data sources...")

# Store all entries keyed by code
entries = {}  # code -> dict

def add_entry(code, name, category, part_type, manufacturer=None, rarity=None,
              effect=None, weapon_type=None, element=None):
    if not code:
        return
    e = entries.get(code, {})
    e["code"] = code
    if name and "\n" not in name:
        cur = e.get("name", "")
        # Prefer clean human names: no spawn codes, no multiline, no "Description:" prefix
        is_clean = ".part_" not in name and "_sg." not in name and not name.startswith("Description:")
        cur_is_clean = cur and ".part_" not in cur and not cur.startswith("Description:")
        if not cur or (is_clean and not cur_is_clean) or (is_clean and len(name) > len(cur)):
            e["name"] = name
        elif not cur:
            e["name"] = name
    if category:
        e["category"] = category
    if part_type:
        e["partType"] = part_type
    if manufacturer and not e.get("manufacturer"):
        e["manufacturer"] = manufacturer
    if rarity and not e.get("rarity"):
        e["rarity"] = rarity
    if effect and len(effect) > len(e.get("effect", "")):
        e["effect"] = effect
    if weapon_type and not e.get("weaponType"):
        e["weaponType"] = weapon_type
    if element and not e.get("element"):
        e["element"] = element
    entries[code] = e

# ── Weapon CSVs ───────────────────────────────────────────────────────────────

# Pre-load weapon_rarity.csv for legendary/pearl name lookups
weapon_rarity_map = {}  # (typeId, partId) -> { rarity, name }
for r in read_csv("weapon_edit/weapon_rarity.csv"):
    tid = r.get("Manufacturer & Weapon Type ID", "") or r.get("TypeID", "")
    # CSV columns vary — try both formats
    cols = list(r.values())
    # Format: TypeID, Manufacturer, WeaponType, PartID, Rarity, RarityLevel, [LegendaryName]
    if len(cols) >= 6:
        tid = cols[0]
        pid = cols[3]
        rarity_level = cols[5]  # "Common", "Uncommon", "Rare", "Epic", "Legendary", "Pearl"
        leg_name = cols[6] if len(cols) > 6 else ""
        if tid and pid:
            weapon_rarity_map[(tid, pid)] = {"rarity": rarity_level, "name": leg_name.strip()}

print(f"  Loaded {len(weapon_rarity_map)} weapon rarity entries")
print("  Processing weapons...")
for r in read_csv("weapon_edit/all_weapon_part_EN.csv"):
    tid = r.get("Manufacturer & Weapon Type ID", "")
    pid = r.get("Part ID", "")
    if not tid or not pid:
        continue
    code = f"{{{tid}:{pid}}}"
    cat, mfg, wtype = get_category_and_mfg(tid)

    mfg_csv = r.get("Manufacturer", "") or mfg
    wtype_csv = r.get("Weapon Type", "") or wtype
    pt = r.get("Part Type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    string = r.get("String", "")

    # Build a clean name
    name = stat or string or ""
    # Extract legendary name from string field
    if string and "legendary" in string.lower():
        leg_name = re.sub(r'.*comp_05_legendary_?', '', string, flags=re.I).replace('_', ' ').strip()
        if leg_name:
            name = leg_name.title()
    elif string and ".part_barrel_" in string:
        barrel_name = re.sub(r'.*part_barrel_\d+_?', '', string, flags=re.I).replace('_', ' ').strip()
        if barrel_name:
            name = barrel_name.title()
    elif string and ".part_" in string:
        # Generic part — use stat or part type as name
        name = stat or pt or string.split(".")[-1].replace("_", " ").strip().title()

    if not name or name == string or "\n" in name or name.startswith("Description:"):
        # Try to infer from string field patterns
        if string:
            comp_m = re.search(r'comp_0[1-4]_(common|uncommon|rare|epic)', string, re.I)
            if comp_m:
                name = comp_m.group(1).title()
            else:
                name = f"{mfg_csv} {wtype_csv} {pt}" if pt else f"{mfg_csv} {wtype_csv} Part {pid}"
        else:
            name = f"{mfg_csv} {wtype_csv} {pt}" if pt else f"{mfg_csv} {wtype_csv} Part {pid}"

    # For rarity entries, don't use the messy CSV description as effect
    effect = ""
    if pt != "Rarity":
        effect = desc or stat or ""
    elif desc and not desc.startswith("Description:") and "\n" not in desc:
        effect = desc
    rarity = None
    if pt == "Rarity":
        # Check weapon_rarity.csv first for clean legendary/pearl names
        wr = weapon_rarity_map.get((tid, pid))
        if wr:
            rarity = wr["rarity"]
            if wr["name"]:
                name = wr["name"]
            elif rarity in ("Common", "Uncommon", "Rare", "Epic"):
                name = rarity
            elif stat and "\n" not in stat and not stat.startswith("Description"):
                name = stat
        else:
            rarity_str = (stat or "").split(" ")[0] if stat else ""
            if "legendary" in (stat or "").lower():
                rarity = "Legendary"
                leg = re.sub(r'^.*?Legendary:?\s*', '', stat, flags=re.I).strip()
                if leg and leg != stat:
                    name = leg
            elif "pearl" in (stat or "").lower():
                rarity = "Pearl"
                leg = re.sub(r'^.*?Pearl:?\s*', '', stat, flags=re.I).strip()
                if leg:
                    name = leg
            elif rarity_str in ("Common", "Uncommon", "Rare", "Epic"):
                rarity = rarity_str

    add_entry(code, name, cat or "Weapon", pt, mfg_csv, rarity, effect, wtype_csv)

# Elements
print("  Processing elements...")
for r in read_csv("weapon_edit/elemental.csv"):
    tid = r.get("Elemental_ID", "")
    pid = r.get("Part_ID", "")
    stat = r.get("Stat", "")
    if not tid or not pid:
        continue
    code = f"{{{tid}:{pid}}}"

    ELEM_DESCS = {
        "fire": "Deals bonus fire damage. Effective against flesh.",
        "shock": "Deals bonus shock damage. Effective against shields.",
        "corrosive": "Deals bonus corrosive damage. Effective against armor.",
        "cryo": "Deals bonus cryo damage. Slows and freezes enemies.",
        "radiation": "Deals bonus radiation damage. Irradiated enemies explode on death.",
        "dark": "Deals bonus dark damage.",
        "incendiary": "Deals bonus fire damage. Effective against flesh.",
    }
    elem_name = stat or f"Element {pid}"
    effect = ""
    element = None
    for el, desc in ELEM_DESCS.items():
        if el in elem_name.lower():
            effect = desc
            element = el.title()
            break
    add_entry(code, elem_name, "Element", "Element", element=element, effect=effect)

# ── Shield CSVs ───────────────────────────────────────────────────────────────

print("  Processing shields...")
for r in read_csv("shield/shield_main_perk_EN.csv"):
    tid = r.get("Shield_perk_main_ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    mfg = SHIELD_MFGS.get(int(tid), "")
    add_entry(code, stat or f"Shield {pt} {pid}", "Shield", pt, mfg, effect=desc)

for r in read_csv("shield/manufacturer_perk_EN.csv"):
    tid = r.get("Manufacturer ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    mfg = SHIELD_MFGS.get(int(tid), tid)
    rarity = "Legendary" if pt in ("Legendary Perk",) else None
    if pt == "Rarity":
        rarity = "Legendary" if "legendary" in (stat or "").lower() else None
    add_entry(code, stat or f"{mfg} Shield {pt}", "Shield", pt, mfg, rarity, desc)

# ── Grenade CSVs ──────────────────────────────────────────────────────────────

print("  Processing grenades...")
for r in read_csv("grenade/grenade_main_perk_EN.csv"):
    tid = r.get("Grenade_perk_main_ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    add_entry(code, stat or f"Grenade {pt} {pid}", "Grenade", pt, GRENADE_MFGS.get(int(tid), ""), effect=desc)

for r in read_csv("grenade/manufacturer_rarity_perk_EN.csv"):
    tid = r.get("Manufacturer ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    mfg = GRENADE_MFGS.get(int(tid), tid)
    rarity = "Legendary" if pt in ("Legendary Perk",) else ("Legendary" if "legendary" in (stat or "").lower() else None)
    add_entry(code, stat or f"{mfg} Grenade {pt}", "Grenade", pt, mfg, rarity, desc)

# ── Repkit CSVs ───────────────────────────────────────────────────────────────

print("  Processing repkits...")
for r in read_csv("repkit/repkit_main_perk_EN.csv"):
    tid = r.get("Repkit_perk_main_ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    add_entry(code, stat or f"Repkit {pt} {pid}", "Repkit", pt, REPKIT_MFGS.get(int(tid), ""), effect=desc)

for r in read_csv("repkit/repkit_manufacturer_perk_EN.csv"):
    tid = r.get("Manufacturer ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    mfg = REPKIT_MFGS.get(int(tid), tid)
    rarity = "Legendary" if pt in ("Legendary Perk",) else ("Legendary" if "legendary" in (stat or "").lower() else None)
    add_entry(code, stat or f"{mfg} Repkit {pt}", "Repkit", pt, mfg, rarity, desc)

# ── Enhancement CSVs ──────────────────────────────────────────────────────────

print("  Processing enhancements...")
for r in read_csv("enhancement/Enhancement_manufacturers.csv"):
    tid = r.get("manufacturers_ID", "")
    pid = r.get("perk_ID", "")
    name = r.get("perk_name_EN", "")
    desc = r.get("perk_description_EN", "")
    mfg_name = r.get("manufacturers_name", "") or ENH_MFGS.get(int(tid) if tid else 0, "")
    if not tid or not pid:
        continue
    code = f"{{{tid}:{pid}}}"
    add_entry(code, name, "Enhancement", "Core Perk", mfg_name, "Legendary", desc)

for r in read_csv("enhancement/Enhancement_rarity.csv"):
    tid = r.get("manufacturers_ID", "")
    rid = r.get("rarity_ID", "")
    rarity = r.get("rarity", "")
    mfg = r.get("manufacturers_name", "") or ENH_MFGS.get(int(tid) if tid else 0, "")
    if not tid or not rid or not rarity:
        continue
    code = f"{{{tid}:{rid}}}"
    add_entry(code, f"{mfg} {rarity}", "Enhancement", "Rarity", mfg, rarity)

for r in read_csv("enhancement/Enhancement_perk.csv"):
    tid = r.get("manufacturers_ID", "")
    pid = r.get("perk_ID", "")
    name = r.get("perk_name_EN", "")
    desc = r.get("perk_description_EN", "")
    if not tid or not pid:
        continue
    code = f"{{{tid}:{pid}}}"
    # Clean stat perk name: "+20% Movement Speed" → "Movement Speed"
    clean_name = re.sub(r'^[+\-.\d%]+\s*', '', name).strip() or name
    mfg = ENH_MFGS.get(int(tid), "")
    add_entry(code, f"{clean_name} Stat Perk", "Enhancement", "Stat Perk", mfg, effect=name)

# ── Heavy CSVs ────────────────────────────────────────────────────────────────

print("  Processing heavies...")
for r in read_csv("heavy/heavy_main_perk_EN.csv"):
    tid = r.get("Heavy_perk_main_ID", "") or "244"
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    if not pid:
        continue
    code = f"{{{tid}:{pid}}}"
    add_entry(code, stat or f"Heavy {pt} {pid}", "Heavy", pt, HEAVY_MFGS.get(int(tid), ""), effect=desc)

for r in read_csv("heavy/heavy_manufacturer_perk_EN.csv"):
    tid = r.get("Manufacturer ID", "")
    pid = r.get("Part_ID", "")
    pt = r.get("Part_type", "")
    stat = r.get("Stat", "")
    desc = r.get("Description", "")
    string = r.get("String", "")
    if not pid or not tid:
        continue
    code = f"{{{tid}:{pid}}}"
    mfg = HEAVY_MFGS.get(int(tid), tid)
    name = stat or string or desc or f"{mfg} Heavy {pt}"
    rarity = "Legendary" if "legendary" in (pt or "").lower() else None
    add_entry(code, name, "Heavy", pt, mfg, rarity, desc)

# ── Class Mod CSVs ────────────────────────────────────────────────────────────

print("  Processing class mods...")
for r in read_csv("class_mods/Class_perk.csv"):
    pid = r.get("perk_ID", "")
    name = r.get("perk_name_EN", "")
    if not pid or not name:
        continue
    code = f"{{234:{pid}}}"
    clean_name = re.sub(r'^[+\-.\d%]+\s*', '', name).strip() or name
    add_entry(code, f"{clean_name} Class Mod Perk", "Class Mod", "Universal Class Mod Perk", "Shared", effect=name)

for r in read_csv("class_mods/Class_rarity_name.csv"):
    cid = r.get("class_ID", "")
    name_code = r.get("name_code", "")
    name = r.get("name_EN", "")
    rarity = r.get("rarity", "")
    if not cid or not name_code or not name:
        continue
    code = f"{{{cid}:{name_code}}}"
    char = CLASS_IDS.get(int(cid), cid)
    is_leg = rarity == "legendary"
    add_entry(code, name, "Class Mod", "Name", char, "Legendary" if is_leg else "Normal")

for r in read_csv("class_mods/Class_legendary_map.csv"):
    cid = r.get("class_ID", "")
    card_id = r.get("item_card_ID", "")
    if not cid or not card_id:
        continue
    code = f"{{{cid}:{card_id}}}"
    char = CLASS_IDS.get(int(cid), cid)
    add_entry(code, "Legendary Rarity", "Class Mod", "Rarity", char, "Legendary")

CLASS_RARITY_IDS = {
    "254": {"Common": 217, "Uncommon": 218, "Rare": 219, "Epic": 220},
    "256": {"Common": 66, "Uncommon": 67, "Rare": 68, "Epic": 69},
    "259": {"Common": 224, "Uncommon": 223, "Rare": 222, "Epic": 221},
    "255": {"Common": 70, "Uncommon": 69, "Rare": 68, "Epic": 67},
    "404": {"Common": 52, "Uncommon": 53, "Rare": 54, "Epic": 55},
}
for cid, rarities in CLASS_RARITY_IDS.items():
    char = CLASS_IDS.get(int(cid), cid)
    for rarity, pid in rarities.items():
        code = f"{{{cid}:{pid}}}"
        add_entry(code, f"{rarity} Rarity", "Class Mod", "Rarity", char, rarity)

for r in read_csv("class_mods/Skills.csv"):
    cid = r.get("class_ID", "")
    char_name = CLASS_IDS.get(int(cid) if cid else 0, r.get("class_name", cid))
    skill_name = r.get("skill_name_EN", "")
    if not cid or not skill_name:
        continue
    for i in range(1, 6):
        sid = r.get(f"skill_ID_{i}", "")
        if not sid:
            continue
        code = f"{{{cid}:{sid}}}"
        add_entry(code, skill_name, "Class Mod", "Skill", char_name)

# ── Supplemental parts ────────────────────────────────────────────────────────

supp_path = ROOT / "api" / "data" / "supplemental_parts.json"
if supp_path.exists():
    print("  Processing supplemental parts...")
    supp = json.loads(supp_path.read_text(encoding="utf-8"))
    for s in supp:
        code = s.get("code", "")
        if not code or code in entries:
            continue
        add_entry(code, s.get("itemType", s.get("partName", "")),
                  s.get("category", ""), s.get("partType", ""),
                  s.get("manufacturer"), s.get("rarity"), s.get("effect"),
                  s.get("weaponType"))

# ── Firmware descriptions (not in NCS) ────────────────────────────────────────

FIRMWARE_DESCS = {
    "God Killer": "Increases damage against Badass and Boss enemies.",
    "Reel Big Fist": "Increases melee damage.",
    "Lifeblood": "Slowly regenerates health over time.",
    "Airstrike": "Periodically calls down an airstrike on nearby enemies.",
    "High Caliber": "Increases weapon damage.",
    "Gadget Ahoy": "Increases grenade damage.",
    "Baker": "Increases splash damage radius.",
    "Oscar Mike": "Increases movement speed.",
    "Rubberband Man": "Increases reload speed.",
    "Dead Eye": "Increases critical hit damage.",
    "Deadeye": "Increases critical hit damage.",
    "Action Fist": "Increases melee damage.",
    "Atlas E.X.": "Periodically fires a homing missile at nearby enemies.",
    "Atlas Infinum": "Increased magazine size. Shots have a chance to not consume ammo.",
    "Daed-dy O'": "Increased fire rate.",
    "Bullets To Spare": "Periodically regenerates ammo in the magazine.",
    "Bullets to Spare": "Periodically regenerates ammo in the magazine.",
    "Get Throwin'": "Increases grenade throw speed and grenade count.",
    "GooJFC": "Increases status effect damage and chance.",
    "Goojfc": "Increases status effect damage and chance.",
    "Heating Up": "Increased fire rate that stacks as you continuously fire.",
    "Jacked": "Increases gun damage and fire rate.",
    "Risky Boots": "Increased damage at low health.",
    "Trickshot": "Bullets have a chance to ricochet to nearby enemies.",
    "Skillcraft": "Increases Action Skill damage.",
}

# ── NCS enrichment pass ───────────────────────────────────────────────────────

print("\nEnriching from NCS ui_stat4...")
enriched = 0
for code, e in entries.items():
    name = e.get("name", "")
    # Try to find description from ui_stat
    if e.get("effect") and len(e["effect"]) > 30:
        continue

    # Try name-based lookup
    desc = lookup_desc(name)
    if not desc:
        # Try from partName patterns
        barrel_m = re.search(r'part_barrel_\d+_(\w+)', name, re.I)
        comp_m = re.search(r'comp_05_(?:legendary_)?(\w+)', name, re.I)
        if barrel_m:
            desc = lookup_desc(barrel_m.group(1))
        elif comp_m:
            desc = lookup_desc(comp_m.group(1))

    if desc and len(desc) > len(e.get("effect", "")):
        e["effect"] = desc
        enriched += 1

    # Firmware descriptions
    if e.get("partType") == "Firmware" and not e.get("effect"):
        for fw_name, fw_desc in FIRMWARE_DESCS.items():
            if fw_name.lower().replace("'", "").replace("-", "").replace(" ", "") == \
               name.lower().replace("'", "").replace("-", "").replace(" ", ""):
                e["effect"] = fw_desc
                enriched += 1
                break

print(f"  Enriched {enriched} entries from NCS + firmware")

# ── Clean up spawn code names ─────────────────────────────────────────────────

print("\nCleaning spawn code names...")
cleaned = 0
for code, e in entries.items():
    name = e.get("name", "")
    if not name or ".part_" in name or "_sg." in name or "_ar." in name or "_sm." in name or "_ps." in name:
        # Try to derive a better name
        tid_str = code.split(":")[0].strip("{")
        tid = int(tid_str) if tid_str.isdigit() else 0
        cat, mfg, wtype = get_category_and_mfg(tid)
        pt = e.get("partType", "")

        # Extract from spawn code
        better = ""
        barrel_m = re.search(r'part_barrel_\d+_(\w+)', name, re.I)
        if barrel_m:
            better = barrel_m.group(1).replace("_", " ").title()

        if not better:
            part_m = re.search(r'\.part_(\w+)', name, re.I)
            if part_m:
                raw = part_m.group(1)
                # Remove common prefixes
                raw = re.sub(r'^(barrel|body|mag|grip|scope|foregrip|underbarrel)_\d*_?', '', raw, flags=re.I)
                raw = re.sub(r'^(unique|aug)_', '', raw, flags=re.I)
                better = raw.replace("_", " ").strip().title()

        if not better and pt:
            better = f"{mfg or ''} {pt}".strip()

        if better and len(better) > 2:
            e["name"] = better
            cleaned += 1

print(f"  Cleaned {cleaned} spawn code names")

# Pass 2: Fix generic names using effect field and context
print("Fixing generic names...")
fixed = 0
for code, e in entries.items():
    name = e.get("name", "")
    pt = e.get("partType", "")
    cat = e.get("category", "")
    effect = e.get("effect", "")
    mfg = e.get("manufacturer", "")

    # Manufacturer Parts: "Mal Sg.Part Barrel Licensed Jak" → use effect ("Jakobs Ricochet")
    if pt == "Manufacturer Part" and ("Part" in name or ".part_" in name.lower()):
        if effect:
            clean = effect.split(",")[0].split(" - ")[0].strip()
            if clean and len(clean) > 2:
                e["name"] = clean
                fixed += 1
                continue

    # Barrels: "Mal Sg.Part Barrel Reminisce" → extract from effect or name
    if pt == "Barrel" and ("Part" in name or ".part_" in name.lower()):
        # Try to extract from effect: "Reminisce Barrel - ..."
        if effect:
            barrel_name = effect.split(" Barrel")[0].split(",")[0].strip()
            if barrel_name and len(barrel_name) > 2 and len(barrel_name) < 40:
                e["name"] = barrel_name
                fixed += 1
                continue
        # Try from the name itself: "Mal Sg.Part Barrel Reminisce"
        m = re.search(r'Part[_ ]Barrel[_ ]\d*_?(\w+)', name, re.I)
        if m:
            e["name"] = m.group(1).replace("_", " ").title()
            fixed += 1
            continue

    # Rarity entries: anything generic with "Rarity" in name → just use rarity level
    if pt == "Rarity" and ("Rarity" in name or "rarity" in name.lower()):
        rarity = e.get("rarity", "")
        if rarity:
            e["name"] = rarity
            fixed += 1
        else:
            # No rarity set — label as Unknown Rarity
            e["name"] = "Unknown Rarity"
            e["rarity"] = "Unknown"
            fixed += 1

    # Body/Scope/Grip etc with "Mfg Body" pattern
    if name == f"{mfg} {pt}" and cat == "Weapon":
        wtype = e.get("weaponType", "")
        e["name"] = f"{mfg} {wtype} {pt}" if wtype else f"{mfg} {pt}"
        # Not really a fix, just more descriptive

print(f"  Fixed {fixed} generic names")

# ── Final assembly ────────────────────────────────────────────────────────────

print(f"\nAssembling final database...")

rows = []
for code, e in sorted(entries.items()):
    name = e.get("name", code)
    row = {
        "code": code,
        "partName": name,
        "itemType": name,
        "category": e.get("category", "Unknown"),
        "partType": e.get("partType", "Unknown"),
    }
    if e.get("manufacturer"):
        row["manufacturer"] = e["manufacturer"]
    if e.get("rarity"):
        row["rarity"] = e["rarity"]
    if e.get("effect"):
        row["effect"] = e["effect"]
    if e.get("weaponType"):
        row["weaponType"] = e["weaponType"]
    if e.get("element"):
        row["element"] = e["element"]
    rows.append(row)

# ── Write output ──────────────────────────────────────────────────────────────

from datetime import datetime

db_out = {
    "generated_at_utc": datetime.utcnow().isoformat() + "Z",
    "source": "rebuild_db_from_ncs.py (full rebuild from CSVs + NCS enrichment)",
    "rows": rows,
}

OUTPUT.write_text(json.dumps(db_out, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {len(rows)} entries to {OUTPUT}")

# Also write parts.json (same data, just the rows array)
PARTS_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {len(rows)} entries to {PARTS_JSON}")

# ── Report ────────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print("REBUILD COMPLETE")
print("=" * 60)

cats = {}
for r in rows:
    c = r["category"]
    if c not in cats:
        cats[c] = {"total": 0, "hasEffect": 0, "hasMfg": 0, "hasRarity": 0, "spawnName": 0}
    cats[c]["total"] += 1
    if r.get("effect") and len(r["effect"]) > 5:
        cats[c]["hasEffect"] += 1
    if r.get("manufacturer"):
        cats[c]["hasMfg"] += 1
    if r.get("rarity"):
        cats[c]["hasRarity"] += 1
    if ".part_" in r.get("name", ""):
        cats[c]["spawnName"] += 1

for c, v in sorted(cats.items(), key=lambda x: -x[1]["total"]):
    t = v["total"]
    print(f"  {c:14s} total:{t:5d}  effect:{v['hasEffect']:5d} ({100*v['hasEffect']//t:2d}%)  mfg:{v['hasMfg']:5d}  rarity:{v['hasRarity']:5d}  spawnNames:{v['spawnName']:4d}")

total_spawn = sum(v["spawnName"] for v in cats.values())
total_effect = sum(v["hasEffect"] for v in cats.values())
print(f"\n  TOTAL: {len(rows)} entries, {total_effect} with effects, {total_spawn} spawn code names remaining")
