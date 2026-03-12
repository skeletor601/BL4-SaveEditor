import { useCallback, useRef, useState } from "react";
import { useSave } from "@/contexts/SaveContext";

const USER_ID_STORAGE_KEY = "bl4-save-user-id";
const OVERWRITE_TIP_STORAGE_KEY = "bl4-save-hide-overwrite-tip";

function getStoredUserId(): string {
  try {
    return localStorage.getItem(USER_ID_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function SelectSaveView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const savInputRef = useRef<HTMLInputElement>(null);
  const [, setSavBytes] = useState<Uint8Array | null>(null);
  const [savFileName, setSavFileName] = useState<string | null>(null);
  const [userIdInput, setUserIdInput] = useState(getStoredUserId);
  const [, setIsDecrypting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hideOverwriteTip, setHideOverwriteTip] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OVERWRITE_TIP_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
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

  const onSavFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      f.arrayBuffer().then(async (buf) => {
        const bytes = new Uint8Array(buf);
        setSavBytes(bytes);
        setSavFileName(f.name);
        const uid = userIdInput.trim();
        if (!uid) return;
        setIsDecrypting(true);
        try {
          await decryptSav(bytes, uid, f.name);
          try {
            localStorage.setItem(USER_ID_STORAGE_KEY, uid);
          } catch {}
        } finally {
          setIsDecrypting(false);
        }
      });
      e.target.value = "";
    },
    [decryptSav, userIdInput],
  );

  const saveUserIdToStorage = useCallback(() => {
    const v = userIdInput.trim();
    if (!v) return;
    try {
      localStorage.setItem(USER_ID_STORAGE_KEY, v);
    } catch {}
  }, [userIdInput]);

  const clearSavedUserId = useCallback(() => {
    try {
      localStorage.removeItem(USER_ID_STORAGE_KEY);
    } catch {}
    setUserIdInput("");
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Select Save</h2>
      <p className="text-sm text-[var(--color-text-muted)]">Decrypt a BL4 .sav or open JSON/YAML. Decrypt and encrypt run on the server (API must be running).</p>

      <div className="rounded-lg border-2 border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Open .sav (decrypt)</h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">Enter your Epic Games ID or Steam ID (17 digits). Your ID is remembered on this device.</p>
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
              onBlur={saveUserIdToStorage}
              placeholder="Epic ID or 17-digit Steam ID"
              className="px-3 py-2 min-h-[44px] w-[220px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          {userIdInput && (
            <button
              type="button"
              onClick={clearSavedUserId}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] underline min-h-[44px] flex items-center"
            >
              Clear saved ID
            </button>
          )}
        </div>
        {savFileName && <p className="mt-2 text-sm text-[var(--color-text-muted)]">Selected: {savFileName}</p>}
        {!userIdInput.trim() && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Enter your User ID first; when you choose a .sav it will decrypt automatically.
          </p>
        )}
      </div>

      <div className="rounded-lg border-2 border-[var(--color-panel-border)] p-4 sm:p-6 bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
        <h3 className="text-[var(--color-accent)] font-medium mb-3">Open JSON/YAML or export</h3>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">Back up your original save before replacing it with a downloaded .sav.</p>
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
            onClick={async () => {
              if (!hasRawBytesForRoundtrip) return;
              setIsDownloading(true);
              try {
                await downloadRebuiltSavNoEdit();
              } finally {
                setIsDownloading(false);
              }
            }}
            disabled={!hasRawBytesForRoundtrip || isDownloading}
            title="Re-encrypt decrypted bytes without editing (for round-trip validation)."
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-accent)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? "Downloading…" : "No-Edit Roundtrip"}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!saveData || !savePlatform) return;
              setIsDownloading(true);
              try {
                await downloadAsSav();
              } finally {
                setIsDownloading(false);
              }
            }}
            disabled={!saveData || !savePlatform || isDownloading}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? "Saving…" : "Overwrite save"}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!saveData || !savePlatform) return;
              const base =
                saveFileName?.replace(/\.(json|yaml|yml|txt)$/i, ".sav") ?? "bl4-save.sav";
              const name = window.prompt("Save as filename", base);
              if (!name) return;
              setIsDownloading(true);
              try {
                await downloadAsSav(name);
              } finally {
                setIsDownloading(false);
              }
            }}
            disabled={!saveData || !savePlatform || isDownloading}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? "Saving…" : "Save As…"}
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
        {!hideOverwriteTip && (
          <div className="mt-3 text-[11px] text-[var(--color-text-muted)] space-y-1 border-t border-[var(--color-panel-border)] pt-2">
            <p>
              <strong className="text-[var(--color-text)]">Tip:</strong> To truly overwrite your save, choose the same folder your
              .sav came from and accept your browser&apos;s &quot;Replace?&quot; prompt. &quot;Overwrite save&quot; always uses the
              original filename so this is just a two-click flow.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideOverwriteTip}
                onChange={(e) => {
                  const next = e.target.checked;
                  setHideOverwriteTip(next);
                  try {
                    if (next) localStorage.setItem(OVERWRITE_TIP_STORAGE_KEY, "1");
                    else localStorage.removeItem(OVERWRITE_TIP_STORAGE_KEY);
                  } catch {
                    // ignore storage errors
                  }
                }}
                className="rounded border-[var(--color-panel-border)]"
              />
              <span>Don&apos;t show this tip again</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
