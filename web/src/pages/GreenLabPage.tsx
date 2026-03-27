/**
 * /green — Green's private testing ground.
 * Same feature set as Terra's lab — code vault, grenade codes, feedback.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";

export default function GreenLabPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="text-6xl opacity-20 select-none">🧪</div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Green's Lab</h1>
          <p className="text-sm text-[var(--color-text-muted)]">This area is restricted. Enter the passphrase.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim() === "9989") setUnlocked(true); }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Passphrase"
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-center text-lg tracking-wider focus:border-emerald-500 focus:outline-none"
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
      <header className="border-b border-emerald-500/20 px-6 py-4" style={{ backgroundColor: "rgba(18, 21, 27, 0.9)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧪</span>
            <div>
              <h1 className="text-lg font-bold text-emerald-400">Green's Lab</h1>
              <p className="text-[10px] font-mono tracking-widest text-emerald-400/50">TESTING GROUND</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              GREEN ONLINE
            </span>
            <Link to="/" className="text-xs text-[var(--color-text-muted)] hover:text-emerald-400">← Home</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="rounded-xl border border-emerald-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="relative px-6 py-6">
            <p className="text-emerald-400 font-bold text-lg mb-2">What's up Green</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              This is your private lab. Test features, save codes, send feedback.
              Everything here survives redeploys — your data is persistent.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabCard title="DLC Cowbell — C4SH Character" status="new" desc="New character C4SH (Rogue) fully integrated. Class mod builder has all 100 skills across 3 trees (blue/red/green) with color-tinted icons, descriptions, and 5-tier skill IDs. Test building C4SH class mods." link="/beta/unified-item-builder" />
          <LabCard title="34 New DLC Legendary Weapons" status="new" desc="Mantra, Shalashaska, Roulette, Eigenburst, Flash Cyclone, Inscriber, Jetsetter, Doeshot, Mercredi, and more. All with enriched perk descriptions and red text. 6 Pearlescent weapons. Check weapon builder dropdowns." link="/beta/unified-item-builder" />
          <LabCard title="Custom Modded Grenade Generator" status="new" desc="Pick manufacturer + legendary grenade, then mods are stacked on top. Same as custom weapon generator. Hit 'Generate Modded' in grenade tab for Random/Custom modal." link="/beta/unified-item-builder" />
          <LabCard title="Grenade Reload + Inf Alt Fire Combo" status="new" desc="Both modes can now be selected together in the weapon generator. Get grenade reload AND infinite ammo Rowan's Charge on the same gun." link="/beta/unified-item-builder" />
          <LabCard title="New DLC Shields, Grenades, Repkits" status="new" desc="Honey Badger, Elpis Star, Hopscotch, Undershield (shields). Barb'ara, Bismuth-Tipped Dagger, Urchin, Slippy (grenades). Healthraiser, Blood Moon, Geiger-Roid (repkits). All with full descriptions." link="/beta/unified-item-builder" />
          <LabCard title="Pearl Rarity — 33%" status="testing" desc="Pearl rarity chance changed to 33% for both weapon and grenade generators. Was 100% weapons / 10% grenades. Test that non-pearl weapons still generate correctly." link="/beta/unified-item-builder" />
          <LabCard title="5,680 Parts in Universal DB" status="live" desc="All weapon parts now in Master Search. Search for any weapon by name, barrel, or code." link="/master-search" />
          <LabCard title="Modded Repkit Generator" status="testing" desc="60 recipe archetypes (Tank, DPS, Healer, Speed, Elemental, Brawler, Support, Terra Specials). Class mod perks matched per archetype. Random elemental perks." link="/beta/unified-item-builder" />
        </div>

        {/* Testing checklist */}
        <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="px-5 py-3 border-b border-[var(--color-panel-border)]">
            <h3 className="text-sm font-semibold text-emerald-400">Testing Checklist</h3>
          </div>
          <div className="p-5 space-y-2 text-sm">
            <CheckItem label="Select C4SH in class mod builder — do all 100 skills show with colored icons?" />
            <CheckItem label="Click a C4SH skill — does the popup show name + description?" />
            <CheckItem label="Max All Skills button works for C4SH?" />
            <CheckItem label="Build a C4SH legendary class mod — does the code generate correctly?" />
            <CheckItem label="New DLC weapons show in weapon builder rarity dropdown (Shalashaska, Roulette, etc.)?" />
            <CheckItem label="Pearl weapons show 'Pearl' in rarity dropdown (Eigenburst, Handcannon, Conflux)?" />
            <CheckItem label="Custom modded grenade generator — pick manufacturer + legendary, does it generate?" />
            <CheckItem label="Grenade Reload + Inf Alt Fire both selected — does the weapon get both?" />
            <CheckItem label="Generate 10+ weapons — ~33% should be Pearl rarity?" />
            <CheckItem label="New shields in shield builder (Honey Badger, Hopscotch, Undershield, Elpis Star)?" />
            <CheckItem label="New grenades in grenade builder (Urchin, Slippy, Barb'ara, Bismuth)?" />
            <CheckItem label="New repkits in repkit builder (Healthraiser, Blood Moon, Geiger-Roid)?" />
            <CheckItem label="Master Search — search 'Mantra' or 'Shalashaska' — do new weapons appear?" />
            <CheckItem label="Modded repkit generator — test all 8 categories (Tank, DPS, Healer, etc.)?" />
          </div>
        </div>

        <GreenGrenadeCodes />
        <GreenVault />
        <FeedbackPanel author="Green" />

        <div className="text-center text-[10px] font-mono text-[var(--color-text-muted)]/30 select-none space-y-1">
          <p>Green — Welcome to the team. Break stuff, report stuff.</p>
          <p>Built with Claude. Powered by late nights and good ideas.</p>
        </div>
      </main>
    </div>
  );
}

function LabCard({ title, status, desc, link }: { title: string; status: "new" | "testing" | "live" | "easter-egg"; desc: string; link?: string }) {
  const statusColors = {
    "new": "border-blue-500/40 bg-blue-500/10 text-blue-400",
    "testing": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    "live": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    "easter-egg": "border-purple-500/40 bg-purple-500/10 text-purple-400",
  };
  const content = (
    <div className="rounded-xl border border-[var(--color-panel-border)] p-4 hover:border-emerald-500/30 transition-colors" style={{ backgroundColor: "rgba(18, 21, 27, 0.6)" }}>
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
      <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
        className="w-4 h-4 rounded border-2 border-[var(--color-panel-border)] bg-transparent checked:bg-emerald-500 checked:border-emerald-500 cursor-pointer" />
      <span className={`${checked ? "line-through text-[var(--color-text-muted)]/50" : "text-[var(--color-text)]"} group-hover:text-emerald-400 transition-colors`}>{label}</span>
    </label>
  );
}

// ── Green's Grenade Codes ────────────────────────────────────────────────────
function GreenGrenadeCodes() {
  const [codes, setCodes] = useState<Array<{ id: string; name: string; code: string; rating: string; notes: string; timestamp: number }>>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rating, setRating] = useState<string>("mid");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchApi("green-grenade-codes");
      const data = await res.json();
      if (Array.isArray(data)) setCodes(data);
    } catch { /* offline */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async () => {
    if (!code.trim()) { setMsg("Code is required"); return; }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetchApi("green-grenade-codes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, rating, notes }),
      });
      const data = await res.json() as { success?: boolean };
      if (data.success) {
        setMsg("Saved!");
        setName(""); setCode(""); setNotes(""); setRating("mid");
        void load();
        setTimeout(() => setMsg(null), 2000);
      }
    } catch { setMsg("Failed"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    await fetchApi(`green-grenade-codes/${id}`, { method: "DELETE" }).catch(() => {});
    void load();
  };

  const ratingColors: Record<string, string> = {
    banger: "border-green-500/50 bg-green-500/20 text-green-300",
    good: "border-cyan-500/50 bg-cyan-500/20 text-cyan-300",
    mid: "border-yellow-500/50 bg-yellow-500/20 text-yellow-300",
    dud: "border-red-500/50 bg-red-500/20 text-red-300",
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
      <div className="px-5 py-3 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
        <h3 className="text-sm font-semibold text-emerald-400">Grenade Codes</h3>
        <p className="text-[10px] text-[var(--color-text-muted)]">Post grenade codes here — DrLecter uses these to create new recipes for the generator.</p>
      </div>
      <div className="p-4 border-b border-[var(--color-panel-border)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grenade name (optional)" maxLength={60} className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm" />
          <select value={rating} onChange={(e) => setRating(e.target.value)} className="px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm">
            <option value="banger">Banger</option><option value="good">Good</option><option value="mid">Mid</option><option value="dud">Dud</option>
          </select>
        </div>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste decoded grenade code here..." rows={3} className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm font-mono" />
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" maxLength={200} className="w-full px-3 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-sm" />
        <div className="flex gap-2 items-center">
          <button type="button" onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium text-sm hover:bg-emerald-500/30 disabled:opacity-50">
            {submitting ? "Saving…" : "Save Code"}
          </button>
          {msg && <span className="text-xs opacity-70">{msg}</span>}
        </div>
      </div>
      <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
        {codes.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No grenade codes yet. Be the first!</p>
        ) : codes.map((c) => (
          <div key={c.id} className="border border-[var(--color-panel-border)] rounded-lg p-3 bg-[rgba(24,28,34,0.4)] space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ratingColors[c.rating] ?? ratingColors.mid}`}>{c.rating.toUpperCase()}</span>
              <span className="text-sm font-medium flex-1 truncate">{c.name || "Unnamed"}</span>
              <button type="button" onClick={() => void handleDelete(c.id)} className="text-[10px] text-red-400/50 hover:text-red-400">delete</button>
            </div>
            {c.notes && <p className="text-xs text-[var(--color-text-muted)]">{c.notes}</p>}
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]/60 truncate">{c.code.slice(0, 100)}...</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Green's Code Vault ──────────────────────────────────────────────────────
const ITEM_TYPES = ["weapon", "grenade", "shield", "class-mod", "repkit", "enhancement", "heavy", "other"] as const;
const ITEM_TYPE_COLORS: Record<string, string> = {
  weapon: "border-red-500/40 bg-red-500/10 text-red-400",
  grenade: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  shield: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  "class-mod": "border-green-500/40 bg-green-500/10 text-green-400",
  repkit: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  enhancement: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  heavy: "border-pink-500/40 bg-pink-500/10 text-pink-400",
  other: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]",
};

function GreenVault() {
  const [entries, setEntries] = useState<Array<{ id: string; label: string; code: string; type: string; tags: string[]; notes: string; author: string; timestamp: number }>>([]);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<string>("weapon");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editType, setEditType] = useState("weapon");
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (e: { id: string; label: string; code: string; notes: string; tags: string[]; type: string }) => {
    setEditingId(e.id); setEditLabel(e.label); setEditCode(e.code); setEditNotes(e.notes); setEditTags(e.tags.join(", ")); setEditType(e.type);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const res = await fetchApi(`green-vault/${editingId}`, { method: "PATCH", body: JSON.stringify({ label: editLabel.trim(), code: editCode.trim(), notes: editNotes.trim(), tags: editTags.split(",").map((t) => t.trim()).filter(Boolean), type: editType }) });
      if (res.ok) { setEditingId(null); loadEntries(); }
    } catch { /* ignore */ }
    finally { setEditSaving(false); }
  };

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetchApi("green-vault");
      if (res.ok) { const data = await res.json(); if (Array.isArray(data)) setEntries(data); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSave = async () => {
    if (!code.trim() || !label.trim()) return;
    setSaving(true); setStatus(null);
    try {
      const res = await fetchApi("green-vault", {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), code: code.trim(), type, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), notes: notes.trim(), author: "Green" }),
      });
      if (res.ok) { setLabel(""); setCode(""); setTags(""); setNotes(""); setStatus("Saved!"); loadEntries(); }
      else { const data = await res.json().catch(() => ({})); setStatus((data as { error?: string }).error ?? "Failed."); }
    } catch { setStatus("Failed — API might be down."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this code?")) return;
    await fetchApi(`green-vault/${id}`, { method: "DELETE" }).catch(() => {});
    loadEntries();
  };

  const handleCopy = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } };
  const toggleExpand = (id: string) => { setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const timeAgo = (ts: number) => { const diff = Date.now() - ts; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return new Date(ts).toLocaleDateString(); };
  const filtered = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="rounded-xl border border-emerald-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
      <div className="px-5 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-emerald-400">Green's Code Vault</h3>
          <p className="text-[10px] text-[var(--color-text-muted)]">{entries.length} codes stored — DrLecter studies these to improve the generators</p>
        </div>
        <span className="text-[10px] font-mono text-emerald-400/50">{entries.length}/500</span>
      </div>
      <div className="p-4 border-b border-[var(--color-panel-border)] space-y-3">
        <div className="flex flex-wrap gap-2">
          {ITEM_TYPES.map((t) => (<button key={t} onClick={() => setType(t)} className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${type === t ? ITEM_TYPE_COLORS[t] : "border-transparent text-[var(--color-text-muted)]/50"}`}>{t}</button>))}
        </div>
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this code" className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-sm focus:border-emerald-500 focus:outline-none" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" className="w-40 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
        </div>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste decoded or Base85 code here..." className="w-full h-16 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs font-mono resize-y focus:border-emerald-500 focus:outline-none" />
        <div className="flex gap-2">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
          <button onClick={handleSave} disabled={saving || !code.trim() || !label.trim()} className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 min-h-[40px]">{saving ? "Saving..." : "Save to Vault"}</button>
        </div>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </div>
      <div className="px-4 py-2 border-b border-[var(--color-panel-border)] flex flex-wrap gap-1.5">
        {["all", ...ITEM_TYPES].map((f) => (<button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${filter === f ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-transparent text-[var(--color-text-muted)]/50"}`}>{f} ({f === "all" ? entries.length : entries.filter((e) => e.type === f).length})</button>))}
      </div>
      <div className="max-h-[500px] overflow-y-auto divide-y divide-[var(--color-panel-border)]/50">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">No codes yet. Save your best builds here!</div>
        ) : filtered.map((e) => (
          <div key={e.id} className="px-4 py-3">
            {editingId === e.id ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {ITEM_TYPES.map((t) => (
                    <button key={t} onClick={() => setEditType(t)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${editType === t ? ITEM_TYPE_COLORS[t] : "border-transparent text-[var(--color-text-muted)]/50"}`}
                    >{t}</button>
                  ))}
                </div>
                <input value={editLabel} onChange={(ev) => setEditLabel(ev.target.value)} placeholder="Name"
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
                <textarea value={editCode} onChange={(ev) => setEditCode(ev.target.value)} rows={3}
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-[10px] font-mono resize-y focus:border-emerald-500 focus:outline-none" />
                <input value={editTags} onChange={(ev) => setEditTags(ev.target.value)} placeholder="Tags (comma separated)"
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
                <input value={editNotes} onChange={(ev) => setEditNotes(ev.target.value)} placeholder="Notes"
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={editSaving}
                    className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/30 disabled:opacity-50">{editSaving ? "Saving..." : "Save"}</button>
                  <button onClick={cancelEdit}
                    className="px-3 py-1.5 rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-[10px]">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleExpand(e.id)} className="text-xs font-bold text-[var(--color-text)] hover:text-emerald-400">{e.label}</button>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${ITEM_TYPE_COLORS[e.type] ?? ITEM_TYPE_COLORS.other}`}>{e.type}</span>
                  {e.tags.map((t) => <span key={t} className="px-1.5 py-0.5 rounded text-[8px] bg-white/5 text-[var(--color-text-muted)] border border-[var(--color-panel-border)]">{t}</span>)}
                  <span className="text-[10px] text-[var(--color-text-muted)]">{timeAgo(e.timestamp)}</span>
                  <button onClick={() => startEdit(e)} className="text-[10px] text-[var(--color-text-muted)] hover:text-emerald-400">Edit</button>
                  <button onClick={() => handleCopy(e.code)} className="text-[10px] text-[var(--color-text-muted)] hover:text-emerald-400">Copy</button>
                  <button onClick={() => handleDelete(e.id)} className="text-[10px] text-[var(--color-text-muted)] hover:text-red-400">Delete</button>
                </div>
                {e.notes && <p className="text-[10px] text-[var(--color-text-muted)] mt-1 italic">{e.notes}</p>}
                {expanded.has(e.id) && (<pre className="mt-2 p-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[10px] text-[var(--color-text)] font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{e.code}</pre>)}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feedback Panel (shared with Terra) ──────────────────────────────────────
interface FeedbackEntry { id: string; author: string; type: string; message: string; page: string; status: string; reply?: string; timestamp: number; }
const TYPE_COLORS: Record<string, string> = { bug: "border-red-500/40 bg-red-500/10 text-red-400", idea: "border-blue-500/40 bg-blue-500/10 text-blue-400", question: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400", note: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]" };
const STATUS_COLORS: Record<string, string> = { new: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", seen: "border-blue-500/40 bg-blue-500/10 text-blue-400", fixed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", wontfix: "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]" };

function FeedbackPanel({ author }: { author: string }) {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("bug");
  const [page, setPage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadEntries = useCallback(async () => { try { const res = await fetchApi("feedback"); if (res.ok) { const data = await res.json(); if (Array.isArray(data)) setEntries(data); } } catch { /* ignore */ } }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true); setStatus(null);
    try {
      const res = await fetchApi("feedback", { method: "POST", body: JSON.stringify({ author, type, message: message.trim(), page: page.trim() }) });
      if (res.ok) { setMessage(""); setPage(""); setStatus("Sent!"); loadEntries(); }
      else { const data = await res.json().catch(() => ({})); setStatus((data as { error?: string }).error ?? "Failed to send."); }
    } catch { setStatus("Failed — API might be down."); }
    finally { setSending(false); }
  };

  const timeAgo = (ts: number) => { const diff = Date.now() - ts; if (diff < 60000) return "just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return `${Math.floor(diff / 86400000)}d ago`; };

  return (
    <div className="rounded-xl border border-emerald-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
      <div className="px-5 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-400">Live Feedback</h3>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">DrLecter sees everything here</span>
      </div>
      <div className="p-4 border-b border-[var(--color-panel-border)] space-y-3">
        <div className="flex gap-2">
          {(["bug", "idea", "question", "note"] as const).map((t) => (<button key={t} onClick={() => setType(t)} className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${type === t ? TYPE_COLORS[t] : "border-transparent text-[var(--color-text-muted)]/50"}`}>{t}</button>))}
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's on your mind? Bug reports, ideas, questions..." className="w-full h-20 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-sm resize-y focus:border-emerald-500 focus:outline-none" />
        <div className="flex items-center gap-2">
          <input type="text" value={page} onChange={(e) => setPage(e.target.value)} placeholder="Which page/feature? (optional)" className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(12,14,18,0.8)] text-[var(--color-text)] text-xs focus:border-emerald-500 focus:outline-none" />
          <button onClick={handleSubmit} disabled={sending || !message.trim()} className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 min-h-[40px]">{sending ? "Sending..." : "Send"}</button>
        </div>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </div>
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
            {e.reply && (<div className="mt-1 pl-3 border-l-2 border-emerald-500/40"><p className="text-[10px] text-emerald-400 font-bold">DrLecter:</p><p className="text-xs text-[var(--color-text-muted)]">{e.reply}</p></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
