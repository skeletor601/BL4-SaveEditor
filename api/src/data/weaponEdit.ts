import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function getPath(relative: string): string {
  return join(repoRoot, relative);
}

export interface WeaponEditPartRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

export interface WeaponEditElementalRow {
  elementalId: string;
  partId: string;
  stat: string;
}

export interface WeaponEditData {
  parts: WeaponEditPartRow[];
  elemental: WeaponEditElementalRow[];
}

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
  spawnCode: string;
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

function parseCode(code: string): { typeId: string; partId: string } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: m[1], partId: m[2] } : { typeId: "", partId: "" };
}

// Category to weaponType mapping for non-weapon parts (cross-insert support)
const CATEGORY_TO_WEAPON_TYPE: Record<string, string> = {
  "Grenade": "Grenade",
  "Enhancement": "Enhancement",
  "Shield": "Shield",
  "Repkit": "Repkit",
  "Class Mod": "Class Mod",
  "Heavy": "Heavy",
};

let cached: WeaponEditData | null = null;

export function getWeaponEditData(): WeaponEditData {
  if (cached) return cached;

  const allRows = loadUniversalDb();
  const parts: WeaponEditPartRow[] = [];
  const elemental: WeaponEditElementalRow[] = [];
  const seen = new Set<string>();

  // ── Weapon parts ──
  for (const row of allRows) {
    if (row.category !== "Weapon") continue;
    const { typeId, partId } = parseCode(row.code);
    if (!typeId || !partId) continue;

    const key = `${typeId}:${partId}:${row.partType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    parts.push({
      mfgWtId: typeId,
      manufacturer: row.manufacturer,
      weaponType: row.weaponType,
      partId,
      partType: row.partType,
      string: row.spawnCode || row.name || partId,
      stat: row.description || row.name || "",
    });
  }

  // ── Elemental parts ──
  for (const row of allRows) {
    if (row.category !== "Element") continue;
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;

    elemental.push({
      elementalId: typeId,
      partId,
      stat: row.name || row.description || `Element ${partId}`,
    });
  }

  // ── Non-weapon parts for cross-insert (shields, grenades, class mods, etc.) ──
  for (const row of allRows) {
    const mappedType = CATEGORY_TO_WEAPON_TYPE[row.category];
    if (!mappedType) continue;

    const { typeId, partId } = parseCode(row.code);
    if (!typeId || !partId) continue;

    const key = `${typeId}:${partId}:${row.partType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    parts.push({
      mfgWtId: typeId,
      manufacturer: row.manufacturer || mappedType,
      weaponType: mappedType,
      partId,
      partType: row.partType || `${mappedType} Part`,
      string: row.spawnCode || row.name || partId,
      stat: row.description || row.name || "",
    });
  }

  cached = { parts, elemental };
  return cached;
}
