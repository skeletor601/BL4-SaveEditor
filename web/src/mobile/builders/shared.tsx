/**
 * Shared mobile builder components and utilities.
 * Reused across all 7 builders to keep them DRY.
 */
import { useState, useCallback, useEffect } from "react";
import { fetchApi } from "@/lib/apiClient";
import { getSkinImageUrl } from "@/lib/skinImage";
import { showToast } from "../components/Toast";
import type { PickerOption } from "../components/MobilePicker";

// ── Selected part state ───────────────────────────────────────────────────────

export interface SelectedPart {
  id: string;
  label: string;
  qty: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePartList() {
  const [parts, setParts] = useState<SelectedPart[]>([]);

  const toggle = useCallback((id: string, label: string) => {
    setParts((prev) => {
      if (prev.some((p) => p.id === id)) return prev.filter((p) => p.id !== id);
      return [...prev, { id, label, qty: 1 }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setParts((prev) => prev.map((p) => p.id === id ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p));
  }, []);

  const clear = useCallback(() => setParts([]), []);

  return { parts, toggle, setQty, clear, setParts };
}

// ── Number input that allows empty while typing ──────────────────────────────

export function NumberField({ label, value, onChange, min, max }: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const [text, setText] = useState(String(value));

  return (
    <div style={{ flex: 1 }}>
      <div className="mobile-label">{label}</div>
      <input
        type="number"
        className="mobile-input"
        value={text}
        min={min}
        max={max}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Math.max(min, Math.min(max, Number(text) || min));
          onChange(n);
          setText(String(n));
        }}
      />
    </div>
  );
}

// ── Builder toggles bar (Show Info + All Parts) ──────────────────────────────

export function BuilderToggles({ showInfo, setShowInfo, allParts, setAllParts }: {
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  allParts: boolean;
  setAllParts: (v: boolean) => void;
}) {
  const pill = (active: boolean) => ({
    padding: "6px 14px",
    borderRadius: 20,
    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-panel-border)"}`,
    background: active ? "var(--color-accent-dim)" : "transparent",
    color: active ? "var(--color-accent)" : "var(--color-text-muted)",
    fontSize: 12,
    fontWeight: 700 as const,
    cursor: "pointer",
    touchAction: "manipulation" as const,
    WebkitTapHighlightColor: "transparent",
    minHeight: 36,
  });

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <button type="button" style={pill(showInfo)} onClick={() => setShowInfo(!showInfo)}>
        {showInfo ? "✓ " : ""}Show Info
      </button>
      <button type="button" style={pill(allParts)} onClick={() => setAllParts(!allParts)}>
        {allParts ? "✓ " : ""}All Parts
      </button>
    </div>
  );
}

// ── Part checklist (collapsible multi-select with qty) ────────────────────────

export function PartChecklist({
  label,
  options,
  selected,
  onToggle,
  onQtyChange,
  showInfo,
}: {
  label: string;
  options: PickerOption[];
  selected: SelectedPart[];
  onToggle: (id: string, label: string) => void;
  onQtyChange: (id: string, qty: number) => void;
  showInfo?: boolean;
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
          WebkitTapHighlightColor: "transparent",
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
            // Parse label: "42 - +Damage, some description"
            const stripped = opt.label.replace(/^\d+\s*[-–]\s*/, "").trim() || opt.label;
            const dashIdx = stripped.indexOf(" - ");
            const mainText = dashIdx > 0 ? stripped.substring(0, dashIdx) : stripped;
            const descText = dashIdx > 0 ? stripped.substring(dashIdx + 3) : "";

            return (
              <div key={opt.value} className="mobile-check-row" style={{ flexWrap: showInfo ? "wrap" : undefined }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(opt.value, opt.label)}
                />
                <span className="part-name">
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", marginRight: 6, opacity: 0.7 }}>
                    {opt.value.includes(":") ? opt.value : opt.value.match(/^\d+/) ? opt.value.match(/^\d+/)![0] : ""}
                  </span>
                  {mainText}
                </span>
                {isSelected && <QtyInput value={sel?.qty ?? 1} onChange={(n) => onQtyChange(opt.value, n)} />}
                {showInfo && descText && (
                  <div style={{ width: "100%", paddingLeft: 32, fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.3, marginTop: 2 }}>
                    {descText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Qty input (allows empty while typing) ─────────────────────────────────────

function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <input
      type="number"
      className="qty-input"
      value={text}
      min={1}
      max={99}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Math.max(1, Math.min(99, Number(text) || 1));
        onChange(n);
        setText(String(n));
      }}
    />
  );
}

// ── Skin selector with preview ────────────────────────────────────────────────

export function SkinSelector({ skins, value, onChange }: {
  skins: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = getSkinImageUrl(value || null);

  useEffect(() => { setImgError(false); }, [value]);

  const opts: PickerOption[] = [{ value: "", label: "-- No Skin --" }, ...skins.map((s) => ({ value: s.value, label: s.label }))];
  const selectedLabel = skins.find((s) => s.value === value)?.label ?? "";

  return (
    <div className="mobile-field">
      <div className="mobile-label">Skin</div>
      {/* Preview */}
      {value && imageUrl && !imgError && (
        <div style={{ marginBottom: 8, borderRadius: 10, overflow: "hidden", border: "1px solid var(--color-panel-border)", background: "rgba(0,0,0,0.3)" }}>
          <img
            src={imageUrl}
            alt={selectedLabel}
            style={{ width: "100%", height: "auto", display: "block", maxHeight: 160, objectFit: "contain" }}
            onError={() => setImgError(true)}
          />
          <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--color-text-muted)", textAlign: "center" }}>{selectedLabel}</div>
        </div>
      )}
      {/* Picker button using MobileSelect pattern inline */}
      <SkinPickerButton opts={opts} value={value} onChange={onChange} />
    </div>
  );
}

function SkinPickerButton({ opts, value, onChange }: { opts: PickerOption[]; value: string; onChange: (v: string) => void }) {
  // Reuse MobileSelect inline to avoid circular import
  const [open, setOpen] = useState(false);
  const selectedLabel = opts.find((o) => o.value === value)?.label ?? "-- No Skin --";

  return (
    <>
      <button type="button" className="mobile-select-btn" onClick={() => setOpen(true)}>
        <span style={{ opacity: value ? 1 : 0.5 }}>{selectedLabel}</span>
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="mobile-picker-overlay" onClick={() => setOpen(false)}>
          <div className="mobile-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-picker-header">
              <h3>Select Skin</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 14, padding: 8, cursor: "pointer" }}>Done</button>
            </div>
            <div className="mobile-picker-list">
              {opts.map((opt) => (
                <button key={opt.value} type="button" className={`mobile-picker-item ${opt.value === value ? "selected" : ""}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
                  <span className="mobile-picker-radio" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Code output panel with Base85 encode/decode ──────────────────────────────

export function CodeOutput({ code, onClear }: { code: string; onClear: () => void }) {
  const [base85, setBase85] = useState("");
  const [encoding, setEncoding] = useState(false);

  // Auto-encode to Base85 when code changes
  useEffect(() => {
    if (!code) { setBase85(""); return; }
    let cancelled = false;
    setEncoding(true);
    fetchApi("save/encode-serial", {
      method: "POST",
      body: JSON.stringify({ decoded_string: code.split(/\r?\n/)[0]?.trim() ?? "" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success && typeof d?.serial === "string") setBase85(d.serial);
        else setBase85("");
        setEncoding(false);
      })
      .catch(() => { if (!cancelled) { setBase85(""); setEncoding(false); } });
    return () => { cancelled = true; };
  }, [code]);

  if (!code) return null;

  const copyDecoded = () => {
    navigator.clipboard.writeText(code).then(() => showToast("Decoded copied!")).catch(() => showToast("Copy failed"));
  };
  const copyBase85 = () => {
    if (!base85) return;
    navigator.clipboard.writeText(base85).then(() => showToast("Base85 copied!")).catch(() => showToast("Copy failed"));
  };

  return (
    <div className="mobile-card">
      {/* Decoded */}
      <div className="mobile-label">Decoded String</div>
      <textarea className="mobile-textarea" value={code} readOnly rows={3} style={{ marginBottom: 8 }} />
      <button type="button" className="mobile-btn" onClick={copyDecoded} style={{ marginBottom: 14 }}>
        Copy Decoded
      </button>

      {/* Base85 */}
      <div className="mobile-label">
        Serialized Base85
        {encoding && <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 400 }}>Encoding…</span>}
      </div>
      <textarea
        className="mobile-textarea"
        value={base85}
        readOnly
        rows={2}
        style={{ marginBottom: 8 }}
        placeholder={encoding ? "Encoding…" : "Generate a code first"}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="mobile-btn" onClick={copyBase85} style={{ flex: 2 }} disabled={!base85}>
          Copy Base85
        </button>
        <button type="button" className="mobile-btn danger" onClick={onClear} style={{ flex: 1 }}>
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Decode Box (paste Base85, get decoded) ────────────────────────────────────

export function DecodeBox() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDecode = useCallback(async () => {
    const serial = input.trim();
    if (!serial) return;
    setLoading(true);
    try {
      const res = await fetchApi("save/decode-serial", {
        method: "POST",
        body: JSON.stringify({ serial }),
      });
      const d = await res.json();
      if (d?.success && typeof d?.decoded === "string") setDecoded(d.decoded);
      else setDecoded("Decode failed");
    } catch {
      setDecoded("Decode error");
    }
    setLoading(false);
  }, [input]);

  return (
    <div className="mobile-card">
      <div className="mobile-label">Paste Base85 to Decode</div>
      <textarea
        className="mobile-textarea"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        placeholder="@U..."
        style={{ marginBottom: 8 }}
      />
      <button type="button" className="mobile-btn" onClick={handleDecode} disabled={loading} style={{ marginBottom: 8 }}>
        {loading ? "Decoding…" : "Decode"}
      </button>
      {decoded && (
        <>
          <div className="mobile-label">Decoded Result</div>
          <textarea className="mobile-textarea" value={decoded} readOnly rows={3} style={{ marginBottom: 8 }} />
          <button type="button" className="mobile-btn" onClick={() => {
            navigator.clipboard.writeText(decoded).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"));
          }}>
            Copy Decoded
          </button>
        </>
      )}
    </div>
  );
}

// ── Action bar ────────────────────────────────────────────────────────────────

export function GenerateBar({ onGenerate, onClear }: { onGenerate: () => void; onClear: () => void }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
      <button type="button" className="mobile-btn primary" onClick={onGenerate} style={{ flex: 2 }}>
        Generate Code
      </button>
      <button type="button" className="mobile-btn danger" onClick={onClear} style={{ flex: 1 }}>
        Clear All
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function partIdFromLabel(label: string): string | null {
  const m = label.match(/^(\d+)/);
  return m ? m[1] : null;
}

export function buildTypeToken(typeId: number, ids: number[]): string | null {
  if (ids.length === 0) return null;
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length === 1) return `{${typeId}:${sorted[0]}}`;
  return `{${typeId}:[${sorted.join(" ")}]}`;
}

export function buildLegendaryTokens(
  legendaries: SelectedPart[],
  mfgId: number,
  parts: string[],
) {
  const otherMfg: Record<number, number[]> = {};
  for (const leg of legendaries) {
    if (!leg.id.includes(":")) continue;
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
  for (const [m, ids] of Object.entries(otherMfg)) {
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.length === 1) parts.push(`{${m}:${sorted[0]}}`);
    else parts.push(`{${m}:[${sorted.join(" ")}]}`);
  }
}

export function applySkin(decoded: string, skinValue: string): string {
  if (!skinValue.trim()) return decoded;
  const safe = skinValue.trim().replace(/"/g, '\\"');
  return decoded.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
}
