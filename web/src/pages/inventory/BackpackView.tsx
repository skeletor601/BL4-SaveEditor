import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { getInventorySlotsWithPaths, type ItemSlotWithPath } from "@/lib/inventoryData";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import {
  type PartLookupItem,
  collectLookupCodesFromDecoded,
  preferItemNameFromDecoded,
} from "@/lib/backpackNaming";
import { parseDecodedSerial, translateParts, type TranslatedLine } from "@/lib/partsTranslator";

export interface DecodedItem {
  name: string;
  itemType: string;
  level: number;
  manufacturer: string;
  /** Full deserialized string (header||parts) from decoder */
  decodedFull?: string;
}

const FLAG_OPTIONS = [
  { value: 1,   label: "Normal",   short: null,  color: null },
  { value: 3,   label: "Favorite", short: "★",   color: "bg-yellow-400/20 text-yellow-300 border-yellow-400/50" },
  { value: 5,   label: "Junk",     short: "JUNK", color: "bg-red-500/20 text-red-300 border-red-500/50" },
  { value: 17,  label: "Rank 1",   short: "R1",  color: "bg-blue-500/20 text-blue-300 border-blue-500/50" },
  { value: 33,  label: "Rank 2",   short: "R2",  color: "bg-blue-500/20 text-blue-300 border-blue-500/50" },
  { value: 65,  label: "Rank 3",   short: "R3",  color: "bg-blue-500/20 text-blue-300 border-blue-500/50" },
  { value: 129, label: "Rank 4",   short: "R4",  color: "bg-blue-500/20 text-blue-300 border-blue-500/50" },
];

function FlagBadge({ stateFlags }: { stateFlags: number }) {
  const opt = FLAG_OPTIONS.find((o) => o.value === stateFlags);
  if (!opt || !opt.short || !opt.color) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold leading-none mr-1.5 shrink-0 ${opt.color}`}>
      {opt.short}
    </span>
  );
}

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

function buildTreeItems(
  slots: { backpack: ItemSlotWithPath[]; equipped: ItemSlotWithPath[]; lostLoot: ItemSlotWithPath[] },
  decodeMap: Map<string, DecodedItem>,
  partsByCode: Map<string, PartLookupItem>
): TreeItem[] {
  const out: TreeItem[] = [];
  const add = (container: ContainerKey, list: ItemSlotWithPath[]) => {
    for (const s of list) {
      const decoded = s.serial ? decodeMap.get(s.serial) : undefined;
      const prettyName = decoded?.decodedFull ? preferItemNameFromDecoded(decoded.decodedFull, partsByCode) : undefined;
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
  const [selectedFlagValue, setSelectedFlagValue] = useState(1);
  const [isSavingFlag, setIsSavingFlag] = useState(false);
  const [contextItem, setContextItem] = useState<TreeItem | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<{ item: TreeItem; qty: string } | null>(null);
  const [gearLevelDialog, setGearLevelDialog] = useState<{ level: number } | null>(null);
  const [gearLevelLoading, setGearLevelLoading] = useState(false);
  const [clearBackpackLoading, setClearBackpackLoading] = useState(false);
  const [showClearBackpackConfirm, setShowClearBackpackConfirm] = useState(false);
  const navigate = useNavigate();

  // Translate parts for the selected item using existing partsByCode map.
  const selectedTranslatedLines = useMemo((): TranslatedLine[] => {
    if (!selected?.decodedFull) return [];
    const { parts } = parseDecodedSerial(selected.decodedFull);
    // Convert Map<string, PartLookupItem> → Map<string, PartLookupRow[]> for translateParts.
    const byCode = new Map<string, import("@/lib/partsTranslator").PartLookupRow[]>();
    partsByCode.forEach((item, code) => byCode.set(code, [item as import("@/lib/partsTranslator").PartLookupRow]));
    return translateParts(parts, byCode);
  }, [selected?.decodedFull, partsByCode]);

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
    const codes = new Set<string>();
    decodeMap.forEach((decoded) => {
      if (!decoded.decodedFull) return;
      collectLookupCodesFromDecoded(decoded.decodedFull).forEach((code) => codes.add(code));
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
      let serial = itemSerial.trim();
      // If pasted text is decoded code (doesn't start with @U), encode it first.
      if (!serial.startsWith("@")) {
        const encodeRes = await fetchApi("save/encode-serial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decoded_string: serial }),
        });
        const encodeData = await encodeRes.json().catch(() => ({}));
        if (!encodeRes.ok || !encodeData?.success || typeof encodeData?.serial !== "string") {
          setAddMessage(encodeData?.error ?? "Could not encode pasted code. Use a valid decoded parts string or @U... serial.");
          return;
        }
        serial = encodeData.serial;
      }
      const res = await fetchApi("save/add-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial,
          flag: String(flagValue),
        }),
      });
      const raw = await res.text();
      let data: { success?: boolean; error?: string; yaml_content?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
        const msg = isLikelyUnavailable(res)
          ? getApiUnavailableError()
          : (typeof data?.error === "string" ? data.error : raw?.slice(0, 300) || "Failed to add item.");
        setAddMessage(msg);
        return;
      }
      const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
      updateSaveData(parsed);
      setItemSerial("");
      setAddMessage("Item added to backpack. Use \"Overwrite save\" on Select Save to export.");
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setIsAdding(false);
    }
  }, [saveData, itemSerial, flagValue, getYamlText, updateSaveData]);

  const handleUpdateFlag = useCallback(async () => {
    if (!selected || !saveData) return;
    const yamlContent = getYamlText();
    if (!yamlContent?.trim()) { setAddMessage("No save YAML loaded."); return; }
    setIsSavingFlag(true);
    setAddMessage(null);
    try {
      const res = await fetchApi("save/update-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml_content: yamlContent,
          item_path: selected.path,
          new_item_data: { serial: selected.serial, state_flags: selectedFlagValue },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
        setAddMessage(data?.error ?? "Failed to update flag.");
        return;
      }
      const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
      updateSaveData(parsed);
      setAddMessage("Flag updated. Use \"Overwrite save\" to export.");
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setIsSavingFlag(false);
    }
  }, [selected, selectedFlagValue, saveData, getYamlText, updateSaveData]);

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
          : `All backpack items set to level ${level}. Use "Overwrite save" on Select Save to export.`
      );
      setGearLevelDialog(null);
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setGearLevelLoading(false);
    }
  }, [gearLevelDialog, saveData, getYamlText, updateSaveData]);

  const handleClearBackpackConfirm = useCallback(async () => {
    if (!saveData) return;
    setShowClearBackpackConfirm(false);
    const yamlContent = getYamlText();
    if (!yamlContent?.trim()) {
      setAddMessage("No save YAML loaded. Load a save first (Character → Select Save).");
      return;
    }
    setClearBackpackLoading(true);
    setAddMessage(null);
    try {
      const res = await fetchApi("save/clear-backpack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml_content: yamlContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || typeof data.yaml_content !== "string") {
        const msg = isLikelyUnavailable(res)
          ? getApiUnavailableError()
          : (data?.error ?? "Failed to clear backpack.");
        setAddMessage(msg);
        return;
      }
      const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
      updateSaveData(parsed);
      setSelected(null);
      setAddMessage("Backpack cleared. Use \"Overwrite save\" on Select Save to export.");
    } catch {
      setAddMessage(getApiUnavailableError());
    } finally {
      setClearBackpackLoading(false);
    }
  }, [saveData, getYamlText, updateSaveData]);

  const handleUpgradeItem = useCallback(
    (item: TreeItem) => {
      setContextItem(null);
      setContextPos(null);
      const typeLabel = item.typeLabel || "";
      if (WEAPON_TYPES.has(typeLabel) || ITEM_EDIT_TYPES.has(typeLabel)) {
        navigate("/gear-forge", {
          state: {
            tab: "editor",
            editorKind: "editor",
            loadItem: {
              serial: item.serial,
              decodedFull: item.decodedFull,
              path: item.path,
            },
          },
        });
      } else {
        setAddMessage(`Unknown item type "${typeLabel}". Open in Gear Forge > Serial Editor to edit.`);
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
                {o.short ? `${o.short} · ` : ""}{o.label}
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
        <button
          type="button"
          onClick={() => setShowClearBackpackConfirm(true)}
          disabled={clearBackpackLoading}
          className="px-4 py-2 rounded-lg border border-red-500/60 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-50 min-h-[44px]"
          title="Clear all items from backpack and equipped"
        >
          {clearBackpackLoading ? "Clearing…" : "Clear backpack"}
        </button>
      </div>
      {showClearBackpackConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowClearBackpackConfirm(false)}>
          <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-[var(--color-text)] mb-4">
              Remove all items from backpack and equipped? Reload the save to undo.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowClearBackpackConfirm(false)} className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm">Cancel</button>
              <button type="button" onClick={() => void handleClearBackpackConfirm()} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500">Clear backpack</button>
            </div>
          </div>
        </div>
      )}
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
                              onClick={() => { setSelected(item); setSelectedFlagValue(item.stateFlags || 1); }}
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
                              <FlagBadge stateFlags={item.stateFlags} />
                              {item.displayName} — {item.slotKey} — Lv {item.level}
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
              {/* Flag editor */}
              <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.5)]">
                <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">Mark as:</span>
                <div className="flex flex-wrap gap-1.5">
                  {FLAG_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setSelectedFlagValue(o.value)}
                      className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${
                        selectedFlagValue === o.value
                          ? o.color ?? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                          : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50"
                      }`}
                    >
                      {o.short ? `${o.short} · ` : ""}{o.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleUpdateFlag()}
                  disabled={isSavingFlag || selectedFlagValue === (selected.stateFlags || 1)}
                  className="px-3 py-1 rounded text-xs bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {isSavingFlag ? "Saving…" : "Save"}
                </button>
              </div>

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
                {selectedTranslatedLines.length > 0 && (
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)] block mb-2">Parts</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                      {selectedTranslatedLines.map((line) => (
                        <div
                          key={line.codeKey}
                          className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] p-2 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs text-[var(--color-accent)] shrink-0">{line.codeKey}</span>
                            {line.qty > 1 && (
                              <span className="text-xs text-[var(--color-text-muted)] tabular-nums shrink-0">×{line.qty}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{line.partType}</p>
                          <p className="mt-0.5 text-sm font-medium text-[var(--color-text)] break-words">{line.name}</p>
                          {line.stats && (
                            <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2" title={line.stats}>
                              {line.stats}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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