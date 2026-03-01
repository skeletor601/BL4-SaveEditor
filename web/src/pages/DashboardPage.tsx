import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

const cards = [
  { to: "/save-tools/character", title: "Character", desc: "Select save, character, YAML", icon: "👤" },
  { to: "/save-tools/inventory", title: "Inventory", desc: "Parts translator, backpack", icon: "🎒" },
  { to: "/save-tools/weapon-toolbox", title: "Weapon Toolbox", desc: "Weapon gen, weapon edit", icon: "🔧" },
  { to: "/save-tools/accessories", title: "Accessories", desc: "Class mod, grenades, shields, more", icon: "💣" },
  { to: "/master-search", title: "Master Search", desc: "Search parts and items database", icon: "🔍" },
];

export default function DashboardPage() {
  const [news, setNews] = useState<string>("");

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => setNews(d.content || ""))
      .catch(() => setNews("Welcome to BL4 AIO Save Editor Web. Change themes in the header or Settings."));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ to, title, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="block p-6 rounded-lg border-2 border-panel-border bg-panel/80 hover:bg-accent/10 transition-colors"
          >
            <span className="text-3xl mb-2 block" aria-hidden>{icon}</span>
            <h2 className="font-semibold text-accent">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{desc}</p>
          </Link>
        ))}
        <div className="p-6 rounded-lg border-2 border-panel-border bg-panel/80 col-span-full lg:col-span-1">
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
