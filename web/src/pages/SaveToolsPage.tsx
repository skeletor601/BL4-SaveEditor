import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useCallback, useRef, useState } from "react";

const sections = [
  { path: "character", title: "Character", desc: "Select save, character, YAML" },
  { path: "inventory", title: "Inventory", desc: "Parts translator, backpack" },
  { path: "weapon-toolbox", title: "Weapon Toolbox", desc: "Weapon gen, weapon edit" },
  { path: "accessories", title: "Accessories", desc: "Class mod, grenades, shields" },
  { path: "parts-translator", title: "Parts Translator", desc: "Single/batch converter" },
  { path: "backpack", title: "Backpack", desc: "Item list and editor" },
];

function SaveToolsHub() {
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileInfo(`${f.name} (${(f.size / 1024).toFixed(1)} KB) – client-side only, not uploaded`);
    e.target.value = "";
  }, []);

  const exportBlob = useCallback(() => {
    const blob = new Blob(["# BL4 save export placeholder\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bl4-export.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Save Tools</h1>
      <p className="text-[var(--color-text-muted)]">All save file handling is client-side only. Nothing is uploaded.</p>

      <div className="border border-panel-border rounded-lg p-6 bg-panel/80">
        <h2 className="text-accent font-medium mb-3">File import / export</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            ref={inputRef}
            type="file"
            accept=".sav,.json,.txt"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded border border-panel-border text-accent hover:bg-panel"
          >
            Open (choose file)
          </button>
          <button
            type="button"
            onClick={exportBlob}
            className="px-4 py-2 rounded border border-panel-border text-accent hover:bg-panel"
          >
            Save / Export
          </button>
          {fileInfo && <span className="text-sm text-[var(--color-text-muted)]">{fileInfo}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map(({ path, title, desc }) => (
          <Link
            key={path}
            to={`/save-tools/${path}`}
            className="block p-4 rounded-lg border border-panel-border bg-panel/80 hover:bg-accent/10"
          >
            <h2 className="font-semibold text-accent">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PlaceholderSection({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
      <p className="text-[var(--color-text-muted)]">{desc}</p>
      <p className="text-sm text-[var(--color-text-muted)]">Phase 2 – placeholder. Full editor coming later.</p>
    </div>
  );
}

export default function SaveToolsPage() {
  const location = useLocation();
  const subPath = location.pathname.replace(/^\/save-tools\/?/, "") || "index";

  if (subPath === "index" || subPath === "") {
    return <SaveToolsHub />;
  }

  const section = sections.find((s) => s.path === subPath);
  if (section) {
    return <PlaceholderSection title={section.title} desc={section.desc} />;
  }

  return (
    <div>
      <Link to="/save-tools" className="text-accent hover:underline mb-4 inline-block">← Save Tools</Link>
      <PlaceholderSection title="Save Tools" desc="Section not found." />
    </div>
  );
}
