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

interface RepkitBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

interface RepkitBuilderLegendaryPart extends RepkitBuilderPart {
  mfgId: number;
  mfgName: string;
}

interface RepkitBuilderRarity {
  id: number;
  label: string;
}

interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  prefix: RepkitBuilderPart[];
  firmware: RepkitBuilderPart[];
  resistance: RepkitBuilderPart[];
  universalPerks: RepkitBuilderPart[];
  legendaryPerks: RepkitBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}

type LegendarySelection = { partId: number; mfgId: number; mfgName: string; stat: string; description?: string; checked: boolean; qty: string };
type UniversalSelection = { partId: number; stat: string; description?: string; checked: boolean; qty: string };

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

// Elemental groups used for Model+ logic (IDs from desktop repkit tab).
const COMBUSTION_IDS = [24, 50, 29, 44];
const RADIATION_IDS = [23, 47, 28, 43];
const CORROSIVE_IDS = [26, 51, 31, 46];
const SHOCK_IDS = [22, 49, 27, 42];
const CRYO_IDS = [25, 48, 30, 45];

const COMBUSTION_MODEL_PLUS = 98;
const RADIATION_MODEL_PLUS = 99;
const CORROSIVE_MODEL_PLUS = 100;
const SHOCK_MODEL_PLUS = 101;
const CRYO_MODEL_PLUS = 102;

export default function RepkitBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [builderData, setBuilderData] = useState<RepkitBuilderData | null>(null);
  const [mfgId, setMfgId] = useState<number>(277);
  const [level, setLevel] = useState("50");
  const [rarityId, setRarityId] = useState<number | null>(null);
  const [prefixPartId, setPrefixPartId] = useState<number | null>(null);
  const [firmwarePartId, setFirmwarePartId] = useState<number | null>(null);
  const [resistancePartId, setResistancePartId] = useState<number | null>(null);
  const [legendarySelections, setLegendarySelections] = useState<LegendarySelection[]>([]);
  const [universalSelections, setUniversalSelections] = useState<UniversalSelection[]>([]);
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/repkit/builder-data")
      .then((r) => r.json())
      .then((data: RepkitBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          setRarityId(null);
          setLegendarySelections(
            (data.legendaryPerks ?? []).map((p) => ({
              partId: p.partId,
              mfgId: p.mfgId,
              mfgName: p.mfgName,
              stat: p.stat,
              description: p.description,
              checked: false,
              qty: "1",
            }))
          );
          setUniversalSelections(
            (data.universalPerks ?? []).map((p) => ({
              partId: p.partId,
              stat: p.stat,
              description: p.description,
              checked: false,
              qty: "1",
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load Repkit builder data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rarities = builderData?.raritiesByMfg[mfgId] ?? [];

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData) return;
    const mainParts = [`${mfgId}, 0, 1, ${level}| 2, 307||`];
    const skillParts: string[] = [];
    const secondary: Record<number, number[]> = {};

    if (rarityId != null) skillParts.push(`{${rarityId}}`);

    // Model for current manufacturer (if any).
    const modelId = builderData.modelsByMfg[mfgId];
    if (modelId != null) {
      skillParts.push(`{${modelId}}`);
    }

    const otherMfgPerks: Record<number, number[]> = {};
    for (const sel of legendarySelections) {
      if (!sel.checked) continue;
      const count = Math.max(1, Math.min(99, parseInt(sel.qty.trim(), 10) || 1));
      for (let i = 0; i < count; i++) {
        if (sel.mfgId === mfgId) {
          skillParts.push(`{${sel.partId}}`);
        } else {
          if (!otherMfgPerks[sel.mfgId]) otherMfgPerks[sel.mfgId] = [];
          otherMfgPerks[sel.mfgId].push(sel.partId);
        }
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

    // Prefix / firmware / resistance selections: all encoded under type 243.
    const add243 = (id: number) => {
      if (!secondary[243]) secondary[243] = [];
      secondary[243].push(id);
    };

    if (prefixPartId != null) add243(prefixPartId);
    if (firmwarePartId != null) add243(firmwarePartId);

    if (resistancePartId != null) {
      add243(resistancePartId);
      // Model+ logic based on selected resistance/immunity.
      if (COMBUSTION_IDS.includes(resistancePartId)) add243(COMBUSTION_MODEL_PLUS);
      else if (RADIATION_IDS.includes(resistancePartId)) add243(RADIATION_MODEL_PLUS);
      else if (CORROSIVE_IDS.includes(resistancePartId)) add243(CORROSIVE_MODEL_PLUS);
      else if (SHOCK_IDS.includes(resistancePartId)) add243(SHOCK_MODEL_PLUS);
      else if (CRYO_IDS.includes(resistancePartId)) add243(CRYO_MODEL_PLUS);
    }

    for (const s of universalSelections) {
      if (!s.checked) continue;
      const count = Math.max(1, Math.min(99, parseInt(s.qty.trim(), 10) || 1));
      for (let i = 0; i < count; i += 1) add243(s.partId);
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
    prefixPartId,
    firmwarePartId,
    resistancePartId,
    legendarySelections,
    universalSelections,
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
        setMessage("Repkit added to backpack. Use Overwrite save on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output, saveData, flagValue, getYamlText, updateSaveData]);

  const toggleLegendary = (index: number) => {
    setLegendarySelections((prev) => prev.map((s, i) => (i === index ? { ...s, checked: !s.checked } : s)));
  };
  const setLegendaryQty = (index: number, qty: string) => {
    setLegendarySelections((prev) => prev.map((s, i) => (i === index ? { ...s, qty } : s)));
  };
  const toggleUniversal = (index: number) => {
    setUniversalSelections((prev) => prev.map((s, i) => (i === index ? { ...s, checked: !s.checked } : s)));
  };
  const setUniversalQty = (index: number, qty: string) => {
    setUniversalSelections((prev) => prev.map((s, i) => (i === index ? { ...s, qty } : s)));
  };

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading Repkit data…" : "Repkit builder data not available."}
      </div>
    );
  }

  function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const prefixOptions = [{ value: "", label: "None" }, ...builderData.prefix.map((p) => ({ value: String(p.partId), label: p.stat + (p.description ? ` - ${p.description}` : "") }))];
  const firmwareOptions = [{ value: "", label: "None" }, ...builderData.firmware.map((p) => ({ value: String(p.partId), label: p.stat + (p.description ? ` - ${p.description}` : "") }))];
  const resistanceOptions = [{ value: "", label: "None" }, ...builderData.resistance.map((p) => ({ value: String(p.partId), label: p.stat + (p.description ? ` - ${p.description}` : "") }))];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a Repkit from manufacturer, level, rarity, and perks. Output syncs to Base85 for adding to backpack.
      </p>

      <section className={blockClass}>
        <h3 className={`${labelClass} mb-2`}>Output</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={`${labelClass} block mb-1`}>Deserialized</label>
            <textarea value={rawOutput} onChange={(e) => handleRawChange(e.target.value)} placeholder="Decoded string" rows={3} className={`${inputClass} font-mono text-sm resize-y`} />
            <div className="flex gap-2 mt-2 flex-wrap">
              <button type="button" onClick={() => copyToClipboard(rawOutput)} className={buttonSecondaryClass}>Copy</button>
              <button type="button" onClick={handleEncodeFromRaw} disabled={loading !== null} className={`${buttonSecondaryClass} disabled:opacity-50`}>Encode</button>
            </div>
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Base85</label>
            <textarea value={b85Output} onChange={(e) => handleB85Change(e.target.value)} placeholder="@U..." rows={3} className={`${inputClass} font-mono text-sm resize-y`} />
            <div className="flex flex-wrap items-center gap-2 mt-2 gap-y-2">
              <button type="button" onClick={() => copyToClipboard(b85Output)} className={buttonSecondaryClass}>Copy</button>
              <button type="button" onClick={handleDecodeFromB85} disabled={loading !== null} className={`${buttonSecondaryClass} disabled:opacity-50`}>Decode</button>
              <label className={labelClass}>Flag</label>
              <ThemedSelect value={String(flagValue)} onChange={(v) => setFlagValue(Number(v))} options={FLAG_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} className={inputClass} style={{ width: "10rem" }} />
              <button type="button" onClick={handleAddToBackpack} disabled={loading !== null || !saveData} className={buttonPrimaryClass}>{loading === "add" ? "Adding…" : "Add to Backpack"}</button>
              {!saveData && <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline">Load a save first</Link>}
            </div>
          </div>
        </div>
        {manualOutputMode && <p className="text-xs text-[var(--color-text-muted)] mt-2">Manual edit mode: clear both boxes to let the builder control output again.</p>}
      </section>

      <section className={blockClass}>
        <h3 className={`${labelClass} mb-3`}>Base attributes</h3>
        <div className="flex flex-wrap gap-4 items-end gap-y-2">
          <div>
            <label className={`${labelClass} block mb-1`}>Manufacturer</label>
            <ThemedSelect value={String(mfgId)} onChange={(v) => { setMfgId(Number(v)); setRarityId(null); }} options={builderData.mfgs.map((m) => ({ value: String(m.id), label: `${m.name} - ${m.id}` }))} className={inputClass} style={{ minWidth: "12rem" }} />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Level</label>
            <input type="number" min={1} max={99} value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass} style={{ width: "5rem" }} />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Rarity</label>
            <ThemedSelect value={rarityId != null ? String(rarityId) : ""} onChange={(v) => setRarityId(v === "" ? null : Number(v))} options={[{ value: "", label: "—" }, ...rarities.map((r) => ({ value: String(r.id), label: r.label }))]} className={inputClass} style={{ minWidth: "12rem" }} />
          </div>
        </div>
      </section>

      <section className={blockClass}>
        <h3 className={`${labelClass} mb-3`}>Perks</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h4 className={`${labelClass} mb-2`}>Prefix</h4>
            <ThemedSelect value={prefixPartId != null ? String(prefixPartId) : ""} onChange={(v) => setPrefixPartId(v === "" ? null : Number(v))} options={prefixOptions} className={inputClass} />
          </div>
          <div>
            <h4 className={`${labelClass} mb-2`}>Firmware</h4>
            <ThemedSelect value={firmwarePartId != null ? String(firmwarePartId) : ""} onChange={(v) => setFirmwarePartId(v === "" ? null : Number(v))} options={firmwareOptions} className={inputClass} />
          </div>
          <div>
            <h4 className={`${labelClass} mb-2`}>Resistance / Immunity</h4>
            <ThemedSelect value={resistancePartId != null ? String(resistancePartId) : ""} onChange={(v) => setResistancePartId(v === "" ? null : Number(v))} options={resistanceOptions} className={inputClass} />
          </div>
        </div>

        <div className="mt-6">
          <h4 className={`${labelClass} mb-2`}>Legendary</h4>
          <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] p-1">
            {legendarySelections.map((s, idx) => (
              <div key={`${s.mfgId}-${s.partId}`} role="button" tabIndex={0} className={`flex items-center gap-2 rounded px-3 py-2 min-h-[44px] cursor-pointer border touch-manipulation ${s.checked ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "border-transparent hover:bg-[var(--color-accent)]/5 text-[var(--color-text)]"}`} onClick={(e) => { if ((e.target as HTMLElement).closest("input")?.getAttribute("type") === "number") return; toggleLegendary(idx); }} onKeyDown={(e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); toggleLegendary(idx); }}>
                <input type="checkbox" checked={s.checked} onChange={() => toggleLegendary(idx)} className="w-5 h-5 shrink-0 cursor-pointer" style={{ accentColor: "var(--color-accent)" }} onClick={(e) => e.stopPropagation()} />
                <span className="flex-1 min-w-0 truncate">{s.mfgName} - {s.stat}{s.description ? ` - ${s.description}` : ""}</span>
                {s.checked && <input type="number" min={1} max={99} value={s.qty} onChange={(e) => setLegendaryQty(idx, e.target.value)} onClick={(e) => e.stopPropagation()} className="w-16 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]" />}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className={`${labelClass} mb-2`}>Universal (quantity)</h4>
          <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] p-1">
            {universalSelections.map((s, idx) => (
              <div key={s.partId} role="button" tabIndex={0} className={`flex items-center gap-2 rounded px-3 py-2 min-h-[44px] cursor-pointer border touch-manipulation ${s.checked ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "border-transparent hover:bg-[var(--color-accent)]/5 text-[var(--color-text)]"}`} onClick={(e) => { if ((e.target as HTMLElement).closest("input")?.getAttribute("type") === "number") return; toggleUniversal(idx); }} onKeyDown={(e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); toggleUniversal(idx); }}>
                <input type="checkbox" checked={s.checked} onChange={() => toggleUniversal(idx)} className="w-5 h-5 shrink-0 cursor-pointer" style={{ accentColor: "var(--color-accent)" }} onClick={(e) => e.stopPropagation()} />
                <span className="flex-1 min-w-0 truncate">{s.stat}{s.description ? ` - ${s.description}` : ""}</span>
                {s.checked && <input type="number" min={1} max={99} value={s.qty} onChange={(e) => setUniversalQty(idx, e.target.value)} onClick={(e) => e.stopPropagation()} className="w-16 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
    </div>
  );
}

