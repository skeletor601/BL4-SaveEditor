import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import { FLAG_OPTIONS } from "@/components/weapon-toolbox/builderStyles";

type ParsedEntry = {
  lineNumber: number;
  raw: string;
};

export default function CodeSpawnView() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [bulkInput, setBulkInput] = useState("");
  const [flagValue, setFlagValue] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const parsedEntries = useMemo<ParsedEntry[]>(() => {
    return bulkInput
      .split(/\r?\n/)
      .map((line, idx) => ({ lineNumber: idx + 1, raw: line.trim() }))
      .filter((item) => item.raw.length > 0);
  }, [bulkInput]);

  const handleAddAllToBackpack = async () => {
    if (!saveData) {
      setMessage("Load a save first (Character -> Select Save).");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent.trim()) {
      setMessage("No save YAML loaded.");
      return;
    }
    if (parsedEntries.length === 0) {
      setMessage("Paste at least one Base85 or deserialized code.");
      return;
    }

    setIsRunning(true);
    setMessage(null);

    let workingYaml = yamlContent;
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (const entry of parsedEntries) {
        let serial = entry.raw;

        if (!serial.startsWith("@")) {
          const encodeRes = await fetchApi("save/encode-serial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decoded_string: serial }),
          });
          const encodeData = await encodeRes.json().catch(() => ({}));
          if (!encodeRes.ok || !encodeData?.success || typeof encodeData?.serial !== "string") {
            failures.push(`Line ${entry.lineNumber}: could not encode deserialized code.`);
            continue;
          }
          serial = encodeData.serial;
        }

        const addRes = await fetchApi("save/add-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            yaml_content: workingYaml,
            serial,
            flag: String(flagValue),
          }),
        });
        const addData = await addRes.json().catch(() => ({}));
        if (!addRes.ok || !addData?.success || typeof addData?.yaml_content !== "string") {
          const reason = isLikelyUnavailable(addRes)
            ? getApiUnavailableError()
            : (addData?.error ?? "add failed");
          failures.push(`Line ${entry.lineNumber}: ${reason}`);
          continue;
        }

        workingYaml = addData.yaml_content;
        successCount += 1;
      }

      if (successCount > 0) {
        updateSaveData(yamlParse(workingYaml) as Record<string, unknown>);
      }

      if (successCount > 0 && failures.length === 0) {
        setMessage(`Added ${successCount} item(s) to backpack.`);
      } else if (successCount > 0) {
        setMessage(`Added ${successCount} item(s); ${failures.length} failed. ${failures.slice(0, 4).join(" | ")}`);
      } else {
        setMessage(`No items added. ${failures.slice(0, 4).join(" | ") || "All entries failed."}`);
      }
    } catch {
      setMessage(getApiUnavailableError());
    } finally {
      setIsRunning(false);
    }
  };

  if (!saveData) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-accent)]">Add in Bulk</h2>
        <p className="text-[var(--color-text-muted)]">
          Load a save first (Character to Select Save) to spawn codes into backpack.
        </p>
        <Link to="/character/select-save" className="text-[var(--color-accent)] hover:underline inline-block">
          Go to Select Save
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">Add in Bulk</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Paste one code per line. Base85 (`@...`) and deserialized strings are both supported.
      </p>

      <div className="border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)] space-y-3">
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder={"@U...\n255, 0, 1, 50| ... || {12} {4:7}"}
          rows={12}
          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y focus:outline-none focus:border-[var(--color-accent)]"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">Flag:</span>
            <select
              value={flagValue}
              onChange={(e) => setFlagValue(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
            >
              {FLAG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleAddAllToBackpack}
            disabled={isRunning || parsedEntries.length === 0}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black text-sm font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
          >
            {isRunning ? "Adding..." : "Add to Backpack"}
          </button>

          <span className="text-xs text-[var(--color-text-muted)]">
            {parsedEntries.length} code(s) detected
          </span>
        </div>
      </div>

      {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
    </div>
  );
}
