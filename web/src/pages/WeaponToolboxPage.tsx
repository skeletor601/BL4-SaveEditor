import { Link, useLocation, Routes, Route, Navigate } from "react-router-dom";
import WeaponEditView from "@/pages/weapon-toolbox/WeaponEditView";
import WeaponGenView from "@/pages/weapon-toolbox/WeaponGenView";
import ItemEditView from "@/pages/weapon-toolbox/ItemEditView";

const branches = [
  { path: "weapon-gen", label: "Weapon Gen", desc: "Weapon generator" },
  { path: "weapon-edit", label: "Weapon Edit", desc: "Edit weapon serials" },
  { path: "item-edit", label: "Item Edit", desc: "Grenade, shield, repkit, heavy" },
];

export default function WeaponToolboxPage() {
  const location = useLocation();
  const base = "/weapon-toolbox";
  const subPath = location.pathname.replace(new RegExp(`^${base}/?`), "") || "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] px-4 py-3 bg-[rgba(48,52,60,0.85)] backdrop-blur-sm">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Weapon Toolbox</h1>
        <nav className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-panel-border)]/50 mt-2">
          {branches.map(({ path, label }) => {
            const to = `${base}/${path}`;
            const isActive = subPath === path;
            return (
              <Link
                key={path}
                to={to}
                className={`min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg border text-sm ${isActive ? "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] text-[var(--color-accent)]" : "border-[var(--color-panel-border)]/70 text-[var(--color-text-muted)] hover:bg-[rgba(24,28,34,0.5)] hover:text-[var(--color-accent)]"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="pt-0">
        <Routes>
          <Route index element={<Navigate to="/weapon-toolbox/weapon-gen" replace />} />
          <Route path="weapon-gen" element={<WeaponGenView />} />
          <Route path="weapon-edit" element={<WeaponEditView />} />
          <Route path="item-edit" element={<ItemEditView />} />
          <Route path="*" element={<Navigate to="/weapon-toolbox/weapon-gen" replace />} />
        </Routes>
      </div>
    </div>
  );
}
