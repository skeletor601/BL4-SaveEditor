import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";
import { CHANGE_LOG } from "@/data/changelog";

type DashboardIconKind = "character" | "inventory" | "gear" | "search" | "tutorial" | "news" | "beta";

const cards: { to: string; title: string; desc: string; icon: DashboardIconKind }[] = [
  { to: "/character", title: "Character Studio", desc: "Select save, character edits, YAML", icon: "character" },
  { to: "/inventory", title: "Inventory Ops", desc: "Backpack, decoder, translator, code spawn", icon: "inventory" },
  { to: "/gear-forge", title: "Gear Forge", desc: "Build + edit command center with live codec", icon: "gear" },
  { to: "/master-search", title: "Master Search", desc: "Deep part lookup across the item database", icon: "search" },
  { to: "/beta", title: "Beta", desc: "Try new experiments and send feedback", icon: "beta" },
];

function DashboardIcon({ kind }: { kind: DashboardIconKind }) {
  const common =
    "w-9 h-9 md:w-10 md:h-10 text-[var(--color-accent)] drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]";

  switch (kind) {
    case "character":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="64" cy="40" r="14" />
            <line x1="64" y1="54" x2="64" y2="82" />
            <line x1="64" y1="82" x2="50" y2="104" />
            <line x1="64" y1="82" x2="78" y2="104" />
            <line x1="52" y1="66" x2="36" y2="62" />
            <line x1="76" y1="66" x2="92" y2="62" />
          </g>
        </svg>
      );
    case "inventory":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="28" y="36" width="72" height="60" rx="8" />
            <path d="M44 36 L52 24 L76 24 L84 36" />
            <path d="M40 52 H88" />
          </g>
        </svg>
      );
    case "gear":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="64" cy="64" r="18" />
            <path d="M64 30 V18 M64 110 V98 M30 64 H18 M110 64 H98" />
            <path d="M38 38 L30 30 M98 98 L90 90 M38 90 L30 98 M98 30 L90 38" />
          </g>
        </svg>
      );
    case "search":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="56" cy="56" r="24" />
            <line x1="72" y1="72" x2="100" y2="100" />
          </g>
        </svg>
      );
    case "tutorial":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="26" y="28" width="76" height="72" rx="8" />
            <path d="M38 44 H90" />
            <path d="M38 60 H80" />
            <path d="M38 76 H70" />
          </g>
        </svg>
      );
    case "news":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="24" y="30" width="80" height="68" rx="10" />
            <path d="M36 46 H88" />
            <path d="M36 62 H88" />
            <path d="M36 78 H64" />
          </g>
        </svg>
      );
    case "beta":
      return (
        <svg className={common} viewBox="0 0 128 128" aria-hidden>
          <g stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M44 92 L44 36 L84 36 L84 92 L44 92" />
            <path d="M52 52 L76 52" />
            <circle cx="64" cy="72" r="6" />
          </g>
        </svg>
      );
  }
}

export default function Dashboard() {
  const [news, setNews] = useState<string>("");

  useEffect(() => {
    fetchApi("news")
      .then((r) => r.json())
      .then((d) => setNews(d.content ?? ""))
      .catch(() => setNews("Welcome to BL4 AIO Save Editor Web. Change themes in the header or Settings."));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_55%),linear-gradient(135deg,rgba(24,28,34,0.95),rgba(24,28,34,0.7))] p-5 md:p-6 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
              BL4 AIO · Web
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-[var(--color-accent)] mt-1">
              Command Dashboard
            </h1>
            <p className="text-sm md:text-[15px] text-[var(--color-text-muted)] mt-2 max-w-3xl leading-relaxed">
              Launch into save editing, inventory ops, and Gear Forge from one surface. Everything is tuned for desktop
              and phone, with your current theme carried across tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] text-[var(--color-text-muted)]">
              Fast routing to core tools
            </span>
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] text-[var(--color-text-muted)]">
              Gear Forge + Serial Editor
            </span>
            <span className="px-2.5 py-1 rounded-full border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.7)] text-[11px] text-[var(--color-text-muted)]">
              Mobile friendly layout
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ to, title, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="group block p-5 rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.72)] hover:bg-[rgba(24,28,34,0.96)] hover:border-[var(--color-accent)]/70 transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-3">
              <DashboardIcon kind={icon} />
            </div>
            <h2 className="font-semibold text-[var(--color-accent)] group-hover:underline">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">{desc}</p>
          </Link>
        ))}

        <div className="p-5 rounded-[1.25rem] border border-dashed border-[var(--color-accent)]/55 bg-[rgba(24,28,34,0.45)] shadow-[0_10px_26px_rgba(0,0,0,0.35)]">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Coming Soon</p>
          <h2 className="font-semibold text-[var(--color-accent)] mt-2">Tutorial Playlist</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 leading-relaxed">
            Guided walkthroughs for beginners and advanced workflows. This panel will link directly to the tutorial
            playlist once it is published.
          </p>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <DashboardIcon kind="tutorial" />
              <span className="inline-flex items-center rounded-md border border-[var(--color-panel-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
                Link not live yet
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-[1.25rem] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.82)] md:col-span-2 xl:col-span-1 shadow-[0_10px_26px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 mb-1">
            <DashboardIcon kind="news" />
            <h2 className="font-semibold text-[var(--color-accent)]">News &amp; Updates</h2>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 whitespace-pre-wrap">{news || "Loading..."}</p>
          <h3 className="font-semibold text-[var(--color-accent)] mt-4">Change Log</h3>
          <div className="mt-2 space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {CHANGE_LOG.map((entry) => (
              <div key={entry.date}>
                <p className="text-xs font-mono text-[var(--color-text-muted)]">{entry.date}</p>
                <ul className="text-sm text-[var(--color-text-muted)] list-disc pl-5 mt-1 space-y-1">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <a
              href="https://github.com/skeletor601/BL4-SaveEditor"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded border border-[var(--color-panel-border)] text-[var(--color-accent)] text-sm hover:bg-[rgba(48,52,60,0.6)]"
            >
              Open in Browser
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
