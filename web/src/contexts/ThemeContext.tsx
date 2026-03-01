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

type ThemeConfig = {
  accent: string;
  accentMuted: string;
  accentDim: string;
  panelBorder: string;
  bgOverlay: string;
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    const c = themeConfig[theme];
    document.documentElement.style.setProperty("--color-accent", c.accent);
    document.documentElement.style.setProperty("--color-accent-muted", c.accentMuted);
    document.documentElement.style.setProperty("--color-accent-dim", c.accentDim);
    document.documentElement.style.setProperty("--color-panel-border", c.panelBorder);
    document.documentElement.style.setProperty("--color-bg-overlay", c.bgOverlay);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      themeConfig: themeConfig[theme],
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
