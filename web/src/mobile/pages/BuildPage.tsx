import { lazy, Suspense, useState } from "react";
import MobileSelect from "../components/MobileSelect";

const GrenadeBuilder = lazy(() => import("../builders/GrenadeBuilder"));

const BUILDER_TYPES = [
  { value: "weapon", label: "Weapon" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "repkit", label: "RepKit" },
  { value: "heavy", label: "Heavy" },
  { value: "enhancement", label: "Enhancement" },
  { value: "class-mod", label: "Class Mod" },
];

const LOADING = <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>Loading builder…</div>;
const COMING_SOON = (name: string) => (
  <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
    <p style={{ fontSize: 14, marginBottom: 4 }}>{name} Builder</p>
    <p style={{ fontSize: 12 }}>Coming soon</p>
  </div>
);

export default function MobileBuildPage() {
  const [builderType, setBuilderType] = useState("grenade");

  return (
    <div>
      <div className="mobile-page-header">
        <h1>Item Builder</h1>
      </div>

      <MobileSelect
        label="Item Type"
        required
        options={BUILDER_TYPES}
        value={builderType}
        onChange={setBuilderType}
      />

      <Suspense fallback={LOADING}>
        {builderType === "grenade" && <GrenadeBuilder />}
        {builderType === "weapon" && COMING_SOON("Weapon")}
        {builderType === "shield" && COMING_SOON("Shield")}
        {builderType === "repkit" && COMING_SOON("RepKit")}
        {builderType === "heavy" && COMING_SOON("Heavy")}
        {builderType === "enhancement" && COMING_SOON("Enhancement")}
        {builderType === "class-mod" && COMING_SOON("Class Mod")}
      </Suspense>
    </div>
  );
}
