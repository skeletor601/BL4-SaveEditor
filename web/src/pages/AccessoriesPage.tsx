import { Link, useLocation, Routes, Route, Navigate } from "react-router-dom";
import AccessoryEditView from "./accessories/AccessoryEditView";
import ClassModBuilderView from "./accessories/ClassModBuilderView";
import EnhancementBuilderView from "./accessories/EnhancementBuilderView";
import GrenadeBuilderView from "./accessories/GrenadeBuilderView";
import RepkitBuilderView from "./accessories/RepkitBuilderView";
import ShieldBuilderView from "./accessories/ShieldBuilderView";
import HeavyBuilderView from "./accessories/HeavyBuilderView";

const branches = [
  { path: "class-mod", label: "Class Mod", desc: "Decode, edit, and encode class mod serials; add to backpack." },
  { path: "enhancement", label: "Enhancement", desc: "Decode, edit, and encode enhancement serials; add to backpack." },
  { path: "repkit", label: "RepKit", desc: "Decode, edit, and encode RepKit serials; add to backpack." },
  { path: "grenade", label: "Grenade", desc: "Decode, edit, and encode grenade serials; add to backpack." },
  { path: "shield", label: "Shield", desc: "Decode, edit, and encode shield serials; add to backpack." },
  { path: "heavy", label: "Heavy", desc: "Decode, edit, and encode heavy weapon serials; add to backpack." },
];

export default function AccessoriesPage() {
  const location = useLocation();
  const base = "/accessories";
  const subPath = location.pathname.replace(new RegExp(`^${base}/?`), "") || "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] px-4 py-3 bg-[rgba(48,52,60,0.85)] backdrop-blur-sm">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Accessories</h1>
        <nav className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-panel-border)]/50 mt-2">
          {branches.map(({ path, label }) => {
            const to = `${base}/${path}`;
            const isActive = subPath === path;
            return (
              <Link
                key={path}
                to={to}
                className={`min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg border text-sm ${
                  isActive ? "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] text-[var(--color-accent)]" : "border-[var(--color-panel-border)]/70 text-[var(--color-text-muted)] hover:bg-[rgba(24,28,34,0.5)] hover:text-[var(--color-accent)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="pt-0">
        <Routes>
          <Route index element={<Navigate to="/accessories/class-mod" replace />} />
          <Route path="class-mod" element={<ClassModBuilderView />} />
          <Route path="enhancement" element={<EnhancementBuilderView />} />
          <Route path="grenade" element={<GrenadeBuilderView />} />
          <Route path="repkit" element={<RepkitBuilderView />} />
          <Route path="shield" element={<ShieldBuilderView />} />
          <Route path="heavy" element={<HeavyBuilderView />} />
          {branches
            .filter((b) => !["class-mod", "enhancement", "grenade", "repkit", "shield", "heavy"].includes(b.path))
            .map(({ path, label, desc }) => (
              <Route
                key={path}
                path={path}
                element={<AccessoryEditView title={label} description={desc} />}
              />
            ))}
          <Route path="*" element={<Navigate to="/accessories/class-mod" replace />} />
        </Routes>
      </div>
    </div>
  );
}
