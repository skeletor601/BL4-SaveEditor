import { Link } from "react-router-dom";

/**
 * Dashboard placeholder – no backend. Wire other sections here later.
 */
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <p className="text-[var(--color-text-muted)]">BL4 AIO Save Editor – Web. Choose a section below.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/master-search"
          className="block p-6 rounded-lg border-2 border-[var(--color-panel-border)] bg-[var(--color-panel)]/80 hover:bg-[var(--color-accent-dim)] transition-colors"
        >
          <span className="text-3xl mb-2 block" aria-hidden>🔍</span>
          <h2 className="font-semibold text-[var(--color-accent)]">Master Search</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Search parts and items database</p>
        </Link>
      </div>
    </div>
  );
}
