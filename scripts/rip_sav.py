#!/usr/bin/env python3
"""
rip_sav.py — Extract and decode ALL item codes from a BL4 .sav file.

Usage:
    python scripts/rip_sav.py <save_file.sav> <user_id> [--json] [--raw]

    <save_file.sav>  Path to the encrypted .sav file
    <user_id>        Epic username or Steam ID (numeric)
    --json           Output as JSON array (default: one item per line)
    --raw            Include raw Base85 serials alongside decoded strings
    --csv            Output as CSV (serial,decoded,typeId,level,manufacturer,itemType)

Example:
    python scripts/rip_sav.py testing/14.sav "MyEpicUsername"
    python scripts/rip_sav.py testing/14.sav 76561198012345678 --json
    python scripts/rip_sav.py testing/14.sav "MyEpicUsername" --csv > items.csv
"""
import sys
import os
import json
import struct
import zlib
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    import yaml
    from yaml.nodes import MappingNode, SequenceNode, ScalarNode
    import serial_codec
    import item_registry
except ImportError as e:
    print(f"Import error: {e}", file=sys.stderr)
    print("Run from repo root: python scripts/rip_sav.py ...", file=sys.stderr)
    sys.exit(1)

# ── AES keys (matches saveCrypto.ts) ──

PUBLIC_KEY = bytes([
    0x35, 0xec, 0x33, 0x77, 0xf3, 0x5d, 0xb0, 0xea,
    0xbe, 0x6b, 0x83, 0x11, 0x54, 0x03, 0xeb, 0xfb,
    0x27, 0x25, 0x64, 0x2e, 0xd5, 0x49, 0x06, 0x29,
    0x05, 0x78, 0xbd, 0x60, 0xba, 0x4a, 0xa7, 0x87,
])

def key_epic(uid: str) -> bytes:
    s = uid.strip()
    utf16le = s.encode('utf-16-le')
    k = bytearray(PUBLIC_KEY)
    n = min(len(utf16le), len(k))
    for i in range(n):
        k[i] ^= utf16le[i]
    return bytes(k)

def key_steam(uid: str) -> bytes:
    digits = ''.join(c for c in uid if c.isdigit())
    sid = int(digits) if digits else 0
    sid_bytes = sid.to_bytes(8, 'little')
    k = bytearray(PUBLIC_KEY)
    for i in range(8):
        k[i % len(k)] ^= sid_bytes[i]
    return bytes(k)

def strip_pkcs7(data: bytes) -> bytes:
    if not data:
        return data
    n = data[-1]
    if n < 1 or n > 16:
        return data
    if all(b == n for b in data[-n:]):
        return data[:-n]
    return data

def try_decrypt(enc: bytes, key: bytes) -> bytes:
    """Decrypt AES-256-ECB, strip PKCS7, decompress zlib."""
    cipher = Cipher(algorithms.AES(key), modes.ECB())
    decryptor = cipher.decryptor()
    dec = decryptor.update(enc) + decryptor.finalize()
    unp = strip_pkcs7(dec)
    if len(unp) < 8:
        raise ValueError("Data too short after unpadding")
    # Try full buffer first (no-trailer format)
    try:
        return zlib.decompress(unp)
    except zlib.error:
        pass
    # Try without last 8 bytes (trailer format)
    trailer = unp[-8:]
    payload = unp[:-8]
    plain = zlib.decompress(payload)
    expected_len = struct.unpack_from('<I', trailer, 4)[0]
    if len(plain) != expected_len:
        raise ValueError(f"Length mismatch: got {len(plain)}, expected {expected_len}")
    return plain

def decrypt_sav(filepath: str, user_id: str) -> str:
    """Decrypt a .sav file and return the YAML string."""
    with open(filepath, 'rb') as f:
        enc = f.read()
    uid = user_id.strip()
    looks_steam = uid.isdigit() and 10 <= len(uid) <= 20
    keys = [(key_steam(uid), "steam"), (key_epic(uid), "epic")] if looks_steam else [(key_epic(uid), "epic"), (key_steam(uid), "steam")]
    last_err = None
    for key, platform in keys:
        try:
            plain = try_decrypt(enc, key)
            print(f"[OK] Decrypted as {platform} (size: {len(plain):,} bytes)", file=sys.stderr)
            return plain.decode('utf-8')
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Decrypt failed — check your User ID. Last error: {last_err}")

# ── Item extraction ──

def walk_for_serials(node, path=None):
    """Recursively find all nodes with a 'serial' key starting with @U."""
    if path is None:
        path = []
    found = []
    if isinstance(node, dict):
        if 'serial' in node and isinstance(node['serial'], str) and node['serial'].startswith('@U'):
            found.append((path, node))
        else:
            for k, v in node.items():
                found.extend(walk_for_serials(v, path + [str(k)]))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found.extend(walk_for_serials(v, path + [str(i)]))
    return found

def decode_item(serial: str) -> dict:
    """Decode a single Base85 serial into structured item data."""
    result = {"serial": serial}
    try:
        formatted_str, _, err = serial_codec.decode_serial_to_string(serial.strip())
        if err:
            result["error"] = str(err)
            return result
    except Exception as e:
        result["error"] = str(e)
        return result

    result["decoded"] = formatted_str
    if "||" not in formatted_str:
        return result

    header_part, parts_part = formatted_str.split("||", 1)
    result["parts"] = parts_part.strip()
    try:
        id_section = header_part.strip().split('|')[0]
        id_parts = [p.strip() for p in id_section.split(',')]
        if len(id_parts) >= 4:
            result["typeId"] = int(id_parts[0])
            result["level"] = int(id_parts[3])
            mfg, item_type, found = item_registry.get_kind_enums(result["typeId"])
            if found:
                result["manufacturer"] = mfg
                result["itemType"] = item_type
            else:
                result["manufacturer"] = "Unknown"
                result["itemType"] = "Unknown"
    except (ValueError, IndexError):
        pass
    return result

def get_container_name(path):
    """Derive a container name from the YAML path."""
    for p in path:
        lp = p.lower()
        if 'backpack' in lp or 'inventory' in lp:
            return 'Backpack'
        if 'equipped' in lp or 'loadout' in lp:
            return 'Equipped'
        if 'bank' in lp:
            return 'Bank'
    return '/'.join(path[:3]) if path else 'Unknown'

# ── Main ──

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    sav_path = sys.argv[1]
    user_id = sys.argv[2]
    flags = set(sys.argv[3:])
    output_json = '--json' in flags
    output_csv = '--csv' in flags
    include_raw = '--raw' in flags

    if not os.path.isfile(sav_path):
        print(f"File not found: {sav_path}", file=sys.stderr)
        sys.exit(1)

    # Decrypt
    yaml_text = decrypt_sav(sav_path, user_id)

    # Parse YAML (with custom loader that handles !tags and other unknown tags)
    class IgnoreUnknownTagLoader(yaml.SafeLoader):
        pass
    def _ignore_unknown_tag(loader, tag_suffix, node):
        if isinstance(node, MappingNode):
            return loader.construct_mapping(node)
        if isinstance(node, SequenceNode):
            return loader.construct_sequence(node)
        if isinstance(node, ScalarNode):
            return loader.construct_scalar(node)
        return loader.construct_object(node)
    IgnoreUnknownTagLoader.add_multi_constructor('', _ignore_unknown_tag)

    try:
        yaml_data = yaml.load(yaml_text, Loader=IgnoreUnknownTagLoader)
    except Exception as e:
        print(f"YAML parse error: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(yaml_data, dict):
        print("YAML root is not a dict", file=sys.stderr)
        sys.exit(1)

    # Extract character info
    state = yaml_data.get('state', yaml_data)
    char_name = state.get('char_name', 'Unknown')
    char_class = state.get('class', 'Unknown')
    print(f"[INFO] Character: {char_name} ({char_class})", file=sys.stderr)

    # Find all serials
    discovered = walk_for_serials(yaml_data)
    # Filter out unknown_items
    discovered = [(p, n) for p, n in discovered if 'unknown_items' not in p]

    print(f"[INFO] Found {len(discovered)} items", file=sys.stderr)

    # Decode all items
    items = []
    errors = 0
    for path, node in discovered:
        serial = node['serial']
        item = decode_item(serial)
        item['container'] = get_container_name(path)
        if 'error' in item:
            errors += 1
        items.append(item)

    if errors:
        print(f"[WARN] {errors} items failed to decode", file=sys.stderr)

    # Output
    if output_json:
        print(json.dumps(items, indent=2, ensure_ascii=False))
    elif output_csv:
        print("serial,decoded,typeId,level,manufacturer,itemType,container")
        for item in items:
            if 'error' in item:
                continue
            serial = item.get('serial', '').replace('"', '""')
            decoded = item.get('decoded', '').replace('"', '""')
            tid = item.get('typeId', '')
            lvl = item.get('level', '')
            mfg = item.get('manufacturer', '')
            itype = item.get('itemType', '')
            container = item.get('container', '')
            print(f'"{serial}","{decoded}",{tid},{lvl},"{mfg}","{itype}","{container}"')
    else:
        # Human-readable output
        for i, item in enumerate(items, 1):
            if 'error' in item:
                print(f"\n--- Item {i} [{item['container']}] ERROR: {item['error']}")
                print(f"    Serial: {item['serial'][:60]}...")
                continue
            tid = item.get('typeId', '?')
            lvl = item.get('level', '?')
            mfg = item.get('manufacturer', '?')
            itype = item.get('itemType', '?')
            container = item.get('container', '?')
            print(f"\n--- Item {i} [{container}] {mfg} {itype} (Type:{tid}, Lv:{lvl})")
            print(f"    Decoded: {item.get('decoded', 'N/A')}")
            if include_raw:
                print(f"    Serial:  {item['serial']}")

    # Summary
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Total: {len(items)} items ({len(items) - errors} decoded, {errors} errors)", file=sys.stderr)
    if items:
        types = {}
        for item in items:
            t = item.get('itemType', 'Unknown')
            types[t] = types.get(t, 0) + 1
        print("Breakdown:", file=sys.stderr)
        for t, count in sorted(types.items(), key=lambda x: -x[1]):
            print(f"  {t}: {count}", file=sys.stderr)

if __name__ == "__main__":
    main()
