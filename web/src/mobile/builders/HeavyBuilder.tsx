import { useState, useMemo, useCallback } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { usePartList, NumberField, PartChecklist, CodeOutput, GenerateBar, applySkin } from "./shared";
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

export default function HeavyBuilder() {
  const { data, loading, error } = useMobileBuilderData<HeavyBuilderData>("accessories/heavy/builder-data");
  const [mfgId, setMfgId] = useState<number | null>(null);
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [barrel, setBarrel] = useState("");
  const [element, setElement] = useState("");
  const [firmware, setFirmware] = useState("");
  const [code, setCode] = useState("");

  const barrelAcc = usePartList();
  const bodyAcc = usePartList();

  if (data && mfgId == null && data.mfgs.length) setMfgId(data.mfgs[0].id);

  const mfgOpts = useMemo<PickerOption[]>(() => data?.mfgs.map((m) => ({ value: String(m.id), label: m.name })) ?? [], [data]);
  const rarityOpts = useMemo<PickerOption[]>(() => (data && mfgId != null ? (data.raritiesByMfg[mfgId] ?? []) : []).map((r) => ({ value: r.label, label: r.label })), [data, mfgId]);
  const barrelOpts = useMemo<PickerOption[]>(() => [{ value: "", label: "-- None --" }, ...(data?.barrel ?? []).map((b) => ({ value: String(b.partId), label: `${b.partId} - ${b.stat}` }))], [data]);
  const elemOpts = useMemo<PickerOption[]>(() => [{ value: "", label: "-- None --" }, ...(data?.element ?? []).map((e) => ({ value: String(e.partId), label: `${e.partId} - ${e.stat}` }))], [data]);
  const fwOpts = useMemo<PickerOption[]>(() => [{ value: "", label: "-- None --" }, ...(data?.firmware ?? []).map((f) => ({ value: String(f.partId), label: `${f.partId} - ${f.stat}` }))], [data]);
  const baOpts = useMemo<PickerOption[]>(() => (data?.barrelAccPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), [data]);
  const boOpts = useMemo<PickerOption[]>(() => (data?.bodyAccPerks ?? []).map((p) => ({ value: String(p.partId), label: `${p.partId} - ${p.stat}` })), [data]);

  const generate = useCallback(() => {
    if (!data || mfgId == null) return;
    const header = `${mfgId}, 0, 1, ${level}| 2, ${244}||`;
    const p: string[] = [];

    const r = (data.raritiesByMfg[mfgId] ?? []).find((x) => x.label === rarity);
    if (r) p.push(`{${r.id}}`);

    const bodyId = data.bodiesByMfg[mfgId];
    if (bodyId != null) p.push(`{${bodyId}}`);

    if (barrel) p.push(`{${barrel}}`);
    if (element) p.push(`{1:${element}}`);
    if (firmware) p.push(`{244:${firmware}}`);

    for (const a of barrelAcc.parts) { for (let i = 0; i < a.qty; i++) p.push(`{${a.id}}`); }
    for (const a of bodyAcc.parts) { for (let i = 0; i < a.qty; i++) p.push(`{${a.id}}`); }

    setCode(applySkin(`${header} ${p.join(" ")} |`, ""));
  }, [data, mfgId, level, seed, rarity, barrel, element, firmware, barrelAcc.parts, bodyAcc.parts]);

  const clearAll = useCallback(() => {
    setRarity(""); setBarrel(""); setElement(""); setFirmware(""); barrelAcc.clear(); bodyAcc.clear(); setCode("");
  }, [barrelAcc, bodyAcc]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading heavy data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={mfgId != null ? String(mfgId) : ""} onChange={(v) => { setMfgId(Number(v)); setRarity(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />
      <MobileSelect label="Barrel" options={barrelOpts} value={barrel} onChange={setBarrel} />
      <MobileSelect label="Element" options={elemOpts} value={element} onChange={setElement} />
      <MobileSelect label="Firmware" options={fwOpts} value={firmware} onChange={setFirmware} />
      <PartChecklist label="Barrel Accessories" options={baOpts} selected={barrelAcc.parts} onToggle={barrelAcc.toggle} onQtyChange={barrelAcc.setQty} />
      <PartChecklist label="Body Accessories" options={boOpts} selected={bodyAcc.parts} onToggle={bodyAcc.toggle} onQtyChange={bodyAcc.setQty} />
      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <CodeOutput code={code} onClear={() => setCode("")} />
    </div>
  );
}
