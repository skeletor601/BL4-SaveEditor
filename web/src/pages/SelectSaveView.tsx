import { useCallback, useRef, useState } from "react";
import { useSave } from "@/contexts/SaveContext";

export default function SelectSaveView() {
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
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Select Save</h2>
      <p className="text-sm text-[var(--color-text-muted)]">Decrypt a BL4 .sav or open JSON/YAML. Decrypt and encrypt run on the server (API must be running).</p>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.6)]">
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Open .sav (decrypt)</h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">Enter your Epic Games ID or Steam ID (17 digits).</p>
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
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Open JSON/YAML or export</h3>
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
    </div>
  );
}
