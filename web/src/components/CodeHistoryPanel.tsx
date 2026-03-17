import { useState } from "react";
import { type CodeHistoryEntry, useCodeHistory } from "@/lib/useCodeHistory";

const TYPE_COLORS: Record<string, string> = {
  weapon:      "bg-orange-500/20 text-orange-300 border-orange-500/40",
  grenade:     "bg-green-500/20  text-green-300  border-green-500/40",
  shield:      "bg-blue-500/20   text-blue-300   border-blue-500/40",
  "class-mod": "bg-purple-500/20 text-purple-300 border-purple-500/40",
  repkit:      "bg-cyan-500/20   text-cyan-300   border-cyan-500/40",
  heavy:       "bg-red-500/20    text-red-300    border-red-500/40",
  enhancement: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000)      return "just now";
  if (d < 3_600_000)   return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000)  return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

interface Props {
  /** Called when user clicks Load on an entry. */
  onLoad?: (entry: CodeHistoryEntry) => void;
}

export default function CodeHistoryPanel({ onLoad }: Props) {
  const { entries, removeEntry, updateLabel, clearAll } = useCodeHistory();
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editVal,   setEditVal]     = useState("");
  const [copiedId,  setCopiedId]    = useState<string | null>(null);
  const [open, setOpen]             = useState(false);

  const copy = (entry: CodeHistoryEntry) => {
    navigator.clipboard.writeText(entry.code).catch(() => {});
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
      >
        <span>Recent Codes {entries.length > 0 && <span className="opacity-50 font-normal">({entries.length})</span>}</span>
        <span className="opacity-40 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-2 space-y-1 max-h-96 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-xs opacity-40 py-4 text-center">
              No history yet — copy a code to start tracking.
            </p>
          ) : (
            <>
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[10px] opacity-40 hover:opacity-80 transition-opacity"
                >
                  Clear all
                </button>
              </div>

              {entries.map((entry) => {
                const color = TYPE_COLORS[entry.itemType] ?? "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
                const isEditing = editingId === entry.id;
                return (
                  <div key={entry.id} className="rounded border border-white/10 bg-white/5 p-2 space-y-1">
                    {/* Top row: type badge + time + actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${color}`}>
                        {entry.itemType}
                      </span>
                      <span className="text-[10px] opacity-40 shrink-0">{timeAgo(entry.timestamp)}</span>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => copy(entry)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          {copiedId === entry.id ? "✓" : "Copy"}
                        </button>
                        {onLoad && (
                          <button
                            type="button"
                            onClick={() => onLoad(entry)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/40 transition-colors"
                          >
                            Load
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/30 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Label / code row */}
                    {isEditing ? (
                      <div className="flex gap-1">
                        <input
                          className="flex-1 text-xs bg-white/10 border border-white/20 rounded px-1.5 py-0.5 outline-none"
                          value={editVal}
                          placeholder="Add a label…"
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")  { updateLabel(entry.id, editVal); setEditingId(null); }
                            if (e.key === "Escape") { setEditingId(null); }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => { updateLabel(entry.id, editVal); setEditingId(null); }}
                          className="text-[10px] px-2 rounded bg-white/10 hover:bg-white/20"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div
                        className="text-xs font-mono truncate opacity-60 hover:opacity-90 cursor-text transition-opacity"
                        title={`Click to label · ${entry.code}`}
                        onClick={() => { setEditingId(entry.id); setEditVal(entry.label ?? ""); }}
                      >
                        {entry.label
                          ? <><span className="font-sans not-italic opacity-90 mr-1">{entry.label}</span><span className="opacity-40 text-[10px]">· {entry.code.slice(0, 24)}…</span></>
                          : entry.code.length > 48 ? entry.code.slice(0, 48) + "…" : entry.code
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
