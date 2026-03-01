import { useTheme, THEMES, type ThemeId } from "@/contexts/ThemeContext";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [version, setVersion] = useState<{ version?: string; downloadUrl?: string }>({});

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => setVersion({ version: "—", downloadUrl: "#" }));
  }, []);

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Settings</h1>

      <section className="border border-panel-border rounded-lg p-6 bg-panel/80">
        <h2 className="text-accent font-medium mb-3">Theme</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Match the 8 themes from the desktop app.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t as ThemeId)}
              className={`px-3 py-2 rounded border text-sm ${
                theme === t ? "border-accent bg-accent/20 text-accent" : "border-panel-border text-[var(--color-text-muted)] hover:bg-panel"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="border border-panel-border rounded-lg p-6 bg-panel/80">
        <h2 className="text-accent font-medium mb-3">About / Credits</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          BL4 AIO Save Editor – Web version. All credit goes to original creator Superexboom.
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          Special thanks to the modders that offered ideas.
        </p>
        <p className="text-sm mt-4">
          Version (EXE): <span className="font-mono">{version.version ?? "—"}</span>
          {version.downloadUrl && (
            <a href={version.downloadUrl} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">
              Download desktop
            </a>
          )}
        </p>
      </section>
    </div>
  );
}
