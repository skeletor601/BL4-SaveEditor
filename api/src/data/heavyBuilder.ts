import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
function getPath(relative: string): string { return join(repoRoot, relative); }

const HEAVY_MFG_IDS = [282, 273, 275, 289] as const;
const HEAVY_MFG_SET = new Set<number>(HEAVY_MFG_IDS);
const HEAVY_MFG_NAMES: Record<number, string> = {
  282: "Vladof", 273: "Torgue", 275: "Ripper", 289: "Maliwan",
};

export interface HeavyBuilderPart { partId: number; stat: string; description?: string; mfgId?: number; }
export interface HeavyBuilderRarity { id: number; label: string; }
export interface HeavyBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, HeavyBuilderRarity[]>;
  barrel: HeavyBuilderPart[];
  element: HeavyBuilderPart[];
  firmware: HeavyBuilderPart[];
  barrelAccPerks: HeavyBuilderPart[];
  bodyAccPerks: HeavyBuilderPart[];
  bodiesByMfg: Record<number, number | null>;
}

interface UniversalRow { code: string; name: string; manufacturer: string; category: string; partType: string; description: string; rarity: string; }

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try { const raw = JSON.parse(readFileSync(path, "utf-8")); return (raw?.rows ?? raw ?? []) as UniversalRow[]; } catch { return []; }
}
function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

let cached: HeavyBuilderData | null = null;

export function getHeavyBuilderData(): HeavyBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb().filter((r) => r.category === "Heavy");
  const mfgs = HEAVY_MFG_IDS.map((id) => ({ id, name: HEAVY_MFG_NAMES[id] ?? `Manufacturer ${id}` }));

  const raritiesByMfg: Record<number, HeavyBuilderRarity[]> = {};
  const bodiesByMfg: Record<number, number | null> = {};
  const barrel: HeavyBuilderPart[] = [];
  const element: HeavyBuilderPart[] = [];
  const firmware: HeavyBuilderPart[] = [];
  const barrelAccPerks: HeavyBuilderPart[] = [];
  const bodyAccPerks: HeavyBuilderPart[] = [];

  for (const row of allRows) {
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;
    const pt = (row.partType || "").trim();
    const stat = row.name || row.description || "";
    const desc = row.description && row.description !== stat ? row.description : undefined;

    if (typeId === 244) { // Universal heavy parts
      if (pt === "Element") element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      else if (pt === "Firmware") firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
    } else if (HEAVY_MFG_SET.has(typeId)) {
      if (pt === "Rarity") {
        if (!raritiesByMfg[typeId]) raritiesByMfg[typeId] = [];
        raritiesByMfg[typeId].push({ id: partId, label: stat });
      } else if (pt === "Barrel") {
        barrel.push({ partId, stat, mfgId: typeId, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Barrel Accessory") {
        barrelAccPerks.push({ partId, stat, mfgId: typeId, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Body Accessory") {
        bodyAccPerks.push({ partId, stat, mfgId: typeId, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Body") {
        bodiesByMfg[typeId] = partId;
      }
    }
  }

  cached = { mfgs, raritiesByMfg, barrel, element, firmware, barrelAccPerks, bodyAccPerks, bodiesByMfg };
  return cached;
}
