/**
 * Feature 17: Save Comparison/Diff
 * Load two .sav files (via decode API) and show inventory differences side by side.
 */
import { useState, useCallback } from "react";
import { parse as yamlParse } from "yaml";
import { fetchApi } from "@/lib/apiClient";
import { getInventorySlotsWithPaths } from "@/lib/inventoryData";

interface SaveItem {
  serial: string;
  slotKey: string;
  name?: string;
  itemType?: string;
  level?: number;
  manufacturer?: string;
}

interface LoadedSave {
  label: string;
  items: SaveItem[];
}

type DiffEntry =
  | { kind: "only-a"; item: SaveItem }
  | { kind: "only-b"; item: SaveItem }
  | { kind: "both"; itemA: SaveItem; itemB: SaveItem };

function buildDiff(a: SaveItem[], b: SaveItem[]): DiffEntry[] {
  // Deduplicate by serial
  const setA = new Map(a.map((i) => [i.serial, i]));
  const setB = new Map(b.map((i) => [i.serial, i]));
  const result: DiffEntry[] = [];
  for (const [serial, item] of setA) {
    if (setB.has(serial)) {
      result.push({ kind: "both", itemA: item, itemB: setB.get(serial)! });
    } else {
      result.push({ kind: "only-a", item });
    }
  }
  for (const [serial, item] of setB) {
    if (!setA.has(serial)) {
      result.push({ kind: "only-b", item });
    }
  }
  return result;
}

function itemLabel(item: SaveItem): string {
  return [item.name, item.itemType, item.level != null ? `Lv ${item.level}` : null, item.manufacturer]
    .filter(Boolean)
    .join(" · ") || item.serial.slice(0, 20) + "…";
}

async function decodeSave(yamlText: string): Promise<SaveItem[]> {
  let parsed: Record<string, unknown>;
  try {
    parsed = yamlParse(yamlText) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse YAML.");
  }

  const slots = getInventorySlotsWithPaths(parsed);
  const serials = [
    ...slots.backpack,
    ...slots.equipped,
    ...slots.lostLoot,
  ]
    .map((s) => s.serial)
    .filter((s): s is string => typeof s === "string" && s.startsWith("@U"));

  if (serials.length === 0) return [];

  const res = await fetchApi("save/decode-items", {
    method: "POST",
    body: JSON.stringify({ serials }),
  });
  const data = await res.json().catch(() => ({})) as { items?: Array<{ serial?: string; name?: string; itemType?: string; level?: number; manufacturer?: string; error?: string }> };
  const items: SaveItem[] = [];
  const slotMap = new Map([...slots.backpack, ...slots.equipped, ...slots.lostLoot].map((s) => [s.serial, s.slotKey]));

  for (const it of data.items ?? []) {
    if (!it.serial || it.error) continue;
    items.push({
      serial: it.serial,
      slotKey: slotMap.get(it.serial) ?? "?",
      name: it.name,
      itemType: it.itemType,
      level: it.level,
      manufacturer: it.manufacturer,
    });
  }
  return items;
}

export default function SaveComparisonPage() {
  const [saveA, setSaveA] = useState<LoadedSave | null>(null);
  const [saveB, setSaveB] = useState<LoadedSave | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [hideCommon, setHideCommon] = useState(false);

  const handleFile = useCallback(
    async (side: "a" | "b", file: File) => {
      const setLoading = side === "a" ? setLoadingA : setLoadingB;
      const setError = side === "a" ? setErrorA : setErrorB;
      const setSave = side === "a" ? setSaveA : setSaveB;

      setLoading(true);
      setError(null);
      try {
        const text = await file.text();
        const items = await decodeSave(text);
        setSave({ label: file.name, items });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const diff = saveA && saveB ? buildDiff(saveA.items, saveB.items) : null;
  const onlyA = diff?.filter((d) => d.kind === "only-a") ?? [];
  const onlyB = diff?.filter((d) => d.kind === "only-b") ?? [];
  const both = diff?.filter((d) => d.kind === "both") ?? [];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Save Comparison</h1>
        <p className="text-sm opacity-60">Load two save files (YAML) to see what items differ between them.</p>
      </div>

      {/* File pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["a", "b"] as const).map((side) => {
          const save = side === "a" ? saveA : saveB;
          const loading = side === "a" ? loadingA : loadingB;
          const error = side === "a" ? errorA : errorB;
          const label = side === "a" ? "Save A" : "Save B";
          const color = side === "a" ? "text-blue-300 border-blue-500/30 bg-blue-500/5" : "text-green-300 border-green-500/30 bg-green-500/5";
          return (
            <div key={side} className={`border rounded-lg p-3 space-y-2 ${color}`}>
              <div className="font-medium text-sm">{label}</div>
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept=".sav,.yaml,.yml,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(side, f);
                  }}
                />
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-current/30 hover:bg-white/5 transition-colors text-xs">
                  {loading ? "Loading…" : save ? `✓ ${save.label}` : "Choose file…"}
                </span>
              </label>
              {save && !loading && (
                <p className="text-[11px] opacity-60">{save.items.length} items decoded</p>
              )}
              {error && <p className="text-[11px] text-red-400">{error}</p>}
            </div>
          );
        })}
      </div>

      {diff && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm">
              <span className="text-blue-300 font-medium">{onlyA.length}</span> only in A ·{" "}
              <span className="text-green-300 font-medium">{onlyB.length}</span> only in B ·{" "}
              <span className="opacity-50">{both.length}</span> in both
            </div>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hideCommon}
                onChange={(e) => setHideCommon(e.target.checked)}
                className="w-4 h-4"
              />
              Hide common items
            </label>
          </div>

          <div className="space-y-1">
            {!hideCommon && both.map((d, i) => (
              d.kind === "both" && (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/5 bg-white/3 text-xs opacity-60">
                  <span className="w-14 shrink-0 font-bold">BOTH</span>
                  <span className="flex-1 truncate">{itemLabel(d.itemA)}</span>
                </div>
              )
            ))}
            {onlyA.map((d, i) => (
              d.kind === "only-a" && (
                <div key={`a-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded border border-blue-500/20 bg-blue-500/8 text-xs">
                  <span className="w-14 shrink-0 font-bold text-blue-300">ONLY A</span>
                  <span className="flex-1 truncate text-blue-200">{itemLabel(d.item)}</span>
                  <span className="opacity-40 shrink-0">{d.item.slotKey}</span>
                </div>
              )
            ))}
            {onlyB.map((d, i) => (
              d.kind === "only-b" && (
                <div key={`b-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded border border-green-500/20 bg-green-500/8 text-xs">
                  <span className="w-14 shrink-0 font-bold text-green-300">ONLY B</span>
                  <span className="flex-1 truncate text-green-200">{itemLabel(d.item)}</span>
                  <span className="opacity-40 shrink-0">{d.item.slotKey}</span>
                </div>
              )
            ))}
            {diff.length === 0 && (
              <p className="text-sm opacity-50 text-center py-8">Both saves have identical item serials.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
