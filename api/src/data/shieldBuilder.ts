import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
function getPath(relative: string): string { return join(repoRoot, relative); }

const SHIELD_MFG_IDS = [279, 283, 287, 293, 300, 306, 312, 321] as const;
const SHIELD_MFG_SET = new Set<number>(SHIELD_MFG_IDS);
const SHIELD_MFG_NAMES: Record<number, string> = {
  279: "Maliwan", 283: "Vladof", 287: "Tediore", 293: "Order",
  300: "Ripper", 306: "Jakobs", 312: "Daedalus", 321: "Torgue",
};
const SHIELD_MFG_TYPE: Record<number, string> = {
  279: "Energy", 283: "Armor", 287: "Armor", 293: "Energy",
  300: "Energy", 306: "Armor", 312: "Energy", 321: "Armor",
};

export interface ShieldBuilderPart { partId: number; stat: string; description?: string; }
export interface ShieldBuilderLegendaryPart extends ShieldBuilderPart { mfgId: number; mfgName: string; }
export interface ShieldBuilderRarity { id: number; label: string; }
export interface ShieldBuilderData {
  mfgs: { id: number; name: string }[];
  mfgTypeById: Record<number, string>;
  raritiesByMfg: Record<number, ShieldBuilderRarity[]>;
  element: ShieldBuilderPart[];
  firmware: ShieldBuilderPart[];
  universalPerks: ShieldBuilderPart[];
  energyPerks: ShieldBuilderPart[];
  armorPerks: ShieldBuilderPart[];
  legendaryPerks: ShieldBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}

interface UniversalRow { code: string; name: string; manufacturer: string; category: string; partType: string; description: string; rarity: string; perkName: string; perkDescription: string; redText: string; }

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try { const raw = JSON.parse(readFileSync(path, "utf-8")); return (raw?.rows ?? raw ?? []) as UniversalRow[]; } catch { return []; }
}
function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

let cached: ShieldBuilderData | null = null;

export function getShieldBuilderData(): ShieldBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb().filter((r) => r.category === "Shield");
  const mfgs = SHIELD_MFG_IDS.map((id) => ({ id, name: SHIELD_MFG_NAMES[id] ?? `Manufacturer ${id}` }));
  const mfgTypeById: Record<number, string> = {};
  for (const id of SHIELD_MFG_IDS) mfgTypeById[id] = SHIELD_MFG_TYPE[id] ?? "Energy";

  const raritiesByMfg: Record<number, ShieldBuilderRarity[]> = {};
  const legendaryPerks: ShieldBuilderLegendaryPart[] = [];
  const modelsByMfg: Record<number, number | null> = {};
  const element: ShieldBuilderPart[] = [];
  const firmware: ShieldBuilderPart[] = [];
  const universalPerks: ShieldBuilderPart[] = [];
  const energyPerks: ShieldBuilderPart[] = [];
  const armorPerks: ShieldBuilderPart[] = [];

  for (const row of allRows) {
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;
    const pt = (row.partType || "").trim();
    const stat = row.name || row.description || "";
    const desc = row.description && row.description !== stat ? row.description : undefined;

    if (typeId === 246) { // Universal shield perks
      if (pt === "Elemental Resistance" || pt === "Element") element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (pt === "Firmware") firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (pt === "Perk") universalPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
    } else if (typeId === 248) { // Energy perks
      energyPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
    } else if (typeId === 237) { // Armor perks
      armorPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
    } else if (SHIELD_MFG_SET.has(typeId)) {
      if (pt === "Rarity") {
        if (!raritiesByMfg[typeId]) raritiesByMfg[typeId] = [];
        raritiesByMfg[typeId].push({ id: partId, label: desc ? `${stat} - ${desc}` : stat });
      } else if (pt === "Legendary Perk") {
        legendaryPerks.push({ partId, mfgId: typeId, mfgName: SHIELD_MFG_NAMES[typeId] ?? `Mfg ${typeId}`, stat, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Model") {
        modelsByMfg[typeId] = partId;
      }
    }
  }

  cached = { mfgs, mfgTypeById, raritiesByMfg, element, firmware, universalPerks, energyPerks, armorPerks, legendaryPerks, modelsByMfg };
  return cached;
}
