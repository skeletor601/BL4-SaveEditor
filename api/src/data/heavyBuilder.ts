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

let cached: HeavyBuilderData | null = null;

export function getHeavyBuilderData(): HeavyBuilderData {
  if (cached) return cached;

  const db = loadUniversalDb();
  const allRows = db.filter((r) => r.category === "Heavy");
  const elementRows = db.filter((r) => r.category === "Element");
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
    const stat = row.partName || row.name || row.effect || row.description || "";
    const desc = (row.effect || row.description) && (row.effect || row.description) !== stat ? (row.effect || row.description) : undefined;

    // Element and Firmware can come from any typeId (244 or 1)
    if (pt === "Element") {
      element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      continue;
    }
    if (pt === "Firmware") {
      firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      continue;
    }
    if (HEAVY_MFG_SET.has(typeId)) {
      if (pt === "Rarity") {
        if (!raritiesByMfg[typeId]) raritiesByMfg[typeId] = [];
        // Determine rarity tier from the rarity field, or infer from spawn code name
        let rarityLabel = row.rarity || '';
        if (!rarityLabel) {
          const nameLower = (row.partName || row.name || '').toLowerCase();
          if (nameLower.includes('common') && !nameLower.includes('uncommon')) rarityLabel = 'Common';
          else if (nameLower.includes('uncommon')) rarityLabel = 'Uncommon';
          else if (nameLower.includes('rare') && !nameLower.includes('legendary')) rarityLabel = 'Rare';
          else if (nameLower.includes('epic')) rarityLabel = 'Epic';
          else if (nameLower.includes('legendary')) rarityLabel = 'Legendary';
          else rarityLabel = stat;
        }
        // For legendary, show the weapon name. For others, show the tier.
        const displayLabel = rarityLabel === 'Legendary' && stat !== 'Legendary'
          ? `Legendary - ${stat}`
          : rarityLabel;
        raritiesByMfg[typeId].push({ id: partId, label: displayLabel });
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

  // Pull single-element codes from the Element category, put them first
  const extraElements: HeavyBuilderPart[] = [];
  const seenElIds = new Set(element.map((e) => e.partId));
  for (const row of elementRows) {
    const { partId } = parseCode(row.code);
    if (!partId || seenElIds.has(partId)) continue;
    seenElIds.add(partId);
    const stat = row.partName || row.name || row.effect || row.description || "";
    extraElements.push({ partId, stat });
  }
  element.unshift(...extraElements);

  cached = { mfgs, raritiesByMfg, barrel, element, firmware, barrelAccPerks, bodyAccPerks, bodiesByMfg };
  return cached;
}
