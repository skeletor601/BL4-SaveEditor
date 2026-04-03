import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "@/lib/apiClient";
import MobileSelect from "../components/MobileSelect";
import { showToast } from "../components/Toast";

interface CommunityRecipe {
  id: string;
  itemType: string;
  title: string;
  description?: string;
  code: string;
  decoded?: string;
  submittedAt: number;
  upvotes: number;
  seed?: number;
  authorName?: string;
  imageFilename?: string;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  weapon:      { bg: "rgba(249,115,22,0.15)", text: "#fb923c" },
  grenade:     { bg: "rgba(34,197,94,0.15)",  text: "#4ade80" },
  shield:      { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  "class-mod": { bg: "rgba(168,85,247,0.15)", text: "#a78bfa" },
  repkit:      { bg: "rgba(34,211,238,0.15)", text: "#22d3ee" },
  heavy:       { bg: "rgba(239,68,68,0.15)",  text: "#f87171" },
  enhancement: { bg: "rgba(234,179,8,0.15)",  text: "#facc15" },
};

const BADGE_COLORS = ["#a855f7", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#84cc16", "#ec4899", "#0ea5e9", "#eab308"];

const ITEM_TYPES = [
  { value: "", label: "All Types" },
  { value: "weapon", label: "Weapon" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "class-mod", label: "Class Mod" },
  { value: "repkit", label: "RepKit" },
  { value: "heavy", label: "Heavy" },
  { value: "enhancement", label: "Enhancement" },
];

const PROFILE_SEED_KEY = "bl4-community-seed";
const PROFILE_NAME_KEY = "bl4-community-name";

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

export default function MobileCommunityPage() {
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Submit state
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({ itemType: "weapon", title: "", description: "", code: "", decoded: "" });
  const [submitImage, setSubmitImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile
  const [profileSeed] = useState(() => localStorage.getItem(PROFILE_SEED_KEY) ?? "");
  const [_profileName] = useState(() => localStorage.getItem(PROFILE_NAME_KEY) ?? "");

  // Image lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Adding image to existing recipe
  const [addingImageId, setAddingImageId] = useState<string | null>(null);
  const addImageRef = useRef<HTMLInputElement>(null);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi("community/recipes");
      const data = await res.json().catch(() => ({})) as { success?: boolean; recipes?: CommunityRecipe[] };
      if (data.success && Array.isArray(data.recipes)) setRecipes(data.recipes);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void loadRecipes(); }, [loadRecipes]);

  const handleCopy = (recipe: CommunityRecipe) => {
    navigator.clipboard.writeText(recipe.code).then(() => showToast("Code copied!")).catch(() => showToast("Copy failed"));
  };

  const handleUpvote = async (id: string) => {
    if (upvotedIds.has(id)) return;
    setUpvotedIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetchApi(`community/recipes/${id}/upvote`, { method: "POST", body: "{}" });
      const data = await res.json().catch(() => ({})) as { upvotes?: number };
      if (data.upvotes != null) setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, upvotes: data.upvotes! } : r));
    } catch { setUpvotedIds((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>, target: "submit" | string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (target === "submit") {
        setSubmitImage(base64);
      } else {
        // Upload to existing recipe
        void uploadImageToRecipe(target, base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadImageToRecipe = async (id: string, base64: string) => {
    try {
      const res = await fetchApi(`community/recipes/${id}/image`, {
        method: "POST",
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; imageFilename?: string };
      if (data.success && data.imageFilename) {
        setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, imageFilename: data.imageFilename } : r));
        showToast("Image uploaded!");
      } else {
        showToast("Upload failed");
      }
    } catch { showToast("Upload failed"); }
    setAddingImageId(null);
  };

  const handleSubmit = async () => {
    if (!submitForm.code.trim().startsWith("@U")) { setSubmitMsg("Code must start with @U"); return; }
    if (!submitForm.title.trim()) { setSubmitMsg("Title is required"); return; }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const seedNum = Number(profileSeed);
      const payload: Record<string, unknown> = { ...submitForm, ...(seedNum >= 1 && seedNum <= 9999 ? { seed: seedNum } : {}) };
      if (submitImage) payload.image = submitImage;
      const res = await fetchApi("community/recipes", { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (data.success) {
        showToast("Submitted!");
        setSubmitForm({ itemType: "weapon", title: "", description: "", code: "", decoded: "" });
        setSubmitImage(null);
        setShowSubmit(false);
        void loadRecipes();
      } else { setSubmitMsg(data.error ?? "Failed"); }
    } catch { setSubmitMsg("API unavailable"); }
    setSubmitting(false);
  };

  const filtered = recipes.filter((r) => {
    if (typeFilter && r.itemType !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.title, r.description ?? "", r.itemType, r.authorName ?? ""].join(" ").toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mobile-page-header">
        <h1>Community Codes</h1>
        <p>{recipes.length} shared builds</p>
      </div>

      {/* Search + Filter */}
      <input
        type="text"
        className="mobile-input"
        placeholder="Search codes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <MobileSelect label="Filter by Type" options={ITEM_TYPES} value={typeFilter} onChange={setTypeFilter} />

      {/* Submit button */}
      <button
        type="button"
        className="mobile-btn primary"
        onClick={() => setShowSubmit(!showSubmit)}
        style={{ marginBottom: 14 }}
      >
        {showSubmit ? "Cancel" : "+ Share a Code"}
      </button>

      {/* Submit form */}
      {showSubmit && (
        <div className="mobile-card">
          <div className="mobile-label">Share Your Build</div>
          <MobileSelect
            label="Item Type"
            required
            options={ITEM_TYPES.filter((t) => t.value)}
            value={submitForm.itemType}
            onChange={(v) => setSubmitForm((f) => ({ ...f, itemType: v }))}
          />
          <div className="mobile-field">
            <div className="mobile-label">Title <span className="required">Required</span></div>
            <input className="mobile-input" value={submitForm.title} onChange={(e) => setSubmitForm((f) => ({ ...f, title: e.target.value }))} placeholder="My awesome build" maxLength={100} />
          </div>
          <div className="mobile-field">
            <div className="mobile-label">Description</div>
            <textarea className="mobile-textarea" value={submitForm.description} onChange={(e) => setSubmitForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes…" rows={2} maxLength={500} />
          </div>
          <div className="mobile-field">
            <div className="mobile-label">Code <span className="required">Required</span></div>
            <textarea className="mobile-textarea" value={submitForm.code} onChange={(e) => setSubmitForm((f) => ({ ...f, code: e.target.value }))} placeholder="@U..." rows={2} />
          </div>
          <div className="mobile-field">
            <div className="mobile-label">Decoded String</div>
            <textarea className="mobile-textarea" value={submitForm.decoded} onChange={(e) => setSubmitForm((f) => ({ ...f, decoded: e.target.value }))} placeholder="Optional decoded…" rows={2} />
          </div>

          {/* Image upload */}
          <div className="mobile-field">
            <div className="mobile-label">Screenshot</div>
            {submitImage ? (
              <div style={{ marginBottom: 8 }}>
                <img src={submitImage} alt="Preview" style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, border: "1px solid var(--color-panel-border)" }} />
                <button type="button" className="mobile-btn danger" onClick={() => setSubmitImage(null)} style={{ marginTop: 6 }}>Remove Image</button>
              </div>
            ) : (
              <button type="button" className="mobile-btn" onClick={() => fileInputRef.current?.click()}>
                Add Screenshot
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => handleImagePick(e, "submit")} />
          </div>

          {submitMsg && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{submitMsg}</p>}
          <button type="button" className="mobile-btn primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading…</div>}

      {/* Recipe list */}
      {filtered.map((recipe) => {
        const tc = TYPE_COLORS[recipe.itemType] ?? { bg: "rgba(255,255,255,0.05)", text: "var(--color-text-muted)" };
        const expanded = expandedId === recipe.id;
        const badgeColor = recipe.seed ? BADGE_COLORS[recipe.seed % BADGE_COLORS.length] : null;
        const imgUrl = recipe.imageFilename ? `/api/community/images/${recipe.imageFilename}` : null;

        return (
          <div key={recipe.id} className="mobile-card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Header — always visible */}
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : recipe.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", background: "none", border: "none",
                color: "var(--color-text)", fontSize: 14, textAlign: "left",
                cursor: "pointer", touchAction: "manipulation", minHeight: 48,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {/* Type badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                padding: "3px 7px", borderRadius: 4, flexShrink: 0,
                background: tc.bg, color: tc.text,
              }}>
                {recipe.itemType}
              </span>
              {/* Title */}
              <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {recipe.title}
              </span>
              {/* Upvotes */}
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>
                ▲{recipe.upvotes}
              </span>
              {/* Chevron */}
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{expanded ? "▲" : "▼"}</span>
            </button>

            {/* Expanded content */}
            {expanded && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                {/* Author + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  {recipe.authorName && recipe.seed && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                      padding: "2px 8px", borderRadius: 10, color: "#fff",
                      background: badgeColor ?? "var(--color-accent)",
                    }}>
                      #{recipe.authorName}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{timeAgo(recipe.submittedAt)}</span>
                </div>

                {/* Description */}
                {recipe.description && <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{recipe.description}</p>}

                {/* Image */}
                {imgUrl && (
                  <div style={{ marginBottom: 10 }}>
                    <img
                      src={imgUrl}
                      alt={recipe.title}
                      onClick={() => setLightbox(imgUrl)}
                      style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, border: "1px solid var(--color-panel-border)", cursor: "pointer" }}
                    />
                  </div>
                )}

                {/* Code */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontFamily: "monospace", fontSize: 11, color: "var(--color-text)", wordBreak: "break-all", lineHeight: 1.4 }}>
                  {recipe.code}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="mobile-btn" onClick={() => handleCopy(recipe)} style={{ flex: 1, minWidth: 100 }}>
                    Copy Code
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpvote(recipe.id)}
                    disabled={upvotedIds.has(recipe.id)}
                    style={{
                      minHeight: 44, padding: "8px 16px", borderRadius: 10,
                      border: `1px solid ${upvotedIds.has(recipe.id) ? "#4ade80" : "var(--color-panel-border)"}`,
                      background: upvotedIds.has(recipe.id) ? "rgba(74,222,128,0.1)" : "transparent",
                      color: upvotedIds.has(recipe.id) ? "#4ade80" : "var(--color-text)",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
                    }}
                  >
                    ▲ {recipe.upvotes}
                  </button>
                  {!recipe.imageFilename && (
                    <>
                      <button type="button" className="mobile-btn" onClick={() => { setAddingImageId(recipe.id); setTimeout(() => addImageRef.current?.click(), 50); }} style={{ flex: 1, minWidth: 100 }}>
                        Add Photo
                      </button>
                    </>
                  )}
                </div>

                {/* Decoded */}
                {recipe.decoded && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>Decoded</div>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 8px", fontFamily: "monospace", fontSize: 10, color: "var(--color-text-muted)", wordBreak: "break-all" }}>
                      {recipe.decoded}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && filtered.length === 0 && (
        <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
          No codes found
        </div>
      )}

      {/* Hidden file input for adding images to existing recipes */}
      <input
        ref={addImageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => { if (addingImageId) handleImagePick(e, addingImageId); }}
      />

      {/* Image lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.85)", display: "flex",
            alignItems: "center", justifyContent: "center",
            padding: 16, cursor: "pointer",
          }}
        >
          <img src={lightbox} alt="Full size" style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
