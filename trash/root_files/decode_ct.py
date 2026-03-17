#!/usr/bin/env python3
"""
Decode content from a Cheat Table (.CT) file:
  - Decodes all <File Encoding="Ascii85"> entries. Cheat Engine uses a *custom* Base85 alphabet
    (see https://canaryleak.com/breaking-ce-encodefunction/); this script tries CE Base85 first,
    then standard Ascii85, then Z85.
  - Extracts decodeFunction("...") payloads. Those are: CE Base85 decode -> zlib decompress -> Lua bytecode.
  - Optionally decodes the payload (Base85 + zlib) and saves the result.

Usage:
  python decode_ct.py path/to/table.CT [--output-dir DIR] [--extract-decode-only]
"""

import argparse
import base64
import re
import sys
import zlib
from pathlib import Path
from xml.etree import ElementTree as ET

# Cheat Engine custom Base85 alphabet (LuaHandler.pas / BinToBase85)
# https://canaryleak.com/breaking-ce-encodefunction/
_CE_BASE85_ALPHABET = (
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "!#$%()*+,-./:;=?@[]^_{}"
)
_CE_BASE85_DECODE_MAP = {c: i for i, c in enumerate(_CE_BASE85_ALPHABET)}

# Z85 alphabet (ZeroMQ RFC 32)
_Z85_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#"
_Z85_DECODE_MAP = {c: i for i, c in enumerate(_Z85_ALPHABET)}


def decode_ce_base85(raw: str) -> bytes:
    """
    Decode Cheat Engine's custom Base85 (same as used for Encoding="Ascii85" and decodeFunction).
    Handles partial last block (CE writes a null terminator, so encoded length can be 5n - 0..3).
    """
    raw = "".join(raw.split())
    if not raw:
        raise ValueError("Empty CE Base85 string")
    out = []
    n = len(raw)
    i = 0
    while i + 5 <= n:
        chunk = raw[i : i + 5]
        value = 0
        for c in chunk:
            if c not in _CE_BASE85_DECODE_MAP:
                raise ValueError(f"Invalid CE Base85 character: {c!r}")
            value = value * 85 + _CE_BASE85_DECODE_MAP[c]
        out.append((value >> 24) & 0xFF)
        out.append((value >> 16) & 0xFF)
        out.append((value >> 8) & 0xFF)
        out.append(value & 0xFF)
        i += 5
    # Partial last block (CE overwrites last (4 - (BinBufSize mod 4)) mod 4 chars with null)
    r = n - i
    if r > 0:
        if r == 1:
            # 1 char -> 0 bytes (CE formula: size mod 5 == 1 -> no extra bytes)
            pass
        else:
            # 2 chars -> 1 byte, 3 chars -> 2 bytes, 4 chars -> 3 bytes
            chunk = raw[i:] + _CE_BASE85_ALPHABET[0] * (5 - r)
            value = 0
            for c in chunk:
                value = value * 85 + _CE_BASE85_DECODE_MAP[c]
            num_bytes = r - 1
            # Big-endian: first byte is value >> 24, etc.; take only the first num_bytes
            be_bytes = [
                (value >> 24) & 0xFF,
                (value >> 16) & 0xFF,
                (value >> 8) & 0xFF,
                value & 0xFF,
            ]
            out.extend(be_bytes[:num_bytes])
    return bytes(out)


def decode_z85(raw: str) -> bytes:
    """Decode Z85 (ZeroMQ Base85). Input length must be multiple of 5."""
    raw = "".join(raw.split())
    if len(raw) % 5 != 0:
        raise ValueError("Z85 input length must be a multiple of 5")
    out = []
    for i in range(0, len(raw), 5):
        chunk = raw[i : i + 5]
        value = 0
        for c in chunk:
            if c not in _Z85_DECODE_MAP:
                raise ValueError(f"Invalid Z85 character: {c!r}")
            value = value * 85 + _Z85_DECODE_MAP[c]
        out.append((value >> 24) & 0xFF)
        out.append((value >> 16) & 0xFF)
        out.append((value >> 8) & 0xFF)
        out.append(value & 0xFF)
    return bytes(out)


def decode_ascii85(raw: str) -> bytes:
    """Decode standard Ascii85 (no Adobe <~ ~>)."""
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty Ascii85 string")
    raw = "".join(raw.split())
    if raw.startswith("<~") and raw.endswith("~>"):
        return base64.a85decode(raw.encode("ascii"), adobe=True)
    return base64.a85decode(raw.encode("ascii"), adobe=False)


def decode_base85_content(raw: str) -> bytes:
    """Try CE Base85 first, then standard Ascii85, then Z85. Raises if all fail."""
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty content")
    raw = "".join(raw.split())
    errors = []
    try:
        return decode_ce_base85(raw)
    except Exception as e:
        errors.append(f"CE Base85: {e}")
    try:
        if raw.startswith("<~") and raw.endswith("~>"):
            return base64.a85decode(raw.encode("ascii"), adobe=True)
        return base64.a85decode(raw.encode("ascii"), adobe=False)
    except Exception as e:
        errors.append(f"Ascii85: {e}")
    try:
        return decode_z85(raw)
    except Exception as e:
        errors.append(f"Z85: {e}")
    raise ValueError("; ".join(errors))


def extract_files_from_ct(ct_path: Path) -> list[tuple[str, str, str]]:
    """Parse CT XML and return list of (name, encoding, content)."""
    tree = ET.parse(ct_path)
    root = tree.getroot()
    out = []
    files_el = root.find("Files")
    if files_el is None:
        return out
    for file_el in files_el.findall("File"):
        name = file_el.get("Name", "unknown")
        enc = (file_el.get("Encoding") or "").strip() or None
        content = (file_el.text or "").strip()
        if content:
            out.append((name, enc or "none", content))
    return out


def decode_function_payload(encoded: str) -> bytes:
    """
    Decode a decodeFunction(...) string: CE Base85 then zlib decompress.
    Returns Lua bytecode (binary). See canaryleak.com/breaking-ce-encodefunction/
    """
    raw = decode_ce_base85(encoded)
    return zlib.decompress(raw)


def extract_decode_function_payload(ct_path: Path) -> list[str]:
    """Extract the string argument(s) of decodeFunction("...") from the CT file."""
    text = ct_path.read_text(encoding="utf-8", errors="replace")
    # Match decodeFunction(" then capture until closing "); handle \" inside string
    pattern = re.compile(
        r'decodeFunction\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)',
        re.DOTALL,
    )
    return pattern.findall(text)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decode Ascii85-encoded files and extract decodeFunction payload from a .CT file."
    )
    parser.add_argument(
        "ct_file",
        type=Path,
        help="Path to the Cheat Table (.CT) file",
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        default=None,
        help="Directory for decoded files (default: <ct_file>_decoded next to the CT)",
    )
    parser.add_argument(
        "--extract-decode-only",
        action="store_true",
        help="Only extract decodeFunction payload(s) to a .txt file; do not decode Ascii85 files",
    )
    parser.add_argument(
        "--try-decode-payload",
        action="store_true",
        help="Try base64/Ascii85 on the decodeFunction payload and write results",
    )
    args = parser.parse_args()

    ct_path = args.ct_file
    if not ct_path.is_file():
        print(f"Error: not a file: {ct_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = args.output_dir
    if out_dir is None:
        out_dir = ct_path.parent / f"{ct_path.stem}_decoded"
    out_dir = out_dir.resolve()

    if not args.extract_decode_only:
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"Decoding Ascii85 files from: {ct_path}")
        print(f"Output directory: {out_dir}\n")

        files = extract_files_from_ct(ct_path)
        for name, encoding, content in files:
            if encoding and encoding.lower() != "ascii85":
                print(f"  Skip {name} (encoding={encoding})")
                continue
            try:
                decoded = decode_base85_content(content)
                out_path = out_dir / name
                out_path.write_bytes(decoded)
                print(f"  Decoded: {name} -> {out_path}")
            except Exception as e:
                print(f"  Error decoding {name}: {e}", file=sys.stderr)

    # Extract decodeFunction payload(s)
    payloads = extract_decode_function_payload(ct_path)
    if payloads:
        payload_file = out_dir / "decodeFunction_payload.txt"
        if args.extract_decode_only:
            payload_file = ct_path.parent / f"{ct_path.stem}_decodeFunction_payload.txt"
            payload_file.parent.mkdir(parents=True, exist_ok=True)
        with open(payload_file, "w", encoding="utf-8") as f:
            for i, p in enumerate(payloads):
                if len(payloads) > 1:
                    f.write(f"--- payload {i + 1} ---\n")
                f.write(p)
                f.write("\n")
        print(f"\nExtracted decodeFunction payload(s) -> {payload_file}")

        if args.try_decode_payload:
            for i, p in enumerate(payloads):
                prefix = f"payload_{i + 1}"
                # decodeFunction payload: CE Base85 then zlib (Lua bytecode)
                try:
                    decoded = decode_function_payload(p)
                    out_path = out_dir / f"{prefix}_decodeFunction.bin"
                    out_path.write_bytes(decoded)
                    print(f"  {prefix} decodeFunction (CE Base85+zlib) -> Lua bytecode: {out_path}")
                except Exception as e:
                    pass
                # Fallback: try generic Base85
                try:
                    decoded = decode_base85_content(p)
                    try:
                        text = decoded.decode("utf-8")
                        out_path = out_dir / f"{prefix}_b85_decoded.txt"
                        out_path.write_text(text, encoding="utf-8")
                        print(f"  {prefix} Base85 -> text: {out_path}")
                    except UnicodeDecodeError:
                        out_path = out_dir / f"{prefix}_b85_decoded.bin"
                        out_path.write_bytes(decoded)
                        print(f"  {prefix} Base85 -> binary: {out_path}")
                except Exception:
                    pass
                # Try standard base64
                try:
                    decoded = base64.b64decode(p.encode("ascii"))
                    try:
                        text = decoded.decode("utf-8")
                        out_path = out_dir / f"{prefix}_b64_decoded.txt"
                        out_path.write_text(text, encoding="utf-8")
                        print(f"  {prefix} Base64 -> text: {out_path}")
                    except UnicodeDecodeError:
                        out_path = out_dir / f"{prefix}_b64_decoded.bin"
                        out_path.write_bytes(decoded)
                        print(f"  {prefix} Base64 -> binary: {out_path}")
                except Exception:
                    pass
    else:
        print("\nNo decodeFunction(\"...\") payload found in the CT.")

    print("Done.")


if __name__ == "__main__":
    main()
