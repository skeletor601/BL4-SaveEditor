import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseCsv } from "./csvParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

export interface WeaponPartRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  stat: string;
  description: string;
}

export interface ElementalRow {
  partId: string;
  stat: string;
}

export interface RarityRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  stat: string;
  description: string;
}

export interface GodRoll {
  name: string;
  decoded: string;
}

export interface WeaponSkin {
  label: string;
  value: string;
}

export interface MfgTypeIdEntry {
  manufacturer: string;
  weaponType: string;
  mfgWtId: string;
}

export interface WeaponGenData {
  manufacturers: string[];
  weaponTypes: string[];
  /** (manufacturer, weaponType) -> mfgWtId */
  mfgWtIdList: MfgTypeIdEntry[];
  /** Key: "mfgWtId". Value: part type -> list of { partId, label } */
  partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>>;
  /** Key: "mfgWtId". Rarity options (non-Legendary) */
  rarityByMfgTypeId: Record<string, { partId: string; stat: string; description?: string }[]>;
  legendaryByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]>;
  pearlByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]>;
  elemental: { partId: string; stat: string }[];
  godrolls: GodRoll[];
  skins: WeaponSkin[];
}

function getPath(relative: string): string {
  return join(repoRoot, relative);
}

function readCsv(path: string): { headers: string[]; rows: Record<string, string>[] } {
  const content = readFileSync(path, "utf-8");
  return parseCsv(content);
}

function loadPartsCsv(): WeaponPartRow[] {
  const enPath = getPath("weapon_edit/all_weapon_part_EN.csv");
  const path = existsSync(enPath) ? enPath : getPath("weapon_edit/all_weapon_part.csv");
  if (!existsSync(path)) return [];
  const { rows } = readCsv(path);
  return rows.map((r) => ({
    mfgWtId: String(r["Manufacturer & Weapon Type ID"] ?? "").trim(),
    manufacturer: String(r["Manufacturer"] ?? "").trim(),
    weaponType: String(r["Weapon Type"] ?? "").trim(),
    partId: String(r["Part ID"] ?? "").trim().replace("<NA>", ""),
    partType: String(r["Part Type"] ?? "").trim(),
    stat: String(r["Stat"] ?? "").trim(),
    description: String(r["Description"] ?? "").trim(),
  }));
}

function loadElemental(): ElementalRow[] {
  const path = getPath("weapon_edit/elemental.csv");
  const byPartId = new Map<string, ElementalRow>();
  if (existsSync(path)) {
    const { rows } = readCsv(path);
    for (const r of rows) {
      const partId = String(r["Part_ID"] ?? "").trim();
      if (!partId) continue;
      byPartId.set(partId, {
        partId,
        stat: String(r["Stat"] ?? "").trim(),
      });
    }
  }
  const weaponElementalPath = getPath("master_search/db/Borderlands 4 Item Parts Master List - Weapon Elemental.csv");
  if (existsSync(weaponElementalPath)) {
    const { rows } = readCsv(weaponElementalPath);
    for (const r of rows) {
      const partId = String(r["ID"] ?? "").trim();
      if (!partId) continue;
      if (byPartId.has(partId)) continue;
      const stat = String(r["Description"] ?? r["Element"] ?? r["String"] ?? "").trim() || partId;
      byPartId.set(partId, { partId, stat });
    }
  }
  return Array.from(byPartId.values()).sort((a, b) => Number(a.partId) - Number(b.partId));
}

function loadWeaponRarity(): RarityRow[] {
  const path = getPath("weapon_edit/weapon_rarity.csv");
  if (!existsSync(path)) return [];
  const { rows } = readCsv(path);
  return rows.map((r) => ({
    mfgWtId: String(r["Manufacturer & Weapon Type ID"] ?? "").trim(),
    manufacturer: String(r["Manufacturer"] ?? "").trim(),
    weaponType: String(r["Weapon Type"] ?? "").trim(),
    partId: String(r["Part ID"] ?? "").trim(),
    partType: String(r["Part Type"] ?? "").trim(),
    stat: String(r["Stat"] ?? "").trim(),
    description: String(r["Description"] ?? "").trim(),
  }));
}

function loadGodrolls(): GodRoll[] {
  const paths = [
    join(repoRoot, "godrolls.json"),
    join(repoRoot, "data", "godrolls.json"),
    getPath("web/public/data/godrolls.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        if (!Array.isArray(raw)) return [];
        const out: GodRoll[] = [];
        for (const item of raw) {
          if (item && typeof item.name === "string" && typeof item.decoded === "string") {
            out.push({ name: item.name.trim(), decoded: item.decoded.trim() });
          }
        }
        return out;
      } catch {
        // continue
      }
    }
  }
  return [];
}

function loadSkins(): WeaponSkin[] {
  const path = getPath("master_search/db/weapon_skins.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((it: unknown) => it && typeof (it as { value?: string }).value === "string")
      .map((it: { label?: string; value: string }) => ({
        label: typeof it.label === "string" ? it.label : it.value,
        value: it.value,
      }));
  } catch {
    return [];
  }
}

let cached: WeaponGenData | null = null;

export function getWeaponGenData(): WeaponGenData {
  if (cached) return cached;

  const partRows = loadPartsCsv();
  const rarityRows = loadWeaponRarity();
  const elemental = loadElemental();
  const godrolls = loadGodrolls();
  const skins = loadSkins();

  const partTypesWeWantList = [
    "Body", "Body Accessory", "Barrel", "Barrel Accessory", "Magazine", "Stat Modifier",
    "Grip", "Foregrip", "Manufacturer Part", "Scope", "Scope Accessory", "Underbarrel", "Underbarrel Accessory",
  ];
  const partTypesWeWant = new Set(partTypesWeWantList);
  const partTypeNorm = (pt: string): string => {
    const lower = pt.trim().toLowerCase();
    const found = partTypesWeWantList.find((c) => c.toLowerCase() === lower);
    return found ?? pt.trim();
  };

  const mfgWtIdSet = new Map<string, string>();
  for (const r of partRows) {
    if (r.mfgWtId && r.manufacturer && r.weaponType) {
      const key = `${r.manufacturer}\t${r.weaponType}`;
      if (!mfgWtIdSet.has(key)) mfgWtIdSet.set(key, r.mfgWtId);
    }
  }
  // Add mfgWtIds from universal so Master Unlock can show all parts (including from sources not in weapon CSV)
  const universalPath = getPath("master_search/db/universal_parts_db.json");
  if (existsSync(universalPath)) {
    try {
      const raw = JSON.parse(readFileSync(universalPath, "utf-8"));
      const rows = (raw?.rows ?? []) as Record<string, unknown>[];
      for (const r of rows) {
        const code = String(r.code ?? "").trim();
        const partTypeRaw = String(r["Part Type"] ?? "").trim();
        const partTypeCanon = partTypeNorm(partTypeRaw);
        if (!partTypesWeWant.has(partTypeCanon)) continue;
        const codeMatch = code.match(/^\s*\{\s*(\d+)\s*:/);
        const typeId = codeMatch ? codeMatch[1] : "";
        if (!typeId) continue;
        const manufacturer = String(r.Manufacturer ?? "").trim();
        const weaponType = String(r["Weapon Type"] ?? r.WeaponType ?? "").trim();
        if (!manufacturer || !weaponType) continue;
        const key = `${manufacturer}\t${weaponType}`;
        if (!mfgWtIdSet.has(key)) mfgWtIdSet.set(key, typeId);
      }
    } catch {
      // ignore
    }
  }

  const mfgWtIdList: MfgTypeIdEntry[] = Array.from(mfgWtIdSet.entries()).map(([key, mfgWtId]) => {
    const [manufacturer, weaponType] = key.split("\t");
    return { manufacturer, weaponType, mfgWtId };
  });
  const manufacturers = [...new Set(mfgWtIdList.map((e) => e.manufacturer))].sort();
  const weaponTypes = [...new Set(mfgWtIdList.map((e) => e.weaponType))].sort();

  const partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>> = {};
  for (const row of partRows) {
    if (!row.mfgWtId || !row.partId || row.partType === "Rarity") continue;
    if (!partsByMfgTypeId[row.mfgWtId]) partsByMfgTypeId[row.mfgWtId] = {};
    const pt = partTypeNorm(row.partType);
    if (!partTypesWeWant.has(pt)) continue;
    if (!partsByMfgTypeId[row.mfgWtId][pt]) partsByMfgTypeId[row.mfgWtId][pt] = [];
    const label = row.stat ? `${row.partId} - ${row.stat}` : row.partId;
    partsByMfgTypeId[row.mfgWtId][pt].push({ partId: row.partId, label });
  }
  const mfgWtIdByKey = new Map<string, string>();
  mfgWtIdList.forEach((e) => mfgWtIdByKey.set(`${e.manufacturer}\t${e.weaponType}`, e.mfgWtId));
  if (existsSync(universalPath)) {
    try {
      const raw = JSON.parse(readFileSync(universalPath, "utf-8"));
      const rows = (raw?.rows ?? []) as Record<string, unknown>[];
      for (const r of rows) {
        const manufacturer = String(r.Manufacturer ?? "").trim();
        const weaponType = String(r["Weapon Type"] ?? r.WeaponType ?? "").trim();
        const partTypeRaw = String(r["Part Type"] ?? "").trim();
        const partType = partTypeNorm(partTypeRaw);
        const partId = String(r.ID ?? r.Id ?? "").trim();
        if (!manufacturer || !weaponType || !partType || !partId || !partTypesWeWant.has(partType)) continue;
        const key = `${manufacturer}\t${weaponType}`;
        const mfgWtId = mfgWtIdByKey.get(key);
        if (!mfgWtId) continue;
        const stat = String(r["Stats (Level 50, Common)"] ?? r.Stats ?? r["Model Name"] ?? "").trim();
        const label = stat ? `${partId} - ${stat}` : partId;
        if (!partsByMfgTypeId[mfgWtId]) partsByMfgTypeId[mfgWtId] = {};
        if (!partsByMfgTypeId[mfgWtId][partType]) partsByMfgTypeId[mfgWtId][partType] = [];
        const exists = partsByMfgTypeId[mfgWtId][partType].some((p) => p.partId === partId);
        if (!exists) partsByMfgTypeId[mfgWtId][partType].push({ partId, label });
      }
    } catch {
      // ignore
    }
  }

  // Load legendary effects lookup — flatten categorized JSON into a single map keyed by item name
  const flatEffects: Record<string, { perk?: string; desc?: string; redText?: string }> = {};
  const effectsPath = getPath("api/data/legendary_effects.json");
  if (existsSync(effectsPath)) {
    try {
      const raw = JSON.parse(readFileSync(effectsPath, "utf-8"));
      // Handle categorized format: { weapons: { "Anarchy": { perk, desc, redText } }, shields: { ... }, ... }
      for (const category of Object.values(raw)) {
        if (category && typeof category === "object") {
          for (const [itemName, entry] of Object.entries(category as Record<string, any>)) {
            const key = itemName.toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ").trim();
            flatEffects[key] = { perk: entry.perk, desc: entry.desc, redText: entry.redText };
          }
        }
      }
    } catch { /* ignore */ }
  }
  const getEffect = (name: string): string | undefined => {
    const key = name.toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ").trim();
    const entry = flatEffects[key];
    if (!entry) return undefined;
    let result = entry.perk && entry.desc ? `${entry.perk} - ${entry.desc}` : entry.desc || entry.perk || "";
    if (entry.redText) result += ` | ${entry.redText}`;
    return result || undefined;
  };
  const getLegendaryDetail = (name: string): { perk?: string; desc?: string; redText?: string } | undefined => {
    const key = name.toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ").trim();
    return flatEffects[key];
  };

  const rarityByMfgTypeId: Record<string, { partId: string; stat: string; description?: string }[]> = {};
  const legendaryByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]> = {};
  const pearlByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]> = {};
  for (const row of rarityRows) {
    if (!row.mfgWtId || !row.partId) continue;
    const rarityStat = String(row.stat ?? "").trim().toLowerCase();
    if (rarityStat === "legendary") {
      if (!legendaryByMfgTypeId[row.mfgWtId]) legendaryByMfgTypeId[row.mfgWtId] = [];
      const desc = row.description || row.partId;
      const detail = getLegendaryDetail(desc);
      legendaryByMfgTypeId[row.mfgWtId].push({
        partId: row.partId,
        description: desc,
        effect: getEffect(desc),
        perk: detail?.perk,
        perkDesc: detail?.desc,
        redText: detail?.redText,
      });
    } else if (rarityStat === "pearl" || rarityStat === "pearlescent") {
      if (!pearlByMfgTypeId[row.mfgWtId]) pearlByMfgTypeId[row.mfgWtId] = [];
      const desc = row.description || row.partId;
      const detail = getLegendaryDetail(desc);
      pearlByMfgTypeId[row.mfgWtId].push({
        partId: row.partId,
        description: desc,
        effect: getEffect(desc),
        perk: detail?.perk,
        perkDesc: detail?.desc,
        redText: detail?.redText,
      });
    } else {
      if (!rarityByMfgTypeId[row.mfgWtId]) rarityByMfgTypeId[row.mfgWtId] = [];
      rarityByMfgTypeId[row.mfgWtId].push({
        partId: row.partId,
        stat: row.stat,
        description: row.description || undefined,
      });
    }
  }

  cached = {
    manufacturers,
    weaponTypes,
    mfgWtIdList,
    partsByMfgTypeId,
    rarityByMfgTypeId,
    legendaryByMfgTypeId,
    pearlByMfgTypeId,
    elemental,
    godrolls,
    skins,
  };
  return cached;
}
