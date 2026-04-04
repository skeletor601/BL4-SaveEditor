"""
Find GEngine by scanning ALL data sections for a pointer that has a valid
GEngine chain. No UObjectArray, no FNamePool, no CE needed.

Approach: scan .data2, .rsrc, .srdata sections for any 8-byte value where:
  value + 0x1358 → valid ptr → +0x38 → valid ptr → deref → +0x30 → valid ptr
  → +0x398 → valid ptr → +0x880 → backpack with @U strings
"""

from bl4_scanner import (
    find_process, get_module_info, get_pe_sections,
    read_ptr, read_u32, read_mem, walk_chain
)
import struct
import time


def find_gengine_scan_sections(handle, base, size):
    """Scan data sections for a GEngine pointer."""
    print("\n[*] Scanning data sections for GEngine pointer...")
    start = time.time()

    sections = get_pe_sections(handle, base)

    # Sections to scan — skip .text (code), focus on data
    scan_sections = []
    for sec in sections:
        if sec['name'] in ['.data2', '.rsrc', '.srdata', '.rdata', '.data', '_RDATA']:
            scan_sections.append(sec)

    total_size = sum(s['virtual_size'] for s in scan_sections)
    print(f"  Sections to scan: {', '.join(s['name'] for s in scan_sections)}")
    print(f"  Total: {total_size // 1024 // 1024} MB")

    tested = 0
    tested_unique = set()

    for sec in scan_sections:
        sec_start = sec['va']
        sec_size = sec['virtual_size']
        sec_name = sec['name']

        # Cap at 16MB per section to keep it reasonable
        scan_size = min(sec_size, 0x1000000)
        print(f"\n  Scanning {sec_name} ({hex(sec_start)}, {scan_size // 1024}KB)...", end="", flush=True)

        chunk_size = 0x100000  # 1MB chunks
        offset = 0
        section_hits = 0

        while offset < scan_size:
            read_size = min(chunk_size, scan_size - offset)
            data = read_mem(handle, sec_start + offset, read_size)
            if not data:
                offset += chunk_size
                continue

            # Check every 8 bytes
            for i in range(0, len(data) - 8, 8):
                val = struct.unpack_from('<Q', data, i)[0]

                # Quick filter: must look like a valid heap pointer
                if val < 0x10000 or val > 0x7FFFFFFFFFFF:
                    continue
                # Skip module-range pointers (those are code/data, not heap objects)
                if base <= val < base + size:
                    continue
                # Skip already tested
                if val in tested_unique:
                    continue
                tested_unique.add(val)
                tested += 1

                # Quick chain test: val + 0x1358 → GameInstance?
                gi = read_ptr(handle, val + 0x1358)
                if not gi or gi < 0x10000:
                    continue

                # GameInstance + 0x38 → LocalPlayers?
                lp = read_ptr(handle, gi + 0x38)
                if not lp or lp < 0x10000:
                    continue

                # Deref → Player0
                p0 = read_ptr(handle, lp)
                if not p0 or p0 < 0x10000:
                    continue

                # +0x30 → PlayerController
                pc = read_ptr(handle, p0 + 0x30)
                if not pc or pc < 0x10000:
                    continue

                # +0x398 → PlayerState
                state = read_ptr(handle, pc + 0x398)
                if not state or state < 0x10000:
                    continue

                # +0x880 → Backpack data
                bp_data = read_ptr(handle, state + 0x880)
                bp_count = read_u32(handle, state + 0x888)
                bp_max_size = read_u32(handle, state + 0x924)
                if not bp_data or bp_data < 0x10000:
                    continue
                if bp_count is None or bp_count > 500:
                    continue

                # Strict sanity checks:
                # 1. Max backpack size (SDU) must be reasonable (10-100)
                if bp_max_size is None or bp_max_size < 10 or bp_max_size > 100:
                    continue
                # 2. Count can exceed max_size (from injection extending array) but not crazy high
                if bp_count > 500:
                    continue

                # Verify with @U serial if items exist
                verified = False
                if bp_count > 0:
                    str_ptr = read_ptr(handle, bp_data + 0xB8)
                    if str_ptr and str_ptr > 0x10000:
                        raw = read_mem(handle, str_ptr, 4)
                        if raw and raw[:2] == b'@U':
                            verified = True

                elapsed = time.time() - start
                loc_addr = sec_start + offset + i

                # For 0-item backpacks, only accept if max_size looks legitimate
                if bp_count == 0 and (bp_max_size < 10 or bp_max_size > 100):
                    continue

                print(f"\n\n  [+] FOUND GEngine: {hex(val)}")
                print(f"      Location: {sec_name}+{hex(offset + i)} ({hex(loc_addr)})")
                print(f"      Offset from base: {hex(loc_addr - base)}")
                print(f"      Backpack: {bp_count} items {'(verified @U)' if verified else ''}")
                print(f"      Tested {tested} unique pointers in {elapsed:.2f}s")
                return val

            offset += chunk_size
        print(f" ({tested} tested so far)", flush=True)

    elapsed = time.time() - start
    print(f"\n\n  [!] Not found. Tested {tested} unique pointers in {elapsed:.2f}s")
    return None


if __name__ == "__main__":
    print("=" * 60)
    print("  BL4 GEngine Auto-Finder (No CE Required)")
    print("=" * 60)

    pid, handle = find_process()
    if not handle:
        print("[!] Game not found!")
        input("Press Enter...")
        exit()

    base, size = get_module_info(pid)
    print(f"[+] PID: {pid}, Base: {hex(base)}")

    gengine = find_gengine_scan_sections(handle, base, size)

    if gengine:
        chain = walk_chain(handle, gengine)
        if chain:
            bp = chain.get('Backpack', {})
            print(f"\n{'='*60}")
            print(f"  SUCCESS! No Cheat Engine needed!")
            print(f"  GEngine = {hex(gengine)}")
            print(f"  Backpack: {bp.get('count', '?')}/{bp.get('max', '?')} items")
            print(f"{'='*60}")

            bp_data = bp.get('data')
            bp_count = bp.get('count', 0)
            if bp_data and bp_count > 0:
                print(f"\n  Inventory:")
                for i in range(min(5, bp_count)):
                    item_addr = bp_data + (i * 0x150)
                    str_ptr = read_ptr(handle, item_addr + 0xB8)
                    if str_ptr:
                        raw = read_mem(handle, str_ptr, 60)
                        if raw:
                            null = raw.find(b'\x00')
                            if null > 0:
                                print(f"    [{i}] {raw[:null].decode('utf-8', errors='replace')[:55]}...")
    else:
        print("\n[!] Auto-discovery failed. Are you in-game (not main menu)?")

    input("\nPress Enter to exit...")
