"""
BL4 Live Injector — Standalone Desktop App
Auto-attaches to Borderlands 4, auto-discovers GEngine,
runs WebSocket server for bl4editor.com integration.

Usage: Just run this. Keep it running while using the editor.
"""

import sys
import json
import asyncio
import struct
import time
import ctypes
import ctypes.wintypes as wt

from bl4_scanner import (
    find_process, get_module_info, read_ptr, read_u32, read_mem,
    write_mem, alloc_mem
)
from find_gengine_direct import find_gengine_scan_sections

# ── Windows Input for Drop ───────────────────────────────────────────────────
user32 = ctypes.WinDLL('user32', use_last_error=True)
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
VK_R = 0x52
MAPVK_VK_TO_VSC = 0
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)

# ── Game State ───────────────────────────────────────────────────────────────

class GameState:
    def __init__(self):
        self.pid = None
        self.handle = None
        self.gengine = None
        self.base = None
        self.size = None
        self.connected = False

    def attach(self):
        """Attach to BL4 and auto-find GEngine."""
        self.pid, self.handle = find_process()
        if not self.handle:
            return {"ok": False, "error": "Borderlands 4 not found. Is the game running?"}

        self.base, self.size = get_module_info(self.pid)
        if not self.base:
            return {"ok": False, "error": "Could not get module info"}

        self.connected = True
        print(f"[+] Attached to BL4 (PID: {self.pid})")

        # Auto-find GEngine
        print("[*] Finding GEngine...")
        self.gengine = find_gengine_scan_sections(self.handle, self.base, self.size)
        if self.gengine:
            print(f"[+] GEngine: {hex(self.gengine)}")
        else:
            print("[!] GEngine not found. Are you in-game (not main menu)?")

        result = {"ok": True, "pid": self.pid}
        if self.gengine:
            result["gengine"] = hex(self.gengine)
        return result

    def _get_state(self):
        """Walk chain to PlayerState."""
        if not self.handle or not self.gengine:
            return None
        gi = read_ptr(self.handle, self.gengine + 0x1358)
        if not gi: return None
        lp = read_ptr(self.handle, gi + 0x38)
        if not lp: return None
        p0 = read_ptr(self.handle, lp)
        if not p0: return None
        pc = read_ptr(self.handle, p0 + 0x30)
        if not pc: return None
        return read_ptr(self.handle, pc + 0x398)

    def read_backpack(self):
        state = self._get_state()
        if not state:
            return {"ok": False, "error": "Could not find player state. Are you in-game?"}

        bp_data = read_ptr(self.handle, state + 0x880)
        bp_count = read_u32(self.handle, state + 0x888)
        if not bp_data or bp_count is None:
            return {"ok": False, "error": "Could not read backpack"}

        items = []
        for i in range(min(bp_count, 200)):
            item_addr = bp_data + (i * 0x150)
            str_ptr = read_ptr(self.handle, item_addr + 0xB8)
            serial = ""
            if str_ptr:
                raw = read_mem(self.handle, str_ptr, 300)
                if raw:
                    null = raw.find(b'\x00')
                    if null > 0:
                        serial = raw[:null].decode('utf-8', errors='replace')
            equip = read_mem(self.handle, item_addr + 0x10D, 1)
            equip_val = equip[0] if equip else 255
            items.append({
                "slot": i,
                "serial": serial,
                "equipSlot": equip_val,
                "quantity": read_u32(self.handle, item_addr + 0xF8) or 1,
            })

        return {"ok": True, "count": bp_count, "items": items}

    def inject_item(self, serial):
        if not serial.startswith("@U"):
            return {"ok": False, "error": "Serial must start with @U"}

        state = self._get_state()
        if not state:
            return {"ok": False, "error": "Could not find player state"}

        bp_data = read_ptr(self.handle, state + 0x880)
        bp_count = read_u32(self.handle, state + 0x888)
        bp_max = read_u32(self.handle, state + 0x88C)
        max_size = read_u32(self.handle, state + 0x924)

        if not bp_data or bp_count is None or bp_max is None:
            return {"ok": False, "error": "Could not read backpack"}

        # Extend TArray if full
        if bp_count >= bp_max:
            if max_size and bp_count >= max_size:
                return {"ok": False, "error": f"Backpack full ({bp_count}/{max_size})"}
            new_max = bp_max + 16
            new_array = alloc_mem(self.handle, new_max * 0x150)
            if not new_array:
                return {"ok": False, "error": "Could not allocate memory"}
            if bp_count > 0:
                old_data = read_mem(self.handle, bp_data, bp_count * 0x150)
                if old_data:
                    write_mem(self.handle, new_array, old_data)
            write_mem(self.handle, state + 0x880, struct.pack('<Q', new_array))
            write_mem(self.handle, state + 0x88C, struct.pack('<I', new_max))
            bp_data = new_array
            bp_max = new_max

        # Write a clean zeroed slot (don't copy template — Type/Info pointers
        # from template override the item type, making everything show as whatever slot 0 is)
        new_addr = bp_data + (bp_count * 0x150)
        write_mem(self.handle, new_addr, b'\x00' * 0x150)

        # Set minimal required fields
        new_id = bp_count + 200
        write_mem(self.handle, new_addr + 0x00, struct.pack('<I', new_id))       # ReplicationID
        write_mem(self.handle, new_addr + 0x04, struct.pack('<I', new_id))       # ReplicationKey
        write_mem(self.handle, new_addr + 0x10, struct.pack('<I', new_id))       # InstanceId
        write_mem(self.handle, new_addr + 0x108, struct.pack('<I', new_id))      # Handle
        write_mem(self.handle, new_addr + 0x10D, bytes([0xFF]))                  # EquipSlot = free
        write_mem(self.handle, new_addr + 0xF8, struct.pack('<I', 1))            # Quantity
        write_mem(self.handle, new_addr + 0xFC, struct.pack('<I', 1))            # Flags

        # Write serial string — this is what the game uses to resolve the actual item
        str_buf = alloc_mem(self.handle, len(serial) + 64)
        if not str_buf:
            return {"ok": False, "error": "Could not allocate string memory"}
        write_mem(self.handle, str_buf, serial.encode('utf-8') + b'\x00')
        write_mem(self.handle, new_addr + 0xB8, struct.pack('<Q', str_buf))

        # Increment count
        write_mem(self.handle, state + 0x888, struct.pack('<I', bp_count + 1))

        return {
            "ok": True,
            "message": f"Injected to slot {bp_count}! Open inventory to see it.",
            "slot": bp_count,
        }

    def _get_game_window(self):
        """Find BL4 window handle."""
        if not self.pid:
            return None
        result = [None]
        def callback(hwnd, lparam):
            proc_id = wt.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
            if proc_id.value == self.pid and user32.IsWindowVisible(hwnd):
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

    def drop_items(self, count, hold_seconds=1.5, delay=0.5):
        """Drop items by sending R key hold via SendMessage. User must have inventory open."""
        hwnd = self._get_game_window()
        if not hwnd:
            return {"ok": False, "error": "Game window not found"}

        scan_code = user32.MapVirtualKeyW(VK_R, MAPVK_VK_TO_VSC)
        lp_down = (scan_code << 16) | 1
        lp_up = (scan_code << 16) | 1 | (1 << 30) | (1 << 31)

        dropped = 0
        for i in range(count):
            try:
                user32.SendMessageW(hwnd, WM_KEYDOWN, VK_R, lp_down)
                time.sleep(hold_seconds)
                user32.SendMessageW(hwnd, WM_KEYUP, VK_R, lp_up)
                time.sleep(delay)
                dropped += 1
                print(f"  [{dropped}/{count}] Dropped")
            except Exception as e:
                return {"ok": True, "dropped": dropped, "error": f"Stopped at {dropped}: {e}"}

        return {"ok": True, "dropped": dropped, "message": f"Dropped {dropped} items!"}

    def batch_inject(self, serials):
        """Inject multiple items at once."""
        state = self._get_state()
        if not state:
            return {"ok": False, "error": "Could not find player state"}

        bp_data = read_ptr(self.handle, state + 0x880)
        bp_count = read_u32(self.handle, state + 0x888)
        bp_max = read_u32(self.handle, state + 0x88C)
        max_size = read_u32(self.handle, state + 0x924)

        if not bp_data or bp_count is None or bp_max is None:
            return {"ok": False, "error": "Could not read backpack"}

        needed = len(serials)
        if bp_count + needed > bp_max:
            new_max = bp_count + needed + 8
            if max_size and new_max > max_size:
                new_max = max_size
            new_array = alloc_mem(self.handle, new_max * 0x150)
            if not new_array:
                return {"ok": False, "error": "Could not allocate memory"}
            if bp_count > 0:
                old = read_mem(self.handle, bp_data, bp_count * 0x150)
                if old:
                    write_mem(self.handle, new_array, old)
            write_mem(self.handle, state + 0x880, struct.pack('<Q', new_array))
            write_mem(self.handle, state + 0x88C, struct.pack('<I', new_max))
            bp_data = new_array
            bp_max = new_max

        injected = 0
        for idx, serial in enumerate(serials):
            if bp_count >= bp_max:
                break
            new_addr = bp_data + (bp_count * 0x150)
            write_mem(self.handle, new_addr, b'\x00' * 0x150)

            new_id = bp_count + 500 + idx
            write_mem(self.handle, new_addr + 0x00, struct.pack('<I', new_id))
            write_mem(self.handle, new_addr + 0x04, struct.pack('<I', new_id))
            write_mem(self.handle, new_addr + 0x10, struct.pack('<I', new_id))
            write_mem(self.handle, new_addr + 0x108, struct.pack('<I', new_id))
            write_mem(self.handle, new_addr + 0x10D, bytes([0xFF]))
            write_mem(self.handle, new_addr + 0xF8, struct.pack('<I', 1))
            write_mem(self.handle, new_addr + 0xFC, struct.pack('<I', 1))

            str_buf = alloc_mem(self.handle, len(serial) + 64)
            if not str_buf:
                break
            write_mem(self.handle, str_buf, serial.encode('utf-8') + b'\x00')
            write_mem(self.handle, new_addr + 0xB8, struct.pack('<Q', str_buf))

            bp_count += 1
            write_mem(self.handle, state + 0x888, struct.pack('<I', bp_count))
            injected += 1

        print(f"[+] Batch injected {injected}/{len(serials)} items")
        return {"ok": True, "injected": injected, "message": f"Injected {injected} items!"}

    def status(self):
        return {
            "connected": self.connected,
            "pid": self.pid,
            "gengine": hex(self.gengine) if self.gengine else None,
        }

# ── WebSocket Server ─────────────────────────────────────────────────────────

game = GameState()

async def handle_ws(websocket):
    print(f"[+] Web app connected")
    try:
        async for message in websocket:
            try:
                req = json.loads(message)
                action = req.get("action", "")

                if action == "ping":
                    resp = {"ok": True, "bridge": "bl4-live-injector", "version": "2.0.0"}
                elif action == "attach":
                    resp = game.attach()
                elif action == "status":
                    resp = game.status()
                elif action == "read_backpack":
                    resp = game.read_backpack()
                elif action == "inject":
                    serial = req.get("serial", "")
                    resp = game.inject_item(serial)
                    if resp["ok"]:
                        print(f"[+] Injected item ({len(serial)} chars)")
                elif action == "batch_inject":
                    serials = req.get("serials", [])
                    resp = game.batch_inject(serials)
                elif action == "drop_all":
                    count = req.get("count", 1)
                    print(f"[*] Dropping {count} items...")
                    resp = game.drop_items(count)
                else:
                    resp = {"ok": False, "error": f"Unknown action: {action}"}

                if "_id" in req:
                    resp["_id"] = req["_id"]
                await websocket.send(json.dumps(resp))

            except Exception as e:
                err = {"ok": False, "error": str(e)}
                if "_id" in req:
                    err["_id"] = req["_id"]
                await websocket.send(json.dumps(err))
    except Exception:
        pass
    finally:
        print(f"[-] Web app disconnected")

async def main():
    try:
        import websockets
    except ImportError:
        print("Installing websockets...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets

    port = 27015

    print(r"""
 ____  _   _  _     _     _           _
| __ )| | | || |   (_)_ __(_) ___  ___| |_ ___  _ __
|  _ \| | | || |   | | '__| |/ _ \/ __| __/ _ \| '__|
| |_) | |_| || |___| | |  | |  __/ (__| || (_) | |
|____/ \___/ |_____|_|_|  |_|\___|\___|\__\___/|_|

  BL4 Live Injector v2.0
""")

    # Auto-attach on startup
    print("[*] Looking for Borderlands 4...")
    result = game.attach()
    if result["ok"]:
        if game.gengine:
            bp = game.read_backpack()
            if bp["ok"]:
                print(f"[+] Ready! Backpack: {bp['count']} items")
        print(f"\n[*] WebSocket server starting on ws://localhost:{port}")
        print(f"[*] Open bl4editor.com and click 'Inject to Game'")
    else:
        print(f"[!] {result['error']}")
        print(f"[*] Will retry when web app connects...")
        print(f"\n[*] WebSocket server starting on ws://localhost:{port}")

    print(f"[*] Press Ctrl+C to stop\n")

    async with websockets.serve(handle_ws, "localhost", port, origins=None):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Shutting down...")
