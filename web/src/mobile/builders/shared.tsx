/**
 * Shared mobile builder components and utilities.
 * Reused across all 7 builders to keep them DRY.
 */
import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { fetchApi } from "@/lib/apiClient";
import { getSkinImageUrl } from "@/lib/skinImage";
import { showToast } from "../components/Toast";
import type { PickerOption } from "../components/MobilePicker";

const InjectorSetupModalRaw = lazy(() => import("@/components/InjectorSetupModal"));
function InjectorSetupModalLazy(props: { mode: "inject" | "loot-lobby"; onClose: () => void; onReady?: () => void }) {
  return <Suspense fallback={null}><InjectorSetupModalRaw {...props} /></Suspense>;
}

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

export function BuilderToggles({ showInfo, setShowInfo, allParts, setAllParts, onAutoFill, autoFillMsg }: {
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  allParts: boolean;
  setAllParts: (v: boolean) => void;
  onAutoFill?: () => void;
  autoFillMsg?: string | null;
}) {
  const pill = (active: boolean, color?: string) => ({
    padding: "8px 14px",
    borderRadius: 10,
    border: `1px solid ${active ? (color ?? "var(--color-accent)") : "rgba(255,255,255,0.12)"}`,
    background: active ? `${color ?? "var(--color-accent)"}22` : "rgba(14,16,20,0.7)",
    color: active ? (color ?? "var(--color-accent)") : "var(--color-text-muted)",
    fontSize: 11,
    fontWeight: 700 as const,
    cursor: "pointer",
    touchAction: "manipulation" as const,
    WebkitTapHighlightColor: "transparent",
    minHeight: 40,
    backdropFilter: "blur(4px)",
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={pill(showInfo)} onClick={() => setShowInfo(!showInfo)}>
          {showInfo ? "✓ " : ""}Show Info
        </button>
        <button type="button" style={pill(allParts)} onClick={() => setAllParts(!allParts)}>
          {allParts ? "✓ " : ""}All Parts
        </button>
        {onAutoFill && (
          <button type="button" style={pill(false, "#22c55e")} onClick={onAutoFill}>
            Auto Fill
          </button>
        )}
      </div>
      {autoFillMsg && <p style={{ fontSize: 11, color: autoFillMsg.includes("!") ? "#4ade80" : "#facc15", marginTop: 6, textAlign: "center" }}>{autoFillMsg}</p>}
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
            const commaIdx = stripped.indexOf(",");
            const mainText = commaIdx > 0 ? stripped.substring(0, commaIdx).trim() : stripped;
            const statText = commaIdx > 0 ? stripped.substring(commaIdx + 1).trim() : "";
            const codeDisplay = opt.value.includes(":") ? `{${opt.value}}` : opt.value.match(/^\d+/) ? opt.value.match(/^\d+/)![0] : "";

            return (
              <div key={opt.value} className="mobile-check-row" style={{ flexWrap: "wrap", alignItems: "flex-start", padding: showInfo ? "10px 0" : "8px 0" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(opt.value, opt.label)}
                  style={{ marginTop: 2 }}
                />
                <span className="part-name" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {/* Row 1: code + name */}
                  <span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", marginRight: 6, opacity: 0.7 }}>
                      {codeDisplay}
                    </span>
                    <span style={{ fontWeight: 600 }}>{mainText}</span>
                  </span>
                  {/* Row 2: stats (always show if available) */}
                  {statText && (
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.3 }}>
                      {statText}
                    </span>
                  )}
                  {/* Row 3: metadata tags (show info mode) */}
                  {showInfo && (opt.partType || opt.manufacturer || opt.effect || opt.category) && (
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                      {opt.partType && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{opt.partType}</span>}
                      {opt.manufacturer && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{opt.manufacturer}</span>}
                      {opt.category && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}>{opt.category}</span>}
                      {opt.effect && (
                        <span style={{ width: "100%", fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.3, marginTop: 1 }}>
                          {opt.effect}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {isSelected && <QtyInput value={sel?.qty ?? 1} onChange={(n) => onQtyChange(opt.value, n)} />}
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
  const [open, setOpen] = useState(false);
  const selectedLabel = opts.find((o) => o.value === value)?.label ?? "-- No Skin --";

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
              <button type="button" onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "var(--color-text)", fontSize: 13, fontWeight: 700, padding: "6px 14px", cursor: "pointer", touchAction: "manipulation" }}>✕ Close</button>
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
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

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

      {/* Inject to Game — disabled: injected items crash game on drop/interact
         TODO: need to populate Type/Info pointers correctly for stable injection */}
      {false && base85 && (
        <button
          type="button"
          disabled={injecting || !base85}
          onClick={async () => {
            // Check if setup is done
            if (localStorage.getItem("bl4-injector-setup-done") !== "1") {
              setShowSetup(true);
              return;
            }
            setInjecting(true);
            setInjectResult(null);
            try {
              const { injectItem } = await import("@/lib/injectorBridge");
              const resp = await injectItem(base85);
              setInjectResult(resp.ok ? resp.message || "Injected!" : resp.error || "Failed");
              if (resp.ok) showToast("Item injected to game!");
              else showToast(resp.error || "Injection failed");
            } catch {
              setInjectResult("Bridge not running. Download & run BL4_Injector.exe");
              showToast("Bridge not connected");
            }
            setInjecting(false);
          }}
          style={{
            width: "100%", marginTop: 10, padding: "12px 14px", borderRadius: 10,
            border: "1px solid #22c55e", background: "rgba(34,197,94,0.12)",
            color: "#22c55e", fontSize: 13, fontWeight: 700,
            cursor: injecting ? "wait" : "pointer",
            touchAction: "manipulation", opacity: injecting ? 0.5 : 1,
          }}
        >
          {injecting ? "Injecting..." : "Inject to Game"}
        </button>
      )}
      {injectResult && (
        <p style={{ fontSize: 11, color: injectResult.includes("!") ? "#4ade80" : "#f87171", marginTop: 6, textAlign: "center" }}>
          {injectResult}
        </p>
      )}
      {showSetup && (
        <InjectorSetupModalLazy mode="inject" onClose={() => setShowSetup(false)} onReady={() => setShowSetup(false)} />
      )}
    </div>
  );
}

// ── Build Parts List (shows all parts in the generated code) ──────────────

interface ParsedBuildPart {
  raw: string;
  prefix?: number;
  partId?: number;
  qty: number;
}

function parsePartsFromCode(code: string): ParsedBuildPart[] {
  const first = code.split(/\r?\n/)[0]?.trim() ?? "";
  const idx = first.indexOf("||");
  if (idx === -1) return [];
  const segment = first.slice(idx + 2).replace(/\|\s*$/, "").replace(/"c",\s*"[^"]*"\s*\|?\s*$/, "").trim();
  const beforePipe = first.split("|")[0].trim();
  const headerTypeId = parseInt(beforePipe.split(",")[0].trim(), 10) || null;

  const out: ParsedBuildPart[] = [];
  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(segment)) !== null) {
    const raw = m[0];
    const outer = Number(m[1]);
    const inner = m[2];
    if (!inner) {
      out.push({ raw, prefix: headerTypeId ?? outer, partId: outer, qty: 1 });
      continue;
    }
    if (inner.includes("[")) {
      const subIds = inner.replace(/[\[\]]/g, "").trim().split(/\s+/).filter(Boolean).map(Number);
      const countByPartId = new Map<number, number>();
      for (const id of subIds) countByPartId.set(id, (countByPartId.get(id) ?? 0) + 1);
      for (const [partId, qty] of countByPartId) {
        out.push({ raw: `{${outer}:${partId}}`, prefix: outer, partId, qty });
      }
      continue;
    }
    out.push({ raw, prefix: outer, partId: Number(inner), qty: 1 });
  }
  return out;
}

export function BuildPartsList({ code, universalParts }: {
  code: string;
  universalParts: { code: string; label: string; partType?: string; rarity?: string }[];
}) {
  if (!code) return null;
  const parts = parsePartsFromCode(code);
  if (parts.length === 0) return null;

  const nameMap = new Map<string, { label: string; partType?: string; rarity?: string }>();
  for (const p of universalParts) {
    if (p.code) nameMap.set(p.code, { label: p.label, partType: p.partType, rarity: p.rarity });
  }

  const rarityColor = (r?: string) => {
    const rl = (r ?? "").toLowerCase();
    if (rl === "pearl" || rl === "pearlescent") return "#38bdf8";
    if (rl === "legendary") return "#fbbf24";
    if (rl === "epic") return "#a78bfa";
    if (rl === "rare") return "#60a5fa";
    if (rl === "uncommon") return "#4ade80";
    return "var(--color-text)";
  };

  return (
    <div className="mobile-card">
      <div className="mobile-label">Build Parts ({parts.length})</div>
      <div style={{ maxHeight: 280, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {parts.map((part, i) => {
          const codeStr = part.prefix != null && part.partId != null ? `{${part.prefix}:${part.partId}}` : part.raw;
          const info = nameMap.get(codeStr);
          const label = info?.label ?? codeStr;
          return (
            <div key={`${codeStr}-${i}`} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: 12, minHeight: 32,
            }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", opacity: 0.6, flexShrink: 0, minWidth: 52 }}>
                {codeStr}
              </span>
              <span style={{ flex: 1, color: rarityColor(info?.rarity), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              {part.qty > 1 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-accent)", background: "var(--color-accent-dim)", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                  x{part.qty}
                </span>
              )}
              {info?.partType && (
                <span style={{ fontSize: 9, color: "var(--color-text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 5px", borderRadius: 3, flexShrink: 0 }}>
                  {info.partType}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Add from Database ─────────────────────────────────────────────────────────

interface DbPart {
  code: string;
  label: string;
  partType?: string;
  rarity?: string;
  category?: string;
  manufacturer?: string;
}

export interface ExtraToken {
  code: string;   // e.g. "{10:60}"
  label: string;  // display name
  qty: number;
}

export function useExtraTokens() {
  const [tokens, setTokens] = useState<ExtraToken[]>([]);
  const add = useCallback((code: string, label: string, qty: number) => {
    setTokens((prev) => {
      const existing = prev.find((t) => t.code === code);
      if (existing) return prev.map((t) => t.code === code ? { ...t, qty: t.qty + qty } : t);
      return [...prev, { code, label, qty }];
    });
  }, []);
  const remove = useCallback((code: string) => {
    setTokens((prev) => prev.filter((t) => t.code !== code));
  }, []);
  const clear = useCallback(() => setTokens([]), []);
  return { tokens, add, remove, clear };
}

/** Builds token strings from extra tokens for insertion into decoded string. */
export function extraTokensToString(tokens: ExtraToken[]): string {
  if (tokens.length === 0) return "";
  // Group by prefix (typeId)
  const byPrefix: Record<string, number[]> = {};
  for (const t of tokens) {
    const m = t.code.match(/^\{(\d+):(\d+)\}$/);
    if (!m) continue;
    const prefix = m[1];
    const partId = Number(m[2]);
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    for (let i = 0; i < t.qty; i++) byPrefix[prefix].push(partId);
  }
  const parts: string[] = [];
  for (const [prefix, ids] of Object.entries(byPrefix)) {
    if (ids.length === 1) parts.push(`{${prefix}:${ids[0]}}`);
    else {
      const sorted = [...ids].sort((a, b) => a - b);
      parts.push(`{${prefix}:[${sorted.join(" ")}]}`);
    }
  }
  return parts.join(" ");
}

export function AddFromDatabase({ universalParts, onAdd }: {
  universalParts: DbPart[];
  onAdd: (code: string, label: string, qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qty, setQtyText] = useState("1");

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const results = search.trim().length < 2 ? [] : (() => {
    const q = search.trim().toLowerCase();
    return universalParts
      .filter((p) => [p.code, p.label, p.partType ?? "", p.manufacturer ?? "", p.category ?? ""].join(" ").toLowerCase().includes(q))
      .slice(0, 50);
  })();

  const handleAdd = (part: DbPart) => {
    const n = Math.max(1, Math.min(99, Number(qty) || 1));
    onAdd(part.code, part.label, n);
    showToast(`Added ${part.label} x${n}`);
  };

  const rarityColor = (r?: string) => {
    const rl = (r ?? "").toLowerCase();
    if (rl === "pearl" || rl === "pearlescent") return "#38bdf8";
    if (rl === "legendary") return "#fbbf24";
    if (rl === "epic") return "#a78bfa";
    if (rl === "rare") return "#60a5fa";
    if (rl === "uncommon") return "#4ade80";
    return "var(--color-text)";
  };

  return (
    <>
      <button type="button" className="mobile-btn" onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>
        + Add Parts from Database
      </button>
      {open && (
        <div className="mobile-picker-overlay" onClick={() => setOpen(false)}>
          <div className="mobile-picker-sheet" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="mobile-picker-header">
              <h3>Add from Database</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "var(--color-text)", fontSize: 13, fontWeight: 700, padding: "6px 14px", cursor: "pointer", touchAction: "manipulation" }}>✕ Close</button>
            </div>
            <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
              <input
                type="text"
                className="mobile-input"
                placeholder="Search parts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{ flex: 1, minHeight: 40 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Qty:</span>
                <input
                  type="number"
                  className="qty-input"
                  value={qty}
                  min={1}
                  max={99}
                  onChange={(e) => setQtyText(e.target.value)}
                  onBlur={() => { const n = Math.max(1, Math.min(99, Number(qty) || 1)); setQtyText(String(n)); }}
                  style={{ width: 44 }}
                />
              </div>
            </div>
            <div className="mobile-picker-list">
              {search.trim().length < 2 && (
                <p style={{ padding: "20px 16px", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>Type at least 2 characters to search</p>
              )}
              {results.map((part) => (
                <button
                  key={part.code}
                  type="button"
                  className="mobile-picker-item"
                  onClick={() => handleAdd(part)}
                  style={{ flexWrap: "wrap" }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", opacity: 0.6, flexShrink: 0 }}>
                    {part.code}
                  </span>
                  <span style={{ flex: 1, color: rarityColor(part.rarity), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {part.label}
                  </span>
                  {part.partType && (
                    <span style={{ fontSize: 9, color: "var(--color-text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 5px", borderRadius: 3 }}>
                      {part.partType}
                    </span>
                  )}
                </button>
              ))}
              {search.trim().length >= 2 && results.length === 0 && (
                <p style={{ padding: "20px 16px", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>No parts found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Shows extra tokens that were added from database, with remove buttons. */
export function ExtraTokensList({ tokens, onRemove }: { tokens: ExtraToken[]; onRemove: (code: string) => void }) {
  if (tokens.length === 0) return null;
  return (
    <div className="mobile-card">
      <div className="mobile-label">Extra Parts ({tokens.length})</div>
      {tokens.map((t) => (
        <div key={t.code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-accent)", opacity: 0.6 }}>{t.code}</span>
          <span style={{ flex: 1, color: "var(--color-text)" }}>{t.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-accent)", background: "var(--color-accent-dim)", padding: "1px 6px", borderRadius: 8 }}>x{t.qty}</span>
          <button type="button" onClick={() => onRemove(t.code)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 14, cursor: "pointer", padding: "4px 8px", touchAction: "manipulation" }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Enrich options with universal DB metadata ─────────────────────────────────

interface UniversalPartSimple {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

/** Enrich base picker options with metadata from universal parts DB.
 *  Matches by partId against the given typeId prefix(es). */
export function enrichOptions(
  base: PickerOption[],
  universalParts: UniversalPartSimple[],
  typeIds: (string | number)[],
): PickerOption[] {
  // Build lookup: "{typeId:partId}" -> metadata
  const lookup = new Map<string, UniversalPartSimple>();
  for (const up of universalParts) {
    if (up.code) lookup.set(up.code, up);
  }
  return base.map((opt) => {
    if (opt.partType || opt.manufacturer || opt.effect) return opt; // already enriched
    // Try each typeId prefix
    for (const tid of typeIds) {
      const key = `{${tid}:${opt.value}}`;
      const meta = lookup.get(key);
      if (meta) {
        return { ...opt, partType: meta.partType, manufacturer: meta.manufacturer, effect: meta.effect, category: meta.category };
      }
    }
    return opt;
  });
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
