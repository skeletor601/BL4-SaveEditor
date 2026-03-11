import { Link } from "react-router-dom";

/**
 * Beta hub: experiments and feedback.
 * New features land here for user testing before they ship to the main app.
 */

export default function BetaPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_55%),linear-gradient(135deg,rgba(24,28,34,0.95),rgba(24,28,34,0.7))] p-5 md:p-6 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
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
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] text-[var(--color-text-muted)]">
              Early access
            </span>
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] text-[var(--color-text-muted)]">
              Feedback welcome
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link
          to="/beta/unified-item-builder"
          className="group block p-5 rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.72)] hover:bg-[rgba(24,28,34,0.96)] hover:border-[var(--color-accent)]/70 transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        >
          <h2 className="font-semibold text-[var(--color-accent)] group-hover:underline">
            Unified Item Builder
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">
            Build and edit any item (weapon, grenade, shield, class mod, repkit, heavy, enhancement) in one page. Add parts, set quantities, see the build in one place. Uses our parts DB and encode/decode APIs.
          </p>
        </Link>
      </div>
    </div>
  );
}
