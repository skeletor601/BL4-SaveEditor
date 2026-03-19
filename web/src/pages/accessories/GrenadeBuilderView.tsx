import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import ThemedSelect from "@/components/weapon-toolbox/ThemedSelect";
import {
  blockClass,
  labelClass,
  inputClass,
  buttonSecondaryClass,
  buttonPrimaryClass,
  FLAG_OPTIONS,
} from "@/components/weapon-toolbox/builderStyles";
import { useCodeHistory } from "@/lib/useCodeHistory";
import CodeHistoryPanel from "@/components/CodeHistoryPanel";
import VisualRecipePanel, { type RecipePart } from "@/components/grenade/VisualRecipePanel";

interface GrenadeBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

interface GrenadeBuilderLegendaryPart extends GrenadeBuilderPart {
  mfgId: number;
  mfgName: string;
}

interface GrenadeBuilderRarity {
  id: number;
  label: string;
}

interface GrenadeBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, GrenadeBuilderRarity[]>;
  element: GrenadeBuilderPart[];
  firmware: GrenadeBuilderPart[];
  universalPerks: GrenadeBuilderPart[];
  legendaryPerks: GrenadeBuilderLegendaryPart[];
  mfgPerks: Record<number, GrenadeBuilderPart[]>;
}

type SelectedPart = {
  /** Outer type ID. For grenade: header mfgId (main), or 245 (element/firmware/universal), or other mfg IDs for legendary cross-mfg. */
  typeId: number;
  /** Inner part ID. */
  partId: number;
  /** Display label. */
  label: string;
  /** Quantity for repeat stacking. */
  qty: string;
};

type SuperExtraPartSelection = {
  code: string;
  label: string;
  effect?: string;
  itemType?: string;
  manufacturer?: string;
  partType?: string;
  rarity?: string;
  checked: boolean;
  qty: string;
};

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function GrenadeBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const { addEntry: addHistoryEntry } = useCodeHistory();
  const [builderData, setBuilderData] = useState<GrenadeBuilderData | null>(null);
  const [mfgId, setMfgId] = useState<number>(263);
  const [level, setLevel] = useState("60");
  const [mfgPerkChecked, setMfgPerkChecked] = useState<Set<number>>(new Set());
  const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([]);
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);

  const [pendingQtyPart, setPendingQtyPart] = useState<{ next: SelectedPart } | null>(null);
  const [pendingQtyInput, setPendingQtyInput] = useState("1");

  // "Add other parts…" (universal DB picker)
  const [superParts, setSuperParts] = useState<SuperExtraPartSelection[]>([]);
  const [superSearch, setSuperSearch] = useState("");
  const [superManufacturerFilter, setSuperManufacturerFilter] = useState("");
  const [superRarityFilter, setSuperRarityFilter] = useState("");
  const [showSuperAddParts, setShowSuperAddParts] = useState(false);

  const ADD_OTHER_OPTION = "__ADD_OTHER_PARTS__";

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/grenade/builder-data")
      .then((r) => r.json())
      .then((data: GrenadeBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          setSelectedParts([]);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load grenade builder data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load universal part metadata for "Add other parts…" picker (same source as Weapon Gen).
  useEffect(() => {
    let cancelled = false;
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: unknown[] }) => {
        if (cancelled) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        const next: SuperExtraPartSelection[] = [];
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const raw = it as Record<string, unknown>;
          const code = String(raw.code ?? raw.Code ?? "").trim();
          if (!code) continue;
          const label =
            String(raw.partName ?? raw.name ?? raw.String ?? raw["Canonical Name"] ?? "").trim() ||
            code;
          const effect = [
            raw.effect,
            raw.Effect,
            raw["Stats (Level 50, Common)"],
            raw.Stats,
            raw["Search Text"],
            raw.Description,
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(" ") || undefined;
          next.push({
            code,
            label,
            effect,
            itemType: String(raw.itemType ?? raw["Item Type"] ?? "").trim() || undefined,
            manufacturer: String(raw.manufacturer ?? raw.Manufacturer ?? "").trim() || undefined,
            partType: String(raw.partType ?? raw["Part Type"] ?? "").trim() || undefined,
            rarity: String(raw.rarity ?? raw.Rarity ?? "").trim() || undefined,
            checked: false,
            qty: "1",
          });
        }
        setSuperParts(next);
      })
      .catch(() => {
        if (!cancelled) setSuperParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function normalizeSuperRarity(r: string | undefined): string {
    if (!r) return "";
    const lower = r.trim().toLowerCase();
    if (lower === "pearl" || lower === "pearlescent") return "Pearl";
    return r.trim();
  }

  function superPartMatchesRarity(partRarity: string | undefined, filterValue: string): boolean {
    if (!filterValue) return true;
    return normalizeSuperRarity(partRarity) === filterValue;
  }

  function parseCodePair(code: string): { typeId: number; partId: number } | null {
    const s = code.trim();
    const m2 = s.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
    if (m2) return { typeId: Number(m2[1]), partId: Number(m2[2]) };
    const m1 = s.match(/^\{\s*(\d+)\s*\}$/);
    if (m1) {
      const n = Number(m1[1]);
      return { typeId: n, partId: n };
    }
    return null;
  }

  const rarities = builderData?.raritiesByMfg[mfgId] ?? [];
  const mfgPerksList = builderData?.mfgPerks[mfgId] ?? [];

  const requestQtyForSelection = useCallback(
    (next: SelectedPart) => {
      setPendingQtyPart({ next });
      setPendingQtyInput(next.qty?.trim() ? next.qty : "1");
    },
    [],
  );

  const addSelectedPart = useCallback(
    (next: SelectedPart) => {
      setSelectedParts((prev) => [...prev, next]);
    },
    [],
  );

  const removeSelectedPartAt = useCallback((index: number) => {
    setSelectedParts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearSelectedPartsByTypeId = useCallback((typeId: number) => {
    setSelectedParts((prev) => prev.filter((p) => p.typeId !== typeId));
  }, []);

  const moveSelectedPart = useCallback((idx: number, dir: -1 | 1) => {
    setSelectedParts((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const loadRecipe = useCallback((parts: RecipePart[]) => {
    // Replace all type-245 selections with the recipe's parts (in recipe order), keep others
    setSelectedParts((prev) => [...parts, ...prev.filter((p) => p.typeId !== 245)]);
  }, []);

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData) return;
    const header = `${mfgId}, 0, 1, ${level}| 2, 305||`;

    // Base mfg perks (checkboxes) are always "selected parts" under header mfgId.
    const mfgCheckedParts: SelectedPart[] = Array.from(mfgPerkChecked).map((pid) => ({
      typeId: mfgId,
      partId: pid,
      label: `Mfg perk ${pid}`,
      qty: "1",
    }));

    const allSelected = [...selectedParts, ...mfgCheckedParts];

    // Expand quantities into a per-typeId list
    const byType = new Map<number, number[]>();
    const add = (typeId: number, partId: number) => {
      if (!byType.has(typeId)) byType.set(typeId, []);
      byType.get(typeId)!.push(partId);
    };
    for (const s of allSelected) {
      const count = Math.max(1, Math.min(99, parseInt(s.qty.trim(), 10) || 1));
      for (let i = 0; i < count; i++) add(s.typeId, s.partId);
    }

    const tokens: string[] = [];
    for (const [typeId, ids] of byType.entries()) {
      if (!ids.length) continue;
      // Preserve insertion order for type 245 (grenade perks) — order determines visual effect.
      // Sort all other type IDs numerically for deterministic output.
      const sorted = typeId === 245 ? [...ids] : [...ids].sort((a, b) => a - b);
      if (sorted.length === 1) {
        if (typeId === mfgId) tokens.push(`{${sorted[0]}}`);
        else tokens.push(`{${typeId}:${sorted[0]}}`);
      } else {
        tokens.push(`{${typeId}:[${sorted.join(" ")}]}`);
      }
    }

    const finalStr = `${header} ${tokens.join(" ")} |`;
    setRawOutput(finalStr);

    setLoading("encode");
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: finalStr }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && typeof data?.serial === "string") {
        setB85Output(data.serial);
      } else {
        setB85Output("");
      }
    } catch {
      setB85Output("");
    } finally {
      setLoading(null);
    }
  }, [
    manualOutputMode,
    builderData,
    mfgId,
    level,
    mfgPerkChecked,
    selectedParts,
  ]);

  useEffect(() => {
    if (!builderData) return;
    rebuildOutput();
  }, [builderData, rebuildOutput]);

  const handleRawChange = (v: string) => {
    setRawOutput(v);
    setManualOutputMode(true);
  };
  const handleB85Change = (v: string) => {
    setB85Output(v);
    setManualOutputMode(true);
  };

  const handleEncodeFromRaw = useCallback(async () => {
    const decoded = rawOutput.trim();
    if (!decoded) {
      setMessage("Enter a decoded string first.");
      return;
    }
    setLoading("encode");
    setMessage(null);
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: decoded }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && typeof data?.serial === "string") {
        setB85Output(data.serial);
        setMessage("Encoded.");
      } else {
        setMessage(data?.error ?? "Encode failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [rawOutput]);

  const handleDecodeFromB85 = useCallback(async () => {
    const serial = b85Output.trim();
    if (!serial.startsWith("@U")) {
      setMessage("Paste a Base85 serial (must start with @U).");
      return;
    }
    setLoading("encode");
    setMessage(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials: [serial] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Decode failed"));
        return;
      }
      const items = data?.items ?? [];
      const first = items[0];
      if (first?.error) {
        setMessage(first.error);
        return;
      }
      if (typeof first?.decodedFull === "string") {
        setRawOutput(first.decodedFull);
        setMessage("Decoded.");
      } else {
        setMessage("No decoded string in response.");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output]);

  const handleAddToBackpack = useCallback(async () => {
    const serial = b85Output.trim();
    if (!serial.startsWith("@U")) {
      setMessage("Encode a serial first, or paste a Base85 serial.");
      return;
    }
    if (!saveData) {
      setMessage("Load a save first (Character → Select Save).");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent.trim()) {
      setMessage("No save YAML loaded.");
      return;
    }
    setLoading("add");
    setMessage(null);
    try {
      const res = await fetchApi("save/add-item", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial,
          flag: String(flagValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Add failed"));
        return;
      }
      if (data?.success && typeof data?.yaml_content === "string") {
        const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        setMessage("Grenade added to backpack. Use Overwrite save on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output, saveData, flagValue, getYamlText, updateSaveData]);

  const toggleMfgPerk = (partId: number) => {
    setMfgPerkChecked((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading grenade data…" : "Grenade builder data not available."}
      </div>
    );
  }

  const rarityOptions = [
    { value: "", label: "Add rarity…" },
    { value: ADD_OTHER_OPTION, label: "Add other parts…" },
    ...rarities.map((r) => ({ value: `R:${r.id}`, label: r.label })),
  ];
  const elementOptions = [
    { value: "", label: "Add element…" },
    { value: ADD_OTHER_OPTION, label: "Add other parts…" },
    ...builderData.element.map((p) => ({ value: `245:${p.partId}`, label: p.stat })),
  ];
  const firmwareOptions = [
    { value: "", label: "Add firmware…" },
    { value: ADD_OTHER_OPTION, label: "Add other parts…" },
    ...builderData.firmware.map((p) => ({ value: `245:${p.partId}`, label: p.stat })),
  ];
  const legendaryOptions = [
    { value: "", label: "Add legendary…" },
    { value: ADD_OTHER_OPTION, label: "Add other parts…" },
    ...builderData.legendaryPerks.map((p) => ({
      value: `${p.mfgId}:${p.partId}`,
      label: `${p.mfgName} - ${p.stat}${p.description ? ` - ${p.description}` : ""}`,
    })),
  ];
  const universalOptions = [
    { value: "", label: "Add universal…" },
    { value: ADD_OTHER_OPTION, label: "Add other parts…" },
    ...builderData.universalPerks.map((p) => ({
      value: `245:${p.partId}`,
      label: `${p.stat}${p.description ? ` - ${p.description}` : ""}`,
    })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a grenade from manufacturer, level, rarity, and perks. Output syncs to Base85 for adding to backpack.
      </p>

      {/* Output */}
      <section className={blockClass}>
        <h3 className={`${labelClass} mb-2`}>Output</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={`${labelClass} block mb-1`}>Deserialized</label>
            <textarea
              value={rawOutput}
              onChange={(e) => handleRawChange(e.target.value)}
              placeholder="Decoded string"
              rows={3}
              className={`${inputClass} font-mono text-sm resize-y`}
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              <button type="button" onClick={() => copyToClipboard(rawOutput)} className={buttonSecondaryClass}>
                Copy
              </button>
              <button
                type="button"
                onClick={handleEncodeFromRaw}
                disabled={loading !== null}
                className={`${buttonSecondaryClass} disabled:opacity-50`}
              >
                Encode
              </button>
            </div>
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Base85</label>
            <textarea
              value={b85Output}
              onChange={(e) => handleB85Change(e.target.value)}
              placeholder="@U..."
              rows={3}
              className={`${inputClass} font-mono text-sm resize-y`}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2 gap-y-2">
              <button
                type="button"
                onClick={() => {
                  const serial = b85Output.trim();
                  copyToClipboard(serial);
                  if (serial.startsWith("@U")) {
                    addHistoryEntry({ itemType: "grenade", code: serial, decoded: rawOutput.trim() || undefined });
                  }
                }}
                className={buttonSecondaryClass}
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleDecodeFromB85}
                disabled={loading !== null}
                className={`${buttonSecondaryClass} disabled:opacity-50`}
              >
                Decode
              </button>
              <label className={labelClass}>Flag</label>
              <ThemedSelect
                value={String(flagValue)}
                onChange={(v) => setFlagValue(Number(v))}
                options={FLAG_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                className={inputClass}
                style={{ width: "10rem" }}
              />
              <button
                type="button"
                onClick={handleAddToBackpack}
                disabled={loading !== null || !saveData}
                className={buttonPrimaryClass}
              >
                {loading === "add" ? "Adding…" : "Add to Backpack"}
              </button>
              {!saveData && (
                <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline">
                  Load a save first
                </Link>
              )}
            </div>
          </div>
        </div>
        {manualOutputMode && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            Manual edit mode: clear both boxes to let the builder control output again.
          </p>
        )}
      </section>

      {/* Base attributes */}
      <section className={blockClass}>
        <h3 className={`${labelClass} mb-3`}>Base attributes</h3>
        <div className="flex flex-wrap gap-4 items-end gap-y-2">
          <div>
            <label className={`${labelClass} block mb-1`}>Manufacturer</label>
            <ThemedSelect
              value={String(mfgId)}
              onChange={(v) => {
                setMfgId(Number(v));
                setMfgPerkChecked(new Set());
                setSelectedParts([]);
              }}
              options={builderData.mfgs.map((m) => ({ value: String(m.id), label: `${m.name} - ${m.id}` }))}
              className={inputClass}
              style={{ minWidth: "12rem" }}
            />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Level</label>
            <input
              type="number"
              min={1}
              max={99}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
              style={{ width: "5rem" }}
            />
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className={blockClass}>
        <h3 className={`${labelClass} mb-3`}>Perks</h3>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Mfg Perks (checkbox multi select stays as-is) */}
          <div>
            <h4 className={`${labelClass} mb-2`}>Mfg Perks</h4>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {mfgPerksList.map((p) => (
                <label
                  key={p.partId}
                  className="flex items-center gap-2 cursor-pointer text-sm min-h-[44px] rounded px-2 py-1 hover:bg-[var(--color-accent)]/5 touch-manipulation"
                >
                  <input
                    type="checkbox"
                    checked={mfgPerkChecked.has(p.partId)}
                    onChange={() => toggleMfgPerk(p.partId)}
                    className="w-5 h-5 shrink-0 cursor-pointer"
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  <span className="text-[var(--color-text)]">
                    {p.stat}
                    {p.description ? ` - ${p.description}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Add-from-dropdown sections (weapon-builder style + qty confirm) */}
          <div className="space-y-3">
            <h4 className={`${labelClass} mb-1`}>Add parts</h4>
            <div className="space-y-2">
              <ThemedSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === ADD_OTHER_OPTION) {
                    setShowSuperAddParts(true);
                    return;
                  }
                  // Rarity uses current header mfgId as typeId, partId parsed from "R:<id>"
                  if (v.startsWith("R:")) {
                    const pid = Number(v.slice(2));
                    if (!Number.isFinite(pid)) return;
                    requestQtyForSelection({ typeId: mfgId, partId: pid, label: `Rarity: ${rarities.find((r) => r.id === pid)?.label ?? pid}`, qty: "1" });
                    return;
                  }
                  const parsed = v.match(/^(\d+)\:(\d+)$/);
                  if (!parsed) return;
                  const typeId = Number(parsed[1]);
                  const partId = Number(parsed[2]);
                  if (!Number.isFinite(typeId) || !Number.isFinite(partId)) return;
                  requestQtyForSelection({ typeId, partId, label: v, qty: "1" });
                }}
                options={rarityOptions}
                className={inputClass}
                title="Add rarity (multi-select)"
              />
              <ThemedSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === ADD_OTHER_OPTION) {
                    setShowSuperAddParts(true);
                    return;
                  }
                  const parsed = v.match(/^(\d+)\:(\d+)$/);
                  if (!parsed) return;
                  const typeId = Number(parsed[1]);
                  const partId = Number(parsed[2]);
                  if (!Number.isFinite(typeId) || !Number.isFinite(partId)) return;
                  const lbl = builderData.element.find((p) => p.partId === partId)?.stat ?? `Element ${partId}`;
                  requestQtyForSelection({ typeId, partId, label: `Element: ${lbl}`, qty: "1" });
                }}
                options={elementOptions}
                className={inputClass}
                title="Add element (multi-select)"
              />
              <ThemedSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === ADD_OTHER_OPTION) {
                    setShowSuperAddParts(true);
                    return;
                  }
                  const parsed = v.match(/^(\d+)\:(\d+)$/);
                  if (!parsed) return;
                  const typeId = Number(parsed[1]);
                  const partId = Number(parsed[2]);
                  if (!Number.isFinite(typeId) || !Number.isFinite(partId)) return;
                  const lbl = builderData.firmware.find((p) => p.partId === partId)?.stat ?? `Firmware ${partId}`;
                  requestQtyForSelection({ typeId, partId, label: `Firmware: ${lbl}`, qty: "1" });
                }}
                options={firmwareOptions}
                className={inputClass}
                title="Add firmware (multi-select)"
              />
              <ThemedSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === ADD_OTHER_OPTION) {
                    setShowSuperAddParts(true);
                    return;
                  }
                  const parsed = v.match(/^(\d+)\:(\d+)$/);
                  if (!parsed) return;
                  const typeId = Number(parsed[1]);
                  const partId = Number(parsed[2]);
                  if (!Number.isFinite(typeId) || !Number.isFinite(partId)) return;
                  const match = builderData.legendaryPerks.find((p) => p.partId === partId && p.mfgId === typeId);
                  requestQtyForSelection({
                    typeId,
                    partId,
                    label: match ? `Legendary: ${match.mfgName} - ${match.stat}` : `Legendary ${typeId}:${partId}`,
                    qty: "1",
                  });
                }}
                options={legendaryOptions}
                className={inputClass}
                title="Add legendary (multi-select)"
              />
              <ThemedSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === ADD_OTHER_OPTION) {
                    setShowSuperAddParts(true);
                    return;
                  }
                  const parsed = v.match(/^(\d+)\:(\d+)$/);
                  if (!parsed) return;
                  const typeId = Number(parsed[1]);
                  const partId = Number(parsed[2]);
                  if (!Number.isFinite(typeId) || !Number.isFinite(partId)) return;
                  const match = builderData.universalPerks.find((p) => p.partId === partId);
                  requestQtyForSelection({
                    typeId,
                    partId,
                    label: match ? `Universal: ${match.stat}` : `Universal ${typeId}:${partId}`,
                    qty: "1",
                  });
                }}
                options={universalOptions}
                className={inputClass}
                title="Add universal (multi-select)"
              />

              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonSecondaryClass} onClick={() => setShowSuperAddParts(true)}>
                  Add other parts…
                </button>
                <button
                  type="button"
                  className={buttonSecondaryClass}
                  onClick={() => {
                    setSelectedParts([]);
                    setMfgPerkChecked(new Set());
                  }}
                  title="Clear all selected parts (dropdown selections and mfg perk checkboxes)"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>

          {/* Selected list */}
          <div>
            <h4 className={`${labelClass} mb-2`}>Selected parts</h4>
            {selectedParts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No parts selected yet.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] p-1">
                {selectedParts.map((p, idx) => (
                  <div
                    key={`${p.typeId}:${p.partId}:${idx}`}
                    className={`flex items-center gap-2 rounded px-3 py-2 min-h-[44px] border hover:bg-[rgba(255,255,255,0.04)] ${p.typeId === 245 ? "border-purple-500/20 bg-purple-500/5" : "border-transparent hover:border-[var(--color-panel-border)]"}`}
                  >
                    {/* Reorder arrows for type-245 (order-sensitive) */}
                    {p.typeId === 245 && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveSelectedPart(idx, -1)}
                          className="text-[10px] leading-none px-1 py-0.5 rounded hover:bg-white/10 opacity-50 hover:opacity-100 transition-opacity"
                          title="Move up"
                        >▲</button>
                        <button
                          type="button"
                          onClick={() => moveSelectedPart(idx, 1)}
                          className="text-[10px] leading-none px-1 py-0.5 rounded hover:bg-white/10 opacity-50 hover:opacity-100 transition-opacity"
                          title="Move down"
                        >▼</button>
                      </div>
                    )}
                    <span className="text-xs text-[var(--color-text-muted)] font-mono shrink-0">{`{${p.typeId}:${p.partId}}`}</span>
                    <span className="flex-1 min-w-0 truncate text-sm text-[var(--color-text)]" title={p.label}>{p.label}</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={p.qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedParts((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: v } : x)));
                      }}
                      className="w-16 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeSelectedPartAt(idx)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[firebrick] text-white text-sm border border-[firebrick] touch-manipulation"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className={buttonSecondaryClass} onClick={() => clearSelectedPartsByTypeId(245)} title="Remove all element/firmware/universal (245) selections">
                Clear 245
              </button>
              <button type="button" className={buttonSecondaryClass} onClick={() => clearSelectedPartsByTypeId(mfgId)} title="Remove all selections under the current manufacturer typeId">
                Clear mfg
              </button>
            </div>
          </div>
        </div>
      </section>

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}

      {/* Quantity confirmation modal (same pattern as Weapon Gen) */}
      {pendingQtyPart && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-40 p-4">
          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl p-4 w-full max-w-sm">
            <p className="text-sm text-[var(--color-text)] mb-2">
              Quantity for{" "}
              <span className="text-[var(--color-accent)] truncate block">{pendingQtyPart.next.label}</span>
            </p>
            <input
              type="number"
              min={1}
              max={99}
              value={pendingQtyInput}
              onChange={(e) => setPendingQtyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const qty = Math.max(1, Math.min(99, parseInt(pendingQtyInput.trim(), 10) || 1));
                  addSelectedPart({ ...pendingQtyPart.next, qty: String(qty) });
                  setPendingQtyPart(null);
                }
                if (e.key === "Escape") {
                  setPendingQtyPart(null);
                }
              }}
              className={`${inputClass} mb-3`}
              autoFocus
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingQtyPart(null)}
                className={`${buttonSecondaryClass} text-sm`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const qty = Math.max(1, Math.min(99, parseInt(pendingQtyInput.trim(), 10) || 1));
                  addSelectedPart({ ...pendingQtyPart.next, qty: String(qty) });
                  setPendingQtyPart(null);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[44px] text-sm touch-manipulation"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual recipe picker (Feature 12) */}
      <VisualRecipePanel onLoad={loadRecipe} />

      {/* Code history */}
      <CodeHistoryPanel />

      {/* Super parts modal (DB-backed picker) */}
      {showSuperAddParts && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-40 p-2 sm:p-4">
          <div className="max-h-[85dvh] sm:max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
              <h3 className="text-[var(--color-accent)] font-medium text-sm">Add Other Parts</h3>
              <button
                type="button"
                onClick={() => setShowSuperAddParts(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm touch-manipulation"
              >
                Close
              </button>
            </div>
            <div className="flex-1 px-4 py-3 text-sm flex flex-col gap-3 overflow-hidden min-h-0">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={superSearch}
                  onChange={(e) => setSuperSearch(e.target.value)}
                  placeholder="Search by name, effect, manufacturer, or code…"
                  className={inputClass}
                />
                <button type="button" onClick={() => setSuperSearch("")} className={buttonSecondaryClass}>
                  Clear
                </button>
              </div>
              {(() => {
                const manufacturers = [...new Set(superParts.map((p) => p.manufacturer).filter(Boolean))].sort();
                const raritySet = new Set<string>();
                superParts.forEach((p) => {
                  const n = normalizeSuperRarity(p.rarity);
                  if (n) raritySet.add(n);
                });
                const rarities = [...raritySet].sort();
                return (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-[var(--color-text-muted)] text-xs shrink-0">Quick filters:</span>
                    <select
                      value={superManufacturerFilter}
                      onChange={(e) => setSuperManufacturerFilter(e.target.value)}
                      className={inputClass}
                      title="Filter by manufacturer"
                      style={{ width: "13rem" }}
                    >
                      <option value="">All manufacturers</option>
                      {manufacturers.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={superRarityFilter}
                      onChange={(e) => setSuperRarityFilter(e.target.value)}
                      className={inputClass}
                      title="Filter by rarity"
                      style={{ width: "10rem" }}
                    >
                      <option value="">All rarities</option>
                      {rarities.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
                {superParts
                  .map((p, realIdx) => ({ p, realIdx }))
                  .filter(({ p }) => {
                    if (superManufacturerFilter && (p.manufacturer ?? "") !== superManufacturerFilter) return false;
                    if (!superPartMatchesRarity(p.rarity, superRarityFilter)) return false;
                    const q = superSearch.trim().toLowerCase();
                    if (!q) return true;
                    const haystack = [
                      p.label,
                      p.code,
                      p.effect ?? "",
                      p.itemType ?? "",
                      p.manufacturer ?? "",
                      p.partType ?? "",
                      p.rarity ?? "",
                    ]
                      .join(" ")
                      .toLowerCase();
                    return haystack.includes(q);
                  })
                  .map(({ p, realIdx }) => (
                    <div
                      key={`${p.code}-${realIdx}`}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-2 cursor-pointer rounded px-3 py-2 -mx-1 hover:bg-[rgba(255,255,255,0.06)] focus:outline-none focus:bg-[rgba(255,255,255,0.06)] min-h-[44px] touch-manipulation"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("input")) return;
                        setSuperParts((prev) =>
                          prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setSuperParts((prev) =>
                          prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                        );
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={p.checked}
                        onChange={() =>
                          setSuperParts((prev) =>
                            prev.map((s, i) => (i === realIdx ? { ...s, checked: !s.checked } : s)),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 w-5 h-5 cursor-pointer"
                        style={{ accentColor: "var(--color-accent)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          {p.label}{" "}
                          <span className="text-[var(--color-text-muted)]">
                            ({p.code}
                            {p.rarity ? ` · ${p.rarity}` : ""}{p.itemType ? ` · ${p.itemType}` : ""}
                            {p.manufacturer ? ` · ${p.manufacturer}` : ""})
                          </span>
                        </div>
                        {p.effect && (
                          <div className="text-xs text-[var(--color-accent)] mt-0.5 truncate" title={p.effect}>
                            {p.effect.length > 90 ? `…${p.effect.slice(-86)}` : p.effect}
                          </div>
                        )}
                      </div>
                      {p.checked && (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={p.qty}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSuperParts((prev) => prev.map((s, i) => (i === realIdx ? { ...s, qty: v } : s)));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex flex-wrap justify-end gap-2 shrink-0">
              <button type="button" onClick={() => setShowSuperAddParts(false)} className={buttonSecondaryClass}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const checked = superParts.filter((p) => p.checked);
                  if (checked.length) {
                    const additions: SelectedPart[] = [];
                    for (const p of checked) {
                      const parsed = parseCodePair(p.code);
                      if (!parsed) continue;
                      const qty = Math.max(1, Math.min(99, parseInt(p.qty.trim(), 10) || 1));
                      additions.push({
                        typeId: parsed.typeId,
                        partId: parsed.partId,
                        label: `DB: ${p.label}`,
                        qty: String(qty),
                      });
                    }
                    if (additions.length) setSelectedParts((prev) => [...prev, ...additions]);
                  }
                  setShowSuperAddParts(false);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[44px] text-sm touch-manipulation"
              >
                Confirm Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
