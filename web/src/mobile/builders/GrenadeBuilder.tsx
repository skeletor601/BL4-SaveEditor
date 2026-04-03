import { useState, useMemo, useCallback } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { showToast } from "../components/Toast";
import type { PickerOption } from "../components/MobilePicker";

// ── Types (mirrors API shape) ─────────────────────────────────────────────────

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

// ── Part selection state ──────────────────────────────────────────────────────

interface SelectedPart {
  id: string; // "partId" or "mfgId:partId"
  label: string;
  qty: number;
}

const GRENADE_TYPE_ID = 245;

// ── Helpers ───────────────────────────────────────────────────────────────────

function partIdFromLabel(label: string): string | null {
  const m = label.match(/^(\d+)/);
  return m ? m[1] : null;
}

function buildDecodedString(
  mfgId: number,
  level: number,
  seed: number,
  rarity: string,
  legendaries: SelectedPart[],
  elements: SelectedPart[],
  firmware: SelectedPart[],
  mfgPerks: SelectedPart[],
  universalPerks: SelectedPart[],
  skinValue: string,
  data: GrenadeBuilderData,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];

  // Rarity
  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const rarityEntry = rarities.find((r) => r.label === rarity);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  // Legendaries (may be cross-mfg)
  const otherMfg: Record<number, number[]> = {};
  for (const leg of legendaries) {
    if (leg.id.includes(":")) {
      const [m, p] = leg.id.split(":");
      const legMfg = parseInt(m, 10);
      const legPart = parseInt(p, 10);
      if (!Number.isFinite(legMfg) || !Number.isFinite(legPart)) continue;
      if (legMfg === mfgId) {
        for (let i = 0; i < leg.qty; i++) parts.push(`{${legPart}}`);
      } else {
        if (!otherMfg[legMfg]) otherMfg[legMfg] = [];
        for (let i = 0; i < leg.qty; i++) otherMfg[legMfg].push(legPart);
      }
    }
  }
  for (const [m, ids] of Object.entries(otherMfg)) {
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.length === 1) parts.push(`{${m}:${sorted[0]}}`);
    else parts.push(`{${m}:[${sorted.join(" ")}]}`);
  }

  // Mfg Perks
  for (const p of mfgPerks) {
    const pid = partIdFromLabel(p.id);
    if (!pid) continue;
    for (let i = 0; i < p.qty; i++) parts.push(`{${pid}}`);
  }

  // Type 245 grouped: Element + Firmware + Universal Perks
  const secondary245: number[] = [];
  const addTo245 = (id: string, qty: number) => {
    const pid = parseInt(id, 10);
    if (!Number.isFinite(pid)) return;
    for (let i = 0; i < qty; i++) secondary245.push(pid);
  };
  for (const e of elements) addTo245(e.id, e.qty);
  for (const f of firmware) addTo245(f.id, f.qty);
  for (const u of universalPerks) addTo245(u.id, u.qty);

  if (secondary245.length === 1) {
    parts.push(`{${GRENADE_TYPE_ID}:${secondary245[0]}}`);
  } else if (secondary245.length > 1) {
    const sorted = [...secondary245].sort((a, b) => a - b);
    parts.push(`{${GRENADE_TYPE_ID}:[${sorted.join(" ")}]}`);
  }

  let decoded = `${header} ${parts.join(" ")} |`;
  if (skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decoded = decoded.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decoded;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GrenadeBuilder() {
  const { data, loading, error } = useMobileBuilderData<GrenadeBuilderData>("accessories/grenade/builder-data");

  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [levelText, setLevelText] = useState("50");
  const [seed, setSeed] = useState(1);
  const [seedText, setSeedText] = useState("1");
  const [rarity, setRarity] = useState("");
  const [selectedLegendaries, setSelectedLegendaries] = useState<SelectedPart[]>([]);
  const [selectedElements, setSelectedElements] = useState<SelectedPart[]>([]);
  const [selectedFirmware, setSelectedFirmware] = useState<SelectedPart[]>([]);
  const [selectedMfgPerks, setSelectedMfgPerks] = useState<SelectedPart[]>([]);
  const [selectedUniversalPerks, setSelectedUniversalPerks] = useState<SelectedPart[]>([]);
  const [skinValue, setSkinValue] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  // Auto-select first mfg
  if (data && mfgId == null && data.mfgs.length > 0) {
    setMfgId(data.mfgs[0].id);
  }

  // ── Picker options ────────────────────────────────────────────────────────

  const mfgOptions = useMemo<PickerOption[]>(() => {
    if (!data) return [];
    return data.mfgs.map((m) => ({ value: String(m.id), label: m.name }));
  }, [data]);

  const rarityOptions = useMemo<PickerOption[]>(() => {
    if (!data || mfgId == null) return [];
    return (data.raritiesByMfg[mfgId] ?? []).map((r) => ({ value: r.label, label: r.label }));
  }, [data, mfgId]);

  const elementOptions = useMemo<PickerOption[]>(() => {
    if (!data) return [];
    return data.element.map((e) => ({ value: String(e.partId), label: `${e.partId} - ${e.stat}` }));
  }, [data]);

  const firmwareOptions = useMemo<PickerOption[]>(() => {
    if (!data) return [];
    return data.firmware.map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.stat}` }));
  }, [data]);

  const legendaryOptions = useMemo<PickerOption[]>(() => {
    if (!data) return [];
    return data.legendaryPerks.map((l) => ({
      value: `${l.mfgId}:${l.partId}`,
      label: `${l.mfgName}: ${l.stat}`,
    }));
  }, [data]);

  const mfgPerkOptions = useMemo<PickerOption[]>(() => {
    if (!data || mfgId == null) return [];
    return (data.mfgPerks[mfgId] ?? []).map((p) => ({
      value: String(p.partId),
      label: `${p.partId} - ${p.stat}`,
    }));
  }, [data, mfgId]);

  const universalPerkOptions = useMemo<PickerOption[]>(() => {
    if (!data) return [];
    return data.universalPerks.map((p) => ({
      value: String(p.partId),
      label: `${p.partId} - ${p.stat}`,
    }));
  }, [data]);

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const togglePart = useCallback((_list: SelectedPart[], setList: React.Dispatch<React.SetStateAction<SelectedPart[]>>, id: string, label: string) => {
    setList((prev) => {
      const exists = prev.find((p) => p.id === id);
      if (exists) return prev.filter((p) => p.id !== id);
      return [...prev, { id, label, qty: 1 }];
    });
  }, []);

  const setPartQty = useCallback((setList: React.Dispatch<React.SetStateAction<SelectedPart[]>>, id: string, qty: number) => {
    setList((prev) => prev.map((p) => p.id === id ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p));
  }, []);

  // ── Generate code ─────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!data || mfgId == null) return;
    const code = buildDecodedString(
      mfgId, level, seed, rarity,
      selectedLegendaries, selectedElements, selectedFirmware,
      selectedMfgPerks, selectedUniversalPerks, skinValue, data,
    );
    setGeneratedCode(code);
  }, [data, mfgId, level, seed, rarity, selectedLegendaries, selectedElements, selectedFirmware, selectedMfgPerks, selectedUniversalPerks, skinValue]);

  const handleCopy = useCallback(() => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"));
  }, [generatedCode]);

  const handleClear = useCallback(() => {
    setRarity("");
    setSelectedLegendaries([]);
    setSelectedElements([]);
    setSelectedFirmware([]);
    setSelectedMfgPerks([]);
    setSelectedUniversalPerks([]);
    setSkinValue("");
    setGeneratedCode("");
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading grenade data…</div>;
  if (error) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      {/* Manufacturer */}
      <MobileSelect
        label="Manufacturer"
        required
        options={mfgOptions}
        value={mfgId != null ? String(mfgId) : ""}
        onChange={(v) => { setMfgId(Number(v)); setRarity(""); setSelectedMfgPerks([]); }}
      />

      {/* Level + Seed */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="mobile-label">Level</div>
          <input
            type="number"
            className="mobile-input"
            value={levelText}
            min={1}
            max={100}
            onChange={(e) => setLevelText(e.target.value)}
            onBlur={() => { const n = Math.max(1, Math.min(100, Number(levelText) || 1)); setLevel(n); setLevelText(String(n)); }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div className="mobile-label">Seed</div>
          <input
            type="number"
            className="mobile-input"
            value={seedText}
            min={1}
            max={4096}
            onChange={(e) => setSeedText(e.target.value)}
            onBlur={() => { const n = Math.max(1, Math.min(4096, Number(seedText) || 1)); setSeed(n); setSeedText(String(n)); }}
          />
        </div>
      </div>

      {/* Rarity */}
      <MobileSelect
        label="Rarity"
        required
        options={rarityOptions}
        value={rarity}
        onChange={setRarity}
        placeholder="Select rarity…"
      />

      {/* Element */}
      <PartChecklist
        label="Element"
        options={elementOptions}
        selected={selectedElements}
        onToggle={(id, label) => togglePart(selectedElements, setSelectedElements, id, label)}
        onQtyChange={(id, qty) => setPartQty(setSelectedElements, id, qty)}
      />

      {/* Firmware */}
      <PartChecklist
        label="Firmware"
        options={firmwareOptions}
        selected={selectedFirmware}
        onToggle={(id, label) => togglePart(selectedFirmware, setSelectedFirmware, id, label)}
        onQtyChange={(id, qty) => setPartQty(setSelectedFirmware, id, qty)}
      />

      {/* Legendary Perks */}
      <PartChecklist
        label="Legendary Perks"
        options={legendaryOptions}
        selected={selectedLegendaries}
        onToggle={(id, label) => togglePart(selectedLegendaries, setSelectedLegendaries, id, label)}
        onQtyChange={(id, qty) => setPartQty(setSelectedLegendaries, id, qty)}
      />

      {/* Mfg Perks */}
      {mfgPerkOptions.length > 0 && (
        <PartChecklist
          label="Manufacturer Perks"
          options={mfgPerkOptions}
          selected={selectedMfgPerks}
          onToggle={(id, label) => togglePart(selectedMfgPerks, setSelectedMfgPerks, id, label)}
          onQtyChange={(id, qty) => setPartQty(setSelectedMfgPerks, id, qty)}
        />
      )}

      {/* Universal Perks */}
      <PartChecklist
        label="Universal Perks"
        options={universalPerkOptions}
        selected={selectedUniversalPerks}
        onToggle={(id, label) => togglePart(selectedUniversalPerks, setSelectedUniversalPerks, id, label)}
        onQtyChange={(id, qty) => setPartQty(setSelectedUniversalPerks, id, qty)}
      />

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button type="button" className="mobile-btn primary" onClick={handleGenerate} style={{ flex: 2 }}>
          Generate Code
        </button>
        <button type="button" className="mobile-btn danger" onClick={handleClear} style={{ flex: 1 }}>
          Clear
        </button>
      </div>

      {/* Output */}
      {generatedCode && (
        <div className="mobile-card">
          <div className="mobile-label">Generated Code</div>
          <textarea
            className="mobile-textarea"
            value={generatedCode}
            readOnly
            rows={4}
            style={{ marginBottom: 10 }}
          />
          <button type="button" className="mobile-btn" onClick={handleCopy}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

// ── Part Checklist sub-component ──────────────────────────────────────────────

function PartChecklist({
  label,
  options,
  selected,
  onToggle,
  onQtyChange,
}: {
  label: string;
  options: PickerOption[];
  selected: SelectedPart[];
  onToggle: (id: string, label: string) => void;
  onQtyChange: (id: string, qty: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedIds = new Set(selected.map((s) => s.id));

  return (
    <div className="mobile-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "none",
          border: "none",
          color: "var(--color-accent)",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
          touchAction: "manipulation",
          minHeight: 44,
        }}
      >
        <span>
          {label}
          {selected.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 10, background: "var(--color-accent-dim)", padding: "2px 8px", borderRadius: 10, color: "var(--color-accent)" }}>
              {selected.length}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {options.map((opt) => {
            const isSelected = selectedIds.has(opt.value);
            const sel = selected.find((s) => s.id === opt.value);
            return (
              <div key={opt.value} className="mobile-check-row">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(opt.value, opt.label)}
                />
                <span className="part-name">{opt.label}</span>
                {isSelected && (
                  <input
                    type="number"
                    className="qty-input"
                    value={sel?.qty ?? 1}
                    min={1}
                    max={99}
                    onChange={(e) => onQtyChange(opt.value, Number(e.target.value) || 1)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
