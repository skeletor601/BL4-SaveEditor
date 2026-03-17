/**
 * Feature 16: Community Recipe Vault
 * Browse and submit shared grenade/weapon recipes.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/apiClient";
import { useCodeHistory } from "@/lib/useCodeHistory";

interface CommunityRecipe {
  id: string;
  itemType: string;
  title: string;
  description?: string;
  code: string;
  decoded?: string;
  submittedAt: number;
  upvotes: number;
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

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000)      return "just now";
  if (d < 3_600_000)   return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000)  return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function CommunityVaultPage() {
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({ itemType: "grenade", title: "", description: "", code: "", decoded: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const { addEntry } = useCodeHistory();

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi("community/recipes");
      const data = await res.json().catch(() => ({})) as { success?: boolean; recipes?: CommunityRecipe[] };
      if (data.success && Array.isArray(data.recipes)) {
        setRecipes(data.recipes);
      } else {
        setError("Failed to load recipes.");
      }
    } catch {
      setError("API unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRecipes(); }, [loadRecipes]);

  const handleCopy = (recipe: CommunityRecipe) => {
    navigator.clipboard.writeText(recipe.code).catch(() => {});
    setCopiedId(recipe.id);
    addEntry({ itemType: recipe.itemType, code: recipe.code, decoded: recipe.decoded });
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleUpvote = async (id: string) => {
    if (upvotedIds.has(id)) return;
    setUpvotedIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetchApi(`community/recipes/${id}/upvote`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { upvotes?: number };
      if (data.upvotes != null) {
        setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, upvotes: data.upvotes! } : r));
      }
    } catch {
      setUpvotedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleSubmit = async () => {
    if (!submitForm.code.trim().startsWith("@U")) {
      setSubmitMessage("Code must start with @U (Base85 serial).");
      return;
    }
    if (!submitForm.title.trim()) {
      setSubmitMessage("Title is required.");
      return;
    }
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await fetchApi("community/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitForm),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (data.success) {
        setSubmitMessage("Submitted! Thanks for sharing.");
        setSubmitForm({ itemType: "grenade", title: "", description: "", code: "", decoded: "" });
        void loadRecipes();
        setTimeout(() => setShowSubmit(false), 2000);
      } else {
        setSubmitMessage(data.error ?? "Submit failed.");
      }
    } catch {
      setSubmitMessage("API unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = recipes.filter((r) => {
    if (typeFilter && r.itemType !== typeFilter) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [r.title, r.description ?? "", r.itemType, r.code].join(" ").toLowerCase().includes(q);
  });

  const itemTypes = [...new Set(recipes.map((r) => r.itemType))].sort();

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">Community Vault</h1>
          <p className="text-sm opacity-60">Browse and share grenade/weapon recipes from the community.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSubmit((v) => !v)}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm hover:opacity-90 min-h-[44px]"
        >
          {showSubmit ? "Cancel" : "+ Submit Recipe"}
        </button>
      </div>

      {/* Submit form */}
      {showSubmit && (
        <div className="border border-[var(--color-panel-border)] rounded-lg p-4 space-y-3 bg-[rgba(24,28,34,0.8)]">
          <h2 className="text-sm font-medium">Submit a Recipe</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs opacity-60 mb-1">Item type</label>
              <select
                value={submitForm.itemType}
                onChange={(e) => setSubmitForm((f) => ({ ...f, itemType: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm"
              >
                {["weapon","grenade","shield","class-mod","repkit","heavy","enhancement"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs opacity-60 mb-1">Title *</label>
              <input
                type="text"
                maxLength={100}
                value={submitForm.title}
                onChange={(e) => setSubmitForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. The Swarm build"
                className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Description</label>
            <input
              type="text"
              maxLength={500}
              value={submitForm.description}
              onChange={(e) => setSubmitForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this do? Any tips?"
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Base85 code * (@U...)</label>
            <input
              type="text"
              value={submitForm.code}
              onChange={(e) => setSubmitForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="@U..."
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Decoded string (optional)</label>
            <input
              type="text"
              value={submitForm.decoded}
              onChange={(e) => setSubmitForm((f) => ({ ...f, decoded: e.target.value }))}
              placeholder="263, 0, 1, 50| 2, 305|| ..."
              className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm font-mono"
            />
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm hover:opacity-90 disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
            {submitMessage && <p className="text-xs opacity-80">{submitMessage}</p>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search recipes…"
          className="flex-1 min-w-[180px] px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm"
        >
          <option value="">All types</option>
          {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={loadRecipes} className="px-3 py-2 rounded border border-[var(--color-panel-border)] text-sm hover:bg-white/5">
          Refresh
        </button>
      </div>

      {/* Recipe list */}
      {loading ? (
        <p className="text-sm opacity-50 text-center py-8">Loading recipes…</p>
      ) : error ? (
        <p className="text-sm text-red-400 text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm opacity-50 text-center py-8">No recipes found. Be the first to submit!</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((recipe) => {
            const color = TYPE_COLORS[recipe.itemType] ?? "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
            return (
              <div key={recipe.id} className="border border-[var(--color-panel-border)] rounded-lg p-3 bg-[rgba(24,28,34,0.6)] space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${color}`}>
                    {recipe.itemType}
                  </span>
                  <span className="font-medium text-sm flex-1 truncate">{recipe.title}</span>
                  <span className="text-[10px] opacity-40 shrink-0">{timeAgo(recipe.submittedAt)}</span>
                </div>
                {recipe.description && (
                  <p className="text-xs opacity-70">{recipe.description}</p>
                )}
                <div className="font-mono text-[11px] opacity-50 truncate">{recipe.code.slice(0, 60)}{recipe.code.length > 60 ? "…" : ""}</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleCopy(recipe)}
                    className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {copiedId === recipe.id ? "✓ Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUpvote(recipe.id)}
                    disabled={upvotedIds.has(recipe.id)}
                    className={`text-xs px-2.5 py-1 rounded transition-colors ${
                      upvotedIds.has(recipe.id)
                        ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                        : "bg-white/5 hover:bg-white/15 border border-white/10"
                    }`}
                  >
                    ▲ {recipe.upvotes}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
