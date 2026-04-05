/**
 * Specialization Tree Editor — view and edit spec point allocations in save files.
 * 7 trees, each with a base node (points 0-100) and 3 perks (unlocked at 1/10/20 pts).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchApi } from "@/lib/apiClient";
import { useSave } from "@/contexts/SaveContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface SpecPerk {
  slot: string;
  skillRef: string;
  name: string;
  unlockPoints: number;
  description: string;
  effects: string;
  icon: string;
}

interface SpecTree {
  id: number;
  internalName: string;
  displayName: string;
  maxrollSlug: string;
  icon: string;
  description: string;
  baseEffect: string;
  perks: SpecPerk[];
}

interface SpecData {
  trees: SpecTree[];
}

interface SaveSpecs {
  treePoints: Record<string, number>;
  activeSkills: string[];
  slottedSkills: (string | null)[];
  totalPool: number;
  pointsSpent: number;
  pointsAvailable: number;
}

// ── Tree colors ────────────────────────────────────────────────────────────
const TREE_COLORS: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  Survivor:     { border: "border-blue-500/40",    bg: "bg-blue-500/10",    text: "text-blue-400",    glow: "rgba(59,130,246,0.3)" },
  Gadgeteer:    { border: "border-amber-500/40",   bg: "bg-amber-500/10",   text: "text-amber-400",   glow: "rgba(245,158,11,0.3)" },
  Brute:        { border: "border-red-500/40",     bg: "bg-red-500/10",     text: "text-red-400",     glow: "rgba(239,68,68,0.3)" },
  Sharpshooter: { border: "border-purple-500/40",  bg: "bg-purple-500/10",  text: "text-purple-400",  glow: "rgba(168,85,247,0.3)" },
  Killer:       { border: "border-yellow-500/40",  bg: "bg-yellow-500/10",  text: "text-yellow-400",  glow: "rgba(234,179,8,0.3)" },
  Daredevil:    { border: "border-cyan-500/40",    bg: "bg-cyan-500/10",    text: "text-cyan-400",    glow: "rgba(6,182,212,0.3)" },
  Runner:       { border: "border-green-500/40",   bg: "bg-green-500/10",   text: "text-green-400",   glow: "rgba(34,197,94,0.3)" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function SpecializationsPage() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [specData, setSpecData] = useState<SpecData | null>(null);
  const [saveSpecs, setSaveSpecs] = useState<SaveSpecs | null>(null);
  const [treePoints, setTreePoints] = useState<Record<string, number>>({});
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set());
  const [slottedSkills, setSlottedSkills] = useState<(string | null)[]>([null, null, null, null]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hoveredPerk, setHoveredPerk] = useState<SpecPerk | null>(null);

  // Load spec definitions
  useEffect(() => {
    fetch("/data/specializations.json")
      .then(r => r.json())
      .then((d: SpecData) => setSpecData(d))
      .catch(() => setMessage("Failed to load specialization data"));
  }, []);

  // Load current specs from save
  useEffect(() => {
    if (!saveData) return;
    const yaml = getYamlText();
    if (!yaml) return;

    fetchApi("save/get-specs", {
      method: "POST",
      body: JSON.stringify({ yaml_content: yaml }),
    })
      .then(r => r.json())
      .then((d: { success: boolean; specs?: SaveSpecs }) => {
        if (d.success && d.specs) {
          setSaveSpecs(d.specs);
          setTreePoints(d.specs.treePoints);
          setActiveSkills(new Set(d.specs.activeSkills));
          setSlottedSkills(d.specs.slottedSkills ?? [null, null, null, null]);
        }
      })
      .catch(() => {});
  }, [saveData, getYamlText]);

  const totalSpent = useMemo(() => Object.values(treePoints).reduce((a, b) => a + b, 0), [treePoints]);
  const totalPool = saveSpecs?.totalPool ?? 700;
  const available = totalPool - totalSpent;

  const handlePointChange = useCallback((internalName: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    setTreePoints(prev => ({ ...prev, [internalName]: clamped }));
  }, []);

  const toggleSkill = useCallback((slot: string) => {
    setActiveSkills(prev => {
      const next = new Set(prev);
      if (next.has(slot)) {
        next.delete(slot);
        // Also remove from slotted if it was slotted
        setSlottedSkills(s => s.map(s => s === slot ? null : s));
      } else {
        next.add(slot);
      }
      return next;
    });
  }, []);

  const toggleSlotted = useCallback((slot: string) => {
    setSlottedSkills(prev => {
      // If already slotted, remove it
      const existingIdx = prev.indexOf(slot);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = null;
        return next;
      }
      // Find first empty slot
      const emptyIdx = prev.indexOf(null);
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = slot;
        return next;
      }
      // All 4 slots full — replace the last one
      const next = [...prev];
      next[3] = slot;
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const yaml = getYamlText();
    if (!yaml) { setMessage("Load a save file first"); return; }

    setLoading(true);
    setMessage(null);
    try {
      const res = await fetchApi("save/set-specs", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yaml,
          tree_points: treePoints,
          active_skills: Array.from(activeSkills),
          slotted_skills: slottedSkills,
          total_pool: totalPool,
        }),
      });
      const data = await res.json();
      if (data.success && data.yaml_content) {
        const { parse } = await import("yaml");
        updateSaveData(parse(data.yaml_content) as Record<string, unknown>);
        setMessage("Specializations saved to YAML! Use 'Overwrite Save' to export.");
      } else {
        setMessage(data.error || "Save failed");
      }
    } catch {
      setMessage("Failed to save specializations");
    } finally {
      setLoading(false);
    }
  }, [getYamlText, treePoints, activeSkills, slottedSkills, totalPool, updateSaveData]);

  const handleMaxAll = useCallback(() => {
    if (!specData) return;
    const newPoints: Record<string, number> = {};
    for (const tree of specData.trees) {
      newPoints[tree.internalName] = 100;
    }
    setTreePoints(newPoints);
    // Activate all skills
    const allSkills = new Set<string>();
    const firstFour: string[] = [];
    for (const tree of specData.trees) {
      for (const perk of tree.perks) {
        allSkills.add(perk.slot);
        if (firstFour.length < 4) firstFour.push(perk.slot);
      }
    }
    setActiveSkills(allSkills);
    setSlottedSkills([firstFour[0] ?? null, firstFour[1] ?? null, firstFour[2] ?? null, firstFour[3] ?? null]);
  }, [specData]);

  const handleClear = useCallback(() => {
    if (!specData) return;
    const newPoints: Record<string, number> = {};
    for (const tree of specData.trees) {
      newPoints[tree.internalName] = 0;
    }
    setTreePoints(newPoints);
    setActiveSkills(new Set());
    setSlottedSkills([null, null, null, null]);
  }, [specData]);

  if (!specData) {
    return <div className="text-center text-[var(--color-text-muted)] py-12">Loading specialization data...</div>;
  }

  if (!saveData) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-muted)] mb-2">Load a save file to edit specializations.</p>
        <p className="text-xs text-[var(--color-text-muted)]/50">Go to Select Save tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-lg border border-[var(--color-panel-border)] p-3 bg-[rgba(24,28,34,0.8)]">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">Points Invested</span>
            <p className="text-lg font-bold text-[var(--color-accent)]">{totalSpent} <span className="text-xs text-[var(--color-text-muted)] font-normal">/ {totalPool}</span></p>
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">Available</span>
            <p className={`text-lg font-bold ${available < 0 ? "text-red-400" : "text-green-400"}`}>{available}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleMaxAll}
            className="px-3 py-2 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-400 text-xs font-bold hover:bg-purple-500/20">
            Max All (700)
          </button>
          <button type="button" onClick={handleClear}
            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs font-bold hover:text-red-400 hover:border-red-500/40">
            Clear All
          </button>
          <button type="button" onClick={handleSave} disabled={loading}
            className="px-4 py-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs font-bold hover:bg-[var(--color-accent)]/30 disabled:opacity-50">
            {loading ? "Saving..." : "Save to YAML"}
          </button>
        </div>
      </div>

      {/* Active Slots */}
      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-panel-border)] p-3 bg-[rgba(24,28,34,0.8)]">
        <span className="text-xs text-[var(--color-text-muted)] font-mono uppercase tracking-wider">4 Active Perks:</span>
        <div className="flex gap-2 flex-1">
          {slottedSkills.map((slot, i) => {
            const perkName = slot ? specData?.trees.flatMap(t => t.perks).find(p => p.slot === slot)?.name ?? slot : null;
            return (
              <div key={i} className={`flex-1 px-3 py-2 rounded-lg border text-center text-xs font-bold ${
                slot
                  ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-panel-border)]/30 text-[var(--color-text-muted)]/30"
              }`}>
                {perkName || `Slot ${i + 1}`}
              </div>
            );
          })}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border text-sm ${message.includes("saved") || message.includes("Saved") ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-red-500/40 bg-red-500/10 text-red-400"}`}>
          {message}
        </div>
      )}

      {/* Perk tooltip */}
      {hoveredPerk && (
        <div className="fixed top-4 right-4 z-50 w-80 rounded-xl border border-[var(--color-accent)]/40 bg-[rgba(18,21,27,0.97)] shadow-2xl p-4 pointer-events-none">
          <h4 className="text-sm font-bold text-[var(--color-accent)] mb-1">{hoveredPerk.name}</h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-2 leading-relaxed">{hoveredPerk.description}</p>
          {hoveredPerk.effects && (
            <div className="border-t border-[var(--color-panel-border)] pt-2 mt-2">
              {hoveredPerk.effects.split("|").map((eff, i) => (
                <p key={i} className="text-xs text-cyan-400">{eff.trim()}</p>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-muted)]/50 mt-2">Unlocks at {hoveredPerk.unlockPoints} points</p>
        </div>
      )}

      {/* Tree grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {specData.trees.map(tree => {
          const colors = TREE_COLORS[tree.displayName] || TREE_COLORS.Survivor;
          const pts = treePoints[tree.internalName] ?? 0;

          return (
            <div key={tree.id}
              className={`rounded-xl border ${colors.border} overflow-hidden transition-all`}
              style={{ backgroundColor: "rgba(18,21,27,0.7)" }}
            >
              {/* Tree header */}
              <div className="p-4 border-b border-[var(--color-panel-border)]/50 flex items-center gap-3">
                <img src={tree.icon} alt="" className="w-12 h-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-bold ${colors.text}`}>{tree.displayName}</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{tree.description}</p>
                </div>
              </div>

              {/* Point slider */}
              <div className="px-4 py-3 border-b border-[var(--color-panel-border)]/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Points</span>
                  <input
                    type="number"
                    min={0} max={100}
                    value={pts}
                    onChange={(e) => handlePointChange(tree.internalName, Number(e.target.value) || 0)}
                    className="w-14 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs text-center"
                  />
                </div>
                <input
                  type="range"
                  min={0} max={100}
                  value={pts}
                  onChange={(e) => handlePointChange(tree.internalName, Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${colors.glow} ${pts}%, rgba(255,255,255,0.06) ${pts}%)`,
                  }}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-[var(--color-text-muted)]">0</span>
                  <span className="text-[9px] text-[var(--color-text-muted)]">100</span>
                </div>
              </div>

              {/* Perks */}
              <div className="p-3 space-y-2">
                {tree.perks.map(perk => {
                  const unlocked = pts >= perk.unlockPoints;
                  const active = activeSkills.has(perk.slot);
                  const canActivate = unlocked;
                  const slotIdx = slottedSkills.indexOf(perk.slot);
                  const isSlotted = slotIdx >= 0;

                  return (
                    <div
                      key={perk.slot}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                        isSlotted
                          ? `border-[var(--color-accent)] bg-[var(--color-accent)]/10`
                          : active
                            ? `${colors.border} ${colors.bg}`
                            : unlocked
                              ? "border-[var(--color-panel-border)] hover:border-[var(--color-accent)]/40"
                              : "border-[var(--color-panel-border)]/30 opacity-40"
                      }`}
                      onMouseEnter={() => setHoveredPerk(perk)}
                      onMouseLeave={() => setHoveredPerk(null)}
                    >
                      <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden border border-[var(--color-panel-border)]/50 flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: active ? colors.glow : "rgba(0,0,0,0.3)" }}
                        onClick={() => canActivate && toggleSkill(perk.slot)}
                      >
                        <img src={perk.icon} alt="" className="w-full h-full object-contain"
                          style={{ filter: active ? "brightness(1.2)" : unlocked ? "brightness(0.8)" : "brightness(0.3)" }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => canActivate && toggleSkill(perk.slot)}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isSlotted ? "text-[var(--color-accent)]" : active ? colors.text : unlocked ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
                            {perk.name}
                          </span>
                          <span className="text-[9px] text-[var(--color-text-muted)]/50">
                            {perk.unlockPoints}pts
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)] truncate">{perk.effects || perk.description}</p>
                      </div>
                      {active && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSlotted(perk.slot); }}
                          className={`flex-shrink-0 px-2 py-1 rounded text-[9px] font-bold border transition-colors ${
                            isSlotted
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                              : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)]"
                          }`}
                          title={isSlotted ? `Active in slot ${slotIdx + 1} — click to unslot` : "Click to equip in active slot"}
                        >
                          {isSlotted ? `SLOT ${slotIdx + 1}` : "EQUIP"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
