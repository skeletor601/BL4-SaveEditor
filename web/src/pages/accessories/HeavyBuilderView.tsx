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

interface HeavyBuilderPart {
  partId: number;
  stat: string;
  mfgId?: number;
  description?: string;
}

interface HeavyBuilderRarity {
  id: number;
  label: string;
}

interface HeavyBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, HeavyBuilderRarity[]>;
  barrel: HeavyBuilderPart[];
  element: HeavyBuilderPart[];
  firmware: HeavyBuilderPart[];
  barrelAccPerks: HeavyBuilderPart[];
  bodyAccPerks: HeavyBuilderPart[];
  bodiesByMfg: Record<number, number | null>;
}

type AccEntry = { partId: number; count: number };

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function HeavyBuilderView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [builderData, setBuilderData] = useState<HeavyBuilderData | null>(null);
  const [mfgId, setMfgId] = useState<number>(282);
  const [level, setLevel] = useState("50");
  const [rarityId, setRarityId] = useState<number | null>(null);
  const [barrelPartId, setBarrelPartId] = useState<number | null>(null);
  const [elementPartId, setElementPartId] = useState<number | null>(null);
  const [firmwarePartId, setFirmwarePartId] = useState<number | null>(null);
  const [barrelAccSelected, setBarrelAccSelected] = useState<AccEntry[]>([]);
  const [bodyAccSelected, setBodyAccSelected] = useState<AccEntry[]>([]);
  const [barrelAccMultiplier, setBarrelAccMultiplier] = useState(1);
  const [bodyAccMultiplier, setBodyAccMultiplier] = useState(1);
  const [rawOutput, setRawOutput] = useState("");
  const [b85Output, setB85Output] = useState("");
  const [manualOutputMode, setManualOutputMode] = useState(false);
  const [flagValue, setFlagValue] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<"data" | "encode" | "add" | null>(null);
  const barrelAccAvailableRef = useRef<HTMLSelectElement>(null);
  const bodyAccAvailableRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading("data");
    fetchApi("accessories/heavy/builder-data")
      .then((r) => r.json())
      .then((data: HeavyBuilderData) => {
        if (!cancelled) {
          setBuilderData(data);
          setRarityId(null);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load heavy weapon builder data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rarities = builderData?.raritiesByMfg[mfgId] ?? [];
  const barrelOptions = builderData?.barrel.filter((p) => p.mfgId === mfgId) ?? [];
  const barrelAccOptions = builderData?.barrelAccPerks.filter((p) => p.mfgId === mfgId) ?? [];
  const bodyAccOptions = builderData?.bodyAccPerks.filter((p) => p.mfgId === mfgId) ?? [];

  const rebuildOutput = useCallback(async () => {
    if (manualOutputMode || !builderData) return;
    const typeId = Math.floor(Math.random() * (9999 - 100 + 1)) + 100;
    const mainParts = [`${mfgId}, 0, 1, ${level}| 2, ${typeId}||`];
    const skillParts: string[] = [];

    if (rarityId != null) skillParts.push(`{${rarityId}}`);

    const bodyId = builderData.bodiesByMfg[mfgId];
    if (bodyId != null) {
      skillParts.push(`{${bodyId}}`);
    }

    if (barrelPartId != null) skillParts.push(`{${barrelPartId}}`);
    // Desktop uses prefixed tokens for main-table parts:
    // element -> {1:<id>}, firmware -> {244:<id>}
    if (elementPartId != null) skillParts.push(`{1:${elementPartId}}`);
    if (firmwarePartId != null) skillParts.push(`{244:${firmwarePartId}}`);

    const addAccParts = (entries: AccEntry[]) => {
      for (const { partId, count } of entries) {
        for (let i = 0; i < count; i += 1) {
          skillParts.push(`{${partId}}`);
        }
      }
    };

    addAccParts(barrelAccSelected);
    addAccParts(bodyAccSelected);

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
    barrelPartId,
    elementPartId,
    firmwarePartId,
    barrelAccSelected,
    bodyAccSelected,
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
        setMessage("Heavy weapon added to backpack. Use Download .sav on Select Save to export.");
      } else {
        setMessage(data?.error ?? "Add failed");
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setLoading(null);
    }
  }, [b85Output, saveData, flagValue, getYamlText, updateSaveData]);

  const addFromSelect = (ref: React.RefObject<HTMLSelectElement>, mult: number, list: AccEntry[]): AccEntry[] => {
    const sel = ref.current;
    if (!sel?.selectedOptions?.length) return list;
    const next = [...list];
    for (let i = 0; i < sel.selectedOptions.length; i += 1) {
      const partId = Number((sel.selectedOptions[i] as HTMLOptionElement).value);
      if (!Number.isFinite(partId)) continue;
      const existing = next.find((s) => s.partId === partId);
      if (existing) existing.count += mult;
      else next.push({ partId, count: mult });
    }
    return next;
  };

  const moveBarrelAccSelected = () => {
    setBarrelAccSelected((prev) => addFromSelect(barrelAccAvailableRef, barrelAccMultiplier, prev));
  };
  const moveBodyAccSelected = () => {
    setBodyAccSelected((prev) => addFromSelect(bodyAccAvailableRef, bodyAccMultiplier, prev));
  };

  const clearBarrelAcc = () => setBarrelAccSelected([]);
  const clearBodyAcc = () => setBodyAccSelected([]);

  if (loading === "data" || !builderData) {
    return (
      <div className="text-[var(--color-text-muted)]">
        {loading === "data" ? "Loading heavy weapon data…" : "Heavy builder data not available."}
      </div>
    );
  }

  const withStat = (entries: AccEntry[], src: HeavyBuilderPart[]) =>
    entries.map((s) => {
      const p = src.find((u) => u.partId === s.partId);
      return { ...s, stat: p?.stat ?? `Part ${s.partId}` };
    });

  const barrelAccWithStat = withStat(barrelAccSelected, builderData.barrelAccPerks);
  const bodyAccWithStat = withStat(bodyAccSelected, builderData.bodyAccPerks);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a heavy weapon from manufacturer, level, rarity, and perks. Output syncs to Base85 for adding to backpack.
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

        <div className="grid gap-6 md:grid-cols-3">
          {/* Barrel */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Barrel</h4>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="heavy-barrel"
                  checked={barrelPartId === null}
                  onChange={() => setBarrelPartId(null)}
                />
                None
              </label>
              {barrelOptions.map((p) => (
                <label key={p.partId} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="heavy-barrel"
                    checked={barrelPartId === p.partId}
                    onChange={() => setBarrelPartId(p.partId)}
                  />
                  {p.stat}{p.description ? ` - ${p.description}` : ""}
                </label>
              ))}
            </div>
          </div>

          {/* Element */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Element</h4>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="heavy-element"
                  checked={elementPartId === null}
                  onChange={() => setElementPartId(null)}
                />
                None
              </label>
              {builderData.element.map((p) => (
                <label key={p.partId} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="heavy-element"
                    checked={elementPartId === p.partId}
                    onChange={() => setElementPartId(p.partId)}
                  />
                  {p.stat}{p.description ? ` - ${p.description}` : ""}
                </label>
              ))}
            </div>
          </div>

          {/* Firmware */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Firmware</h4>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="heavy-firmware"
                  checked={firmwarePartId === null}
                  onChange={() => setFirmwarePartId(null)}
                />
                None
              </label>
              {builderData.firmware.map((p) => (
                <label key={p.partId} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="heavy-firmware"
                    checked={firmwarePartId === p.partId}
                    onChange={() => setFirmwarePartId(p.partId)}
                  />
                  {p.stat}{p.description ? ` - ${p.description}` : ""}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Barrel / Body accessories */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Barrel accessories */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Barrel accessories</h4>
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-[var(--color-text-muted)]">Available</label>
                <select
                  ref={barrelAccAvailableRef}
                  multiple
                  size={8}
                  className="w-full mt-1 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                >
                  {barrelAccOptions.map((p) => (
                    <option key={p.partId} value={p.partId}>
                      {p.stat}{p.description ? ` - ${p.description}` : ""}
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
                  value={barrelAccMultiplier}
                  onChange={(e) =>
                    setBarrelAccMultiplier(Math.max(1, Math.min(999, Number(e.target.value) || 1)))
                  }
                  className="w-14 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                />
                <button
                  type="button"
                  onClick={moveBarrelAccSelected}
                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                >
                  »
                </button>
                <button
                  type="button"
                  onClick={clearBarrelAcc}
                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                >
                  Clear
                </button>
              </div>
            </div>
            <ul className="mt-2 border border-[var(--color-panel-border)] rounded px-2 py-1 bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] min-h-[120px] max-h-40 overflow-y-auto">
              {barrelAccWithStat.map((s) => (
                <li key={s.partId}>
                  {s.count > 1 ? `(${s.count}) ` : ""}{s.stat}
                </li>
              ))}
            </ul>
          </div>

          {/* Body accessories */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Body accessories</h4>
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-[var(--color-text-muted)]">Available</label>
                <select
                  ref={bodyAccAvailableRef}
                  multiple
                  size={8}
                  className="w-full mt-1 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                >
                  {bodyAccOptions.map((p) => (
                    <option key={p.partId} value={p.partId}>
                      {p.stat}{p.description ? ` - ${p.description}` : ""}
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
                  value={bodyAccMultiplier}
                  onChange={(e) =>
                    setBodyAccMultiplier(Math.max(1, Math.min(999, Number(e.target.value) || 1)))
                  }
                  className="w-14 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                />
                <button
                  type="button"
                  onClick={moveBodyAccSelected}
                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                >
                  »
                </button>
                <button
                  type="button"
                  onClick={clearBodyAcc}
                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
                >
                  Clear
                </button>
              </div>
            </div>
            <ul className="mt-2 border border-[var(--color-panel-border)] rounded px-2 py-1 bg-[rgba(24,28,34,0.9)] text-sm text-[var(--color-text)] min-h-[120px] max-h-40 overflow-y-auto">
              {bodyAccWithStat.map((s) => (
                <li key={s.partId}>
                  {s.count > 1 ? `(${s.count}) ` : ""}{s.stat}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
    </div>
  );
}

