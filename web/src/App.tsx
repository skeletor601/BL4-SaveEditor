import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import StagingGate from "@/components/StagingGate";
import Dashboard from "@/pages/Dashboard";
import MasterSearch from "@/pages/MasterSearch";
import MasterSearchPage from "@/pages/MasterSearchPage";
import CharacterSectionPage from "@/pages/CharacterSectionPage";
import InventoryPage from "@/pages/InventoryPage";
import SettingsPage from "@/pages/SettingsPage";
import SuperWorkbenchPage from "@/pages/SuperWorkbenchPage";
import BetaPage from "@/pages/BetaPage";
import UnifiedItemBuilderPage from "@/pages/beta/UnifiedItemBuilderPage";
import SaveComparisonPage from "@/pages/SaveComparisonPage";
import CommunityVaultPage from "@/pages/CommunityVaultPage";
import TestAppPage from "@/pages/TestAppPage";
import TerraLabPage from "@/pages/TerraLabPage";

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TestAppPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/beta" element={<BetaPage />} />
        <Route path="/beta/unified-item-builder" element={<UnifiedItemBuilderPage />} />
        <Route path="/character" element={<Navigate to="/character/select-save" replace />} />
        <Route path="/character/*" element={<CharacterSectionPage />} />
        <Route path="/inventory/*" element={<InventoryPage />} />
        <Route path="/gear-forge" element={<SuperWorkbenchPage />} />
        <Route path="/unified-workbench" element={<Navigate to="/gear-forge" replace />} />
        <Route path="/super-workbench" element={<Navigate to="/gear-forge" replace />} />
        <Route path="/super-workbench-nova" element={<Navigate to="/gear-forge" replace />} />
        <Route path="/super-workbench-pulse" element={<Navigate to="/gear-forge" replace />} />
        <Route
          path="/weapon-toolbox/weapon-gen"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "weapon" }} />}
        />
        <Route
          path="/weapon-toolbox/weapon-edit"
          element={<Navigate to="/gear-forge" replace state={{ tab: "editor", editorKind: "editor" }} />}
        />
        <Route
          path="/weapon-toolbox/item-edit"
          element={<Navigate to="/gear-forge" replace state={{ tab: "editor", editorKind: "editor" }} />}
        />
        <Route path="/weapon-toolbox/*" element={<Navigate to="/gear-forge" replace />} />
        <Route
          path="/accessories/class-mod"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "class-mod" }} />}
        />
        <Route
          path="/accessories/enhancement"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "enhancement" }} />}
        />
        <Route
          path="/accessories/repkit"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "repkit" }} />}
        />
        <Route
          path="/accessories/grenade"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "grenade" }} />}
        />
        <Route
          path="/accessories/shield"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "shield" }} />}
        />
        <Route
          path="/accessories/heavy"
          element={<Navigate to="/gear-forge" replace state={{ tab: "builder", builderKind: "heavy" }} />}
        />
        <Route path="/accessories/*" element={<Navigate to="/gear-forge" replace />} />
        {/* Master Search: rich UI with filters, quick filters, manufacturer/part type/rarity dropdowns */}
        <Route path="/master-search" element={<MasterSearch />} />
        <Route path="/master-search-simple" element={<MasterSearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/save-compare" element={<SaveComparisonPage />} />
        <Route path="/community" element={<CommunityVaultPage />} />
        <Route path="/test-app" element={<TestAppPage />} />
        <Route path="/terra" element={<TerraLabPage />} />
        <Route path="/save-tools" element={<Navigate to="/character/select-save" replace />} />
        <Route path="/save-tools/*" element={<Navigate to="/character/select-save" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  useEffect(() => {
    const envKey = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any)?.env as Record<string, string | undefined> | undefined;
        return env?.VITE_STAGING_KEY;
      } catch {
        return undefined;
      }
    })();
    if (envKey) {
      let meta = document.querySelector('meta[name="robots"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "robots");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", "noindex, nofollow");
    }
  }, []);

  return (
    <StagingGate>
      <AppRoutes />
    </StagingGate>
  );
}
