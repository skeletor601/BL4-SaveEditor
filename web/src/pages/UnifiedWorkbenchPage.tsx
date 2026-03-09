import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
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

type BuilderKind =
  | "weapon"
  | "class-mod"
  | "enhancement"
  | "repkit"
  | "grenade"
  | "shield"
  | "heavy";

type EditorKind = "weapon" | "item" | "class-mod" | "enhancement" | "generic";

type GearForgeNavState = {
  tab?: "builder" | "editor";
  builderKind?: BuilderKind;
  editorKind?: EditorKind;
};

const WEAPON_TYPES = new Set(["Pistol", "Shotgun", "SMG", "Assault Rifle", "Sniper"]);

const BUILDER_OPTIONS: { value: BuilderKind; label: string }[] = [
  { value: "weapon", label: "Guns (Weapon Gen)" },
  { value: "class-mod", label: "Class Mod" },
  { value: "enhancement", label: "Enhancement" },
  { value: "repkit", label: "RepKit" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "heavy", label: "Heavy" },
];

const EDITOR_OPTIONS: { value: EditorKind; label: string }[] = [
  { value: "weapon", label: "Weapon Editor" },
  { value: "item", label: "Item Editor (Grenade/Shield/RepKit/Heavy)" },
  { value: "class-mod", label: "Class Mod Editor" },
  { value: "enhancement", label: "Enhancement Editor" },
  { value: "generic", label: "Generic Accessory Editor" },
];

function detectEditorKind(itemTypeRaw: unknown): EditorKind {
  const itemType = String(itemTypeRaw ?? "").trim();
  if (WEAPON_TYPES.has(itemType)) return "weapon";
  if (["Grenade", "Shield", "Repkit", "Heavy Weapon"].includes(itemType)) return "item";
  if (itemType === "Class Mod") return "class-mod";
  if (itemType === "Enhancement") return "enhancement";
  return "generic";
}

export default function UnifiedWorkbenchPage() {
  const location = useLocation();
  const [tab, setTab] = useState<"builder" | "editor">("builder");
  const [builderKind, setBuilderKind] = useState<BuilderKind>("weapon");
  const [editorKind, setEditorKind] = useState<EditorKind>("weapon");
  const [detectInput, setDetectInput] = useState("");
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);

  useEffect(() => {
    const navState = (location.state ?? {}) as GearForgeNavState;
    if (navState.tab) setTab(navState.tab);
    if (navState.builderKind) setBuilderKind(navState.builderKind);
    if (navState.editorKind) setEditorKind(navState.editorKind);
  }, [location.state]);

  const handleDetectEditor = useCallback(async () => {
    const serial = detectInput.trim();
    if (!serial || !serial.startsWith("@")) {
      setDetectMessage("Paste a Base85 serial (starts with @) to auto-detect editor.");
      return;
    }
    setDetectLoading(true);
    setDetectMessage(null);
    try {
      const res = await fetchApi("save/decode-items", {
        method: "POST",
        body: JSON.stringify({ serials: [serial] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetectMessage(
          isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Auto-detect failed"),
        );
        return;
      }
      const item = Array.isArray(data?.items) ? data.items[0] : null;
      if (!item || item?.error) {
        setDetectMessage(item?.error ?? "Could not detect item type.");
        return;
      }
      const kind = detectEditorKind(item?.itemType);
      setEditorKind(kind);
      setDetectMessage(`Detected "${String(item?.itemType ?? "Unknown")}" → ${EDITOR_OPTIONS.find((o) => o.value === kind)?.label ?? kind}.`);
    } catch {
      setDetectMessage(getApiUnavailableError());
    } finally {
      setDetectLoading(false);
    }
  }, [detectInput]);

  const builderView = useMemo(() => {
    switch (builderKind) {
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
      default:
        return <WeaponGenView />;
    }
  }, [builderKind]);

  const editorView = useMemo(() => {
    switch (editorKind) {
      case "weapon":
        return <WeaponEditView />;
      case "item":
        return <ItemEditView />;
      case "class-mod":
        return <ClassModBuilderView />;
      case "enhancement":
        return <EnhancementBuilderView />;
      case "generic":
      default:
        return (
          <AccessoryEditView
            title="Accessory"
            description="Generic serial decode/edit/encode/add flow for accessory-like items."
          />
        );
    }
  }, [editorKind]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] px-4 py-3 bg-[rgba(48,52,60,0.85)] backdrop-blur-sm">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Gear Forge</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Canonical all-in-one area: build anything in one tab and edit anything in another.
        </p>
        <nav className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-panel-border)]/50 mt-2">
          <button
            type="button"
            onClick={() => setTab("builder")}
            className={`min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg border text-sm ${
              tab === "builder"
                ? "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] text-[var(--color-accent)]"
                : "border-[var(--color-panel-border)]/70 text-[var(--color-text-muted)] hover:bg-[rgba(24,28,34,0.5)] hover:text-[var(--color-accent)]"
            }`}
          >
            All-in-One Builder
          </button>
          <button
            type="button"
            onClick={() => setTab("editor")}
            className={`min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg border text-sm ${
              tab === "editor"
                ? "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] text-[var(--color-accent)]"
                : "border-[var(--color-panel-border)]/70 text-[var(--color-text-muted)] hover:bg-[rgba(24,28,34,0.5)] hover:text-[var(--color-accent)]"
            }`}
          >
            All-in-One Editor
          </button>
        </nav>
      </div>

      {tab === "builder" ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-panel-border)] p-3 bg-[rgba(24,28,34,0.6)] flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-[var(--color-text-muted)]">Build Type:</label>
            <select
              value={builderKind}
              onChange={(e) => setBuilderKind(e.target.value as BuilderKind)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
            >
              {BUILDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {builderView}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-panel-border)] p-3 bg-[rgba(24,28,34,0.6)] space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="text-sm text-[var(--color-text-muted)]">Detected Editor:</label>
              <select
                value={editorKind}
                onChange={(e) => setEditorKind(e.target.value as EditorKind)}
                className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] min-h-[44px]"
              >
                {EDITOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={detectInput}
                onChange={(e) => setDetectInput(e.target.value)}
                placeholder="Paste @U... serial to auto-detect item type"
                className="flex-1 min-w-0 w-full sm:min-w-[280px] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleDetectEditor}
                disabled={detectLoading}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] disabled:opacity-50 min-h-[44px]"
              >
                {detectLoading ? "Detecting..." : "Auto Detect Editor"}
              </button>
            </div>
            {detectMessage && <p className="text-sm text-[var(--color-accent)]">{detectMessage}</p>}
          </div>
          {editorView}
        </div>
      )}
    </div>
  );
}

