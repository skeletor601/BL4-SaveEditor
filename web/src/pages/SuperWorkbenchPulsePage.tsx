import { useMemo, useState } from "react";
import WeaponGenView from "@/pages/weapon-toolbox/WeaponGenView";
import WeaponEditView from "@/pages/weapon-toolbox/WeaponEditView";
import ItemEditView from "@/pages/weapon-toolbox/ItemEditView";
import ClassModBuilderView from "@/pages/accessories/ClassModBuilderView";
import EnhancementBuilderView from "@/pages/accessories/EnhancementBuilderView";
import RepkitBuilderView from "@/pages/accessories/RepkitBuilderView";
import GrenadeBuilderView from "@/pages/accessories/GrenadeBuilderView";
import ShieldBuilderView from "@/pages/accessories/ShieldBuilderView";
import HeavyBuilderView from "@/pages/accessories/HeavyBuilderView";
import AccessoryEditView from "@/pages/accessories/AccessoryEditView";
import DecoderView from "@/pages/inventory/DecoderView";
import PartsTranslatorView from "@/pages/inventory/PartsTranslatorView";

type Mode = "build" | "edit";
type BuildKind = "weapon" | "class-mod" | "enhancement" | "repkit" | "grenade" | "shield" | "heavy";
type EditKind = "weapon" | "item" | "class-mod" | "enhancement" | "generic";
type UtilityKind = "none" | "decoder" | "parts-translator";

const BUILD_OPTIONS: { value: BuildKind; label: string; emoji: string }[] = [
  { value: "weapon", label: "Weapon Builder", emoji: "🔫" },
  { value: "class-mod", label: "Class Mod Builder", emoji: "🧠" },
  { value: "enhancement", label: "Enhancement Builder", emoji: "⚙️" },
  { value: "repkit", label: "RepKit Builder", emoji: "💉" },
  { value: "grenade", label: "Grenade Builder", emoji: "💣" },
  { value: "shield", label: "Shield Builder", emoji: "🛡️" },
  { value: "heavy", label: "Heavy Builder", emoji: "🚀" },
];

const EDIT_OPTIONS: { value: EditKind; label: string; emoji: string }[] = [
  { value: "weapon", label: "Weapon Editor", emoji: "✏️" },
  { value: "item", label: "Item Editor", emoji: "🧩" },
  { value: "class-mod", label: "Class Mod Editor", emoji: "📎" },
  { value: "enhancement", label: "Enhancement Editor", emoji: "🧪" },
  { value: "generic", label: "Generic Editor", emoji: "🧰" },
];

export default function SuperWorkbenchPulsePage() {
  const [mode, setMode] = useState<Mode>("build");
  const [buildKind, setBuildKind] = useState<BuildKind>("weapon");
  const [editKind, setEditKind] = useState<EditKind>("weapon");
  const [utilityKind, setUtilityKind] = useState<UtilityKind>("decoder");
  const [compactView, setCompactView] = useState(false);

  const activePrimary = useMemo(() => {
    if (mode === "build") {
      switch (buildKind) {
        case "weapon":
          return <WeaponGenView />;
        case "class-mod":
          return <ClassModBuilderView />;
        case "enhancement":
          return <EnhancementBuilderView />;
        case "repkit":
          return <RepkitBuilderView />;
        case "grenade":
          return <GrenadeBuilderView />;
        case "shield":
          return <ShieldBuilderView />;
        case "heavy":
          return <HeavyBuilderView />;
      }
    }
    switch (editKind) {
      case "weapon":
        return <WeaponEditView />;
      case "item":
        return <ItemEditView />;
      case "class-mod":
        return <AccessoryEditView title="Class Mod" description="Class Mod serial editing flow." />;
      case "enhancement":
        return <AccessoryEditView title="Enhancement" description="Enhancement serial editing flow." />;
      case "generic":
      default:
        return <AccessoryEditView title="Generic Accessory" description="Fallback accessory editor." />;
    }
  }, [mode, buildKind, editKind]);

  const utilityView = useMemo(() => {
    switch (utilityKind) {
      case "decoder":
        return <DecoderView />;
      case "parts-translator":
        return <PartsTranslatorView />;
      case "none":
      default:
        return null;
    }
  }, [utilityKind]);

  const modeOptions = mode === "build" ? BUILD_OPTIONS : EDIT_OPTIONS;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--color-panel-border)] p-4 bg-[radial-gradient(circle_at_top_left,rgba(255,140,0,0.2),rgba(24,28,34,0.9))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-accent)]">Super Workbench Pulse</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Command-deck UI with card selectors, accent glow, and optional compact mode.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input type="checkbox" checked={compactView} onChange={(e) => setCompactView(e.target.checked)} />
            Compact View
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.62)] p-3">
        <div className="flex flex-wrap gap-2">
          {(["build", "edit"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg border min-h-[44px] ${
                mode === m
                  ? "border-[var(--color-accent)] text-black bg-[var(--color-accent)]"
                  : "border-[var(--color-panel-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {m === "build" ? "Build Pipeline" : "Edit Pipeline"}
            </button>
          ))}
          <select
            value={utilityKind}
            onChange={(e) => setUtilityKind(e.target.value as UtilityKind)}
            className="ml-auto px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          >
            <option value="none">Utility: Off</option>
            <option value="decoder">Utility: Decoder</option>
            <option value="parts-translator">Utility: Parts Translator</option>
          </select>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {modeOptions.map((o) => {
          const selected = mode === "build" ? buildKind === o.value : editKind === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() =>
                mode === "build"
                  ? setBuildKind(o.value as BuildKind)
                  : setEditKind(o.value as EditKind)
              }
              className={`text-left rounded-xl border p-3 min-h-[92px] transition ${
                selected
                  ? "border-[var(--color-accent)] bg-[rgba(24,28,34,0.95)] shadow-[0_0_16px_rgba(255,140,0,0.2)]"
                  : "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.7)]"
              }`}
            >
              <div className="text-2xl mb-1">{o.emoji}</div>
              <div className={`font-medium ${selected ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
                {o.label}
              </div>
            </button>
          );
        })}
      </section>

      <section className={`grid gap-4 ${compactView ? "xl:grid-cols-[1fr_300px]" : "xl:grid-cols-[1fr_420px]"}`}>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3">
          {activePrimary}
        </div>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3">
          {utilityView ?? (
            <div className="min-h-[200px] flex items-center justify-center text-sm text-[var(--color-text-muted)]">
              Utility disabled.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

