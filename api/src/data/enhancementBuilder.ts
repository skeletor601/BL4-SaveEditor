import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
function getPath(relative: string): string { return join(repoRoot, relative); }

export interface EnhancementMfgPerk { index: number; name: string; description?: string; }
export interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: EnhancementMfgPerk[];
  rarities: Record<string, number>;
}
export interface EnhancementBuilderData {
  manufacturers: Record<string, EnhancementManufacturer>;
  rarityMap247: Record<string, number>;
  secondary247: { code: number; name: string; description?: string }[];
}

interface UniversalRow { code: string; name: string; manufacturer: string; category: string; partType: string; description: string; rarity: string; perkName: string; perkDescription: string; }

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try { const raw = JSON.parse(readFileSync(path, "utf-8")); return (raw?.rows ?? raw ?? []) as UniversalRow[]; } catch { return []; }
}
function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

const ENH_MFG_NAMES: Record<number, string> = {
  284: "Atlas", 286: "COV", 299: "Daedalus", 264: "Hyperion",
  268: "Jakobs", 271: "Maliwan", 296: "Ripper", 292: "Tediore",
  281: "The Order", 303: "Torgue", 310: "Vladof",
};
const ENH_MFG_IDS = new Set(Object.keys(ENH_MFG_NAMES).map(Number));

let cached: EnhancementBuilderData | null = null;

export function getEnhancementBuilderData(): EnhancementBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb().filter((r) => r.category === "Enhancement");
  const manufacturers: Record<string, EnhancementManufacturer> = {};
  const rarityMap247: Record<string, number> = {};
  const secondary247: { code: number; name: string; description?: string }[] = [];

  for (const row of allRows) {
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;
    const pt = (row.partType || "").trim();
    const name = row.name || row.description || "";
    const desc = row.description && row.description !== name ? row.description : undefined;

    if (typeId === 247) { // Secondary/stat perks
      if (pt === "Rarity") {
        rarityMap247[row.rarity || name] = partId;
      } else {
        secondary247.push({ code: partId, name, ...(desc ? { description: desc } : {}) });
      }
      continue;
    }

    if (ENH_MFG_IDS.has(typeId)) {
      const mfgName = row.manufacturer || ENH_MFG_NAMES[typeId] || `Mfg ${typeId}`;
      if (!manufacturers[mfgName]) {
        manufacturers[mfgName] = { code: typeId, name: mfgName, perks: [], rarities: {} };
      }
      if (pt === "Core Perk") {
        manufacturers[mfgName].perks.push({ index: partId, name, ...(desc ? { description: desc } : {}) });
      } else if (pt === "Rarity") {
        manufacturers[mfgName].rarities[row.rarity || name] = partId;
      }
    }
  }

  cached = { manufacturers, rarityMap247, secondary247 };
  return cached;
}
