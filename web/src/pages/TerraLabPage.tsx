/**
 * /terra — Terra's private testing ground.
 * Top-secret features land here first before going public.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";

export default function TerraLabPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");

  // Simple passphrase gate — keeps randoms out, Terra knows the code
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="text-6xl opacity-20 select-none">⚗</div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Terra's Lab</h1>
          <p className="text-sm text-[var(--color-text-muted)]">This area is restricted. Enter the passphrase.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim() === "420") setUnlocked(true); }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Passphrase"
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center text-lg tracking-wider focus:border-[var(--color-accent)] focus:outline-none"
              autoFocus
            />
          </form>
          <p className="text-[10px] text-[var(--color-text-muted)]/30 select-none">If you know, you know.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
      {/* Header */}
      <header className="border-b border-amber-500/20 px-6 py-4" style={{ backgroundColor: "rgba(18, 21, 27, 0.9)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚗</span>
            <div>
              <h1 className="text-lg font-bold text-amber-400">Terra's Lab</h1>
              <p className="text-[10px] font-mono tracking-widest text-amber-400/50">TOP SECRET TESTING GROUND</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              TERRA ONLINE
            </span>
            <Link to="/" className="text-xs text-[var(--color-text-muted)] hover:text-amber-400">← Home</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div className="rounded-xl border border-amber-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
          <div className="relative px-6 py-6">
            <p className="text-amber-400 font-bold text-lg mb-2">What's up Terra</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              This is your private lab. New features drop here first before going public.
              Break stuff, test stuff, send feedback. The usual.
            </p>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabCard
            title="Modded Weapon Generator v2"
            status="testing"
            desc="Auto-fill stock base, heavy barrel accessories on all guns, visual barrel stacking, 24 grenade recipes, firmware whitelist. Generate and report back."
            link="/beta/unified-item-builder"
          />
          <LabCard
            title="Modded Grenade Generator"
            status="new"
            desc="Full grenade modding — auto-fill Legendary base, cross-category parts (shield, enhancement, class mod, heavy). Hit 'Generate Modded' in grenade builder."
            link="/beta/unified-item-builder"
          />
          <LabCard
            title="24 Grenade Visual Recipes"
            status="testing"
            desc="Singularity Storm, Artillery Barrage, Lingering Inferno, Black Hole, MIRV Madness, Neutron Star, and more. Style-tagged with complementary perk injection."
          />
          <LabCard
            title="Barrel DPS Calculator Fix"
            status="new"
            desc="Parser now handles DMG format (Torgue/Vladof) + Reload fire rate. 138/149 barrels now have damage data. 11 heavy legendaries still need lootlemon lookup."
          />
          <LabCard
            title="Claude's Gun (1/20)"
            status="easter-egg"
            desc="Thought Storm grenade recipe, Radiation Convergence barrel ×4, Deadeye firmware ×3, Maliwan heavy accessories. Purple pulsing banner when rolled."
          />
          <LabCard
            title="New App Layout"
            status="live"
            desc="Sidebar nav with Command Center, Gear Lab, Arsenal, Save Ops, The Vault, Workbench. Now the official homepage."
          />
        </div>

        {/* Testing checklist */}
        <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="px-5 py-3 border-b border-[var(--color-panel-border)]">
            <h3 className="text-sm font-semibold text-amber-400">Testing Checklist</h3>
          </div>
          <div className="p-5 space-y-2 text-sm">
            <CheckItem label="Generate 10+ weapons — do they all spawn?" />
            <CheckItem label="Every weapon has a non-kinetic element?" />
            <CheckItem label="Visual barrels look correct (stacked 2-4×)?" />
            <CheckItem label="Heavy barrel accessories show up on non-heavy weapons?" />
            <CheckItem label="Grenade generator produces valid grenades?" />
            <CheckItem label="Grenade recipes create distinct visuals?" />
            <CheckItem label="DPS panel shows trait badges + roll counter?" />
            <CheckItem label="Roll 20+ times — did Claude's Gun appear?" />
            <CheckItem label="New homepage layout works on mobile?" />
            <CheckItem label="Search 'chatgpt' in Master Search — see the Easter egg?" />
          </div>
        </div>

        {/* Live Feedback System */}
        <FeedbackPanel author="Terra" />

        {/* Credits */}
        <div className="text-center text-[10px] font-mono text-[var(--color-text-muted)]/30 select-none space-y-1">
          <p>Terra-Morpheous — The ideas guy. Half the features in this app exist because of you.</p>
          <p>Built with Claude. Powered by late nights and good ideas.</p>
        </div>
      </main>
    </div>
  );
}

function LabCard({ title, status, desc, link }: { title: string; status: "new" | "testing" | "live" | "easter-egg"; desc: string; link?: string }) {
  const statusColors = {
    "new": "border-blue-500/40 bg-blue-500/10 text-blue-400",
    "testing": "border-amber-500/40 bg-amber-500/10 text-amber-400",
    "live": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    "easter-egg": "border-purple-500/40 bg-purple-500/10 text-purple-400",
  };
  const content = (
    <div className="rounded-xl border border-[var(--color-panel-border)] p-4 hover:border-amber-500/30 transition-colors" style={{ backgroundColor: "rgba(18, 21, 27, 0.6)" }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-[var(--color-text)]">{title}</h4>
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${statusColors[status]}`}>
          {status === "easter-egg" ? "egg" : status}
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{desc}</p>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

function CheckItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="w-4 h-4 rounded border-2 border-[var(--color-panel-border)] bg-transparent checked:bg-amber-500 checked:border-amber-500 cursor-pointer"
      />
      <span className={`${checked ? "line-through text-[var(--color-text-muted)]/50" : "text-[var(--color-text)]"} group-hover:text-amber-400 transition-colors`}>
        {label}
      </span>
    </label>
  );
}

// ── Feedback Panel ──────────────────────────────────────────────────────────
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

const STATUS_COLORS: Record<string, string> = {
  new: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  seen: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  fixed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  wontfix: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]",
};

function FeedbackPanel({ author }: { author: string }) {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("bug");
  const [page, setPage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetchApi("feedback");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setEntries(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetchApi("feedback", {
        method: "POST",
        body: JSON.stringify({ author, type, message: message.trim(), page: page.trim() }),
      });
      if (res.ok) {
        setMessage("");
        setPage("");
        setStatus("Sent!");
        loadEntries();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(data.error ?? "Failed to send.");
      }
    } catch {
      setStatus("Failed — API might be down.");
    } finally {
      setSending(false);
    }
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="rounded-xl border border-amber-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
      <div className="px-5 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-400">Live Feedback</h3>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">DrLecter sees everything here</span>
      </div>

      {/* Submit form */}
      <div className="p-4 border-b border-[var(--color-panel-border)] space-y-3">
        <div className="flex gap-2">
          {(["bug", "idea", "question", "note"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${type === t ? TYPE_COLORS[t] : "border-transparent text-[var(--color-text-muted)]/50"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind? Bug reports, ideas, questions..."
          className="w-full h-20 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-sm resize-y focus:border-amber-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="Which page/feature? (optional)"
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={sending || !message.trim()}
            className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm font-medium hover:bg-amber-500/30 disabled:opacity-50 min-h-[40px]"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {status && <p className="text-xs text-amber-400">{status}</p>}
      </div>

      {/* Entries list */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-[var(--color-panel-border)]/50">
        {entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">No feedback yet. Be the first!</div>
        ) : entries.map((e) => (
          <div key={e.id} className="px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[var(--color-text)]">{e.author}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${TYPE_COLORS[e.type] ?? TYPE_COLORS.note}`}>{e.type}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${STATUS_COLORS[e.status] ?? STATUS_COLORS.new}`}>{e.status}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{timeAgo(e.timestamp)}</span>
              {e.page && <span className="text-[10px] text-[var(--color-text-muted)] font-mono">@ {e.page}</span>}
            </div>
            <p className="text-xs text-[var(--color-text)] leading-relaxed">{e.message}</p>
            {e.reply && (
              <div className="mt-1 pl-3 border-l-2 border-emerald-500/40">
                <p className="text-[10px] text-emerald-400 font-bold">DrLecter:</p>
                <p className="text-xs text-[var(--color-text-muted)]">{e.reply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
