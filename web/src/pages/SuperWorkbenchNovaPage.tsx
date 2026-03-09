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

const BUILD_OPTIONS: { value: BuildKind; label: string }[] = [
  { value: "weapon", label: "Weapon Builder" },
  { value: "class-mod", label: "Class Mod Builder" },
  { value: "enhancement", label: "Enhancement Builder" },
  { value: "repkit", label: "RepKit Builder" },
  { value: "grenade", label: "Grenade Builder" },
  { value: "shield", label: "Shield Builder" },
  { value: "heavy", label: "Heavy Builder" },
];

const EDIT_OPTIONS: { value: EditKind; label: string }[] = [
  { value: "weapon", label: "Weapon Editor" },
  { value: "item", label: "Item Editor" },
  { value: "class-mod", label: "Class Mod Editor" },
  { value: "enhancement", label: "Enhancement Editor" },
  { value: "generic", label: "Generic Accessory Editor" },
];

const UTILITY_OPTIONS: { value: UtilityKind; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "decoder", label: "Decoder" },
  { value: "parts-translator", label: "Parts Translator" },
];

export default function SuperWorkbenchNovaPage() {
  const [mode, setMode] = useState<Mode>("build");
  const [buildKind, setBuildKind] = useState<BuildKind>("weapon");
  const [editKind, setEditKind] = useState<EditKind>("weapon");
  const [utilityKind, setUtilityKind] = useState<UtilityKind>("decoder");

  const primary = useMemo(() => {
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

  const utility = useMemo(() => {
    if (utilityKind === "none") return null;
    return utilityKind === "decoder" ? <DecoderView /> : <PartsTranslatorView />;
  }, [utilityKind]);

  const modeOptions = mode === "build" ? BUILD_OPTIONS : EDIT_OPTIONS;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--color-panel-border)] bg-[rgba(10,12,16,0.85)] p-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Super Workbench Nova</h1>
          <div className="flex rounded-xl overflow-hidden border border-[var(--color-panel-border)]">
            <button
              type="button"
              onClick={() => setMode("build")}
              className={`px-4 py-2 min-h-[44px] ${mode === "build" ? "bg-[var(--color-accent)] text-black" : "bg-[rgba(24,28,34,0.9)] text-[var(--color-text-muted)]"}`}
            >
              BUILD
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`px-4 py-2 min-h-[44px] ${mode === "edit" ? "bg-[var(--color-accent)] text-black" : "bg-[rgba(24,28,34,0.9)] text-[var(--color-text-muted)]"}`}
            >
              EDIT
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          Sidebar-driven cockpit UI for one-page build/edit workflows.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[280px_1fr_340px]">
        <aside className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.72)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            {mode === "build" ? "Build Systems" : "Edit Systems"}
          </p>
          <div className="space-y-2">
            {modeOptions.map((o) => {
              const selected = mode === "build" ? buildKind === o.value : editKind === o.value;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() =>
                    mode === "build"
                      ? setBuildKind(o.value as BuildKind)
                      : setEditKind(o.value as EditKind)
                  }
                  className={`w-full text-left px-3 py-2 rounded-lg border min-h-[44px] ${
                    selected
                      ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[rgba(24,28,34,0.95)]"
                      : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-3">
          {primary}
        </main>

        <aside className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.72)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Utility Rail</p>
          <div className="grid grid-cols-1 gap-2 mb-3">
            {UTILITY_OPTIONS.map((u) => (
              <label
                key={u.value}
                className={`px-3 py-2 rounded-lg border cursor-pointer min-h-[44px] flex items-center gap-2 ${
                  utilityKind === u.value
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)]"
                }`}
              >
                <input
                  type="radio"
                  checked={utilityKind === u.value}
                  onChange={() => setUtilityKind(u.value)}
                />
                {u.label}
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-[var(--color-panel-border)] p-2 bg-[rgba(24,28,34,0.55)]">
            {utility ?? (
              <div className="min-h-[180px] flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                Utility off.
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

