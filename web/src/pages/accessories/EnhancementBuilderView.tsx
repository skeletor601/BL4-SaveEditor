import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";

const FLAG_OPTIONS = [
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 17, label: "17" },
  { value: 33, label: "33" },
  { value: 65, label: "65" },
  { value: 129, label: "129" },
];

interface EnhancementMfgPerk {
  index: number;
  name: string;
}

interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: EnhancementMfgPerk[];
  rarities: Record<string, number>;
}

interface Enhancement247Perk {
  code: number;
  name: string;
}

interface EnhancementBuilderData {
  manufacturers: Record<string, EnhancementManufacturer>;
  rarityMap247: Record<string, number>;
  secondary247: Enhancement247Perk[];
}

/** Stack entry: other mfg's perk, display "[index] name — mfgName" */
type StackEntry = { mfgCode: number; mfgName: string; index: number; name: string };
type StackSelectedEntry = { mfgCode: number; mfgName: string; index: number; name: string; count: number };
type Stats247Entry = { code: number; count: number };

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const PERK_ORDER = [1, 2, 3, 9];

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function EnhancementBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [builderData, setBuilderData] = useState<EnhancementBuilderData | null>(null);
  const [mfgName, setMfgName] = useState("");
  const [rarity, setRarity] = useState("Legendary");
  const [level, setLevel] = useState("50");
  const [seed] = useState(() => String(Math.floor(Math.random() * 9000) + 1000));
  const [perkChecked, setPerkChecked] = useState<Set<number>>(new Set());
  const [stackFilter, setStackFilter] = useState("");
  const [stackSelected, setStackSelected] = useState<StackSelectedEntry[]>([]);
  const [stackMultiplier, setStackMultiplier] = useState(1);
  const [filter247, setFilter247] = useState("");
  const [stats247Selected, setStats247Selected] = useState<Stats247Entry[]>([]);
  const [stats247Multiplier, setStats247Multiplier] = useState(1);
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);
  const stackAvailRef = useRef<HTMLSelectElement>(null);
  const stackSelRef = useRef<HTMLSelectElement>(null);
  const avail247Ref = useRef<HTMLSelectElement>(null);
  const sel247Ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/enhancement/builder-data")
      .then((r) => r.json())
      .then((data: EnhancementBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          const names = Object.keys(data.manufacturers).sort();
          setMfgName(names[0] ?? "");
          setRarity("Legendary");
          setPerkChecked(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load enhancement builder data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mfg = mfgName && builderData?.manufacturers[mfgName] ? builderData.manufacturers[mfgName] : null;
  const rarities = mfg ? RARITY_ORDER.filter((r) => r in mfg.rarities) : [];
  const perkVars = mfg ? PERK_ORDER.filter((i) => mfg.perks.some((p) => p.index === i)) : [];

  // Stack available: other mfgs' perks (indices 1,2,3,9)
  const stackAvailable = ((): StackEntry[] => {
    if (!builderData || !mfgName) return [];
    const out: StackEntry[] = [];
    const q = stackFilter.toLowerCase();
    for (const [name, data] of Object.entries(builderData.manufacturers)) {
      if (name === mfgName) continue;
      for (const perk of data.perks) {
        if (!PERK_ORDER.includes(perk.index)) continue;
        const text = `[${perk.index}] ${perk.name} — ${name}`;
        if (!q || text.toLowerCase().includes(q)) {
          out.push({ mfgCode: data.code, mfgName: name, index: perk.index, name: perk.name });
        }
      }
    }
    return out.sort((a, b) => (a.mfgName === b.mfgName ? a.index - b.index : a.mfgName.localeCompare(b.mfgName)));
  })();

  const avail247Filtered = builderData
    ? filter247.trim()
      ? builderData.secondary247.filter(
          (s) =>
            s.name.toLowerCase().includes(filter247.toLowerCase()) ||
            String(s.code).includes(filter247)
        )
      : builderData.secondary247
    : [];

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData || !mfg) return;
    const levelVal = level.trim() || "50";
    const parts: string[] = [];
    parts.push(`${mfg.code}, 0, 1, ${levelVal}| 2, ${seed}||`);
    const rarityCode = mfg.rarities[rarity];
    if (rarityCode != null) parts.push(`{${rarityCode}}`);
    const rarity247Code = builderData.rarityMap247[rarity];
    if (rarity247Code != null) parts.push(`{247:${rarity247Code}}`);
    for (const index of perkVars) {
      if (perkChecked.has(index)) parts.push(`{${index}}`);
    }
    const stackedPerks: Record<number, number[]> = {};
    for (const { mfgCode, index, count } of stackSelected) {
      if (!stackedPerks[mfgCode]) stackedPerks[mfgCode] = [];
      for (let i = 0; i < count; i++) stackedPerks[mfgCode].push(index);
    }
    for (const [code, indices] of Object.entries(stackedPerks)) {
      const sorted = [...indices].sort((a, b) => a - b);
      parts.push(`{${code}:[${sorted.join(" ")}]}`);
    }
    const stats247: number[] = [];
    for (const { code, count } of stats247Selected) {
      for (let i = 0; i < count; i++) stats247.push(code);
    }
    if (stats247.length > 0) {
      parts.push(`{247:[${stats247.join(" ")}]}`);
    }
    const fullString = parts.join(" ").replace(/\s+/g, " ").trim() + "|";
    setRawOutput(fullString);

    setLoading("encode");
    try {
      const res = await fetchApi("save/encode-serial", {
        method: "POST",
        body: JSON.stringify({ decoded_string: fullString }),
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
    mfg,
    level,
    seed,
    rarity,
    perkChecked,
    perkVars,
    stackSelected,
    stats247Selected,
  ]);

  useEffect(() => {
    if (!builderData || !mfg) return;
    rebuildOutput();
  }, [builderData, mfg, rebuildOutput]);

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
        setMessage("Enhancement added to backpack. Use Overwrite save on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output, saveData, flagValue, getYamlText, updateSaveData]);

  const togglePerk = (index: number) => {
    setPerkChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addStacks = () => {
    const sel = stackAvailRef.current;
    if (!sel?.selectedOptions?.length) return;
    const mult = stackMultiplier;
    const toAdd: StackEntry[] = [];
    for (let i = 0; i < sel.selectedOptions.length; i++) {
      const opt = sel.selectedOptions[i] as HTMLOptionElement;
      const idx = Number(opt.value);
      if (!Number.isFinite(idx) || idx < 0 || idx >= stackAvailable.length) continue;
      toAdd.push(stackAvailable[idx]);
    }
    setStackSelected((prev) => {
      const next = [...prev];
      for (const e of toAdd) {
        const ex = next.find((x) => x.mfgCode === e.mfgCode && x.index === e.index);
        if (ex) ex.count += mult;
        else next.push({ mfgCode: e.mfgCode, mfgName: e.mfgName, index: e.index, name: e.name, count: mult });
      }
      return next;
    });
  };
  const removeStacks = () => {
    const sel = stackSelRef.current;
    if (!sel?.selectedOptions?.length) return;
    const indices = new Set(Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value)));
    setStackSelected((prev) => prev.filter((_, i) => !indices.has(i)));
  };
  const clearStacks = () => setStackSelected([]);

  const add247 = () => {
    const sel = avail247Ref.current;
    if (!sel?.selectedOptions?.length) return;
    const mult = stats247Multiplier;
    const toAdd = Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value));
    setStats247Selected((prev) => {
      const next = [...prev];
      for (const code of toAdd) {
        if (!Number.isFinite(code)) continue;
        const ex = next.find((x) => x.code === code);
        if (ex) ex.count += mult;
        else next.push({ code, count: mult });
      }
      return next;
    });
  };
  const remove247 = () => {
    const sel = sel247Ref.current;
    if (!sel?.selectedOptions?.length) return;
    const indices = new Set(Array.from(sel.selectedOptions).map((o) => Number((o as HTMLOptionElement).value)));
    setStats247Selected((prev) => prev.filter((_, i) => !indices.has(i)));
  };
  const clear247 = () => setStats247Selected([]);

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading enhancement data…" : "Enhancement builder data not available."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build an enhancement: manufacturer, rarity, level, perks (checkboxes), stacking perks from other manufacturers, and Builder 247 stats.
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
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => copyToClipboard(rawOutput)} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm">Copy</button>
              <button type="button" onClick={handleEncodeFromRaw} disabled={loading !== null} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm disabled:opacity-50">Encode</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Base85</label>
            <textarea
              value={b85Output}
              onChange={(e) => handleB85Change(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
            <div className="flex flex-wrap gap-2 mt-1 items-center">
              <button type="button" onClick={() => copyToClipboard(b85Output)} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm">Copy</button>
              <button type="button" onClick={handleDecodeFromB85} disabled={loading !== null} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm disabled:opacity-50">Decode</button>
              <select
                value={flagValue}
                onChange={(e) => setFlagValue(Number(e.target.value))}
                className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              >
                {FLAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button type="button" onClick={handleAddToBackpack} disabled={loading !== null || !saveData} className="px-2 py-1 rounded bg-[var(--color-accent)] text-black text-sm font-medium disabled:opacity-50">Add to backpack</button>
              {!saveData && (
                <Link to="/character/select-save" className="text-sm text-[var(--color-accent)] hover:underline">
                  Load a save first
                </Link>
              )}
            </div>
          </div>
        </div>
        {message && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>}
      </section>

      {/* Manufacturer, Rarity, Level */}
      <section className="flex flex-wrap gap-4">
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Manufacturer</label>
          <select
            value={mfgName}
            onChange={(e) => setMfgName(e.target.value)}
            className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-w-[140px]"
          >
            {Object.keys(builderData.manufacturers).sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Rarity</label>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-w-[120px]"
          >
            {rarities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Level</label>
          <input
            type="text"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-16 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          />
        </div>
      </section>

      {/* Perks (checkboxes) */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Perks</h3>
        <div className="flex flex-wrap gap-4">
          {perkVars.map((index) => {
            const perk = mfg?.perks.find((p) => p.index === index);
            if (!perk) return null;
            return (
              <label key={index} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={perkChecked.has(index)}
                  onChange={() => togglePerk(index)}
                />
                {perk.name}
              </label>
            );
          })}
        </div>
      </section>

      {/* Stacking */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Stacking</h3>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">Selected Stacks — add perks from other manufacturers.</p>
        <input
          type="text"
          placeholder="Filter..."
          value={stackFilter}
          onChange={(e) => setStackFilter(e.target.value)}
          className="w-full max-w-xs mb-2 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
        />
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Available</label>
            <select
              ref={stackAvailRef}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            >
              {stackAvailable.map((e, i) => (
                <option key={`${e.mfgCode}-${e.index}-${i}`} value={i}>
                  [{e.index}] {e.name} — {e.mfgName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 pt-6">
            <input
              type="number"
              min={1}
              max={999}
              value={stackMultiplier}
              onChange={(e) => setStackMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-14 px-1 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center"
            />
            <button type="button" onClick={addStacks} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">»</button>
            <button type="button" onClick={removeStacks} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">«</button>
            <button type="button" onClick={clearStacks} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">Clear</button>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Selected</label>
            <select
              ref={stackSelRef}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            >
              {stackSelected.map((e, i) => (
                <option key={`${e.mfgCode}-${e.index}-${i}`} value={i}>
                  ({e.count}) [{e.index}] {e.name} — {e.mfgName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Builder 247 */}
      <section className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-2">Builder 247</h3>
        <input
          type="text"
          placeholder="Filter..."
          value={filter247}
          onChange={(e) => setFilter247(e.target.value)}
          className="w-full max-w-xs mb-2 px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
        />
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Available</label>
            <select
              ref={avail247Ref}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            >
              {avail247Filtered.map((s) => (
                <option key={s.code} value={s.code}>[{s.code}] {s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 pt-6">
            <input
              type="number"
              min={1}
              max={999}
              value={stats247Multiplier}
              onChange={(e) => setStats247Multiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-14 px-1 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center"
            />
            <button type="button" onClick={add247} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">»</button>
            <button type="button" onClick={remove247} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">«</button>
            <button type="button" onClick={clear247} className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-[var(--color-text)]">Clear</button>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Selected</label>
            <select
              ref={sel247Ref}
              multiple
              size={10}
              className="w-full px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            >
              {stats247Selected.map((e, i) => {
                const s = builderData.secondary247.find((x) => x.code === e.code);
                return (
                  <option key={`${e.code}-${i}`} value={i}>
                    ({e.count}) [{e.code}] {s?.name ?? e.code}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
