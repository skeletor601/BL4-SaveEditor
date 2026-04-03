/**
 * Shared mobile builder components and utilities.
 * Reused across all 7 builders to keep them DRY.
 */
import { useState, useCallback } from "react";
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

  // Sync if parent changes value externally
  const displayed = text === "" ? "" : text;

  return (
    <div style={{ flex: 1 }}>
      <div className="mobile-label">{label}</div>
      <input
        type="number"
        className="mobile-input"
        value={displayed}
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

// ── Part checklist (collapsible multi-select with qty) ────────────────────────

export function PartChecklist({
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
            return (
              <div key={opt.value} className="mobile-check-row">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(opt.value, opt.label)}
                />
                <span className="part-name">{opt.label}</span>
                {isSelected && (
                  <QtyInput value={sel?.qty ?? 1} onChange={(n) => onQtyChange(opt.value, n)} />
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

// ── Code output panel ─────────────────────────────────────────────────────────

export function CodeOutput({ code, onClear }: { code: string; onClear: () => void }) {
  if (!code) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"));
  };

  return (
    <div className="mobile-card">
      <div className="mobile-label">Generated Code</div>
      <textarea className="mobile-textarea" value={code} readOnly rows={4} style={{ marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="mobile-btn" onClick={handleCopy} style={{ flex: 2 }}>
          Copy to Clipboard
        </button>
        <button type="button" className="mobile-btn danger" onClick={onClear} style={{ flex: 1 }}>
          Clear
        </button>
      </div>
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
