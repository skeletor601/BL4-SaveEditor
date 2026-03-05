import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import StagingGate from "@/components/StagingGate";
import Dashboard from "@/pages/Dashboard";
import MasterSearch from "@/pages/MasterSearch";
import MasterSearchPage from "@/pages/MasterSearchPage";
import CharacterSectionPage from "@/pages/CharacterSectionPage";
import InventoryPage from "@/pages/InventoryPage";
import WeaponToolboxPage from "@/pages/WeaponToolboxPage";
import AccessoriesPage from "@/pages/AccessoriesPage";
import SettingsPage from "@/pages/SettingsPage";

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/beta" element={<Dashboard />} />
        <Route path="/character" element={<Navigate to="/character/select-save" replace />} />
        <Route path="/character/*" element={<CharacterSectionPage />} />
        <Route path="/inventory/*" element={<InventoryPage />} />
        <Route path="/weapon-toolbox/*" element={<WeaponToolboxPage />} />
        <Route path="/accessories/*" element={<AccessoriesPage />} />
        {/* Master Search: use the simple page that works; we'll restyle it next */}
        <Route path="/master-search" element={<MasterSearchPage />} />
        {/* Rich UI (filters/quick buttons) – experimental */}
        <Route path="/master-search-rich" element={<MasterSearch />} />
        <Route path="/settings" element={<SettingsPage />} />
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
