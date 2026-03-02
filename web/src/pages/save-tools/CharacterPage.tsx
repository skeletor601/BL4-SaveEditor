import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useSave } from "@/contexts/SaveContext";
import {
  getCharacterData,
  applyCharacterData,
  type CharacterFormData,
} from "@/lib/characterData";

export default function CharacterPage() {
  const { saveData, updateSaveData } = useSave();
  const [form, setForm] = useState<CharacterFormData>({
    charName: "",
    difficulty: "",
    level: "",
    xp: "",
    specLevel: "",
    specPoints: "",
    cash: "",
    eridium: "",
  });
  const [applied, setApplied] = useState(false);

  const data = saveData ? getCharacterData(saveData) : null;

  useEffect(() => {
    if (!saveData) return;
    const charData = getCharacterData(saveData);
    if (charData) {
      setForm({
        charName: charData.charName,
        difficulty: charData.difficulty,
        level: charData.level,
        xp: charData.xp,
        specLevel: charData.specLevel,
        specPoints: charData.specPoints,
        cash: charData.cash,
        eridium: charData.eridium,
      });
    }
  }, [saveData]);

  const onApply = useCallback(() => {
    if (!saveData) return;
    const next = applyCharacterData(saveData, form);
    updateSaveData(next);
    setApplied(true);
  }, [saveData, form, updateSaveData]);

  if (!saveData) {
    return (
      <div className="space-y-4">
        <Link to="/save-tools" className="text-[var(--color-accent)] hover:underline inline-block">
          ← Save Tools
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
        <p className="text-[var(--color-text-muted)]">
          Load a save first: go to Save Tools, decrypt a .sav (or open JSON/YAML), then come back here to view and edit character data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/save-tools" className="text-[var(--color-accent)] hover:underline inline-block">
        ← Save Tools
      </Link>
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Edit character and currency. Click Apply to update the loaded save. Then use &quot;Download .sav&quot; on Save Tools to export.
      </p>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.6)] max-w-xl">
        <h2 className="text-[var(--color-accent)] font-medium mb-4">Character info</h2>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Character name</span>
            <input
              type="text"
              value={form.charName}
              onChange={(e) => setForm((f) => ({ ...f, charName: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Difficulty</span>
            <input
              type="text"
              value={form.difficulty}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-text-muted)]">Level</span>
              <input
                type="text"
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-text-muted)]">XP (points)</span>
              <input
                type="text"
                value={form.xp}
                onChange={(e) => setForm((f) => ({ ...f, xp: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-text-muted)]">Spec level</span>
              <input
                type="text"
                value={form.specLevel}
                onChange={(e) => setForm((f) => ({ ...f, specLevel: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-text-muted)]">Spec points</span>
              <input
                type="text"
                value={form.specPoints}
                onChange={(e) => setForm((f) => ({ ...f, specPoints: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-6 bg-[rgba(24,28,34,0.6)] max-w-xl">
        <h2 className="text-[var(--color-accent)] font-medium mb-4">Currency</h2>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Cash</span>
            <input
              type="text"
              value={form.cash}
              onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Eridium</span>
            <input
              type="text"
              value={form.eridium}
              onChange={(e) => setForm((f) => ({ ...f, eridium: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={onApply}
          className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)]"
        >
          Apply changes
        </button>
        {applied && (
          <span className="text-sm text-[var(--color-accent)]">Saved. Use &quot;Download .sav&quot; on Save Tools to export.</span>
        )}
      </div>
    </div>
  );
}
