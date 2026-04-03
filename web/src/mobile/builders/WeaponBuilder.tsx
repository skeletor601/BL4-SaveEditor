import { useState, useMemo, useCallback, useEffect } from "react";
import { useMobileBuilderData } from "../hooks/useMobileBuilderData";
import MobileSelect from "../components/MobileSelect";
import { fetchApi } from "@/lib/apiClient";
import { generateModdedWeapon } from "@/lib/generateModdedWeapon";
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
  const [modPower, setModPower] = useState<"stable" | "op" | "insane">("stable");
  const [modGenerating, setModGenerating] = useState(false);
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

  const handleGenerateModded = useCallback(async () => {
    if (!data || !mfgWtId) return;
    setModGenerating(true);
    try {
      const base = window.location.origin || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataPath = typeof (import.meta as any)?.env?.BASE_URL === "string" ? String((import.meta as any).env.BASE_URL).replace(/\/$/, "") : "";
      // Fetch all required data in parallel — same as desktop
      const [editRes, partsRes, visualBarrelsRes, allowedBarrelsRes, underbarrelRecipesRes] = await Promise.all([
        fetchApi("weapon-edit/data"),
        fetchApi("parts/data"),
        fetch(`${base}${dataPath}/data/visual_heavy_barrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/allowed_barrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/underbarrel_recipes.json`).catch(() => null),
      ]);
      const editData = await editRes.json().catch(() => null);
      const partsPayload = (await partsRes.json().catch(() => ({}))) as { items?: unknown[] };
      const visualBarrelEntries = visualBarrelsRes?.ok ? (await visualBarrelsRes.json().catch(() => [])) as Array<{ name: string; code: string }> : [];
      const allowedBarrelEntries = allowedBarrelsRes?.ok ? (await allowedBarrelsRes.json().catch(() => [])) as Array<{ name: string; code: string }> : [];
      const underbarrelRecipes = underbarrelRecipesRes?.ok ? await underbarrelRecipesRes.json().catch(() => []) : [];

      if (!editData?.parts?.length) throw new Error("No weapon edit data");

      // Build universal part codes — same mapping as desktop
      const items = Array.isArray(partsPayload?.items) ? partsPayload.items : [];
      const universalPartCodes = items
        .filter((it): it is Record<string, unknown> => it != null && typeof it === "object" && !!((it as Record<string, unknown>).code))
        .map((raw) => ({
          code: String(raw.code ?? ""),
          partType: String(raw.partType ?? ""),
          rarity: String(raw.rarity ?? ""),
          itemType: String(raw.itemType ?? ""),
          weaponType: String(raw.weaponType ?? ""),
          manufacturer: String(raw.manufacturer ?? ""),
          uniqueEffect: /^(true|1|yes)$/i.test(String(raw.uniqueEffect ?? "")),
          statText: [raw.effect, raw.stat, raw.string, raw.partName, raw.name].map((v) => String(v ?? "").trim()).filter(Boolean).join(" "),
        }));

      // Build stock base via auto-fill (same as desktop)
      const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
      const autoPrefix = Number(mfgWtId);
      const partsByType = data.partsByMfgTypeId[mfgWtId];
      let stockBaseDecoded: string | undefined;
      if (partsByType) {
        const autoSel: Record<string, { label: string; qty: string }[]> = {};
        const legendaryTypes = data.legendaryByMfgTypeId[mfgWtId] ?? [];
        const pearlTypes = data.pearlByMfgTypeId[mfgWtId] ?? [];
        if (pearlTypes.length && (Math.random() < 0.3 || !legendaryTypes.length)) {
          autoSel["Rarity"] = [{ label: "Pearl", qty: "1" }];
          const pt = pick(pearlTypes);
          autoSel["Pearl Type"] = [{ label: `${pt.partId} - ${pt.description}`, qty: "1" }];
        } else if (legendaryTypes.length) {
          autoSel["Rarity"] = [{ label: "Legendary", qty: "1" }];
          const lt = pick(legendaryTypes);
          autoSel["Legendary Type"] = [{ label: `${lt.partId} - ${lt.description}`, qty: "1" }];
        } else {
          const rarities = data.rarityByMfgTypeId[mfgWtId] ?? [];
          if (rarities.length) autoSel["Rarity"] = [{ label: rarities[rarities.length - 1].stat, qty: "1" }];
        }
        for (const pt of PART_TYPES) {
          const opts = partsByType[pt];
          if (opts?.length) autoSel[pt] = [{ label: opts[0].label, qty: "1" }];
        }
        if (data.elemental?.length) {
          const el = data.elemental.filter((e) => !/kinetic/i.test(e.stat));
          if (el.length) autoSel["Element 1"] = [{ label: `${pick(el).partId} - ${pick(el).stat}`, qty: "1" }];
        }
        // Build decoded from auto-fill selections using same logic as desktop
        const header = `${mfgWtId}, 0, 1, ${level}| 2, ${seed}||`;
        const parts: string[] = [];
        const rarityList = autoSel["Rarity"] ?? [];
        for (const r of rarityList) {
          if (r.label === "Legendary") {
            for (const l of (autoSel["Legendary Type"] ?? [])) { const pid = partIdFromLabel(l.label); if (pid) parts.push(`{${pid}}`); }
          } else if (r.label === "Pearl") {
            for (const p of (autoSel["Pearl Type"] ?? [])) { const pid = partIdFromLabel(p.label); if (pid) parts.push(`{${pid}}`); }
          } else {
            const entry = (data.rarityByMfgTypeId[mfgWtId] ?? []).find((x) => x.stat === r.label);
            if (entry) parts.push(`{${entry.partId}}`);
          }
        }
        for (const pt of PART_TYPES) {
          for (const s of (autoSel[pt] ?? [])) { const pid = partIdFromLabel(s.label); if (pid) parts.push(`{${pid}}`); }
        }
        for (const key of ["Element 1", "Element 2"]) {
          for (const s of (autoSel[key] ?? [])) { const pid = partIdFromLabel(s.label); if (pid) parts.push(`{1:${pid}}`); }
        }
        stockBaseDecoded = `${header} ${parts.join(" ")} |`;
      }

      const result = generateModdedWeapon(editData, universalPartCodes, {
        level,
        modPowerMode: modPower,
        skin: skin || undefined,
        forcedPrefix: autoPrefix || undefined,
        stockBaseDecoded,
        visualBarrelEntries: visualBarrelEntries.length ? visualBarrelEntries : undefined,
        allowedBarrelEntries: allowedBarrelEntries.length ? allowedBarrelEntries : undefined,
        skinOptions: data.skins?.length ? data.skins : undefined,
        underbarrelRecipes: Array.isArray(underbarrelRecipes) ? underbarrelRecipes : undefined,
      });
      setCode(result.code.trim());
    } catch (e) {
      console.error("Modded weapon generation failed:", e);
    }
    setModGenerating(false);
  }, [data, mfgWtId, level, seed, modPower, skin]);

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
      <MobileSelect label="Mod Power" options={[
        { value: "stable", label: "Stable" }, { value: "op", label: "OP" }, { value: "insane", label: "Insane" },
      ]} value={modPower} onChange={(v) => setModPower(v as "stable" | "op" | "insane")} />
      <GenerateBar onGenerate={generate} onClear={clearAll} />
      <button type="button" className="mobile-btn" onClick={handleGenerateModded} disabled={modGenerating} style={{ marginBottom: 14, background: "rgba(168,85,247,0.15)", borderColor: "#a855f7", color: "#a855f7" }}>
        {modGenerating ? "Generating…" : "Generate Modded Weapon"}
      </button>
      <CodeOutput code={code} onClear={() => setCode("")} />
      <DecodeBox />
    </div>
  );
}
