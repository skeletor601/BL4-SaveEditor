import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme, THEMES, THEME_META, type ThemeId } from "@/contexts/ThemeContext";

const nav = [
  { to: "/", label: "Home" },
  { to: "/character", label: "Character" },
  { to: "/inventory", label: "Inventory" },
  { to: "/gear-forge", label: "Gear Forge" },
  { to: "/master-search", label: "Master Search" },
  { to: "/beta", label: "Beta" },
  { to: "/settings", label: "Settings" },
];

// Routes that use the new sidebar layout — show minimal header instead of full nav
// All routes get the minimal header — the new sidebar homepage is the main nav now
const MINIMAL_HEADER_ROUTES = ["/beta", "/test-app", "/terra", "/character", "/inventory", "/gear-forge", "/master-search", "/settings", "/save-compare", "/community"];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, setTheme, themeConfig } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const overlay = themeConfig.bgOverlay;
  const useMinimalHeader = MINIMAL_HEADER_ROUTES.some((r) => location.pathname.startsWith(r));

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Theme background image (matches desktop): changes when theme changes */}
      <div
        className="fixed inset-0 z-0 bg-bg"
        style={{
          backgroundImage: `linear-gradient(${overlay}, ${overlay}), var(--theme-bg-url)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
      <header
        className="border-b border-panel-border sticky top-0 z-50 backdrop-blur-sm"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          backgroundColor: "rgba(48, 52, 60, 0.92)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between min-h-[44px] h-14">
          {useMinimalHeader ? (
            <div className="flex items-center gap-4 w-full">
              <Link to="/" className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                <span>←</span>
                <span className="font-semibold text-[var(--color-text)]">BL4 AIO</span>
              </Link>
              <span className="text-[10px] font-mono tracking-widest text-[var(--color-accent)]/50 hidden sm:inline">
                {location.pathname.includes("unified") ? "GEAR LAB" : location.pathname.includes("terra") ? "TERRA LAB" : ""}
              </span>
            </div>
          ) : (
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="md:hidden min-w-[44px] min-h-[44px] p-2 rounded border border-panel-border text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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
          )}
          <nav className={`hidden md:flex items-center gap-2 ${useMinimalHeader ? "!hidden" : ""}`}>
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
          <div className="flex items-center gap-3">
            {/* Theme swatch row */}
            <div className="flex items-center gap-1.5" role="group" aria-label="Theme">
              <span className="text-[10px] font-mono tracking-widest text-[var(--color-text-muted)] hidden sm:inline mr-0.5">THEME</span>
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t as ThemeId)}
                  title={THEME_META[t as ThemeId].label}
                  aria-label={`Theme: ${THEME_META[t as ThemeId].label}`}
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    theme === t
                      ? "border-white scale-125"
                      : "border-transparent opacity-50 hover:opacity-100 hover:scale-110"
                  }`}
                  style={{
                    backgroundColor: THEME_META[t as ThemeId].accent,
                    boxShadow: theme === t ? `0 0 10px ${THEME_META[t as ThemeId].accent}` : undefined,
                  }}
                />
              ))}
            </div>
            <Link
              to="/settings"
              className="min-h-[44px] inline-flex items-center px-3 py-2 rounded border border-panel-border text-sm text-[var(--color-text-muted)] hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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

      <footer
        className="border-t border-panel-border py-2 px-4"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      />
      </div>
    </div>
  );
}
