import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme, THEMES, THEME_META, BG_MODES, BG_MODE_META, type ThemeId } from "@/contexts/ThemeContext";
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext";
// import LayoutSwitcher from "@/components/LayoutSwitcher"; // available in Settings page

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

const MINIMAL_HEADER_ROUTES = ["/beta", "/test-app", "/terra", "/green", "/drlecter", "/character", "/inventory", "/gear-forge", "/master-search", "/settings", "/save-compare", "/community", "/god-rolls", "/testing"];

// ── Breadcrumb definitions ──────────────────────────────────────────────────
interface Crumb { label: string; to?: string }

function getBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];

  if (pathname.startsWith("/beta/unified-item-builder")) {
    crumbs.push({ label: "Build & Edit Items" });
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
    else if (pathname.includes("code-spawn")) crumbs.push({ label: "Add in Bulk" });
    else if (pathname.includes("parts-translator")) crumbs.push({ label: "Parts Translator" });
  } else if (pathname.startsWith("/master-search")) {
    crumbs.push({ label: "Parts Search" });
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

// ── Top Nav bar (for topnav layout) ─────────────────────────────────────────

function TopNavBar() {
  const location = useLocation();
  const topNavItems = [
    { to: "/", label: "Home", icon: "\u2302" },
    { to: "/beta/unified-item-builder", label: "Builder", icon: "\u2692" },
    { to: "/master-search", label: "Search", icon: "\u2315" },
    { to: "/character/select-save", label: "Character", icon: "\u263A" },
    { to: "/inventory/backpack", label: "Backpack", icon: "\u25A4" },
    { to: "/inventory/decoder", label: "Decoder", icon: "\u2194" },
    { to: "/community", label: "Community", icon: "\u2605" },
    { to: "/god-rolls", label: "God Rolls", icon: "\u2726" },
    { to: "/settings", label: "Settings", icon: "\u2699" },
  ];

  return (
    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
      {topNavItems.map(({ to, label, icon }) => {
        const isActive = location.pathname === to ||
          (to !== "/" && location.pathname.startsWith(to.split("/").slice(0, 2).join("/") + "/"));
        return (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-150 ${
              isActive
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <span className="text-sm">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Inner layout (needs useLayout) ──────────────────────────────────────────

function LayoutInner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, setTheme, themeConfig, bgMode, setBgMode } = useTheme();
  const { layout } = useLayout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const overlay = themeConfig.bgOverlay;
  const useMinimalHeader = MINIMAL_HEADER_ROUTES.some((r) => location.pathname.startsWith(r));
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const isTopNav = layout === "topnav";
  const isTerminal = layout === "terminal";
  const isCompact = layout === "compact";
  const isCinema = layout === "cinema";

  // Dynamic spacing based on layout
  const mainPadding = isCompact ? "px-2 py-3" : isCinema ? "px-6 py-8" : "px-4 py-6";
  const headerBg = isTerminal
    ? "rgba(0, 10, 0, 0.95)"
    : "rgba(48, 52, 60, 0.92)";

  return (
    <div className={`min-h-screen flex flex-col relative ${isTerminal ? "terminal-scanlines" : ""}`}>
      {/* Theme background */}
      <div
        className="fixed inset-0 z-0 bg-bg"
        style={{
          backgroundImage: isTerminal
            ? "none"
            : `linear-gradient(${overlay}, ${overlay}), var(--theme-bg-url)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: isTerminal ? "none" : "blur(2px) brightness(0.55)",
          transform: isTerminal ? "none" : "scale(1.02)",
          backgroundColor: isTerminal ? "#0a0a0a" : undefined,
        }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        <header
          className={`border-b sticky top-0 z-50 backdrop-blur-sm ${isTerminal ? "border-[var(--color-accent)]/30" : "border-panel-border"}`}
          style={{
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
            backgroundColor: headerBg,
            minHeight: "var(--layout-header-height, 3.5rem)",
          }}
        >
          <div className="max-w-[var(--layout-max-width,80rem)] mx-auto px-2 flex items-center justify-between min-h-[44px]"
            style={{ height: "var(--layout-header-height, 3.5rem)" }}>
            {/* Left side: breadcrumbs or nav */}
            {isTopNav ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Link to="/" className="font-bold text-sm text-[var(--color-accent)] shrink-0">
                  {isTerminal ? "> BL4" : "BL4"}
                </Link>
                <TopNavBar />
              </div>
            ) : useMinimalHeader ? (
              <div className="flex items-center justify-between w-full relative">
                <nav className="flex items-center gap-1.5 text-xs min-w-0">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1.5 min-w-0">
                      {i > 0 && <span className="text-[var(--color-text-muted)]/40 shrink-0">{isTerminal ? "/" : "\u203A"}</span>}
                      {crumb.to && i < breadcrumbs.length - 1 ? (
                        <Link to={crumb.to} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors truncate">
                          {i === 0 ? <><span className="mr-1">{isTerminal ? "~" : "\u2190"}</span><span className="font-semibold text-[var(--color-text)]">{crumb.label}</span></> : crumb.label}
                        </Link>
                      ) : i === 0 ? (
                        <Link to="/" className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                          <span className="mr-1">{isTerminal ? "~" : "\u2190"}</span><span className="font-semibold text-[var(--color-text)]">{crumb.label}</span>
                        </Link>
                      ) : (
                        <span className={i === breadcrumbs.length - 1 ? "text-[var(--color-accent)] font-medium truncate" : "text-[var(--color-text)] truncate"}>{isTerminal ? `[${crumb.label}]` : crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="md:hidden min-w-[44px] min-h-[44px] p-2 rounded border border-panel-border text-accent"
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

            {/* Desktop nav (standard layout only, non-minimal) */}
            <nav className={`hidden md:flex items-center gap-2 ${useMinimalHeader || isTopNav ? "!hidden" : ""}`}>
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

            {/* Right side: theme + bg + layout swatches */}
            <div className="flex items-center gap-2 shrink-0">
              {/* LayoutSwitcher removed from header — available in Settings */}
              {/* Theme swatch row */}
              <div className="flex items-center gap-1" role="group" aria-label="Theme">
                <span className="text-[10px] font-mono tracking-widest text-[var(--color-text-muted)] hidden sm:inline mr-0.5">
                  {isTerminal ? "CLR" : "THEME"}
                </span>
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t as ThemeId)}
                    title={THEME_META[t as ThemeId].label}
                    aria-label={`Theme: ${THEME_META[t as ThemeId].label}`}
                    className={`w-4 h-4 border-2 transition-all duration-150 ${
                      isTerminal ? "rounded-none" : "rounded-full"
                    } ${
                      theme === t
                        ? "border-white scale-125"
                        : "border-transparent opacity-50 hover:opacity-100 hover:scale-110"
                    }`}
                    style={{
                      backgroundColor: THEME_META[t as ThemeId].accent,
                      boxShadow: theme === t ? `0 0 8px ${THEME_META[t as ThemeId].accent}` : undefined,
                    }}
                  />
                ))}
              </div>
              {/* Background swatch row */}
              <div className="flex items-center gap-1" role="group" aria-label="Background">
                <span className="text-[10px] font-mono tracking-widest text-[var(--color-text-muted)] hidden sm:inline mr-0.5">BG</span>
                {BG_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBgMode(m)}
                    title={BG_MODE_META[m].label}
                    aria-label={`Background: ${BG_MODE_META[m].label}`}
                    className={`w-4 h-4 border-2 transition-all duration-150 ${
                      isTerminal ? "rounded-none" : "rounded"
                    } ${
                      bgMode === m
                        ? "border-white scale-125"
                        : "opacity-60 hover:opacity-100 hover:scale-110"
                    }`}
                    style={{
                      background: BG_MODE_META[m].swatch,
                      borderColor: bgMode === m ? undefined : (BG_MODE_META[m].border || "transparent"),
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

        <main className={`flex-1 max-w-[var(--layout-max-width,80rem)] w-full mx-auto ${mainPadding}`}
          style={{ fontFamily: "var(--layout-font-family, inherit)" }}>
          {children}
        </main>

        <footer
          className={`border-t py-2 px-4 ${isTerminal ? "border-[var(--color-accent)]/20" : "border-panel-border"}`}
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {isTerminal && (
            <p className="text-[9px] font-mono text-[var(--color-accent)]/30 text-center">
              [SYSTEM READY] BL4_AIO_WEB v2.0 // {new Date().toISOString().split("T")[0]}
            </p>
          )}
        </footer>
      </div>

      {/* Backpack drawer */}
      {backpackOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" onClick={() => setBackpackOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-lg h-full flex flex-col border-l border-[var(--color-panel-border)] overflow-hidden"
            style={{ backgroundColor: "rgba(12, 14, 18, 0.98)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-[var(--color-accent)]">{isTerminal ? "> BACKPACK" : "\u25A4 Backpack"}</h3>
              <button onClick={() => setBackpackOpen(false)} className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{isTerminal ? "[X]" : "\u2715"}</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <iframe src="/inventory/backpack" className="w-full h-full border-0" title="Backpack" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Public Layout wrapper (provides LayoutContext) ───────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <LayoutProvider pathname={location.pathname}>
      <LayoutInner>{children}</LayoutInner>
    </LayoutProvider>
  );
}
