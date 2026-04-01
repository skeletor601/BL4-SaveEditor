import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
function getPath(relative: string): string { return join(repoRoot, relative); }

const REPKIT_MFG_IDS = [277, 265, 266, 285, 274, 290, 261, 269] as const;
const REPKIT_MFG_SET = new Set<number>(REPKIT_MFG_IDS);
const REPKIT_MFG_NAMES: Record<number, string> = {
  277: "Daedalus", 265: "Jakobs", 266: "Maliwan", 285: "Order",
  274: "Ripper", 290: "Tediore", 261: "Torgue", 269: "Vladof",
};

export interface RepkitBuilderPart { partId: number; stat: string; description?: string; }
export interface RepkitBuilderLegendaryPart extends RepkitBuilderPart { mfgId: number; mfgName: string; }
export interface RepkitBuilderRarity { id: number; label: string; }
export interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  prefix: RepkitBuilderPart[];
  firmware: RepkitBuilderPart[];
  resistance: RepkitBuilderPart[];
  universalPerks: RepkitBuilderPart[];
  legendaryPerks: RepkitBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
}

interface UniversalRow { code: string; name: string; partName: string; manufacturer: string; category: string; partType: string; description: string; effect: string; rarity: string; }

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try { const raw = JSON.parse(readFileSync(path, "utf-8")); return (raw?.rows ?? raw ?? []) as UniversalRow[]; } catch { return []; }
}
function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

let cached: RepkitBuilderData | null = null;

export function getRepkitBuilderData(): RepkitBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb().filter((r) => r.category === "Repkit");
  const mfgs = REPKIT_MFG_IDS.map((id) => ({ id, name: REPKIT_MFG_NAMES[id] ?? `Manufacturer ${id}` }));

  const raritiesByMfg: Record<number, RepkitBuilderRarity[]> = {};
  const legendaryPerks: RepkitBuilderLegendaryPart[] = [];
  const modelsByMfg: Record<number, number | null> = {};
  const prefix: RepkitBuilderPart[] = [];
  const firmware: RepkitBuilderPart[] = [];
  const resistance: RepkitBuilderPart[] = [];
  const universalPerks: RepkitBuilderPart[] = [];

  for (const row of allRows) {
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;
    const pt = (row.partType || "").trim();
    const stat = row.partName || row.name || row.effect || row.description || "";
    const desc = (row.effect || row.description) && (row.effect || row.description) !== stat ? (row.effect || row.description) : undefined;

    if (typeId === 243) {
      const ptLower = pt.toLowerCase();
      if (ptLower === "prefix" || ptLower === "perfix") prefix.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (ptLower === "firmware") firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (ptLower === "resistance" || ptLower === "immunity") resistance.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (ptLower === "perk") universalPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
    } else if (REPKIT_MFG_SET.has(typeId)) {
      if (pt === "Rarity") {
        if (!raritiesByMfg[typeId]) raritiesByMfg[typeId] = [];
        raritiesByMfg[typeId].push({ id: partId, label: desc ? `${stat} - ${desc}` : stat });
      } else if (pt === "Legendary Perk") {
        legendaryPerks.push({ partId, mfgId: typeId, mfgName: REPKIT_MFG_NAMES[typeId] ?? `Mfg ${typeId}`, stat, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Model") {
        modelsByMfg[typeId] = partId;
      }
    }
  }

  cached = { mfgs, raritiesByMfg, prefix, firmware, resistance, universalPerks, legendaryPerks, modelsByMfg };
  return cached;
}
