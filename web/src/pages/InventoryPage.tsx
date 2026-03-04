import { Link, useLocation, Routes, Route, Navigate } from "react-router-dom";
import BackpackView from "@/pages/inventory/BackpackView";
import PartsTranslatorView from "@/pages/inventory/PartsTranslatorView";

const branches = [
  { path: "parts-translator", label: "Parts Translator" },
  { path: "backpack", label: "Backpack" },
];

export default function InventoryPage() {
  const location = useLocation();
  const base = "/inventory";
  const subPath = location.pathname.replace(new RegExp(`^${base}/?`), "") || "";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Inventory</h1>
      <nav className="flex flex-wrap gap-2 border-b border-[var(--color-panel-border)] pb-2">
        {branches.map(({ path, label }) => {
          const to = `${base}/${path}`;
          const isActive = subPath === path;
          return (
            <Link
              key={path}
              to={to}
              className={`px-4 py-2 rounded-t-lg border text-sm ${isActive ? "border-[var(--color-panel-border)] border-b-0 bg-[rgba(24,28,34,0.6)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-2">
        <Routes>
          <Route index element={<Navigate to="/inventory/parts-translator" replace />} />
          <Route path="parts-translator" element={<PartsTranslatorView />} />
          <Route path="backpack" element={<BackpackView />} />
          <Route path="*" element={<Navigate to="/inventory/parts-translator" replace />} />
        </Routes>
      </div>
    </div>
  );
}
