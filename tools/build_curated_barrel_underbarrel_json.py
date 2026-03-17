"""
Build web/public/data/visual_heavy_barrels.json, desirable_underbarrels.json,
and legendary_grenades.json from master_search/db/universal_parts_db.json. Run from project root:

  python -m tools.build_curated_barrel_underbarrel_json

You can then edit the JSON files manually to add/remove entries.
Legendary grenades = actual grenade types (gadget/firmware in part name), not perks or payload parts.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "master_search" / "db" / "universal_parts_db.json"
OUT_DIR = ROOT / "web" / "public" / "data"

# Heavy weapon prefixes (BL4)
HEAVY_PREFIXES = {282, 273, 275, 289, 26}
VISUAL_KEYWORDS = [
    "unique", "star helix", "disc jockey", "discjockey", "onslaught", "mantra", "ravenfire",
    "streamer", "jetsetter", "gamma", "bottled", "atling", "splatoon", "steelburner", "rainmaker",
    "javelin", "goremaster", "oscar mike", "hardpoint", "bugbear", "auspex", "razor", "supercell", "c-beam",
]
EXCLUDE_BARREL = ["potato", "queens rest", "noisy cricket", "kaleidosplode"]
# DESIRED underbarrels only (whitelist). Only these get into desirable_underbarrels.json.
# Must match one of these; everything else (tracker darts, tracker grenade, etc.) is excluded.
UNDERBARREL_ALLOWED_PATTERNS = re.compile(
    r"seamstress|needle\s*launcher|spread\s*launcher|beam\s*tosser|energy\s*disc|fragcendiary|"
    r"singularity|grenade\s*launcher|missile\s*launcher|micro\s*rocket|gravity\s*well|death\s*sphere|"
    r"airstrike|flame\s*thrower|flamethrower|underbarrel\s*launcher|rocket\s*launcher|frag\s*launcher|"
    r"gravity\s*harpoon|demolition\s*charge|proxy\s*mine|taser|tactical\s*knife|shotgun\s*alt|"
    r"micro\s*rocket\s*pod|element\s*switch|space\s*laser|star\s*helix\s*underbarrel",
    re.I,
)

# Ordered (pattern, partType) so we can assign one type per part/accessory for pairing.
# First match wins. partType is used to pair accessory -> part (e.g. taser accessory needs taser part).
UNDERBARREL_TYPE_PATTERNS = [
    (re.compile(r"\btaser\b", re.I), "taser"),
    (re.compile(r"micro\s*rocket|microrocket", re.I), "microrocket"),
    (re.compile(r"needle\s*launcher|seamstress", re.I), "needlelauncher"),
    (re.compile(r"spread\s*launcher|shotgun", re.I), "shotgun"),
    (re.compile(r"singularity", re.I), "singularity"),
    (re.compile(r"gravity\s*well", re.I), "gravitywell"),
    (re.compile(r"death\s*sphere", re.I), "deathsphere"),
    (re.compile(r"energy\s*disc", re.I), "energydisc"),
    (re.compile(r"beam\s*tosser", re.I), "beamtosser"),
    (re.compile(r"grenade\s*launcher|frag\s*launcher|fragcendiary|mirv|stun\s*grenade|bounce\s*grenade", re.I), "grenade"),
    (re.compile(r"missile\s*launcher|rocket\s*launcher", re.I), "rocketlauncher"),
    (re.compile(r"flame\s*thrower|flamethrower", re.I), "flamethrower"),
    (re.compile(r"airstrike", re.I), "airstrike"),
    (re.compile(r"gravity\s*harpoon", re.I), "gravityharpoon"),
    (re.compile(r"demolition\s*charge|proxy\s*mine", re.I), "democharge"),
    (re.compile(r"knife|meathook", re.I), "knife"),
    (re.compile(r"overcharge|multitaser", re.I), "taser"),
    (re.compile(r"element\s*switch|space\s*laser", re.I), "elementswitch"),
]


def infer_underbarrel_part_type(text: str) -> str | None:
    """Return first matching partType for pairing accessory to part, or None."""
    for pat, part_type in UNDERBARREL_TYPE_PATTERNS:
        if pat.search(text):
            return part_type
    return None


def norm(s: str) -> str:
    return (s or "").strip().lower()


def friendly_name(part_name: str, code: str) -> str:
    """Try to get a short display name, e.g. 'Onslaught' from 'part_barrel_01_onslaught'."""
    if not part_name:
        return code
    # Last segment after . (e.g. part_barrel_02_onslaught)
    base = part_name.split(".")[-1] if "." in part_name else part_name
    base = base.replace("_", " ").strip()
    # Drop leading "part barrel 01" / "part barrel 02" only if something meaningful remains
    for prefix in ("part barrel 01 ", "part barrel 02 ", "part barrel "):
        if norm(base).startswith(prefix):
            rest = base[len(prefix) :].strip()
            if rest and rest not in ("01", "02"):
                base = rest
            break
    # Title-case single words (e.g. BottledLightning -> Bottled Lightning already has caps)
    if len(base) > 55:
        base = base[:52] + "..."
    return base or code


def main() -> None:
    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}")
        return
    data = json.loads(DB_PATH.read_text(encoding="utf-8"))
    rows = data.get("rows", [])

    barrel_entries = []
    barrel_seen = set()
    for r in rows:
        code = (r.get("code") or "").strip()
        if not code or not code.startswith("{") or "}" not in code or code in barrel_seen:
            continue
        pt = norm(r.get("partType") or r.get("Part Type") or "")
        if "barrel" not in pt or "accessory" in pt:
            continue
        try:
            prefix = int(code.split(":")[0].strip("{"))
        except Exception:
            continue
        part_name = (r.get("partName") or r.get("String") or r.get("Model Name") or "").strip()
        name_lower = norm(part_name)
        if any(e in name_lower for e in EXCLUDE_BARREL):
            continue
        is_heavy = prefix in HEAVY_PREFIXES or "_hw." in name_lower or ".hw." in name_lower
        is_visual = any(k in name_lower for k in VISUAL_KEYWORDS)
        if not (is_heavy or is_visual):
            continue
        barrel_entries.append({"name": friendly_name(part_name, code), "code": code})
        barrel_seen.add(code)

    barrel_entries.sort(key=lambda x: x["name"].lower())

    # Underbarrel PARTS only (actual underbarrel part; no accessories).
    underbarrel_parts = []
    ub_part_seen = set()
    for r in rows:
        code = (r.get("code") or "").strip()
        if not code or not code.startswith("{") or "}" not in code or code in ub_part_seen:
            continue
        pt = norm(r.get("partType") or r.get("Part Type") or "")
        if "underbarrel" not in pt or "accessory" in pt:
            continue
        part_name = (r.get("partName") or r.get("String") or r.get("Model Name") or "").strip()
        desc = (
            r.get("itemType")
            or r.get("Item Type")
            or r.get("Stats")
            or r.get("Effects")
            or r.get("Stats (Level 50, Common)")
            or ""
        )
        desc = str(desc or "").strip()
        text = norm(part_name + " " + desc)
        if not UNDERBARREL_ALLOWED_PATTERNS.search(text):
            continue
        part_type = infer_underbarrel_part_type(text)
        underbarrel_parts.append({
            "name": friendly_name(part_name, code),
            "code": code,
            "partType": part_type or "",
        })
        ub_part_seen.add(code)

    # Underbarrel ACCESSORIES only (must be paired with matching part by partType).
    underbarrel_accessories = []
    ub_acc_seen = set()
    for r in rows:
        code = (r.get("code") or "").strip()
        if not code or not code.startswith("{") or "}" not in code or code in ub_acc_seen:
            continue
        pt = norm(r.get("partType") or r.get("Part Type") or "")
        if "underbarrel" not in pt or "accessory" not in pt:
            continue
        part_name = (r.get("partName") or r.get("String") or r.get("Model Name") or "").strip()
        desc = (
            r.get("itemType")
            or r.get("Item Type")
            or r.get("Stats")
            or r.get("Effects")
            or r.get("Stats (Level 50, Common)")
            or ""
        )
        desc = str(desc or "").strip()
        text = norm(part_name + " " + desc)
        if not UNDERBARREL_ALLOWED_PATTERNS.search(text):
            continue
        part_type = infer_underbarrel_part_type(text)
        if not part_type:
            continue  # only include accessories we can pair
        underbarrel_accessories.append({
            "name": friendly_name(part_name, code),
            "code": code,
            "partType": part_type,
        })
        ub_acc_seen.add(code)

    underbarrel_parts.sort(key=lambda x: (x.get("partType") or "", x["name"].lower()))
    underbarrel_accessories.sort(key=lambda x: (x.get("partType") or "", x["name"].lower()))

    out_underbarrels = {"parts": underbarrel_parts, "accessories": underbarrel_accessories}

    # Legendary grenades for the wrapper (code before/after 245:[...]). Only include entries that "say skin"
    # (e.g. "Can be used for skin", "Legendary - Gold skin") – those are the valid grenade type codes.
    # Exclude 245:1-20 firmware that don't say skin (they are not valid for this use).
    legendary_grenade_entries = []
    lg_seen = set()
    for r in rows:
        code = (r.get("code") or "").strip()
        if not code or not code.startswith("{") or "}" not in code or code in lg_seen:
            continue
        cat = norm(r.get("category") or r.get("Category") or "")
        if "grenade" not in cat:
            continue
        item_type = (r.get("itemType") or r.get("Item Type") or "").strip()
        effect = (r.get("effect") or r.get("Effect") or "").strip()
        desc = (r.get("description") or r.get("Stats") or "").strip()
        combined = norm(item_type + " " + effect + " " + desc)
        if "skin" not in combined:
            continue
        part_name = (r.get("partName") or r.get("String") or r.get("Model Name") or "").strip()
        name_lower = norm(part_name)
        # Must look like actual grenade (gadget firmware or comp_05_legendary), not payload/augment/status.
        if "grenade_gadget" not in name_lower and "comp_05_legendary" not in name_lower and "rarity" not in name_lower:
            continue
        pt = norm(r.get("partType") or r.get("Part Type") or "")
        if pt in ("augment", "status", "payload", "perk", "rarities"):
            continue
        display_name = item_type or effect or friendly_name(part_name, code)
        legendary_grenade_entries.append({"name": display_name, "code": code})
        lg_seen.add(code)

    legendary_grenade_entries.sort(key=lambda x: x["name"].lower())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "visual_heavy_barrels.json").write_text(
        json.dumps(barrel_entries, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "desirable_underbarrels.json").write_text(
        json.dumps(out_underbarrels, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "legendary_grenades.json").write_text(
        json.dumps(legendary_grenade_entries, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(barrel_entries)} entries to {OUT_DIR / 'visual_heavy_barrels.json'}")
    print(
        f"Wrote {len(underbarrel_parts)} parts + {len(underbarrel_accessories)} accessories to {OUT_DIR / 'desirable_underbarrels.json'}"
    )
    print(f"Wrote {len(legendary_grenade_entries)} entries to {OUT_DIR / 'legendary_grenades.json'}")


if __name__ == "__main__":
    main()
