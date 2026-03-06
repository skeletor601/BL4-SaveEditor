import { useTheme, THEMES, type ThemeId } from "@/contexts/ThemeContext";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/apiClient";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [version, setVersion] = useState<{ version?: string; downloadUrl?: string }>({});

  useEffect(() => {
    fetchApi("version")
      .then((r: Response) => r.json())
      .then(setVersion)
      .catch(() => setVersion({ version: "—", downloadUrl: "#" }));
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Settings</h1>

      <section className="rounded-lg border-2 border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
        <h2 className="text-[var(--color-accent)] font-medium mb-3">Theme</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Match the 8 themes from the desktop app.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t as ThemeId)}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                theme === t ? "border-accent bg-accent/20 text-accent" : "border-panel-border text-[var(--color-text-muted)] hover:bg-panel"
              }`}
              aria-label={`Theme ${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border-2 border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
        <h2 className="text-[var(--color-accent)] font-medium mb-3">About / Credits</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          BL4 AIO Save Editor – Web version. All credit goes to original creator <strong>Superexboom</strong>.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          Special thanks to the modders that offered ideas.
        </p>
        <p className="text-sm mt-3">
          <a href="https://BL4Editor.com" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
            BL4Editor.com
          </a>
          {" · "}
          <a href="https://github.com/skeletor601/BL4-SaveEditor" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
            Repository
          </a>
        </p>
        <p className="text-sm mt-4">
          Backend version: <span className="font-mono">{version.version ?? "—"}</span>
          {version.downloadUrl && version.downloadUrl !== "#" && (
            <a href={version.downloadUrl} target="_blank" rel="noreferrer" className="ml-2 text-[var(--color-accent)] hover:underline">
              Download desktop
            </a>
          )}
        </p>
      </section>
    </div>
  );
}
