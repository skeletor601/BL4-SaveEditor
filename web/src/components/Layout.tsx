import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";

const nav = [
  { to: "/", label: "Home" },
  { to: "/character", label: "Character" },
  { to: "/inventory", label: "Inventory" },
  { to: "/weapon-toolbox", label: "Weapon Toolbox" },
  { to: "/accessories", label: "Accessories" },
  { to: "/master-search", label: "Master Search" },
  { to: "/settings", label: "Settings" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="border-b border-panel-border bg-panel/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="md:hidden p-2 rounded border border-panel-border text-accent"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current" />
            </button>
            <Link to="/" className="font-semibold text-lg text-[var(--color-text)]">
              BL4 AIO Save Editor
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-2">
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-2 rounded border text-sm ${
                  location.pathname === to || (to !== "/" && location.pathname.startsWith(to + "/"))
                    ? "bg-accent/20 border-accent text-accent"
                    : "border-panel-border text-[var(--color-text-muted)] hover:bg-panel"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)] hidden sm:inline">Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as typeof theme)}
              className="bg-panel border border-panel-border text-accent rounded px-2 py-1 text-sm min-w-[6rem]"
              aria-label="Theme"
            >
              {["Ion", "Lava", "Phoenix", "Violet", "Blue_Balls", "Artic_Hex", "Carbon_Flux", "Platinum"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Link
              to="/settings"
              className="px-3 py-2 rounded border border-panel-border text-sm text-[var(--color-text-muted)] hover:bg-panel"
            >
              Credits
            </Link>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-panel-border bg-panel p-4 flex flex-col gap-2">
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="px-3 py-2 rounded border border-panel-border text-accent"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-panel-border py-3 px-4 text-sm text-[var(--color-text-muted)]">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between gap-2">
          <span>Special Thanks to the Modders that Offered Ideas</span>
          <span>All Credit Goes to Original Creator Superexboom</span>
        </div>
      </footer>
    </div>
  );
}
