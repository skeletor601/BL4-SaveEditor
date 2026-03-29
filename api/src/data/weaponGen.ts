import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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
  mfgWtIdList: MfgTypeIdEntry[];
  partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>>;
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

// ── Universal DB loader ──────────────────────────────────────────────────────

interface UniversalRow {
  code: string;
  name: string;
  manufacturer: string;
  category: string;
  partType: string;
  weaponType: string;
  description: string;
  rarity: string;
  element: string;
  character: string;
  perkName: string;
  perkDescription: string;
  redText: string;
  spawnCode: string;
  dlc: string;
}

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return (raw?.rows ?? raw ?? []) as UniversalRow[];
  } catch {
    return [];
  }
}

function parseCodeParts(code: string): { typeId: string; partId: string } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: m[1], partId: m[2] } : { typeId: "", partId: "" };
}

// ── Keep godrolls + skins as separate files (not in universal DB) ────────────

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

// ── Main data builder ────────────────────────────────────────────────────────

let cached: WeaponGenData | null = null;

export function getWeaponGenData(): WeaponGenData {
  if (cached) return cached;

  const allRows = loadUniversalDb();
  const godrolls = loadGodrolls();
  const skins = loadSkins();

  // Filter by category
  const weaponRows = allRows.filter((r) => r.category === "Weapon");
  const elementRows = allRows.filter((r) => r.category === "Element");

  // ── Part types we care about ──
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

  // ── Build mfgWtId list from weapon rows ──
  const mfgWtIdSet = new Map<string, string>();
  for (const r of weaponRows) {
    const { typeId } = parseCodeParts(r.code);
    if (typeId && r.manufacturer && r.weaponType) {
      const key = `${r.manufacturer}\t${r.weaponType}`;
      if (!mfgWtIdSet.has(key)) mfgWtIdSet.set(key, typeId);
    }
  }

  const mfgWtIdList: MfgTypeIdEntry[] = Array.from(mfgWtIdSet.entries()).map(([key, mfgWtId]) => {
    const [manufacturer, weaponType] = key.split("\t");
    return { manufacturer, weaponType, mfgWtId };
  });
  const manufacturers = [...new Set(mfgWtIdList.map((e) => e.manufacturer))].sort();
  const weaponTypes = [...new Set(mfgWtIdList.map((e) => e.weaponType))].sort();

  // ── Build parts grouped by mfgWtId ──
  const partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>> = {};
  for (const row of weaponRows) {
    const { typeId, partId } = parseCodeParts(row.code);
    if (!typeId || !partId) continue;
    const pt = partTypeNorm(row.partType);
    if (!partTypesWeWant.has(pt)) continue;

    if (!partsByMfgTypeId[typeId]) partsByMfgTypeId[typeId] = {};
    if (!partsByMfgTypeId[typeId][pt]) partsByMfgTypeId[typeId][pt] = [];
    const label = row.description ? `${partId} - ${row.description}` : partId;
    const exists = partsByMfgTypeId[typeId][pt].some((p) => p.partId === partId);
    if (!exists) partsByMfgTypeId[typeId][pt].push({ partId, label });
  }

  // ── Elemental ──
  const elemental: { partId: string; stat: string }[] = elementRows.map((r) => {
    const { partId } = parseCodeParts(r.code);
    return { partId, stat: r.name || r.description || `Element ${partId}` };
  }).filter((e) => e.partId);

  // ── Load legendary effects for enrichment ──
  const flatEffects: Record<string, { perk?: string; desc?: string; redText?: string }> = {};
  const effectsPath = getPath("api/data/legendary_effects.json");
  if (existsSync(effectsPath)) {
    try {
      const raw = JSON.parse(readFileSync(effectsPath, "utf-8"));
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

  // ── Rarity / Legendary / Pearl from universal DB ──
  const rarityByMfgTypeId: Record<string, { partId: string; stat: string; description?: string }[]> = {};
  const legendaryByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]> = {};
  const pearlByMfgTypeId: Record<string, { partId: string; description: string; effect?: string; perk?: string; perkDesc?: string; redText?: string }[]> = {};

  for (const row of weaponRows) {
    if (row.partType !== "Rarity") continue;
    const { typeId, partId } = parseCodeParts(row.code);
    if (!typeId || !partId) continue;

    const rarityLower = (row.rarity || "").toLowerCase();
    const descName = row.perkName || row.name || partId;

    if (rarityLower === "legendary") {
      if (!legendaryByMfgTypeId[typeId]) legendaryByMfgTypeId[typeId] = [];
      // Try enrichment from legendary_effects.json first, then from universal DB fields
      const detail = getLegendaryDetail(descName);
      legendaryByMfgTypeId[typeId].push({
        partId,
        description: descName,
        effect: getEffect(descName),
        perk: detail?.perk || row.perkName || undefined,
        perkDesc: detail?.desc || row.perkDescription || undefined,
        redText: detail?.redText || row.redText || undefined,
      });
    } else if (rarityLower === "pearl" || rarityLower === "pearlescent") {
      if (!pearlByMfgTypeId[typeId]) pearlByMfgTypeId[typeId] = [];
      const detail = getLegendaryDetail(descName);
      pearlByMfgTypeId[typeId].push({
        partId,
        description: descName,
        effect: getEffect(descName),
        perk: detail?.perk || row.perkName || undefined,
        perkDesc: detail?.desc || row.perkDescription || undefined,
        redText: detail?.redText || row.redText || undefined,
      });
    } else {
      if (!rarityByMfgTypeId[typeId]) rarityByMfgTypeId[typeId] = [];
      rarityByMfgTypeId[typeId].push({
        partId,
        stat: row.rarity || row.name || "",
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
