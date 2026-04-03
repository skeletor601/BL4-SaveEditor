"""
Dump All Inventory — Drop all unequipped backpack items on the ground.
Uses SendMessage WM_KEYDOWN to simulate holding R (confirmed working).

For loot lobbies: PC host drops hundreds of modded items for console players.

Usage:
1. Open inventory in-game, select first unequipped item
2. Run this script
3. Items drop one by one automatically
"""

import ctypes
import ctypes.wintypes as wt
import time
import struct

from bl4_scanner import find_process, get_module_info, read_ptr, read_u32, read_mem
from find_gengine_direct import find_gengine_scan_sections

user32 = ctypes.WinDLL('user32', use_last_error=True)

WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
VK_R = 0x52
MAPVK_VK_TO_VSC = 0


def get_game_window():
    """Find BL4 window handle."""
    pid, _ = find_process()
    if not pid:
        return None

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
    """Drop the currently selected item by sending R key hold via SendMessage."""
    scan_code = user32.MapVirtualKeyW(VK_R, MAPVK_VK_TO_VSC)
    lp_down = (scan_code << 16) | 1
    lp_up = (scan_code << 16) | 1 | (1 << 30) | (1 << 31)

    user32.SendMessageW(hwnd, WM_KEYDOWN, VK_R, lp_down)
    time.sleep(hold_seconds)
    user32.SendMessageW(hwnd, WM_KEYUP, VK_R, lp_up)


def read_backpack_items(handle, gengine):
    """Read backpack and return list of items with serial info."""
    gi = read_ptr(handle, gengine + 0x1358)
    lp = read_ptr(handle, gi + 0x38)
    p0 = read_ptr(handle, lp)
    pc = read_ptr(handle, p0 + 0x30)
    state = read_ptr(handle, pc + 0x398)

    bp_data = read_ptr(handle, state + 0x880)
    bp_count = read_u32(handle, state + 0x888)

    items = []
    if bp_data and bp_count:
        for i in range(bp_count):
            item_addr = bp_data + (i * 0x150)
            equip = read_mem(handle, item_addr + 0x10D, 1)
            equip_val = equip[0] if equip else 255

            str_ptr = read_ptr(handle, item_addr + 0xB8)
            has_serial = False
            if str_ptr:
                raw = read_mem(handle, str_ptr, 4)
                if raw and raw[:2] == b'@U':
                    has_serial = True

            items.append({
                'slot': i,
                'equipped': equip_val != 255,
                'has_serial': has_serial,
            })
    return items


def main():
    print("=" * 60)
    print("  BL4 Loot Lobby — Drop All Items")
    print("=" * 60)

    # Find game
    pid, handle = find_process()
    if not handle:
        print("\n[!] Borderlands 4 not found!")
        input("Press Enter to exit...")
        return

    base, size = get_module_info(pid)
    print(f"[+] PID: {pid}")

    # Find window
    hwnd = get_game_window()
    if not hwnd:
        print("[!] Could not find game window!")
        input("Press Enter to exit...")
        return
    print(f"[+] Window: {hwnd}")

    # Find GEngine
    gengine = find_gengine_scan_sections(handle, base, size)
    if not gengine:
        print("[!] Could not find GEngine. Are you in-game?")
        input("Press Enter to exit...")
        return

    # Read backpack
    items = read_backpack_items(handle, gengine)
    real_items = [it for it in items if it['has_serial']]
    equipped = [it for it in real_items if it['equipped']]
    droppable = [it for it in real_items if not it['equipped']]

    print(f"\n  Total items: {len(real_items)}")
    print(f"  Equipped: {len(equipped)} (will keep)")
    print(f"  Droppable: {len(droppable)}")

    if not droppable:
        print("\n  Nothing to drop!")
        input("Press Enter to exit...")
        return

    print(f"\n  INSTRUCTIONS:")
    print(f"  1. Open your inventory in-game")
    print(f"  2. Go to the BACKPACK tab")
    print(f"  3. Hover over the FIRST unequipped item")
    print(f"  4. Press Enter here to start dropping")
    print(f"  5. DON'T touch mouse/keyboard until done")
    print(f"\n  Hold time per item: 1.5s + 0.5s delay = ~2s each")
    print(f"  Estimated time: {len(droppable) * 2} seconds for {len(droppable)} items")

    input(f"\n  Press Enter to start dropping {len(droppable)} items...")

    print(f"\n  Starting in 3 seconds — switch to game now!")
    time.sleep(3)

    dropped = 0
    for i in range(len(droppable)):
        print(f"  [{i+1}/{len(droppable)}] Dropping...", end="", flush=True)
        drop_item(hwnd, hold_seconds=1.5)
        time.sleep(0.5)
        dropped += 1
        print(f" done")

    print(f"\n{'='*60}")
    print(f"  Dropped {dropped} items on the ground!")
    print(f"  Equipped items ({len(equipped)}) were kept.")
    print(f"{'='*60}")

    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
