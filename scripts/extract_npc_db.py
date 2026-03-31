#!/usr/bin/env python3
"""
Extract ALL NPC/turret/terminal/hover/gunship items from NCS inv4.json
into a separate npc_parts_db.json.

Usage: python scripts/extract_npc_db.py
"""
import json, re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
NCS_BASE = Path(r"C:\Users\picas\Desktop\BL4_NCS_Tool\ncs_automation\NCS-data\2026-03-29\parsed_v3")
INV4 = NCS_BASE / "pakchunk4-Windows_12_P-Nexus-Data-inv4.json"
UI_STAT = NCS_BASE / "pakchunk4-Windows_12_P-Nexus-Data-ui_stat4.json"
OUTPUT = ROOT / "master_search" / "db" / "npc_parts_db.json"

# ── NPC type ID definitions ───────────────────────────────────────────────────

NPC_TYPES = {
    # Turret Weapons
    304: {"name": "Turret Chaingun", "category": "Turret Weapon", "manufacturer": "Universal"},
    308: {"name": "Turret Long Rifle", "category": "Turret Weapon", "manufacturer": "Universal"},
    320: {"name": "Turret Rocket Launcher", "category": "Turret Weapon", "manufacturer": "Universal"},
    324: {"name": "Turret Shotgun", "category": "Turret Weapon", "manufacturer": "Universal"},
    376: {"name": "Turret Basic", "category": "Turret Weapon", "manufacturer": "Universal"},
    379: {"name": "Turret Beam", "category": "Turret Weapon", "manufacturer": "Universal"},
    388: {"name": "Gunship Main Gun", "category": "Gunship Weapon", "manufacturer": "Universal"},
    375: {"name": "Turret Gadget Weapon", "category": "Turret Gadget", "manufacturer": "Universal"},

    # Turret Gadgets (manufacturer-specific)
    288: {"name": "Turret Gadget", "category": "Turret Gadget", "manufacturer": "Universal"},
    323: {"name": "Vladof Turret Gadget", "category": "Turret Gadget", "manufacturer": "Vladof"},
    326: {"name": "Order Turret Gadget", "category": "Turret Gadget", "manufacturer": "Order"},
    335: {"name": "Ripper Turret Gadget", "category": "Turret Gadget", "manufacturer": "Ripper"},
    360: {"name": "Daedalus Turret Gadget", "category": "Turret Gadget", "manufacturer": "Daedalus"},
    373: {"name": "Jakobs Turret Gadget", "category": "Turret Gadget", "manufacturer": "Jakobs"},
    374: {"name": "Maliwan Turret Gadget", "category": "Turret Gadget", "manufacturer": "Maliwan"},
    377: {"name": "Tediore Turret Gadget", "category": "Turret Gadget", "manufacturer": "Tediore"},
    378: {"name": "Torgue Turret Gadget", "category": "Turret Gadget", "manufacturer": "Torgue"},

    # Terminal Gadgets
    280: {"name": "Terminal Barrier", "category": "Terminal Gadget", "manufacturer": "Universal"},
    294: {"name": "Terminal Gadget", "category": "Terminal Gadget", "manufacturer": "Universal"},
    295: {"name": "Terminal Combat", "category": "Terminal Gadget", "manufacturer": "Universal"},
    297: {"name": "Terminal Healing", "category": "Terminal Gadget", "manufacturer": "Universal"},
    305: {"name": "Ripper Terminal Barrier", "category": "Terminal Gadget", "manufacturer": "Ripper"},
    307: {"name": "Daedalus Terminal Combat", "category": "Terminal Gadget", "manufacturer": "Daedalus"},
    309: {"name": "Jakobs Terminal Combat", "category": "Terminal Gadget", "manufacturer": "Jakobs"},
    319: {"name": "Maliwan Terminal Healing", "category": "Terminal Gadget", "manufacturer": "Maliwan"},
    322: {"name": "Order Terminal Healing", "category": "Terminal Gadget", "manufacturer": "Order"},
    325: {"name": "Tediore Terminal Barrier", "category": "Terminal Gadget", "manufacturer": "Tediore"},
    327: {"name": "Torgue Terminal Combat", "category": "Terminal Gadget", "manufacturer": "Torgue"},
    328: {"name": "Vladof Terminal Barrier", "category": "Terminal Gadget", "manufacturer": "Vladof"},

    # Hover Drives (base + 5 ranks per manufacturer)
    301: {"name": "Hover Drive", "category": "Hover Drive", "manufacturer": "Universal"},
    302: {"name": "Hover Drive Tests", "category": "Hover Drive", "manufacturer": "Universal"},
}

# Add manufacturer hover drives (base + ranks 01-05)
HOVER_MFGS = {
    "mal": ("Maliwan", 313, 318), "jak": ("Jakobs", 329, 334),
    "tor": ("Torgue", 336, 341), "ted": ("Tediore", 342, 347),
    "bor": ("Ripper", 348, 353), "vla": ("Vladof", 354, 359),
    "dad": ("Daedalus", 361, 366), "ord": ("Order", 367, 372),
}
for prefix, (mfg, rank5_id, base_id) in HOVER_MFGS.items():
    for rank in range(5, 0, -1):
        tid = rank5_id + (5 - rank)
        NPC_TYPES[tid] = {
            "name": f"{mfg} Hover Drive Rank {rank:02d}",
            "category": "Hover Drive",
            "manufacturer": mfg,
        }
    NPC_TYPES[base_id] = {
        "name": f"{mfg} Hover Drive",
        "category": "Hover Drive",
        "manufacturer": mfg,
    }

print(f"Tracking {len(NPC_TYPES)} NPC type IDs")

# ── Load inv4.json ────────────────────────────────────────────────────────────

print("Loading inv4.json...")
with open(INV4, "r", encoding="utf-8") as f:
    inv_data = json.load(f)

# ── Extract all sub-parts for NPC types ───────────────────────────────────────

print("Extracting NPC parts...")

entries = []  # list of part dicts
type_part_counts = {}  # typeId -> count

def get_val(obj, *keys):
    """Safely traverse nested dict."""
    for k in keys:
        if isinstance(obj, dict):
            obj = obj.get(k, {})
        else:
            return ""
    return obj if isinstance(obj, str) else ""

# Walk all records and entries, tracking parent type IDs
for rec in inv_data["inv"]["records"]:
    for entry_wrapper in rec.get("entries", []):
        for key, val in entry_wrapper.items():
            if key == "__op":
                continue
            v = val.get("value", {}) if isinstance(val, dict) else {}
            si = v.get("serialindex", {})
            si_val = si.get("value", {}) if isinstance(si, dict) else {}
            scope = get_val(si_val, "_scope", "value")
            idx = get_val(si_val, "index", "value")

            if not idx:
                continue

            # Check if this is a Root entry for an NPC type
            if scope == "Root" and int(idx) in NPC_TYPES:
                type_info = NPC_TYPES[int(idx)]
                type_part_counts[idx] = 0

                # Now extract ALL __dep_entries under this root
                deps = v.get("__dep_entries", [])
                if isinstance(deps, list):
                    for dep_wrapper in deps:
                        if not isinstance(dep_wrapper, dict):
                            continue
                        for dep_key, dep_val in dep_wrapper.items():
                            if dep_key == "__op":
                                continue
                            dv = dep_val.get("value", {}) if isinstance(dep_val, dict) else {}
                            dsi = dv.get("serialindex", {})
                            dsi_val = dsi.get("value", {}) if isinstance(dsi, dict) else {}
                            d_idx = get_val(dsi_val, "index", "value")
                            d_scope = get_val(dsi_val, "_scope", "value")

                            if not d_idx or d_scope != "Sub":
                                continue

                            code = f"{{{idx}:{d_idx}}}"

                            # Derive part name and type from key
                            part_name = dep_key
                            part_type = "Unknown"

                            # Parse key patterns
                            key_lower = dep_key.lower()
                            if "barrel" in key_lower:
                                part_type = "Barrel"
                            elif "body" in key_lower:
                                part_type = "Body"
                            elif "comp_05" in key_lower or "legendary" in key_lower:
                                part_type = "Legendary"
                            elif "comp_0" in key_lower:
                                part_type = "Rarity"
                            elif "magazine" in key_lower or "mag" in key_lower:
                                part_type = "Magazine"
                            elif "scope" in key_lower:
                                part_type = "Scope"
                            elif "grip" in key_lower:
                                part_type = "Grip"
                            elif "underbarrel" in key_lower:
                                part_type = "Underbarrel"
                            elif "foregrip" in key_lower:
                                part_type = "Foregrip"
                            elif "skin" in key_lower or "cosmetic" in key_lower:
                                part_type = "Skin"
                            elif "firmware" in key_lower:
                                part_type = "Firmware"
                            elif "perk" in key_lower or "augment" in key_lower:
                                part_type = "Perk"
                            elif "element" in key_lower:
                                part_type = "Element"
                            elif "stat" in key_lower or "modifier" in key_lower:
                                part_type = "Stat Modifier"
                            elif "model" in key_lower:
                                part_type = "Model"
                            elif "rank" in key_lower:
                                part_type = "Rank"
                            elif "licensed" in key_lower:
                                part_type = "Manufacturer Part"

                            # Clean up name
                            clean_name = dep_key
                            # Remove common prefixes
                            for prefix in ["part_barrel_", "part_body_", "part_mag_", "part_scope_",
                                          "part_grip_", "part_", "comp_01_", "comp_02_", "comp_03_",
                                          "comp_04_", "comp_05_legendary_", "comp_05_"]:
                                if clean_name.lower().startswith(prefix):
                                    clean_name = clean_name[len(prefix):]
                                    break

                            clean_name = clean_name.replace("_", " ").strip().title()
                            if not clean_name:
                                clean_name = dep_key

                            # Rarity from comp pattern
                            rarity = None
                            if "comp_01" in key_lower:
                                rarity = "Common"
                            elif "comp_02" in key_lower:
                                rarity = "Uncommon"
                            elif "comp_03" in key_lower:
                                rarity = "Rare"
                            elif "comp_04" in key_lower:
                                rarity = "Epic"
                            elif "comp_05" in key_lower or "legendary" in key_lower:
                                rarity = "Legendary"

                            entry = {
                                "code": code,
                                "partName": clean_name,
                                "itemType": clean_name,
                                "category": type_info["category"],
                                "partType": part_type,
                                "manufacturer": type_info["manufacturer"],
                                "parentType": type_info["name"],
                                "parentTypeId": idx,
                            }
                            if rarity:
                                entry["rarity"] = rarity

                            entries.append(entry)
                            type_part_counts[idx] = type_part_counts.get(idx, 0) + 1

print(f"Extracted {len(entries)} NPC parts")

# ── Summary by category ───────────────────────────────────────────────────────

cats = {}
for e in entries:
    c = e["category"]
    if c not in cats:
        cats[c] = 0
    cats[c] += 1

print("\nParts by category:")
for c, count in sorted(cats.items(), key=lambda x: -x[1]):
    print(f"  {c}: {count}")

print("\nParts by parent type:")
for tid in sorted(type_part_counts.keys(), key=lambda x: int(x)):
    count = type_part_counts[tid]
    info = NPC_TYPES[int(tid)]
    if count > 0:
        print(f"  {tid} ({info['name']}): {count} parts")

# ── Write output ──────────────────────────────────────────────────────────────

db_out = {
    "generated_at_utc": datetime.utcnow().isoformat() + "Z",
    "source": "extract_npc_db.py (NCS inv4.json Cowbell DLC)",
    "description": "NPC weapons, turrets, terminals, hover drives, gunship parts — NOT in the main universal DB",
    "rows": entries,
}

OUTPUT.write_text(json.dumps(db_out, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\nWrote {len(entries)} entries to {OUTPUT}")
