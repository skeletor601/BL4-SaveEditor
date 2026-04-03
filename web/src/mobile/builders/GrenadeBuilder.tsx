import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  type SelectedPart, usePartList, NumberField, PartChecklist, CodeOutput,
  DecodeBox, GenerateBar, BuilderToggles, SkinSelector, partIdFromLabel, applySkin
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
      <GenerateBar onGenerate={handleGenerate} onClear={handleClear} />
      <CodeOutput code={code} onClear={() => setCode("")} />
      <DecodeBox />
    </div>
  );
}
