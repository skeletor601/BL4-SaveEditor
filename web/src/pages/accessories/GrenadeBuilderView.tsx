import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";

const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 17, label: "17" },
  { value: 33, label: "33" },
  { value: 65, label: "65" },
  { value: 129, label: "129" },
];

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

type LegendaryEntry = { partId: number; mfgId: number };
type UniversalEntry = { partId: number; count: number };

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function GrenadeBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [builderData, setBuilderData] = useState<GrenadeBuilderData | null>(null);
  const [mfgId, setMfgId] = useState<number>(263);
  const [level, setLevel] = useState("50");
  const [rarityId, setRarityId] = useState<number | null>(null);
  const [mfgPerkChecked, setMfgPerkChecked] = useState<Set<number>>(new Set());
  const [elementPartId, setElementPartId] = useState<number | null>(null);
  const [firmwarePartId, setFirmwarePartId] = useState<number | null>(null);
  const [legendarySelected, setLegendarySelected] = useState<LegendaryEntry[]>([]);
  const [universalSelected, setUniversalSelected] = useState<UniversalEntry[]>([]);
  const [universalMultiplier, setUniversalMultiplier] = useState(1);
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);
  const legendaryAvailableRef = useRef<HTMLSelectElement>(null);
  const universalAvailableRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/grenade/builder-data")
      .then((r) => r.json())
      .then((data: GrenadeBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          setRarityId(null);
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

  const rarities = builderData?.raritiesByMfg[mfgId] ?? [];
  const mfgPerksList = builderData?.mfgPerks[mfgId] ?? [];

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData) return;
    const mainParts = [`${mfgId}, 0, 1, ${level}| 2, 305||`];
    const skillParts: string[] = [];
    const secondary: Record<number, number[]> = {};

    if (rarityId != null) skillParts.push(`{${rarityId}}`);

    const otherMfgPerks: Record<number, number[]> = {};
    for (const { partId, mfgId: itemMfgId } of legendarySelected) {
      if (itemMfgId === mfgId) {
        skillParts.push(`{${partId}}`);
      } else {
        if (!otherMfgPerks[itemMfgId]) otherMfgPerks[itemMfgId] = [];
        otherMfgPerks[itemMfgId].push(partId);
      }
    }
    for (const [itemMfgId, ids] of Object.entries(otherMfgPerks)) {
      const sorted = [...ids].sort((a, b) => a - b);
      if (sorted.length === 1) {
        skillParts.push(`{${itemMfgId}:${sorted[0]}}`);
      } else {
        skillParts.push(`{${itemMfgId}:[${sorted.join(" ")}]}`);
      }
    }

    if (elementPartId != null) {
      if (!secondary[245]) secondary[245] = [];
      secondary[245].push(elementPartId);
    }
    if (firmwarePartId != null) {
      if (!secondary[245]) secondary[245] = [];
      secondary[245].push(firmwarePartId);
    }

    for (const partId of mfgPerkChecked) {
      skillParts.push(`{${partId}}`);
    }

    for (const { partId, count } of universalSelected) {
      if (!secondary[245]) secondary[245] = [];
      for (let i = 0; i < count; i++) secondary[245].push(partId);
    }

    for (const [k, v] of Object.entries(secondary)) {
      if (v.length > 0) {
        const key = Number(k);
        if (v.length === 1) {
          skillParts.push(`{${key}:${v[0]}}`);
        } else {
          const sorted = [...v].sort((a, b) => a - b);
          skillParts.push(`{${key}:[${sorted.join(" ")}]}`);
        }
      }
    }

    const finalStr = mainParts.join(" ") + " " + skillParts.join(" ") + " |";
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
    rarityId,
    mfgPerkChecked,
    elementPartId,
    firmwarePartId,
    legendarySelected,
    universalSelected,
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
        setMessage("Grenade added to backpack. Use Download .sav on Select Save to export.");
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

  const legendaryAvailableAll = builderData?.legendaryPerks ?? [];

  const moveToLegendarySelected = () => {
    const sel = legendaryAvailableRef.current;
    if (!sel?.selectedOptions?.length) return;
    const toAdd: LegendaryEntry[] = [];
    for (let i = 0; i < sel.selectedOptions.length; i++) {
      const opt = sel.selectedOptions[i] as HTMLOptionElement;
      const [mfgIdStr, partIdStr] = String(opt.value).split(",");
      const partId = Number(partIdStr);
      const itemMfgId = Number(mfgIdStr);
      if (!Number.isFinite(partId) || !Number.isFinite(itemMfgId)) continue;
      if (legendarySelected.some((s) => s.partId === partId && s.mfgId === itemMfgId)) continue;
      toAdd.push({ partId, mfgId: itemMfgId });
    }
    if (toAdd.length > 0) setLegendarySelected((prev) => [...prev, ...toAdd]);
  };

  const clearLegendary = () => setLegendarySelected([]);

  const moveToUniversalSelected = () => {
    const sel = universalAvailableRef.current;
    if (!sel?.selectedOptions?.length) return;
    setUniversalSelected((prev) => {
      const next = [...prev];
      for (let i = 0; i < sel.selectedOptions.length; i++) {
        const partId = Number((sel.selectedOptions[i] as HTMLOptionElement).value);
        if (!Number.isFinite(partId)) continue;
        const existing = next.find((s) => s.partId === partId);
        if (existing) existing.count += universalMultiplier;
        else next.push({ partId, count: universalMultiplier });
      }
      return next;
    });
  };

  const clearUniversal = () => setUniversalSelected([]);

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading grenade data…" : "Grenade builder data not available."}
      </div>
    );
  }

  const universalSelectedWithStat = universalSelected.map((s) => {
    const p = builderData.universalPerks.find((u) => u.partId === s.partId);
    return { ...s, stat: p?.stat ?? `Part ${s.partId}` };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a grenade from manufacturer, level, rarity, and perks. Output syncs to Base85 for adding to backpack.
      </p>

      {/* Output */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Output</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Raw (decoded)</label>
            <textarea
              value={rawOutput}
              onChange={(e) => handleRawChange(e.target.value)}
              placeholder="Decoded string"
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => copyToClipboard(rawOutput)}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleEncodeFromRaw}
                disabled={loading !== null}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50"
              >
                Encode
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Base85</label>
            <textarea
              value={b85Output}
              onChange={(e) => handleB85Change(e.target.value)}
              placeholder="@U..."
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex gap-2 mt-1 flex-wrap items-center">
              <button
                type="button"
                onClick={() => copyToClipboard(b85Output)}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleDecodeFromB85}
                disabled={loading !== null}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50"
              >
                Decode
              </button>
              <label className="text-sm text-[var(--color-text-muted)]">Flag:</label>
              <select
                value={flagValue}
                onChange={(e) => setFlagValue(Number(e.target.value))}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
              >
                {FLAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddToBackpack}
                disabled={loading !== null || !saveData}
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-50"
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
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Base attributes</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Manufacturer</label>
            <select
              value={mfgId}
              onChange={(e) => {
                setMfgId(Number(e.target.value));
                setRarityId(null);
                setMfgPerkChecked(new Set());
              }}
              className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-w-[180px]"
            >
              {builderData.mfgs.map((m) => (
                <option key={m.id} value={m.id}>{m.name} - {m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Level</label>
            <input
              type="number"
              min={1}
              max={99}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] w-20"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Rarity</label>
            <select
              value={rarityId ?? ""}
              onChange={(e) => setRarityId(e.target.value === "" ? null : Number(e.target.value))}
              className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-w-[200px]"
            >
              <option value="">—</option>
              {rarities.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Perks</h3>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Mfg Perks */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Mfg Perks</h4>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {mfgPerksList.map((p) => (
                <label key={p.partId} className="flex items-start gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={mfgPerkChecked.has(p.partId)}
                    onChange={() => toggleMfgPerk(p.partId)}
                    className="mt-1"
                  />
                  <span>
                    {p.stat}
                    {p.description ? ` - ${p.description}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Element */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Element</h4>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="element"
                  checked={elementPartId === null}
                  onChange={() => setElementPartId(null)}
                />
                None
              </label>
              {builderData.element.map((p) => (
                <label key={p.partId} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="element"
                    checked={elementPartId === p.partId}
                    onChange={() => setElementPartId(p.partId)}
                  />
                  {p.stat}
                </label>
              ))}
            </div>
          </div>

          {/* Firmware */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Firmware</h4>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="firmware"
                  checked={firmwarePartId === null}
                  onChange={() => setFirmwarePartId(null)}
                />
                None
              </label>
              {builderData.firmware.map((p) => (
                <label key={p.partId} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="firmware"
                    checked={firmwarePartId === p.partId}
                    onChange={() => setFirmwarePartId(p.partId)}
                  />
                  {p.stat}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Legendary dual list */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Legendary</h4>
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--color-text-muted)]">Available (all mfg)</label>
              <select
                ref={legendaryAvailableRef}
                multiple
                size={6}
                className="w-full mt-1 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              >
                {legendaryAvailableAll.map((p) => (
                  <option key={`${p.mfgId}-${p.partId}`} value={`${p.mfgId},${p.partId}`}>
                    {p.mfgName} - {p.stat}
                    {p.description ? ` - ${p.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 justify-center">
              <button
                type="button"
                onClick={moveToLegendarySelected}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                »
              </button>
              <button
                type="button"
                onClick={clearLegendary}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--color-text-muted)]">Selected</label>
              <ul className="mt-1 border border-[var(--color-panel-border)] rounded px-2 py-1 bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] min-h-[120px] max-h-32 overflow-y-auto">
                {legendarySelected.map((s) => {
                  const p = legendaryAvailableAll.find((x) => x.partId === s.partId && x.mfgId === s.mfgId);
                  return (
                    <li key={`${s.mfgId}-${s.partId}`}>
                      {p?.mfgName ?? s.mfgId} - {p?.stat ?? s.partId}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Universal dual list with multiplier */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Universal (quantity)</h4>
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--color-text-muted)]">Available</label>
              <select
                ref={universalAvailableRef}
                multiple
                size={8}
                className="w-full mt-1 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              >
                {builderData.universalPerks.map((p) => (
                  <option key={p.partId} value={p.partId}>
                    {p.stat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 justify-center">
              <label className="text-xs text-[var(--color-text-muted)]">Qty</label>
              <input
                type="number"
                min={1}
                max={999}
                value={universalMultiplier}
                onChange={(e) => setUniversalMultiplier(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                className="w-14 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              />
              <button
                type="button"
                onClick={moveToUniversalSelected}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                »
              </button>
              <button
                type="button"
                onClick={clearUniversal}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--color-text-muted)]">Selected</label>
              <ul className="mt-1 border border-[var(--color-panel-border)] rounded px-2 py-1 bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] min-h-[140px] max-h-48 overflow-y-auto">
                {universalSelectedWithStat.map((s) => (
                  <li key={s.partId}>
                    {s.count > 1 ? `(${s.count}) ` : ""}{s.stat}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
    </div>
  );
}
