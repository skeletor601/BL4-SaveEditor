import { Link, useLocation, Routes, Route, Navigate } from "react-router-dom";
import SelectSaveView from "@/pages/SelectSaveView";
import CharacterPage from "@/pages/save-tools/CharacterPage";
import YamlPage from "@/pages/save-tools/YamlPage";

const subTabs = [
  { path: "select-save", label: "Select Save" },
  { path: "edit", label: "Character" },
  { path: "yaml", label: "YAML" },
];

export default function CharacterSectionPage() {
  const location = useLocation();
  const base = "/character";
  const subPath = location.pathname.replace(new RegExp(`^${base}/?`), "") || "select-save";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] px-4 py-3 bg-[rgba(48,52,60,0.85)] backdrop-blur-sm">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
        <nav className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-panel-border)]/50 mt-2">
          {subTabs.map(({ path, label }) => {
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
          <Route index element={<Navigate to="/character/select-save" replace />} />
          <Route path="select-save" element={<SelectSaveView />} />
          <Route path="edit" element={<CharacterPage />} />
          <Route path="yaml" element={<YamlPage />} />
          <Route path="*" element={<Navigate to="/character/select-save" replace />} />
        </Routes>
      </div>
    </div>
  );
}
