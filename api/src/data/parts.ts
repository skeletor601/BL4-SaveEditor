import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** api/data (current deploy convention) */
const dataRoot = join(__dirname, "..", "..", "data");
/** Repo root: one level up from api/ (so master_search/db/universal_parts_db.json is reachable when whole repo is deployed) */
const repoRoot = join(__dirname, "..", "..", "..");
const universalPathInRepo = join(repoRoot, "master_search", "db", "universal_parts_db.json");
const universalPathInData = join(dataRoot, "universal_parts_db.json");
const partsJsonPath = join(dataRoot, "parts.json");

export interface DatasetMeta {
  name: string;
  version: string;
  hash: string;
  updatedAt: string;
}

export interface PartsManifest {
  datasets: DatasetMeta[];
}

export interface PartItem {
  code: string;
  itemType: string;
  rarity?: string;
  partName: string;
  effect?: string;
  category?: string;
  manufacturer?: string;
  partType?: string;
  weaponType?: string;
  id?: number;
}

let partsCache: PartItem[] = [];
let manifestCache: PartsManifest = { datasets: [] };

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeToPartItem(raw: Record<string, unknown>): PartItem {
  return {
    code: pickStr(raw, "code", "Code"),
    itemType: pickStr(raw, "itemType", "item_type", "Item Type", "Model Name", "model_name", "Weapon Type"),
    partName: pickStr(raw, "Canonical Name", "partName", "part_name", "Part Name", "String", "Name"),
    effect: pickStr(raw, "effect", "Effect", "Stats (Level 50, Common)", "stats", "Stats", "Description", "Search Text"),
    category: pickStr(raw, "category", "Category", "General Category") || undefined,
    rarity: pickStr(raw, "canonicalRarity", "Canonical Rarity", "rarity", "Rarity") || undefined,
    manufacturer: pickStr(raw, "canonicalManufacturer", "manufacturer", "Manufacturer") || undefined,
    partType: pickStr(raw, "canonicalPartType", "Specific Category", "partType", "part_type", "Part Type") || undefined,
    weaponType: pickStr(raw, "weaponType", "Weapon Type", "weapon_type") || undefined,
    id: typeof raw.id === "number" ? raw.id : typeof raw.ID === "number" ? raw.ID : undefined,
  };
}

function loadPartsJson(): PartItem[] {
  if (partsCache.length > 0) return partsCache;

  const pathsToTry: { path: string; getList: (data: unknown) => Record<string, unknown>[] }[] = [
    {
      path: universalPathInRepo,
      getList: (data) => {
        const rows = (data as { rows?: unknown[] }).rows;
        if (!Array.isArray(rows)) return [];
        return rows
          .filter((x) => x != null && typeof x === "object")
          .map((x) => x as Record<string, unknown>);
      },
    },
    {
      path: universalPathInData,
      getList: (data) => {
        const rows = (data as { rows?: unknown[] }).rows;
        if (!Array.isArray(rows)) return [];
        return rows
          .filter((x) => x != null && typeof x === "object")
          .map((x) => x as Record<string, unknown>);
      },
    },
    {
      path: partsJsonPath,
      getList: (data) => {
        if (Array.isArray(data)) {
          return (data as unknown[])
            .filter((x) => x != null && typeof x === "object")
            .map((x) => x as Record<string, unknown>);
        }
        const items = (data as { items?: unknown[] }).items;
        if (!Array.isArray(items)) return [];
        return items
          .filter((x) => x != null && typeof x === "object")
          .map((x) => x as Record<string, unknown>);
      },
    },
  ];

  for (const { path: filePath, getList } of pathsToTry) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as unknown;
      const list = getList(data);
      if (!Array.isArray(list) || list.length === 0) continue;
      const normalized = list
        .filter((x) => x != null && typeof x === "object")
        .map((x) => normalizeToPartItem(x as Record<string, unknown>))
        .filter((p) => p.partName || p.code || p.itemType);
      partsCache = normalized;
      console.log(`[parts] Loaded ${partsCache.length} rows from ${filePath}`);
      return normalized;
    } catch (e) {
      console.warn(`[parts] Failed to load ${filePath}:`, e);
    }
  }

  partsCache = getSampleParts();
  console.log(`[parts] Using fallback sample dataset: ${partsCache.length} rows`);
  return partsCache;
}

function getSampleParts(): PartItem[] {
  return [
    { code: "{284:1}", itemType: "Sure Shot", rarity: "Legendary", partName: "ATL_Enhancement.part_core_atl_sureshot", effect: "Projectiles from Guns with Atlas-licensed parts automatically attach a Tracker Dart every 25s", category: "Enhancement" },
    { code: "{296:11}", itemType: "Trauma Bond", rarity: "Legendary", partName: "BOR_Enhancement.part_core_bor_traumabond", effect: "After Reloading an empty Magazine, Guns with Ripper-licensed parts have a 30% Chance to increase the next Magazine's Fire Rate +100%", category: "Enhancement" },
    { code: "{296:12}", itemType: "Short Circuit", rarity: "Legendary", partName: "BOR_Enhancement.part_core_bor_shortcircuit", effect: "Short Circuit effect description", category: "Enhancement" },
  ];
}

export function getManifest(): PartsManifest {
  const pathToUse = existsSync(universalPathInRepo)
    ? universalPathInRepo
    : existsSync(universalPathInData)
      ? universalPathInData
      : partsJsonPath;
  const updatedAt = existsSync(pathToUse)
    ? new Date(statSync(pathToUse).mtime).toISOString()
    : new Date().toISOString();
  manifestCache = {
    datasets: [
      { name: "parts", version: "1.0.0", hash: "dev", updatedAt },
    ],
  };
  return manifestCache;
}

/** Returns the full dataset with no limit (for client-side search/filter). */
export function getAllParts(): PartItem[] {
  return loadPartsJson();
}

/** Normalize code to {x:y} or {x} form for lookup.
 * Accepts common user input variants like:
 *  - "{285:1}"
 *  - "285:1"
 *  - "285,1"  (comma instead of colon, as often typed)
 *  - "285"    (no variant index)
 */
function normalizeCode(code: string): string {
  const original = (code || "").trim();
  if (!original) return "";
  // Treat commas like colons so inputs like "285,1" work the same as "285:1"
  const s = original.replace(/,/g, ":");
  if (/^\{\d+:\d+\}$/.test(s) || /^\{\d+\}$/.test(s)) return s;
  const match = s.match(/\{(\d+)(?::(\d+))?\}/);
  if (match) return match[2] != null ? `{${match[1]}:${match[2]}}` : `{${match[1]}}`;
  // Allow "285:1" or "285" without braces
  const bare = s.match(/^(\d+)(?::(\d+))?$/);
  if (bare) return bare[2] != null ? `{${bare[1]}:${bare[2]}}` : `{${bare[1]}}`;
  return s;
}

/** Look up a single part by code (e.g. "{291:1}"). For item/weapon edit fallback when CSV has no row. */
export function getPartByCode(code: string): PartItem | null {
  const norm = normalizeCode(code);
  if (!norm) return null;
  const list = loadPartsJson();
  return list.find((p) => p.code && normalizeCode(p.code) === norm) ?? null;
}

/** Look up multiple parts by code; returns record code -> PartItem (or null if not found). */
export function getPartsByCodes(codes: string[]): Record<string, PartItem | null> {
  const list = loadPartsJson();
  const byCode = new Map<string, PartItem>();
  for (const p of list) {
    if (p.code) {
      const n = normalizeCode(p.code);
      if (!byCode.has(n)) byCode.set(n, p);
    }
  }
  const out: Record<string, PartItem | null> = {};
  for (const code of codes) {
    const n = normalizeCode(code);
    out[code] = byCode.get(n) ?? null;
  }
  return out;
}

export function searchParts(
  query: string,
  category?: string,
  limit = 10000
): PartItem[] {
  const list = loadPartsJson();
  // Strip trailing/leading pipes and trim so "285:1|" or "|285:1" still matches codes
  const rawQ = (query || "").trim().replace(/\|+$/g, "").replace(/^\|+/g, "").trim();
  const q = rawQ.toLowerCase();
  let out = list;
  if (q) {
    const codeNorm = normalizeCode(rawQ);
    const exactCodeMatch = codeNorm && /^\{\d+(:\d+)?\}$/.test(codeNorm);
    // Build searchable text: normalize underscores/dots to spaces so "triple bypass" matches "TripleBypass" or "triple_bypass"
    const searchable = (p: PartItem) =>
      [
        p.partName,
        p.itemType,
        p.effect,
        p.partType,
        p.manufacturer,
        p.weaponType,
        p.category,
        p.rarity,
        p.code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[_.]/g, " ");
    // Multi-word: require every word to appear (so "triple bypass" matches "TripleBypass" / "ord_..._TripleBypass")
    const keywords = q.split(/\s+/).filter(Boolean);
    out = list.filter((p) => {
      // Exact code match: "285:1" or "{285:1}" matches row with code "{285:1}"
      if (exactCodeMatch && p.code && normalizeCode(p.code) === codeNorm) return true;
      const text = searchable(p);
      if (keywords.length > 1) {
        return keywords.every((kw) => text.includes(kw));
      }
      return (
        text.includes(q) ||
        p.partName.toLowerCase().includes(q) ||
        p.itemType.toLowerCase().includes(q) ||
        (p.effect && p.effect.toLowerCase().includes(q)) ||
        (p.partType && p.partType.toLowerCase().includes(q)) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(q)) ||
        (p.weaponType && p.weaponType.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
      );
    });
  }
  if (category && category !== "All") {
    const cat = category.toLowerCase();
    // Only restrict rows that have an explicit category; uncategorized rows remain visible
    // so codes from master lists without Category still show up under filtered views.
    out = out.filter((p) => {
      if (!p.category) return true;
      return p.category.toLowerCase() === cat;
    });
  }
  // When query looks like a code, put exact code matches first
  if (q && normalizeCode(rawQ) && /^\{\d+(:\d+)?\}$/.test(normalizeCode(rawQ))) {
    const codeNorm = normalizeCode(rawQ);
    out = [...out].sort((a, b) => {
      const aExact = a.code && normalizeCode(a.code) === codeNorm ? 1 : 0;
      const bExact = b.code && normalizeCode(b.code) === codeNorm ? 1 : 0;
      return bExact - aExact;
    });
  }
  return out.slice(0, limit);
}

export function setPartsData(items: PartItem[]): void {
  partsCache = items;
}
