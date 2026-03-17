"""
Extract the embedded game data from the Borderlands Item Editor HTML
(EMBEDDED_GAME_DATA_BASE64), decode and decompress it, then export all parts to CSV.

Run from project root:
  python -m tools.export_embedded_parts_to_csv

Input: reference htmls/Borderlands Item Editor and Save Editor.html
Output: reference htmls/embedded_parts_export.csv (or path via -o)
"""

import base64
import csv
import gzip
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Default paths (from project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HTML = PROJECT_ROOT / "reference htmls" / "Borderlands Item Editor and Save Editor.html"
DEFAULT_CSV = PROJECT_ROOT / "reference htmls" / "embedded_parts_export.csv"

CSV_COLUMNS = [
    "typeId", "partId", "fullId", "name", "spawn_code", "stats", "effects", "description",
    "partType", "category", "path", "manufacturer", "weaponType", "context",
    "legendaryName", "perkName", "rarity", "model_name", "string",
]


def normalize_part_id(part_id: Any, type_id: Optional[int]) -> str:
    if part_id is None:
        return ""
    id_str = str(part_id)
    if ":" in id_str:
        return id_str
    if type_id is not None:
        return f"{type_id}:{id_str}"
    return id_str


def extract_part_info(
    part: Dict[str, Any],
    type_id: int,
    part_type: str,
    category: str,
    manufacturer: Optional[str],
    weapon_type: Optional[str],
    context: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not part or not isinstance(part, dict):
        return None
    raw_id = part.get("id")
    if raw_id is None:
        return None
    part_id = str(raw_id)
    full_id = part_id if ":" in part_id else normalize_part_id(raw_id, type_id)
    actual_type_id = type_id
    if ":" in part_id:
        try:
            actual_type_id = int(part_id.split(":")[0])
        except ValueError:
            pass
    name = (
        part.get("name")
        or part.get("model_name")
        or part.get("spawn_code")
        or part.get("legendary_name")
        or part.get("rarity")
        or part_id
    )
    spawn_code = str(part.get("spawn_code") or part.get("code") or part.get("string") or "")
    return {
        "typeId": actual_type_id,
        "partId": part_id,
        "fullId": full_id,
        "name": name,
        "spawn_code": spawn_code,
        "stats": part.get("stats") or "",
        "effects": part.get("effects") or "",
        "description": part.get("description") or "",
        "partType": part_type or "",
        "category": category or "",
        "path": "",
        "manufacturer": manufacturer or "",
        "weaponType": weapon_type or "",
        "context": context or "",
        "legendaryName": part.get("legendary_name") or "",
        "perkName": part.get("perk_name") or "",
        "rarity": part.get("rarity") or "",
        "model_name": part.get("model_name") or "",
        "string": part.get("string") or "",
    }


def extract_from_rarities(
    rarities_data: Dict[str, Any],
    current_type_id: int,
    manufacturer: str,
    weapon_type: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for rarity_key, rarity_data in rarities_data.items():
        if not isinstance(rarity_data, dict):
            continue
        if rarity_data.get("parts") and isinstance(rarity_data["parts"], list):
            for part in rarity_data["parts"]:
                info = extract_part_info(
                    part, current_type_id, rarity_key, "Weapon", manufacturer, weapon_type, weapon_type
                )
                if info:
                    info["path"] = f"Rarities.{rarity_key}"
                    out.append(info)
        if rarity_data.get("part_types"):
            out.extend(
                extract_from_rarities(
                    rarity_data["part_types"], current_type_id, manufacturer, weapon_type
                )
            )
    return out


def extract_parts_recursive(
    part_types: Dict[str, Any],
    current_type_id: int,
    path_prefix: str,
    manufacturer: str,
    weapon_type: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for part_type_key, part_type_data in part_types.items():
        if not isinstance(part_type_data, dict):
            continue
        current_path = f"{path_prefix}.{part_type_key}" if path_prefix else part_type_key
        if part_type_data.get("parts") and isinstance(part_type_data["parts"], list):
            for part in part_type_data["parts"]:
                info = extract_part_info(
                    part, current_type_id, part_type_key, "Weapon", manufacturer, weapon_type, weapon_type
                )
                if info:
                    info["path"] = current_path
                    if ":" in info["fullId"]:
                        try:
                            info["typeId"] = int(info["fullId"].split(":")[0])
                        except ValueError:
                            pass
                    out.append(info)
        if part_type_data.get("part_types"):
            out.extend(
                extract_parts_recursive(
                    part_type_data["part_types"],
                    current_type_id,
                    current_path,
                    manufacturer,
                    weapon_type,
                )
            )
        if part_type_key in ("Rarity", "Rarities") and isinstance(part_type_data.get("part_types"), dict):
            for nested_key, nested_data in part_type_data.get("part_types", {}).items():
                if nested_key in ("dlc", "count"):
                    continue
                if isinstance(nested_data, dict) and nested_data.get("parts") and isinstance(nested_data["parts"], list):
                    for part in nested_data["parts"]:
                        info = extract_part_info(
                            part, current_type_id, part_type_key, "Weapon", manufacturer, weapon_type, weapon_type
                        )
                        if info:
                            info["path"] = f"{current_path}.{nested_key}"
                            if ":" in info["fullId"]:
                                try:
                                    info["typeId"] = int(info["fullId"].split(":")[0])
                                except ValueError:
                                    pass
                            out.append(info)
    return out


def collect_all_parts(game_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen: set = set()

    def add(row: Dict[str, Any]) -> None:
        key = (row["typeId"], row["fullId"], row.get("path", ""), row.get("spawn_code", ""))
        if key in seen:
            return
        seen.add(key)
        rows.append(row)

    # Perk (typeId 234)
    perk_section = game_data.get("Perk") or game_data.get("perk")
    if perk_section and isinstance(perk_section.get("parts"), list):
        type_id = 234
        for idx, part in enumerate(perk_section["parts"]):
            part_id = part.get("id")
            if part_id is None and (part.get("spawn_code") or part.get("id")) is None:
                continue
            pid_str = str(part_id) if part_id is not None else ""
            if pid_str and ":" not in pid_str:
                part = {**part, "id": f"234:{pid_str}"}
            info = extract_part_info(part, type_id, "Perk", "Class Mod", None, None, None)
            if info:
                info["typeId"] = 234
                info["partType"] = "Perk"
                info["path"] = "Perk"
                if ":" not in info["fullId"] and info["partId"]:
                    info["fullId"] = f"234:{info['partId']}"
                add(info)

    # Firmware (typeId 234)
    firmware_section = game_data.get("Firmware") or game_data.get("firmware")
    if not firmware_section and game_data.get("class_mods"):
        firmware_section = game_data["class_mods"].get("Firmware") or game_data["class_mods"].get("firmware")
    if firmware_section and isinstance(firmware_section.get("parts"), list):
        type_id = 234
        for part in firmware_section["parts"]:
            if part.get("id") is None:
                continue
            info = extract_part_info(part, type_id, "Firmware", "Class Mod", None, None, None)
            if info:
                info["typeId"] = 234
                info["partType"] = "Firmware"
                info["path"] = "Firmware"
                if ":" not in info["fullId"] and info["partId"]:
                    info["fullId"] = f"234:{info['partId']}"
                add(info)

    # Weapons
    weapons = game_data.get("weapons") or {}
    manufacturers = weapons.get("manufacturers") or {}
    for manufacturer_name, data in manufacturers.items():
        if not isinstance(data, dict):
            continue
        weapon_types = data.get("weapon_types") or {}
        for weapon_type_name, weapon_data in weapon_types.items():
            if not isinstance(weapon_data, dict):
                continue
            type_id = weapon_data.get("type_id")
            if not type_id:
                continue
            if weapon_data.get("Rarities"):
                for r in extract_from_rarities(
                    weapon_data["Rarities"], type_id, manufacturer_name, weapon_type_name
                ):
                    add(r)
            if weapon_data.get("part_types"):
                for r in extract_parts_recursive(
                    weapon_data["part_types"],
                    type_id,
                    "",
                    manufacturer_name,
                    weapon_type_name,
                ):
                    add(r)

    # Elements (typeId 1)
    elements = game_data.get("elements") or {}
    for section_name, section in [("primary", elements.get("primary")), ("maliwan_secondary", elements.get("maliwan_secondary"))]:
        if not section or not isinstance(section.get("parts"), list):
            continue
        mfg = "Maliwan" if "maliwan" in section_name else ""
        path_val = f"elements.{section_name}"
        for part in section["parts"]:
            element_id = part.get("id") or part.get("part_id")
            if element_id is not None and ":" not in str(element_id):
                part = {**part, "id": f"1:{element_id}"}
            part = {**part, "name": part.get("name") or part.get("element_name")}
            info = extract_part_info(part, 1, "Element", "Weapon", mfg, None, None)
            if info:
                info["typeId"] = 1
                info["partType"] = "Element"
                info["path"] = path_val
                info["manufacturer"] = mfg
                if ":" not in info["fullId"] and info["partId"]:
                    info["fullId"] = f"1:{info['partId']}"
                add(info)

    # Heavy weapons (if structure mirrors weapons)
    heavy = game_data.get("heavy_weapons") or {}
    if isinstance(heavy, dict):
        for manuf, data in heavy.items():
            if not isinstance(data, dict):
                continue
            wtypes = data.get("weapon_types") or {}
            for wtype_name, wdata in wtypes.items():
                if not isinstance(wdata, dict):
                    continue
                tid = wdata.get("type_id")
                if not tid:
                    continue
                if wdata.get("Rarities"):
                    for r in extract_from_rarities(wdata["Rarities"], tid, manuf, wtype_name):
                        add(r)
                if wdata.get("part_types"):
                    for r in extract_parts_recursive(wdata["part_types"], tid, "", manuf, wtype_name):
                        add(r)

    # Gadgets: shields, repkits, enhancements, ordonances (grenades, heavy_weapons)
    gadgets = game_data.get("gadgets") or {}
    for subsection_name, subsection in gadgets.items():
        if not isinstance(subsection, dict):
            continue
        # Nested: ordonances.grenades, ordonances.heavy_weapons
        if subsection_name == "ordonances":
            for nest_name, nest in [("grenades", subsection.get("grenades")), ("heavy_weapons", subsection.get("heavy_weapons"))]:
                if not nest or not isinstance(nest.get("manufacturers"), dict):
                    continue
                for manuf, data in nest["manufacturers"].items():
                    if not isinstance(data, dict):
                        continue
                    tid = data.get("type_id")
                    if not tid:
                        if data.get("part_types"):
                            for _r in extract_parts_recursive(data["part_types"], 0, "", manuf, nest_name):
                                if _r.get("fullId") and ":" in _r["fullId"]:
                                    tid = int(_r["fullId"].split(":")[0])
                                    break
                    if tid:
                        if data.get("Rarities"):
                            for r in extract_from_rarities(data["Rarities"], tid, manuf, nest_name):
                                r["category"] = "Grenades" if nest_name == "grenades" else "Heavy"
                                add(r)
                        if data.get("part_types"):
                            for r in extract_parts_recursive(data["part_types"], tid, "", manuf, nest_name):
                                r["category"] = "Grenades" if nest_name == "grenades" else "Heavy"
                                add(r)
            continue
        manufacturers_to_process = subsection.get("manufacturers")
        if not manufacturers_to_process:
            continue
        category = subsection_name.capitalize()
        for manuf, data in manufacturers_to_process.items():
            if not isinstance(data, dict):
                continue
            tid = data.get("type_id")
            if not tid and data.get("part_types"):
                for _r in extract_parts_recursive(data["part_types"], 0, "", manuf, subsection_name):
                    if _r.get("fullId") and ":" in _r["fullId"]:
                        try:
                            tid = int(_r["fullId"].split(":")[0])
                            break
                        except ValueError:
                            pass
            if not tid:
                continue
            if data.get("Rarities"):
                for r in extract_from_rarities(data["Rarities"], tid, manuf, subsection_name):
                    r["category"] = category
                    add(r)
            if data.get("part_types"):
                for r in extract_parts_recursive(data["part_types"], tid, "", manuf, subsection_name):
                    r["category"] = category
                    add(r)

    return rows


def main() -> None:
    html_path = DEFAULT_HTML
    csv_path = DEFAULT_CSV
    if len(sys.argv) > 1 and sys.argv[1] == "-o" and len(sys.argv) > 2:
        csv_path = Path(sys.argv[2])
    elif len(sys.argv) > 1:
        html_path = Path(sys.argv[1])
    if not html_path.exists():
        print(f"Error: HTML file not found: {html_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {html_path} ...")
    html_content = html_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'EMBEDDED_GAME_DATA_BASE64\s*=\s*"([^"]*)"', html_content)
    if not m:
        print("Error: EMBEDDED_GAME_DATA_BASE64 not found in HTML.", file=sys.stderr)
        sys.exit(1)
    b64 = m.group(1).strip()
    if not b64:
        print("Error: Embedded data string is empty.", file=sys.stderr)
        sys.exit(1)

    print("Decoding base64 and decompressing gzip ...")
    try:
        compressed = base64.b64decode(b64)
    except Exception as e:
        print(f"Error: Base64 decode failed: {e}", file=sys.stderr)
        sys.exit(1)
    try:
        raw_json = gzip.decompress(compressed).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Error: Gzip decompress failed: {e}", file=sys.stderr)
        sys.exit(1)
    try:
        game_data = json.loads(raw_json)
    except Exception as e:
        print(f"Error: JSON parse failed: {e}", file=sys.stderr)
        sys.exit(1)

    print("Collecting all parts ...")
    rows = collect_all_parts(game_data)
    print(f"Collected {len(rows)} part rows.")

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: ("" if v is None else str(v)) for k, v in row.items()})
    print(f"Wrote {csv_path}")


if __name__ == "__main__":
    main()
