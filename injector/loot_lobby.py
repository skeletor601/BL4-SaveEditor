"""
Loot Lobby — Mass-inject items into other players' backpacks in co-op.

How it works:
1. Find all player pawns in the world actor array
2. For each co-op player, find their PlayerState → Backpack
3. Inject items from a file directly into their backpack
4. Items appear in their inventory instantly — no dropping needed

Usage:
1. Host or join a co-op game
2. Put @U serial codes in loot_items.txt (one per line)
3. Run: python loot_lobby.py
4. Select which players to give items to
5. Items injected into their backpacks
"""

import struct
import time
import os

from bl4_scanner import (
    find_process, get_module_info, read_ptr, read_u32, read_mem,
    write_mem, alloc_mem
)
from find_gengine_direct import find_gengine_scan_sections

# ── Player Discovery ─────────────────────────────────────────────────────────

def find_all_players(handle, gengine):
    """
    Find all player pawns in the world, including local player.
    Returns list of { pawn, state, is_local, backpack_count, name_hint }.

    World actors: GEngine+0xC20 → +0x78 → +0x30 → Level
      Level+0xA0 = actors array (ptr)
      Level+0xA8 = actors count (u32)

    Each actor at array[i] is a pointer (8 bytes).
    Player actors have team "Team_Player" at:
      actor+0x880 → +0x08 → +0x0C (FName index)

    From pawn, we try multiple offsets to find PlayerState.
    """
    # Get local player pawn for comparison
    gi = read_ptr(handle, gengine + 0x1358)
    lp = read_ptr(handle, gi + 0x38)
    p0 = read_ptr(handle, lp)
    pc = read_ptr(handle, p0 + 0x30)
    local_pawn = read_ptr(handle, pc + 0x3D0)
    local_state = read_ptr(handle, pc + 0x398)

    players = []

    # Add local player
    if local_state:
        bp_count = read_u32(handle, local_state + 0x888) or 0
        players.append({
            'pawn': local_pawn,
            'state': local_state,
            'is_local': True,
            'backpack_count': bp_count,
            'name': 'YOU (Local Player)',
        })

    # Get world level
    # GEngine+0xC20 → viewport → +0x78 → world → +0x30 → level
    viewport = read_ptr(handle, gengine + 0xC20)
    if not viewport:
        print("  [!] Could not find viewport")
        return players

    world = read_ptr(handle, viewport + 0x78)
    if not world:
        print("  [!] Could not find world")
        return players

    level = read_ptr(handle, world + 0x30)
    if not level:
        print("  [!] Could not find level")
        return players

    actors_ptr = read_ptr(handle, level + 0xA0)
    actors_count = read_u32(handle, level + 0xA8)

    if not actors_ptr or not actors_count:
        print("  [!] Could not find actors array")
        return players

    print(f"  World actors: {actors_count}")

    # Iterate actors to find other players
    for i in range(min(actors_count, 5000)):
        actor = read_ptr(handle, actors_ptr + i * 8)
        if not actor or actor < 0x10000:
            continue
        if actor == local_pawn:
            continue  # Skip local player (already added)

        # Check if this is a player by looking at team component
        # actor+0x880 → team component
        team_comp = read_ptr(handle, actor + 0x880)
        if not team_comp:
            continue
        team_obj = read_ptr(handle, team_comp + 0x08)
        if not team_obj:
            continue

        # We can't resolve FNames without FNamePool, so instead
        # check if this actor has a valid PlayerState-like structure
        # Try known pawn→state offsets
        state = None
        for state_offset in [0x2B0, 0x2B8, 0x2C0, 0x2C8, 0x2D0, 0x298, 0x2A0, 0x2A8]:
            candidate = read_ptr(handle, actor + state_offset)
            if not candidate or candidate < 0x10000:
                continue
            # Check if it looks like a PlayerState (has backpack-like TArray)
            bp_data = read_ptr(handle, candidate + 0x880)
            bp_count = read_u32(handle, candidate + 0x888)
            if bp_data and bp_data > 0x10000 and bp_count is not None and bp_count < 500:
                # Verify with @U string
                if bp_count > 0:
                    str_ptr = read_ptr(handle, bp_data + 0xB8)
                    if str_ptr:
                        raw = read_mem(handle, str_ptr, 4)
                        if raw and raw[:2] == b'@U':
                            state = candidate
                            break
                else:
                    # Empty backpack but valid structure
                    state = candidate
                    break

        if not state:
            # Also try: pawn has a controller at some offset, controller+0x398 = state
            for ctrl_offset in [0x2D8, 0x2E0, 0x2E8, 0x300, 0x308, 0x310]:
                ctrl = read_ptr(handle, actor + ctrl_offset)
                if not ctrl or ctrl < 0x10000:
                    continue
                candidate = read_ptr(handle, ctrl + 0x398)
                if not candidate or candidate < 0x10000:
                    continue
                bp_data = read_ptr(handle, candidate + 0x880)
                bp_count = read_u32(handle, candidate + 0x888)
                if bp_data and bp_data > 0x10000 and bp_count is not None and bp_count < 500:
                    state = candidate
                    break

        if state and state != local_state:
            bp_count = read_u32(handle, state + 0x888) or 0
            players.append({
                'pawn': actor,
                'state': state,
                'is_local': False,
                'backpack_count': bp_count,
                'name': f'Co-op Player (Pawn: {hex(actor)[:10]})',
            })

    return players


# ── Injection ────────────────────────────────────────────────────────────────

def inject_items_to_player(handle, state, serials):
    """Inject multiple serial codes into a player's backpack."""
    bp_data = read_ptr(handle, state + 0x880)
    bp_count = read_u32(handle, state + 0x888)
    bp_max = read_u32(handle, state + 0x88C)
    max_size = read_u32(handle, state + 0x924)

    if not bp_data or bp_count is None or bp_max is None:
        return 0, "Could not read backpack"

    needed = len(serials)
    available = bp_max - bp_count

    # Extend array if needed
    if available < needed:
        new_max = bp_count + needed + 8  # Extra padding
        if max_size and new_max > max_size:
            new_max = max_size
        if new_max <= bp_count:
            return 0, f"Backpack full ({bp_count}/{max_size})"

        new_array_size = new_max * 0x150
        new_array = alloc_mem(handle, new_array_size)
        if not new_array:
            return 0, "Could not allocate memory"

        # Copy existing items
        if bp_count > 0:
            old_data = read_mem(handle, bp_data, bp_count * 0x150)
            if old_data:
                write_mem(handle, new_array, old_data)

        # Update TArray pointers
        write_mem(handle, state + 0x880, struct.pack('<Q', new_array))
        write_mem(handle, state + 0x88C, struct.pack('<I', new_max))
        bp_data = new_array
        bp_max = new_max

    # Read template from first item (or create blank)
    template = None
    if bp_count > 0:
        template = read_mem(handle, bp_data, 0x150)

    if not template:
        template = b'\x00' * 0x150

    # Inject each item
    injected = 0
    for idx, serial in enumerate(serials):
        if bp_count >= bp_max:
            break

        new_addr = bp_data + (bp_count * 0x150)

        # Write template
        write_mem(handle, new_addr, template)

        # Set unique IDs
        new_id = bp_count + 200 + idx
        write_mem(handle, new_addr + 0x00, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x10, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x108, struct.pack('<I', new_id))
        write_mem(handle, new_addr + 0x10D, bytes([0xFF]))  # Free slot
        write_mem(handle, new_addr + 0xF8, struct.pack('<I', 1))  # Qty
        write_mem(handle, new_addr + 0xFC, struct.pack('<I', 1))  # Flags

        # Allocate and write serial string
        str_buf = alloc_mem(handle, len(serial) + 64)
        if not str_buf:
            break
        serial_bytes = serial.encode('utf-8') + b'\x00'
        write_mem(handle, str_buf, serial_bytes)
        write_mem(handle, new_addr + 0xB8, struct.pack('<Q', str_buf))

        # Increment count
        bp_count += 1
        write_mem(handle, state + 0x888, struct.pack('<I', bp_count))
        injected += 1

    return injected, f"Injected {injected}/{len(serials)} items"


# ── Main ─────────────────────────────────────────────────────────────────────

def load_items():
    """Load serial codes from loot_items.txt (one per line)."""
    path = os.path.join(os.path.dirname(__file__), 'loot_items.txt')
    if not os.path.exists(path):
        # Fall back to inject_code.txt
        path = os.path.join(os.path.dirname(__file__), 'inject_code.txt')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip().startswith('@U')]
    return lines


def main():
    print("=" * 60)
    print("  BL4 Loot Lobby — Mass Item Injector")
    print("=" * 60)

    # Load items
    items = load_items()
    if not items:
        print("\n[!] No items found!")
        print("    Put @U codes in loot_items.txt (one per line)")
        print("    Or use inject_code.txt")
        input("\nPress Enter to exit...")
        return

    print(f"\n[+] Loaded {len(items)} item(s) to distribute")
    for i, serial in enumerate(items[:5]):
        print(f"    [{i}] {serial[:55]}...")
    if len(items) > 5:
        print(f"    ... and {len(items) - 5} more")

    # Attach to game
    pid, handle = find_process()
    if not handle:
        print("\n[!] Game not found!")
        input("Press Enter to exit...")
        return

    base, size = get_module_info(pid)
    print(f"\n[+] PID: {pid}")

    # Find GEngine
    gengine = find_gengine_scan_sections(handle, base, size)
    if not gengine:
        print("[!] Could not find GEngine")
        input("Press Enter to exit...")
        return

    # Find all players
    print(f"\n[*] Finding players in session...")
    players = find_all_players(handle, gengine)

    print(f"\n  Players found: {len(players)}")
    for i, p in enumerate(players):
        local = " (YOU)" if p['is_local'] else ""
        print(f"    [{i}] {p['name']}{local} — {p['backpack_count']} items in backpack")

    if len(players) <= 1:
        print(f"\n  Only local player found.")
        print(f"  Options:")
        print(f"    1. Inject {len(items)} items into YOUR backpack")
        print(f"    0. Cancel")
    else:
        print(f"\n  Options:")
        print(f"    a. Inject into ALL other players")
        for i, p in enumerate(players):
            if not p['is_local']:
                print(f"    {i}. Inject into {p['name']}")
        print(f"    s. Inject into SELF (your backpack)")
        print(f"    0. Cancel")

    choice = input("\n  Choose: ").strip().lower()

    targets = []
    if choice == '0':
        print("  Cancelled.")
        input("Press Enter to exit...")
        return
    elif choice == 'a':
        targets = [p for p in players if not p['is_local']]
    elif choice == 's' or choice == '1' and len(players) <= 1:
        targets = [p for p in players if p['is_local']]
    else:
        try:
            idx = int(choice)
            if 0 <= idx < len(players):
                targets = [players[idx]]
        except ValueError:
            pass

    if not targets:
        print("  No valid target selected.")
        input("Press Enter to exit...")
        return

    # Inject!
    print(f"\n[*] Injecting {len(items)} items into {len(targets)} player(s)...")
    for p in targets:
        print(f"\n  → {p['name']}:")
        count, msg = inject_items_to_player(handle, p['state'], items)
        print(f"    {msg}")

    print(f"\n{'='*60}")
    print(f"  LOOT LOBBY COMPLETE!")
    print(f"  Players should check their inventory.")
    print(f"{'='*60}")

    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
