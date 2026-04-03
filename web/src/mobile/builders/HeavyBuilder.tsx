import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  BuildPartsList, BuilderToggles, SkinSelector, AddFromDatabase, ExtraTokensList, extraTokensToString, useExtraTokens, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface HeavyBuilderPart { partId: number; stat: string; description?: string; mfgId?: number; }
interface HeavyBuilderRarity { id: number; label: string; }
interface HeavyBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, HeavyBuilderRarity[]>;
  barrel: HeavyBuilderPart[];
  element: HeavyBuilderPart[];
  firmware: HeavyBuilderPart[];
  barrelAccPerks: HeavyBuilderPart[];
  bodyAccPerks: HeavyBuilderPart[];
  bodiesByMfg: Record<number, number | null>;
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

export default function HeavyBuilder() {
  const { data, loading, error } = useMobileBuilderData<HeavyBuilderData>("accessories/heavy/builder-data");
  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [barrel, setBarrel] = useState("");
  const [element, setElement] = useState("");
  const fwParts = usePartList();
  const [skinValue, setSkinValue] = useState("");
  const [code, setCode] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [skins, setSkins] = useState<{ label: string; value: string }[]>([]);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  const barrelAcc = usePartList();
  const bodyAcc = usePartList();
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
      if (!up.code || (up.category || "").toLowerCase() !== "heavy") continue;
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
  const barrelOpts = useMemo<PickerOption[]>(() => {
    const barrels = (data?.barrel ?? []).filter((b) => !b.mfgId || b.mfgId === mfgId || allParts);
    return [{ value: "", label: "-- None --" }, ...barrels.map((b) => {
      const desc = b.description && b.description !== b.stat ? `, ${b.description}` : "";
      const mfgLabel = allParts && b.mfgId && b.mfgId !== mfgId ? " (other mfg)" : "";
      return { value: String(b.partId), label: `${b.partId} - ${b.stat}${desc}${mfgLabel}` };
    })];
  }, [data, mfgId, allParts]);
  const elemOpts = useMemo<PickerOption[]>(() => [{ value: "", label: "-- None --" }, ...(data?.element ?? []).map((e) => {
    const desc = e.description && e.description !== e.stat ? `, ${e.description}` : "";
    return { value: String(e.partId), label: `${e.partId} - ${e.stat}${desc}` };
  })], [data]);
  const fwOpts = useMemo(() => expandOpts(
    (data?.firmware ?? []).map((f) => {
      const desc = f.description && f.description !== f.stat ? `, ${f.description}` : "";
      return { value: String(f.partId), label: `${f.partId} - ${f.stat}${desc}` };
    }), "Firmware"), [data, expandOpts]);
  const baOpts = useMemo(() => expandOpts(
    (data?.barrelAccPerks ?? []).map((p) => {
      const desc = p.description && p.description !== p.stat ? `, ${p.description}` : "";
      return { value: String(p.partId), label: `${p.partId} - ${p.stat}${desc}` };
    }), "Barrel Accessory"), [data, expandOpts]);
  const boOpts = useMemo(() => expandOpts(
    (data?.bodyAccPerks ?? []).map((p) => {
      const desc = p.description && p.description !== p.stat ? `, ${p.description}` : "";
      return { value: String(p.partId), label: `${p.partId} - ${p.stat}${desc}` };
    }), "Body Accessory"), [data, expandOpts]);

  useEffect(() => {
    if (!data || mfgId == null) return;
    if (!rarity && !barrel && !element && fwParts.parts.length === 0 && barrelAcc.parts.length === 0 && bodyAcc.parts.length === 0) { setCode(""); return; }
    const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    const r = (data.raritiesByMfg[mfgId] ?? []).find((x) => x.label === rarity);
    if (r) p.push(`{${r.id}}`);

    const bodyId = data.bodiesByMfg[mfgId];
    if (bodyId != null) p.push(`{${bodyId}}`);

    if (barrel) p.push(`{${barrel}}`);
    if (element) p.push(`{1:${element}}`);
    for (const f of fwParts.parts) { const n = parseInt(f.id, 10); if (Number.isFinite(n)) for (let i = 0; i < f.qty; i++) p.push(`{244:${n}}`); }

    for (const a of barrelAcc.parts) { for (let i = 0; i < a.qty; i++) p.push(`{${a.id}}`); }
    for (const a of bodyAcc.parts) { for (let i = 0; i < a.qty; i++) p.push(`{${a.id}}`); }

    let decoded = applySkin(`${header} ${p.join(" ")} |`, skinValue);
    const extra = extraTokensToString(extras.tokens);
    if (extra) decoded = decoded.replace(/\s*\|\s*$/, ` ${extra} |`);
    setCode(decoded);
  }, [data, mfgId, level, seed, rarity, barrel, element, fwParts.parts, barrelAcc.parts, bodyAcc.parts, skinValue, extras.tokens]);

  const clearAll = useCallback(() => {
    setRarity(""); setBarrel(""); setElement(""); fwParts.clear(); setSkinValue(""); barrelAcc.clear(); bodyAcc.clear(); extras.clear(); setCode("");
  }, [fwParts, barrelAcc, bodyAcc, extras]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading heavy data…</div>;
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
      <MobileSelect label="Barrel" options={barrelOpts} value={barrel} onChange={setBarrel} />
      <MobileSelect label="Element" options={elemOpts} value={element} onChange={setElement} />
      <PartChecklist label="Firmware" options={fwOpts} selected={fwParts.parts} onToggle={fwParts.toggle} onQtyChange={fwParts.setQty} showInfo={showInfo} />
      <PartChecklist label="Barrel Accessories" options={baOpts} selected={barrelAcc.parts} onToggle={barrelAcc.toggle} onQtyChange={barrelAcc.setQty} showInfo={showInfo} />
      <PartChecklist label="Body Accessories" options={boOpts} selected={bodyAcc.parts} onToggle={bodyAcc.toggle} onQtyChange={bodyAcc.setQty} showInfo={showInfo} />
      <SkinSelector skins={skins} value={skinValue} onChange={setSkinValue} />

      <AddFromDatabase universalParts={universalParts} onAdd={extras.add} />
      <ExtraTokensList tokens={extras.tokens} onRemove={extras.remove} />

      <button type="button" className="mobile-btn danger" onClick={clearAll} style={{ marginBottom: 14 }}>Clear All</button>
      <CodeOutput code={code} onClear={() => setCode("")} />
      <BuildPartsList code={code} universalParts={universalParts} />
    </div>
  );
}
