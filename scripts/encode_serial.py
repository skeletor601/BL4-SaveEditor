#!/usr/bin/env python3
"""
Reads JSON from stdin: {"decoded_string": "..."}
Outputs JSON to stdout: {"success": true, "serial": "..."} or {"success": false, "error": "..."}
Uses b_encoder.encode_to_base85 from repo root.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    import b_encoder
except ImportError as e:
    sys.stderr.write(f"Import error: {e}\n")
    sys.exit(1)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
        sys.exit(0)

    decoded = payload.get("decoded_string")
    if decoded is None:
        print(json.dumps({"success": False, "error": "decoded_string is required"}))
        sys.exit(0)
    if not isinstance(decoded, str):
        print(json.dumps({"success": False, "error": "decoded_string must be a string"}))
        sys.exit(0)

    decoded = decoded.strip()
    if not decoded:
        print(json.dumps({"success": False, "error": "decoded_string cannot be empty"}))
        sys.exit(0)

    new_level = payload.get("new_level")
    level_int = -1
    if new_level is not None:
        try:
            level_int = int(new_level)
        except (TypeError, ValueError):
            pass

    serial, err = b_encoder.encode_to_base85(decoded, new_level=level_int)
    if err:
        print(json.dumps({"success": False, "error": err}))
        sys.exit(0)
    print(json.dumps({"success": True, "serial": serial}))
    sys.exit(0)


if __name__ == "__main__":
    main()
