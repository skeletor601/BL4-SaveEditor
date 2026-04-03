import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import { generateModdedRepkit, type RepkitStatEstimate } from "@/lib/generateModdedRepkit";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, BuilderToggles, SkinSelector, AddFromDatabase, ExtraTokensList, extraTokensToString, useExtraTokens,
  buildLegendaryTokens, buildTypeToken, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface RepkitBuilderPart { partId: number; stat: string; description?: string; }
interface RepkitBuilderLegendaryPart extends RepkitBuilderPart { mfgId: number; mfgName: string; }
interface RepkitBuilderRarity { id: number; label: string; }
interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  prefix: RepkitBuilderPart[];
  firmware: RepkitBuilderPart[];
  resistance: RepkitBuilderPart[];
  universalPerks: RepkitBuilderPart[];
  legendaryPerks: RepkitBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

const REPKIT_TYPE_ID = 243;
const COMBUSTION_IDS = new Set([24, 50, 29, 44]);
const RADIATION_IDS = new Set([23, 47, 28, 43]);
const CORROSIVE_IDS = new Set([26, 51, 31, 46]);
const SHOCK_IDS = new Set([22, 49, 27, 42]);
const CRYO_IDS = new Set([25, 48, 30, 45]);
const MODEL_PLUS: Record<string, number> = { combustion: 98, radiation: 99, corrosive: 100, shock: 101, cryo: 102 };

export default function RepkitBuilder() {
  const { data, loading, error } = useMobileBuilderData<RepkitBuilderData>("accessories/repkit/builder-data");
  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const prefixParts = usePartList();
  const fwParts = usePartList();
  const [skinValue, setSkinValue] = useState("");
  const [code, setCode] = useState("");
  const [modPower, setModPower] = useState<"stable" | "op" | "insane">("stable");
  const [repkitStats, setRepkitStats] = useState<RepkitStatEstimate | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [skins, setSkins] = useState<{ label: string; value: string }[]>([]);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  const legends = usePartList();
  const resistance = usePartList();
  const uniPerks = usePartList();
  const extras = useExtraTokens();

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
      if (!up.code || (up.category || "").toLowerCase() !== "repkit") continue;
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

  const mfgOpts = useMemo<PickerOption[]>(() => data?.mfgs.map((m) => ({ value: String(m.id), label: m.name })) ?? [], [data]);
  const rarityOpts = useMemo<PickerOption[]>(() => (data && mfgId != null ? (data.raritiesByMfg[mfgId] ?? []) : []).map((r) => ({ value: r.label, label: r.label })), [data, mfgId]);
  const prefixOpts = useMemo(() => expandOpts(
    (data?.prefix ?? []).map((p) => {
      const desc = p.description && p.description !== p.stat ? `, ${p.description}` : "";
      return { value: String(p.partId), label: `${p.partId} - ${p.stat}${desc}` };
    }), "Prefix"), [data, expandOpts]);
  const fwOpts = useMemo(() => expandOpts(
    (data?.firmware ?? []).map((f) => {
      const desc = f.description && f.description !== f.stat ? `, ${f.description}` : "";
      return { value: String(f.partId), label: `${f.partId} - ${f.stat}${desc}` };
    }), "Firmware"), [data, expandOpts]);
  const resOpts = useMemo(() => expandOpts(
    (data?.resistance ?? []).map((r) => {
      const desc = r.description && r.description !== r.stat ? `, ${r.description}` : "";
      return { value: String(r.partId), label: `${r.partId} - ${r.stat}${desc}` };
    }), "Resistance"), [data, expandOpts]);
  const legOpts = useMemo<PickerOption[]>(() => (data?.legendaryPerks ?? []).map((l) => ({ value: `${l.mfgId}:${l.partId}`, label: `${l.mfgName}: ${l.stat}` })), [data]);
  const uniOpts = useMemo(() => expandOpts(
    (data?.universalPerks ?? []).map((p) => {
      const desc = p.description && p.description !== p.stat ? `, ${p.description}` : "";
      return { value: String(p.partId), label: `${p.partId} - ${p.stat}${desc}` };
    }), "Perk"), [data, expandOpts]);

  useEffect(() => {
    if (!data || mfgId == null) return;
    if (!rarity && prefixParts.parts.length === 0 && fwParts.parts.length === 0 && legends.parts.length === 0 && resistance.parts.length === 0 && uniPerks.parts.length === 0) { setCode(""); return; }
    const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    const r = (data.raritiesByMfg[mfgId] ?? []).find((x) => x.label === rarity);
    if (r) p.push(`{${r.id}}`);

    const modelId = data.modelsByMfg[mfgId];
    if (modelId != null) p.push(`{${modelId}}`);

    buildLegendaryTokens(legends.parts, mfgId, p);

    const s243: number[] = [];
    for (const px of prefixParts.parts) { const n = parseInt(px.id, 10); if (Number.isFinite(n)) for (let i = 0; i < px.qty; i++) s243.push(n); }
    for (const fw of fwParts.parts) { const n = parseInt(fw.id, 10); if (Number.isFinite(n)) for (let i = 0; i < fw.qty; i++) s243.push(n); }

    let hasComb = false, hasRad = false, hasCor = false, hasShk = false, hasCry = false;
    for (const res of resistance.parts) {
      const pid = parseInt(res.id, 10);
      if (!Number.isFinite(pid)) continue;
      for (let i = 0; i < res.qty; i++) s243.push(pid);
      if (COMBUSTION_IDS.has(pid)) hasComb = true;
      if (RADIATION_IDS.has(pid)) hasRad = true;
      if (CORROSIVE_IDS.has(pid)) hasCor = true;
      if (SHOCK_IDS.has(pid)) hasShk = true;
      if (CRYO_IDS.has(pid)) hasCry = true;
    }
    if (hasComb) s243.push(MODEL_PLUS.combustion);
    if (hasRad) s243.push(MODEL_PLUS.radiation);
    if (hasCor) s243.push(MODEL_PLUS.corrosive);
    if (hasShk) s243.push(MODEL_PLUS.shock);
    if (hasCry) s243.push(MODEL_PLUS.cryo);

    for (const u of uniPerks.parts) { const n = parseInt(u.id, 10); if (Number.isFinite(n)) for (let i = 0; i < u.qty; i++) s243.push(n); }

    const t = buildTypeToken(REPKIT_TYPE_ID, s243);
    if (t) p.push(t);

    let decoded = applySkin(`${header} ${p.join(" ")} |`, skinValue);
    const extra = extraTokensToString(extras.tokens);
    if (extra) decoded = decoded.replace(/\s*\|\s*$/, ` ${extra} |`);
    setCode(decoded);
  }, [data, mfgId, level, seed, rarity, prefixParts.parts, fwParts.parts, legends.parts, resistance.parts, uniPerks.parts, skinValue, extras.tokens]);

  const handleGenerateModded = useCallback(() => {
    if (!data?.mfgs?.length) return;
    const result = generateModdedRepkit(data as Parameters<typeof generateModdedRepkit>[0], {
      level, modPowerMode: modPower, forcedMfgId: mfgId ?? undefined,
    });
    setCode(result.code.trim());
    setRepkitStats(result.stats);
  }, [data, level, modPower, mfgId]);

  const clearAll = useCallback(() => {
    setRarity(""); prefixParts.clear(); fwParts.clear(); setSkinValue(""); setRepkitStats(null); legends.clear(); resistance.clear(); uniPerks.clear(); extras.clear(); setCode("");
  }, [prefixParts, fwParts, legends, resistance, uniPerks, extras]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading repkit data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={mfgId != null ? String(mfgId) : ""} onChange={(v) => { setMfgId(Number(v)); setRarity(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <PartChecklist label="Prefix" options={prefixOpts} selected={prefixParts.parts} onToggle={prefixParts.toggle} onQtyChange={prefixParts.setQty} showInfo={showInfo} />
      <PartChecklist label="Firmware" options={fwOpts} selected={fwParts.parts} onToggle={fwParts.toggle} onQtyChange={fwParts.setQty} showInfo={showInfo} />
      <PartChecklist label="Resistance" options={resOpts} selected={resistance.parts} onToggle={resistance.toggle} onQtyChange={resistance.setQty} showInfo={showInfo} />
      <PartChecklist label="Legendary Perks" options={legOpts} selected={legends.parts} onToggle={legends.toggle} onQtyChange={legends.setQty} showInfo={showInfo} />
      <PartChecklist label="Universal Perks" options={uniOpts} selected={uniPerks.parts} onToggle={uniPerks.toggle} onQtyChange={uniPerks.setQty} showInfo={showInfo} />
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />

      <AddFromDatabase universalParts={universalParts} onAdd={extras.add} />
      <ExtraTokensList tokens={extras.tokens} onRemove={extras.remove} />

      <MobileSelect label="Mod Power" options={[
        { value: "stable", label: "Stable" }, { value: "op", label: "OP" }, { value: "insane", label: "Insane" },
      ]} value={modPower} onChange={(v) => setModPower(v as "stable" | "op" | "insane")} />
      <button type="button" className="mobile-btn danger" onClick={clearAll} style={{ marginBottom: 14 }}>Clear All</button>
      <button type="button" className="mobile-btn" onClick={handleGenerateModded} style={{ marginBottom: 14, background: "rgba(168,85,247,0.15)", borderColor: "#a855f7", color: "#a855f7" }}>
        Generate Modded RepKit
      </button>
      {repkitStats && (
        <div className="mobile-card" style={{ fontSize: 12 }}>
          <div className="mobile-label">Stats Estimate</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
            <div>Archetype: <strong style={{ color: "var(--color-accent)" }}>{repkitStats.archetypeName}</strong></div>
            <div>Legendary: <strong style={{ color: "var(--color-accent)" }}>{repkitStats.legendaryName}</strong></div>
            <div>Mfg: <strong style={{ color: "var(--color-accent)" }}>{repkitStats.mfgName}</strong></div>
            <div>Prefix: <strong style={{ color: "var(--color-accent)" }}>{repkitStats.prefixName}</strong></div>
          </div>
          {repkitStats.archetypeDesc && <p style={{ marginTop: 6, color: "var(--color-text-muted)", fontSize: 11 }}>{repkitStats.archetypeDesc}</p>}
        </div>
      )}
      <CodeOutput code={code} onClear={() => { setCode(""); setRepkitStats(null); }} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
