import { lazy, Suspense, useState } from "react";
import MobileSelect from "../components/MobileSelect";

const WeaponBuilder = lazy(() => import("../builders/WeaponBuilder"));
const GrenadeBuilder = lazy(() => import("../builders/GrenadeBuilder"));
const ShieldBuilder = lazy(() => import("../builders/ShieldBuilder"));
const RepkitBuilder = lazy(() => import("../builders/RepkitBuilder"));
const HeavyBuilder = lazy(() => import("../builders/HeavyBuilder"));
const EnhancementBuilder = lazy(() => import("../builders/EnhancementBuilder"));
const ClassModBuilder = lazy(() => import("../builders/ClassModBuilder"));

const BUILDER_TYPES = [
  { value: "weapon", label: "Weapon" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "repkit", label: "RepKit" },
  { value: "heavy", label: "Heavy" },
  { value: "enhancement", label: "Enhancement" },
  { value: "class-mod", label: "Class Mod" },
];

const LOADING = <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading builder…</div>;

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
        {builderType === "shield" && <ShieldBuilder />}
        {builderType === "repkit" && <RepkitBuilder />}
        {builderType === "heavy" && <HeavyBuilder />}
        {builderType === "enhancement" && <EnhancementBuilder />}
        {builderType === "weapon" && <WeaponBuilder />}
        {builderType === "class-mod" && <ClassModBuilder />}
      </Suspense>
    </div>
  );
}
