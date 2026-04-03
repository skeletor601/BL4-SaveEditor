import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import {
  usePartList, NumberField, PartChecklist, CodeOutput,
  DecodeBox, GenerateBar, BuilderToggles, SkinSelector, partIdFromLabel, applySkin
} from "./shared";
import type { PickerOption } from "../components/MobilePicker";

interface MfgTypeIdEntry { manufacturer: string; weaponType: string; mfgWtId: string; }
interface WeaponGenData {
  manufacturers: string[];
  weaponTypes: string[];
  mfgWtIdList: MfgTypeIdEntry[];
  partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>>;
  rarityByMfgTypeId: Record<string, { partId: string; stat: string; description?: string }[]>;
  legendaryByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]>;
  pearlByMfgTypeId: Record<string, { partId: string; description: string; effect?: string }[]>;
  elemental: { partId: string; stat: string }[];
  skins: { label: string; value: string }[];
}

interface UniversalPartRow {
  code: string; label: string; effect?: string; partType?: string;
  category?: string; manufacturer?: string;
}

const PART_TYPES = [
  "Body", "Body Accessory", "Barrel", "Barrel Accessory", "Magazine",
  "Stat Modifier", "Grip", "Foregrip", "Manufacturer Part",
  "Scope", "Scope Accessory", "Underbarrel", "Underbarrel Accessory",
];

export default function WeaponBuilder() {
  const { data, loading, error } = useMobileBuilderData<WeaponGenData>("weapon-gen/data");
  const [manufacturer, setManufacturer] = useState("");
  const [weaponType, setWeaponType] = useState("");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [rarity, setRarity] = useState("");
  const [skin, setSkin] = useState("");
  const [code, setCode] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);

  // Part lists for each category
  const legendary = usePartList();
  const pearl = usePartList();
  const element1 = usePartList();
  const element2 = usePartList();
  const partLists: Record<string, ReturnType<typeof usePartList>> = {};
  // We need individual hooks per part type — can't call hooks in a loop
  const body = usePartList(); partLists["Body"] = body;
  const bodyAcc = usePartList(); partLists["Body Accessory"] = bodyAcc;
  const barrel = usePartList(); partLists["Barrel"] = barrel;
  const barrelAcc = usePartList(); partLists["Barrel Accessory"] = barrelAcc;
  const mag = usePartList(); partLists["Magazine"] = mag;
  const statMod = usePartList(); partLists["Stat Modifier"] = statMod;
  const grip = usePartList(); partLists["Grip"] = grip;
  const foregrip = usePartList(); partLists["Foregrip"] = foregrip;
  const mfgPart = usePartList(); partLists["Manufacturer Part"] = mfgPart;
  const scope = usePartList(); partLists["Scope"] = scope;
  const scopeAcc = usePartList(); partLists["Scope Accessory"] = scopeAcc;
  const underbarrel = usePartList(); partLists["Underbarrel"] = underbarrel;
  const underbarrelAcc = usePartList(); partLists["Underbarrel Accessory"] = underbarrelAcc;

  // Load universal parts for "All Parts" mode
  useEffect(() => {
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
      if (!up.code || (up.category || "").toLowerCase() !== "weapon") continue;
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

  // Derived
  const mfgWtId = useMemo(() => {
    if (!data) return "";
    const entry = data.mfgWtIdList.find((e) => e.manufacturer === manufacturer && e.weaponType === weaponType);
    return entry?.mfgWtId ?? "";
  }, [data, manufacturer, weaponType]);

  const mfgOpts = useMemo<PickerOption[]>(() => (data?.manufacturers ?? []).map((m) => ({ value: m, label: m })), [data]);

  const weaponTypeOpts = useMemo<PickerOption[]>(() => {
    if (!data || !manufacturer) return [];
    const types = [...new Set(data.mfgWtIdList.filter((e) => e.manufacturer === manufacturer).map((e) => e.weaponType))].sort();
    return types.map((t) => ({ value: t, label: t }));
  }, [data, manufacturer]);

  const rarityOpts = useMemo<PickerOption[]>(() => {
    if (!data || !mfgWtId) return [];
    const opts: PickerOption[] = (data.rarityByMfgTypeId[mfgWtId] ?? []).map((r) => ({ value: r.stat, label: r.stat }));
    if ((data.legendaryByMfgTypeId[mfgWtId] ?? []).length > 0) opts.push({ value: "Legendary", label: "Legendary" });
    if ((data.pearlByMfgTypeId[mfgWtId] ?? []).length > 0) opts.push({ value: "Pearl", label: "Pearl" });
    return opts;
  }, [data, mfgWtId]);

  const legendaryOpts = useMemo<PickerOption[]>(() => {
    if (!data || !mfgWtId) return [];
    return (data.legendaryByMfgTypeId[mfgWtId] ?? []).map((l) => ({ value: l.partId, label: `${l.partId} - ${l.description}` }));
  }, [data, mfgWtId]);

  const pearlOpts = useMemo<PickerOption[]>(() => {
    if (!data || !mfgWtId) return [];
    return (data.pearlByMfgTypeId[mfgWtId] ?? []).map((p) => ({ value: p.partId, label: `${p.partId} - ${p.description}` }));
  }, [data, mfgWtId]);

  const elemOpts = useMemo(() => expandOpts(
    (data?.elemental ?? []).map((e) => ({ value: e.partId, label: `${e.partId} - ${e.stat}` })), "Element"), [data, expandOpts]);

  const getPartOpts = useCallback((partType: string): PickerOption[] => {
    if (!data || !mfgWtId) return [];
    return expandOpts(
      (data.partsByMfgTypeId[mfgWtId]?.[partType] ?? []).map((p) => ({ value: p.partId, label: p.label })),
      partType
    );
  }, [data, mfgWtId, expandOpts]);

  // Auto-init
  if (data && !manufacturer && data.manufacturers.length) {
    setManufacturer(data.manufacturers[0]);
    const firstEntry = data.mfgWtIdList.find((e) => e.manufacturer === data.manufacturers[0]);
    if (firstEntry) setWeaponType(firstEntry.weaponType);
  }

  const generate = useCallback(() => {
    if (!data || !mfgWtId) return;
    const header = `${mfgWtId}, 0, 1, ${level}| 2, ${seed}||`;
    const p: string[] = [];

    // Rarity
    if (rarity === "Legendary") {
      for (const l of legendary.parts) {
        const pid = l.id;
        for (let i = 0; i < l.qty; i++) p.push(`{${pid}}`);
      }
    } else if (rarity === "Pearl") {
      for (const pl of pearl.parts) {
        const pid = pl.id;
        for (let i = 0; i < pl.qty; i++) p.push(`{${pid}}`);
      }
    } else {
      const entry = (data.rarityByMfgTypeId[mfgWtId] ?? []).find((r) => r.stat === rarity);
      if (entry) p.push(`{${entry.partId}}`);
    }

    // Elements
    for (const e of element1.parts) { const pid = e.id; for (let i = 0; i < e.qty; i++) p.push(`{1:${pid}}`); }
    for (const e of element2.parts) { const pid = e.id; for (let i = 0; i < e.qty; i++) p.push(`{1:${pid}}`); }

    // All part types
    for (const pt of PART_TYPES) {
      const list = partLists[pt];
      if (!list) continue;
      for (const part of list.parts) {
        const pid = partIdFromLabel(part.id) ?? part.id;
        for (let i = 0; i < part.qty; i++) p.push(`{${pid}}`);
      }
    }

    setCode(applySkin(`${header} ${p.join(" ")} |`, skin));
  }, [data, mfgWtId, level, seed, rarity, legendary.parts, pearl.parts, element1.parts, element2.parts, skin,
      body.parts, bodyAcc.parts, barrel.parts, barrelAcc.parts, mag.parts, statMod.parts,
      grip.parts, foregrip.parts, mfgPart.parts, scope.parts, scopeAcc.parts, underbarrel.parts, underbarrelAcc.parts]);

  const clearAll = useCallback(() => {
    setRarity(""); setSkin(""); legendary.clear(); pearl.clear(); element1.clear(); element2.clear();
    Object.values(partLists).forEach((l) => l.clear());
    setCode("");
  }, [legendary, pearl, element1, element2, body, bodyAcc, barrel, barrelAcc, mag, statMod, grip, foregrip, mfgPart, scope, scopeAcc, underbarrel, underbarrelAcc]);

  if (loading) return <div className="mobile-card" style={{ textAlign: "center", padding: 32 }}>Loading weapon data…</div>;
  if (error || !data) return <div className="mobile-card" style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>Error loading data</div>;

  return (
    <div>
      <BuilderToggles showInfo={showInfo} setShowInfo={setShowInfo} allParts={allParts} setAllParts={setAllParts} />
      <MobileSelect label="Manufacturer" required options={mfgOpts} value={manufacturer} onChange={(v) => {
        setManufacturer(v);
        const firstType = data.mfgWtIdList.find((e) => e.manufacturer === v);
        setWeaponType(firstType?.weaponType ?? "");
        setRarity("");
      }} />
      <MobileSelect label="Weapon Type" required options={weaponTypeOpts} value={weaponType} onChange={(v) => { setWeaponType(v); setRarity(""); }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <NumberField label="Level" value={level} onChange={setLevel} min={1} max={100} />
        <NumberField label="Seed" value={seed} onChange={setSeed} min={1} max={4096} />
      </div>
      <MobileSelect label="Rarity" required options={rarityOpts} value={rarity} onChange={setRarity} placeholder="Select rarity…" />

      {rarity === "Legendary" && legendaryOpts.length > 0 && (
        <PartChecklist label="Legendary Type" options={legendaryOpts} selected={legendary.parts} onToggle={legendary.toggle} onQtyChange={legendary.setQty} showInfo={showInfo} />
      )}
      {rarity === "Pearl" && pearlOpts.length > 0 && (
        <PartChecklist label="Pearl Type" options={pearlOpts} selected={pearl.parts} onToggle={pearl.toggle} onQtyChange={pearl.setQty} showInfo={showInfo} />
      )}

      <PartChecklist label="Element 1" options={elemOpts} selected={element1.parts} onToggle={element1.toggle} onQtyChange={element1.setQty} showInfo={showInfo} />
      <PartChecklist label="Element 2" options={elemOpts} selected={element2.parts} onToggle={element2.toggle} onQtyChange={element2.setQty} showInfo={showInfo} />

      {PART_TYPES.map((pt) => {
        const opts = getPartOpts(pt);
        if (opts.length === 0) return null;
        const list = partLists[pt];
        if (!list) return null;
        return <PartChecklist key={pt} label={pt} options={opts} selected={list.parts} onToggle={list.toggle} onQtyChange={list.setQty} showInfo={showInfo} />;
      })}

      <SkinSelector skins={data.skins ?? []} value={skin} onChange={setSkin} />
      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <CodeOutput code={code} onClear={() => setCode("")} />
      <DecodeBox />
    </div>
  );
}
