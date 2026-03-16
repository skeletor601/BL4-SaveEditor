import { Link } from "react-router-dom";

export default function BetaPage() {
  return (
    <div
      className="space-y-6"
      style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
    >
      <section className="relative rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_55%),linear-gradient(135deg,rgba(24,28,34,0.95),rgba(24,28,34,0.7))] p-5 md:p-6 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-sm overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-accent)]/20 rounded-l-[1.25rem]" aria-hidden="true" />
        <span className="absolute top-3 right-4 font-mono text-[var(--color-accent)]/15 text-sm select-none pointer-events-none" aria-hidden="true">⌐■</span>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pl-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[10px] tracking-widest text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 px-2 py-0.5 rounded">◈ LAB</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                EARLY ACCESS
              </span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-text-muted)] font-mono">
              Experiments
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-[var(--color-accent)] mt-1">
              Beta
            </h1>
            <p className="text-sm md:text-[15px] text-[var(--color-text-muted)] mt-2 max-w-3xl leading-relaxed">
              Try new features here before they ship. Your feedback shapes what we build next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] font-mono text-[var(--color-text-muted)]">⌖ Early access</span>
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] font-mono text-[var(--color-text-muted)]">◎ Feedback welcome</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link
          to="/beta/unified-item-builder"
          className="group relative block p-5 rounded-[1.25rem] border-2 border-[var(--color-accent)]/35 bg-[linear-gradient(135deg,rgba(24,28,34,0.92),rgba(24,28,34,0.65))] hover:border-[var(--color-accent)]/80 hover:bg-[rgba(24,28,34,0.96)] transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_0_0_1px_var(--color-accent),0_18px_40px_rgba(0,0,0,0.55)] overflow-hidden touch-manipulation"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-accent)]/20 rounded-l-[1.25rem]" aria-hidden="true" />
          <div className="pl-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[10px] tracking-widest text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 px-2 py-0.5 rounded">◈ LIVE</span>
            </div>
            <h2 className="font-semibold text-[var(--color-accent)] group-hover:underline text-lg">
              Unified Item Builder
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-2 leading-relaxed">
              Build and edit any item (weapon, grenade, shield, class mod, repkit, heavy, enhancement) in one page. Live codec, modded weapon generator, DPS estimator. Uses our 9,600+ part database.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
