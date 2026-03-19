/**
 * /terra — Terra's private testing ground.
 * Top-secret features land here first before going public.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

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

        {/* Feedback area */}
        <div className="rounded-xl border border-dashed border-amber-500/30 p-6 text-center" style={{ backgroundColor: "rgba(18, 21, 27, 0.4)" }}>
          <p className="text-sm text-amber-400/60">Feedback zone — tell us what works, what's broken, and what's next.</p>
          <p className="text-[10px] text-[var(--color-text-muted)]/40 mt-2">This page is hidden from the public nav. Only accessible at /terra</p>
        </div>

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
