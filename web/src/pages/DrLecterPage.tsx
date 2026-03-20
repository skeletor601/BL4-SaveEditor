/**
 * /drlecter — DrLecter's private command center.
 * See all feedback from Terra and other testers. Reply, mark status.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";

interface FeedbackEntry {
  id: string;
  author: string;
  type: string;
  message: string;
  page: string;
  status: string;
  reply?: string;
  timestamp: number;
}

const TYPE_COLORS: Record<string, string> = {
  bug: "border-red-500/40 bg-red-500/10 text-red-400",
  idea: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  question: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  note: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]",
};

const STATUS_OPTIONS = ["new", "seen", "fixed", "wontfix"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  seen: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  fixed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  wontfix: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]",
};

export default function DrLecterPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetchApi("feedback");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setEntries(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (unlocked) loadEntries(); }, [unlocked, loadEntries]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(loadEntries, 30000);
    return () => clearInterval(interval);
  }, [unlocked, loadEntries]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetchApi(`feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      loadEntries();
    } catch { /* ignore */ }
  };

  const sendReply = async (id: string) => {
    const text = replyText[id]?.trim();
    if (!text) return;
    try {
      await fetchApi(`feedback/${id}`, { method: "PATCH", body: JSON.stringify({ reply: text, status: "seen" }) });
      setReplyText((prev) => ({ ...prev, [id]: "" }));
      loadEntries();
    } catch { /* ignore */ }
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="text-6xl opacity-20 select-none">🔒</div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">DrLecter's Office</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Authorized personnel only.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim() === "6211") setUnlocked(true); }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Passphrase"
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center text-lg tracking-wider focus:border-[var(--color-accent)] focus:outline-none"
              autoFocus
            />
          </form>
        </div>
      </div>
    );
  }

  const filtered = filter === "all" ? entries : entries.filter((e) => e.status === filter || e.type === filter);
  const newCount = entries.filter((e) => e.status === "new").length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
      <header className="border-b border-[var(--color-accent)]/20 px-6 py-4" style={{ backgroundColor: "rgba(18, 21, 27, 0.9)" }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-accent)]">DrLecter's Office</h1>
              <p className="text-[10px] font-mono tracking-widest text-[var(--color-accent)]/50">FEEDBACK COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {newCount > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 animate-pulse">
                {newCount} new
              </span>
            )}
            <Link to="/" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">← Home</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {["all", "new", "seen", "fixed", "bug", "idea", "question"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                  : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {f === "all" ? `All (${entries.length})` : `${f} (${entries.filter((e) => e.status === f || e.type === f).length})`}
            </button>
          ))}
          <button onClick={loadEntries} className="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
            Refresh
          </button>
        </div>

        {/* Entries */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-panel-border)] p-8 text-center text-sm text-[var(--color-text-muted)]" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
              {entries.length === 0 ? "No feedback yet. Terra hasn't broken anything... yet." : "No matches for this filter."}
            </div>
          ) : filtered.map((e) => (
            <div key={e.id} className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
              <div className="px-4 py-3 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--color-text)]">{e.author}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${TYPE_COLORS[e.type] ?? TYPE_COLORS.note}`}>{e.type}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">{timeAgo(e.timestamp)}</span>
                  {e.page && <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-white/5 px-1.5 py-0.5 rounded">@ {e.page}</span>}
                </div>
                {/* Message */}
                <p className="text-sm text-[var(--color-text)] leading-relaxed">{e.message}</p>
                {/* Existing reply */}
                {e.reply && (
                  <div className="pl-3 border-l-2 border-emerald-500/40 mt-2">
                    <p className="text-[10px] text-emerald-400 font-bold">Your reply:</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{e.reply}</p>
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(e.id, s)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-colors ${
                        e.status === s ? STATUS_COLORS[s] : "border-transparent text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {/* Reply input */}
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={replyText[e.id] ?? ""}
                    onChange={(ev) => setReplyText((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                    placeholder="Reply to this..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-[var(--color-accent)] focus:outline-none"
                    onKeyDown={(ev) => { if (ev.key === "Enter") sendReply(e.id); }}
                  />
                  <button
                    onClick={() => sendReply(e.id)}
                    disabled={!replyText[e.id]?.trim()}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-xs disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
