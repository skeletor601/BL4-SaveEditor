/**
 * LayoutContext — Per-page layout preferences with 5 layout modes.
 * Persisted to localStorage so the app remembers user choices.
 *
 * Layouts:
 *  1. Standard   — current default layout
 *  2. Top Nav    — horizontal navigation bar, full-width content
 *  3. Compact    — dense mode, tighter spacing, more data visible
 *  4. Cinema     — spacious, large panels, premium feel
 *  5. Terminal   — monospace, sharp corners, hacker aesthetic
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

// ── Layout definitions ──────────────────────────────────────────────────────

export const LAYOUTS = ["standard", "topnav", "compact", "cinema", "terminal"] as const;
export type LayoutId = (typeof LAYOUTS)[number];

export interface LayoutMeta {
  id: LayoutId;
  label: string;
  description: string;
  icon: string; // small SVG path or emoji
}

export const LAYOUT_META: Record<LayoutId, LayoutMeta> = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "Default layout with breadcrumb header",
    icon: "std",
  },
  topnav: {
    id: "topnav",
    label: "Top Nav",
    description: "Full navigation bar across the top",
    icon: "nav",
  },
  compact: {
    id: "compact",
    label: "Compact",
    description: "Dense mode — tighter spacing, more visible",
    icon: "cmp",
  },
  cinema: {
    id: "cinema",
    label: "Cinema",
    description: "Spacious panels, larger text, premium feel",
    icon: "cin",
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    description: "Monospace, sharp corners, hacker aesthetic",
    icon: "trm",
  },
};

// ── Page groups for per-page settings ───────────────────────────────────────

export const PAGE_GROUPS = [
  { key: "home", label: "Home", routes: ["/", "/test-app"] },
  { key: "builder", label: "Item Builder", routes: ["/beta/unified-item-builder"] },
  { key: "search", label: "Parts Search", routes: ["/master-search"] },
  { key: "character", label: "Character", routes: ["/character"] },
  { key: "inventory", label: "Inventory", routes: ["/inventory"] },
  { key: "community", label: "Community", routes: ["/community", "/god-rolls"] },
  { key: "gearforge", label: "Gear Forge", routes: ["/gear-forge"] },
  { key: "settings", label: "Settings", routes: ["/settings"] },
] as const;

export type PageGroupKey = (typeof PAGE_GROUPS)[number]["key"];

function routeToPageGroup(pathname: string): PageGroupKey {
  for (const pg of PAGE_GROUPS) {
    for (const route of pg.routes) {
      if (pathname === route || pathname.startsWith(route + "/")) return pg.key;
    }
  }
  return "home";
}

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bl4-layouts";
const GLOBAL_LAYOUT_KEY = "bl4-layout-global";

type LayoutPrefs = Partial<Record<PageGroupKey, LayoutId>>;

function loadPrefs(): LayoutPrefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrefs(prefs: LayoutPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function loadGlobal(): LayoutId {
  try {
    const v = localStorage.getItem(GLOBAL_LAYOUT_KEY);
    if (v && LAYOUTS.includes(v as LayoutId)) return v as LayoutId;
  } catch {}
  return "standard";
}

function saveGlobal(id: LayoutId) {
  localStorage.setItem(GLOBAL_LAYOUT_KEY, id);
}

// ── CSS variable injection ──────────────────────────────────────────────────

const LAYOUT_CSS: Record<LayoutId, Record<string, string>> = {
  standard: {
    "--layout-spacing": "1",
    "--layout-font-scale": "1",
    "--layout-max-width": "80rem",
    "--layout-radius": "0.75rem",
    "--layout-panel-radius": "0.75rem",
    "--layout-font-family": "inherit",
    "--layout-header-height": "3.5rem",
  },
  topnav: {
    "--layout-spacing": "1",
    "--layout-font-scale": "1",
    "--layout-max-width": "96rem",
    "--layout-radius": "0.75rem",
    "--layout-panel-radius": "0.75rem",
    "--layout-font-family": "inherit",
    "--layout-header-height": "3.5rem",
  },
  compact: {
    "--layout-spacing": "0.7",
    "--layout-font-scale": "0.88",
    "--layout-max-width": "100rem",
    "--layout-radius": "0.375rem",
    "--layout-panel-radius": "0.375rem",
    "--layout-font-family": "inherit",
    "--layout-header-height": "2.75rem",
  },
  cinema: {
    "--layout-spacing": "1.4",
    "--layout-font-scale": "1.08",
    "--layout-max-width": "72rem",
    "--layout-radius": "1rem",
    "--layout-panel-radius": "1rem",
    "--layout-font-family": "inherit",
    "--layout-header-height": "4rem",
  },
  terminal: {
    "--layout-spacing": "0.85",
    "--layout-font-scale": "0.92",
    "--layout-max-width": "100rem",
    "--layout-radius": "0px",
    "--layout-panel-radius": "0px",
    "--layout-font-family": "'Courier New', 'Consolas', 'Monaco', monospace",
    "--layout-header-height": "2.75rem",
  },
};

function applyLayoutCSS(layoutId: LayoutId) {
  const root = document.documentElement;
  const vars = LAYOUT_CSS[layoutId];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  // Apply layout class to body for CSS-driven changes
  root.classList.remove(...LAYOUTS.map(l => `layout-${l}`));
  root.classList.add(`layout-${layoutId}`);
}

// ── Context ─────────────────────────────────────────────────────────────────

interface LayoutContextValue {
  /** Current active layout for the current page */
  layout: LayoutId;
  /** Global default layout */
  globalLayout: LayoutId;
  /** Set layout for current page group */
  setLayout: (id: LayoutId) => void;
  /** Set global default layout (applies to all pages without a specific override) */
  setGlobalLayout: (id: LayoutId) => void;
  /** Set layout for a specific page group */
  setPageLayout: (pageKey: PageGroupKey, id: LayoutId) => void;
  /** Get layout for a specific page group */
  getPageLayout: (pageKey: PageGroupKey) => LayoutId;
  /** Current page group key */
  pageGroup: PageGroupKey;
  /** All per-page overrides */
  prefs: LayoutPrefs;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const [globalLayout, setGlobalLayoutState] = useState<LayoutId>(loadGlobal);
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);

  const pageGroup = routeToPageGroup(pathname);
  const layout = prefs[pageGroup] || globalLayout;

  // Apply CSS whenever layout changes
  useEffect(() => {
    applyLayoutCSS(layout);
  }, [layout]);

  const setLayout = useCallback((id: LayoutId) => {
    setPrefs(prev => {
      const next = { ...prev, [pageGroup]: id };
      savePrefs(next);
      return next;
    });
  }, [pageGroup]);

  const setGlobalLayout = useCallback((id: LayoutId) => {
    setGlobalLayoutState(id);
    saveGlobal(id);
  }, []);

  const setPageLayout = useCallback((pageKey: PageGroupKey, id: LayoutId) => {
    setPrefs(prev => {
      const next = { ...prev, [pageKey]: id };
      savePrefs(next);
      return next;
    });
  }, []);

  const getPageLayout = useCallback((pageKey: PageGroupKey): LayoutId => {
    return prefs[pageKey] || globalLayout;
  }, [prefs, globalLayout]);

  return (
    <LayoutContext.Provider value={{ layout, globalLayout, setLayout, setGlobalLayout, setPageLayout, getPageLayout, pageGroup, prefs }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
