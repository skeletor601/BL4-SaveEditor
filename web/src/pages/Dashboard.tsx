import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";

const cards = [
  { to: "/character", title: "Character", desc: "Select save, character, YAML", icon: "👤" },
  { to: "/inventory", title: "Inventory", desc: "Parts translator, backpack", icon: "🎒" },
  { to: "/weapon-toolbox", title: "Weapon Toolbox", desc: "Weapon gen, weapon edit", icon: "🔧" },
  { to: "/accessories", title: "Accessories", desc: "Class mod, grenades, shields, more", icon: "💣" },
  { to: "/master-search", title: "Master Search", desc: "Search parts and items database", icon: "🔍" },
];

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
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ to, title, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="block p-6 rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm hover:bg-[rgba(48,52,60,0.65)] transition-colors"
          >
            <span className="text-3xl mb-2 block" aria-hidden>{icon}</span>
            <h2 className="font-semibold text-[var(--color-accent)]">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{desc}</p>
          </Link>
        ))}
        <div className="p-6 rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm col-span-full lg:col-span-1">
          <h2 className="font-semibold text-[var(--color-accent)]">News & Updates</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 whitespace-pre-wrap">{news || "Loading…"}</p>
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
