"""
BL4 Live Injector Bridge
Connects bl4editor.com to the running Borderlands 4 game process.
Runs a local WebSocket server that the web app talks to.

Usage:
  python bl4_bridge.py

Then open bl4editor.com — the site detects the bridge automatically.

Based on memory structures from NHA's open-source Cheat Engine table:
https://github.com/dr-NHA/NHA_Borderlands4 (MIT-style, open source)
"""

import ctypes
import ctypes.wintypes as wt
import struct
import json
import asyncio
import sys
import time

# ── Windows API ──────────────────────────────────────────────────────────────

kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

PROCESS_ALL_ACCESS = 0x1F0FFF
TH32CS_SNAPPROCESS = 0x00000002
MEM_COMMIT = 0x1000
MEM_RESERVE = 0x2000
PAGE_READWRITE = 0x04

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

def find_process(name):
    """Find a process by name, return (pid, handle) or (None, None)."""
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == -1:
        return None, None
    pe = PROCESSENTRY32()
    pe.dwSize = ctypes.sizeof(PROCESSENTRY32)
    if not kernel32.Process32First(snapshot, ctypes.byref(pe)):
        kernel32.CloseHandle(snapshot)
        return None, None
    while True:
        exe = pe.szExeFile.decode('utf-8', errors='ignore').lower()
        if name.lower() in exe:
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

def read_mem(handle, address, size):
    """Read bytes from process memory."""
    buf = ctypes.create_string_buffer(size)
    bytes_read = ctypes.c_size_t(0)
    ok = kernel32.ReadProcessMemory(handle, ctypes.c_void_p(address), buf, size, ctypes.byref(bytes_read))
    if not ok:
        return None
    return buf.raw[:bytes_read.value]

def write_mem(handle, address, data):
    """Write bytes to process memory."""
    buf = ctypes.create_string_buffer(data)
    bytes_written = ctypes.c_size_t(0)
    ok = kernel32.WriteProcessMemory(handle, ctypes.c_void_p(address), buf, len(data), ctypes.byref(bytes_written))
    return ok and bytes_written.value == len(data)

def read_ptr(handle, address):
    """Read a 64-bit pointer."""
    data = read_mem(handle, address, 8)
    if not data or len(data) < 8:
        return None
    return struct.unpack('<Q', data)[0]

def read_u32(handle, address):
    """Read a 32-bit unsigned int."""
    data = read_mem(handle, address, 4)
    if not data or len(data) < 4:
        return None
    return struct.unpack('<I', data)[0]

def read_string(handle, address, max_len=1024):
    """Read a null-terminated string from a pointer."""
    ptr = read_ptr(handle, address)
    if not ptr:
        return None
    data = read_mem(handle, ptr, max_len)
    if not data:
        return None
    null_idx = data.find(b'\x00')
    if null_idx >= 0:
        data = data[:null_idx]
    return data.decode('utf-8', errors='replace')

def alloc_mem(handle, size):
    """Allocate memory in the target process."""
    addr = kernel32.VirtualAllocEx(handle, None, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE)
    return addr

def write_string(handle, address, string):
    """Write a string to process memory (with null terminator)."""
    data = string.encode('utf-8') + b'\x00'
    return write_mem(handle, address, data)

# ── Game Memory Layout ───────────────────────────────────────────────────────
# From NHA's open-source CT: https://github.com/dr-NHA/NHA_Borderlands4
#
# Backpack pointer chain: [[[[[GEngine+0x1358]+0x38]]+0x30]+0x398]
# Array pointer offset:  +0x880  (was 0x878 in older builds)
# Array count offset:    +0x888  (was 0x880)
# Array max offset:      +0x88C  (was 0x884)
# Item size:             0x150
# Parts String pointer:  item + 0xB8
# EquipSlot:             item + 0x10D (255 = free)
# Quantity:              item + 0xF8
# Flags:                 item + 0xFC

# GEngine offset — this needs to be found via AOB scan at runtime
# The NHA CT scans for it; we'll use a simpler approach

def find_gengine(handle, base_address):
    """Find GEngine pointer using the scanner module."""
    try:
        from bl4_scanner import find_gengine_via_aob, get_module_info
        pid = kernel32.GetProcessId(handle)
        base, size = get_module_info(pid)
        if base and size:
            return find_gengine_via_aob(handle, base, size)
    except Exception as e:
        print(f"[!] Auto-scan failed: {e}")
    return None

class BL4Bridge:
    def __init__(self):
        self.pid = None
        self.handle = None
        self.gengine = None
        self.connected = False

    def attach(self):
        """Attach to the Borderlands 4 process and auto-find GEngine."""
        self.pid, self.handle = find_process('borderlands4')
        if not self.handle:
            return {"ok": False, "error": "Borderlands 4 not found. Is the game running?"}
        self.connected = True

        # Auto-find GEngine — no Cheat Engine needed
        if not self.gengine:
            try:
                from find_gengine_direct import find_gengine_scan_sections
                from bl4_scanner import get_module_info
                base, size = get_module_info(self.pid)
                if base and size:
                    gengine = find_gengine_scan_sections(self.handle, base, size)
                    if gengine:
                        self.gengine = gengine
                        print(f"[+] GEngine auto-found: {hex(gengine)}")
            except Exception as e:
                print(f"[!] Auto-scan failed: {e}")

        result = {"ok": True, "pid": self.pid}
        if self.gengine:
            result["gengine"] = hex(self.gengine)
        return result

    def set_gengine(self, address):
        """Set GEngine address (user provides from Cheat Engine)."""
        self.gengine = address
        return {"ok": True, "gengine": hex(address)}

    def _resolve_backpack(self):
        """Walk the pointer chain to find the backpack array base."""
        if not self.handle or not self.gengine:
            return None, None, None

        # [[[[[GEngine+0x1358]+0x38]]+0x30]+0x398]
        p1 = read_ptr(self.handle, self.gengine + 0x1358)
        if not p1: return None, None, None
        p2 = read_ptr(self.handle, p1 + 0x38)
        if not p2: return None, None, None
        p3 = read_ptr(self.handle, p2)
        if not p3: return None, None, None
        p4 = read_ptr(self.handle, p3 + 0x30)
        if not p4: return None, None, None
        state = read_ptr(self.handle, p4 + 0x398)
        if not state: return None, None, None

        # Array info (offsets updated for current game build)
        array_ptr = read_ptr(self.handle, state + 0x880)
        array_count = read_u32(self.handle, state + 0x888)

        return state, array_ptr, array_count

    def read_backpack(self):
        """Read all backpack items and their serial codes."""
        state, array_ptr, count = self._resolve_backpack()
        if not array_ptr or not count:
            return {"ok": False, "error": "Could not find backpack. Are you in-game?"}

        items = []
        for i in range(count):
            item_addr = array_ptr + (i * 0x150)

            # Read Parts String (serial code)
            serial = read_string(self.handle, item_addr + 0xB8)
            equip_slot = read_mem(self.handle, item_addr + 0x10D, 1)
            equip_slot = equip_slot[0] if equip_slot else 255
            quantity = read_u32(self.handle, item_addr + 0xF8) or 1

            items.append({
                "slot": i,
                "serial": serial or "",
                "equipSlot": equip_slot,
                "quantity": quantity,
                "address": hex(item_addr),
            })

        return {"ok": True, "count": count, "items": items}

    def inject_item(self, serial_code):
        """Inject a Base85 serial code as a new backpack item."""
        if not serial_code.startswith("@U"):
            return {"ok": False, "error": "Serial must start with @U"}

        state, array_ptr, count = self._resolve_backpack()
        if not state:
            return {"ok": False, "error": "Could not find backpack"}

        # Read current array max
        array_max = read_u32(self.handle, state + 0x88C)
        if array_max is None:
            return {"ok": False, "error": "Could not read array max"}

        if count >= array_max:
            return {"ok": False, "error": f"Backpack full ({count}/{array_max})"}

        # Copy the first item as a template (0x150 bytes)
        if count == 0:
            return {"ok": False, "error": "Backpack is empty — need at least one item as template"}

        template_addr = array_ptr
        template_data = read_mem(self.handle, template_addr, 0x150)
        if not template_data:
            return {"ok": False, "error": "Could not read template item"}

        # Write the new item at the end of the array
        new_addr = array_ptr + (count * 0x150)
        if not write_mem(self.handle, new_addr, template_data):
            return {"ok": False, "error": "Could not write new item"}

        # Set new indices
        new_index = count + 1
        write_mem(self.handle, new_addr, struct.pack('<I', new_index))             # ReplicationID
        write_mem(self.handle, new_addr + 0x10, struct.pack('<I', new_index))      # InstanceId
        write_mem(self.handle, new_addr + 0x108, struct.pack('<I', new_index))     # Handle
        write_mem(self.handle, new_addr + 0x10D, bytes([255]))                     # EquipSlot = free

        # Allocate memory for the serial string and write it
        str_mem = alloc_mem(self.handle, len(serial_code) + 16)
        if not str_mem:
            return {"ok": False, "error": "Could not allocate memory for serial"}

        write_string(self.handle, str_mem, serial_code)

        # Update the Parts String pointer to our new string
        write_mem(self.handle, new_addr + 0xB8, struct.pack('<Q', str_mem))

        # Increment the array count
        write_mem(self.handle, state + 0x888, struct.pack('<I', count + 1))

        return {
            "ok": True,
            "slot": count,
            "serial": serial_code,
            "address": hex(new_addr),
            "message": f"Injected item to slot {count}. Open inventory to see it.",
        }

    def status(self):
        """Get current connection status."""
        return {
            "connected": self.connected,
            "pid": self.pid,
            "gengine": hex(self.gengine) if self.gengine else None,
        }

# ── WebSocket Server ─────────────────────────────────────────────────────────

bridge = BL4Bridge()

async def handle_ws(websocket):
    """Handle WebSocket messages from the web app."""
    print(f"[Bridge] Client connected")
    try:
        async for message in websocket:
            try:
                req = json.loads(message)
                action = req.get("action", "")

                if action == "ping":
                    resp = {"ok": True, "bridge": "bl4-live-injector", "version": "1.0.0"}

                elif action == "attach":
                    resp = bridge.attach()

                elif action == "set_gengine":
                    addr = int(req.get("address", "0"), 0)
                    resp = bridge.set_gengine(addr)

                elif action == "status":
                    resp = bridge.status()

                elif action == "read_backpack":
                    resp = bridge.read_backpack()

                elif action == "inject":
                    serial = req.get("serial", "")
                    resp = bridge.inject_item(serial)

                else:
                    resp = {"ok": False, "error": f"Unknown action: {action}"}

                if "_id" in req:
                    resp["_id"] = req["_id"]
                await websocket.send(json.dumps(resp))

            except Exception as e:
                await websocket.send(json.dumps({"ok": False, "error": str(e)}))

    except Exception:
        pass
    finally:
        print(f"[Bridge] Client disconnected")

async def main():
    try:
        import websockets
    except ImportError:
        print("Installing websockets...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets

    port = 27015
    print(f"""
╔══════════════════════════════════════════════════════╗
║          BL4 Live Injector Bridge v1.0.0             ║
║                                                      ║
║  WebSocket server running on ws://localhost:{port}     ║
║                                                      ║
║  1. Open Borderlands 4                               ║
║  2. Go to bl4editor.com                              ║
║  3. Build an item and click 'Inject to Game'         ║
║                                                      ║
║  Press Ctrl+C to stop                                ║
╚══════════════════════════════════════════════════════╝
""")

    async with websockets.serve(
        handle_ws, "localhost", port,
        origins=None,  # Allow all origins (bl4editor.com connects here)
    ):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
