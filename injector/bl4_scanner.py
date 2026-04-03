"""
BL4 Memory Scanner — Finds GEngine and validates the pointer chain.
Pure Python, no Cheat Engine dependency. Uses Windows API via ctypes.

Based on memory structures from NHA's open-source Cheat Engine table:
https://github.com/dr-NHA/NHA_Borderlands4

How GEngine discovery works:
  1. Attach to Borderlands4.exe
  2. Find the main module base address + size
  3. Scan the .rdata section for the UTF-16 string "GEngine"
  4. Find code references (LEA instructions) that point near that string
  5. Those LEA instructions are near the GEngine global pointer
  6. Validate by walking the pointer chain to the backpack

Alternative approach if string scan fails:
  - AOB scan for known instruction patterns near GEngine access
"""

import ctypes
import ctypes.wintypes as wt
import struct
import sys
import os
import json
import time

# ── Windows API Setup ────────────────────────────────────────────────────────

kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)

PROCESS_ALL_ACCESS = 0x1F0FFF
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010
PROCESS_VM_WRITE = 0x0020
PROCESS_VM_OPERATION = 0x0008
TH32CS_SNAPPROCESS = 0x00000002
TH32CS_SNAPMODULE = 0x00000008
TH32CS_SNAPMODULE32 = 0x00000010
MEM_COMMIT = 0x1000
PAGE_READONLY = 0x02
PAGE_READWRITE = 0x04
PAGE_EXECUTE_READ = 0x20
PAGE_EXECUTE_READWRITE = 0x40

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ('dwSize', wt.DWORD),
        ('cntUsage', wt.DWORD),
        ('th32ProcessID', wt.DWORD),
        ('th32DefaultHeapID', ctypes.POINTER(ctypes.c_ulong)),
        ('th32ModuleID', wt.DWORD),
        ('cntThreads', wt.DWORD),
        ('th32ParentProcessID', wt.DWORD),
        ('pcPriClassBase', ctypes.c_long),
        ('dwFlags', wt.DWORD),
        ('szExeFile', ctypes.c_char * 260),
    ]

class MODULEENTRY32(ctypes.Structure):
    _fields_ = [
        ('dwSize', wt.DWORD),
        ('th32ModuleID', wt.DWORD),
        ('th32ProcessID', wt.DWORD),
        ('GlblcntUsage', wt.DWORD),
        ('ProccntUsage', wt.DWORD),
        ('modBaseAddr', ctypes.POINTER(ctypes.c_byte)),
        ('modBaseSize', wt.DWORD),
        ('hModule', wt.HMODULE),
        ('szModule', ctypes.c_char * 256),
        ('szExePath', ctypes.c_char * 260),
    ]

class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('BaseAddress', ctypes.c_void_p),
        ('AllocationBase', ctypes.c_void_p),
        ('AllocationProtect', wt.DWORD),
        ('RegionSize', ctypes.c_size_t),
        ('State', wt.DWORD),
        ('Protect', wt.DWORD),
        ('Type', wt.DWORD),
    ]

class IMAGE_DOS_HEADER(ctypes.Structure):
    _fields_ = [
        ('e_magic', ctypes.c_ushort),
        ('e_cblp', ctypes.c_ushort),
        ('e_cp', ctypes.c_ushort),
        ('e_crlc', ctypes.c_ushort),
        ('e_cparhdr', ctypes.c_ushort),
        ('e_minalloc', ctypes.c_ushort),
        ('e_maxalloc', ctypes.c_ushort),
        ('e_ss', ctypes.c_ushort),
        ('e_sp', ctypes.c_ushort),
        ('e_csum', ctypes.c_ushort),
        ('e_ip', ctypes.c_ushort),
        ('e_cs', ctypes.c_ushort),
        ('e_lfarlc', ctypes.c_ushort),
        ('e_ovno', ctypes.c_ushort),
        ('e_res', ctypes.c_ushort * 4),
        ('e_oemid', ctypes.c_ushort),
        ('e_oeminfo', ctypes.c_ushort),
        ('e_res2', ctypes.c_ushort * 10),
        ('e_lfanew', ctypes.c_long),
    ]

# ── Memory Helpers ───────────────────────────────────────────────────────────

def read_mem(handle, address, size):
    """Read bytes from process memory. Returns bytes or None."""
    buf = ctypes.create_string_buffer(size)
    bytes_read = ctypes.c_size_t(0)
    ok = kernel32.ReadProcessMemory(
        handle, ctypes.c_void_p(address), buf, size, ctypes.byref(bytes_read)
    )
    if not ok or bytes_read.value == 0:
        return None
    return buf.raw[:bytes_read.value]

def read_ptr(handle, address):
    """Read a 64-bit pointer."""
    data = read_mem(handle, address, 8)
    if not data or len(data) < 8:
        return None
    val = struct.unpack('<Q', data)[0]
    return val if val != 0 else None

def read_u32(handle, address):
    """Read a 32-bit unsigned int."""
    data = read_mem(handle, address, 4)
    if not data or len(data) < 4:
        return None
    return struct.unpack('<I', data)[0]

def read_i32(handle, address):
    """Read a 32-bit signed int."""
    data = read_mem(handle, address, 4)
    if not data or len(data) < 4:
        return None
    return struct.unpack('<i', data)[0]

def write_mem(handle, address, data):
    """Write bytes to process memory."""
    buf = ctypes.create_string_buffer(data)
    bytes_written = ctypes.c_size_t(0)
    ok = kernel32.WriteProcessMemory(
        handle, ctypes.c_void_p(address), buf, len(data), ctypes.byref(bytes_written)
    )
    return ok and bytes_written.value == len(data)

def alloc_mem(handle, size):
    """Allocate memory in the target process."""
    MEM_RESERVE = 0x2000
    kernel32.VirtualAllocEx.restype = ctypes.c_uint64
    addr = kernel32.VirtualAllocEx(
        handle, None, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE
    )
    return addr if addr else None

# ── Process Utilities ────────────────────────────────────────────────────────

def find_process(name="Borderlands4.exe"):
    """Find process by name. Returns (pid, handle) or (None, None)."""
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == ctypes.c_void_p(-1).value or snapshot == -1:
        return None, None
    pe = PROCESSENTRY32()
    pe.dwSize = ctypes.sizeof(PROCESSENTRY32)
    if not kernel32.Process32First(snapshot, ctypes.byref(pe)):
        kernel32.CloseHandle(snapshot)
        return None, None
    target = name.lower()
    while True:
        exe = pe.szExeFile.decode('utf-8', errors='ignore').lower()
        if target in exe:
            pid = pe.th32ProcessID
            kernel32.CloseHandle(snapshot)
            handle = kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
            if handle:
                return pid, handle
            return pid, None
        if not kernel32.Process32Next(snapshot, ctypes.byref(pe)):
            break
    kernel32.CloseHandle(snapshot)
    return None, None

def get_module_info(pid, module_name="Borderlands4.exe"):
    """Get module base address and size. Returns (base, size) or (None, None)."""
    snapshot = kernel32.CreateToolhelp32Snapshot(
        TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid
    )
    if snapshot == ctypes.c_void_p(-1).value or snapshot == -1:
        return None, None
    me = MODULEENTRY32()
    me.dwSize = ctypes.sizeof(MODULEENTRY32)
    if not kernel32.Module32First(snapshot, ctypes.byref(me)):
        kernel32.CloseHandle(snapshot)
        return None, None
    target = module_name.lower()
    while True:
        name = me.szModule.decode('utf-8', errors='ignore').lower()
        if target in name:
            base = ctypes.cast(me.modBaseAddr, ctypes.c_void_p).value
            size = me.modBaseSize
            kernel32.CloseHandle(snapshot)
            return base, size
        if not kernel32.Module32Next(snapshot, ctypes.byref(me)):
            break
    kernel32.CloseHandle(snapshot)
    return None, None

# ── PE Section Parser ────────────────────────────────────────────────────────

def get_pe_sections(handle, base):
    """Parse PE headers and return list of sections with name, VA, size."""
    # Read DOS header
    dos_data = read_mem(handle, base, 64)
    if not dos_data:
        return []
    e_lfanew = struct.unpack_from('<i', dos_data, 60)[0]

    # Read PE signature + file header
    pe_data = read_mem(handle, base + e_lfanew, 24)
    if not pe_data:
        return []
    sig = struct.unpack_from('<I', pe_data, 0)[0]
    if sig != 0x4550:  # "PE\0\0"
        return []

    num_sections = struct.unpack_from('<H', pe_data, 6)[0]
    size_of_optional = struct.unpack_from('<H', pe_data, 20)[0]

    # Section headers start after optional header
    section_start = base + e_lfanew + 24 + size_of_optional
    sections = []
    for i in range(num_sections):
        sec_data = read_mem(handle, section_start + i * 40, 40)
        if not sec_data:
            continue
        name = sec_data[:8].rstrip(b'\x00').decode('ascii', errors='replace')
        virtual_size = struct.unpack_from('<I', sec_data, 8)[0]
        virtual_addr = struct.unpack_from('<I', sec_data, 12)[0]
        raw_size = struct.unpack_from('<I', sec_data, 16)[0]
        characteristics = struct.unpack_from('<I', sec_data, 36)[0]
        sections.append({
            'name': name,
            'va': base + virtual_addr,
            'virtual_size': virtual_size,
            'raw_size': raw_size,
            'characteristics': characteristics,
        })
    return sections

# ── AOB Scanner ──────────────────────────────────────────────────────────────

def aob_scan(handle, start, size, pattern, max_results=10):
    """
    Scan memory for an AOB pattern. Pattern uses ?? for wildcards.
    Example: "48 8B 05 ?? ?? ?? ?? 48 85 C0"
    Returns list of addresses where the pattern was found.
    """
    parts = pattern.strip().split()
    pat_bytes = []
    mask = []
    for p in parts:
        if p == '??' or p == '?':
            pat_bytes.append(0)
            mask.append(False)
        else:
            pat_bytes.append(int(p, 16))
            mask.append(True)

    pat_len = len(pat_bytes)
    results = []
    chunk_size = 0x100000  # Read 1MB at a time
    offset = 0

    while offset < size and len(results) < max_results:
        read_size = min(chunk_size, size - offset)
        data = read_mem(handle, start + offset, read_size)
        if not data:
            offset += chunk_size
            continue

        # Search within this chunk
        for i in range(len(data) - pat_len + 1):
            found = True
            for j in range(pat_len):
                if mask[j] and data[i + j] != pat_bytes[j]:
                    found = False
                    break
            if found:
                results.append(start + offset + i)
                if len(results) >= max_results:
                    break
        offset += chunk_size - pat_len  # overlap by pattern length

    return results

# ── GEngine Discovery ───────────────────────────────────────────────────────

def find_gengine_via_aob(handle, base, size):
    """
    Find GEngine by scanning for known instruction patterns.

    In UE5, GEngine is accessed like:
        mov rax, [rip + OFFSET]    ; 48 8B 05 XX XX XX XX

    We scan the .text section for patterns near GEngine access.
    The NHA table tells us GEngine + 0x1358 → GameInstance.
    We look for `48 8B 05 ?? ?? ?? ??` followed by accesses using +0x1358.
    """
    sections = get_pe_sections(handle, base)
    text_section = None
    rdata_section = None

    for sec in sections:
        if sec['name'] == '.text':
            text_section = sec
        elif sec['name'] == '.rdata':
            rdata_section = sec

    if not text_section:
        print("[!] Could not find .text section")
        return None

    print(f"[*] Scanning .text section: {hex(text_section['va'])} ({text_section['virtual_size']} bytes)")

    # Strategy 1: Look for the GEngine access pattern
    # The game accesses GEngine with: mov reg, [GEngine]  then  mov reg, [reg+0x1358]
    # Pattern: 48 8B 0D ?? ?? ?? ??  (mov rcx, [rip+??])
    # followed within ~20 bytes by something referencing 0x1358

    # First, let's try a broader approach: scan for any `mov r64, [rip+off]`
    # and check if the resolved pointer looks like a valid GEngine

    # Read the text section in chunks and look for:
    # 48 8B 05 XX XX XX XX  or  48 8B 0D XX XX XX XX  (mov rax/rcx, [rip+disp32])
    # where the resolved address points to a valid pointer chain

    chunk_size = 0x200000  # 2MB chunks
    text_start = text_section['va']
    text_size = text_section['virtual_size']
    candidates = []

    print(f"[*] Searching for GEngine pointer references...")
    offset = 0
    while offset < text_size:
        read_size = min(chunk_size, text_size - offset)
        data = read_mem(handle, text_start + offset, read_size)
        if not data:
            offset += chunk_size
            continue

        # Look for: 48 8B 05/0D/15/1D/25/2D/35/3D XX XX XX XX
        # These are mov r64, [rip+disp32] instructions
        for i in range(len(data) - 7):
            if data[i] == 0x48 and data[i+1] == 0x8B:
                modrm = data[i+2]
                # Check for [rip+disp32] addressing mode (mod=00, rm=101)
                if (modrm & 0xC7) == 0x05:
                    disp = struct.unpack_from('<i', data, i + 3)[0]
                    # RIP-relative: target = instruction_addr + 7 + disp
                    instr_addr = text_start + offset + i
                    target_addr = instr_addr + 7 + disp

                    # Quick sanity: target should be within the module
                    if base <= target_addr < base + size:
                        candidates.append((instr_addr, target_addr))

        offset += chunk_size - 16  # small overlap

    print(f"[*] Found {len(candidates)} RIP-relative pointer loads")
    print(f"[*] Testing candidates for valid GEngine pointer chain...")

    # Now test each candidate — read the pointer at target_addr,
    # then try to walk: ptr + 0x1358 → GameInstance → +0x38 → LocalPlayers
    valid = []
    tested = set()
    for instr_addr, target_addr in candidates:
        if target_addr in tested:
            continue
        tested.add(target_addr)

        gengine_ptr = read_ptr(handle, target_addr)
        if not gengine_ptr or gengine_ptr < 0x10000:
            continue

        # Try the chain: GEngine → +0x1358 → GameInstance
        game_instance = read_ptr(handle, gengine_ptr + 0x1358)
        if not game_instance or game_instance < 0x10000:
            continue

        # GameInstance → +0x38 → LocalPlayers array
        local_players = read_ptr(handle, game_instance + 0x38)
        if not local_players or local_players < 0x10000:
            continue

        # LocalPlayers[0] → deref
        player0 = read_ptr(handle, local_players)
        if not player0 or player0 < 0x10000:
            continue

        # Player → +0x30 → PlayerController
        controller = read_ptr(handle, player0 + 0x30)
        if not controller or controller < 0x10000:
            continue

        # PlayerController → +0x398 → PlayerState
        # (go through +0x3D0 for pawn first, then +0x398 from controller)
        # Actually the chain is: controller +0x3D0 → pawn, controller has state elsewhere
        # Let me re-read: the NHA chain is:
        # [[[[[GEngine+0x1358]+0x38]]+0x30]+0x3D0]  → Pawn
        # [[[[[GEngine+0x1358]+0x38]]+0x30]+0x398]  → State (from pawn, not controller)
        # Wait, +0x30 gives PlayerController, then +0x3D0 gives Pawn, +0x398 gives State

        pawn = read_ptr(handle, controller + 0x3D0)
        state = read_ptr(handle, controller + 0x398)

        if pawn and pawn > 0x10000 and state and state > 0x10000:
            # Try reading backpack from state
            bp_data = read_ptr(handle, state + 0x880)
            bp_count = read_u32(handle, state + 0x888)

            if bp_data and bp_data > 0x10000 and bp_count is not None and bp_count < 500:
                valid.append({
                    'gengine_ptr_addr': target_addr,
                    'gengine': gengine_ptr,
                    'game_instance': game_instance,
                    'controller': controller,
                    'pawn': pawn,
                    'state': state,
                    'backpack_data': bp_data,
                    'backpack_count': bp_count,
                    'instr_addr': instr_addr,
                })
                print(f"\n[+] FOUND GEngine!")
                print(f"    Instruction at:  {hex(instr_addr)}")
                print(f"    GEngine ptr at:  {hex(target_addr)}")
                print(f"    GEngine value:   {hex(gengine_ptr)}")
                print(f"    GameInstance:    {hex(game_instance)}")
                print(f"    PlayerController: {hex(controller)}")
                print(f"    PlayerPawn:      {hex(pawn)}")
                print(f"    PlayerState:     {hex(state)}")
                print(f"    Backpack data:   {hex(bp_data)}")
                print(f"    Backpack count:  {bp_count}")

                # Found a valid one, return it
                return gengine_ptr

    if not valid:
        print("[!] Could not find GEngine via AOB scan")
        print(f"    Tested {len(tested)} unique pointer targets, none had valid chain")

    return None

# ── Pointer Chain Walker ─────────────────────────────────────────────────────

def walk_chain(handle, gengine):
    """Walk the full pointer chain from GEngine to backpack. Returns dict or None."""
    chain = {}

    # GEngine → +0x1358 → GameInstance
    gi = read_ptr(handle, gengine + 0x1358)
    if not gi:
        return None
    chain['GameInstance'] = gi

    # → +0x38 → LocalPlayers
    lp = read_ptr(handle, gi + 0x38)
    if not lp:
        return None
    chain['LocalPlayers'] = lp

    # → [0] deref
    p0 = read_ptr(handle, lp)
    if not p0:
        return None
    chain['Player0'] = p0

    # → +0x30 → PlayerController
    pc = read_ptr(handle, p0 + 0x30)
    if not pc:
        return None
    chain['PlayerController'] = pc

    # → +0x3D0 → Pawn
    pawn = read_ptr(handle, pc + 0x3D0)
    chain['PlayerPawn'] = pawn

    # → +0x398 → PlayerState
    state = read_ptr(handle, pc + 0x398)
    if not state:
        return None
    chain['PlayerState'] = state

    # Backpack TArray (offsets updated for current game build)
    bp_data = read_ptr(handle, state + 0x880)
    bp_count = read_u32(handle, state + 0x888)
    bp_max = read_u32(handle, state + 0x88C)
    chain['Backpack'] = {
        'data': bp_data,
        'count': bp_count,
        'max': bp_max,
    }

    # Backpack max size
    max_size = read_u32(handle, state + 0x924)
    chain['BackpackMaxSize'] = max_size

    return chain

# ── Cache ────────────────────────────────────────────────────────────────────

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'gengine_cache.json')

def save_cache(gengine_ptr_addr, gengine_value):
    """Save discovered GEngine location for faster startup next time."""
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump({
                'gengine_ptr_addr': gengine_ptr_addr,
                'gengine_value': gengine_value,
                'timestamp': time.time(),
            }, f)
    except Exception:
        pass

def load_cache():
    """Load cached GEngine location. Returns (ptr_addr, value) or (None, None)."""
    try:
        with open(CACHE_FILE, 'r') as f:
            data = json.load(f)
        return data.get('gengine_ptr_addr'), data.get('gengine_value')
    except Exception:
        return None, None

# ── Main Scanner ─────────────────────────────────────────────────────────────

def scan(verbose=True):
    """
    Full scan: attach to BL4, find GEngine, validate chain.
    Returns (handle, gengine_address) or (None, None).
    """
    if verbose:
        print("=" * 60)
        print("  BL4 Memory Scanner v1.0")
        print("=" * 60)

    # Step 1: Find process
    if verbose:
        print("\n[1] Looking for Borderlands4.exe...")
    pid, handle = find_process()
    if not handle:
        if verbose:
            print("[!] Borderlands 4 not found. Is the game running?")
        return None, None
    if verbose:
        print(f"[+] Found! PID: {pid}")

    # Step 2: Get module info
    if verbose:
        print("\n[2] Getting module info...")
    base, size = get_module_info(pid)
    if not base:
        if verbose:
            print("[!] Could not get module info")
        return handle, None
    if verbose:
        print(f"[+] Base: {hex(base)}, Size: {hex(size)} ({size // 1024 // 1024} MB)")

    # Step 3: Try cache first
    if verbose:
        print("\n[3] Checking cache...")
    cached_ptr_addr, cached_value = load_cache()
    if cached_ptr_addr:
        # Verify the cached address still works
        gengine = read_ptr(handle, cached_ptr_addr)
        if gengine and gengine > 0x10000:
            chain = walk_chain(handle, gengine)
            if chain and chain.get('Backpack', {}).get('data'):
                if verbose:
                    print(f"[+] Cache hit! GEngine = {hex(gengine)}")
                    print(f"    Backpack: {chain['Backpack']['count']} items")
                return handle, gengine
        if verbose:
            print("[-] Cache stale, rescanning...")

    # Step 4: Full scan
    if verbose:
        print("\n[4] Scanning for GEngine (this may take a moment)...")

    gengine = find_gengine_via_aob(handle, base, size)
    if gengine:
        if verbose:
            print(f"\n[+] GEngine confirmed: {hex(gengine)}")
            chain = walk_chain(handle, gengine)
            if chain:
                print(f"\n[*] Full pointer chain:")
                for k, v in chain.items():
                    if isinstance(v, dict):
                        print(f"    {k}:")
                        for k2, v2 in v.items():
                            print(f"      {k2}: {hex(v2) if isinstance(v2, int) and v2 > 255 else v2}")
                    else:
                        print(f"    {k}: {hex(v) if isinstance(v, int) and v else v}")
        return handle, gengine

    if verbose:
        print("\n[!] GEngine not found automatically.")
        print("    You may need to provide it manually from Cheat Engine.")
        print("    In CE: load the NHA table → check Modules → GEngine value")

    return handle, None

# ── CLI Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    handle, gengine = scan()

    if handle and gengine:
        print("\n" + "=" * 60)
        print("  SUCCESS — Ready for injection!")
        print("=" * 60)

        chain = walk_chain(handle, gengine)
        if chain:
            bp = chain.get('Backpack', {})
            print(f"\n  Backpack: {bp.get('count', '?')}/{bp.get('max', '?')} items")
            print(f"  Max Size: {chain.get('BackpackMaxSize', '?')}")

            # Read first few items as proof
            bp_data = bp.get('data')
            bp_count = bp.get('count', 0)
            if bp_data and bp_count > 0:
                print(f"\n  First items in backpack:")
                for i in range(min(5, bp_count)):
                    item_addr = bp_data + (i * 0x150)
                    # Parts string is a pointer at +0xB8
                    str_ptr = read_ptr(handle, item_addr + 0xB8)
                    if str_ptr:
                        raw = read_mem(handle, str_ptr, 200)
                        if raw:
                            null_idx = raw.find(b'\x00')
                            if null_idx > 0:
                                serial = raw[:null_idx].decode('utf-8', errors='replace')
                                preview = serial[:60] + "..." if len(serial) > 60 else serial
                                print(f"    [{i}] {preview}")

        print(f"\n  GEngine address: {hex(gengine)}")
        print(f"  Use this in bl4_bridge.py or pass to the web app.")
    elif handle:
        print("\n[!] Attached to game but could not find GEngine.")
        print("    Try running with the game fully loaded (in-game, not menu).")
    else:
        print("\n[!] Could not attach. Run as administrator if needed.")

    if not gengine and handle:
        print("\n  You can also enter the GEngine address manually.")
        print("  (From CE UE5 Dumper: GameEngineObject value)")
        user_input = input("\n  Enter GEngine hex address (or press Enter to skip): ").strip()
        if user_input:
            try:
                gengine = int(user_input, 16)
                chain = walk_chain(handle, gengine)
                if chain and chain.get('Backpack', {}).get('data'):
                    print(f"\n[+] Manual GEngine validated! Chain works.")
                    bp = chain.get('Backpack', {})
                    print(f"    Backpack: {bp.get('count', '?')}/{bp.get('max', '?')} items")
                else:
                    print(f"[!] Could not validate chain from {hex(gengine)}")
            except ValueError:
                print("[!] Invalid hex address")

    input("\nPress Enter to exit...")
