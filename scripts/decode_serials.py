#!/usr/bin/env python3
"""
Reads JSON from stdin: {"serials": ["@U...", ...]}
Outputs JSON to stdout: {"items": [{"serial", "decodedFull", "itemId", "level", "manufacturer", "itemType", "name"} | {"serial", "error": "..."}, ...]}
decodedFull = full deserialized/formatted string (header||parts). Uses serial_codec and item_registry from repo root.
"""
import json
import sys
from pathlib import Path

# Run from repo root so imports work
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    import serial_codec
    import item_registry
except ImportError as e:
    sys.stderr.write(f"Import error: {e}\n")
    sys.exit(1)


def decode_one(serial_b85: str) -> dict:
    out = {"serial": serial_b85}
    if not serial_b85 or not isinstance(serial_b85, str) or not serial_b85.strip().startswith("@U"):
        out["error"] = "Invalid serial (must start with @U)"
        return out
    formatted_str, _, err = serial_codec.decode_serial_to_string(serial_b85.strip())
    if err:
        out["error"] = str(err)
        return out
    if "||" not in formatted_str:
        out["error"] = "Decoded string has no ||"
        return out
    header_part, _ = formatted_str.split("||", 1)
    try:
        id_section = header_part.strip().split("|")[0]
        id_part = [p.strip() for p in id_section.split(",")]
        if len(id_part) < 4:
            out["error"] = "Header has fewer than 4 parts"
            return out
        item_id = int(id_part[0])
        item_level = int(id_part[3])
    except (ValueError, IndexError) as e:
        out["error"] = str(e)
        return out
    manufacturer, item_type, found = item_registry.get_kind_enums(item_id)
    if not found:
        manufacturer, item_type = "Unknown", "Unknown"
    out["itemId"] = item_id
    out["level"] = item_level
    out["manufacturer"] = manufacturer
    out["itemType"] = item_type
    out["name"] = f"{manufacturer} {item_type}"
    out["decodedFull"] = formatted_str
    return out


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"JSON error: {e}\n")
        sys.exit(1)
    serials = payload.get("serials")
    if not isinstance(serials, list):
        serials = []
    items = [decode_one(s) for s in serials]
    print(json.dumps({"items": items}, separators=(",", ":")))


if __name__ == "__main__":
    main()
