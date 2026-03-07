import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import {
  getCharacterData,
  applyCharacterData,
  type CharacterFormData,
} from "@/lib/characterData";

const WORLD_PRESETS: { label: string; preset_name: string }[] = [
  { label: "Remove Map Fog", preset_name: "clear_map_fog" },
  { label: "Discover All Locations", preset_name: "discover_all_locations" },
  { label: "Unlock All Safehouses", preset_name: "complete_all_safehouse_missions" },
  { label: "Unlock All Collectibles", preset_name: "complete_all_collectibles" },
  { label: "Complete All Challenges", preset_name: "complete_all_challenges" },
  { label: "Complete All Achievements", preset_name: "complete_all_achievements" },
  { label: "Skip Story Missions", preset_name: "complete_all_story_missions" },
  { label: "Skip All Missions", preset_name: "complete_all_missions" },
];

const CHARACTER_PRESETS: { label: string; preset_name: string }[] = [
  { label: "Max Level (Level 50)", preset_name: "set_character_to_max_level" },
  { label: "Max SDU", preset_name: "set_max_sdu" },
  { label: "Unlock All Vault Gates", preset_name: "unlock_vault_powers" },
  { label: "Unlock All Hover Drives", preset_name: "unlock_all_hover_drives" },
  { label: "Unlock All Specs", preset_name: "unlock_all_specialization" },
  { label: "Unlock UVHM", preset_name: "unlock_postgame" },
  { label: "Unlock/Maximize Everything", preset_name: "unlock_max_everything" },
];

const CHARACTER_CLASSES: { key: string; name: string }[] = [
  { key: "DarkSiren", name: "Vex (Siren)" },
  { key: "Paladin", name: "Amon (Forgeknight)" },
  { key: "Gravitar", name: "Harlowe (Gravitar)" },
  { key: "ExoSoldier", name: "Rafa (Exo-Soldier)" },
];

export default function CharacterPage() {
  const { saveData, updateSaveData, getYamlText } = useSave();
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
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [selectedClassKey, setSelectedClassKey] = useState("DarkSiren");

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

  const syncLevels = useCallback(async () => {
    const yamlContent = getYamlText();
    if (!yamlContent.trim()) return;
    setMutationLoading(true);
    setMutationMessage(null);
    try {
      const res = await fetchApi("save/sync-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml_content: yamlContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let msg: string;
        if (res.status === 502 || res.status === 503) {
          msg = "API is starting up or busy (common on free hosting). Wait 30 seconds and try again.";
        } else if (isLikelyUnavailable(res)) {
          msg = getApiUnavailableError();
        } else {
          msg = data?.error ?? "Sync failed";
        }
        setMutationMessage(msg);
        return;
      }
      if (data.success && typeof data.yaml_content === "string") {
        const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
        updateSaveData(parsed);
        const ok = data.success_count ?? 0;
        const fail = data.fail_count ?? 0;
        setMutationMessage(fail > 0 ? `Synced ${ok} item(s); ${fail} failed.` : `Synced ${ok} item level(s) to character level.`);
      } else {
        setMutationMessage(data?.error ?? "Sync failed");
      }
    } catch {
      setMutationMessage(
        "Service unavailable. The API may be starting (wait 30s and retry), or check your connection. If you self-host, ensure the API is running."
      );
    } finally {
      setMutationLoading(false);
    }
  }, [getYamlText, updateSaveData]);

  const applyPreset = useCallback(
    async (presetName: string, extraParams?: Record<string, string>) => {
      const yamlContent = getYamlText();
      if (!yamlContent.trim()) return;
      setMutationLoading(true);
      setMutationMessage(null);
      try {
        const res = await fetchApi("save/apply-preset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: yamlContent, preset_name: presetName, ...extraParams }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          let msg: string;
          if (res.status === 502 || res.status === 503) {
            msg = "API is starting up or busy. Wait 30 seconds and try again.";
          } else if (isLikelyUnavailable(res)) {
            msg = getApiUnavailableError();
          } else {
            msg = data?.error ?? "Preset failed";
          }
          setMutationMessage(msg);
          return;
        }
        if (data.success && typeof data.yaml_content === "string") {
          const parsed = yamlParse(data.yaml_content) as Record<string, unknown>;
          updateSaveData(parsed);
          setMutationMessage("Preset applied. Use Download .sav on Select Save to export.");
        } else {
          setMutationMessage(data?.error ?? "Preset failed");
        }
      } catch {
        setMutationMessage(
          "Service unavailable. The API may be starting (wait 30s and retry), or check your connection."
        );
      } finally {
        setMutationLoading(false);
      }
    },
    [getYamlText, updateSaveData]
  );

  if (!saveData) {
    return (
      <div className="space-y-4">
        <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
          ← Select Save
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
        <div className="rounded-lg border-2 border-[var(--color-panel-border)] p-4 bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
          <p className="text-[var(--color-text-muted)] mb-3">No save loaded. Select a save in the Select Save tab to edit character data.</p>
          <Link
            to="/character/select-save"
            className="inline-block px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Go to Select Save
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
        ← Select Save
      </Link>
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Edit character and currency. Click Apply to update the loaded save. Then use &quot;Download .sav&quot; on Select Save to export.
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
            <span className="text-[11px] text-[var(--color-text-muted)]">Money</span>
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
          Apply Character Currency Changes
        </button>
        {applied && (
          <span className="text-sm text-[var(--color-accent)]">Saved. Use &quot;Download .sav&quot; on Select Save to export.</span>
        )}
      </div>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)] max-w-xl">
        <button
          type="button"
          onClick={syncLevels}
          disabled={mutationLoading}
          className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
        >
          {mutationLoading ? "Syncing…" : "Sync All Backpack Item Levels to Character Level"}
        </button>
        <p className="mt-2 text-sm text-amber-400/90">
          Warning: This may cause equipped items to be unequipped. You may need to re-equip them from the backpack.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h2 className="text-[var(--color-accent)] font-medium mb-3">World</h2>
          <div className="flex flex-col gap-2">
            {WORLD_PRESETS.map(({ label, preset_name }) => (
              <button
                key={preset_name}
                type="button"
                onClick={() => applyPreset(preset_name)}
                disabled={mutationLoading}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]">
          <h2 className="text-[var(--color-accent)] font-medium mb-3">Character</h2>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedClassKey}
                onChange={(e) => setSelectedClassKey(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
              >
                {CHARACTER_CLASSES.map((c) => (
                  <option key={c.key} value={c.key}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => applyPreset("set_character_class", { class_key: selectedClassKey })}
                disabled={mutationLoading}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
              >
                Change Character Class
              </button>
            </div>
            {CHARACTER_PRESETS.map(({ label, preset_name }) => (
              <button
                key={preset_name}
                type="button"
                onClick={() => applyPreset(preset_name)}
                disabled={mutationLoading}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {mutationMessage && (
        <p className="text-sm text-[var(--color-accent)]">{mutationMessage}</p>
      )}
    </div>
  );
}
