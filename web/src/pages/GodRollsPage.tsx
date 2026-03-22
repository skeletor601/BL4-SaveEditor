/**
 * God Rolls (Non-Modded) — standalone page.
 * Shows built-in god rolls from godrolls.json + community-submitted god rolls.
 * Users can submit their own, upvote, filter by category.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";
import { AuthorBadge } from "@/pages/CommunityVaultPage";

interface CommunityGodRoll {
  id: string;
  name: string;
  decoded: string;
  description?: string;
  submittedAt: number;
  upvotes: number;
  seed?: number;
  authorName?: string;
  source: "builtin" | "community";
}

const TYPE_COLORS: Record<string, string> = {
  weapon:      "bg-orange-500/20 text-orange-300 border-orange-500/40",
  grenade:     "bg-green-500/20  text-green-300  border-green-500/40",
  shield:      "bg-blue-500/20   text-blue-300   border-blue-500/40",
  "class-mod": "bg-purple-500/20 text-purple-300 border-purple-500/40",
  repkit:      "bg-cyan-500/20   text-cyan-300   border-cyan-500/40",
  heavy:       "bg-red-500/20    text-red-300    border-red-500/40",
  enhancement: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};

function inferGodRollCategory(decoded: string): string {
  const m = decoded.match(/^\s*(\d+)\s*,/);
  if (!m) return "other";
  const pfx = Number(m[1]);
  if (pfx >= 3 && pfx <= 27) return "weapon";
  if (pfx === 234 || (pfx >= 254 && pfx <= 259)) return "class-mod";
  if ([237, 246, 248, 279, 283, 287, 293, 300, 306, 312, 321].includes(pfx)) return "shield";
  if ([245, 263, 267, 270, 272, 278, 291, 298, 311].includes(pfx)) return "grenade";
  if ([243, 261, 265, 266, 269, 274, 277, 285, 290].includes(pfx)) return "repkit";
  if ([247, 264, 268, 271, 281, 284, 286, 292, 296, 299, 303, 310].includes(pfx)) return "enhancement";
  if ([244, 273, 275, 282, 289].includes(pfx)) return "heavy";
  return "other";
}

const GOD_ROLL_CATEGORIES = ["weapon", "shield", "grenade", "class-mod", "repkit", "enhancement", "heavy"] as const;

const PROFILE_SEED_KEY = "bl4-community-seed";
const PROFILE_NAME_KEY = "bl4-community-name";

export default function GodRollsPage() {
  const [godrolls, setGodrolls] = useState<CommunityGodRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({ name: "", decoded: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const profileSeed = localStorage.getItem(PROFILE_SEED_KEY) ?? "";
  const profileName = localStorage.getItem(PROFILE_NAME_KEY) ?? "";
  const isProfileRegistered = !!profileSeed && !!profileName;

  const loadGodrolls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi("community/godrolls");
      const data = await res.json().catch(() => ({})) as { success?: boolean; godrolls?: CommunityGodRoll[] };
      if (data.success && Array.isArray(data.godrolls)) setGodrolls(data.godrolls);
      else setError("Failed to load god rolls.");
    } catch { setError("API unavailable."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadGodrolls(); }, [loadGodrolls]);

  const handleCopy = (gr: CommunityGodRoll) => {
    navigator.clipboard.writeText(gr.decoded).catch(() => {});
    setCopiedId(gr.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleUpvote = async (id: string) => {
    if (id.startsWith("builtin-") || upvotedIds.has(id)) return;
    setUpvotedIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetchApi(`community/godrolls/${id}/upvote`, { method: "POST", body: "{}" });
      const data = await res.json().catch(() => ({})) as { upvotes?: number };
      if (data.upvotes != null) setGodrolls((prev) => prev.map((r) => r.id === id ? { ...r, upvotes: data.upvotes! } : r));
    } catch { setUpvotedIds((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const handleSubmit = async () => {
    if (!submitForm.name.trim()) { setSubmitMessage("Name is required."); return; }
    if (!submitForm.decoded.trim()) { setSubmitMessage("Decoded string is required."); return; }
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const seedNum = Number(profileSeed);
      const payload = { ...submitForm, ...(seedNum >= 1 && seedNum <= 9999 ? { seed: seedNum } : {}) };
      const res = await fetchApi("community/godrolls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (data.success) {
        setSubmitMessage("God roll submitted!");
        setSubmitForm({ name: "", decoded: "", description: "" });
        void loadGodrolls();
        setTimeout(() => setShowSubmit(false), 2000);
      } else { setSubmitMessage(data.error ?? "Submit failed."); }
    } catch { setSubmitMessage("API unavailable."); }
    finally { setSubmitting(false); }
  };

  const filtered = godrolls.filter((gr) => {
    if (catFilter) {
      const cat = inferGodRollCategory(gr.decoded);
      if (cat !== catFilter) return false;
    }
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [gr.name, gr.description ?? "", gr.decoded, gr.authorName ?? ""].join(" ").toLowerCase().includes(q);
  });

  const communityCount = godrolls.filter((g) => g.source === "community").length;
  const builtinCount = godrolls.filter((g) => g.source === "builtin").length;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">God Rolls (Non-Modded)</h1>
          <p className="text-sm opacity-60">{builtinCount} built-in, {communityCount} community submitted. Legit god roll configurations.</p>
        </div>
        <button type="button" onClick={() => setShowSubmit((v) => !v)} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium text-sm hover:bg-amber-500/30 min-h-[44px]">
          {showSubmit ? "Cancel" : "+ Submit God Roll"}
        </button>
      </div>

      {/* Submit form */}
      {showSubmit && (
        <div className="border border-amber-500/30 rounded-lg p-4 space-y-3 bg-[rgba(24,28,34,0.8)]">
          <h2 className="text-sm font-medium text-amber-400">Submit a Non-Modded God Roll</h2>
          {isProfileRegistered && (
            <div className="flex items-center gap-2 text-xs opacity-60">
              <span>Posting as</span>
              <AuthorBadge name={profileName} seed={Number(profileSeed)} />
            </div>
          )}
          <div>
            <label className="block text-xs opacity-60 mb-1">Name *</label>
            <input type="text" maxLength={100} value={submitForm.name} onChange={(e) => setSubmitForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Fire Convergence Jakobs Ricochet" className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm" />
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Decoded string *</label>
            <input type="text" value={submitForm.decoded} onChange={(e) => setSubmitForm((f) => ({ ...f, decoded: e.target.value }))} placeholder="7, 0, 1, 50| 2, 3308|| {100} {2} {6} ..." className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Description (optional)</label>
            <input type="text" maxLength={500} value={submitForm.description} onChange={(e) => setSubmitForm((f) => ({ ...f, description: e.target.value }))} placeholder="What makes this a god roll?" className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm" />
          </div>
          <div className="flex gap-2 items-center">
            <button type="button" onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium text-sm hover:bg-amber-500/30 disabled:opacity-50 min-h-[44px]">
              {submitting ? "Submitting…" : "Submit"}
            </button>
            {submitMessage && <p className="text-xs opacity-80">{submitMessage}</p>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search god rolls…" className="flex-1 min-w-[180px] px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm">
          <option value="">All categories</option>
          {GOD_ROLL_CATEGORIES.map((c) => <option key={c} value={c}>{c === "class-mod" ? "Class Mod" : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <button type="button" onClick={loadGodrolls} className="px-3 py-2 rounded border border-[var(--color-panel-border)] text-sm hover:bg-white/5">Refresh</button>
      </div>

      {/* God roll list */}
      {loading ? (
        <p className="text-sm opacity-50 text-center py-8">Loading god rolls…</p>
      ) : error ? (
        <p className="text-sm text-red-400 text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm opacity-50 text-center py-8">No god rolls found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((gr) => {
            const cat = inferGodRollCategory(gr.decoded);
            const catColor = TYPE_COLORS[cat] ?? "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
            return (
              <div key={gr.id} className={`border rounded-lg p-3 space-y-2 ${gr.source === "builtin" ? "border-amber-500/20 bg-[rgba(24,28,34,0.4)]" : "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)]"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${catColor}`}>
                    {cat === "class-mod" ? "class mod" : cat}
                  </span>
                  {gr.source === "builtin" ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/20 text-amber-300 shrink-0">BUILT-IN</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shrink-0">COMMUNITY</span>
                  )}
                  {gr.authorName && gr.seed && <AuthorBadge name={gr.authorName} seed={gr.seed} />}
                  <span className="font-medium text-sm flex-1 truncate">{gr.name}</span>
                  {gr.submittedAt > 0 && (
                    <span className="text-[10px] opacity-40 shrink-0">
                      {(() => { const d = Date.now() - gr.submittedAt; if (d < 60_000) return "just now"; if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`; if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`; return `${Math.floor(d / 86_400_000)}d ago`; })()}
                    </span>
                  )}
                </div>
                {gr.description && <p className="text-xs opacity-70">{gr.description}</p>}
                <div className="font-mono text-[11px] opacity-50 truncate">{gr.decoded.slice(0, 80)}{gr.decoded.length > 80 ? "…" : ""}</div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => handleCopy(gr)} className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors">
                    {copiedId === gr.id ? "Copied" : "Copy"}
                  </button>
                  {gr.source === "community" && (
                    <button type="button" onClick={() => void handleUpvote(gr.id)} disabled={upvotedIds.has(gr.id)} className={`text-xs px-2.5 py-1 rounded transition-colors ${upvotedIds.has(gr.id) ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "bg-white/5 hover:bg-white/15 border border-white/10"}`}>
                      {gr.upvotes}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
