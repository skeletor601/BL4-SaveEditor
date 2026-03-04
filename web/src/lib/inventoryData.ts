/**
 * Read inventory/backpack and equipped slots from save data (for display; no decode yet).
 * Uses path-based lookup first, then falls back to walking the whole tree for any node with a "serial" key (like desktop _walk_for_serials).
 */

import type { SaveData } from "@/contexts/SaveContext";

export interface ItemSlot {
  slotKey: string;
  serial: string;
  flags: number;
  stateFlags: number;
}

export interface InventorySlots {
  backpack: ItemSlot[];
  equipped: ItemSlot[];
  lostLoot: ItemSlot[];
}

/** Like ItemSlot but includes path into save data (for update-item). */
export interface ItemSlotWithPath extends ItemSlot {
  path: string[];
}

function getState(data: SaveData): Record<string, unknown> | null {
  const state = (data.state as Record<string, unknown>) ?? data;
  return state && typeof state === "object" ? state : null;
}

/** Recursively find first object in tree that has the given key and is a dict (for backpack / equipped). */
function findNodeByKey(node: unknown, targetKey: string): Record<string, unknown> | null {
  if (node == null) return null;
  if (typeof node === "object" && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const keyToTry = targetKey.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === keyToTry) {
        const v = obj[k];
        if (v != null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
        break;
      }
    }
    for (const v of Object.values(obj)) {
      const found = findNodeByKey(v, targetKey);
      if (found) return found;
    }
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = findNodeByKey(v, targetKey);
      if (found) return found;
    }
  }
  return null;
}

/** Extract serial string from a slot value (may be direct or nested under item/data/etc.). */
function getSerialFromSlotValue(val: unknown): string {
  if (val == null || typeof val !== "object") return "";
  const obj = val as Record<string, unknown>;
  if (typeof obj.serial === "string") return obj.serial;
  if (obj.item && typeof obj.item === "object" && typeof (obj.item as Record<string, unknown>).serial === "string")
    return (obj.item as Record<string, unknown>).serial as string;
  if (obj.data && typeof obj.data === "object" && typeof (obj.data as Record<string, unknown>).serial === "string")
    return (obj.data as Record<string, unknown>).serial as string;
  if (obj.payload && typeof obj.payload === "object" && typeof (obj.payload as Record<string, unknown>).serial === "string")
    return (obj.payload as Record<string, unknown>).serial as string;
  return "";
}

function readSlotsFromObject(obj: Record<string, unknown> | null): ItemSlot[] {
  if (!obj || typeof obj !== "object") return [];
  const slots: ItemSlot[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase().startsWith("slot_") && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const serial = getSerialFromSlotValue(v);
      slots.push({
        slotKey: key,
        serial,
        flags: typeof v.flags === "number" ? v.flags : 0,
        stateFlags: typeof v.state_flags === "number" ? v.state_flags : 0,
      });
    }
  }
  slots.sort((a, b) => {
    const na = parseInt(a.slotKey.replace(/^slot_/i, ""), 10);
    const nb = parseInt(b.slotKey.replace(/^slot_/i, ""), 10);
    return na - nb;
  });
  return slots;
}

/** Walk entire save tree and collect every object that has a "serial" string (item nodes). Returns path + item. */
function walkForSerials(
  node: unknown,
  path: string[] = []
): Array<{ path: string[]; item: Record<string, unknown> }> {
  const found: Array<{ path: string[]; item: Record<string, unknown> }> = [];
  if (node == null) return found;
  if (typeof node === "object" && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const serial = obj.serial;
    if (typeof serial === "string" && serial.length > 0) {
      found.push({ path, item: obj });
      return found;
    }
    for (const [k, v] of Object.entries(obj)) {
      found.push(...walkForSerials(v, path.concat(k)));
    }
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => found.push(...walkForSerials(v, path.concat(String(i)))));
  }
  return found;
}

/** Build backpack/equipped/lostLoot arrays from walked items (path determines container + slot). */
function slotsFromWalk(data: SaveData): InventorySlots {
  const backpack: ItemSlot[] = [];
  const equipped: ItemSlot[] = [];
  const lostLoot: ItemSlot[] = [];
  const seen = new Set<string>();

  const items = walkForSerials(data);
  for (const { path, item } of items) {
    const pathStr = path.join("/").toLowerCase();
    if (pathStr.includes("unknown_items")) continue;
    const serial = typeof item.serial === "string" ? item.serial : "";
    const slotKey =
      path.slice().reverse().find((p) => /^slot_\d+$/i.test(p)) ?? path.slice(-1)[0] ?? "slot_0";
    const dedupe = `${pathStr}|${slotKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const slot: ItemSlot = {
      slotKey,
      serial,
      flags: typeof item.flags === "number" ? item.flags : 0,
      stateFlags: typeof item.state_flags === "number" ? item.state_flags : 0,
    };

    if (pathStr.includes("lostloot") || pathStr.includes("lost_loot")) {
      lostLoot.push(slot);
    } else if (
      pathStr.includes("equipped_inventory") ||
      pathStr.includes("equipped") ||
      pathStr.includes("equipment")
    ) {
      equipped.push(slot);
    } else if (pathStr.includes("inventory") && pathStr.includes("backpack")) {
      backpack.push(slot);
    }
  }

  const sortSlots = (arr: ItemSlot[]) =>
    arr.sort((a, b) => {
      const na = parseInt(String(a.slotKey).replace(/^slot_/i, ""), 10);
      const nb = parseInt(String(b.slotKey).replace(/^slot_/i, ""), 10);
      return na - nb;
    });
  sortSlots(backpack);
  sortSlots(equipped);
  sortSlots(lostLoot);
  return { backpack, equipped, lostLoot };
}

/** Backpack slots with path into save (for weapon edit update-item). Uses walk so path is always available. */
export function getBackpackSlotsWithPaths(data: SaveData | null): ItemSlotWithPath[] {
  if (!data || typeof data !== "object") return [];
  const backpack: ItemSlotWithPath[] = [];
  const seen = new Set<string>();
  const items = walkForSerials(data);
  for (const { path, item } of items) {
    const pathStr = path.join("/").toLowerCase();
    if (pathStr.includes("unknown_items")) continue;
    if (!pathStr.includes("inventory") || !pathStr.includes("backpack")) continue;
    const serial = typeof item.serial === "string" ? item.serial : "";
    const slotKey =
      path.slice().reverse().find((p) => /^slot_\d+$/i.test(p)) ?? path.slice(-1)[0] ?? "slot_0";
    const dedupe = `${pathStr}|${slotKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    backpack.push({
      slotKey,
      serial,
      flags: typeof item.flags === "number" ? item.flags : 0,
      stateFlags: typeof item.state_flags === "number" ? item.state_flags : 0,
      path,
    });
  }
  backpack.sort((a, b) => {
    const na = parseInt(String(a.slotKey).replace(/^slot_/i, ""), 10);
    const nb = parseInt(String(b.slotKey).replace(/^slot_/i, ""), 10);
    return na - nb;
  });
  return backpack;
}

export function getInventorySlots(data: SaveData | null): InventorySlots {
  if (!data || typeof data !== "object") return { backpack: [], equipped: [], lostLoot: [] };
  const state = getState(data);
  if (!state) return { backpack: [], equipped: [], lostLoot: [] };

  const inv = state.inventory as Record<string, unknown> | undefined;

  // Backpack
  let backpackObj: Record<string, unknown> | null = null;
  if (inv && typeof inv === "object") {
    const bp = inv.backpack ?? (inv as Record<string, unknown>).Backpack;
    if (bp && typeof bp === "object" && !Array.isArray(bp)) backpackObj = bp as Record<string, unknown>;
    else if (inv.items && typeof inv.items === "object" && !Array.isArray(inv.items)) {
      const items = inv.items as Record<string, unknown>;
      const bp2 = items.backpack ?? items.Backpack;
      if (bp2 && typeof bp2 === "object" && !Array.isArray(bp2)) backpackObj = bp2 as Record<string, unknown>;
    }
  }
  if (!backpackObj && typeof data.inventory === "object" && data.inventory && !Array.isArray(data.inventory)) {
    const rootInv = data.inventory as Record<string, unknown>;
    const bp = rootInv.backpack ?? rootInv.Backpack;
    if (bp && typeof bp === "object" && !Array.isArray(bp)) backpackObj = bp as Record<string, unknown>;
  }
  if (!backpackObj) backpackObj = findNodeByKey(data, "backpack") ?? findNodeByKey(data, "Backpack");

  // Equipped: try state.equipped_inventory.equipped, state.inventory.equipped, then walk
  let equippedObj: Record<string, unknown> | null = null;
  const eqInv = state.equipped_inventory as Record<string, unknown> | undefined;
  if (eqInv && typeof eqInv === "object") {
    const eq = eqInv.equipped ?? (eqInv as Record<string, unknown>).Equipped ?? (eqInv as Record<string, unknown>).slots;
    if (eq && typeof eq === "object" && !Array.isArray(eq)) equippedObj = eq as Record<string, unknown>;
  }
  if (!equippedObj && inv && typeof inv === "object") {
    const eqUnderInv = (inv as Record<string, unknown>).equipped ?? (inv as Record<string, unknown>).Equipped;
    if (eqUnderInv && typeof eqUnderInv === "object" && !Array.isArray(eqUnderInv))
      equippedObj = eqUnderInv as Record<string, unknown>;
  }
  if (!equippedObj) equippedObj = findNodeByKey(data, "equipped") ?? findNodeByKey(data, "Equipped") ?? findNodeByKey(data, "equipment");

  // Lost Loot
  let lostLootObj: Record<string, unknown> | null = null;
  if (inv && typeof inv === "object") {
    const ll = inv.lostloot ?? inv.lost_loot ?? (inv as Record<string, unknown>).LostLoot;
    if (ll && typeof ll === "object" && !Array.isArray(ll)) lostLootObj = ll as Record<string, unknown>;
    else if (inv.items && typeof inv.items === "object" && !Array.isArray(inv.items)) {
      const items = inv.items as Record<string, unknown>;
      const ll2 = items.lostloot ?? items.lost_loot ?? items.LostLoot;
      if (ll2 && typeof ll2 === "object" && !Array.isArray(ll2)) lostLootObj = ll2 as Record<string, unknown>;
    }
  }
  if (!lostLootObj) lostLootObj = findNodeByKey(data, "lostloot") ?? findNodeByKey(data, "lost_loot") ?? findNodeByKey(data, "LostLoot");

  const pathBased: InventorySlots = {
    backpack: readSlotsFromObject(backpackObj),
    equipped: readSlotsFromObject(equippedObj),
    lostLoot: readSlotsFromObject(lostLootObj),
  };

  const totalPathBased = pathBased.backpack.length + pathBased.equipped.length + pathBased.lostLoot.length;
  if (totalPathBased > 0) {
    const pathEquippedEmpty =
      pathBased.equipped.length > 0 && pathBased.equipped.every((e) => !e.serial?.trim());
    if (pathEquippedEmpty) {
      const fromWalk = slotsFromWalk(data);
      if (fromWalk.equipped.length > 0)
        return { ...pathBased, equipped: fromWalk.equipped };
    }
    return pathBased;
  }

  return slotsFromWalk(data);
}
