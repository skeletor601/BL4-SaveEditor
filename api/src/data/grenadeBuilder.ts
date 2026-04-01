import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function getPath(relative: string): string {
  return join(repoRoot, relative);
}

const GRENADE_MFG_IDS = [263, 267, 270, 272, 278, 291, 298, 311] as const;
const GRENADE_MFG_SET = new Set<number>(GRENADE_MFG_IDS);

const MFG_NAMES: Record<number, string> = {
  263: "Maliwan", 267: "Jakobs", 270: "Daedalus", 272: "Order",
  278: "Ripper", 291: "Vladof", 298: "Torgue", 311: "Tediore",
};

export interface GrenadeBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

export interface GrenadeBuilderLegendaryPart extends GrenadeBuilderPart {
  mfgId: number;
  mfgName: string;
}

export interface GrenadeBuilderRarity {
  id: number;
  label: string;
}

export interface GrenadeBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, GrenadeBuilderRarity[]>;
  element: GrenadeBuilderPart[];
  firmware: GrenadeBuilderPart[];
  universalPerks: GrenadeBuilderPart[];
  legendaryPerks: GrenadeBuilderLegendaryPart[];
  mfgPerks: Record<number, GrenadeBuilderPart[]>;
}

interface UniversalRow {
  code: string;
  name: string;
  partName: string;
  itemType: string;
  manufacturer: string;
  category: string;
  partType: string;
  description: string;
  effect: string;
  rarity: string;
  perkName: string;
  perkDescription: string;
  redText: string;
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

function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

let cached: GrenadeBuilderData | null = null;

export function getGrenadeBuilderData(): GrenadeBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb();
  const grenadeRows = allRows.filter((r) => r.category === "Grenade");

  const mfgs = GRENADE_MFG_IDS.map((id) => ({
    id,
    name: MFG_NAMES[id] ?? `Manufacturer ${id}`,
  }));

  const raritiesByMfg: Record<number, GrenadeBuilderRarity[]> = {};
  const mfgPerks: Record<number, GrenadeBuilderPart[]> = {};
  const legendaryPerks: GrenadeBuilderLegendaryPart[] = [];
  const element: GrenadeBuilderPart[] = [];
  const firmware: GrenadeBuilderPart[] = [];
  const universalPerks: GrenadeBuilderPart[] = [];

  for (const row of grenadeRows) {
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;

    const pt = (row.partType || "").trim();
    const stat = row.partName || row.name || row.effect || row.description || "";
    const desc = (row.effect || row.description) && (row.effect || row.description) !== stat ? (row.effect || row.description) : undefined;

    // Type 245 = universal grenade parts (element, firmware, universal perks)
    if (typeId === 245) {
      if (pt === "Element") {
        element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Firmware") {
        firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Perk") {
        universalPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      }
      continue;
    }

    // Manufacturer-specific parts (type = mfg ID)
    if (GRENADE_MFG_SET.has(typeId)) {
      if (pt === "Rarity") {
        if (!raritiesByMfg[typeId]) raritiesByMfg[typeId] = [];
        raritiesByMfg[typeId].push({
          id: partId,
          label: desc ? `${stat} - ${desc}` : stat,
        });
      } else if (pt === "Legendary Perk") {
        legendaryPerks.push({
          partId,
          mfgId: typeId,
          mfgName: MFG_NAMES[typeId] ?? `Mfg ${typeId}`,
          stat,
          ...(desc ? { description: desc } : {}),
        });
      } else if (pt === "Perk") {
        if (!mfgPerks[typeId]) mfgPerks[typeId] = [];
        mfgPerks[typeId].push({
          partId, stat, ...(desc ? { description: desc } : {}),
        });
      }
    }
  }

  cached = { mfgs, raritiesByMfg, element, firmware, universalPerks, legendaryPerks, mfgPerks };
  return cached;
}
