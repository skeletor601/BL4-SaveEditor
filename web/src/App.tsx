import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import MasterSearch from "@/pages/MasterSearch";
import SaveToolsPage from "@/pages/SaveToolsPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/master-search" element={<MasterSearch />} />
        <Route path="/save-tools/*" element={<SaveToolsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
