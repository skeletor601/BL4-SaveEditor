/**
 * Hover card for Class Mod names (Elementalist, Dancer, Teen Witch, etc.)
 * Appears on hover; data is static (no API call needed).
 * Matches the PartHoverCard fixed-position floating style.
 */

const CHARACTER_BORDER: Record<string, string> = {
  Amon:    "border-orange-500/50",
  Harlowe: "border-cyan-500/50",
  Rafa:    "border-green-500/50",
  Vex:     "border-purple-500/50",
};

const CHARACTER_GRAD: Record<string, string> = {
  Amon:    "from-orange-500/15 to-transparent",
  Harlowe: "from-cyan-500/15 to-transparent",
  Rafa:    "from-green-500/15 to-transparent",
  Vex:     "from-purple-500/15 to-transparent",
};

const CHARACTER_BADGE: Record<string, string> = {
  Amon:    "bg-orange-500/20 border-orange-500/40 text-orange-300",
  Harlowe: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300",
  Rafa:    "bg-green-500/20 border-green-500/40 text-green-300",
  Vex:     "bg-purple-500/20 border-purple-500/40 text-purple-300",
};

const CHARACTER_NAME_COLOR: Record<string, string> = {
  Amon:    "text-orange-200",
  Harlowe: "text-cyan-200",
  Rafa:    "text-green-200",
  Vex:     "text-purple-200",
};

export interface ClassModNameCardData {
  name: string;
  character: string;
  description: string;
  cardTop: number;
}

interface Props {
  data: ClassModNameCardData | null;
}

export default function ClassModNameHoverCard({ data }: Props) {
  if (!data) return null;

  const border  = CHARACTER_BORDER[data.character]  ?? "border-[var(--color-panel-border)]";
  const grad    = CHARACTER_GRAD[data.character]    ?? "from-[var(--color-accent)]/5 to-transparent";
  const badge   = CHARACTER_BADGE[data.character]   ?? "bg-white/10 border-white/20 text-white";
  const nameClr = CHARACTER_NAME_COLOR[data.character] ?? "text-[var(--color-text)]";

  const clampedTop = typeof window !== "undefined"
    ? Math.min(Math.max(data.cardTop - 8, 72), window.innerHeight - 260)
    : data.cardTop;

  return (
    <div
      className={`fixed right-4 z-[150] w-72 rounded-2xl border-2 ${border} bg-[rgba(18,21,27,0.97)] shadow-2xl overflow-hidden pointer-events-none`}
      style={{ top: clampedTop, transition: "top 0.08s ease" }}
    >
      {/* Gradient header strip */}
      <div className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${grad} pointer-events-none`} />

      <div className="relative px-4 pt-4 pb-4 space-y-3">
        {/* Character badge */}
        <div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge}`}>
            {data.character}
          </span>
        </div>

        {/* Mod name */}
        <p className={`text-base font-bold leading-tight ${nameClr}`}>{data.name}</p>

        {/* Description box */}
        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.3)] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">Class Mod Effect</p>
          <p className="text-xs text-[var(--color-text)] leading-relaxed">{data.description}</p>
        </div>
      </div>
    </div>
  );
}
