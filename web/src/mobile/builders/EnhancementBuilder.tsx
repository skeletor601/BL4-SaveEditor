import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, BuilderToggles, SkinSelector, AddFromDatabase, ExtraTokensList, extraTokensToString, useExtraTokens, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: { code: number; name: string; description?: string; index?: number }[];
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

const ENHANCEMENT_PERK_ORDER = [1, 2, 3, 9];

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
  const stackedPerks = usePartList();
  const stats247 = usePartList();
  const fw247 = usePartList();
  const extras = useExtraTokens();

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
    mfg ? mfg.perks
      .filter((p) => ENHANCEMENT_PERK_ORDER.includes(p.code) || ENHANCEMENT_PERK_ORDER.includes(p.index ?? -1))
      .map((p) => ({ value: String(p.code), label: p.description ? `[${p.code}] ${p.description}, ${p.name}` : `[${p.code}] ${p.name}` })) : [],
    "Perk"), [mfg, expandOpts]);

  // Cross-manufacturer stacked perks (legendary perks from OTHER mfgs)
  const stackedOpts = useMemo<PickerOption[]>(() => {
    if (!data || !mfgName) return [];
    const opts: PickerOption[] = [];
    for (const [name, om] of Object.entries(data.manufacturers)) {
      if (name === mfgName) continue; // Skip current manufacturer
      for (const p of om.perks || []) {
        const idx = p.index ?? p.code;
        if (!ENHANCEMENT_PERK_ORDER.includes(idx)) continue;
        const displayName = p.description || p.name;
        const effectText = p.description ? `, ${p.name}` : "";
        opts.push({
          value: `${om.code}:${idx}`,
          label: `${om.code}:${idx} - ${displayName} — ${name}${effectText}`,
        });
      }
    }
    return opts;
  }, [data, mfgName]);

  const statOpts = useMemo(() => expandOpts(
    (data?.secondary247 ?? []).map((s) => {
      const desc = s.description ? `, ${s.description}` : "";
      return { value: String(s.code), label: `${s.code} - ${s.name}${desc}` };
    }), "Stat"), [data, expandOpts]);
  const fwOpts = useMemo(() => expandOpts(
    (data?.firmware247 ?? []).map((f) => {
      const desc = f.description ? `, ${f.description}` : "";
      return { value: String(f.code), label: `${f.code} - ${f.name}${desc}` };
    }), "Firmware"), [data, expandOpts]);

  useEffect(() => {
    if (!data || !mfg) return;
    if (!rarity && mfgPerks.parts.length === 0 && stackedPerks.parts.length === 0 && stats247.parts.length === 0 && fw247.parts.length === 0) { setCode(""); return; }
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

    // Stacked perks (cross-manufacturer) — grouped by mfg code
    const stackedByMfg: Record<number, number[]> = {};
    for (const sp of stackedPerks.parts) {
      const [mfgCodeStr, idxStr] = sp.id.split(":", 2);
      const mfgCode = parseInt(mfgCodeStr ?? "", 10);
      const idx = parseInt(idxStr ?? "", 10);
      if (!Number.isFinite(mfgCode) || !Number.isFinite(idx)) continue;
      if (!stackedByMfg[mfgCode]) stackedByMfg[mfgCode] = [];
      for (let i = 0; i < sp.qty; i++) stackedByMfg[mfgCode].push(idx);
    }
    for (const [codeStr, indices] of Object.entries(stackedByMfg)) {
      const sorted = [...indices].sort((a, b) => a - b);
      if (sorted.length === 1) p.push(`{${codeStr}:${sorted[0]}}`);
      else p.push(`{${codeStr}:[${sorted.join(" ")}]}`);
    }

    // Stats + firmware under 247
    const s: number[] = [];
    for (const st of stats247.parts) { const c = parseInt(st.id, 10); if (Number.isFinite(c)) for (let i = 0; i < st.qty; i++) s.push(c); }
    for (const f of fw247.parts) { const c = parseInt(f.id, 10); if (Number.isFinite(c)) for (let i = 0; i < f.qty; i++) s.push(c); }
    if (s.length > 0) p.push(`{247:[${s.join(" ")}]}`);

    let decoded = applySkin(`${header} ${p.join(" ")} |`, skinValue);
    const extra = extraTokensToString(extras.tokens);
    if (extra) decoded = decoded.replace(/\s*\|\s*$/, ` ${extra} |`);
    setCode(decoded);
  }, [data, mfg, level, seed, rarity, mfgPerks.parts, stackedPerks.parts, stats247.parts, fw247.parts, skinValue, extras.tokens]);

  const clearAll = useCallback(() => {
    setRarity(""); setSkinValue(""); mfgPerks.clear(); stackedPerks.clear(); stats247.clear(); fw247.clear(); extras.clear(); setCode("");
  }, [mfgPerks, stackedPerks, stats247, fw247, extras]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading enhancement data...</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={mfgName} onChange={(v) => { setMfgName(v); setRarity(""); mfgPerks.clear(); stackedPerks.clear(); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity..." />
      <PartChecklist label="Manufacturer Perks" options={perkOpts} selected={mfgPerks.parts} onToggle={mfgPerks.toggle} onQtyChange={mfgPerks.setQty} showInfo={showInfo} />
      <PartChecklist label="Legendary Perks (Cross-Mfg)" options={stackedOpts} selected={stackedPerks.parts} onToggle={stackedPerks.toggle} onQtyChange={stackedPerks.setQty} showInfo={showInfo} />
      <PartChecklist label="Stat Perks (247)" options={statOpts} selected={stats247.parts} onToggle={stats247.toggle} onQtyChange={stats247.setQty} showInfo={showInfo} />
      <PartChecklist label="Firmware (247)" options={fwOpts} selected={fw247.parts} onToggle={fw247.toggle} onQtyChange={fw247.setQty} showInfo={showInfo} />
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />

      <AddFromDatabase universalParts={universalParts} onAdd={extras.add} />
      <ExtraTokensList tokens={extras.tokens} onRemove={extras.remove} />

      <button type="button" className="mobile-btn danger" onClick={clearAll} style={{ marginBottom: 14 }}>Clear All</button>
      <CodeOutput code={code} onClear={() => setCode("")} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
