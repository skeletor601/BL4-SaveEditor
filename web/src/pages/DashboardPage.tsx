import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/apiClient";

const cards = [
  { to: "/character", title: "Character Studio", desc: "Select save, character edits, YAML", icon: "👤" },
  { to: "/inventory", title: "Inventory Ops", desc: "Backpack, decoder, translator, code spawn", icon: "🎒" },
  { to: "/gear-forge", title: "Gear Forge", desc: "Build + edit command center with live codec", icon: "⚙️" },
  { to: "/master-search", title: "Master Search", desc: "Deep part lookup across the item database", icon: "🔍" },
];

export default function DashboardPage() {
  const [news, setNews] = useState<string>("");

  useEffect(() => {
    fetchApi("news")
      .then((r: Response) => r.json())
      .then((d: { content?: string }) => setNews(d.content || ""))
      .catch(() => setNews("Welcome to BL4 AIO Save Editor Web. Change themes in the header or Settings."));
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[linear-gradient(135deg,rgba(24,28,34,0.9),rgba(48,52,60,0.35))] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">BL4 AIO</p>
        <h1 className="text-2xl font-semibold text-[var(--color-accent)] mt-1">Command Dashboard</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-3xl">
          Your main control room for save editing. Jump straight into build/edit workflows, inventory operations,
          and database search from one place.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ to, title, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="group block p-5 rounded-xl border border-panel-border bg-panel/80 hover:bg-accent/10 transition-colors"
          >
            <span className="text-3xl mb-3 block" aria-hidden>{icon}</span>
            <h2 className="font-semibold text-accent group-hover:underline">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{desc}</p>
          </Link>
        ))}
        <div className="p-5 rounded-xl border border-dashed border-[var(--color-accent)]/55 bg-panel/60">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Coming Soon</p>
          <h2 className="font-semibold text-accent mt-2">Tutorial Playlist</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            Guided walkthroughs are on the roadmap. This panel will link directly to the playlist when it is ready.
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center rounded-md border border-panel-border px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              Link not live yet
            </span>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-panel-border bg-panel/80 md:col-span-2 xl:col-span-1">
          <h2 className="font-semibold text-accent">News & Updates</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 whitespace-pre-wrap">{news || "Loading…"}</p>
          <div className="mt-4 flex gap-2">
            <a
              href="https://github.com/skeletor601/BL4-SaveEditor"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded border border-panel-border text-accent text-sm hover:bg-panel"
            >
              Open in Browser
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
