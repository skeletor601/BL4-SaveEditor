"""
Loot Lobby Drop — The full pipeline:
1. Read @U codes from loot_items.txt
2. Inject them all into YOUR backpack
3. Automatically drop them all on the ground for others to pick up

Perfect for loot lobbies: PC host shares hundreds of modded items with console players.
"""

import ctypes
import ctypes.wintypes as wt
import time
import struct
import os

from bl4_scanner import (
    find_process, get_module_info, read_ptr, read_u32, read_mem,
    write_mem, alloc_mem
)
from find_gengine_direct import find_gengine_scan_sections

user32 = ctypes.WinDLL('user32', use_last_error=True)

WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
VK_R = 0x52
MAPVK_VK_TO_VSC = 0


def get_game_window(pid):
    result = [None]
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def callback(hwnd, lparam):
        proc_id = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
        if proc_id.value == pid and user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                if buf.value:
                    result[0] = hwnd
                    return False
        return True
    user32.EnumWindows(WNDENUMPROC(callback), 0)
    return result[0]


def drop_item(hwnd, hold_seconds=1.5):
    scan_code = user32.MapVirtualKeyW(VK_R, MAPVK_VK_TO_VSC)
    lp_down = (scan_code << 16) | 1
    lp_up = (scan_code << 16) | 1 | (1 << 30) | (1 << 31)
    user32.SendMessageW(hwnd, WM_KEYDOWN, VK_R, lp_down)
    time.sleep(hold_seconds)
    user32.SendMessageW(hwnd, WM_KEYUP, VK_R, lp_up)


def inject_batch(handle, gengine, serials):
    """Inject multiple items into local player backpack. Returns count injected."""
    gi = read_ptr(handle, gengine + 0x1358)
    lp = read_ptr(handle, gi + 0x38)
    p0 = read_ptr(handle, lp)
    pc = read_ptr(handle, p0 + 0x30)
    state = read_ptr(handle, pc + 0x398)
    if not state:
        return 0

    bp_data = read_ptr(handle, state + 0x880)
    bp_count = read_u32(handle, state + 0x888)
    bp_max = read_u32(handle, state + 0x88C)
    max_size = read_u32(handle, state + 0x924)

    if not bp_data or bp_count is None or bp_max is None:
        return 0

    # Extend array to fit all items
    needed = len(serials)
    if bp_count + needed > bp_max:
        new_max = bp_count + needed + 8
        if max_size and new_max > max_size:
            new_max = max_size
        new_array = alloc_mem(handle, new_max * 0x150)
        if not new_array:
            return 0
        if bp_count > 0:
            old = read_mem(handle, bp_data, bp_count * 0x150)
            if old:
                write_mem(handle, new_array, old)
        write_mem(handle, state + 0x880, struct.pack('<Q', new_array))
        write_mem(handle, state + 0x88C, struct.pack('<I', new_max))
        bp_data = new_array
        bp_max = new_max

    template = read_mem(handle, bp_data, 0x150) if bp_count > 0 else b'\x00' * 0x150
    if not template:
        template = b'\x00' * 0x150

    injected = 0
    for idx, serial in enumerate(serials):
        if bp_count >= bp_max:
            break
        new_addr = bp_data + (bp_count * 0x150)
        write_mem(handle, new_addr, template)

        new_id = bp_count + 500 + idx
        write_mem(handle, new_addr + 0x00, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x10, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x108, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x10D, bytes([0xFF]))
        write_mem(handle, new_addr + 0xF8, struct.pack('<I', 1))
        write_mem(handle, new_addr + 0xFC, struct.pack('<I', 1))

        str_buf = alloc_mem(handle, len(serial) + 64)
        if not str_buf:
            break
        write_mem(handle, str_buf, serial.encode('utf-8') + b'\x00')
        write_mem(handle, new_addr + 0xB8, struct.pack('<Q', str_buf))

        bp_count += 1
        write_mem(handle, state + 0x888, struct.pack('<I', bp_count))
        injected += 1

    return injected


def main():
    print(r"""
  _                _     _          _     _
 | |    ___   ___ | |_  | |    ___ | |__ | |__  _   _
 | |   / _ \ / _ \| __| | |   / _ \| '_ \| '_ \| | | |
 | |__| (_) | (_) | |_  | |__| (_) | |_) | |_) | |_| |
 |_____\___/ \___/ \__| |_____\___/|_.__/|_.__/ \__, |
                                                  |___/
  BL4 Loot Lobby — Inject & Drop
""")

    # Load items
    path = os.path.join(os.path.dirname(__file__), 'loot_items.txt')
    if not os.path.exists(path):
        path = os.path.join(os.path.dirname(__file__), 'inject_code.txt')
    if not os.path.exists(path):
        print("[!] Put @U codes in loot_items.txt (one per line)")
        input("Press Enter to exit...")
        return

    with open(path, 'r', encoding='utf-8') as f:
        serials = [line.strip() for line in f if line.strip().startswith('@U')]

    if not serials:
        print("[!] No @U codes found in file")
        input("Press Enter to exit...")
        return

    print(f"[+] Loaded {len(serials)} items to drop")

    # Attach
    pid, handle = find_process()
    if not handle:
        print("[!] Game not found!")
        input("Press Enter to exit...")
        return

    base, size = get_module_info(pid)
    hwnd = get_game_window(pid)
    if not hwnd:
        print("[!] Game window not found!")
        input("Press Enter to exit...")
        return

    # Find GEngine
    print("[*] Finding GEngine...")
    gengine = find_gengine_scan_sections(handle, base, size)
    if not gengine:
        print("[!] Could not find GEngine")
        input("Press Enter to exit...")
        return

    print(f"\n  Items to drop: {len(serials)}")
    print(f"  Estimated time: ~{len(serials) * 2} seconds")
    print(f"\n  Process:")
    print(f"  1. Inject all {len(serials)} items into your backpack")
    print(f"  2. You open inventory & hover first new item")
    print(f"  3. Script drops them all one by one")

    input(f"\n  Press Enter to inject {len(serials)} items into backpack...")

    # Step 1: Inject all items
    print(f"\n[*] Injecting {len(serials)} items...")
    injected = inject_batch(handle, gengine, serials)
    print(f"[+] Injected {injected} items into backpack")

    if injected == 0:
        print("[!] No items injected")
        input("Press Enter to exit...")
        return

    # Step 2: Wait for user to open inventory
    print(f"\n  NOW:")
    print(f"  1. Open your inventory in-game")
    print(f"  2. Go to BACKPACK tab")
    print(f"  3. Hover over the FIRST newly injected item")
    print(f"  4. Press Enter here")
    print(f"\n  DON'T touch mouse/keyboard after pressing Enter!")

    input(f"\n  Press Enter to start dropping {injected} items...")

    print(f"\n  Starting in 3 seconds — switch to game!")
    time.sleep(3)

    # Step 3: Drop all
    dropped = 0
    for i in range(injected):
        print(f"  [{i+1}/{injected}] Dropping...", end="", flush=True)
        drop_item(hwnd, hold_seconds=1.5)
        time.sleep(0.5)
        dropped += 1
        print(" done")

    print(f"\n{'='*60}")
    print(f"  LOOT LOBBY COMPLETE!")
    print(f"  Dropped {dropped} items on the ground!")
    print(f"  Console players can now pick them up.")
    print(f"{'='*60}")

    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
