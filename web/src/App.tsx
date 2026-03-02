import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import MasterSearch from "@/pages/MasterSearch";
import CharacterSectionPage from "@/pages/CharacterSectionPage";
import InventoryPage from "@/pages/InventoryPage";
import WeaponToolboxPage from "@/pages/WeaponToolboxPage";
import AccessoriesPage from "@/pages/AccessoriesPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/character" element={<Navigate to="/character/select-save" replace />} />
        <Route path="/character/*" element={<CharacterSectionPage />} />
        <Route path="/inventory/*" element={<InventoryPage />} />
        <Route path="/weapon-toolbox/*" element={<WeaponToolboxPage />} />
        <Route path="/accessories/*" element={<AccessoriesPage />} />
        <Route path="/master-search" element={<MasterSearch />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
