import { useCallback } from "react";
import { usePersistedState } from "./usePersistedState";

export interface CodeHistoryEntry {
  id: string;
  timestamp: number;
  /** item type slug: "weapon" | "grenade" | "shield" | "class-mod" | "repkit" | "heavy" | "enhancement" */
  itemType: string;
  /** Base85 serial (@U...) */
  code: string;
  /** Optional decoded string (header||parts) */
  decoded?: string;
  /** User-editable label */
  label?: string;
}

const MAX_HISTORY = 20;

export function useCodeHistory() {
  const [entries, setEntries] = usePersistedState<CodeHistoryEntry[]>("codeHistory.v1", []);

  const addEntry = useCallback(
    (entry: Omit<CodeHistoryEntry, "id" | "timestamp">) => {
      setEntries((prev) => {
        const newEntry: CodeHistoryEntry = {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
        };
        // Deduplicate by exact code string
        const filtered = prev.filter((e) => e.code !== entry.code);
        return [newEntry, ...filtered].slice(0, MAX_HISTORY);
      });
    },
    [setEntries],
  );

  const removeEntry = useCallback(
    (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)),
    [setEntries],
  );

  const updateLabel = useCallback(
    (id: string, label: string) =>
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e))),
    [setEntries],
  );

  const clearAll = useCallback(() => setEntries([]), [setEntries]);

  return { entries, addEntry, removeEntry, updateLabel, clearAll };
}
