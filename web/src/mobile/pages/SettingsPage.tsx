import { useState } from "react";
import { fetchApi } from "@/lib/apiClient";
import { useTheme, THEMES, THEME_META, BG_MODES, BG_MODE_META, FONT_SIZES } from "@/contexts/ThemeContext";
import { showToast } from "../components/Toast";

const PROFILE_SEED_KEY = "bl4-community-seed";
const PROFILE_NAME_KEY = "bl4-community-name";
const BADGE_COLORS = ["#a855f7", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#84cc16", "#ec4899", "#0ea5e9", "#eab308"];

export default function MobileSettingsPage() {
  const { theme, setTheme, bgMode, setBgMode, fontSize, setFontSize } = useTheme();
  const [profileSeed, setProfileSeed] = useState(() => localStorage.getItem(PROFILE_SEED_KEY) ?? "");
  const [profileName, setProfileName] = useState(() => localStorage.getItem(PROFILE_NAME_KEY) ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const isRegistered = !!profileSeed && !!profileName;

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

      {/* Community Profile */}
      <div className="mobile-card">
        <div className="mobile-label">Community Profile</div>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: 12 }}>
          Set a seed number and nickname. When you share codes in the Community tab,
          your nickname will appear as a colored badge so others know who made it.
          Use the same seed as your in-game item seed to link your identity.
        </p>

        {isRegistered && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Your badge:</span>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
              padding: "3px 10px", borderRadius: 10, color: "#fff",
              background: BADGE_COLORS[Number(profileSeed) % BADGE_COLORS.length],
            }}>
              #{profileName}
            </span>
          </div>
        )}

        <div className="mobile-field">
          <div className="mobile-label">Seed (1–9999)</div>
          <input
            type="number"
            className="mobile-input"
            value={profileSeed}
            min={1}
            max={9999}
            onChange={(e) => setProfileSeed(e.target.value)}
            placeholder="e.g. 1234"
          />
        </div>
        <div className="mobile-field">
          <div className="mobile-label">Nickname</div>
          <input
            type="text"
            className="mobile-input"
            value={profileName}
            maxLength={30}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <button
          type="button"
          className="mobile-btn primary"
          disabled={profileSaving}
          onClick={async () => {
            const seedNum = Number(profileSeed);
            if (!seedNum || seedNum < 1 || seedNum > 9999) { showToast("Seed must be 1–9999"); return; }
            if (!profileName.trim() || profileName.trim().length > 30) { showToast("Name required (max 30 chars)"); return; }
            setProfileSaving(true);
            try {
              const res = await fetchApi("community/profiles", { method: "POST", body: JSON.stringify({ seed: seedNum, name: profileName.trim() }) });
              const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
              if (data.success) {
                localStorage.setItem(PROFILE_SEED_KEY, String(seedNum));
                localStorage.setItem(PROFILE_NAME_KEY, profileName.trim());
                showToast("Profile saved!");
              } else { showToast(data.error ?? "Save failed"); }
            } catch { showToast("API unavailable"); }
            setProfileSaving(false);
          }}
        >
          {profileSaving ? "Saving…" : isRegistered ? "Update Profile" : "Save Profile"}
        </button>
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
