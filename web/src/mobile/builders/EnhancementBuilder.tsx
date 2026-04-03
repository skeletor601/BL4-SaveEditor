import { useState, useMemo, useCallback } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { usePartList, NumberField, PartChecklist, CodeOutput, GenerateBar, applySkin } from "./shared";
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

export default function EnhancementBuilder() {
  const { data, loading, error } = useMobileBuilderData<EnhancementBuilderData>("accessories/enhancement/builder-data");
  const [mfgName, setMfgName] = useState("");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [code, setCode] = useState("");

  const mfgPerks = usePartList();
  const stats247 = usePartList();
  const fw247 = usePartList();

  const mfgNames = useMemo(() => Object.keys(data?.manufacturers ?? {}).sort(), [data]);
  if (data && !mfgName && mfgNames.length) setMfgName(mfgNames[0]);
  const mfg = data?.manufacturers[mfgName];

  const mfgOpts = useMemo<PickerOption[]>(() => mfgNames.map((n) => ({ value: n, label: data?.manufacturers[n]?.name ?? n })), [mfgNames, data]);
  const rarityOpts = useMemo<PickerOption[]>(() => {
    if (!mfg) return [];
    return Object.keys(mfg.rarities).map((r) => ({ value: r, label: r }));
  }, [mfg]);
  const perkOpts = useMemo<PickerOption[]>(() => {
    if (!mfg) return [];
    return mfg.perks.map((p) => ({ value: String(p.code), label: `[${p.code}] ${p.name}${p.description ? ` - ${p.description}` : ""}` }));
  }, [mfg]);
  const statOpts = useMemo<PickerOption[]>(() => (data?.secondary247 ?? []).map((s) => ({ value: String(s.code), label: `${s.code} - ${s.name}` })), [data]);
  const fwOpts = useMemo<PickerOption[]>(() => (data?.firmware247 ?? []).map((f) => ({ value: String(f.code), label: `${f.code} - ${f.name}` })), [data]);

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

    setCode(applySkin(`${header} ${p.join(" ")} |`, ""));
  }, [data, mfg, level, seed, rarity, mfgPerks.parts, stats247.parts, fw247.parts]);

  const clearAll = useCallback(() => {
    setRarity(""); mfgPerks.clear(); stats247.clear(); fw247.clear(); setCode("");
  }, [mfgPerks, stats247, fw247]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading enhancement data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={mfgName} onChange={(v) => { setMfgName(v); setRarity(""); mfgPerks.clear(); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <PartChecklist label="Manufacturer Perks" options={perkOpts} selected={mfgPerks.parts} onToggle={mfgPerks.toggle} onQtyChange={mfgPerks.setQty} />
      <PartChecklist label="Stat Perks (247)" options={statOpts} selected={stats247.parts} onToggle={stats247.toggle} onQtyChange={stats247.setQty} />
      <PartChecklist label="Firmware (247)" options={fwOpts} selected={fw247.parts} onToggle={fw247.toggle} onQtyChange={fw247.setQty} />
      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <CodeOutput code={code} onClear={() => setCode("")} />
    </div>
  );
}
