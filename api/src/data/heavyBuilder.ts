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

/** Heavy manufacturer IDs (same order as desktop). */
const HEAVY_MFG_IDS = [282, 273, 275, 289] as const;

const HEAVY_MFG_NAMES: Record<number, string> = {
  282: "Vladof",
  273: "Torgue",
  275: "Ripper",
  289: "Maliwan",
};

export interface HeavyBuilderPart {
  partId: number;
  stat: string;
  description?: string;
  /** Manufacturer ID for parts that are manufacturer-specific (barrel/body/body acc, etc.). */
  mfgId?: number;
}

export interface HeavyBuilderRarity {
  id: number;
  label: string;
}

export interface HeavyBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, HeavyBuilderRarity[]>;
  /** Barrel radio options. */
  barrel: HeavyBuilderPart[];
  /** Element radio options. */
  element: HeavyBuilderPart[];
  /** Firmware radio options. */
  firmware: HeavyBuilderPart[];
  /** Barrel accessory list (dual list with multiplier). */
  barrelAccPerks: HeavyBuilderPart[];
  /** Body accessory list (dual list with multiplier). */
  bodyAccPerks: HeavyBuilderPart[];
  /** Body part per manufacturer (always present). */
  bodiesByMfg: Record<number, number | null>;
}

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

let cached: HeavyBuilderData | null = null;

export function getHeavyBuilderData(): HeavyBuilderData {
  if (cached) return cached;

  const mainBase = "heavy/heavy_main_perk";
  const mfgBase = "heavy/heavy_manufacturer_perk";
  const mainEn = getPath(`${mainBase}_EN.csv`);
  const mainPath = existsSync(mainEn) ? mainEn : getPath(`${mainBase}.csv`);
  const mfgEn = getPath(`${mfgBase}_EN.csv`);
  const mfgPath = existsSync(mfgEn) ? mfgEn : getPath(`${mfgBase}.csv`);

  const mfgs = HEAVY_MFG_IDS.map((id) => ({
    id,
    name: HEAVY_MFG_NAMES[id] ?? `Manufacturer ${id}`,
  }));

  const raritiesByMfg: Record<number, HeavyBuilderRarity[]> = {};
  const bodiesByMfg: Record<number, number | null> = {};

  const barrel: HeavyBuilderPart[] = [];
  const barrelAccPerks: HeavyBuilderPart[] = [];
  const bodyAccPerks: HeavyBuilderPart[] = [];

  if (existsSync(mfgPath)) {
    const { rows } = readCsv(mfgPath);
    for (const r of rows) {
      const mfgId = parseInt(trim(r["Manufacturer ID"]), 10);
      if (!Number.isFinite(mfgId)) continue;
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["String"]) || trim(r["Stat"]);
      const desc = trim(r["Description"]);

      if (partType === "Rarity") {
        if (!raritiesByMfg[mfgId]) raritiesByMfg[mfgId] = [];
        raritiesByMfg[mfgId].push({
          id: partId,
          label: desc ? `${stat} - ${desc}` : (stat || desc),
        });
      } else if (partType === "Body") {
        bodiesByMfg[mfgId] = partId;
      } else if (partType === "Barrel") {
        barrel.push({ partId, stat, mfgId, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Barrel Accessory") {
        barrelAccPerks.push({ partId, stat, mfgId, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Body Accessory") {
        bodyAccPerks.push({ partId, stat, mfgId, ...(desc ? { description: desc } : {}) });
      }
    }
  }

  const element: HeavyBuilderPart[] = [];
  const firmware: HeavyBuilderPart[] = [];
  // bodyAccPerks are primarily defined in the manufacturer CSV; keep any extras from main CSV too.

  if (existsSync(mainPath)) {
    const { rows } = readCsv(mainPath);
    for (const r of rows) {
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["Stat"]);
      const desc = trim(r["Description"]);

      if (partType === "Element") {
        element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Firmware") {
        firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Body Accessory") {
        bodyAccPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      }
    }
  }

  // Merge in text from master heavy list (TSV) if present.
  const masterPath = getPath("heavy/Borderlands 4 Item Parts Master List - Heavy Weapons.tsv");
  if (existsSync(masterPath)) {
    const content = readFileSync(masterPath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const [header, ...rest] = lines;
    const cols = header.split("\t");
    const idx = (name: string) => cols.indexOf(name);
    const typeIdx = idx("Type ID");
    const idIdx = idx("ID");
    const statsIdx = idx("Stats");
    const effectsIdx = idx("Effects");
    const commentsIdx = idx("Comments");

    const masterByKey = new Map<string, { stat: string; desc: string }>();
    for (const line of rest) {
      const cells = line.split("\t");
      const typeIdStr = cells[typeIdx] ?? "";
      const idStr = cells[idIdx] ?? "";
      const typeId = parseInt(trim(typeIdStr), 10);
      const id = parseInt(trim(idStr), 10);
      if (!Number.isFinite(typeId) || !Number.isFinite(id)) continue;
      const stats = trim(cells[statsIdx] ?? "");
      const effects = trim(cells[effectsIdx] ?? "");
      const statText = stats || effects;
      const desc = trim(cells[commentsIdx] ?? "");
      masterByKey.set(`${typeId}:${id}`, { stat: statText, desc });
    }

    const applyMaster = (typeId: number, list: HeavyBuilderPart[]) => {
      for (const p of list) {
        const m = masterByKey.get(`${typeId}:${p.partId}`);
        if (!m) continue;
        if (m.stat) p.stat = m.stat;
        if (m.desc) p.description = m.desc;
      }
    };

    // Type IDs: firmware/element/universal use 244/1 etc. Here we only have per-part IDs so we map by known IDs:
    applyMaster(244, firmware);
    applyMaster(1, element);
    // Barrel/barrel/body acc use manufacturer & type IDs in the TSV; we skip merging for those to keep things simple.
  }

  for (const id of HEAVY_MFG_IDS) {
    if (!(id in bodiesByMfg)) bodiesByMfg[id] = null;
  }

  cached = {
    mfgs,
    raritiesByMfg,
    barrel,
    element,
    firmware,
    barrelAccPerks,
    bodyAccPerks,
    bodiesByMfg,
  };
  return cached;
}

