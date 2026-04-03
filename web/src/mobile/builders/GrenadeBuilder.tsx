import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import { generateModdedGrenade, type GenerateModdedGrenadeResult } from "@/lib/generateModdedGrenade";
import type { GrenadeVisualRecipe } from "@/lib/generateModdedWeapon";
import {
  type SelectedPart, usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, GenerateBar, BuilderToggles, SkinSelector, partIdFromLabel, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface GrenadeBuilderPart { partId: number; stat: string; description?: string; }
interface GrenadeBuilderLegendaryPart extends GrenadeBuilderPart { mfgId: number; mfgName: string; }
interface GrenadeBuilderRarity { id: number; label: string; }
interface GrenadeBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, GrenadeBuilderRarity[]>;
  element: GrenadeBuilderPart[];
  firmware: GrenadeBuilderPart[];
  universalPerks: GrenadeBuilderPart[];
  legendaryPerks: GrenadeBuilderLegendaryPart[];
  mfgPerks: Record<number, GrenadeBuilderPart[]>;
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

const GRENADE_TYPE_ID = 245;

function buildDecodedString(
  mfgId: number, level: number, seed: number, rarity: string,
  legendaries: SelectedPart[], elements: SelectedPart[], firmware: SelectedPart[],
  mfgPerks: SelectedPart[], universalPerks: SelectedPart[], skinValue: string,
  data: GrenadeBuilderData,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const rarityEntry = rarities.find((r) => r.label === rarity);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  const otherMfg: Record<number, number[]> = {};
  for (const leg of legendaries) {
    if (leg.id.includes(":")) {
      const [m, p] = leg.id.split(":");
      const legMfg = parseInt(m, 10), legPart = parseInt(p, 10);
      if (!Number.isFinite(legMfg) || !Number.isFinite(legPart)) continue;
      if (legMfg === mfgId) { for (let i = 0; i < leg.qty; i++) parts.push(`{${legPart}}`); }
      else { if (!otherMfg[legMfg]) otherMfg[legMfg] = []; for (let i = 0; i < leg.qty; i++) otherMfg[legMfg].push(legPart); }
    }
  }
  for (const [m, ids] of Object.entries(otherMfg)) {
    const sorted = [...ids].sort((a, b) => a - b);
    parts.push(sorted.length === 1 ? `{${m}:${sorted[0]}}` : `{${m}:[${sorted.join(" ")}]}`);
  }
  for (const p of mfgPerks) { const pid = partIdFromLabel(p.id); if (pid) for (let i = 0; i < p.qty; i++) parts.push(`{${pid}}`); }

  const s245: number[] = [];
  const add = (id: string, qty: number) => { const n = parseInt(id, 10); if (Number.isFinite(n)) for (let i = 0; i < qty; i++) s245.push(n); };
  for (const e of elements) add(e.id, e.qty);
  for (const f of firmware) add(f.id, f.qty);
  for (const u of universalPerks) add(u.id, u.qty);
  if (s245.length === 1) parts.push(`{${GRENADE_TYPE_ID}:${s245[0]}}`);
  else if (s245.length > 1) { const sorted = [...s245].sort((a, b) => a - b); parts.push(`{${GRENADE_TYPE_ID}:[${sorted.join(" ")}]}`); }

  return applySkin(`${header} ${parts.join(" ")} |`, skinValue);
}

export default function GrenadeBuilder() {
  const { data, loading, error } = useMobileBuilderData<GrenadeBuilderData>("accessories/grenade/builder-data");
  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [skinValue, setSkinValue] = useState("");
  const [code, setCode] = useState("");
  const [modPower, setModPower] = useState<"stable" | "op" | "insane">("stable");
  const [grenadeStats, setGrenadeStats] = useState<GenerateModdedGrenadeResult["stats"] | null>(null);
  const [modGenerating, setModGenerating] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [skins, setSkins] = useState<{ label: string; value: string }[]>([]);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  const legends = usePartList();
  const elements = usePartList();
  const fw = usePartList();
  const mfgPerks = usePartList();
  const uniPerks = usePartList();

  if (data && mfgId == null && data.mfgs.length) setMfgId(data.mfgs[0].id);

  // Load skins + universal parts for "All Parts" mode
  useEffect(() => {
    fetchApi("weapon-gen/data").then((r) => r.json()).then((d) => { if (d?.skins) setSkins(d.skins); }).catch(() => {});
    fetchApi("parts/data").then((r) => r.json()).then((d) => {
      if (d?.items) setUniversalParts(d.items.map((i: Record<string, unknown>) => ({
        code: String(i.code ?? ""), label: String(i.partName ?? i.itemType ?? ""),
        effect: String(i.effect ?? ""), partType: String(i.partType ?? ""),
        category: String(i.category ?? ""), manufacturer: String(i.manufacturer ?? ""),
      })));
    }).catch(() => {});
  }, []);

  const expandOpts = useCallback((base: PickerOption[], partType: string): PickerOption[] => {
    if (!allParts) return base;
    const seen = new Set(base.map((o) => o.value));
    const extra: PickerOption[] = [];
    const ptLower = partType.toLowerCase();
    for (const up of universalParts) {
      if (!up.code || (up.category || "").toLowerCase() !== "grenade") continue;
      if ((up.partType || "").toLowerCase() !== ptLower) continue;
      const m = up.code.match(/^\{(\d+):(\d+)\}$/);
      if (!m) continue;
      const pid = m[2];
      if (seen.has(pid)) continue;
      seen.add(pid);
      const mfgLabel = up.manufacturer ? ` (${up.manufacturer})` : "";
      extra.push({ value: pid, label: `${pid} - ${up.label || up.effect || pid}${mfgLabel}` });
    }
    return [...base, ...extra];
  }, [allParts, universalParts]);

  const mfgOptions = useMemo<PickerOption[]>(() => data?.mfgs.map((m) => ({ value: String(m.id), label: m.name })) ?? [], [data]);
  const rarityOptions = useMemo<PickerOption[]>(() => (data && mfgId != null ? (data.raritiesByMfg[mfgId] ?? []) : []).map((r) => ({ value: r.label, label: r.label })), [data, mfgId]);
  const elementOptions = useMemo(() => expandOpts(
    (data?.element ?? []).map((e) => ({ value: String(e.partId), label: `${e.partId} - ${e.stat}` })), "Element"), [data, expandOpts]);
  const firmwareOptions = useMemo(() => expandOpts(
    (data?.firmware ?? []).map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.stat}` })), "Firmware"), [data, expandOpts]);
  const legendaryOptions = useMemo<PickerOption[]>(() => (data?.legendaryPerks ?? []).map((l) => ({ value: `${l.mfgId}:${l.partId}`, label: `${l.mfgName}: ${l.stat}` })), [data]);
  const mfgPerkOptions = useMemo(() => expandOpts(
    (data && mfgId != null ? (data.mfgPerks[mfgId] ?? []) : []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), "Perk"), [data, mfgId, expandOpts]);
  const universalPerkOptions = useMemo(() => expandOpts(
    (data?.universalPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), "Perk"), [data, expandOpts]);

  const handleGenerate = useCallback(() => {
    if (!data || mfgId == null) return;
    setCode(buildDecodedString(mfgId, level, seed, rarity, legends.parts, elements.parts, fw.parts, mfgPerks.parts, uniPerks.parts, skinValue, data));
  }, [data, mfgId, level, seed, rarity, legends.parts, elements.parts, fw.parts, mfgPerks.parts, uniPerks.parts, skinValue]);

  const handleGenerateModded = useCallback(async () => {
    if (!data || mfgId == null) return;
    setModGenerating(true);
    try {
      // Build a random stock base
      const pickR = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
      const rarities = data.raritiesByMfg[mfgId] ?? [];
      const autoSel: Record<string, { label: string; qty: string }[]> = {};
      if (rarities.length) autoSel["Rarity"] = [{ label: pickR(rarities).label, qty: "1" }];
      const nonKinetic = data.element.filter((e) => !/kinetic/i.test(e.stat));
      if (nonKinetic.length) { const el = pickR(nonKinetic); autoSel["Element"] = [{ label: `${el.partId} - ${el.stat}`, qty: "1" }]; }
      if (data.firmware.length) { const fw = pickR(data.firmware); autoSel["Firmware"] = [{ label: `${fw.partId} - ${fw.stat}`, qty: "1" }]; }
      const mfgP = data.mfgPerks[mfgId] ?? [];
      if (mfgP.length) autoSel["Mfg Perk"] = [...mfgP].sort(() => Math.random() - 0.5).slice(0, Math.min(6, mfgP.length)).map((p) => ({ label: `${p.partId} - ${p.stat}`, qty: "1" }));
      if (data.universalPerks.length) autoSel["Universal Perk"] = [...data.universalPerks].sort(() => Math.random() - 0.5).slice(0, Math.min(4, data.universalPerks.length)).map((p) => ({ label: `${p.partId} - ${p.stat}`, qty: "1" }));

      const stockBase = buildDecodedString(mfgId, level, seed, autoSel["Rarity"]?.[0]?.label ?? "", [], [], [], [], [], "", data);

      let grenadeVisualRecipes: GrenadeVisualRecipe[] = [];
      try { const res = await fetch("/data/grenade_visual_recipes.json"); if (res.ok) { const raw = await res.json(); if (Array.isArray(raw)) grenadeVisualRecipes = raw; } } catch {}

      const result = generateModdedGrenade({
        level,
        modPowerMode: modPower,
        stockBaseDecoded: stockBase,
        grenadeVisualRecipes,
        skinOptions: skins.length ? skins : undefined,
      });
      setCode(result.code.trim());
      setGrenadeStats(result.stats);
    } catch {
      setGrenadeStats(null);
    }
    setModGenerating(false);
  }, [data, mfgId, level, seed, modPower, skins]);

  const handleClear = useCallback(() => {
    setRarity(""); setSkinValue(""); legends.clear(); elements.clear(); fw.clear(); mfgPerks.clear(); uniPerks.clear(); setCode("");
  }, [legends, elements, fw, mfgPerks, uniPerks]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading grenade data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error: {error}</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOptions} value={mfgId != null ? String(mfgId) : ""} onChange={(v) => { setMfgId(Number(v)); setRarity(""); mfgPerks.clear(); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOptions} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <PartChecklist label="Element" options={elementOptions} selected={elements.parts} onToggle={elements.toggle} onQtyChange={elements.setQty} showInfo={showInfo} />
      <PartChecklist label="Firmware" options={firmwareOptions} selected={fw.parts} onToggle={fw.toggle} onQtyChange={fw.setQty} showInfo={showInfo} />
      <PartChecklist label="Legendary Perks" options={legendaryOptions} selected={legends.parts} onToggle={legends.toggle} onQtyChange={legends.setQty} showInfo={showInfo} />
      {mfgPerkOptions.length > 0 && <PartChecklist label="Manufacturer Perks" options={mfgPerkOptions} selected={mfgPerks.parts} onToggle={mfgPerks.toggle} onQtyChange={mfgPerks.setQty} showInfo={showInfo} />}
      <PartChecklist label="Universal Perks" options={universalPerkOptions} selected={uniPerks.parts} onToggle={uniPerks.toggle} onQtyChange={uniPerks.setQty} showInfo={showInfo} />
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />

      {/* Mod Power Mode */}
      <MobileSelect label="Mod Power" options={[
        { value: "stable", label: "Stable" },
        { value: "op", label: "OP" },
        { value: "insane", label: "Insane" },
      ]} value={modPower} onChange={(v) => setModPower(v as "stable" | "op" | "insane")} />

      <GenerateBar onGenerate={handleGenerate} onClear={handleClear} />

      {/* Generate Modded */}
      <button type="button" className="mobile-btn" onClick={handleGenerateModded} disabled={modGenerating} style={{ marginBottom: 14, background: "rgba(168,85,247,0.15)", borderColor: "#a855f7", color: "#a855f7" }}>
        {modGenerating ? "Generating…" : "Generate Modded Grenade"}
      </button>

      {/* Stats Estimate */}
      {grenadeStats && (
        <div className="mobile-card" style={{ fontSize: 12 }}>
          <div className="mobile-label">Stats Estimate</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
            <div>Damage: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.damageMultiplier.toFixed(1)}x</strong></div>
            <div>Radius: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.radiusMultiplier.toFixed(1)}x</strong></div>
            <div>Charges: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.charges}</strong></div>
            <div>Cooldown: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.cooldownMultiplier.toFixed(2)}x</strong></div>
            <div>Crit: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.critChance}%</strong></div>
            <div>Lifesteal: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.lifesteal}%</strong></div>
            <div>Status: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.statusChanceMultiplier.toFixed(1)}x</strong></div>
            <div>Style: <strong style={{ color: "var(--color-accent)" }}>{grenadeStats.style}</strong></div>
          </div>
        </div>
      )}

      <CodeOutput code={code} onClear={() => { setCode(""); setGrenadeStats(null); }} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
