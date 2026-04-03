import { Routes, Route, Navigate } from "react-router-dom";
import BottomTabBar from "./components/BottomTabBar";
import ToastContainer from "./components/Toast";
import BuildPage from "./pages/BuildPage";
import SearchPage from "./pages/SearchPage";
import CommunityPage from "./pages/CommunityPage";
import TranslatePage from "./pages/TranslatePage";
import SettingsPage from "./pages/SettingsPage";
import LootLobbyPage from "./pages/LootLobbyPage";
import "./mobile.css";

export default function MobileApp() {
  return (
    <div className="mobile-shell">
      <div className="mobile-content">
        <Routes>
          <Route index element={<BuildPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="translate" element={<TranslatePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="loot-lobby" element={<LootLobbyPage />} />
          <Route path="*" element={<Navigate to="/mobile" replace />} />
        </Routes>
      </div>
      <BottomTabBar />
      <ToastContainer />
    </div>
  );
}
