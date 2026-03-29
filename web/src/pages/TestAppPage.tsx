/**
 * Test App — Future main layout mockup.
 * Gear Lab as the centerpiece, sidebar nav, modern dark UI.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTheme, THEMES, THEME_META } from "@/contexts/ThemeContext";
import { getEggCount, discoverEgg } from "@/lib/easterEggs";
import { fetchApi } from "@/lib/apiClient";
import { CHANGE_LOG } from "@/data/changelog";

// ── Tab definitions ──────────────────────────────────────────────────────────
type TabId = "gear-lab" | "arsenal" | "command" | "vault" | "save-ops" | "workbench";

interface TabDef {
  id: TabId;
  label: string;
  sublabel: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "command",  label: "Command Center", sublabel: "Dashboard & Updates", icon: "◈" },
  { id: "gear-lab", label: "Gear Lab",       sublabel: "Build & Mod Anything", icon: "⚙" },
  { id: "arsenal",  label: "Arsenal",        sublabel: "5,200+ Parts Database", icon: "⌕" },
  { id: "save-ops", label: "Save Ops",       sublabel: "Characters & Backpack", icon: "◉" },
  { id: "vault",    label: "The Vault",      sublabel: "Community & Recipes",   icon: "◎" },
  { id: "workbench", label: "Workbench",    sublabel: "Classic Item Editors",   icon: "⚒" },
];

// ── Quick stats (loaded from API) ────────────────────────────────────────────
function useQuickStats() {
  const [stats, setStats] = useState<{ parts: number; weapons: number; categories: number; totalVisits: number; uniqueVisitors: number; weaponsGenerated: number; grenadesGenerated: number } | null>(null);
  useEffect(() => {
    // Track visit first, then fetch updated stats
    // Time-based Easter eggs
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 5) discoverEgg("night-owl");
    if (hour >= 5 && hour < 7) discoverEgg("early-bird");
    const day = new Date().getDay();
    if (day === 0 || day === 6) discoverEgg("weekend-warrior");

    fetchApi("stats/visit", { method: "POST", body: "{}" })
      .catch(() => {})
      .finally(() => {
        fetchApi("stats").then((r) => r.json()).then((data) => {
          setStats({
            parts: 5210,
            weapons: 2209,
            categories: 8,
            totalVisits: data.totalVisits ?? 0,
            uniqueVisitors: data.uniqueVisitors ?? 0,
            weaponsGenerated: data.weaponsGenerated ?? 0,
            grenadesGenerated: data.grenadesGenerated ?? 0,
          });
        }).catch(() => {
          setStats({ parts: 5210, weapons: 2209, categories: 8, totalVisits: 0, uniqueVisitors: 0, weaponsGenerated: 0, grenadesGenerated: 0 });
        });
      });
  }, []);
  return stats;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function TestAppPage() {
  const { theme, setTheme, themeConfig } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("command");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const stats = useQuickStats();
  const overlay = themeConfig.bgOverlay;

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Full-screen background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(${overlay}, ${overlay}), var(--theme-bg-url)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* ── Sidebar (desktop only) ─────────────────────────────────────────── */}
      <aside
        className={`relative z-10 hidden md:flex flex-col border-r border-[var(--color-panel-border)] backdrop-blur-xl transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
        style={{ backgroundColor: "rgba(12, 14, 18, 0.92)" }}
      >
        {/* Logo area */}
        <div className="px-3 py-4 border-b border-[var(--color-panel-border)] flex items-center gap-3 min-h-[64px]">
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="w-10 h-10 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 flex items-center justify-center text-[var(--color-accent)] font-bold text-lg hover:bg-[var(--color-accent)]/30 transition-colors shrink-0"
          >
            BL4
          </button>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--color-text)] truncate">BL4 AIO</div>
              <div className="text-[10px] font-mono tracking-widest text-[var(--color-accent)]">SAVE EDITOR</div>
            </div>
          )}
        </div>

        {/* Nav tabs */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 ${
                  active
                    ? "bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/40 text-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/5"
                    : "border border-transparent text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"
                }`}
              >
                <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${
                  active ? "bg-[var(--color-accent)]/20" : "bg-white/5"
                }`}>
                  {tab.icon}
                </span>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${active ? "text-[var(--color-accent)]" : ""}`}>{tab.label}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] truncate">{tab.sublabel}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-t border-[var(--color-panel-border)] space-y-3">
            {/* Theme switcher */}
            <div>
              <span className="text-[9px] font-mono tracking-widest text-[var(--color-text-muted)] uppercase">Theme</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    title={THEME_META[t].label}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${theme === t ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"}`}
                    style={{ backgroundColor: THEME_META[t].accent }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono tracking-wider text-emerald-400">SYSTEM ONLINE</span>
            </div>
            {(() => {
              const { found, total } = getEggCount();
              return found > 0 ? (
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <span className="text-[10px]">🥚</span>
                  <span className="text-[10px] font-mono text-amber-400">{found}/{total}</span>
                </div>
              ) : null;
            })()}
            <a
              href="https://discord.gg/wNDT64Zn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-indigo-500/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 hover:text-white transition-colors text-sm font-bold tracking-wide"
            >
              Join Our Discord
            </a>
            <Link
              to="/settings"
              className="block text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              Settings & Credits
            </Link>
          </div>
        )}
      </aside>

      {/* ── Mobile overlay menu ────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <nav
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col border-r border-[var(--color-panel-border)] overflow-y-auto"
            style={{ backgroundColor: "rgba(12, 14, 18, 0.98)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-4 border-b border-[var(--color-panel-border)] flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[var(--color-text)]">BL4 AIO</div>
                <div className="text-[10px] font-mono tracking-widest text-[var(--color-accent)]">SAVE EDITOR</div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
            </div>
            <div className="flex-1 py-3 px-2 space-y-1">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left ${
                      active
                        ? "bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/40 text-[var(--color-accent)]"
                        : "border border-transparent text-[var(--color-text-muted)]"
                    }`}
                  >
                    <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${active ? "bg-[var(--color-accent)]/20" : "bg-white/5"}`}>{tab.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${active ? "text-[var(--color-accent)]" : ""}`}>{tab.label}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] truncate">{tab.sublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-3 border-t border-[var(--color-panel-border)] space-y-3">
              <div>
                <span className="text-[9px] font-mono tracking-widest text-[var(--color-text-muted)] uppercase">Theme</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {THEMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      title={THEME_META[t].label}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${theme === t ? "border-white scale-110" : "border-transparent opacity-70"}`}
                      style={{ backgroundColor: THEME_META[t].accent }}
                    />
                  ))}
                </div>
              </div>
              <Link to="/settings" className="block text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]" onClick={() => setMobileMenuOpen(false)}>Settings & Credits</Link>
            </div>
          </nav>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="shrink-0 border-b border-[var(--color-panel-border)] px-4 md:px-6 flex items-center justify-between min-h-[56px] relative"
          style={{ backgroundColor: "rgba(18, 21, 27, 0.88)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg border border-[var(--color-panel-border)] text-[var(--color-accent)]"
            >
              <span className="block space-y-1">
                <span className="block w-5 h-0.5 bg-current" />
                <span className="block w-5 h-0.5 bg-current" />
                <span className="block w-5 h-0.5 bg-current" />
              </span>
            </button>
            <h1 className="text-base md:text-lg font-semibold text-[var(--color-text)]">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h1>
            <span className="hidden sm:inline text-xs text-[var(--color-text-muted)] font-mono">
              {TABS.find((t) => t.id === activeTab)?.sublabel}
            </span>
          </div>
          {/* Discord link — centered */}
          <a
            href="https://discord.gg/msREs4Qep"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            title="Join our Discord"
          >
            <span className="hidden md:inline">Need help or on mobile?</span>
            <svg className="w-6 h-6 drop-shadow-[0_0_1px_rgba(0,0,0,1)]" viewBox="0 0 127.14 96.36" fill="currentColor" stroke="black" strokeWidth="2" aria-hidden>
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
            </svg>
          </a>
          <div className="flex items-center gap-4">
            {stats && (
              <div className="hidden lg:flex items-center gap-4 text-[10px] font-mono text-[var(--color-text-muted)]">
                <span>{stats.parts.toLocaleString()}+ parts</span>
                <span>{stats.weapons.toLocaleString()} weapons</span>
                <span>{stats.categories} categories</span>
              </div>
            )}
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              v2.0
            </span>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "command" && <CommandCenterTab onNavigate={setActiveTab} siteStats={stats ? { totalVisits: stats.totalVisits, uniqueVisitors: stats.uniqueVisitors, weaponsGenerated: stats.weaponsGenerated, grenadesGenerated: stats.grenadesGenerated } : null} />}
          {activeTab === "gear-lab" && <GearLabTab />}
          {activeTab === "arsenal" && <ArsenalTab />}
          {activeTab === "save-ops" && <SaveOpsTab />}
          {activeTab === "vault" && <VaultTab />}
          {activeTab === "workbench" && <WorkbenchTab />}
        </div>
      </main>
    </div>
  );
}

// ── Tab: Command Center (Dashboard + Updates) ─────────────────────────────────
function CommandCenterTab({ onNavigate, siteStats }: { onNavigate: (tab: TabId) => void; siteStats: { totalVisits: number; uniqueVisitors: number; weaponsGenerated: number; grenadesGenerated: number } | null }) {
  const recentChanges = CHANGE_LOG.slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Hero banner */}
      <div className="relative rounded-2xl border border-[var(--color-accent)]/30 overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.8)" }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-accent)]/10 to-transparent pointer-events-none" />
        <div className="relative px-8 py-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              v2.0
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[var(--color-text)] mb-2">
            Welcome to the <span className="text-[var(--color-accent)]">BL4 AIO Save Editor</span>
          </h2>
          <p className="text-[var(--color-text-muted)] max-w-xl">
            The most comprehensive Borderlands 4 save editor ever built.
            Build modded weapons and grenades, search 5,200+ parts, edit characters,
            manage inventories — all in one place.
          </p>
        </div>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickCard icon="⚙" title="Gear Lab" desc="Build modded weapons & grenades" accent onClick={() => onNavigate("gear-lab")} />
        <QuickCard icon="⌕" title="Arsenal" desc="Search the parts database" onClick={() => onNavigate("arsenal")} />
        <QuickCard icon="◉" title="Save Ops" desc="Character edits & backpack" onClick={() => onNavigate("save-ops")} />
        <QuickCard icon="◎" title="The Vault" desc="Community recipes & codes" onClick={() => onNavigate("vault")} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Visits" value={siteStats?.totalVisits?.toLocaleString() ?? "—"} />
        <StatCard label="Unique Visitors" value={siteStats?.uniqueVisitors?.toLocaleString() ?? "—"} />
        <StatCard label="Weapons Generated" value={siteStats?.weaponsGenerated?.toLocaleString() ?? "—"} />
        <StatCard label="Grenades Generated" value={siteStats?.grenadesGenerated?.toLocaleString() ?? "—"} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Parts" value="5,210" />
        <StatCard label="Weapons in DB" value="2,209" />
        <StatCard label="Grenade Recipes" value="24" />
        <StatCard label="Manufacturers" value="11" />
      </div>

      {/* Top Community Code */}
      <TopCommunityCode />

      {/* Recent updates */}
      <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
        <div className="px-5 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-accent)]">Recent Updates</h3>
          <span className="text-[10px] font-mono text-[var(--color-text-muted)]">CHANGELOG</span>
        </div>
        <div className="divide-y divide-[var(--color-panel-border)]/50 max-h-[400px] overflow-y-auto">
          {recentChanges.map((entry, i) => (
            <div key={i} className="px-5 py-3 flex gap-4">
              <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap shrink-0 w-20">{entry.date}</span>
              <ul className="space-y-0.5">
                {entry.items.map((item, j) => (
                  <li key={j} className="text-sm text-[var(--color-text)]">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Easter egg */}
      <div className="text-center text-[10px] font-mono text-[var(--color-text-muted)]/30 select-none">
        Built with Claude. ChatGPT was here first but forgot what it was building.
      </div>
    </div>
  );
}

// ── Tab: Gear Lab ─────────────────────────────────────────────────────────────
function GearLabTab() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="rounded-xl border border-[var(--color-accent)]/30 overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
        <div className="px-5 py-4 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-accent)]">Gear Lab</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Build, mod, and generate any item in the game</p>
          </div>
          <Link
            to="/beta/unified-item-builder"
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/30 transition-colors"
          >
            Open Full Builder
          </Link>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { name: "Weapon", desc: "Modded weapon generator + builder", color: "text-red-400 border-red-500/30 bg-red-500/5" },
              { name: "Grenade", desc: "Modded grenade generator + recipes", color: "text-orange-400 border-orange-500/30 bg-orange-500/5" },
              { name: "Shield", desc: "Shield builder with firmware", color: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
              { name: "Class Mod", desc: "Skills, names, legendary perks", color: "text-green-400 border-green-500/30 bg-green-500/5" },
              { name: "Enhancement", desc: "Manufacturer perks + stats", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" },
              { name: "Repkit", desc: "Repair kit builder", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/5" },
              { name: "Heavy", desc: "Heavy weapon builder", color: "text-pink-400 border-pink-500/30 bg-pink-500/5" },
              { name: "Codec", desc: "Encode / decode any item", color: "text-purple-400 border-purple-500/30 bg-purple-500/5" },
            ].map((item) => (
              <Link
                key={item.name}
                to="/beta/unified-item-builder"
                className={`rounded-xl border p-4 hover:scale-[1.02] transition-transform ${item.color}`}
              >
                <div className="text-sm font-bold mb-1">{item.name}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          title="Modded Weapon Generator"
          desc="Auto-fill stock base, layer cross-inserts from shields/enhancements/class mods, visual barrel stacking, 24 grenade recipes. 1/20 chance for Claude's Gun."
        />
        <FeatureCard
          title="Modded Grenade Generator"
          desc="Full grenade modding with visual recipes, cross-category parts, and the Context Window Easter egg."
        />
        <FeatureCard
          title="Smart Auto-Fill"
          desc="Picks manufacturer, Legendary/Pearl type, fills all slots — produces 100% spawnable items every time."
        />
      </div>

    </div>
  );
}

// ── Tab: Arsenal (Search) ─────────────────────────────────────────────────────
function ArsenalTab() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
        <div className="px-5 py-4 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-accent)]">Arsenal</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Search across 5,200+ parts, weapons, grenades, shields, and more</p>
          </div>
          <Link
            to="/master-search"
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/30 transition-colors"
          >
            Open Full Search
          </Link>
        </div>
        <div className="p-8 text-center">
          <div className="text-6xl mb-4 opacity-20">⌕</div>
          <p className="text-[var(--color-text-muted)] mb-2">Full search will be embedded here</p>
          <p className="text-xs text-[var(--color-text-muted)]/60">Try searching "chatgpt" or "claude" for a surprise</p>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Save Ops ─────────────────────────────────────────────────────────────
function SaveOpsTab() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/character" className="rounded-xl border border-[var(--color-panel-border)] p-6 hover:border-[var(--color-accent)]/40 transition-colors" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="text-2xl mb-2 opacity-40">◉</div>
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">Character Studio</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Select save file, edit character stats, YAML view, level/money/SDU editing</p>
        </Link>
        <Link to="/inventory" className="rounded-xl border border-[var(--color-panel-border)] p-6 hover:border-[var(--color-accent)]/40 transition-colors" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="text-2xl mb-2 opacity-40">◈</div>
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">Inventory Ops</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Backpack management, decoder, parts translator, code spawn, item comparison</p>
        </Link>
        <Link to="/save-compare" className="rounded-xl border border-[var(--color-panel-border)] p-6 hover:border-[var(--color-accent)]/40 transition-colors" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
          <div className="text-2xl mb-2 opacity-40">⇄</div>
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">Save Comparison</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Load two save files and diff their inventories side by side</p>
        </Link>
        <div className="rounded-xl border border-dashed border-[var(--color-panel-border)]/50 p-6 flex items-center justify-center" style={{ backgroundColor: "rgba(18, 21, 27, 0.4)" }}>
          <p className="text-xs text-[var(--color-text-muted)]/50 text-center">More save operations coming soon</p>
        </div>
      </div>
    </div>
  );
}

// ── Tab: The Vault (Community) ────────────────────────────────────────────────
function VaultTab() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
        <div className="px-5 py-4 border-b border-[var(--color-panel-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-accent)]">The Vault</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Community recipes, shared builds, and curated content</p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/community" className="rounded-lg border border-[var(--color-panel-border)] p-4 hover:border-[var(--color-accent)]/40 transition-colors">
            <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">Community Recipes</h4>
            <p className="text-xs text-[var(--color-text-muted)]">Browse, share, and upvote weapon/grenade codes from the community</p>
          </Link>
          <div className="rounded-lg border border-[var(--color-panel-border)] p-4">
            <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">Visual Recipes</h4>
            <p className="text-xs text-[var(--color-text-muted)]">24 curated grenade visual effects — Singularity, Artillery, Lingering, and hybrids</p>
          </div>
          <Link to="/god-rolls" className="rounded-lg border border-[var(--color-panel-border)] p-4 hover:border-amber-500/40 transition-colors">
            <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">God Rolls (Non-Modded)</h4>
            <p className="text-xs text-[var(--color-text-muted)]">Pre-built optimal configurations for each item type</p>
          </Link>
          <div className="rounded-lg border border-dashed border-[var(--color-panel-border)]/50 p-4">
            <h4 className="text-sm font-bold text-[var(--color-text-muted)]/50 mb-1">Named Builds</h4>
            <p className="text-xs text-[var(--color-text-muted)]/40">Paste Mobalytics URL, auto-generate full gear set (coming soon)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Workbench (Legacy Editors) ────────────────────────────────────────────
function WorkbenchTab() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="rounded-xl border border-[var(--color-panel-border)] overflow-hidden"
        style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
        <div className="px-5 py-4 border-b border-[var(--color-panel-border)]">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-[var(--color-accent)]">Workbench</h3>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-[var(--color-text-muted)]/30 bg-white/5 text-[var(--color-text-muted)]">
              Classic
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            The original standalone editors. Same tools, dedicated interface — for those who prefer the classic workflow.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <WorkbenchCard
              to="/gear-forge"
              title="Gear Forge"
              desc="The original unified workbench — build + edit with live codec"
              badge="All-in-One"
              color="text-[var(--color-accent)] border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=editor&editorKind=editor"
              title="Weapon Editor"
              desc="Direct weapon part editing — pick every slot manually"
              badge="Weapons"
              color="text-red-400 border-red-500/30 bg-red-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=editor&editorKind=editor"
              title="Item Editor"
              desc="Edit any item type — shields, grenades, class mods, etc."
              badge="All Items"
              color="text-blue-400 border-blue-500/30 bg-blue-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=grenade"
              title="Grenade Builder"
              desc="Standalone grenade builder with perk ordering and recipes"
              badge="Grenades"
              color="text-orange-400 border-orange-500/30 bg-orange-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=shield"
              title="Shield Builder"
              desc="Shield builder with firmware, elements, and legendary perks"
              badge="Shields"
              color="text-cyan-400 border-cyan-500/30 bg-cyan-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=class-mod"
              title="Class Mod Builder"
              desc="Class mod builder with skills, names, and character perks"
              badge="Class Mods"
              color="text-green-400 border-green-500/30 bg-green-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=enhancement"
              title="Enhancement Builder"
              desc="Enhancement builder with manufacturer perks and stats"
              badge="Enhancements"
              color="text-yellow-400 border-yellow-500/30 bg-yellow-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=repkit"
              title="Repkit Builder"
              desc="Repair kit builder with manufacturer and universal perks"
              badge="Repkits"
              color="text-teal-400 border-teal-500/30 bg-teal-500/5"
            />
            <WorkbenchCard
              to="/gear-forge?tab=builder&builderKind=heavy"
              title="Heavy Builder"
              desc="Heavy weapon builder with barrels and accessories"
              badge="Heavies"
              color="text-pink-400 border-pink-500/30 bg-pink-500/5"
            />
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] font-mono text-[var(--color-text-muted)]/40 select-none">
        These editors predate the Gear Lab. They still work great — use whatever feels right.
      </div>
    </div>
  );
}

function WorkbenchCard({ to, title, desc, badge, color }: { to: string; title: string; desc: string; badge: string; color: string }) {
  return (
    <Link
      to={to}
      className={`rounded-xl border p-4 hover:scale-[1.02] transition-all group ${color}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">{title}</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-current/30 bg-current/5 opacity-60 group-hover:opacity-100 transition-opacity">
          {badge}
        </span>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)]">{desc}</p>
    </Link>
  );
}

// ── Top Community Code spotlight ─────────────────────────────────────────────
function TopCommunityCode() {
  const [topCode, setTopCode] = useState<{ title: string; code: string; upvotes: number; itemType: string; submittedAt: number; authorName?: string; seed?: number } | null>(null);
  useEffect(() => {
    fetchApi("community/recipes").then((r) => r.json()).then((data) => {
      const recipes = data?.recipes;
      if (Array.isArray(recipes) && recipes.length > 0) {
        // Find highest upvoted from the last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = recipes.filter((r: { submittedAt: number }) => r.submittedAt > weekAgo);
        const pool = thisWeek.length > 0 ? thisWeek : recipes;
        const top = pool.sort((a: { upvotes: number }, b: { upvotes: number }) => b.upvotes - a.upvotes)[0];
        if (top) setTopCode({ title: top.title, code: top.code, upvotes: top.upvotes, itemType: top.itemType, submittedAt: top.submittedAt, authorName: top.authorName, seed: top.seed });
      }
    }).catch(() => {});
  }, []);

  if (!topCode) return null;

  const typeColors: Record<string, string> = {
    weapon: "border-red-500/40 text-red-400",
    grenade: "border-orange-500/40 text-orange-400",
    shield: "border-blue-500/40 text-blue-400",
    "class-mod": "border-green-500/40 text-green-400",
  };

  // Badge gradient colors matching CommunityVaultPage
  const BADGE_GRADIENTS = [
    "from-purple-500 to-pink-500", "from-cyan-400 to-blue-500", "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500", "from-rose-400 to-red-500", "from-violet-400 to-indigo-500",
    "from-lime-400 to-green-500", "from-fuchsia-400 to-purple-500", "from-sky-400 to-cyan-500",
    "from-yellow-400 to-amber-500",
  ];

  return (
    <div className="rounded-xl border border-amber-500/30 overflow-hidden" style={{ backgroundColor: "rgba(18, 21, 27, 0.7)" }}>
      <div className="px-5 py-3 border-b border-amber-500/20 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg">★</span>
          <h3 className="text-sm font-semibold text-amber-400">Weekly Champion</h3>
        </div>
        <Link to="/community" className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">View all</Link>
      </div>
      <div className="px-5 py-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-text)]">{topCode.title}</span>
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${typeColors[topCode.itemType] ?? "border-[var(--color-panel-border)] text-[var(--color-text-muted)]"}`}>{topCode.itemType}</span>
        </div>
        {topCode.authorName && topCode.seed && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400/60 uppercase tracking-wide">by</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider text-white bg-gradient-to-r ${BADGE_GRADIENTS[topCode.seed % BADGE_GRADIENTS.length]} shadow-md shadow-black/40 ring-1 ring-white/20`}
              title={`Seed #${topCode.seed}`}
            >
              <span className="opacity-70">#</span>
              {topCode.authorName}
            </span>
          </div>
        )}
        <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">{topCode.code.slice(0, 60)}...</p>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <span className="text-amber-400 text-sm">▲</span>
            <span className="text-amber-400 font-bold text-sm">{topCode.upvotes}</span>
            <span className="text-amber-400/50 text-[10px] ml-1">votes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────
function QuickCard({ icon, title, desc, accent, onClick }: { icon: string; title: string; desc: string; accent?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all hover:scale-[1.02] cursor-pointer text-left w-full ${
        accent
          ? "border-[var(--color-accent)]/40 bg-[rgba(18,21,27,0.5)] hover:border-[var(--color-accent)]/60"
          : "border-[var(--color-panel-border)] bg-[rgba(18,21,27,0.5)] hover:border-[var(--color-accent)]/40"
      }`}
    >
      <div className={`text-xl mb-2 ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}>{icon}</div>
      <div className="text-sm font-bold text-[var(--color-text)]">{title}</div>
      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{desc}</div>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-panel-border)] px-4 py-3" style={{ backgroundColor: "rgba(18, 21, 27, 0.6)" }}>
      <div className="text-xl font-bold text-[var(--color-accent)]">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-panel-border)] p-4" style={{ backgroundColor: "rgba(18, 21, 27, 0.6)" }}>
      <h4 className="text-sm font-bold text-[var(--color-text)] mb-2">{title}</h4>
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{desc}</p>
    </div>
  );
}
