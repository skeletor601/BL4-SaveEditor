import { useTheme, THEMES, THEME_META, BG_MODES, BG_MODE_META, FONT_SIZES } from "@/contexts/ThemeContext";

export default function MobileSettingsPage() {
  const { theme, setTheme, bgMode, setBgMode, fontSize, setFontSize } = useTheme();

  return (
    <div>
      <div className="mobile-page-header">
        <h1>Settings</h1>
      </div>

      {/* Theme */}
      <div className="mobile-card">
        <div className="mobile-label">Color Theme</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {THEMES.map((t) => {
            const meta = THEME_META[t];
            const active = t === theme;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                style={{
                  minHeight: 48,
                  borderRadius: 10,
                  border: `2px solid ${active ? meta.accent : "rgba(255,255,255,0.1)"}`,
                  background: active ? `${meta.accent}22` : "rgba(24,28,34,0.6)",
                  color: active ? meta.accent : "var(--color-text-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: meta.accent, margin: "0 auto 4px" }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Background */}
      <div className="mobile-card">
        <div className="mobile-label">Background</div>
        <div style={{ display: "flex", gap: 8 }}>
          {BG_MODES.map((mode) => {
            const meta = BG_MODE_META[mode];
            const active = mode === bgMode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setBgMode(mode)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: `2px solid ${active ? "var(--color-accent)" : "rgba(255,255,255,0.1)"}`,
                  background: active ? "var(--color-accent-dim)" : "rgba(24,28,34,0.6)",
                  color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Font size */}
      <div className="mobile-card">
        <div className="mobile-label">Font Size</div>
        <div style={{ display: "flex", gap: 8 }}>
          {FONT_SIZES.map((f) => {
            const active = f.value === fontSize;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFontSize(f.value)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: `2px solid ${active ? "var(--color-accent)" : "rgba(255,255,255,0.1)"}`,
                  background: active ? "var(--color-accent-dim)" : "rgba(24,28,34,0.6)",
                  color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Switch to desktop */}
      <div className="mobile-card" style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
          Prefer the full desktop layout on this device?
        </p>
        <button
          type="button"
          className="mobile-btn"
          onClick={() => {
            localStorage.setItem("bl4-prefer-desktop", "1");
            window.location.href = "/";
          }}
        >
          Switch to Desktop Site
        </button>
      </div>

      <div className="mobile-card" style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 12 }}>
        <p>bl4editor.com — Mobile Edition</p>
      </div>
    </div>
  );
}
