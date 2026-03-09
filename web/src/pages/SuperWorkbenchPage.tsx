import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";
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

type WorkMode = "build" | "edit";
type BuildKind =
  | "weapon"
  | "class-mod"
  | "enhancement"
  | "repkit"
  | "grenade"
  | "shield"
  | "heavy";
type EditKind = "weapon" | "item" | "class-mod" | "enhancement" | "generic";

interface MiniSearchItem {
  code: string;
  itemType: string;
  partName: string;
  effect?: string;
  manufacturer?: string;
  rarity?: string;
  partType?: string;
}

type MiniQuickFilter = "none" | "legendary-barrels" | "damage-items";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

const BUILD_OPTIONS: { value: BuildKind; label: string; hint: string }[] = [
  { value: "weapon", label: "Weapon Builder", hint: "Generate guns, skins, god rolls" },
  { value: "class-mod", label: "Class Mod Builder", hint: "Roll and craft class mods" },
  { value: "enhancement", label: "Enhancement Builder", hint: "Enhancement perk rolls" },
  { value: "repkit", label: "RepKit Builder", hint: "RepKit serialization and add flow" },
  { value: "grenade", label: "Grenade Builder", hint: "Grenade mod builds and adds" },
  { value: "shield", label: "Shield Builder", hint: "Shield parts and perk combos" },
  { value: "heavy", label: "Heavy Builder", hint: "Heavy weapon/ordnance builds" },
];

const EDIT_OPTIONS: { value: EditKind; label: string; hint: string }[] = [
  { value: "weapon", label: "Weapon Editor", hint: "Full weapon serial editor" },
  { value: "item", label: "Item Editor", hint: "Grenade/Shield/RepKit/Heavy editor" },
  { value: "class-mod", label: "Class Mod Editor", hint: "Class mod decode/edit/encode" },
  { value: "enhancement", label: "Enhancement Editor", hint: "Enhancement decode/edit/encode" },
  { value: "generic", label: "Generic Accessory Editor", hint: "Fallback editor for custom tests" },
];

export default function SuperWorkbenchPage() {
  const location = useLocation();
  const [mode, setMode] = useState<WorkMode>("build");
  const [buildKind, setBuildKind] = useState<BuildKind>("weapon");
  const [editKind, setEditKind] = useState<EditKind>("weapon");
  const [miniSearch, setMiniSearch] = useState("");
  const [miniResults, setMiniResults] = useState<MiniSearchItem[]>([]);
  const [miniAllItems, setMiniAllItems] = useState<MiniSearchItem[]>([]);
  const [miniManufacturers, setMiniManufacturers] = useState<string[]>([]);
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniStatus, setMiniStatus] = useState<string | null>(null);
  const [miniQuickFilter, setMiniQuickFilter] = useState<MiniQuickFilter>("none");
  const [miniManufacturer, setMiniManufacturer] = useState("All");
  const [liveBase85, setLiveBase85] = useState("");
  const [liveDecoded, setLiveDecoded] = useState("");
  const [lastEditedCodecSide, setLastEditedCodecSide] = useState<"base85" | "decoded" | null>(null);
  const [codecLoading, setCodecLoading] = useState(false);
  const [codecStatus, setCodecStatus] = useState<string | null>("Live codec ready");
  const codecRequestId = useRef(0);
  const [miniCopyModalOpen, setMiniCopyModalOpen] = useState(false);
  const [miniCopyQty, setMiniCopyQty] = useState("1");
  const [miniCopyCode, setMiniCopyCode] = useState("");

  useEffect(() => {
    type GearForgeNavState = {
      tab?: "builder" | "editor";
      builderKind?: BuildKind;
      editorKind?: EditKind;
      loadItem?: {
        serial?: string;
        decodedFull?: string;
      };
      pasteDecoded?: string;
    };
    const navState = (location.state ?? {}) as GearForgeNavState;
    if (navState.tab) setMode(navState.tab === "builder" ? "build" : "edit");
    if (navState.builderKind) setBuildKind(navState.builderKind);
    if (navState.editorKind) setEditKind(navState.editorKind);
    if (navState.loadItem?.serial || navState.loadItem?.decodedFull) {
      setMode("edit");
      if (typeof navState.loadItem?.serial === "string") setLiveBase85(navState.loadItem.serial);
      if (typeof navState.loadItem?.decodedFull === "string") setLiveDecoded(navState.loadItem.decodedFull);
      setCodecStatus("Loaded item from inventory");
    }
    if (typeof navState.pasteDecoded === "string" && navState.pasteDecoded.trim()) {
      setMode("edit");
      setEditKind("weapon");
      setLiveDecoded(navState.pasteDecoded.trim());
      setCodecStatus("Loaded preset decoded code");
    }
  }, [location.state]);

  const handlePrimaryCodecChange = useCallback(
    (payload: { base85: string; decoded: string }, source: string) => {
      const incomingBase85 = payload.base85 ?? "";
      const incomingDecoded = payload.decoded ?? "";
      // Prevent freshly-mounted editors from wiping existing shared codec with empty initial state.
      if (!incomingBase85.trim() && !incomingDecoded.trim() && (liveBase85.trim() || liveDecoded.trim())) {
        return;
      }
      setLastEditedCodecSide(null);
      setLiveBase85(incomingBase85);
      setLiveDecoded(incomingDecoded);
      setCodecStatus(`Synced from ${source}`);
    },
    [liveBase85, liveDecoded],
  );

  const activeTitle = mode === "build"
    ? BUILD_OPTIONS.find((o) => o.value === buildKind)?.label ?? "Builder"
    : EDIT_OPTIONS.find((o) => o.value === editKind)?.label ?? "Editor";

  const activeHint = mode === "build"
    ? BUILD_OPTIONS.find((o) => o.value === buildKind)?.hint ?? ""
    : EDIT_OPTIONS.find((o) => o.value === editKind)?.hint ?? "";

  const primaryView = useMemo(() => {
    if (mode === "build") {
      switch (buildKind) {
        case "weapon":
          return (
            <WeaponGenView
              suppressCodecPanels
              onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Weapon Builder")}
            />
          );
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
        return (
          <WeaponEditView
            suppressCodecPanels
            externalBase85={liveBase85}
            externalDecoded={liveDecoded}
            onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Weapon Editor")}
          />
        );
      case "item":
        return (
          <ItemEditView
            suppressCodecPanels
            externalBase85={liveBase85}
            externalDecoded={liveDecoded}
            onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Item Editor")}
          />
        );
      case "class-mod":
        return (
          <AccessoryEditView
            title="Class Mod"
            description="Decode, edit, and encode class mod serials; add to backpack."
            suppressCodecPanels
            externalBase85={liveBase85}
            externalDecoded={liveDecoded}
            onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Class Mod Editor")}
          />
        );
      case "enhancement":
        return (
          <AccessoryEditView
            title="Enhancement"
            description="Decode, edit, and encode enhancement serials; add to backpack."
            suppressCodecPanels
            externalBase85={liveBase85}
            externalDecoded={liveDecoded}
            onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Enhancement Editor")}
          />
        );
      case "generic":
      default:
        return (
          <AccessoryEditView
            title="Accessory (Generic)"
            description="Experimental generic editor for unknown/edge-case accessory serials."
            suppressCodecPanels
            externalBase85={liveBase85}
            externalDecoded={liveDecoded}
            onCodecChange={(payload) => handlePrimaryCodecChange(payload, "Generic Accessory Editor")}
          />
        );
    }
  }, [mode, buildKind, editKind, handlePrimaryCodecChange]);

  useEffect(() => {
    let cancelled = false;
    setMiniLoading(true);
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: unknown[] }) => {
        if (cancelled) return;
        const rows = Array.isArray(d?.items) ? d.items : [];
        const mapped: MiniSearchItem[] = rows
          .map((row) => {
            const r = (row ?? {}) as Record<string, unknown>;
            return {
              code: String(r.code ?? r.Code ?? "").trim(),
              itemType: String(r.itemType ?? r["Item Type"] ?? r["Weapon Type"] ?? "").trim(),
              partName: String(r.partName ?? r.name ?? r.string ?? r.String ?? "").trim(),
              effect: String(r.effect ?? r.Effect ?? r.stat ?? r.Stat ?? "").trim(),
              manufacturer: String(r.manufacturer ?? r.Manufacturer ?? r.canonicalManufacturer ?? "").trim(),
              rarity: String(r.rarity ?? r.Rarity ?? r.canonicalRarity ?? "").trim(),
              partType: String(r.partType ?? r["Part Type"] ?? r.canonicalPartType ?? "").trim(),
            };
          })
          .filter((x) => x.code);
        setMiniAllItems(mapped);
        const mfgs = Array.from(
          new Set(
            mapped
              .map((x) => x.manufacturer)
              .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setMiniManufacturers(mfgs);
      })
      .catch(() => {
        if (cancelled) return;
        setMiniAllItems([]);
        setMiniManufacturers([]);
        setMiniStatus("Search data failed to load");
      })
      .finally(() => {
        if (!cancelled) setMiniLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = normalize(miniSearch);
    const hasFilters = miniQuickFilter !== "none" || miniManufacturer !== "All";
    if (!q && !hasFilters) {
      setMiniResults([]);
      setMiniStatus("Type to search parts");
      return;
    }
    setMiniLoading(true);
    const t = setTimeout(() => {
      let list = miniAllItems;
      if (q) {
        list = list.filter((item) => {
          const hay = normalize(
            `${item.code} ${item.partName} ${item.effect ?? ""} ${item.itemType} ${item.manufacturer ?? ""} ${item.partType ?? ""} ${item.rarity ?? ""}`,
          );
          return hay.includes(q);
        });
      }
      if (miniQuickFilter === "legendary-barrels") {
        list = list.filter((item) => {
          const isBarrel = normalize(item.partType).includes("barrel") || normalize(item.partName).includes("barrel");
          const isLegendary =
            normalize(item.rarity).includes("legendary") ||
            normalize(`${item.partName} ${item.effect ?? ""}`).includes("legendary");
          return isBarrel && isLegendary;
        });
      } else if (miniQuickFilter === "damage-items") {
        list = list.filter((item) =>
          /\bdamage\b|\bsplash\b|\bcrit\b|\bgun damage\b|\bmelee damage\b/i.test(
            `${item.partName} ${item.effect ?? ""} ${item.itemType} ${item.partType ?? ""}`,
          ),
        );
      }
      if (miniManufacturer !== "All") {
        list = list.filter((item) => normalize(item.manufacturer) === normalize(miniManufacturer));
      }
      const sliced = list.slice(0, 160);
      setMiniResults(sliced);
      setMiniStatus(sliced.length ? `${sliced.length} result(s)` : "No matches");
      setMiniLoading(false);
    }, 150);
    return () => clearTimeout(t);
  }, [miniSearch, miniQuickFilter, miniManufacturer, miniAllItems]);

  useEffect(() => {
    if (!lastEditedCodecSide) return;
    const reqId = ++codecRequestId.current;
    const timer = setTimeout(async () => {
      try {
        setCodecLoading(true);
        if (lastEditedCodecSide === "base85") {
          const serials = liveBase85
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!serials.length) {
            if (reqId !== codecRequestId.current) return;
            setLiveDecoded("");
            setCodecStatus("Paste Base85 or decoded to start live conversion.");
            return;
          }
          const res = await fetchApi("save/decode-items", {
            method: "POST",
            body: JSON.stringify({ serials }),
          });
          const data = await res.json().catch(() => ({}));
          if (reqId !== codecRequestId.current) return;
          if (!res.ok) {
            setCodecStatus(data?.error ?? "Live decode failed");
            return;
          }
          const items = Array.isArray(data?.items) ? data.items : [];
          const decodedLines = items.map((item: { decodedFull?: string; error?: string }, idx: number) =>
            item?.error ? `# Line ${idx + 1} error: ${item.error}` : String(item?.decodedFull ?? "").trim(),
          );
          setLiveDecoded(decodedLines.join("\n"));
          setCodecStatus(`Decoded ${items.length} line(s)`);
          return;
        }

        const decodedLines = liveDecoded
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!decodedLines.length) {
          if (reqId !== codecRequestId.current) return;
          setLiveBase85("");
          setCodecStatus("Paste Base85 or decoded to start live conversion.");
          return;
        }
        const out: string[] = [];
        for (let i = 0; i < decodedLines.length; i += 1) {
          const res = await fetchApi("save/encode-serial", {
            method: "POST",
            body: JSON.stringify({ decoded_string: decodedLines[i] }),
          });
          const data = await res.json().catch(() => ({}));
          if (reqId !== codecRequestId.current) return;
          if (!res.ok) {
            out.push(`# Line ${i + 1} error: ${data?.error ?? "Encode failed"}`);
          } else if (data?.success && typeof data?.serial === "string") {
            out.push(data.serial);
          } else {
            out.push(`# Line ${i + 1} error: ${data?.error ?? "Encode failed"}`);
          }
        }
        if (reqId !== codecRequestId.current) return;
        setLiveBase85(out.join("\n"));
        setCodecStatus(`Encoded ${decodedLines.length} line(s)`);
      } catch {
        if (reqId !== codecRequestId.current) return;
        setCodecStatus("Live codec unavailable");
      } finally {
        if (reqId === codecRequestId.current) setCodecLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [lastEditedCodecSide, liveBase85, liveDecoded]);

  const formatCodeByQty = useCallback((code: string, qty: number): string => {
    const trimmed = code.trim();
    const amount = Math.max(1, Math.min(999, qty));
    const pair = trimmed.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
    if (pair) {
      const prefix = Number(pair[1]);
      const part = Number(pair[2]);
      return `{${prefix}:[${Array.from({ length: amount }, () => String(part)).join(" ")}]}`;
    }
    const grouped = trimmed.match(/^\{\s*(\d+)\s*:\s*\[([0-9\s]+)\]\s*\}$/);
    if (grouped) {
      const prefix = Number(grouped[1]);
      const ids = grouped[2].trim().split(/\s+/).filter(Boolean);
      if (!ids.length) return trimmed;
      const repeated: string[] = [];
      for (let i = 0; i < amount; i += 1) repeated.push(...ids);
      return `{${prefix}:[${repeated.join(" ")}]}`;
    }
    const single = trimmed.match(/^\{\s*(\d+)\s*\}$/);
    if (single) {
      return Array.from({ length: amount }, () => `{${single[1]}}`).join(" ");
    }
    return Array.from({ length: amount }, () => trimmed).join(" ");
  }, []);

  const handleMiniCopyCode = useCallback((code: string) => {
    if (!code) return;
    setMiniCopyCode(code);
    setMiniCopyQty("1");
    setMiniCopyModalOpen(true);
  }, []);

  const handleConfirmMiniCopy = useCallback(() => {
    const qtyNum = Number(miniCopyQty.trim());
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      setMiniStatus("Enter a valid quantity (1+).");
      return;
    }
    const output = formatCodeByQty(miniCopyCode, qtyNum);
    navigator.clipboard
      .writeText(output)
      .then(() => {
        setMiniStatus(`Copied ${qtyNum}x`);
        setMiniCopyModalOpen(false);
      })
      .catch(() => setMiniStatus("Copy failed"));
  }, [miniCopyQty, miniCopyCode, formatCodeByQty]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border-2 border-[var(--color-accent)]/40 bg-[linear-gradient(135deg,rgba(24,28,34,0.95),rgba(24,28,34,0.75))] p-4 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-accent)]">Gear Forge</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Unified command center: build anything and edit anything from one surface.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.8)] p-1">
            <button
              type="button"
              onClick={() => setMode("build")}
              className={`px-3 py-2 rounded-md text-sm min-h-[40px] ${
                mode === "build"
                  ? "bg-[var(--color-accent)] text-black font-medium"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              }`}
            >
              Build Mode
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`px-3 py-2 rounded-md text-sm min-h-[40px] ${
                mode === "edit"
                  ? "bg-[var(--color-accent)] text-black font-medium"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              }`}
            >
              Edit Mode
            </button>
          </div>
        </div>

        <div className="grid gap-3 mt-4 md:grid-cols-1">
          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.65)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
              Active Engine
            </p>
            <p className="text-[var(--color-text)] font-medium">{activeTitle}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{activeHint}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-3">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
          {mode === "build" ? "Builder Selector" : "Editor Selector"}
        </p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(mode === "build" ? BUILD_OPTIONS : EDIT_OPTIONS).map((o) => {
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
                className={`text-left rounded-lg border px-3 py-2 min-h-[56px] ${
                  selected
                    ? "border-[var(--color-accent)] bg-[rgba(24,28,34,0.95)] text-[var(--color-accent)]"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[rgba(24,28,34,0.8)]"
                }`}
              >
                <div className="font-medium text-sm">{o.label}</div>
                <div className="text-xs opacity-85">{o.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Live Codec (Real-Time)
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {codecLoading ? "Converting..." : (codecStatus ?? "")}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-accent)]">Base85</label>
            <textarea
              value={liveBase85}
              onChange={(e) => {
                setLastEditedCodecSide("base85");
                setLiveBase85(e.target.value);
              }}
              placeholder="@U..."
              spellCheck={false}
              className="w-full min-h-[220px] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-accent)]">Deserialized</label>
            <textarea
              value={liveDecoded}
              onChange={(e) => {
                setLastEditedCodecSide("decoded");
                setLiveDecoded(e.target.value);
              }}
              placeholder="255, 0, 1, 50| 2, 1234|| {12} {1:7} ..."
              spellCheck={false}
              className="w-full min-h-[220px] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3">
          {primaryView}
        </div>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] block">
              Mini Master Search
            </label>
            <input
              type="search"
              value={miniSearch}
              onChange={(e) => setMiniSearch(e.target.value)}
              placeholder="Type here to search parts..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMiniQuickFilter((v) => (v === "legendary-barrels" ? "none" : "legendary-barrels"))}
                className={`px-2 py-1 rounded border text-xs ${
                  miniQuickFilter === "legendary-barrels"
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)]"
                }`}
              >
                Legendary Barrels
              </button>
              <button
                type="button"
                onClick={() => setMiniQuickFilter((v) => (v === "damage-items" ? "none" : "damage-items"))}
                className={`px-2 py-1 rounded border text-xs ${
                  miniQuickFilter === "damage-items"
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-[var(--color-panel-border)] text-[var(--color-text-muted)]"
                }`}
              >
                Damage Items
              </button>
            </div>
            <select
              value={miniManufacturer}
              onChange={(e) => setMiniManufacturer(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
              title="Manufacturer filter"
            >
              <option value="All">All manufacturers</option>
              {miniManufacturers.map((mfg) => (
                <option key={mfg} value={mfg}>
                  {mfg}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--color-text-muted)]">
              {miniLoading ? "Searching..." : (miniStatus ?? "Type to search parts")}
            </p>
          </div>
          <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1 mt-2">
            {miniResults.map((row, idx) => (
              <button
                key={`${row.code}-${idx}`}
                type="button"
                onClick={() => handleMiniCopyCode(row.code)}
                className="w-full text-left rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] px-3 py-2 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                title="Click to copy code"
              >
                <div className="font-mono text-xs">{row.code || "—"}</div>
                <div className="text-sm">{row.partName || "Unknown part"}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {row.itemType || "Item"}
                  {row.manufacturer ? ` • ${row.manufacturer}` : ""}
                  {row.effect ? ` • ${row.effect}` : ""}
                </div>
              </button>
            ))}
            {!miniLoading && miniResults.length === 0 && (
              <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                Search results will appear here.
              </div>
            )}
          </div>
        </div>
      </section>

      {miniCopyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg-overlay)]"
          onClick={() => setMiniCopyModalOpen(false)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--color-accent)] font-medium">How Many?</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 mb-3">
              Type quantity for this part stack copy.
            </p>
            <input
              type="number"
              min={1}
              max={999}
              value={miniCopyQty}
              onChange={(e) => setMiniCopyQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
              autoFocus
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-2 font-mono truncate" title={miniCopyCode}>
              {miniCopyCode}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMiniCopyModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMiniCopy}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium"
              >
                Copy Stack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

