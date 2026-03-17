# BL4 Save File Encryption / Decryption (Desktop Reference)

This document describes the algorithm used by the desktop Save Editor so the web app can implement the same logic in-browser (no PC required).

## Overview

- **Algorithm**: AES-256-ECB
- **Key derivation**: 32-byte public key XOR'd with user-ID-derived bytes (Epic vs Steam differ)
- **Payload**: UTF-8 YAML → zlib compress (level 9) → 8-byte trailer → PKCS7 pad to 16 bytes → AES encrypt

## Constants

```text
PUBLIC_KEY = 32 bytes (hex):
35 EC 33 77 F3 5D B0 EA BE 6B 83 11 54 03 EB FB
27 25 64 2E D5 49 06 29 05 78 BD 60 BA 4A A7 87
```

## Key derivation

### Epic Games ID

- User ID string (strip) encoded as **UTF-16 little-endian**
- XOR with `PUBLIC_KEY` (first min(32, len(utf16le_bytes)) bytes)
- Result is 32-byte AES key

### Steam ID

- Extract digits from user ID string; parse as integer
- Convert to 8 bytes **little-endian** (unsigned)
- XOR these 8 bytes cyclically into `PUBLIC_KEY`: `key[i % 32] ^= steam_id_bytes[i % 8]`
- Result is 32-byte AES key

## Decrypt

1. Try **Epic** key first, then **Steam** if Epic fails (same ciphertext, different key/trailer endianness).
2. **AES-256-ECB** decrypt (raw ciphertext).
3. **Strip PKCS7**: last byte `n` (1–16); if last `n` bytes all equal `n`, remove them.
4. Payload = uncompressed block + **8-byte trailer** (last 8 bytes):
   - **Epic**: trailer = `checksum (4 bytes big-endian)` + `length (4 bytes little-endian)`
   - **Steam**: trailer = `checksum (4 bytes little-endian)` + `length (4 bytes little-endian)`
5. **Checksum**: Adler-32 of the **plain YAML bytes** (before compression). Stored in trailer; can be used to verify (desktop sometimes skips strict check).
6. **Length**: plain YAML byte length (4 bytes little-endian).
7. **Zlib**: decompress `payload[:-8]` (everything before the trailer). Result is UTF-8 YAML string.

## Encrypt

1. **YAML** string as UTF-8 bytes.
2. **Trailer**: `adler32(plain_yaml_bytes)` (4 bytes; Epic = big-endian, Steam = little-endian) + `len(plain_yaml_bytes)` (4 bytes little-endian).
3. **Compress**: `zlib.compress(yaml_bytes, 9)`.
4. **Concat**: compressed + trailer.
5. **Pad**: PKCS7 to 16-byte block size.
6. **AES-256-ECB** encrypt with same key (Epic or Steam) used for decrypt.

## User ID validation (desktop)

- **Steam**: digits only, length 10–20 (typically 17).
- **Epic**: alphanumeric plus `-` and `_`, length 10–50.

## Implementation notes for web

- **Browser**: Web Crypto API does **not** support AES-ECB. Use a small AES library (e.g. crypto-js with `mode.ECB`, `pad.Pkcs7`) and **pako** for zlib so decrypt/encrypt run entirely client-side (save never leaves device).
- **Round-trip:** Decrypt then encrypt exact raw YAML (no parse/stringify). Rebuilt file must load in-game. Debug: `web/scripts/roundtrip-verify.ts <path.sav> <userId>`.
- **Node**: Can use `crypto.createDecipheriv('aes-256-ecb', key, null)` (or empty Buffer) and `zlib.inflateRaw` / `zlib.deflateRaw`; note Python’s zlib uses standard zlib header by default, so use `zlib.inflate`/`zlib.deflate` (with header), not inflateRaw/deflateRaw. Verify against desktop: Python `zlib.compress` produces zlib-wrapped data, so Node `zlib.inflate` is correct.
