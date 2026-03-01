import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "data");

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
}

let partsCache: PartItem[] = [];
let manifestCache: PartsManifest = { datasets: [] };

function loadPartsJson(): PartItem[] {
  const path = join(root, "parts.json");
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw) as PartItem[] | { items: PartItem[] };
      const list = Array.isArray(data) ? data : (data as { items: PartItem[] }).items ?? [];
      partsCache = list;
      return list;
    } catch {
      // ignore
    }
  }
  if (partsCache.length === 0) {
    partsCache = getSampleParts();
  }
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
  const path = join(root, "parts.json");
  const updatedAt = existsSync(path)
    ? new Date(statSync(path).mtime).toISOString()
    : new Date().toISOString();
  manifestCache = {
    datasets: [
      { name: "parts", version: "1.0.0", hash: "dev", updatedAt },
    ],
  };
  return manifestCache;
}

export function searchParts(
  query: string,
  category?: string,
  limit = 100
): PartItem[] {
  const list = loadPartsJson();
  const q = query.trim().toLowerCase();
  let out = list;
  if (q) {
    out = list.filter(
      (p) =>
        p.partName.toLowerCase().includes(q) ||
        p.itemType.toLowerCase().includes(q) ||
        (p.effect && p.effect.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
    );
  }
  if (category && category !== "All") {
    out = out.filter((p) => (p.category ?? "").toLowerCase() === category.toLowerCase());
  }
  return out.slice(0, limit);
}

export function setPartsData(items: PartItem[]): void {
  partsCache = items;
}
