/**
 * LayoutSwitcher — visual layout picker for the header bar.
 * Shows 5 mini wireframe thumbnails. Click to switch layout for the current page.
 * Hover for label tooltip.
 */
import { useState, useRef, useEffect } from "react";
import { useLayout, LAYOUTS, LAYOUT_META, type LayoutId } from "@/contexts/LayoutContext";

// ── Mini wireframe SVGs for each layout ─────────────────────────────────────

function MiniStandard({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 18" className="w-full h-full">
      <rect x="0" y="0" width="24" height="3" rx="0.5" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 1 : 0.4} />
      <rect x="0" y="4.5" width="24" height="13.5" rx="0.5" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.4 : 0.15} />
      <rect x="1.5" y="6" width="9" height="4" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.7 : 0.25} />
      <rect x="12" y="6" width="10.5" height="4" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.7 : 0.25} />
      <rect x="1.5" y="11.5" width="21" height="4" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.5 : 0.2} />
    </svg>
  );
}

function MiniTopNav({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 18" className="w-full h-full">
      <rect x="0" y="0" width="24" height="3" rx="0.5" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 1 : 0.4} />
      {/* Nav pills */}
      <rect x="1" y="0.8" width="3" height="1.4" rx="0.3" fill={active ? "#000" : "currentColor"} opacity={active ? 0.5 : 0.2} />
      <rect x="5" y="0.8" width="3" height="1.4" rx="0.3" fill={active ? "#000" : "currentColor"} opacity={active ? 0.5 : 0.2} />
      <rect x="9" y="0.8" width="3" height="1.4" rx="0.3" fill={active ? "#000" : "currentColor"} opacity={active ? 0.5 : 0.2} />
      <rect x="13" y="0.8" width="3" height="1.4" rx="0.3" fill={active ? "#000" : "currentColor"} opacity={active ? 0.5 : 0.2} />
      <rect x="0" y="4" width="24" height="14" rx="0.5" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.3 : 0.12} />
      <rect x="1" y="5.5" width="22" height="5" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.6 : 0.2} />
      <rect x="1" y="12" width="22" height="4.5" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.5 : 0.18} />
    </svg>
  );
}

function MiniCompact({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 18" className="w-full h-full">
      <rect x="0" y="0" width="24" height="2" rx="0.3" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 1 : 0.4} />
      {/* Dense grid */}
      {[0, 1, 2, 3].map(row => (
        [0, 1, 2].map(col => (
          <rect key={`${row}-${col}`} x={0.5 + col * 8} y={3 + row * 3.8} width="7" height="3" rx="0.2"
            fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.5 + row * 0.05 : 0.15 + row * 0.03} />
        ))
      ))}
    </svg>
  );
}

function MiniCinema({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 18" className="w-full h-full">
      <rect x="0" y="0" width="24" height="3.5" rx="0.8" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 1 : 0.4} />
      <rect x="3" y="5" width="18" height="5" rx="0.8" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.6 : 0.2} />
      <rect x="5" y="12" width="14" height="4" rx="0.8" fill={active ? "var(--color-accent)" : "currentColor"} opacity={active ? 0.4 : 0.15} />
    </svg>
  );
}

function MiniTerminal({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent)" : "currentColor";
  return (
    <svg viewBox="0 0 24 18" className="w-full h-full">
      <rect x="0" y="0" width="24" height="18" fill="none" stroke={c} strokeWidth="0.5" opacity={active ? 0.8 : 0.3} />
      <rect x="0" y="0" width="24" height="2.5" fill={c} opacity={active ? 0.8 : 0.3} />
      {/* Scan lines */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={i} x="1" y={4 + i * 2.2} width={10 + Math.sin(i) * 6} height="1" fill={c} opacity={active ? 0.6 : 0.2} />
      ))}
      {/* Cursor blink */}
      <rect x="1" y="15.5" width="2" height="1.2" fill={c} opacity={active ? 1 : 0.3} />
    </svg>
  );
}

const LAYOUT_PREVIEWS: Record<LayoutId, React.FC<{ active: boolean }>> = {
  standard: MiniStandard,
  topnav: MiniTopNav,
  compact: MiniCompact,
  cinema: MiniCinema,
  terminal: MiniTerminal,
};

// ── Switcher component ──────────────────────────────────────────────────────

export default function LayoutSwitcher() {
  const { layout, setLayout } = useLayout();
  const [showTooltip, setShowTooltip] = useState<LayoutId | null>(null);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors hover:bg-white/10"
        title="Change page layout"
      >
        <span className="text-[10px] font-mono tracking-widest text-[var(--color-text-muted)] hidden sm:inline">LAYOUT</span>
        <div className="w-6 h-[18px] text-[var(--color-text)]">
          {(() => { const P = LAYOUT_PREVIEWS[layout]; return <P active />; })()}
        </div>
      </button>

      {expanded && (
        <div
          className="absolute top-full right-0 mt-2 flex gap-1.5 p-2 rounded-lg border border-[var(--color-panel-border)] shadow-xl z-50"
          style={{ backgroundColor: "rgba(24, 28, 34, 0.98)" }}
        >
          {LAYOUTS.map(id => {
            const meta = LAYOUT_META[id];
            const Preview = LAYOUT_PREVIEWS[id];
            const isActive = layout === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setLayout(id); setExpanded(false); }}
                onMouseEnter={() => setShowTooltip(id)}
                onMouseLeave={() => setShowTooltip(null)}
                className={`relative flex flex-col items-center gap-1 p-1.5 rounded-md border transition-all duration-150 ${
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 scale-110"
                    : "border-transparent hover:border-[var(--color-panel-border)] hover:bg-white/5"
                }`}
                title={meta.description}
              >
                <div className="w-8 h-6 text-[var(--color-text)]">
                  <Preview active={isActive} />
                </div>
                <span className={`text-[8px] font-bold tracking-wide ${isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}>
                  {meta.label.toUpperCase()}
                </span>
              </button>
            );
          })}
          {showTooltip && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] text-[var(--color-text)] bg-black/80 border border-[var(--color-panel-border)] whitespace-nowrap pointer-events-none">
              {LAYOUT_META[showTooltip].description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
