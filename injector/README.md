# BL4 Live Injector

Standalone Python tool that injects modded items directly into a running Borderlands 4 game. No Cheat Engine required.

## How It Works

1. **Attaches** to `Borderlands4.exe` via Windows API (ctypes)
2. **Auto-discovers GEngine** by scanning the game's data sections (~1.4 seconds)
3. **Walks the pointer chain** from GEngine → GameInstance → PlayerController → PlayerState → Backpack
4. **Reads/writes** backpack items using the game's TArray structure
5. **Communicates** with bl4editor.com via WebSocket (port 27015)

## Files

| File | Purpose |
|------|---------|
| `bl4_bridge.py` | WebSocket server — connects web app to the game |
| `bl4_scanner.py` | Core: process attach, memory read/write, PE parsing, pointer chain |
| `find_gengine_direct.py` | Auto-discovers GEngine by scanning data sections |
| `test_inject.py` | Standalone injection test (reads serial from `inject_code.txt`) |
| `inject_code.txt` | Put an @U serial code here for test injection |

## Usage

```bash
# Run the bridge (connects web app to game):
python bl4_bridge.py

# Or test injection standalone:
# 1. Put @U code in inject_code.txt
# 2. Run:
python test_inject.py
```

Requirements: Python 3.10+, Windows, run as Administrator.

---

## UPDATING AFTER GAME PATCHES

When Borderlands 4 updates, offsets may shift. Here's exactly what to check and how to fix it.

### What Can Break

1. **GEngine auto-discovery** — The scanner checks data sections for pointers with a valid chain. This usually still works after updates because it's brute-force (no hardcoded offsets for discovery itself).

2. **Pointer chain offsets** — The offsets from GEngine → GameInstance → Player → State may shift.

3. **Backpack TArray offsets** — The offsets from PlayerState to the backpack array may shift.

4. **Item slot layout** — The 0x150 byte item structure and field offsets within it may change.

### Current Offsets (April 2026 Build)

```python
# Pointer chain from GEngine:
GEngine + 0x1358  → GameInstance
GameInstance + 0x38  → LocalPlayers array
LocalPlayers[0]      → deref (Player0)
Player0 + 0x30       → PlayerController
Controller + 0x398   → PlayerState
Controller + 0x3D0   → PlayerPawn

# Backpack TArray (from PlayerState):
State + 0x880   → BackpackItems.Data (pointer to array)
State + 0x888   → BackpackItems.Count (u32)
State + 0x88C   → BackpackItems.Max (u32)
State + 0x924   → BackpackContainer.MaxSize.Value (u32)

# Item slot (0x150 bytes each):
+0x00   ReplicationID (u32)
+0x10   InstanceId (u32)
+0x18   Type Pointer (ptr)
+0x20   Info Pointer (ptr)
+0xB8   Parts String Pointer (ptr → @U... Base85 serial)
+0xF8   Quantity (u32)
+0xFC   Flags (u32)
+0x108  Handle (u32)
+0x10D  EquipSlot (byte, 0xFF = unequipped)
+0x138  MaxQuantity (u32)
+0x13C  IsLocked (byte)
```

### How to Fix After an Update

#### Step 1: Check if GEngine auto-discovery still works

```bash
python find_gengine_direct.py
```

If it finds GEngine and shows your inventory items, the chain is fine. Skip to Step 4.

If it fails, continue to Step 2.

#### Step 2: Find GEngine manually with Cheat Engine

1. Install Cheat Engine + load the NHA table from https://github.com/dr-NHA/NHA_Borderlands4
2. Attach to BL4, click "Attach" in NHA GUI
3. Look for `GameEngineObject Found: 0xXXXXXXXX` in the log
4. Use that address to test the chain:

```bash
python probe_backpack.py
# Enter the GEngine address when prompted
```

#### Step 3: If the chain is broken, find new offsets

Run `probe_backpack.py` with the manual GEngine address. It walks each step and shows where the chain breaks.

**If GEngine+0x1358 fails:**
- The GameInstance offset changed
- In CE, look at the GEngine object and find which offset now leads to a valid GameInstance
- Common: offset shifts by 0x8 or 0x10

**If backpack offsets are wrong:**
- Run `probe_exact.py` with the GEngine address
- It scans PlayerState for any TArray containing @U serial strings
- Will output the new data/count/max offsets

**Update these files with new offsets:**
- `bl4_scanner.py` — `walk_chain()` function, backpack offsets
- `bl4_bridge.py` — `_resolve_backpack()` function, backpack offsets in comments
- `find_gengine_direct.py` — chain validation offsets in `find_gengine_scan_sections()`
- `test_inject.py` — backpack offsets in `inject()`

#### Step 4: Verify injection still works

```bash
# Put a test @U code in inject_code.txt, then:
python test_inject.py
```

Check in-game that the item appears correctly.

### Offset History

| Date | Build | Change |
|------|-------|--------|
| Dec 2025 | NHA v1.01 | Original offsets: State+0x878/0x880/0x884 |
| Apr 2026 | Current | Shifted +8: State+0x880/0x888/0x88C |

### Reference: NHA Cheat Engine Table

The pointer chain and item structure are based on dr NHA's open-source table:
- GitHub: https://github.com/dr-NHA/NHA_Borderlands4
- The NHA table's Lua code is the authoritative reference for BL4 memory layout
- Key functions: `UE.ExtendMemoryArray()`, `UE.ArrayAlgo()`, `UE.MemoryRecordList()`

### Probe Scripts (for debugging)

| Script | What it does |
|--------|-------------|
| `probe_backpack.py` | Given GEngine, walks the chain step by step |
| `probe_exact.py` | Scans PlayerState for TArrays with @U strings |
| `probe_fnamepool.py` | Searches for FNamePool (not needed currently) |
| `probe_fname2.py` | Alternative FNamePool search |
| `probe_fname_detail.py` | Dumps FNamePool structure details |
| `probe_uobj.py` | Dumps UObjectArray structure |
| `ue_auto.py` | UObjectArray-based GEngine finder (not used, kept for reference) |
