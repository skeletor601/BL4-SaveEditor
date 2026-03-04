import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseCsv } from "./csvParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function getPath(relative: string): string {
  return join(repoRoot, relative);
}

function readCsv(path: string): { headers: string[]; rows: Record<string, string>[] } {
  const content = readFileSync(path, "utf-8");
  return parseCsv(content);
}

export type ItemTypeKey = "grenade" | "shield" | "repkit" | "heavy";

export interface ItemEditPartRow {
  typeKey: ItemTypeKey;
  /** Type/group ID for this part (main perk ID or manufacturer ID). */
  typeId: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

export interface ItemEditData {
  parts: ItemEditPartRow[];
}

type ItemCsvConfig = {
  key: ItemTypeKey;
  mainPath: string;
  mfgPath: string;
  mainIdCol: string;
};

/** Master list CSVs (same format: Type ID, ID, Name, Part String, Stats, Effects). When present, used instead of main_perk + manufacturer CSVs. */
const MASTER_LIST_CONFIG: Record<ItemTypeKey, { envVar: string; relPath: string }> = {
  grenade: {
    envVar: "GRENADE_MASTER_LIST_CSV",
    relPath: "grenade/Borderlands 4 Item Parts Master List - Grenades.csv",
  },
  shield: {
    envVar: "SHIELD_MASTER_LIST_CSV",
    relPath: "shield/Borderlands 4 Item Parts Master List - Shields.csv",
  },
  repkit: {
    envVar: "REPKIT_MASTER_LIST_CSV",
    relPath: "repkit/Borderlands 4 Item Parts Master List - Repkits.csv",
  },
  heavy: {
    envVar: "HEAVY_MASTER_LIST_CSV",
    relPath: "heavy/Borderlands 4 Item Parts Master List - Heavy.csv",
  },
};

function getMasterListPath(key: ItemTypeKey): string | null {
  const cfg = MASTER_LIST_CONFIG[key];
  const envPath = process.env[cfg.envVar];
  if (envPath && existsSync(envPath)) return envPath;
  const repoPath = getPath(cfg.relPath);
  return existsSync(repoPath) ? repoPath : null;
}

function loadPartsFromMasterList(key: ItemTypeKey): ItemEditPartRow[] {
  const path = getMasterListPath(key);
  if (!path) return [];
  const parts: ItemEditPartRow[] = [];
  const { rows } = readCsv(path);
  for (const r of rows) {
    const typeId = String(r["Type ID"] ?? "").trim();
    const partId = String(r["ID"] ?? "").trim();
    if (!typeId || !partId) continue;
    const partType = String(r["Name"] ?? "").trim() || "Perk";
    const partString = String(r["Part String"] ?? "").trim();
    const stat = String(r["Stats"] ?? r["Effects"] ?? "").trim();
    parts.push({
      typeKey: key,
      typeId,
      partId,
      partType,
      string: partString,
      stat,
    });
  }
  return parts;
}

const ITEM_CSV_CONFIGS: ItemCsvConfig[] = [
  {
    key: "grenade",
    mainPath: "grenade/grenade_main_perk",
    mfgPath: "grenade/manufacturer_rarity_perk",
    mainIdCol: "Grenade_perk_main_ID",
  },
  {
    key: "shield",
    mainPath: "shield/shield_main_perk",
    mfgPath: "shield/manufacturer_perk",
    mainIdCol: "Shield_perk_main_ID",
  },
  {
    key: "repkit",
    mainPath: "repkit/repkit_main_perk",
    mfgPath: "repkit/repkit_manufacturer_perk",
    mainIdCol: "Repkit_perk_main_ID",
  },
  {
    key: "heavy",
    mainPath: "heavy/heavy_main_perk",
    mfgPath: "heavy/heavy_manufacturer_perk",
    mainIdCol: "Heavy_perk_main_ID",
  },
];

function loadItemPartsForConfig(cfg: ItemCsvConfig): ItemEditPartRow[] {
  const parts: ItemEditPartRow[] = [];

  const mainBase = cfg.mainPath;
  const mfgBase = cfg.mfgPath;

  const mainEn = getPath(`${mainBase}_EN.csv`);
  const mainPath = existsSync(mainEn) ? mainEn : getPath(`${mainBase}.csv`);

  const mfgEn = getPath(`${mfgBase}_EN.csv`);
  const mfgPath = existsSync(mfgEn) ? mfgEn : getPath(`${mfgBase}.csv`);

  if (!existsSync(mainPath) && !existsSync(mfgPath)) return parts;

  if (existsSync(mainPath)) {
    const { rows } = readCsv(mainPath);
    for (const r of rows) {
      const typeId = String(r[cfg.mainIdCol] ?? "").trim();
      const partId = String(r["Part_ID"] ?? "").trim();
      if (!typeId || !partId) continue;
      const partType = String(r["Part_type"] ?? "").trim() || "Perk";
      const stat = String(r["Stat"] ?? "").trim();
      const stringVal =
        String(r["String"] ?? "").trim() ||
        (String(r["Description"] ?? "").trim() || "");
      parts.push({
        typeKey: cfg.key,
        typeId,
        partId,
        partType,
        string: stringVal,
        stat,
      });
    }
  }

  if (existsSync(mfgPath)) {
    const { rows } = readCsv(mfgPath);
    for (const r of rows) {
      const typeId = String(r["Manufacturer ID"] ?? "").trim();
      const partId = String(r["Part_ID"] ?? "").trim();
      if (!typeId || !partId) continue;
      const partType = String(r["Part_type"] ?? "").trim() || "Perk";
      const stat = String(r["Stat"] ?? "").trim();
      const stringVal =
        String(r["String"] ?? "").trim() ||
        (String(r["Description"] ?? "").trim() || "");
      parts.push({
        typeKey: cfg.key,
        typeId,
        partId,
        partType,
        string: stringVal,
        stat,
      });
    }
  }

  return parts;
}

let cached: ItemEditData | null = null;

export function getItemEditData(): ItemEditData {
  if (cached) return cached;
  const parts: ItemEditPartRow[] = [];
  const keys: ItemTypeKey[] = ["grenade", "shield", "repkit", "heavy"];
  for (const key of keys) {
    if (getMasterListPath(key)) {
      parts.push(...loadPartsFromMasterList(key));
    } else {
      const cfg = ITEM_CSV_CONFIGS.find((c) => c.key === key);
      if (cfg) parts.push(...loadItemPartsForConfig(cfg));
    }
  }
  cached = { parts };
  return cached;
}

