/**
 * Shared floating hover card for part details.
 * Shown when hovering over part rows, slots, or build list items.
 * pointer-events: none — never blocks interaction.
 */

export interface HoverCardData {
  code: string;
  name: string;
  effect?: string;
  manufacturer?: string;
  partType?: string;
  modelName?: string;
  weaponType?: string;
  rarity?: string;
  category?: string;
}

// ── Rarity theme ──────────────────────────────────────────────────────────────

const RARITY_THEMES: Record<string, {
  border: string; badge: string; badgeText: string; label: string; headerGrad: string;
}> = {
  pearl:     { border: "border-sky-400/70",                   badge: "bg-sky-400/20 border border-sky-400/50",     badgeText: "text-sky-300",    label: "Pearlescent", headerGrad: "from-sky-500/20 via-cyan-400/10 to-transparent" },
  legendary: { border: "border-[var(--color-legendary)]/60",  badge: "bg-amber-400/20 border border-amber-400/50", badgeText: "text-amber-300",  label: "Legendary",   headerGrad: "from-amber-500/20 via-yellow-400/10 to-transparent" },
  epic:      { border: "border-purple-400/60",                badge: "bg-purple-400/20 border border-purple-400/50",badgeText: "text-purple-300", label: "Epic",        headerGrad: "from-purple-500/15 to-transparent" },
  rare:      { border: "border-blue-400/60",                  badge: "bg-blue-400/20 border border-blue-400/50",   badgeText: "text-blue-300",   label: "Rare",        headerGrad: "from-blue-500/12 to-transparent" },
  uncommon:  { border: "border-emerald-400/50",               badge: "bg-emerald-400/20 border border-emerald-400/50", badgeText: "text-emerald-300", label: "Uncommon", headerGrad: "from-emerald-500/10 to-transparent" },
  common:    { border: "border-[var(--color-panel-border)]",  badge: "bg-[rgba(255,255,255,0.06)] border border-[var(--color-panel-border)]", badgeText: "text-[var(--color-text-muted)]", label: "Common", headerGrad: "from-[var(--color-accent)]/5 to-transparent" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Weapon:      "bg-orange-400/15 text-orange-300 border border-orange-400/30",
  Shield:      "bg-cyan-400/15 text-cyan-300 border border-cyan-400/30",
  Grenade:     "bg-red-400/15 text-red-300 border border-red-400/30",
  Repkit:      "bg-teal-400/15 text-teal-300 border border-teal-400/30",
  Heavy:       "bg-rose-400/15 text-rose-300 border border-rose-400/30",
  Enhancement: "bg-violet-400/15 text-violet-300 border border-violet-400/30",
  "Class Mod": "bg-amber-400/15 text-amber-300 border border-amber-400/30",
};

function resolveTheme(rarity: string | undefined) {
  const r = (rarity ?? "").toLowerCase();
  if (r === "pearl" || r === "pearlescent") return RARITY_THEMES.pearl;
  if (r === "legendary") return RARITY_THEMES.legendary;
  if (r === "epic") return RARITY_THEMES.epic;
  if (r === "rare") return RARITY_THEMES.rare;
  if (r === "uncommon") return RARITY_THEMES.uncommon;
  return RARITY_THEMES.common;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PartHoverCardProps {
  data: HoverCardData | null;
  /** Top px from getBoundingClientRect of the hovered element */
  cardTop: number;
  /**
   * Which side to anchor the card on.
   * "right" (default) = fixed right-4 (main content areas)
   * "left"            = fixed left-4  (right-side panels / sidebar)
   */
  side?: "right" | "left";
}

export default function PartHoverCard({ data, cardTop, side = "right" }: PartHoverCardProps) {
  if (!data) return null;

  const theme = resolveTheme(data.rarity);
  const isLeg = data.rarity?.toLowerCase() === "legendary";
  const isPearl = data.rarity?.toLowerCase() === "pearl" || data.rarity?.toLowerCase() === "pearlescent";
  const catColor = data.category
    ? (CATEGORY_COLORS[data.category] ?? "bg-[rgba(255,255,255,0.06)] text-[var(--color-text-muted)] border border-[var(--color-panel-border)]")
    : "";

  // Position the card at top of viewport to avoid blocking qty selectors and other controls
  const clampedTop = Math.min(Math.max(72, cardTop - 200), window.innerHeight - 430);
  const posClass = side === "left" ? "left-4" : "right-4";

  return (
    <div
      className={`fixed ${posClass} z-[150] w-72 rounded-2xl border ${theme.border} bg-[rgba(18,21,27,0.97)] shadow-2xl overflow-hidden pointer-events-none`}
      style={{ top: clampedTop, transition: "top 0.08s ease" }}
    >
      {/* Gradient header strip */}
      <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${theme.headerGrad} pointer-events-none`} />

      <div className="relative px-4 pt-4 pb-3 space-y-3">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {data.rarity && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.badge} ${theme.badgeText}`}>
              {theme.label}
            </span>
          )}
          {data.category && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${catColor}`}>
              {data.category}
            </span>
          )}
          {data.weaponType && data.weaponType.toLowerCase() !== (data.category ?? "").toLowerCase() && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)] border border-[var(--color-panel-border)]">
              {data.weaponType}
            </span>
          )}
        </div>

        {/* Name + manufacturer */}
        <div>
          <p className={`text-sm font-bold leading-tight break-words ${isLeg || isPearl ? theme.badgeText : "text-[var(--color-text)]"}`}>
            {data.name}
          </p>
          {data.manufacturer && (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{data.manufacturer}</p>
          )}
        </div>

        {/* Code */}
        {data.code && (
          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.35)] px-3 py-2">
            <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mb-0.5">Part code</p>
            <p className={`font-mono text-xs font-semibold break-all ${isLeg || isPearl ? theme.badgeText : "text-[var(--color-accent)]"}`}>
              {data.code}
            </p>
          </div>
        )}

        {/* Details grid */}
        {(data.partType || data.modelName) && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {data.partType && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">Part type</p>
                <p className="text-xs text-[var(--color-text)] font-mono leading-snug">{data.partType}</p>
              </div>
            )}
            {data.modelName && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">Item type</p>
                <p className="text-xs text-[var(--color-text)] font-mono leading-snug">{data.modelName}</p>
              </div>
            )}
          </div>
        )}

        {/* Effect */}
        {data.effect && data.effect !== "—" && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Effect / Stats</p>
            <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.25)] px-3 py-2">
              {data.effect.split("\n").map((line, i) => (
                <p key={i} className={`text-xs leading-relaxed ${i > 0 ? "mt-1" : ""} ${line.startsWith('"') ? "text-red-400/80 italic text-[10px]" : line.startsWith("Perk:") ? "text-amber-300 font-semibold" : "text-[var(--color-text)]"}`}>{line}</p>
              ))}
            </div>
          </div>
        )}

        <p className="text-[9px] text-[var(--color-text-muted)] text-center pt-0.5">
          {data.code ? "Click code to copy with quantity" : "Hover to preview"}
        </p>
      </div>
    </div>
  );
}
