# BL4 Live Injector — Full Desktop App Implementation Plan

## Vision
A standalone Windows .exe that users download from bl4editor.com. Double-click to run, it auto-attaches to Borderlands 4, and connects to the web app. Users click "Inject to Game" in the browser and items appear in their inventory instantly.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     Memory R/W     ┌───────────────┐
│  bl4editor.com  │ ◄──────────────────► │  BL4 Injector    │ ◄────────────────► │ Borderlands4  │
│  (browser)      │    ws://27015       │  (.exe / tray)   │    ctypes/WinAPI   │    .exe        │
└─────────────────┘                     └──────────────────┘                    └───────────────┘
```

## User Flow
1. Download `BL4_Injector.exe` from bl4editor.com (one-time, ~15MB)
2. Launch Borderlands 4, load into a character
3. Double-click `BL4_Injector.exe` — it auto-attaches, shows system tray icon
4. Open bl4editor.com, build an item
5. Click "Inject to Game" → item appears in inventory
6. Injector stays running in system tray, reconnects if game restarts

## Components to Build

### 1. Core Engine (Python — already built)
Files: `bl4_scanner.py`, `find_gengine_direct.py`, `bl4_bridge.py`

Already working:
- Process attachment via ctypes/Windows API
- GEngine auto-discovery (~1.4s, scans data sections)
- Pointer chain walking (GEngine → PlayerState → Backpack)
- TArray reading and extension
- Item injection (write serial string + slot metadata)
- WebSocket server on port 27015

### 2. Web App Integration (TypeScript — already built)
File: `web/src/lib/injectorBridge.ts`

Already working:
- WebSocket client connecting to ws://localhost:27015
- Auto-reconnect with 5s delay
- `injectItem(serial)` API
- `readBackpack()` API
- Status tracking (disconnected → connecting → connected → game_attached)

UI (in `web/src/mobile/builders/shared.tsx`):
- Green "Inject to Game" button on all builders
- Shows injection result/errors
- Toast notifications

### 3. Desktop App Wrapper (TODO)

**Option A: PyInstaller + System Tray**
- Use `pystray` for system tray icon
- Package with PyInstaller: `pyinstaller --onefile --noconsole --icon=icon.ico bl4_app.py`
- System tray menu: Status, Reconnect, Quit
- Auto-start WebSocket server on launch
- Auto-attach to game when detected
- Show balloon notifications for inject success/failure

**Option B: Electron (heavier but more UI options)**
- Bundle Python bridge as subprocess
- Full GUI window with status, logs, inventory viewer
- Auto-updater via electron-updater
- More complex but better UX

**Recommended: Option A** — lighter, simpler, users just need the .exe

### 4. Auto-Download Flow (TODO)

When user clicks "Inject to Game" and bridge isn't running:
1. Show modal: "BL4 Injector Required"
2. "Download BL4_Injector.exe" button → direct download from bl4editor.com
3. Instructions: "Run the injector, then click Inject again"
4. Web app auto-detects when bridge connects (WebSocket reconnect loop)

Host the .exe at: `https://bl4editor.com/downloads/BL4_Injector.exe`
API endpoint to check latest version: `GET /api/injector/version`

### 5. Features to Add

#### Dump All Inventory (drop items for others)
- Read all backpack items
- For each item: call the game's "drop item" function or write to the drop queue
- Need to reverse-engineer: how does the game handle item drops?
- NHA table may have clues (check "Drop" or "Discard" related functions)
- Alternative: spawn items on ground near player using world actor spawning

#### Batch Inject
- Accept array of serial codes
- Inject multiple items in one operation
- Extend TArray once for all items, then write slots

#### Inventory Manager
- Read full backpack via WebSocket
- Show items in web UI with decoded names
- Delete items, reorder, lock/unlock
- Sync with save editor

#### Auto-Update Offsets
- After game update, run offset probe automatically
- If chain breaks, try nearby offsets (±0x8, ±0x10)
- Report new offsets to user or auto-fix
- Could phone home to bl4editor.com API for community-shared offset updates

## Memory Layout Reference

### Pointer Chain
```
GEngine + 0x1358  → GameInstance
  + 0x38  → LocalPlayers[0]
  + 0x0   → deref
  + 0x30  → PlayerController
  + 0x398 → PlayerState
  + 0x3D0 → PlayerPawn
```

### Backpack TArray (from PlayerState)
```
State + 0x880  → Data pointer
State + 0x888  → Count (u32)
State + 0x88C  → Max (u32)
State + 0x924  → MaxSize.Value (u32, SDU-based limit)
```

### Item Slot (0x150 bytes)
```
+0x00   ReplicationID (u32)
+0x04   ReplicationKey (u32)
+0x08   MostRecentArrayReplicationKey (u32)
+0x10   InstanceId (u32)
+0x18   Type Pointer (UObject*)
+0x20   Info Pointer (UObject*)
+0x28   Unknown Pointer
+0xB8   Parts String Pointer (char* → @U... Base85 serial)
+0xC0   Parts String Count (u32)
+0xC4   Parts String Max (u32)
+0xF8   Quantity (u32)
+0xFC   Flags (u32)
+0x108  Handle (u32)
+0x10C  Flags2 (u32)
+0x10D  EquipSlot (byte, 0xFF = unequipped)
+0x110  SummaryHash (u32)
+0x138  MaxQuantity (u32)
+0x13C  IsLocked (byte)
```

### GEngine Discovery Method
Scan all data sections (.data2, .rsrc, .srdata, .rdata) for 8-byte values where:
1. Value is a valid heap pointer (> 0x10000, < 0x7FFFFFFFFFFF)
2. Value is NOT within the module's own address range
3. Value + 0x1358 → valid pointer chain to backpack
4. Backpack contains items with @U serial strings
5. Skip candidates with 0 items (stale/secondary engine objects)

Typical scan time: ~1.4 seconds, tests ~80K unique pointers.

### Injection Method
1. Read backpack TArray (data ptr, count, max)
2. If count >= max: allocate new array (`VirtualAllocEx`), copy existing items, update data ptr and max
3. Copy slot 0 as template (0x150 bytes) to new slot position
4. Set unique IDs (ReplicationID, InstanceId, Handle)
5. Set EquipSlot = 0xFF (free)
6. Allocate string buffer (`VirtualAllocEx`), write @U serial
7. Update Parts String pointer to new buffer
8. Increment count

### Key Dependencies
- Python 3.10+ (for standalone scripts)
- PyInstaller (for .exe packaging)
- pystray (for system tray, optional)
- websockets (Python WebSocket server)
- No Cheat Engine required
- Must run as Administrator (process memory access)

### Build Command
```bash
pip install pyinstaller pystray websockets
pyinstaller --onefile --noconsole --icon=bl4_icon.ico --name=BL4_Injector bl4_app.py
# Output: dist/BL4_Injector.exe
```

### Security Notes
- The injector only reads/writes to the Borderlands 4 process
- No network traffic except localhost WebSocket (port 27015)
- No data leaves the user's machine
- All injection is client-side, single-player safe
- Does not modify game files on disk
- Based on open-source research (NHA's MIT-licensed Cheat Engine table)
