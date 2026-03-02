import { useCallback, useEffect, useState } from "react";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import type { SaveData } from "@/contexts/SaveContext";

type ViewMode = "yaml" | "tree";

function TreeNodes({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="text-[var(--color-text-muted)]">null</span>;
  }
  if (typeof data !== "object") {
    return <span className="text-[var(--color-text-muted)]">{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    return (
      <ul className="list-none pl-4 border-l border-[var(--color-panel-border)] space-y-1">
        {data.map((item, i) => (
          <li key={i} className="text-sm">
            <span className="text-[var(--color-accent)]">[{i}]</span>{" "}
            <TreeNodes data={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  const obj = data as Record<string, unknown>;
  return (
    <ul className="list-none pl-4 border-l border-[var(--color-panel-border)] space-y-1">
      {Object.entries(obj).map(([key, value]) => (
        <li key={key} className="text-sm">
          <span className="text-[var(--color-accent)] font-medium">{key}:</span>{" "}
          {typeof value === "object" && value !== null ? <TreeNodes data={value} depth={depth + 1} /> : <span className="text-[var(--color-text-muted)]">{String(value)}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function YamlPage() {
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [viewMode, setViewMode] = useState<ViewMode>("yaml");
  const [yamlText, setYamlText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const refreshFromContext = useCallback(() => {
    setYamlText(getYamlText());
    setParseError(null);
  }, [getYamlText]);

  useEffect(() => {
    refreshFromContext();
  }, [saveData, refreshFromContext]);

  const handleApply = useCallback(() => {
    setParseError(null);
    try {
      const parsed = yamlParse(yamlText) as SaveData;
      if (parsed && typeof parsed === "object") {
        updateSaveData(parsed);
      } else {
        setParseError("Parsed result is not an object.");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parse error.");
    }
  }, [yamlText, updateSaveData]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-accent)]">YAML</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode("yaml")}
          className={`px-4 py-2 rounded-lg border text-sm ${viewMode === "yaml" ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]" : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"}`}
        >
          YAML View
        </button>
        <button
          type="button"
          onClick={() => setViewMode("tree")}
          className={`px-4 py-2 rounded-lg border text-sm ${viewMode === "tree" ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]" : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"}`}
        >
          Tree View
        </button>
      </div>

      {viewMode === "yaml" && (
        <>
          <p className="text-xs text-[var(--color-text-muted)]">Edit raw YAML (as-is). Apply to update the save; Download .sav from Select Save to export.</p>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            className="w-full min-h-[400px] p-4 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] font-mono text-sm resize-y focus:outline-none focus:border-[var(--color-accent)]"
            spellCheck={false}
          />
          {parseError && <p className="text-sm text-red-400" role="alert">{parseError}</p>}
          <button
            type="button"
            onClick={handleApply}
            disabled={!yamlText.trim()}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply changes
          </button>
        </>
      )}

      {viewMode === "tree" && (
        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-4 overflow-auto max-h-[70vh]">
          {saveData ? <TreeNodes data={saveData} /> : <p className="text-[var(--color-text-muted)]">No save loaded. Use Select Save to decrypt a .sav or open JSON/YAML.</p>}
        </div>
      )}
    </div>
  );
}
