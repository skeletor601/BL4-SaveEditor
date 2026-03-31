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
  { to: "/testing", label: "Testing" },
  { to: "/settings", label: "Settings" },
];

// Routes that use the new sidebar layout — show minimal header instead of full nav
// All routes get the minimal header — the new sidebar homepage is the main nav now
const MINIMAL_HEADER_ROUTES = ["/beta", "/test-app", "/terra", "/green", "/drlecter", "/character", "/inventory", "/gear-forge", "/master-search", "/settings", "/save-compare", "/community", "/god-rolls", "/testing"];

// ── Breadcrumb definitions ──────────────────────────────────────────────────
interface Crumb { label: string; to?: string }

function getBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];

  if (pathname.startsWith("/beta/unified-item-builder")) {
    crumbs.push({ label: "Gear Lab" });
  } else if (pathname.startsWith("/beta")) {
    crumbs.push({ label: "Beta Lab" });
  } else if (pathname.startsWith("/gear-forge")) {
    crumbs.push({ label: "Gear Forge" });
  } else if (pathname.startsWith("/character")) {
    crumbs.push({ label: "Character", to: "/character" });
    if (pathname.includes("select-save")) crumbs.push({ label: "Select Save" });
    else if (pathname.includes("edit")) crumbs.push({ label: "Edit" });
    else if (pathname.includes("yaml")) crumbs.push({ label: "YAML View" });
  } else if (pathname.startsWith("/inventory")) {
    crumbs.push({ label: "Inventory", to: "/inventory" });
    if (pathname.includes("backpack")) crumbs.push({ label: "Backpack" });
    else if (pathname.includes("decoder")) crumbs.push({ label: "Decoder" });
    else if (pathname.includes("code-spawn")) crumbs.push({ label: "Code Spawn" });
    else if (pathname.includes("parts-translator")) crumbs.push({ label: "Parts Translator" });
  } else if (pathname.startsWith("/master-search")) {
    crumbs.push({ label: "Arsenal" });
  } else if (pathname.startsWith("/save-compare")) {
    crumbs.push({ label: "Save Comparison" });
  } else if (pathname.startsWith("/community")) {
    crumbs.push({ label: "Community Vault" });
  } else if (pathname.startsWith("/god-rolls")) {
    crumbs.push({ label: "God Rolls" });
  } else if (pathname.startsWith("/testing")) {
    crumbs.push({ label: "Testing" });
  } else if (pathname.startsWith("/settings")) {
    crumbs.push({ label: "Settings" });
  } else if (pathname.startsWith("/terra")) {
    crumbs.push({ label: "Terra Lab" });
  } else if (pathname.startsWith("/green")) {
    crumbs.push({ label: "Green Lab" });
  } else if (pathname.startsWith("/drlecter")) {
    crumbs.push({ label: "Dr. Lecter" });
  }

  return crumbs;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, setTheme, themeConfig } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const overlay = themeConfig.bgOverlay;
  const useMinimalHeader = MINIMAL_HEADER_ROUTES.some((r) => location.pathname.startsWith(r));
  const breadcrumbs = getBreadcrumbs(location.pathname);

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
          filter: "blur(2px) brightness(0.85)",
          transform: "scale(1.02)",
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
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between min-h-[44px] h-14 relative">
          {useMinimalHeader ? (
            <div className="flex items-center justify-between w-full relative">
              {/* Breadcrumbs */}
              <nav className="flex items-center gap-1.5 text-xs min-w-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <span className="text-[var(--color-text-muted)]/40 shrink-0">›</span>}
                    {crumb.to && i < breadcrumbs.length - 1 ? (
                      <Link to={crumb.to} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors truncate">
                        {i === 0 ? <><span className="mr-1">←</span><span className="font-semibold text-[var(--color-text)]">{crumb.label}</span></> : crumb.label}
                      </Link>
                    ) : i === 0 ? (
                      <Link to="/" className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                        <span className="mr-1">←</span><span className="font-semibold text-[var(--color-text)]">{crumb.label}</span>
                      </Link>
                    ) : (
                      <span className={i === breadcrumbs.length - 1 ? "text-[var(--color-accent)] font-medium truncate" : "text-[var(--color-text)] truncate"}>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
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

      {/* ── Backpack drawer (available on all pages) ── */}
      {backpackOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" onClick={() => setBackpackOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-lg h-full flex flex-col border-l border-[var(--color-panel-border)] overflow-hidden"
            style={{ backgroundColor: "rgba(12, 14, 18, 0.98)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-[var(--color-accent)]">▤ Backpack</h3>
              <button onClick={() => setBackpackOpen(false)} className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <iframe
                src="/inventory/backpack"
                className="w-full h-full border-0"
                title="Backpack"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
