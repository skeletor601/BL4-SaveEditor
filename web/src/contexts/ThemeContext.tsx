import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = [
  "Ion",
  "Lava",
  "Phoenix",
  "Violet",
  "Blue_Balls",
  "Artic_Hex",
  "Carbon_Flux",
  "Platinum",
] as const;

export type ThemeId = (typeof THEMES)[number];

const STORAGE_KEY = "bl4-theme";
const FONT_SIZE_KEY = "bl4-font-size";
const BG_MODE_KEY = "bl4-bg-mode";

export const BG_MODES = ["stock", "dark", "light"] as const;
export type BgMode = (typeof BG_MODES)[number];

export const BG_MODE_META: Record<BgMode, { label: string; swatch: string; border?: string }> = {
  stock: { label: "Stock", swatch: "conic-gradient(#00BFFF 0deg, #FF6600 90deg, #BF00FF 180deg, #00D4AA 270deg)" },
  dark:  { label: "Dark Studio", swatch: "linear-gradient(180deg, #5a5e6a, #2a2c34)", border: "rgba(255,255,255,0.4)" },
  light: { label: "Light Studio", swatch: "linear-gradient(180deg, #f0f0f0, #c8c8c8)" },
};

export const FONT_SIZES = [
  { label: "S",    value: 13 },
  { label: "M",    value: 16 },
  { label: "L",    value: 18 },
  { label: "XL",   value: 20 },
  { label: "XXL",  value: 23 },
] as const;

export type FontSizeValue = (typeof FONT_SIZES)[number]["value"];

type ThemeConfig = {
  accent: string;
  accentMuted: string;
  accentDim: string;
  panelBorder: string;
  bgOverlay: string;
};

/** Background image filename per theme (matches desktop BG_Themes/). Artic_Hex uses "Artic Hex" in filename. */
const THEME_BG_FILENAMES: Record<ThemeId, string> = {
  Ion: "Ion",
  Lava: "Lava",
  Phoenix: "Phoenix",
  Violet: "Violet",
  Blue_Balls: "Blue_Balls",
  Artic_Hex: "Artic Hex",
  Carbon_Flux: "Carbon_Flux",
  Platinum: "Platinum",
};

export const THEME_META: Record<ThemeId, { label: string; accent: string }> = {
  Ion:         { label: "Ion",         accent: "#00BFFF" },
  Lava:        { label: "Lava",        accent: "#FF6600" },
  Phoenix:     { label: "Phoenix",     accent: "#FF4500" },
  Violet:      { label: "Violet",      accent: "#BF00FF" },
  Blue_Balls:  { label: "Blue Balls",  accent: "#0080FF" },
  Artic_Hex:   { label: "Artic Hex",   accent: "#00FFFF" },
  Carbon_Flux: { label: "Carbon Flux", accent: "#00D4AA" },
  Platinum:    { label: "Platinum",    accent: "#A0B8D0" },
};

const themeConfig: Record<ThemeId, ThemeConfig> = {
  Ion: { accent: "#00BFFF", accentMuted: "rgba(0,245,255,0.7)", accentDim: "rgba(0,191,255,0.35)", panelBorder: "#00ffff", bgOverlay: "rgba(0,0,0,0.25)" },
  Lava: { accent: "#FF6600", accentMuted: "rgba(255,102,0,0.7)", accentDim: "rgba(255,102,0,0.35)", panelBorder: "#ff6600", bgOverlay: "rgba(0,0,0,0.45)" },
  Phoenix: { accent: "#FF4500", accentMuted: "rgba(255,68,0,0.7)", accentDim: "rgba(255,69,0,0.35)", panelBorder: "#ff4400", bgOverlay: "rgba(0,0,0,0.40)" },
  Violet: { accent: "#BF00FF", accentMuted: "rgba(170,0,255,0.7)", accentDim: "rgba(191,0,255,0.3)", panelBorder: "#aa00ff", bgOverlay: "rgba(0,0,0,0.48)" },
  Blue_Balls: { accent: "#0080FF", accentMuted: "rgba(0,136,255,0.7)", accentDim: "rgba(0,128,255,0.35)", panelBorder: "#0088ff", bgOverlay: "rgba(0,0,0,0.38)" },
  Artic_Hex: { accent: "#00FFFF", accentMuted: "rgba(0,204,255,0.7)", accentDim: "rgba(0,255,255,0.35)", panelBorder: "#00ccff", bgOverlay: "rgba(0,0,0,0.35)" },
  Carbon_Flux: { accent: "#00D4AA", accentMuted: "rgba(0,255,136,0.7)", accentDim: "rgba(0,212,170,0.3)", panelBorder: "#00ff88", bgOverlay: "rgba(0,0,0,0.42)" },
  Platinum: { accent: "#A0B8D0", accentMuted: "rgba(192,192,192,0.7)", accentDim: "rgba(160,184,208,0.4)", panelBorder: "#c0c0c0", bgOverlay: "rgba(0,0,0,0.30)" },
};

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themeConfig: ThemeConfig;
  fontSize: FontSizeValue;
  setFontSize: (size: FontSizeValue) => void;
  bgMode: BgMode;
  setBgMode: (mode: BgMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s && THEMES.includes(s as ThemeId)) return s as ThemeId;
    } catch {}
    return "Ion";
  });

  const [bgMode, setBgModeState] = useState<BgMode>(() => {
    try {
      const s = localStorage.getItem(BG_MODE_KEY);
      if (s && BG_MODES.includes(s as BgMode)) return s as BgMode;
    } catch {}
    return "stock";
  });

  const [fontSize, setFontSizeState] = useState<FontSizeValue>(() => {
    try {
      const s = localStorage.getItem(FONT_SIZE_KEY);
      const n = s ? Number(s) : null;
      if (n && FONT_SIZES.some((f) => f.value === n)) return n as FontSizeValue;
    } catch {}
    return 16;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(BG_MODE_KEY, bgMode);
    const c = themeConfig[theme];
    document.documentElement.style.setProperty("--color-accent", c.accent);
    document.documentElement.style.setProperty("--color-accent-muted", c.accentMuted);
    document.documentElement.style.setProperty("--color-accent-dim", c.accentDim);
    document.documentElement.style.setProperty("--color-panel-border", c.panelBorder);
    document.documentElement.style.setProperty("--color-bg-overlay", c.bgOverlay);
    // Background image: stock uses per-theme hex BG, dark/light use studio images
    if (bgMode === "stock") {
      const bgName = THEME_BG_FILENAMES[theme];
      const encoded = encodeURIComponent(bgName);
      document.documentElement.style.setProperty("--theme-bg-url", `url("/BG_Themes/${encoded}.png")`);
    } else if (bgMode === "dark") {
      document.documentElement.style.setProperty("--theme-bg-url", `url("/BG_Themes/Studio_Dark.png")`);
    } else {
      document.documentElement.style.setProperty("--theme-bg-url", `url("/BG_Themes/Studio_Light.png")`);
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-bg", bgMode);
  }, [theme, bgMode]);

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  const setFontSize = (size: FontSizeValue) => setFontSizeState(size);
  const setBgMode = (mode: BgMode) => setBgModeState(mode);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      themeConfig: themeConfig[theme],
      fontSize,
      setFontSize,
      bgMode,
      setBgMode,
    }),
    [theme, fontSize, bgMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
