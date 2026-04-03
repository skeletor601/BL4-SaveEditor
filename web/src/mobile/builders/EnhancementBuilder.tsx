import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, GenerateBar, BuilderToggles, SkinSelector, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: { code: number; name: string; description?: string }[];
  rarities: Record<string, number>;
}
interface EnhancementBuilderData {
  manufacturers: Record<string, EnhancementManufacturer>;
  rarityMap247: Record<string, number>;
  secondary247: { code: number; name: string; description?: string }[];
  firmware247: { code: number; name: string; description?: string }[];
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

export default function EnhancementBuilder() {
  const { data, loading, error } = useMobileBuilderData<EnhancementBuilderData>("accessories/enhancement/builder-data");
  const [mfgName, setMfgName] = useState("");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [skinValue, setSkinValue] = useState("");
  const [code, setCode] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [skins, setSkins] = useState<{ label: string; value: string }[]>([]);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  const mfgPerks = usePartList();
  const stats247 = usePartList();
  const fw247 = usePartList();

  const mfgNames = useMemo(() => Object.keys(data?.manufacturers ?? {}).sort(), [data]);
  if (data && !mfgName && mfgNames.length) setMfgName(mfgNames[0]);
  const mfg = data?.manufacturers[mfgName];

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
      if (!up.code || (up.category || "").toLowerCase() !== "enhancement") continue;
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

  const mfgOpts = useMemo<PickerOption[]>(() => mfgNames.map((n) => ({ value: n, label: data?.manufacturers[n]?.name ?? n })), [mfgNames, data]);
  const rarityOpts = useMemo<PickerOption[]>(() => {
    if (!mfg) return [];
    return Object.keys(mfg.rarities).map((r) => ({ value: r, label: r }));
  }, [mfg]);
  const perkOpts = useMemo(() => expandOpts(
    mfg ? mfg.perks.map((p) => ({ value: String(p.code), label: `[${p.code}] ${p.name}${p.description ? ` - ${p.description}` : ""}` })) : [],
    "Perk"), [mfg, expandOpts]);
  const statOpts = useMemo(() => expandOpts(
    (data?.secondary247 ?? []).map((s) => ({ value: String(s.code), label: `${s.code} - ${s.name}` })), "Stat"), [data, expandOpts]);
  const fwOpts = useMemo(() => expandOpts(
    (data?.firmware247 ?? []).map((f) => ({ value: String(f.code), label: `${f.code} - ${f.name}` })), "Firmware"), [data, expandOpts]);

  const generate = useCallback(() => {
    if (!data || !mfg) return;
    const header = `${mfg.code}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    const rarityCode = mfg.rarities[rarity];
    if (rarityCode != null) p.push(`{${rarityCode}}`);
    const r247 = data.rarityMap247[rarity];
    if (r247 != null) p.push(`{247:${r247}}`);

    // Mfg perks — use code directly
    for (const perk of mfgPerks.parts) {
      const c = parseInt(perk.id, 10);
      if (Number.isFinite(c)) p.push(`{${c}}`);
    }

    // Stats + firmware under 247
    const s: number[] = [];
    for (const st of stats247.parts) { const c = parseInt(st.id, 10); if (Number.isFinite(c)) for (let i = 0; i < st.qty; i++) s.push(c); }
    for (const f of fw247.parts) { const c = parseInt(f.id, 10); if (Number.isFinite(c)) for (let i = 0; i < f.qty; i++) s.push(c); }
    if (s.length > 0) p.push(`{247:[${s.join(" ")}]}`);

    setCode(applySkin(`${header} ${p.join(" ")} |`, skinValue));
  }, [data, mfg, level, seed, rarity, mfgPerks.parts, stats247.parts, fw247.parts, skinValue]);

  const clearAll = useCallback(() => {
    setRarity(""); setSkinValue(""); mfgPerks.clear(); stats247.clear(); fw247.clear(); setCode("");
  }, [mfgPerks, stats247, fw247]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading enhancement data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={mfgName} onChange={(v) => { setMfgName(v); setRarity(""); mfgPerks.clear(); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <PartChecklist label="Manufacturer Perks" options={perkOpts} selected={mfgPerks.parts} onToggle={mfgPerks.toggle} onQtyChange={mfgPerks.setQty} showInfo={showInfo} />
      <PartChecklist label="Stat Perks (247)" options={statOpts} selected={stats247.parts} onToggle={stats247.toggle} onQtyChange={stats247.setQty} showInfo={showInfo} />
      <PartChecklist label="Firmware (247)" options={fwOpts} selected={fw247.parts} onToggle={fw247.toggle} onQtyChange={fw247.setQty} showInfo={showInfo} />
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />
      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <CodeOutput code={code} onClear={() => setCode("")} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
