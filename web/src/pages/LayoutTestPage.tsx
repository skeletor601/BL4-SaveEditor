/**
 * Layout Test — Streamlined layout with dashboard + 3 main cards.
 *
 * Dashboard: news + stats
 * Cards: Save, Build, Backpack — clicking opens that section
 * Sub-tabs appear dynamically in the header when a section is active
 */

import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchApi } from "@/lib/apiClient";
import { CHANGE_LOG } from "@/data/changelog";
import Icon from "@/components/Icon";

const BuildFromUrlModal = lazy(() => import("@/components/BuildFromUrlModal"));

// Lazy-loaded tab content
const SelectSaveView = lazy(() => import("@/pages/SelectSaveView"));
const CharacterPage = lazy(() => import("@/pages/save-tools/CharacterPage"));
const YamlView = lazy(() => import("@/pages/save-tools/YamlPage"));
const UnifiedItemBuilderPage = lazy(() => import("@/pages/beta/UnifiedItemBuilderPage"));
const BackpackView = lazy(() => import("@/pages/inventory/BackpackView"));
const LootLobbyView = lazy(() => import("@/pages/inventory/LootLobbyView"));

// ── Types ───────────────────────────────────────────────────────────────────

type TabId = "dashboard" | "save" | "character" | "yaml" | "build" | "backpack" | "loot-lobby";

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  parent?: "save" | "backpack";
}

const MAIN_TABS: TabDef[] = [
  { id: "save", label: "Save", icon: "save" },
  { id: "build", label: "Build", icon: "build" },
  { id: "backpack", label: "Backpack", icon: "backpack" },
];

const SUB_TABS: Record<string, TabDef[]> = {
  save: [
    { id: "character", label: "Character", icon: "character", parent: "save" },
    { id: "yaml", label: "YAML", icon: "yaml", parent: "save" },
  ],
  backpack: [
    { id: "loot-lobby", label: "Loot Lobby", icon: "loot-lobby", parent: "backpack" },
  ],
};

function getActiveGroup(tab: TabId): "save" | "build" | "backpack" | "dashboard" {
  if (tab === "save" || tab === "character" || tab === "yaml") return "save";
  if (tab === "backpack" || tab === "loot-lobby") return "backpack";
  if (tab === "dashboard") return "dashboard";
  return "build";
}

// ── Stats Hook ──────────────────────────────────────────────────────────────

function useStats() {
  const [stats, setStats] = useState<{
    totalVisits: number;
    uniqueVisitors: number;
    weaponsGenerated: number;
    grenadesGenerated: number;
  } | null>(null);

  useEffect(() => {
    fetchApi("stats/visit", { method: "POST", body: "{}" })
      .catch(() => {})
      .finally(() => {
        fetchApi("stats")
          .then((r) => r.json())
          .then((data) => setStats({
            totalVisits: data.totalVisits ?? 0,
            uniqueVisitors: data.uniqueVisitors ?? 0,
            weaponsGenerated: data.weaponsGenerated ?? 0,
            grenadesGenerated: data.grenadesGenerated ?? 0,
          }))
          .catch(() => {});
      });
  }, []);

  return stats;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LayoutTestPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [showBuildUrl, setShowBuildUrl] = useState(false);
  const stats = useStats();
  useTheme(); // ensure theme context is active
  const navigate = useNavigate();

  const group = getActiveGroup(activeTab);
  const showNav = activeTab !== "dashboard";

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Top bar */}
      <header className="border-b border-[var(--color-panel-border)] bg-[rgba(14,16,20,0.85)] backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-12">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="flex items-center gap-2 text-sm font-bold text-[var(--color-accent)] hover:opacity-80 transition-opacity"
          >
            BL4 AIO
          </button>

          {/* Stats in header */}
          {stats && (
            <div className="hidden sm:flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1"><Icon name="visits" size={12} />{stats.totalVisits.toLocaleString()} visits</span>
              <span className="flex items-center gap-1"><Icon name="users" size={12} />{stats.uniqueVisitors.toLocaleString()} users</span>
              <span className="flex items-center gap-1"><Icon name="weapons-built" size={12} />{stats.weaponsGenerated.toLocaleString()} weapons</span>
            </div>
          )}

          {/* Secondary nav */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("bl4-layout", "lab");
                navigate("/");
              }}
              className="px-2 py-1 rounded text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-accent)] border border-[var(--color-panel-border)] hover:border-[var(--color-accent)]/30 transition-colors"
            >
              Switch to Lab
            </button>
            <NavBtn icon="master-search" label="Search" onClick={() => navigate("/master-search")} />
            <NavBtn icon="community" label="Community" onClick={() => navigate("/community")} />
            <NavBtn icon="settings" label="Settings" onClick={() => navigate("/settings")} />
            <a href="https://discord.gg/msREs4Qep" target="_blank" rel="noopener"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
              <Icon name="discord" size={14} />Discord
            </a>
          </div>
        </div>
      </header>

      {/* Dynamic tab bar — only shows when not on dashboard */}
      {showNav && (
        <nav className="border-b border-[var(--color-panel-border)] bg-[rgba(14,16,20,0.6)]">
          <div className="max-w-7xl mx-auto px-4 flex items-center">
            {(() => {
              const tabs: TabDef[] = [];
              for (const main of MAIN_TABS) {
                tabs.push(main);
                if (SUB_TABS[main.id] && group === main.id) {
                  tabs.push(...SUB_TABS[main.id]);
                }
              }
              return tabs.map((tab, i) => {
                const active = activeTab === tab.id;
                const isSub = !!tab.parent;
                const prevTab = i > 0 ? tabs[i - 1] : null;
                const curIsMain = !tab.parent;
                const showSep = i > 0 && curIsMain && prevTab &&
                  getActiveGroup(prevTab.id) !== getActiveGroup(tab.id);

                return (
                  <div key={tab.id} className="flex items-center">
                    {showSep && <div className="w-px h-6 bg-[var(--color-panel-border)] mx-2 opacity-40" />}
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${
                        isSub ? "px-3 text-xs" : "px-5 text-sm"
                      } ${
                        active
                          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                          : isSub
                            ? "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-accent)] opacity-60 hover:opacity-100"
                            : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      <Icon name={tab.icon} size={isSub ? 14 : 16} />
                      {tab.label}
                    </button>
                  </div>
                );
              });
            })()}
          </div>
        </nav>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "dashboard" && (
          <DashboardView stats={stats} onNavigate={setActiveTab} onBuildFromUrl={() => setShowBuildUrl(true)} />
        )}

        {showBuildUrl && (
          <Suspense fallback={null}>
            <BuildFromUrlModal
              onClose={() => setShowBuildUrl(false)}
              onLoadDecoded={(decoded: string, label?: string) => {
                setShowBuildUrl(false);
                setActiveTab("build");
                // Navigate to builder with decoded string via state
                navigate("/beta/unified-item-builder", { state: { loadDecoded: decoded, loadLabel: label } });
              }}
            />
          </Suspense>
        )}
        <Suspense fallback={<Spinner />}>
          {activeTab === "save" && <SelectSaveView />}
          {activeTab === "character" && <CharacterPage />}
          {activeTab === "yaml" && <YamlView />}
          {activeTab === "build" && <UnifiedItemBuilderPage />}
          {activeTab === "backpack" && <BackpackView />}
          {activeTab === "loot-lobby" && <LootLobbyView />}
        </Suspense>
      </main>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function DashboardView({ stats, onNavigate, onBuildFromUrl }: {
  stats: { totalVisits: number; uniqueVisitors: number; weaponsGenerated: number; grenadesGenerated: number } | null;
  onNavigate: (tab: TabId) => void;
  onBuildFromUrl: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* 3 Main Cards + Build from URL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashCard
          icon="save"
          title="Save"
          desc="Load & edit your .sav file"
          detail="Decrypt, edit character stats, export"
          onClick={() => onNavigate("save")}
        />
        <DashCard
          icon="build"
          title="Build"
          desc="Create any item"
          detail="Weapons, grenades, shields, class mods & more"
          onClick={() => onNavigate("build")}
        />
        <DashCard
          icon="backpack"
          title="Backpack"
          desc="Manage your inventory"
          detail="View items, bulk add, change levels, loot lobby"
          onClick={() => onNavigate("backpack")}
        />
      </div>

      {/* Build from URL */}
      <button
        type="button"
        onClick={onBuildFromUrl}
        className="w-full rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-left hover:border-purple-500/60 hover:bg-purple-500/10 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="text-purple-400 text-xl">🔗</span>
          <div>
            <h3 className="text-sm font-bold text-purple-400">Build from URL</h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">Paste a Mobalytics build guide URL → auto-generate stock gear set</p>
          </div>
        </div>
      </button>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Visits" value={stats.totalVisits} />
          <StatCard label="Unique Users" value={stats.uniqueVisitors} />
          <StatCard label="Weapons Built" value={stats.weaponsGenerated} />
          <StatCard label="Grenades Built" value={stats.grenadesGenerated} />
        </div>
      )}

      {/* News */}
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-panel-border)]">
          <h3 className="text-sm font-bold text-[var(--color-accent)] flex items-center gap-2"><Icon name="news" size={16} />News & Updates</h3>
        </div>
        <div className="p-5 max-h-[400px] overflow-y-auto space-y-4">
          {(CHANGE_LOG ?? []).slice(0, 5).map((entry, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-accent)]">Update {i + 1}</span>
                {entry.date && <span className="text-[10px] text-[var(--color-text-muted)]">{entry.date}</span>}
              </div>
              {entry.items && (
                <ul className="text-xs text-[var(--color-text-muted)] space-y-0.5 ml-3">
                  {entry.items.slice(0, 4).map((c: string, j: number) => (
                    <li key={j}>- {c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {(!CHANGE_LOG || CHANGE_LOG.length === 0) && (
            <p className="text-sm text-[var(--color-text-muted)]">No updates yet.</p>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <QuickBtn label="Master Search" onClick={() => window.location.href = "/master-search"} />
        <QuickBtn label="Community Vault" onClick={() => window.location.href = "/community"} />
        <QuickBtn label="God Rolls" onClick={() => window.location.href = "/god-rolls"} />
      </div>
    </div>
  );
}

// ── Small Components ────────────────────────────────────────────────────────

function DashCard({ icon, title, desc, detail, onClick }: {
  icon: string; title: string; desc: string; detail: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] p-5 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all group"
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[var(--color-accent)] group-hover:scale-110 transition-transform">
          <Icon name={icon} size={28} />
        </span>
        <h3 className="text-lg font-bold text-[var(--color-accent)]">{title}</h3>
      </div>
      <p className="text-sm text-[var(--color-text)]">{desc}</p>
      <p className="text-[10px] text-[var(--color-text-muted)] mt-2">{detail}</p>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.15)] px-4 py-3 text-center">
      <div className="text-lg font-bold text-[var(--color-accent)]">{value.toLocaleString()}</div>
      <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function NavBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-colors">
      <Icon name={icon} size={14} />{label}
    </button>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-all">
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm text-[var(--color-text-muted)] animate-pulse">Loading...</div>
    </div>
  );
}
