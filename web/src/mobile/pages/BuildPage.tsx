import { useState } from "react";
import MobileSelect from "../components/MobileSelect";

const BUILDER_TYPES = [
  { value: "weapon", label: "Weapon" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "repkit", label: "RepKit" },
  { value: "heavy", label: "Heavy" },
  { value: "enhancement", label: "Enhancement" },
  { value: "class-mod", label: "Class Mod" },
];

export default function MobileBuildPage() {
  const [builderType, setBuilderType] = useState("weapon");

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

      <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
        <p style={{ fontSize: 14, marginBottom: 4 }}>{BUILDER_TYPES.find(b => b.value === builderType)?.label} Builder</p>
        <p style={{ fontSize: 12 }}>Coming soon</p>
      </div>
    </div>
  );
}
