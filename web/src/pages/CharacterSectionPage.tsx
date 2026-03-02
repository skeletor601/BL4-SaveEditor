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
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Character</h1>
      <nav className="flex flex-wrap gap-2 border-b border-[var(--color-panel-border)] pb-2">
        {subTabs.map(({ path, label }) => {
          const to = `${base}/${path}`;
          const isActive = subPath === path;
          return (
            <Link
              key={path}
              to={to}
              className={`px-4 py-2 rounded-t-lg border text-sm ${
                isActive ? "border-[var(--color-panel-border)] border-b-0 bg-[rgba(24,28,34,0.6)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-2">
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
