import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { getInventorySlotsWithPaths, type ItemSlotWithPath } from "@/lib/inventoryData";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";

export interface DecodedItem {
  name: string;
  itemType: string;
  level: number;
  manufacturer: string;
  /** Full deserialized string (header||parts) from decoder */
  decodedFull?: string;
}

interface PartLookupItem {
  code: string;
  itemType: string;
  partName: string;
  effect?: string;
  category?: string;
  manufacturer?: string;
  partType?: string;
  weaponType?: string;
  rarity?: string;
}

const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 17, label: "17" },
  { value: 33, label: "33" },
  { value: 65, label: "65" },
  { value: 129, label: "129" },
];

type ContainerKey = "backpack" | "equipped" | "lostLoot";
const CONTAINER_LABELS: Record<ContainerKey, string> = {
  backpack: "Backpack",
  equipped: "Equipped",
  lostLoot: "Lost Loot",
};

interface TreeItem {
  container: ContainerKey;
  slotKey: string;
  serial: string;
  flags: number;
  stateFlags: number;
  displayName: string;
  typeLabel: string;
  level: string;
  manufacturer: string;
  /** Full deserialized code (header||parts) when decoded */
  decodedFull: string;
  /** Path into save data for remove/update (from walk). */
  path: string[];
}

/** Generic words we should not use as the display name (keep decoder's "Manufacturer Type" instead). */
const GENERIC_NAME_WORDS = new Set([
  "rarity", "common", "uncommon", "rare", "epic", "legendary",
  "barrel", "body", "element", "firmware", "model", "skin", "part",
]);

function getPartByCodeOrPrefixed(
  code: string,
  itemTypeId: number | undefined,
  partsByCode: Map<string, PartLookupItem>
): PartLookupItem | undefined {
  const part = partsByCode.get(code);
  if (part) return part;
  // Decoded string often has single-number codes {95} {2}; DB has {itemType:part} e.g. {3:2}. Resolve.
  const single = code.match(/^\{(\d+)\}$/);
  if (single && itemTypeId != null) {
    const n = single[1];
    return partsByCode.get(`{${itemTypeId}:${n}}`) ?? undefined;
  }
  return undefined;
}

function preferItemNameFromParts(decoded: DecodedItem | undefined, partsByCode: Map<string, PartLookupItem>): string | undefined {
  if (!decoded?.decodedFull) return undefined;
  const str = decoded.decodedFull;
  // Header is "itemTypeId, 0, 1, level| ..." - first number is item type for resolving {n} -> {itemTypeId:n}
  const headerMatch = str.match(/^(\d+),/);
  const itemTypeId = headerMatch ? parseInt(headerMatch[1], 10) : undefined;

  const rarityCandidates: string[] = [];
  const barrelCandidates: string[] = [];
  // Match both {x:y} and {n} (single number)
  const re = /\{(\d+)(?::(\d+))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const code = m[2] != null ? `{${m[1]}:${m[2]}}` : `{${m[1]}}`;
    const part = getPartByCodeOrPrefixed(code, itemTypeId, partsByCode);
    if (!part) continue;
    const type = (part.partType ?? "").toLowerCase();
    const isRarity = type.includes("rarity");
    const isBarrel = type.includes("barrel");
    if (!isRarity && !isBarrel) continue;
    const raw = (part.effect || "").trim();
    if (!raw) continue;
    const base = raw.split(",")[0]?.split(" -")[0]?.trim() ?? "";
    if (!base || base.length < 3 || base.length > 40 || !/[a-zA-Z]/.test(base)) continue;
    if (GENERIC_NAME_WORDS.has(base.toLowerCase())) continue;
    if (isRarity) rarityCandidates.push(base);
    else if (isBarrel) barrelCandidates.push(base);
  }
  return rarityCandidates[0] ?? barrelCandidates[0];
}

function buildTreeItems(
  slots: { backpack: ItemSlotWithPath[]; equipped: ItemSlotWithPath[]; lostLoot: ItemSlotWithPath[] },
  decodeMap: Map<string, DecodedItem>,
  partsByCode: Map<string, PartLookupItem>
): TreeItem[] {
  const out: TreeItem[] = [];
  const add = (container: ContainerKey, list: ItemSlotWithPath[]) => {
    for (const s of list) {
      const decoded = s.serial ? decodeMap.get(s.serial) : undefined;
      const prettyName = decoded ? preferItemNameFromParts(decoded, partsByCode) : undefined;
      out.push({
        container,
        slotKey: s.slotKey,
        serial: s.serial,
        flags: s.flags,
        stateFlags: s.stateFlags,
        displayName: prettyName ?? decoded?.name ?? (s.serial ? `Item (${s.slotKey})` : "Empty"),
        typeLabel: decoded?.itemType ?? "Item",
        level: decoded != null ? String(decoded.level) : "—",
        manufacturer: decoded?.manufacturer ?? "—",
        decodedFull: decoded?.decodedFull ?? "",
        path: s.path,
      });
    }
  };
  add("backpack", slots.backpack);
  add("equipped", slots.equipped);
  add("lostLoot", slots.lostLoot);
  return out;
}

function groupByType(items: TreeItem[]): Map<string, TreeItem[]> {
  const map = new Map<string, TreeItem[]>();
  for (const item of items) {
    const key = item.typeLabel;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export default function BackpackView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const slots = saveData ? getInventorySlotsWithPaths(saveData) : { backpack: [], equipped: [], lostLoot: [] };
  const [search, setSearch] = useState("");
  const [itemSerial, setItemSerial] = useState("");
  const [flagValue, setFlagValue] = useState(1);
  const [selected, setSelected] = useState<TreeItem | null>(null);
  const [expanded, setExpanded] = useState<Set<ContainerKey>>(new Set(["backpack", "equipped", "lostLoot"]));
  const [decodeMap, setDecodeMap] = useState<Map<string, DecodedItem>>(new Map());
  const [partsByCode, setPartsByCode] = useState<Map<string, PartLookupItem>>(new Map());
  const [isAdding, setIsAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<TreeItem | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<{ item: TreeItem; qty: string } | null>(null);
  const [gearLevelDialog, setGearLevelDialog] = useState<{ level: number } | null>(null);
  const [gearLevelLoading, setGearLevelLoading] = useState(false);
  const navigate = useNavigate();

  const WEAPON_TYPES = new Set(["Pistol", "Shotgun", "SMG", "Assault Rifle", "Sniper"]);
  const ITEM_EDIT_TYPES = new Set(["Heavy Weapon", "Grenade", "Shield", "Repkit"]);

  const serialsToDecode = useMemo(() => {
    const list: string[] = [];
    for (const s of [...slots.backpack, ...slots.equipped, ...slots.lostLoot])
      if (s.serial?.trim().startsWith("@U")) list.push(s.serial);
    return list;
  }, [slots]);

  useEffect(() => {
    if (serialsToDecode.length === 0) {
      setDecodeMap(new Map());
      return;
    }
    let cancelled = false;
    fetchApi("save/decode-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serials: serialsToDecode }),
    })
      .then((r) => r.json())
      .then((data: { success?: boolean; items?: Array<{ serial: string; error?: string; name?: string; itemType?: string; level?: number; manufacturer?: string; decodedFull?: string }> }) => {
        if (cancelled || !data.items) return;
        const map = new Map<string, DecodedItem>();
        data.items.forEach((it, i) => {
          const serial = serialsToDecode[i];
          if (!serial || it.error) return;
          const name = it.name ?? "Unknown";
          const itemType = it.itemType ?? "Item";
          const level = typeof it.level === "number" ? it.level : 0;
          const manufacturer = it.manufacturer ?? "—";
          const decodedFull = typeof it.decodedFull === "string" ? it.decodedFull : undefined;
          map.set(serial, { name, itemType, level, manufacturer, decodedFull });
        });
        setDecodeMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serialsToDecode.join("\n")]);

  useEffect(() => {
    // Collect all part codes from decoded strings: {x:y} and {n}. For single-number {n}, also request
    // {itemTypeId:n} because the DB stores prefixed codes (e.g. {3:2}, {20:62}) and decoded often omits the prefix.
    const codes = new Set<string>();
    decodeMap.forEach((decoded) => {
      if (!decoded.decodedFull) return;
      const str = decoded.decodedFull;
      const headerMatch = str.match(/^(\d+),/);
      const itemTypeId = headerMatch ? parseInt(headerMatch[1], 10) : undefined;
      const re = /\{(\d+)(?::(\d+))?\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(str)) !== null) {
        if (m[2] != null) {
          codes.add(`{${m[1]}:${m[2]}}`);
        } else {
          codes.add(`{${m[1]}}`);
          if (itemTypeId != null) codes.add(`{${itemTypeId}:${m[1]}}`);
        }
      }
    });
    if (codes.size === 0) {
      setPartsByCode(new Map());
      return;
    }
    let cancelled = false;
    fetchApi("parts/lookup-bulk", {
      method: "POST",
      body: JSON.stringify({ codes: Array.from(codes) }),
    })
      .then((r) => r.json())
      .then((data: Record<string, PartLookupItem | null>) => {
        if (cancelled || !data) return;
        const map = new Map<string, PartLookupItem>();
        Object.entries(data).forEach(([code, part]) => {
          if (part) map.set(code, part);
        });
        setPartsByCode(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [decodeMap]);

  const allItems = useMemo(() => buildTreeItems(slots, decodeMap, partsByCode), [slots, decodeMap, partsByCode]);
  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (i) =>
        i.slotKey.toLowerCase().includes(q) ||
        i.displayName.toLowerCase().includes(q) ||
        i.serial.toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const backpackItems = useMemo(() => filtered.filter((i) => i.container === "backpack"), [filtered]);
  const equippedItems = useMemo(() => filtered.filter((i) => i.container === "equipped"), [filtered]);
  const lostLootItems = useMemo(() => filtered.filter((i) => i.container === "lostLoot"), [filtered]);

  const toggleExpanded = (key: ContainerKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddToBackpack = useCallback(async () => {
    if (!saveData || !itemSerial.trim()) return;
    setIsAdding(true);
    setAddMessage(null);
    try {
      const yamlContent = getYamlText();
      if (!yamlContent.trim()) {
        setAddMessage("No YAML content loaded.");
        return;
      }
      const res = await fetchApi("save/add-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial: itemSerial.trim(),
          flag: String(flagValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
        const msg = isLikelyUnavailable(res)
          ? getApiUnavailableError()
          : (data?.error ?? "Failed to add item.");
        setAddMessage(msg);
        return;
      }
      const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
      updateSaveData(parsed);
      setItemSerial("");
      setAddMessage("Item added to backpack. Use \"Download .sav\" on Select Save to export.");
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setIsAdding(false);
    }
  }, [saveData, itemSerial, flagValue, getYamlText, updateSaveData]);

  const handleRemoveItem = useCallback(
    async (item: TreeItem) => {
      if (!saveData) return;
      const yamlContent = getYamlText();
      if (!yamlContent?.trim()) return;
      setContextItem(null);
      setContextPos(null);
      try {
        const res = await fetchApi("save/remove-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: yamlContent, item_path: item.path }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
          setAddMessage(data?.error ?? "Failed to remove item.");
          return;
        }
        const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        setSelected(null);
        setAddMessage("Item removed from inventory.");
      } catch {
        setAddMessage(getApiUnavailableError());
      }
    },
    [saveData, getYamlText, updateSaveData]
  );

  const handleDuplicateSubmit = useCallback(
    async (item: TreeItem, qty: number) => {
      if (!saveData || !item.serial?.trim() || qty < 1) return;
      setDuplicateDialog(null);
      setContextItem(null);
      setContextPos(null);
      const yamlContent = getYamlText();
      if (!yamlContent?.trim()) {
        setAddMessage("No save YAML loaded.");
        return;
      }
      const num = Math.min(99, Math.max(1, qty));
      const stateFlags = String(item.stateFlags ?? item.flags ?? 1);
      try {
        let currentYaml = yamlContent;
        for (let i = 0; i < num; i++) {
          const res = await fetchApi("save/add-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              yaml_content: currentYaml,
              serial: item.serial.trim(),
              flag: stateFlags,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
            setAddMessage(data?.error ?? `Failed to add copy ${i + 1}.`);
            return;
          }
          currentYaml = data.yaml_content;
        }
        const parsed = yamlParse(currentYaml) as Record<string, unknown>;
        updateSaveData(parsed);
        setAddMessage(`${num} copy/copies added to backpack.`);
      } catch {
        setAddMessage(getApiUnavailableError());
      }
    },
    [saveData, getYamlText, updateSaveData]
  );

  const handleSetGearLevel = useCallback(async () => {
    if (!gearLevelDialog || !saveData) return;
    const yamlContent = getYamlText();
    if (!yamlContent?.trim()) {
      setAddMessage("No save YAML loaded.");
      return;
    }
    const level = Math.max(0, Math.min(99, gearLevelDialog.level));
    setGearLevelLoading(true);
    setAddMessage(null);
    try {
      const res = await fetchApi("save/set-backpack-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml_content: yamlContent, level }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
        const msg = isLikelyUnavailable(res)
          ? getApiUnavailableError()
          : (data?.error ?? "Failed to set gear level.");
        setAddMessage(msg);
        return;
      }
      const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
      updateSaveData(parsed);
      const ok = data.success_count ?? 0;
      const fail = data.fail_count ?? 0;
      setAddMessage(
        fail > 0
          ? `Set ${ok} item(s) to level ${level}; ${fail} failed.`
          : `All backpack items set to level ${level}. Use "Download .sav" on Select Save to export.`
      );
      setGearLevelDialog(null);
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setGearLevelLoading(false);
    }
  }, [gearLevelDialog, saveData, getYamlText, updateSaveData]);

  const handleUpgradeItem = useCallback(
    (item: TreeItem) => {
      setContextItem(null);
      setContextPos(null);
      const typeLabel = item.typeLabel || "";
      if (WEAPON_TYPES.has(typeLabel)) {
        navigate("/weapon-toolbox/weapon-edit", {
          state: {
            loadItem: {
              serial: item.serial,
              decodedFull: item.decodedFull,
              path: item.path,
            },
          },
        });
      } else if (ITEM_EDIT_TYPES.has(typeLabel)) {
        navigate("/weapon-toolbox/item-edit", {
          state: {
            loadItem: {
              serial: item.serial,
              decodedFull: item.decodedFull,
              path: item.path,
            },
          },
        });
      } else {
        setAddMessage(`Unknown item type "${typeLabel}". Use Weapon Edit for weapons, Item Edit for Shield/Grenade/Repkit/Heavy.`);
      }
    },
    [navigate]
  );

  if (!saveData) {
    return (
      <div className="space-y-4">
        <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
          ← Select Save
        </Link>
        <h2 className="text-lg font-semibold text-[var(--color-accent)]">Backpack</h2>
        <p className="text-[var(--color-text-muted)]">
          Load a save first (Character → Select Save) to view backpack and equipped slots.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
        ← Select Save
      </Link>
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Backpack</h2>

      {/* Top bar: Item Serial, Flag, Add to Backpack */}
      <div className="flex flex-wrap items-center gap-3 border border-[var(--color-panel-border)] rounded-lg p-3 bg-[rgba(24,28,34,0.6)]">
        <label className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm text-[var(--color-text-muted)] whitespace-nowrap">Item Serial:</span>
          <input
            type="text"
            placeholder="Enter @U... or decoded code"
            value={itemSerial}
            onChange={(e) => setItemSerial(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">Flag:</span>
          <select
            value={flagValue}
            onChange={(e) => setFlagValue(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          >
            {FLAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAddToBackpack}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
          disabled={!itemSerial.trim() || isAdding}
        >
          {isAdding ? "Adding…" : "Add to Backpack"}
        </button>
        <button
          type="button"
          onClick={() => setGearLevelDialog({ level: 50 })}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-accent)] text-sm hover:bg-[var(--color-accent)]/10 min-h-[44px]"
        >
          Change Gear Level
        </button>
      </div>
      {addMessage && (
        <p className="text-xs text-[var(--color-accent)] max-w-xl">
          {addMessage}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Search + Tree */}
        <div className="lg:col-span-1 border border-[var(--color-panel-border)] rounded-lg overflow-hidden bg-[rgba(24,28,34,0.6)] flex flex-col min-h-[400px]">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="m-2 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex-1 overflow-auto p-2">
            {[
              { key: "backpack" as const, items: backpackItems },
              { key: "equipped" as const, items: equippedItems },
              { key: "lostLoot" as const, items: lostLootItems },
            ].map(({ key, items }) => (
              <div key={key} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleExpanded(key)}
                  className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded text-[var(--color-accent)] font-medium text-sm"
                >
                  <span className="text-[10px]">{expanded.has(key) ? "▼" : "▶"}</span>
                  {CONTAINER_LABELS[key]} ({items.length})
                </button>
                {expanded.has(key) && (
                  <div className="pl-4 border-l border-[var(--color-panel-border)] ml-1">
                    {groupByType(items).size === 0 && items.length === 0 ? (
                      <p className="py-1 text-xs text-[var(--color-text-muted)]">No items</p>
                    ) : (
                      Array.from(groupByType(items).entries()).map(([typeName, group]) => (
                        <div key={typeName} className="mb-1">
                          <p className="text-xs text-[var(--color-text-muted)] py-0.5">
                            {typeName} ({group.length})
                          </p>
                          {group.map((item) => (
                            <button
                              key={`${item.container}-${item.slotKey}`}
                              type="button"
                              onClick={() => setSelected(item)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextItem(item);
                                setContextPos({ x: e.clientX, y: e.clientY });
                              }}
                              className={`block w-full text-left py-1.5 px-2 rounded text-sm truncate ${
                                selected?.container === item.container && selected?.slotKey === item.slotKey
                                  ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                                  : "text-[var(--color-text)] hover:bg-[var(--color-panel-border)]/50"
                              }`}
                            >
                              {item.displayName} — {item.container}/{item.slotKey} — Level {item.level}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Item details / editor */}
        <div className="lg:col-span-2 border border-[var(--color-panel-border)] rounded-lg overflow-hidden bg-[rgba(24,28,34,0.6)] p-4 min-h-[400px]">
          {selected ? (
            <>
              <h3 className="text-[var(--color-accent)] font-medium mb-3">Summary</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-4">
                <dt className="text-[var(--color-text-muted)]">Item:</dt>
                <dd className="text-[var(--color-text)]">{selected.displayName}</dd>
                <dt className="text-[var(--color-text-muted)]">Slot:</dt>
                <dd className="text-[var(--color-text)] font-mono">{selected.slotKey}</dd>
                <dt className="text-[var(--color-text-muted)]">Type:</dt>
                <dd className="text-[var(--color-text)]">{selected.typeLabel}</dd>
                <dt className="text-[var(--color-text-muted)]">Container:</dt>
                <dd className="text-[var(--color-text)]">{CONTAINER_LABELS[selected.container]}</dd>
                <dt className="text-[var(--color-text-muted)]">Manufacturer:</dt>
                <dd className="text-[var(--color-text)]">{selected.manufacturer}</dd>
              </dl>
              <h3 className="text-[var(--color-accent)] font-medium mb-2">Fields</h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-[var(--color-text-muted)] block mb-1">Level</span>
                  <input
                    type="text"
                    value={selected.level}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-muted)] block mb-1">Serial (Base85)</span>
                  <textarea
                    value={selected.serial}
                    readOnly
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs font-mono resize-y"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-muted)] block mb-1">Deserialized code</span>
                  <textarea
                    value={selected.decodedFull || "(not available)"}
                    readOnly
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs font-mono resize-y whitespace-pre-wrap break-all"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-muted)] block mb-1">Decoded ID</span>
                  <input
                    type="text"
                    value={selected.level !== "—" ? `Level ${selected.level}, ${selected.typeLabel}` : "(decode unavailable)"}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text-muted)] text-sm"
                  />
                </label>
              </div>
            </>
          ) : (
            <p className="text-[var(--color-text-muted)] text-sm">Select an item from the list to view or edit.</p>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextItem && contextPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => { setContextItem(null); setContextPos(null); }}
          />
          <div
            className="fixed z-50 min-w-[180px] py-1 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-lg"
            style={{ left: contextPos.x, top: contextPos.y }}
            role="menu"
          >
            <button
              type="button"
              className="block w-full text-left px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]/50"
              onClick={() => handleRemoveItem(contextItem)}
            >
              Delete
            </button>
            <button
              type="button"
              className="block w-full text-left px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]/50"
              onClick={() => {
                setContextPos(null);
                setDuplicateDialog({ item: contextItem, qty: "1" });
                setContextItem(null);
              }}
            >
              Duplicate…
            </button>
            <button
              type="button"
              className="block w-full text-left px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]/50"
              onClick={() => handleUpgradeItem(contextItem)}
            >
              Upgrade Item
            </button>
          </div>
        </>
      )}

      {/* Change Gear Level dialog */}
      {gearLevelDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !gearLevelLoading && setGearLevelDialog(null)}
        >
          <div
            className="rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--color-accent)] font-medium mb-2">Change Gear Level</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Set all backpack items to this level (0–99):
            </p>
            <input
              type="number"
              min={0}
              max={99}
              value={gearLevelDialog.level}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isFinite(n)) return;
                setGearLevelDialog({ level: Math.max(0, Math.min(99, n)) });
              }}
              className="w-20 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center font-mono"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleSetGearLevel}
                disabled={gearLevelLoading}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium disabled:opacity-50 min-h-[44px]"
              >
                {gearLevelLoading ? "Applying…" : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => !gearLevelLoading && setGearLevelDialog(null)}
                disabled={gearLevelLoading}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] disabled:opacity-50 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate: How many dialog */}
      {duplicateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDuplicateDialog(null)}
        >
          <div
            className="rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--color-accent)] font-medium mb-2">Duplicate</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">How many copies to add to backpack?</p>
            <input
              type="number"
              min={1}
              max={99}
              value={duplicateDialog.qty}
              onChange={(e) => setDuplicateDialog((d) => d ? { ...d, qty: e.target.value } : null)}
              className="w-20 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center font-mono"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  const n = parseInt(duplicateDialog.qty, 10);
                  if (Number.isFinite(n)) handleDuplicateSubmit(duplicateDialog.item, n);
                  setDuplicateDialog(null);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setDuplicateDialog(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}