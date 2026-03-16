import { useState, useCallback, useEffect, useRef } from "react";
import type { PartRow } from "@/data/partsData";
import {
  getCode,
  getPartName,
  getEffect,
  inferRarity,
  isLegendaryByName,
  parseCode,
  buildCopyFormat,
  deriveCategory,
} from "@/data/partsData";

interface PartDetailModalProps {
  row: PartRow | null;
  onClose: () => void;
  /** When set (e.g. from Unified Item Builder Add other parts), show "Add to build" and call this with the row when clicked. */
  onAddToBuild?: (row: PartRow) => void;
  /** When set (e.g. from Unified Item Builder), the copied qty code string is also pasted into the decoded/deserialized box. */
  onPasteToDecoded?: (codeString: string) => void;
}

// ── Rarity theme ──────────────────────────────────────────────────────────────

type RarityTheme = {
  border: string;
  glow: string;
  headerGrad: string;
  badge: string;
  badgeText: string;
  label: string;
};

const RARITY_THEMES: Record<string, RarityTheme> = {
  pearl: {
    border: "border-sky-400/70",
    glow: "shadow-[0_0_32px_4px_rgba(56,189,248,0.25)]",
    headerGrad: "from-sky-500/20 via-cyan-400/10 to-transparent",
    badge: "bg-sky-400/20 border border-sky-400/50",
    badgeText: "text-sky-300",
    label: "Pearlescent",
  },
  legendary: {
    border: "border-[var(--color-legendary)]/60",
    glow: "shadow-[0_0_32px_4px_rgba(255,184,0,0.2)]",
    headerGrad: "from-amber-500/20 via-yellow-400/10 to-transparent",
    badge: "bg-amber-400/20 border border-amber-400/50",
    badgeText: "text-amber-300",
    label: "Legendary",
  },
  epic: {
    border: "border-purple-400/60",
    glow: "shadow-[0_0_24px_2px_rgba(168,85,247,0.2)]",
    headerGrad: "from-purple-500/15 via-violet-400/8 to-transparent",
    badge: "bg-purple-400/20 border border-purple-400/50",
    badgeText: "text-purple-300",
    label: "Epic",
  },
  rare: {
    border: "border-blue-400/60",
    glow: "shadow-[0_0_20px_2px_rgba(96,165,250,0.18)]",
    headerGrad: "from-blue-500/12 via-blue-400/6 to-transparent",
    badge: "bg-blue-400/20 border border-blue-400/50",
    badgeText: "text-blue-300",
    label: "Rare",
  },
  uncommon: {
    border: "border-emerald-400/50",
    glow: "shadow-[0_0_16px_1px_rgba(52,211,153,0.15)]",
    headerGrad: "from-emerald-500/10 to-transparent",
    badge: "bg-emerald-400/20 border border-emerald-400/50",
    badgeText: "text-emerald-300",
    label: "Uncommon",
  },
  common: {
    border: "border-[var(--color-panel-border)]",
    glow: "",
    headerGrad: "from-[var(--color-accent)]/5 to-transparent",
    badge: "bg-[rgba(255,255,255,0.06)] border border-[var(--color-panel-border)]",
    badgeText: "text-[var(--color-text-muted)]",
    label: "Common",
  },
};

function getRarityTheme(rarity: string, isLeg: boolean): RarityTheme {
  if (rarity === "pearl") return RARITY_THEMES.pearl;
  if (rarity === "legendary" || isLeg) return RARITY_THEMES.legendary;
  if (rarity === "epic") return RARITY_THEMES.epic;
  if (rarity === "rare") return RARITY_THEMES.rare;
  if (rarity === "uncommon") return RARITY_THEMES.uncommon;
  return RARITY_THEMES.common;
}

// ── Category colours ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Weapon: "bg-orange-400/15 text-orange-300 border border-orange-400/30",
  Shield: "bg-cyan-400/15 text-cyan-300 border border-cyan-400/30",
  Grenade: "bg-red-400/15 text-red-300 border border-red-400/30",
  Repkit: "bg-teal-400/15 text-teal-300 border border-teal-400/30",
  Heavy: "bg-rose-400/15 text-rose-300 border border-rose-400/30",
  Enhancement: "bg-violet-400/15 text-violet-300 border border-violet-400/30",
  "Class Mod": "bg-amber-400/15 text-amber-300 border border-amber-400/30",
};

// ── Detail field row ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-medium">{label}</span>
      <span className="text-sm text-[var(--color-text)] font-mono break-all leading-snug">{value}</span>
    </div>
  );
}

// ── Quantity dialog ───────────────────────────────────────────────────────────

interface QtyDialogProps {
  code: string;
  onClose: () => void;
  onBack: () => void;
  /** When user copies the formatted code, also call this (e.g. to paste into decoded box). */
  onCopyFormatted?: (formatted: string) => void;
}

function QtyDialog({ code, onClose, onBack, onCopyFormatted }: QtyDialogProps) {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50);
  }, []);

  const parsed = parseCode(code);

  const formatted = useCallback(() => {
    if (!parsed) return code;
    const q = Math.max(1, Math.min(999, qty));
    if (q === 1 && parsed.prefix !== parsed.part) return `{${parsed.prefix}:${parsed.part}}`;
    if (q === 1 && parsed.prefix === parsed.part) return `{${parsed.part}}`;
    return buildCopyFormat(parsed.prefix, parsed.part, q);
  }, [parsed, qty, code]);

  const handleCopy = async () => {
    const text = formatted();
    try {
      await navigator.clipboard.writeText(text);
      onCopyFormatted?.(text);
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 900);
    } catch {
      onCopyFormatted?.(text);
    }
  };

  const nudge = (delta: number) =>
    setQty((v) => Math.max(1, Math.min(999, v + delta)));

  return (
    <div className="flex flex-col gap-5 px-1">
      {/* Code preview */}
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.4)] px-4 py-3 text-center">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Output code</p>
        <p className="font-mono text-sm text-[var(--color-accent)] break-all leading-relaxed">{formatted()}</p>
      </div>

      {/* Quantity control */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-widest">How many?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-10)}
            className="w-9 h-9 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] text-xs font-bold transition-colors"
          >
            −10
          </button>
          <button
            type="button"
            onClick={() => nudge(-1)}
            className="w-9 h-9 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] text-lg font-bold transition-colors flex items-center justify-center"
          >
            −
          </button>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={999}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
            className="w-20 h-11 text-center text-lg font-mono font-bold rounded-xl border-2 border-[var(--color-accent)]/50 bg-[rgba(0,0,0,0.4)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => nudge(1)}
            className="w-9 h-9 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] text-lg font-bold transition-colors flex items-center justify-center"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => nudge(10)}
            className="w-9 h-9 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] text-xs font-bold transition-colors"
          >
            +10
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)]">Max 999</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex-[2] px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            copied
              ? "bg-emerald-500 text-white scale-95"
              : "bg-[var(--color-accent)] text-black hover:brightness-110 active:scale-95"
          }`}
        >
          {copied ? "✓ Copied!" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function PartDetailModal({ row, onClose, onAddToBuild, onPasteToDecoded }: PartDetailModalProps) {
  const [showQty, setShowQty] = useState(false);
  const [quickCopied, setQuickCopied] = useState(false);

  // Reset qty dialog when row changes
  useEffect(() => { setShowQty(false); setQuickCopied(false); }, [row]);

  // Close on Escape
  useEffect(() => {
    if (!row) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { if (showQty) setShowQty(false); else onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [row, onClose, showQty]);

  if (!row) return null;

  const rarity = inferRarity(row);
  const isPearl = rarity === "pearl";
  const isLeg = rarity === "legendary" || (!isPearl && isLegendaryByName(row));
  const theme = getRarityTheme(rarity, isLeg);

  const code = getCode(row);
  const name = getPartName(row);
  const effect = getEffect(row);
  const manufacturer = (row.Manufacturer ?? (row as Record<string, unknown>)["manufacturer"] ?? "").toString().trim();
  const partType = (row["Part Type"] ?? (row as Record<string, unknown>)["partType"] ?? "").toString().trim();
  const modelName = (row["Model Name"] ?? "").toString().trim();
  const weaponType = (row["Weapon Type"] ?? (row as Record<string, unknown>)["weaponType"] ?? "").toString().trim();
  const idVal = row["ID"] != null ? String(row["ID"]) : "";
  const category = deriveCategory(row) || (row.category ?? "").toString().trim();

  const catColor = category ? (CATEGORY_COLORS[category] ?? "bg-[rgba(255,255,255,0.06)] text-[var(--color-text-muted)] border border-[var(--color-panel-border)]") : "";

  const handleQuickCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 1400);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { if (showQty) setShowQty(false); else onClose(); } }}
    >
      <div
        className={`relative w-full max-w-md rounded-2xl border ${theme.border} ${theme.glow} bg-[rgba(18,21,27,0.97)] overflow-hidden flex flex-col max-h-[90vh]`}
        style={{ transition: "box-shadow 0.3s" }}
      >
        {/* ── Gradient header strip ── */}
        <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${theme.headerGrad} pointer-events-none`} />

        {/* ── Header ── */}
        <div className="relative px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex items-center flex-wrap gap-1.5 mb-2.5">
              {rarity && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.badge} ${theme.badgeText}`}>
                  {theme.label}
                </span>
              )}
              {category && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${catColor}`}>
                  {category}
                </span>
              )}
              {weaponType && weaponType.toLowerCase() !== category.toLowerCase() && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)] border border-[var(--color-panel-border)]">
                  {weaponType}
                </span>
              )}
            </div>
            {/* Part name */}
            <h2 className={`text-lg font-bold leading-tight break-words ${isLeg || isPearl ? theme.badgeText : "text-[var(--color-text)]"}`}>
              {name}
            </h2>
            {manufacturer && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{manufacturer}</p>
            )}
          </div>
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ── Divider ── */}
        <div className={`mx-5 h-px ${isLeg || isPearl ? `bg-gradient-to-r from-transparent via-[var(--color-legendary)]/30 to-transparent` : "bg-[var(--color-panel-border)]/40"}`} />

        {/* ── Body (scrollable) ── */}
        <div className="relative flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {showQty ? (
            <QtyDialog
              code={code}
              onClose={onClose}
              onBack={() => setShowQty(false)}
              onCopyFormatted={onPasteToDecoded}
            />
          ) : (
            <>
              {/* Code box */}
              <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.35)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Part code</p>
                    <p className={`font-mono text-sm font-semibold ${isLeg || isPearl ? theme.badgeText : "text-[var(--color-accent)]"} break-all`}>{code}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickCopy}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      quickCopied
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-95"
                        : "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/25"
                    }`}
                  >
                    {quickCopied ? "✓" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Manufacturer" value={manufacturer} />
                <Field label="Part type" value={partType} />
                <Field label="Item type" value={modelName} />
                <Field label="Part ID" value={idVal} />
              </div>

              {/* Effect / Stats */}
              {effect && effect !== "—" && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5 font-medium">Effect / Stats</p>
                  <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.25)] px-4 py-3">
                    <p className="text-sm text-[var(--color-text)] leading-relaxed">{effect}</p>
                  </div>
                </div>
              )}

              {/* CTA: Add to build (Unified Builder) or Copy with quantity */}
              {onAddToBuild && (
                <button
                  type="button"
                  onClick={() => {
                    onAddToBuild(row);
                    onClose();
                  }}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent)]/80 text-black hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                >
                  Add to build →
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowQty(true)}
                className={`w-full py-3 rounded-xl font-semibold text-sm ${onAddToBuild ? "border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-accent)]/10" : "bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent)]/80 text-black hover:brightness-110"} active:scale-[0.98] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.3)]`}
              >
                Copy with quantity →
              </button>
            </>
          )}
        </div>

        {/* ── Subtle bottom glow strip ── */}
        {(isLeg || isPearl) && (
          <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent ${isPearl ? "via-sky-400/40" : "via-amber-400/40"} to-transparent`} />
        )}
      </div>
    </div>
  );
}
