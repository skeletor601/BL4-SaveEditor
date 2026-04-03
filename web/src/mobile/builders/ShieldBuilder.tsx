import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import { generateModdedShield, type ShieldStatsEstimate } from "@/lib/generateModdedShield";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, GenerateBar, BuilderToggles, SkinSelector,
  buildLegendaryTokens, buildTypeToken, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface ShieldBuilderPart { partId: number; stat: string; description?: string; }
interface ShieldBuilderLegendaryPart extends ShieldBuilderPart { mfgId: number; mfgName: string; }
interface ShieldBuilderRarity { id: number; label: string; }
interface ShieldBuilderData {
  mfgs: { id: number; name: string }[];
  mfgTypeById: Record<number, string>;
  raritiesByMfg: Record<number, ShieldBuilderRarity[]>;
  element: ShieldBuilderPart[];
  firmware: ShieldBuilderPart[];
  universalPerks: ShieldBuilderPart[];
  energyPerks: ShieldBuilderPart[];
  armorPerks: ShieldBuilderPart[];
  legendaryPerks: ShieldBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

export default function ShieldBuilder() {
  const { data, loading, error } = useMobileBuilderData<ShieldBuilderData>("accessories/shield/builder-data");
  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [skinValue, setSkinValue] = useState("");
  const [code, setCode] = useState("");
  const [modPower, setModPower] = useState<"stable" | "op" | "insane">("stable");
  const [shieldStats, setShieldStats] = useState<ShieldStatsEstimate | null>(null);
  const [ammoRegen, setAmmoRegen] = useState(false);
  const [movementSpeed, setMovementSpeed] = useState(false);
  const [fireworks, setFireworks] = useState(false);
  const [immortality, setImmortality] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [skins, setSkins] = useState<{ label: string; value: string }[]>([]);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  const legends = usePartList();
  const elements = usePartList();
  const fw = usePartList();
  const uniPerks = usePartList();
  const energyPerks = usePartList();
  const armorPerks = usePartList();

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
      if (!up.code || (up.category || "").toLowerCase() !== "shield") continue;
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

  const mfgOptions = useMemo<PickerOption[]>(() => data?.mfgs.map((m) => ({ value: String(m.id), label: `${m.name} (${data.mfgTypeById[m.id] ?? "?"})` })) ?? [], [data]);
  const rarityOpts = useMemo<PickerOption[]>(() => (data && mfgId != null ? (data.raritiesByMfg[mfgId] ?? []) : []).map((r) => ({ value: r.label, label: r.label })), [data, mfgId]);
  const elemOpts = useMemo(() => expandOpts(
    (data?.element ?? []).map((e) => ({ value: String(e.partId), label: `${e.partId} - ${e.stat}` })), "Element"), [data, expandOpts]);
  const fwOpts = useMemo(() => expandOpts(
    (data?.firmware ?? []).map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.stat}` })), "Firmware"), [data, expandOpts]);
  const legOpts = useMemo<PickerOption[]>(() => (data?.legendaryPerks ?? []).map((l) => ({ value: `${l.mfgId}:${l.partId}`, label: `${l.mfgName}: ${l.stat}` })), [data]);
  const uniOpts = useMemo(() => expandOpts(
    (data?.universalPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), "Perk"), [data, expandOpts]);
  const enOpts = useMemo(() => expandOpts(
    (data?.energyPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), "Perk"), [data, expandOpts]);
  const arOpts = useMemo(() => expandOpts(
    (data?.armorPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), "Perk"), [data, expandOpts]);

  const shieldType = data && mfgId != null ? (data.mfgTypeById[mfgId] ?? "Energy") : "Energy";

  const generate = useCallback(() => {
    if (!data || mfgId == null) return;
    const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    const r = (data.raritiesByMfg[mfgId] ?? []).find((x) => x.label === rarity);
    if (r) p.push(`{${r.id}}`);

    if (legends.parts.length === 0) {
      const modelId = data.modelsByMfg[mfgId];
      if (modelId != null) p.push(`{${modelId}}`);
    } else {
      buildLegendaryTokens(legends.parts, mfgId, p);
    }

    const s246: number[] = [];
    const add = (id: string, qty: number) => { const n = parseInt(id, 10); if (Number.isFinite(n)) for (let i = 0; i < qty; i++) s246.push(n); };
    for (const e of elements.parts) add(e.id, e.qty);
    for (const f of fw.parts) add(f.id, f.qty);
    for (const u of uniPerks.parts) add(u.id, u.qty);
    const t246 = buildTypeToken(246, s246);
    if (t246) p.push(t246);

    const s248: number[] = [];
    for (const e of energyPerks.parts) { const n = parseInt(e.id, 10); if (Number.isFinite(n)) for (let i = 0; i < e.qty; i++) s248.push(n); }
    const t248 = buildTypeToken(248, s248);
    if (t248) p.push(t248);

    const s237: number[] = [];
    for (const a of armorPerks.parts) { const n = parseInt(a.id, 10); if (Number.isFinite(n)) for (let i = 0; i < a.qty; i++) s237.push(n); }
    const t237 = buildTypeToken(237, s237);
    if (t237) p.push(t237);

    setCode(applySkin(`${header} ${p.join(" ")} |`, skinValue));
  }, [data, mfgId, level, seed, rarity, legends.parts, elements.parts, fw.parts, uniPerks.parts, energyPerks.parts, armorPerks.parts, skinValue]);

  const handleGenerateModded = useCallback(() => {
    if (!data?.mfgs?.length) return;
    const result = generateModdedShield({ level, modPowerMode: modPower, ammoRegen, movementSpeed, fireworks, immortality });
    setCode(result.code.trim());
    setShieldStats(result.stats);
  }, [data, level, modPower, ammoRegen, movementSpeed, fireworks, immortality]);

  const clearAll = useCallback(() => {
    setRarity(""); setSkinValue(""); setShieldStats(null); legends.clear(); elements.clear(); fw.clear(); uniPerks.clear(); energyPerks.clear(); armorPerks.clear(); setCode("");
  }, [legends, elements, fw, uniPerks, energyPerks, armorPerks]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading shield data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOptions} value={mfgId != null ? String(mfgId) : ""} onChange={(v) => { setMfgId(Number(v)); setRarity(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <PartChecklist label="Element" options={elemOpts} selected={elements.parts} onToggle={elements.toggle} onQtyChange={elements.setQty} showInfo={showInfo} />
      <PartChecklist label="Firmware" options={fwOpts} selected={fw.parts} onToggle={fw.toggle} onQtyChange={fw.setQty} showInfo={showInfo} />
      <PartChecklist label="Legendary Perks" options={legOpts} selected={legends.parts} onToggle={legends.toggle} onQtyChange={legends.setQty} showInfo={showInfo} />
      <PartChecklist label="Universal Perks" options={uniOpts} selected={uniPerks.parts} onToggle={uniPerks.toggle} onQtyChange={uniPerks.setQty} showInfo={showInfo} />
      {shieldType === "Energy" && <PartChecklist label="Energy Perks" options={enOpts} selected={energyPerks.parts} onToggle={energyPerks.toggle} onQtyChange={energyPerks.setQty} showInfo={showInfo} />}
      {shieldType === "Armor" && <PartChecklist label="Armor Perks" options={arOpts} selected={armorPerks.parts} onToggle={armorPerks.toggle} onQtyChange={armorPerks.setQty} showInfo={showInfo} />}
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />

      {/* Mod Power + Glow Toggles */}
      <MobileSelect label="Mod Power" options={[
        { value: "stable", label: "Stable" }, { value: "op", label: "OP" }, { value: "insane", label: "Insane" },
      ]} value={modPower} onChange={(v) => setModPower(v as "stable" | "op" | "insane")} />

      <div className="mobile-card" style={{ padding: "10px 14px" }}>
        <div className="mobile-label" style={{ marginBottom: 8 }}>Shield Glow Effects</div>
        {([["Ammo Regen", ammoRegen, setAmmoRegen], ["Movement Speed", movementSpeed, setMovementSpeed], ["Fireworks", fireworks, setFireworks], ["Immortality", immortality, setImmortality]] as const).map(([label, val, setter]) => (
          <div key={label} className="mobile-check-row">
            <input type="checkbox" checked={val} onChange={() => setter(!val)} />
            <span className="part-name">{label}</span>
          </div>
        ))}
      </div>

      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <button type="button" className="mobile-btn" onClick={handleGenerateModded} style={{ marginBottom: 14, background: "rgba(168,85,247,0.15)", borderColor: "#a855f7", color: "#a855f7" }}>
        Generate Modded Shield
      </button>

      {shieldStats && (
        <div className="mobile-card" style={{ fontSize: 12 }}>
          <div className="mobile-label">Stats Estimate</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
            <div>Capacity: <strong style={{ color: "var(--color-accent)" }}>{shieldStats.capacityMultiplier.toFixed(1)}x</strong></div>
            <div>Recharge: <strong style={{ color: "var(--color-accent)" }}>{shieldStats.rechargeMultiplier.toFixed(1)}x</strong></div>
            <div>Type: <strong style={{ color: "var(--color-accent)" }}>{shieldStats.shieldType}</strong></div>
            <div>Style: <strong style={{ color: "var(--color-accent)" }}>{shieldStats.style}</strong></div>
          </div>
        </div>
      )}

      <CodeOutput code={code} onClear={() => { setCode(""); setShieldStats(null); }} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
