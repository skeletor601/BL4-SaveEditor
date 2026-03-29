// @ts-nocheck
/**
 * TraitEditorPopover — Interactive badge editor for modded weapon traits.
 *
 * Features:
 * 1. Click-to-Expand: click a badge → popover shows parts/stacks behind it
 * 2. Toggle On/Off: dismiss (x) button strips the trait group from decoded string
 * 3. Lock for Re-Roll: lock icon persists trait across re-generations
 * 4. Click-to-Cycle: chips to cycle between alternatives (elements, underbarrels, etc.)
 * 5. Stack Sliders: drag to adjust stack counts, live-updates decoded string + DPS
 * 6. Add Trait: + badge opens dropdown of traits not on current gun
 * 7. Database Picker: open dropdown of all parts for that type, multi-select + qty
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Trait type definitions ─────────────────────────────────────────────────

export interface TraitToken {
  typeId: number;
  partIds: number[];
  raw: string;           // original token string e.g. "{1:57}" or "{245:[4 25 72 72...]}"
  startIdx: number;      // char index in decoded component string
  endIdx: number;
}

export interface TraitDefinition {
  id: string;            // unique key e.g. "element", "seamstress", "grenade-kit"
  label: string;         // display name
  color: string;         // tailwind color classes for badge
  kind: "single" | "stacked" | "binary";
  // single = one partId that can be swapped (element, underbarrel)
  // stacked = a {typeId:[...]} block with stackable parts
  // binary = present or not, no alternatives (seamstress, claude's gun)
  typeId: number;
  /** For single/cycle: the list of alternatives to cycle through */
  alternatives?: { partId: number; label: string; color?: string }[];
  /** For stacked: min/max range for slider */
  stackMin?: number;
  stackMax?: number;
  /** Current data extracted from decoded string */
  currentPartId?: number;
  currentPartIds?: number[];
  stackCount?: number;
  tokens: TraitToken[];
  /** Whether this trait is locked for re-roll */
  locked?: boolean;
  /** Whether this trait has been modified from generated default */
  modified?: boolean;
  /** Original state for undo */
  originalTokens?: TraitToken[];
}

// ─── Element definitions ────────────────────────────────────────────────────

const ELEMENT_ALTERNATIVES = [
  { partId: 60, label: "Fire", color: "border-red-400/40 bg-red-400/10 text-red-400" },
  { partId: 56, label: "Shock", color: "border-blue-400/40 bg-blue-400/10 text-blue-400" },
  { partId: 59, label: "Cryo", color: "border-cyan-400/40 bg-cyan-400/10 text-cyan-400" },
  { partId: 58, label: "Corrosive", color: "border-lime-400/40 bg-lime-400/10 text-lime-400" },
  { partId: 57, label: "Radiation", color: "border-green-400/40 bg-green-400/10 text-green-400" },
];

// Badge color map (same as existing badges in UnifiedItemBuilderPage)
const TRAIT_COLORS: Record<string, string> = {
  "element-fire":     "border-red-400/40 bg-red-400/10 text-red-400",
  "element-shock":    "border-blue-400/40 bg-blue-400/10 text-blue-400",
  "element-cryo":     "border-cyan-400/40 bg-cyan-400/10 text-cyan-400",
  "element-corrosive":"border-lime-400/40 bg-lime-400/10 text-lime-400",
  "element-radiation":"border-green-400/40 bg-green-400/10 text-green-400",
  "seamstress":       "border-pink-400/40 bg-pink-400/10 text-pink-400",
  "mirv":             "border-orange-400/40 bg-orange-400/10 text-orange-400",
  "grenade-kit":      "border-yellow-400/40 bg-yellow-400/10 text-yellow-400",
  "shield-cross":     "border-blue-300/40 bg-blue-300/10 text-blue-300",
  "class-mod-perks":  "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  "heavy-accessories":"border-amber-400/40 bg-amber-400/10 text-amber-400",
  "claudes-gun":      "border-purple-400/40 bg-purple-400/10 text-purple-400",
};

// ─── Trait detection from decoded string ────────────────────────────────────

/** Parse decoded string into structured Trait objects */
export function detectTraits(decoded: string): TraitDefinition[] {
  if (!decoded) return [];
  const d = decoded;
  const traits: TraitDefinition[] = [];

  // Parse all tokens from the component section (after ||)
  const pipeIdx = d.indexOf("||");
  const component = pipeIdx >= 0 ? d.slice(pipeIdx + 2) : d;
  const tokenRe = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;

  function findTokens(typeId: number, partFilter?: (pid: number) => boolean): TraitToken[] {
    const found: TraitToken[] = [];
    let m: RegExpExecArray | null;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(component)) !== null) {
      const outer = Number(m[1]);
      const inner = m[2];
      if (inner === undefined) continue;
      let tid: number;
      let pids: number[];
      if (inner.includes("[")) {
        tid = outer;
        pids = inner.replace(/[[\]]/g, " ").trim().split(/\s+/).filter(Boolean).map(Number);
      } else {
        tid = outer;
        pids = [Number(inner)];
      }
      if (tid === typeId && (!partFilter || pids.some(partFilter))) {
        found.push({ typeId: tid, partIds: pids, raw: m[0], startIdx: m.index + (pipeIdx >= 0 ? pipeIdx + 2 : 0), endIdx: m.index + m[0].length + (pipeIdx >= 0 ? pipeIdx + 2 : 0) });
      }
    }
    return found;
  }

  // 1. Element (type 1, parts 56-60)
  const elementParts = [56, 57, 58, 59, 60];
  const elemTokens = findTokens(1, (pid) => elementParts.includes(pid));
  if (elemTokens.length > 0) {
    const currentPid = elemTokens[0].partIds[0];
    const elemInfo = ELEMENT_ALTERNATIVES.find((e) => e.partId === currentPid);
    traits.push({
      id: "element",
      label: elemInfo?.label || "Element",
      color: elemInfo?.color || TRAIT_COLORS["element-fire"],
      kind: "single",
      typeId: 1,
      alternatives: ELEMENT_ALTERNATIVES,
      currentPartId: currentPid,
      tokens: elemTokens,
    });
  }

  // 2. Seamstress (26:77)
  if (/26:77/.test(d)) {
    const seamTokens = findTokens(26, (pid) => pid === 77);
    traits.push({
      id: "seamstress",
      label: "Seamstress",
      color: TRAIT_COLORS["seamstress"],
      kind: "binary",
      typeId: 26,
      tokens: seamTokens,
    });
  }

  // 3. MIRV / Heavy Accessories (289:[...])
  if (/289:\[/.test(d)) {
    const mirvTokens = findTokens(289);
    const totalParts = mirvTokens.reduce((s, t) => s + t.partIds.length, 0);
    traits.push({
      id: "mirv",
      label: "MIRV",
      color: TRAIT_COLORS["mirv"],
      kind: "stacked",
      typeId: 289,
      currentPartIds: mirvTokens.flatMap((t) => t.partIds),
      stackCount: totalParts,
      stackMin: 1,
      stackMax: 50,
      tokens: mirvTokens,
    });
  }

  // 4. Grenade Kit (245:[...])
  if (/245:\[/.test(d)) {
    const grenTokens = findTokens(245);
    const totalParts = grenTokens.reduce((s, t) => s + t.partIds.length, 0);
    traits.push({
      id: "grenade-kit",
      label: "Grenade Kit",
      color: TRAIT_COLORS["grenade-kit"],
      kind: "stacked",
      typeId: 245,
      currentPartIds: grenTokens.flatMap((t) => t.partIds),
      stackCount: totalParts,
      stackMin: 1,
      stackMax: 300,
      tokens: grenTokens,
    });
  }

  // 5. Shield Cross (287:[...])
  if (/287:\[/.test(d)) {
    const shieldTokens = findTokens(287);
    const totalParts = shieldTokens.reduce((s, t) => s + t.partIds.length, 0);
    traits.push({
      id: "shield-cross",
      label: "Shield Cross",
      color: TRAIT_COLORS["shield-cross"],
      kind: "stacked",
      typeId: 287,
      currentPartIds: shieldTokens.flatMap((t) => t.partIds),
      stackCount: totalParts,
      stackMin: 1,
      stackMax: 200,
      tokens: shieldTokens,
    });
  }

  // 6. Class Mod Perks (234:[...])
  if (/234:\[/.test(d)) {
    const cmTokens = findTokens(234);
    const totalParts = cmTokens.reduce((s, t) => s + t.partIds.length, 0);
    traits.push({
      id: "class-mod-perks",
      label: "Class Mod Perks",
      color: TRAIT_COLORS["class-mod-perks"],
      kind: "stacked",
      typeId: 234,
      currentPartIds: cmTokens.flatMap((t) => t.partIds),
      stackCount: totalParts,
      stackMin: 1,
      stackMax: 100,
      tokens: cmTokens,
    });
  }

  // 7. Heavy Accessories (273:, 275:, 282:) — but not 289 which is MIRV
  const heavyTypeIds = [273, 275, 282];
  const heavyTokens: TraitToken[] = [];
  for (const tid of heavyTypeIds) {
    heavyTokens.push(...findTokens(tid));
  }
  if (heavyTokens.length > 0) {
    const totalParts = heavyTokens.reduce((s, t) => s + t.partIds.length, 0);
    traits.push({
      id: "heavy-accessories",
      label: "Heavy Accessories",
      color: TRAIT_COLORS["heavy-accessories"],
      kind: "stacked",
      typeId: 0, // multi-type
      currentPartIds: heavyTokens.flatMap((t) => t.partIds),
      stackCount: totalParts,
      stackMin: 1,
      stackMax: 100,
      tokens: heavyTokens,
    });
  }

  return traits;
}

// ─── Apply locked traits from old decoded onto new decoded ──────────────────

/**
 * Given the old decoded string and the new (re-rolled) decoded string,
 * splice locked traits from old into new — replacing or injecting them.
 */
export function applyLockedTraits(
  oldDecoded: string,
  newDecoded: string,
  lockedTraitIds: Set<string>,
): string {
  if (lockedTraitIds.size === 0) return newDecoded;

  const oldTraits = detectTraits(oldDecoded);
  const newTraits = detectTraits(newDecoded);
  let result = newDecoded;

  for (const oldTrait of oldTraits) {
    if (!lockedTraitIds.has(oldTrait.id)) continue;

    // Find matching trait in new code
    const newTrait = newTraits.find((t) => t.id === oldTrait.id);

    // Collect the raw tokens from the old trait
    const oldRawTokens = oldTrait.tokens.map((t) => t.raw);

    if (newTrait) {
      // Remove new trait's tokens from result
      for (const token of newTrait.tokens) {
        result = result.replace(token.raw, "");
      }
    }

    // Also handle seamstress companion parts — remove new ones if present
    if (oldTrait.id === "seamstress" && newTrait) {
      result = result.replace(/\{13:70\}/g, "");
      result = result.replace(/\{11:75\}/g, "");
      result = result.replace(/\{11:81\}/g, "");
    }

    // Insert old trait's tokens before the last |
    const tokensToInsert = oldRawTokens.join(" ");
    // For seamstress, also re-insert companion parts
    const extras = oldTrait.id === "seamstress" ? " {13:70} {11:75} {11:81}" : "";

    const lastPipe = result.lastIndexOf("|");
    if (lastPipe > 0 && result[lastPipe - 1] !== "|") {
      result = result.slice(0, lastPipe) + " " + tokensToInsert + extras + " " + result.slice(lastPipe);
    } else {
      result += " " + tokensToInsert + extras;
    }
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── All possible traits for "Add Trait" ────────────────────────────────────

const ALL_TRAIT_TEMPLATES: { id: string; label: string; color: string; kind: TraitDefinition["kind"]; typeId: number; defaultToken: string }[] = [
  { id: "element", label: "Element", color: TRAIT_COLORS["element-fire"], kind: "single", typeId: 1, defaultToken: "{1:57}" },
  { id: "seamstress", label: "Seamstress", color: TRAIT_COLORS["seamstress"], kind: "binary", typeId: 26, defaultToken: "{26:77}" },
  { id: "mirv", label: "MIRV", color: TRAIT_COLORS["mirv"], kind: "stacked", typeId: 289, defaultToken: "{289:[17 17 17 17 17]}" },
  { id: "grenade-kit", label: "Grenade Kit", color: TRAIT_COLORS["grenade-kit"], kind: "stacked", typeId: 245, defaultToken: "{245:[5 25 72 72 72 72 72]}" },
  { id: "shield-cross", label: "Shield Cross", color: TRAIT_COLORS["shield-cross"], kind: "stacked", typeId: 287, defaultToken: "{287:[9 9 9 9 9 9 9 9 9 9]}" },
  { id: "class-mod-perks", label: "Class Mod Perks", color: TRAIT_COLORS["class-mod-perks"], kind: "stacked", typeId: 234, defaultToken: "{234:[21 22 23 26 28 30 31]}" },
  { id: "heavy-accessories", label: "Heavy Accessories", color: TRAIT_COLORS["heavy-accessories"], kind: "stacked", typeId: 273, defaultToken: "{273:[35 35 35 35 35]}" },
];

// ─── Helper: rebuild decoded string with token replacement ──────────────────

function replaceTokenInDecoded(decoded: string, oldRaw: string, newRaw: string): string {
  return decoded.replace(oldRaw, newRaw);
}

function removeTokenFromDecoded(decoded: string, token: TraitToken): string {
  // Remove the raw token and clean up extra spaces
  return decoded.replace(token.raw, "").replace(/\s{2,}/g, " ").trim();
}

function removeTraitFromDecoded(decoded: string, trait: TraitDefinition): string {
  let result = decoded;
  // Remove all tokens for this trait (process in reverse to maintain indices)
  const sortedTokens = [...trait.tokens].sort((a, b) => b.startIdx - a.startIdx);
  for (const token of sortedTokens) {
    result = result.replace(token.raw, "");
  }
  // If removing seamstress, also remove its companion parts
  if (trait.id === "seamstress") {
    result = result.replace(/\{13:70\}/g, "");
    result = result.replace(/\{11:75\}/g, "");
    result = result.replace(/\{11:81\}/g, "");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function addTraitToDecoded(decoded: string, traitTemplate: typeof ALL_TRAIT_TEMPLATES[0]): string {
  // Insert before the last "|" or at end of component section
  const lastPipe = decoded.lastIndexOf("|");
  if (lastPipe > 0 && decoded[lastPipe - 1] !== "|") {
    return decoded.slice(0, lastPipe) + " " + traitTemplate.defaultToken + " " + decoded.slice(lastPipe);
  }
  return decoded + " " + traitTemplate.defaultToken;
}

function buildStackedToken(typeId: number, partIds: number[]): string {
  if (partIds.length === 0) return "";
  if (partIds.length === 1) return `{${typeId}:${partIds[0]}}`;
  return `{${typeId}:[${partIds.join(" ")}]}`;
}

// ─── Database Part Picker sub-component ─────────────────────────────────────

interface DbPartOption {
  partId: number;
  label: string;
  effect?: string;
}

function DatabasePartPicker({
  parts,
  selectedIds,
  onConfirm,
  onClose,
}: {
  parts: DbPartOption[];
  selectedIds: number[];
  onConfirm: (selections: { partId: number; qty: number }[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    // Count existing selections
    for (const id of selectedIds) {
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  });

  const toggle = (partId: number) => {
    setChecked((prev) => {
      const next = new Map(prev);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.set(partId, 1);
      }
      return next;
    });
  };

  const setQty = (partId: number, qty: number) => {
    setChecked((prev) => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(partId);
      } else {
        next.set(partId, qty);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selections: { partId: number; qty: number }[] = [];
    for (const [partId, qty] of checked) {
      selections.push({ partId, qty });
    }
    onConfirm(selections);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(18,22,28,0.98)] shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-accent)]">Select Parts</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1">
          {parts.map((p) => {
            const isChecked = checked.has(p.partId);
            const qty = checked.get(p.partId) || 0;
            return (
              <div key={p.partId} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${isChecked ? "bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30" : "hover:bg-white/5"}`}>
                <button
                  onClick={() => toggle(p.partId)}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] font-bold transition-colors ${isChecked ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]" : "border-[var(--color-panel-border)] text-transparent"}`}
                >
                  {isChecked ? "✓" : ""}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-[var(--color-text)]">{p.label}</span>
                  {p.effect && <span className="text-[10px] text-[var(--color-text-muted)] ml-1">— {p.effect}</span>}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">ID:{p.partId}</span>
                {isChecked && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setQty(p.partId, Math.max(1, qty - 1))} className="w-6 h-6 rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs hover:bg-white/10">-</button>
                    <input
                      type="number"
                      value={qty}
                      onChange={(e) => setQty(p.partId, Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-10 h-6 rounded border border-[var(--color-panel-border)] bg-transparent text-center text-xs text-[var(--color-text)]"
                      min={1}
                    />
                    <button onClick={() => setQty(p.partId, qty + 1)} className="w-6 h-6 rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs hover:bg-white/10">+</button>
                  </div>
                )}
              </div>
            );
          })}
          {parts.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No parts available for this type.</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-sm min-h-[40px]">Cancel</button>
          <button onClick={handleConfirm} className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[40px] hover:opacity-90">Apply ({checked.size} parts)</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main TraitEditorPopover Component ──────────────────────────────────────

interface TraitEditorPopoverProps {
  trait: TraitDefinition;
  decoded: string;
  onDecodedChange: (newDecoded: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onLockToggle: () => void;
  anchorRect?: DOMRect | null;
  /** Database parts for this trait's typeId — for the part picker */
  dbParts?: DbPartOption[];
}

export default function TraitEditorPopover({
  trait,
  decoded,
  onDecodedChange,
  onClose,
  onDelete,
  onLockToggle,
  anchorRect,
  dbParts,
}: TraitEditorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [showDbPicker, setShowDbPicker] = useState(false);
  const [localStackCount, setLocalStackCount] = useState(trait.stackCount || 0);
  const [modified, setModified] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Swap handler (for single/cycle traits like element) ──
  const handleSwap = useCallback((newPartId: number) => {
    if (trait.kind !== "single" || !trait.tokens.length) return;
    const oldToken = trait.tokens[0];
    const newRaw = `{${trait.typeId}:${newPartId}}`;
    const newDecoded = replaceTokenInDecoded(decoded, oldToken.raw, newRaw);
    setModified(true);
    onDecodedChange(newDecoded);
  }, [trait, decoded, onDecodedChange]);

  // ── Change a single part's stack count ──
  const handleSinglePartStackChange = useCallback((targetPartId: number, newCount: number) => {
    if (trait.kind !== "stacked" || !trait.tokens.length) return;
    const currentParts = trait.currentPartIds || [];
    if (currentParts.length === 0) return;

    // Build new parts array: keep all other parts, set target to newCount
    const newParts: number[] = [];
    const seen = new Set<number>();
    for (const pid of currentParts) {
      if (pid === targetPartId) {
        if (!seen.has(pid)) {
          seen.add(pid);
          for (let i = 0; i < Math.max(0, newCount); i++) newParts.push(pid);
        }
      } else {
        newParts.push(pid);
      }
    }
    // If target wasn't in currentParts but newCount > 0, add it
    if (!seen.has(targetPartId) && newCount > 0) {
      for (let i = 0; i < newCount; i++) newParts.push(targetPartId);
    }

    if (newParts.length === 0) return; // Don't allow empty

    setLocalStackCount(newParts.length);
    rebuildTraitToken(newParts);
  }, [trait, decoded, onDecodedChange]);

  // ── Remove a single part entirely ──
  const handleRemovePart = useCallback((targetPartId: number) => {
    if (trait.kind !== "stacked" || !trait.tokens.length) return;
    const currentParts = trait.currentPartIds || [];
    const newParts = currentParts.filter((pid) => pid !== targetPartId);
    if (newParts.length === 0) return; // Don't allow empty — use delete trait instead

    setLocalStackCount(newParts.length);
    if (selectedPartId === targetPartId) setSelectedPartId(null);
    rebuildTraitToken(newParts);
  }, [trait, decoded, onDecodedChange, selectedPartId]);

  // ── Shared rebuild helper ──
  const rebuildTraitToken = useCallback((newParts: number[]) => {
    if (trait.id === "heavy-accessories") {
      // Heavy: rebuild per-type, proportional
      const currentParts = trait.currentPartIds || [];
      const totalOld = currentParts.length;
      let result = decoded;
      for (const token of trait.tokens) {
        // Find which of the new parts belong to this token's type
        const tokenPartIds = token.partIds;
        const uniqueInToken = [...new Set(tokenPartIds)];
        const newForToken: number[] = newParts.filter((pid) => uniqueInToken.includes(pid));
        if (newForToken.length > 0) {
          const newRaw = buildStackedToken(token.typeId, newForToken);
          result = result.replace(token.raw, newRaw);
        } else {
          result = result.replace(token.raw, "");
        }
      }
      result = result.replace(/\s{2,}/g, " ").trim();
      setModified(true);
      onDecodedChange(result);
      return;
    }

    // Single type: merge all tokens into one
    const firstToken = trait.tokens[0];
    let result = decoded;
    for (let i = trait.tokens.length - 1; i > 0; i--) {
      result = result.replace(trait.tokens[i].raw, "");
    }
    const newRaw = buildStackedToken(firstToken.typeId, newParts);
    result = result.replace(firstToken.raw, newRaw);
    result = result.replace(/\s{2,}/g, " ").trim();
    setModified(true);
    onDecodedChange(result);
  }, [trait, decoded, onDecodedChange]);

  // ── Database part picker confirm ──
  const handleDbPickerConfirm = useCallback((selections: { partId: number; qty: number }[]) => {
    if (trait.kind === "binary") {
      setShowDbPicker(false);
      return;
    }

    // Build new part IDs array
    const newPartIds: number[] = [];
    for (const { partId, qty } of selections) {
      for (let i = 0; i < qty; i++) {
        newPartIds.push(partId);
      }
    }

    if (newPartIds.length === 0) {
      setShowDbPicker(false);
      return;
    }

    const typeId = trait.typeId || (trait.tokens[0]?.typeId ?? 0);
    if (typeId === 0 && trait.id === "heavy-accessories") {
      // Heavy: use first token's typeId
      const tid = trait.tokens[0]?.typeId || 273;
      const newRaw = buildStackedToken(tid, newPartIds);
      let result = decoded;
      // Remove all existing heavy tokens
      for (const token of trait.tokens) {
        result = result.replace(token.raw, "");
      }
      // Add new one before last |
      const lastPipe = result.lastIndexOf("|");
      if (lastPipe > 0 && result[lastPipe - 1] !== "|") {
        result = result.slice(0, lastPipe) + " " + newRaw + " " + result.slice(lastPipe);
      } else {
        result += " " + newRaw;
      }
      result = result.replace(/\s{2,}/g, " ").trim();
      setModified(true);
      onDecodedChange(result);
    } else {
      // Standard: rebuild the token block
      const newRaw = buildStackedToken(typeId, newPartIds);
      let result = decoded;
      if (trait.tokens.length > 0) {
        // Remove all existing tokens, replace with new
        for (let i = trait.tokens.length - 1; i > 0; i--) {
          result = result.replace(trait.tokens[i].raw, "");
        }
        result = result.replace(trait.tokens[0].raw, newRaw);
      } else {
        // No existing tokens, add new
        const lastPipe = result.lastIndexOf("|");
        if (lastPipe > 0 && result[lastPipe - 1] !== "|") {
          result = result.slice(0, lastPipe) + " " + newRaw + " " + result.slice(lastPipe);
        } else {
          result += " " + newRaw;
        }
      }
      result = result.replace(/\s{2,}/g, " ").trim();
      setModified(true);
      setLocalStackCount(newPartIds.length);
      onDecodedChange(result);
    }

    setShowDbPicker(false);
  }, [trait, decoded, onDecodedChange]);

  // ── Undo to original ──
  const handleUndo = useCallback(() => {
    if (!trait.originalTokens || trait.originalTokens.length === 0) return;
    // Rebuild decoded with original tokens
    let result = decoded;
    // Remove current tokens
    for (const token of trait.tokens) {
      result = result.replace(token.raw, "");
    }
    // Re-insert originals
    for (const token of trait.originalTokens) {
      const lastPipe = result.lastIndexOf("|");
      if (lastPipe > 0 && result[lastPipe - 1] !== "|") {
        result = result.slice(0, lastPipe) + " " + token.raw + " " + result.slice(lastPipe);
      } else {
        result += " " + token.raw;
      }
    }
    result = result.replace(/\s{2,}/g, " ").trim();
    setModified(false);
    onDecodedChange(result);
  }, [trait, decoded, onDecodedChange]);

  // Position popover
  const style: React.CSSProperties = {};
  if (anchorRect) {
    // Position below the badge, centered
    style.position = "fixed";
    style.top = anchorRect.bottom + 8;
    style.left = Math.max(8, anchorRect.left + anchorRect.width / 2 - 160);
    style.zIndex = 55;
    // Keep on screen
    if (typeof window !== "undefined") {
      if (style.top as number > window.innerHeight - 300) {
        style.top = anchorRect.top - 8;
        style.transform = "translateY(-100%)";
      }
      if ((style.left as number) + 320 > window.innerWidth) {
        style.left = window.innerWidth - 328;
      }
    }
  }

  // Perk summary for stacked traits
  const perkSummary = useMemo(() => {
    if (trait.kind !== "stacked" || !trait.currentPartIds) return [];
    const counts = new Map<number, number>();
    for (const pid of trait.currentPartIds) {
      counts.set(pid, (counts.get(pid) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([pid, count]) => {
      const dbPart = dbParts?.find((p) => p.partId === pid);
      return { partId: pid, count, label: dbPart?.label || `Part ${pid}`, effect: dbPart?.effect };
    });
  }, [trait, dbParts]);

  return (
    <>
      <div
        ref={popoverRef}
        style={style.position ? style : undefined}
        className={`${style.position ? "" : "absolute left-0 top-full mt-2 z-[55]"} w-[320px] rounded-xl border border-[var(--color-panel-border)] bg-[rgba(18,22,28,0.98)] shadow-2xl backdrop-blur-lg overflow-hidden`}
      >
        {/* ── Top: Identity + Actions ── */}
        <div className="px-3 py-2.5 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${trait.color}`}>
              {trait.label}
            </span>
            {modified && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" title="Modified from generated default" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {modified && (
              <button onClick={handleUndo} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-white/5 transition-colors" title="Undo changes">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h7a3 3 0 1 1 0 6H9M3 7l3-3M3 7l3 3" /></svg>
              </button>
            )}
            <button onClick={onLockToggle} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${trait.locked ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5"}`} title={trait.locked ? "Unlock (will randomize on re-roll)" : "Lock (keep on re-roll)"}>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                {trait.locked
                  ? <><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></>
                  : <><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0" /></>
                }
              </svg>
            </button>
            <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Remove trait from code">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
        </div>

        {/* ── Middle: Swap Picker (for cyclable traits) ── */}
        {trait.kind === "single" && trait.alternatives && (
          <div className="px-3 py-2 border-b border-[var(--color-panel-border)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Swap</p>
            <div className="flex flex-wrap gap-1.5">
              {trait.alternatives.map((alt) => (
                <button
                  key={alt.partId}
                  onClick={() => handleSwap(alt.partId)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    alt.partId === trait.currentPartId
                      ? `${alt.color || trait.color} ring-1 ring-white/20`
                      : "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)] hover:bg-white/10"
                  }`}
                >
                  {alt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Bottom: Selectable Parts + Per-Part Slider ── */}
        {trait.kind === "stacked" && (
          <div className="px-3 py-2 space-y-2">
            {/* Total count display */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Parts Breakdown</p>
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">Total: {localStackCount}</span>
            </div>

            {/* Selectable part rows */}
            {perkSummary.length > 0 && (
              <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
                {perkSummary.map((p) => (
                  <div key={p.partId} className="rounded-lg border border-transparent hover:border-[var(--color-panel-border)] px-2 py-1">
                    {/* Part name + count + remove */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--color-accent)]" />
                      <span className="text-[var(--color-text)] truncate flex-1" title={p.effect || p.label}>{p.label}</span>
                      <button
                        onClick={() => handleRemovePart(p.partId)}
                        className="w-5 h-5 rounded flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                        title={`Remove all ${p.label}`}
                      >
                        <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                      </button>
                    </div>
                    {/* Inline controls: - slider number + */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        onClick={() => handleSinglePartStackChange(p.partId, Math.max(1, p.count - 1))}
                        className="w-6 h-6 rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs hover:bg-white/10 flex items-center justify-center flex-shrink-0"
                      >-</button>
                      <input
                        type="range"
                        value={p.count}
                        min={1}
                        max={trait.stackMax || 300}
                        onChange={(e) => handleSinglePartStackChange(p.partId, parseInt(e.target.value))}
                        className="flex-1 h-8 cursor-pointer touch-manipulation"
                        style={{ accentColor: "var(--color-accent)" }}
                      />
                      <input
                        type="number"
                        value={p.count}
                        onChange={(e) => handleSinglePartStackChange(p.partId, Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 h-6 rounded border border-[var(--color-panel-border)] bg-transparent text-center text-[10px] text-[var(--color-text)] font-mono flex-shrink-0"
                        min={1}
                        max={trait.stackMax || 300}
                      />
                      <button
                        onClick={() => handleSinglePartStackChange(p.partId, p.count + 1)}
                        className="w-6 h-6 rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs hover:bg-white/10 flex items-center justify-center flex-shrink-0"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Open database picker to add more parts */}
            <button
              onClick={() => setShowDbPicker(true)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs hover:bg-white/5 hover:text-[var(--color-text)] transition-colors min-h-[36px] flex items-center justify-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
              Browse Database Parts
            </button>
          </div>
        )}

        {/* Binary trait — just shows info */}
        {trait.kind === "binary" && (
          <div className="px-3 py-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              This trait is either present or not. Use the <span className="text-red-400">×</span> button to remove it, or lock it to keep it on re-rolls.
            </p>
          </div>
        )}
      </div>

      {/* Database Part Picker modal */}
      {showDbPicker && (
        <DatabasePartPicker
          parts={dbParts || []}
          selectedIds={trait.currentPartIds || (trait.currentPartId ? [trait.currentPartId] : [])}
          onConfirm={handleDbPickerConfirm}
          onClose={() => setShowDbPicker(false)}
        />
      )}
    </>
  );
}

// ─── Interactive Badge Row Component ────────────────────────────────────────

interface InteractiveBadgeRowProps {
  traits: TraitDefinition[];
  decoded: string;
  onDecodedChange: (newDecoded: string) => void;
  lockedTraitIds: Set<string>;
  onToggleLock: (traitId: string) => void;
  dbPartsMap?: Map<number, DbPartOption[]>;
}

export function InteractiveBadgeRow({
  traits,
  decoded,
  onDecodedChange,
  lockedTraitIds,
  onToggleLock,
  dbPartsMap,
}: InteractiveBadgeRowProps) {
  const [openTraitId, setOpenTraitId] = useState<string | null>(null);
  const [showAddTrait, setShowAddTrait] = useState(false);
  const badgeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const existingTraitIds = useMemo(() => new Set(traits.map((t) => t.id)), [traits]);

  const handleDelete = useCallback((trait: TraitDefinition) => {
    const newDecoded = removeTraitFromDecoded(decoded, trait);
    setOpenTraitId(null);
    onDecodedChange(newDecoded);
  }, [decoded, onDecodedChange]);

  const handleAddTrait = useCallback((template: typeof ALL_TRAIT_TEMPLATES[0]) => {
    const newDecoded = addTraitToDecoded(decoded, template);
    setShowAddTrait(false);
    onDecodedChange(newDecoded);
  }, [decoded, onDecodedChange]);

  const getAnchorRect = (traitId: string): DOMRect | null => {
    const el = badgeRefs.current.get(traitId);
    return el ? el.getBoundingClientRect() : null;
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center">
        {traits.map((trait) => {
          const isOpen = openTraitId === trait.id;
          const isLocked = lockedTraitIds.has(trait.id);
          const traitWithLock = { ...trait, locked: isLocked };

          return (
            <div key={trait.id} className="relative">
              <button
                ref={(el) => { if (el) badgeRefs.current.set(trait.id, el); }}
                onClick={() => setOpenTraitId(isOpen ? null : trait.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer select-none ${trait.color} ${isOpen ? "ring-1 ring-white/20 scale-105" : "hover:scale-105"} ${trait.modified ? "shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.3)]" : ""}`}
              >
                {isLocked && (
                  <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" />
                  </svg>
                )}
                {trait.label}
                {trait.kind === "stacked" && trait.stackCount && (
                  <span className="opacity-60">×{trait.stackCount}</span>
                )}
              </button>

              {isOpen && (
                <TraitEditorPopover
                  trait={traitWithLock}
                  decoded={decoded}
                  onDecodedChange={(newDecoded) => {
                    onDecodedChange(newDecoded);
                  }}
                  onClose={() => setOpenTraitId(null)}
                  onDelete={() => handleDelete(trait)}
                  onLockToggle={() => onToggleLock(trait.id)}
                  anchorRect={getAnchorRect(trait.id)}
                  dbParts={(() => {
                    if (!dbPartsMap) return [];
                    if (trait.id === "heavy-accessories") {
                      // Merge parts from all heavy typeIds
                      return [...(dbPartsMap.get(273) || []), ...(dbPartsMap.get(275) || []), ...(dbPartsMap.get(282) || [])];
                    }
                    return dbPartsMap.get(trait.typeId) || [];
                  })()}
                />
              )}
            </div>
          );
        })}

        {/* Add Trait (+) button */}
        <div className="relative">
          <button
            onClick={() => setShowAddTrait(!showAddTrait)}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/40 transition-colors text-xs"
            title="Add a trait"
          >
            +
          </button>
          {showAddTrait && (
            <div className="absolute left-0 top-full mt-1 z-[55] w-56 rounded-xl border border-[var(--color-panel-border)] bg-[rgba(18,22,28,0.98)] shadow-2xl py-1">
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Add Trait</p>
              {ALL_TRAIT_TEMPLATES.filter((t) => !existingTraitIds.has(t.id)).map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleAddTrait(template)}
                  className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-white/5 flex items-center gap-2"
                >
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${template.color}`}>
                    {template.label}
                  </span>
                </button>
              ))}
              {ALL_TRAIT_TEMPLATES.filter((t) => !existingTraitIds.has(t.id)).length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">All traits are already present.</p>
              )}
              <div className="border-t border-[var(--color-panel-border)] mt-1 pt-1">
                <button onClick={() => setShowAddTrait(false)} className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-white/5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
