import { Link, useLocation } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import { useSave } from "@/contexts/SaveContext";
import CharacterPage from "@/pages/save-tools/CharacterPage";

const sections = [
  { path: "character", title: "Character", desc: "Select save, character, YAML" },
  { path: "inventory", title: "Inventory", desc: "Parts translator, backpack" },
  { path: "weapon-toolbox", title: "Weapon Toolbox", desc: "Weapon gen, weapon edit" },
  { path: "accessories", title: "Accessories", desc: "Class mod, grenades, shields" },
  { path: "parts-translator", title: "Parts Translator", desc: "Single/batch converter" },
  { path: "backpack", title: "Backpack", desc: "Item list and editor" },
];

function SaveToolsHub() {
  const inputRef = useRef<HTMLInputElement>(null);
  const savInputRef = useRef<HTMLInputElement>(null);
  const [savBytes, setSavBytes] = useState<Uint8Array | null>(null);
  const [savFileName, setSavFileName] = useState<string | null>(null);
  const [userIdInput, setUserIdInput] = useState("");
  const {
    saveData,
    saveFileName,
    loadError,
    summary,
    savePlatform,
    loadFromFile,
    decryptSav,
    clearSave,
    exportAsJson,
    exportAsYaml,
    downloadAsSav,
    downloadRebuiltSavNoEdit,
    hasRawBytesForRoundtrip,
  } = useSave();

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      loadFromFile(f);
      e.target.value = "";
    },
    [loadFromFile]
  );

  const onSavFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.arrayBuffer().then((buf) => {
      setSavBytes(new Uint8Array(buf));
      setSavFileName(f.name);
    });
    e.target.value = "";
  }, []);

  const onDecryptSav = useCallback(() => {
    if (!savBytes || !userIdInput.trim()) return;
    decryptSav(savBytes, userIdInput.trim(), savFileName);
  }, [savBytes, userIdInput, savFileName, decryptSav]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Save Tools</h1>
      <p className="text-[var(--color-text-muted)]">Load, edit, and download saves in this app. Decrypt and encrypt run on the server (API must be running).</p>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.6)]">
        <h2 className="text-[var(--color-accent)] font-medium mb-3">Open .sav (decrypt)</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">Decrypt a BL4 .sav file here. Enter your Epic Games ID or Steam ID (17 digits).</p>
        <div className="flex flex-wrap gap-3 items-end">
          <input
            ref={savInputRef}
            type="file"
            accept=".sav,application/octet-stream"
            className="hidden"
            onChange={onSavFileChange}
          />
          <button
            type="button"
            onClick={() => savInputRef.current?.click()}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Choose .sav file
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Epic or Steam User ID</span>
            <input
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="Epic ID or 17-digit Steam ID"
              className="px-3 py-2 min-h-[44px] w-[220px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <button
            type="button"
            onClick={onDecryptSav}
            disabled={!savBytes || !userIdInput.trim()}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decrypt
          </button>
        </div>
        {savFileName && <p className="mt-2 text-sm text-[var(--color-text-muted)]">Selected: {savFileName}</p>}
      </div>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.6)]">
        <h2 className="text-[var(--color-accent)] font-medium mb-3">Open JSON/YAML or export</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            ref={inputRef}
            type="file"
            accept=".json,.yaml,.yml,.txt,application/json,text/yaml,text/plain"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Open (JSON or YAML)
          </button>
          <button
            type="button"
            onClick={() => downloadRebuiltSavNoEdit()}
            disabled={!hasRawBytesForRoundtrip}
            title="Re-encrypt decrypted bytes without editing (for round-trip validation)."
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-accent)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            No-Edit Roundtrip
          </button>
          <button
            type="button"
            onClick={() => downloadAsSav()}
            disabled={!saveData || !savePlatform}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download .sav
          </button>
          <button
            type="button"
            onClick={() => exportAsJson()}
            disabled={!saveData}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export as JSON
          </button>
          <button
            type="button"
            onClick={() => exportAsYaml()}
            disabled={!saveData}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export as YAML
          </button>
          {saveData && (
            <button
              type="button"
              onClick={clearSave}
              className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"
            >
              Clear save
            </button>
          )}
        </div>
        {loadError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {loadError}
          </p>
        )}
        {summary && saveData && (
          <div className="mt-4 p-3 rounded-lg bg-[rgba(0,0,0,0.2)] text-sm text-[var(--color-text)]">
            <p className="font-medium text-[var(--color-accent)]">Loaded save</p>
            {saveFileName && <p>File: {saveFileName}</p>}
            {savePlatform && <p>Platform: {savePlatform}</p>}
            <p>Character: {summary.charName}</p>
            <p>Level: {summary.level}</p>
            {summary.difficulty !== "—" && <p>Difficulty: {summary.difficulty}</p>}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Use &quot;No-Edit Roundtrip&quot; after decrypt to download a rebuilt .sav (no YAML touch). Use &quot;Download .sav&quot; for edited or JSON/YAML-opened saves. Use “Open .sav” + your Epic or Steam User ID to load a save; edit in Character/Inventory/etc., then “Download .sav” to get an encrypted file back. You never need a PC or another site.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map(({ path, title, desc }) => (
          <Link
            key={path}
            to={`/save-tools/${path}`}
            className="block p-4 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] hover:bg-[var(--color-accent-dim)]"
          >
            <h2 className="font-semibold text-[var(--color-accent)]">{title}</h2>
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

  if (subPath === "character") {
    return <CharacterPage />;
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
