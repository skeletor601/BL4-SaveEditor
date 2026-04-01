/**
 * BuildFromUrlModal V2: paste a Mobalytics URL → scrape gear + firmware +
 * skills + context from guide text → pick variant → review → generate stock items.
 */
import { useState, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";

// ── Types matching API response ─────────────────────────────────────────────

interface MobaGearSlot {
  slot: string;
  title: string;
  type: string;
  slug: string;
  iconUrl?: string;
}

interface MobaSkillAlloc { slug: string; level: number; }

interface MobaVariant {
  id: string;
  name: string;
  gear: MobaGearSlot[];
  firmware: MobaGearSlot[];
  enhancement: MobaGearSlot | null;
  specializations: MobaGearSlot[];
  skillTree: {
    actionSkill: string;
    capstone: string;
    augments: string[];
    skills: MobaSkillAlloc[];
  } | null;
}

interface BuildContext {
  weaponHints: {
    allElements: boolean;
    manufacturerParts: string[];
    underbarrel: string | null;
  };
  classModSkills: { name: string; level: number }[];
  enhancementStats: string[];
  enhancementPerks: string[];
  ordnanceHint: string | null;
  equipmentText: string;
  firmwareText: string;
}

interface MatchInfo {
  code: string; partName: string; partType: string; manufacturer: string;
  weaponType?: string; rarity: string; effect?: string; typeId: string; partId: string;
}

interface ResolvedItem {
  slot: string; mobaName: string; mobaType: string; category: string;
  confidence: "exact" | "fuzzy" | "not_found";
  match?: MatchInfo;
  alternatives?: { code: string; partName: string; manufacturer: string; score: number }[];
}

interface ScrapeResponse {
  buildName: string; character: string; url: string;
  variants: MobaVariant[];
  context: BuildContext;
  resolved: ResolvedItem[];
  rawSlotCount: number;
}

interface StockItem {
  slot: string; category: string; itemName: string; manufacturer: string;
  weaponType?: string; element?: string; decoded: string; typeId: string;
  confidence: "exact" | "fuzzy" | "not_found"; notes?: string;
}

interface AssembleResponse {
  buildName: string; character: string; variantName: string;
  items: StockItem[];
  skipped: { slot: string; reason: string }[];
}

// ── Props ───────────────────────────────────────────────────────────────────

interface BuildFromUrlModalProps {
  onClose: () => void;
  onLoadDecoded: (decoded: string, label: string) => void;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES = {
  exact: "bg-green-500/20 text-green-400 border-green-500/40",
  fuzzy: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  not_found: "bg-red-500/20 text-red-400 border-red-500/40",
} as const;
const CONFIDENCE_LABELS = { exact: "Exact", fuzzy: "Fuzzy", not_found: "Not Found" } as const;
const CATEGORY_ICONS: Record<string, string> = { Weapon: "W", Shield: "S", Grenade: "G", Repkit: "R", "Class Mod": "C" };

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "text-orange-400", Shock: "text-blue-400", Cryo: "text-cyan-300",
  Corrosive: "text-green-400", Radiation: "text-yellow-300",
};

// ── Component ───────────────────────────────────────────────────────────────

export default function BuildFromUrlModal({ onClose, onLoadDecoded }: BuildFromUrlModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResponse | null>(null);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [resolved, setResolved] = useState<ResolvedItem[]>([]);
  const [assembleResult, setAssembleResult] = useState<AssembleResponse | null>(null);
  const [level, setLevel] = useState(60);

  // ── Scrape ────────────────────────────────────────────────────────────
  const handleScrape = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true); setError(null); setScrapeResult(null); setAssembleResult(null);
    try {
      const res = await fetchApi("build-from-url/scrape", {
        method: "POST", body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data: ScrapeResponse = await res.json();
      setScrapeResult(data);
      setResolved(data.resolved || []);
      setSelectedVariantIdx(0);
    } catch (e: any) { setError(e.message || "Scrape failed"); }
    finally { setLoading(false); }
  }, [url]);

  // ── Switch variant ────────────────────────────────────────────────────
  const handleVariantSwitch = useCallback(async (idx: number) => {
    if (!scrapeResult) return;
    setSelectedVariantIdx(idx);
    setAssembleResult(null);
    const variant = scrapeResult.variants[idx];
    if (!variant) return;
    // Re-resolve for this variant's gear
    try {
      const res = await fetchApi("build-from-url/resolve", {
        method: "POST", body: JSON.stringify({ gear: variant.gear }),
      });
      if (res.ok) {
        const data = await res.json();
        setResolved(data.resolved || []);
      }
    } catch { /* keep existing resolved */ }
  }, [scrapeResult]);

  // ── Assemble ──────────────────────────────────────────────────────────
  const handleAssemble = useCallback(async () => {
    if (!scrapeResult) return;
    const variant = scrapeResult.variants[selectedVariantIdx];
    if (!variant) return;
    setLoading(true); setError(null);
    try {
      const res = await fetchApi("build-from-url/assemble", {
        method: "POST",
        body: JSON.stringify({
          buildName: scrapeResult.buildName,
          character: scrapeResult.character,
          variantName: variant.name,
          resolved,
          context: scrapeResult.context,
          firmware: variant.firmware,
          level,
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      setAssembleResult(await res.json());
    } catch (e: any) { setError(e.message || "Assembly failed"); }
    finally { setLoading(false); }
  }, [scrapeResult, selectedVariantIdx, resolved, level]);

  const handleLoadItem = useCallback((item: StockItem) => {
    const label = `${item.itemName}${item.element ? " " + item.element : ""} (${item.manufacturer})`;
    onLoadDecoded(item.decoded, label);
  }, [onLoadDecoded]);

  const handleLoadAll = useCallback(() => {
    if (!assembleResult) return;
    for (const item of assembleResult.items) handleLoadItem(item);
  }, [assembleResult, handleLoadItem]);

  const variant = scrapeResult?.variants[selectedVariantIdx];
  const ctx = scrapeResult?.context;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-[var(--color-panel-border)] bg-[var(--color-panel)]">
          <h2 className="text-lg font-bold text-[var(--color-accent)]">Build from URL</h2>
          <button type="button" onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
        </div>

        <div className="p-4 space-y-4">
          {/* URL Input */}
          {!scrapeResult && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                Paste a Mobalytics BL4 build URL to auto-generate stock gear with the guide's recommended parts, elements, skills, and firmware.
              </p>
              <div className="flex gap-2">
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mobalytics.gg/borderlands-4/builds/..."
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-muted)]/50 focus:border-[var(--color-accent)] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") handleScrape(); }}
                  disabled={loading} />
                <button type="button" onClick={handleScrape} disabled={loading || !url.trim()}
                  className="px-4 py-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Scraping..." : "Scrape"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
          )}

          {/* ── Review Step ────────────────────────────────────────────── */}
          {scrapeResult && !assembleResult && (
            <div className="space-y-4">
              {/* Build header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{scrapeResult.buildName}</h3>
                  {scrapeResult.character && (
                    <p className="text-xs text-[var(--color-text-muted)] capitalize">{scrapeResult.character}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setScrapeResult(null); setError(null); }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Back</button>
              </div>

              {/* Variant tabs */}
              {scrapeResult.variants.length > 1 && (
                <div className="flex gap-2">
                  {scrapeResult.variants.map((v, i) => (
                    <button key={v.id} type="button" onClick={() => handleVariantSwitch(i)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        i === selectedVariantIdx
                          ? "border-purple-500 bg-purple-500/20 text-purple-400"
                          : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-purple-500/40"
                      }`}>
                      {v.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Context clues from guide text */}
              {ctx && (ctx.weaponHints.allElements || ctx.weaponHints.manufacturerParts.length > 0 ||
                ctx.weaponHints.underbarrel || ctx.ordnanceHint || ctx.classModSkills.length > 0) && (
                <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-purple-400 font-mono">Parsed from guide</p>
                  {ctx.weaponHints.allElements && (
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="text-purple-400 font-medium">Elements:</span> All 5 elemental variants
                    </p>
                  )}
                  {ctx.weaponHints.manufacturerParts.length > 0 && (
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="text-purple-400 font-medium">Mfg Parts:</span>{" "}
                      {ctx.weaponHints.manufacturerParts.join(", ")}
                    </p>
                  )}
                  {ctx.weaponHints.underbarrel && (
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="text-purple-400 font-medium">Underbarrel:</span> {ctx.weaponHints.underbarrel}
                    </p>
                  )}
                  {ctx.ordnanceHint && (
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="text-purple-400 font-medium">Ordnance:</span> {ctx.ordnanceHint} (Penetrator augment)
                    </p>
                  )}
                  {ctx.classModSkills.length > 0 && (
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="text-purple-400 font-medium">CM Skills:</span>{" "}
                      {ctx.classModSkills.slice(0, 4).map(s => `+${s.level} ${s.name}`).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Firmware + Skills summary */}
              {variant && (
                <div className="grid grid-cols-2 gap-3">
                  {variant.firmware.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-bg)]/30">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] font-mono mb-1">Firmware</p>
                      {variant.firmware.map((f, i) => (
                        <p key={i} className="text-xs text-[var(--color-text)]">
                          <span className="text-[var(--color-text-muted)]">{f.slot.replace("-firmware", "")}:</span> {f.title}
                        </p>
                      ))}
                    </div>
                  )}
                  {variant.skillTree && (
                    <div className="p-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-bg)]/30">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] font-mono mb-1">Skill Tree</p>
                      <p className="text-xs text-[var(--color-text)]">
                        <span className="text-[var(--color-text-muted)]">Action:</span>{" "}
                        {variant.skillTree.actionSkill.replace(/-/g, " ")}
                      </p>
                      <p className="text-xs text-[var(--color-text)]">
                        <span className="text-[var(--color-text-muted)]">Capstone:</span>{" "}
                        {variant.skillTree.capstone.replace(/-/g, " ")}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {variant.skillTree.skills.length} skills allocated
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Resolved gear */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] font-mono">
                  Gear ({resolved.length} items)
                </p>
                {resolved.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-bg)]/50">
                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs font-bold">
                      {CATEGORY_ICONS[item.category] || "?"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)] truncate">{item.mobaName}</span>
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${CONFIDENCE_STYLES[item.confidence]}`}>
                          {CONFIDENCE_LABELS[item.confidence]}
                        </span>
                      </div>
                      {item.match && (
                        <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                          {item.match.partName} — {item.match.manufacturer}
                          {item.match.weaponType ? ` ${item.match.weaponType}` : ""}
                          {" "}<span className="opacity-60">{item.match.code}</span>
                        </p>
                      )}
                      {item.confidence === "not_found" && (
                        <p className="text-xs text-red-400/80 mt-0.5">Could not match in database</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-[10px] text-[var(--color-text-muted)] font-mono">{item.slot}</span>
                  </div>
                ))}
              </div>

              {/* Generate button */}
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-panel-border)]/50">
                <label className="text-xs text-[var(--color-text-muted)]">Level</label>
                <input type="number" min={1} max={60} value={level}
                  onChange={(e) => setLevel(Math.max(1, Math.min(60, Number(e.target.value) || 60)))}
                  className="w-16 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm text-center" />
                <div className="flex-1" />
                <button type="button" onClick={handleAssemble}
                  disabled={loading || resolved.every(g => g.confidence === "not_found")}
                  className="px-5 py-2.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-sm font-bold hover:bg-[var(--color-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Generating..." : "Generate Stock Items"}
                </button>
              </div>
            </div>
          )}

          {/* ── Assembly Results ────────────────────────────────────────── */}
          {assembleResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{assembleResult.buildName}</h3>
                  {assembleResult.variantName && (
                    <p className="text-xs text-purple-400">{assembleResult.variantName}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAssembleResult(null)}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Back</button>
                  <button type="button" onClick={handleLoadAll}
                    className="px-3 py-1.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs font-bold hover:bg-[var(--color-accent)]/30">
                    Load All to Builder
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)]">
                {assembleResult.items.length} items generated. Click Load to send each to the codec.
              </p>

              <div className="space-y-2">
                {assembleResult.items.map((item, i) => (
                  <div key={i} className="p-3 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-bg)]/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-[var(--color-panel-border)] text-[var(--color-text-muted)] text-[10px] font-bold">
                          {CATEGORY_ICONS[item.category] || "?"}
                        </span>
                        <span className="text-sm font-medium text-[var(--color-text)]">{item.itemName}</span>
                        {item.element && (
                          <span className={`text-xs font-bold ${ELEMENT_COLORS[item.element] || "text-[var(--color-text)]"}`}>
                            {item.element}
                          </span>
                        )}
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {item.manufacturer}{item.weaponType ? ` ${item.weaponType}` : ""}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${CONFIDENCE_STYLES[item.confidence]}`}>
                          {CONFIDENCE_LABELS[item.confidence]}
                        </span>
                      </div>
                      <button type="button" onClick={() => handleLoadItem(item)}
                        className="px-2 py-1 rounded border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-[10px] font-bold hover:bg-[var(--color-accent)]/20 flex-shrink-0">
                        Load
                      </button>
                    </div>
                    <div className="px-2 py-1.5 rounded bg-black/30 border border-[var(--color-panel-border)]/50 text-[11px] font-mono text-[var(--color-text-muted)] break-all select-all cursor-text"
                      onClick={(e) => {
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(e.currentTarget);
                        sel?.removeAllRanges(); sel?.addRange(range);
                      }}>
                      {item.decoded}
                    </div>
                  </div>
                ))}
              </div>

              {assembleResult.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] font-mono">
                    Skipped ({assembleResult.skipped.length})
                  </p>
                  {assembleResult.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-red-400/70">{s.slot}: {s.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
