import { useTheme, THEMES, THEME_META, FONT_SIZES, type ThemeId, type FontSizeValue } from "@/contexts/ThemeContext";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/apiClient";

export default function SettingsPage() {
  const { theme, setTheme, fontSize, setFontSize } = useTheme();
  const [version, setVersion] = useState<{ version?: string; downloadUrl?: string }>({});

  useEffect(() => {
    fetchApi("version")
      .then((r: Response) => r.json())
      .then(setVersion)
      .catch(() => setVersion({ version: "—", downloadUrl: "#" }));
  }, []);

  return (
    <div
      className="space-y-6 max-w-2xl"
      style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
    >
      <h1 className="text-xl font-semibold text-[var(--color-text)] font-mono tracking-wide">⚙ Settings</h1>

      {/* Theme */}
      <section className="relative rounded-xl border border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(24,28,34,0.75)] backdrop-blur-sm overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]/40 rounded-l-xl" aria-hidden="true" />
        <h2 className="text-[var(--color-accent)] font-mono text-xs tracking-widest uppercase mb-1 pl-1">⌖ Theme</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4 pl-1">8 themes — matches the desktop app.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const meta = THEME_META[t as ThemeId];
            const active = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t as ThemeId)}
                className={`flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-all ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]/30"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"
                }`}
                aria-label={`Theme ${meta.label}`}
                style={active ? { boxShadow: `0 0 14px ${meta.accent}30` } : undefined}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                  style={{
                    backgroundColor: meta.accent,
                    boxShadow: active ? `0 0 8px ${meta.accent}` : undefined,
                  }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Font Size */}
      <section className="relative rounded-xl border border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(24,28,34,0.75)] backdrop-blur-sm overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]/40 rounded-l-xl" aria-hidden="true" />
        <h2 className="text-[var(--color-accent)] font-mono text-xs tracking-widest uppercase mb-1 pl-1">⊞ Text Size</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4 pl-1">Scales all text across the entire app.</p>
        <div className="flex gap-2 flex-wrap">
          {FONT_SIZES.map((f) => {
            const active = fontSize === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFontSize(f.value as FontSizeValue)}
                className={`min-w-[56px] min-h-[44px] px-4 py-2 rounded-lg border font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-all ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]/30"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Credits */}
      <section className="relative rounded-xl border border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(24,28,34,0.75)] backdrop-blur-sm overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]/40 rounded-l-xl" aria-hidden="true" />
        <h2 className="text-[var(--color-accent)] font-mono text-xs tracking-widest uppercase mb-3 pl-1">◈ About / Credits</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          BL4 AIO Save Editor – Web version.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-3">
          <strong className="text-yellow-300">Terra</strong> - CEO, Idea Generator, Head of Quality Assurance, Shield Scientist, and the reason this editor is what it is today. None of this happens without Terra.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          <strong>YNOT</strong> - for all the help with codes and the DB, plus answering all my other million questions.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          <strong>Mattmab</strong> - for the Borderlands Item Editor reference HTML that taught us how items are built, the "Show All Parts" concept, class mod research, and being first to match strings to part numbers. The foundation this editor was built on. Also instrumental in NCS data parsing — helping us extract and update the entire item database for DLC drops including the Cowbell update.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          <strong className="text-cyan-300">Cr4nk</strong> - creator of the Borderlands 4 NCS Parser tool. Without this tool, extracting item codes, skill IDs, and part data from game files would not be possible. The backbone of every database update.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          <strong className="text-emerald-300">Gre3nZ89</strong> - tester, code hunter, and generator whisperer. Green jumped in headfirst — stress-testing every modded generator, hunting down edge cases, validating DLC weapon codes, and pushing the builders to their limits. The kind of tester every project needs.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          <strong>Spliff, Shaggy, Hydra, Shadow</strong> - the front line. Bug hunting, stress testing, and getting the word out so others can enjoy it too.
        </p>
        <p className="text-sm mt-3">
          <a href="https://BL4Editor.com" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline font-mono">
            BL4Editor.com
          </a>
          {" · "}
          <a href="https://github.com/skeletor601/BL4-SaveEditor" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline font-mono">
            GitHub
          </a>
        </p>
        <p className="text-sm mt-4 font-mono text-[var(--color-text-muted)]">
          Backend: <span className="text-[var(--color-accent)]">{version.version ?? "—"}</span>
          {version.downloadUrl && version.downloadUrl !== "#" && (
            <a href={version.downloadUrl} target="_blank" rel="noreferrer" className="ml-3 text-[var(--color-accent)] hover:underline">
              ↓ Desktop build
            </a>
          )}
        </p>
      </section>
    </div>
  );
}
