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

/** Repkit manufacturer IDs (same order as desktop). */
const REPKIT_MFG_IDS = [277, 265, 266, 285, 274, 290, 261, 269] as const;

const REPKIT_MFG_NAMES: Record<number, string> = {
  277: "Daedalus",
  265: "Jakobs",
  266: "Maliwan",
  285: "Order",
  274: "Ripper",
  290: "Tediore",
  261: "Torgue",
  269: "Vladof",
};

export interface RepkitBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

export interface RepkitBuilderLegendaryPart extends RepkitBuilderPart {
  mfgId: number;
  mfgName: string;
}

export interface RepkitBuilderRarity {
  id: number;
  label: string;
}

export interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  /** Prefix (\"Perfix\" in CSV) options (single-select radio). */
  prefix: RepkitBuilderPart[];
  /** Firmware options (single-select radio). */
  firmware: RepkitBuilderPart[];
  /** Resistance / Immunity options (single-select radio). */
  resistance: RepkitBuilderPart[];
  /** Universal perks list (dual list with multiplier). */
  universalPerks: RepkitBuilderPart[];
  /** Legendary perks from manufacturer CSV. */
  legendaryPerks: RepkitBuilderLegendaryPart[];
  /** Rarity + model info per manufacturer. */
  modelsByMfg: Record<number, number | null>;
}

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

let cached: RepkitBuilderData | null = null;

export function getRepkitBuilderData(): RepkitBuilderData {
  if (cached) return cached;

  const mainBase = "repkit/repkit_main_perk";
  const mfgBase = "repkit/repkit_manufacturer_perk";
  const mainEn = getPath(`${mainBase}_EN.csv`);
  const mainPath = existsSync(mainEn) ? mainEn : getPath(`${mainBase}.csv`);
  const mfgEn = getPath(`${mfgBase}_EN.csv`);
  const mfgPath = existsSync(mfgEn) ? mfgEn : getPath(`${mfgBase}.csv`);

  const mfgs = REPKIT_MFG_IDS.map((id) => ({
    id,
    name: REPKIT_MFG_NAMES[id] ?? `Manufacturer ${id}`,
  }));

  const raritiesByMfg: Record<number, RepkitBuilderRarity[]> = {};
  const legendaryPerks: RepkitBuilderLegendaryPart[] = [];
  const modelsByMfg: Record<number, number | null> = {};

  if (existsSync(mfgPath)) {
    const { rows } = readCsv(mfgPath);
    for (const r of rows) {
      const mfgId = parseInt(trim(r["Manufacturer ID"]), 10);
      if (!Number.isFinite(mfgId)) continue;
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["Stat"]);
      const desc = trim(r["Description"]);

      if (partType === "Rarity") {
        if (!raritiesByMfg[mfgId]) raritiesByMfg[mfgId] = [];
        raritiesByMfg[mfgId].push({
          id: partId,
          label: desc ? `${stat} - ${desc}` : stat,
        });
      } else if (partType === "Legendary Perk") {
        legendaryPerks.push({
          partId,
          mfgId,
          mfgName: REPKIT_MFG_NAMES[mfgId] ?? `Mfg ${mfgId}`,
          stat,
          ...(desc ? { description: desc } : {}),
        });
      } else if (partType === "Model") {
        modelsByMfg[mfgId] = partId;
      }
    }
  }

  const prefix: RepkitBuilderPart[] = [];
  const firmware: RepkitBuilderPart[] = [];
  const resistance: RepkitBuilderPart[] = [];
  const universalPerks: RepkitBuilderPart[] = [];

  if (existsSync(mainPath)) {
    const { rows } = readCsv(mainPath);
    for (const r of rows) {
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["Stat"]);
      const desc = trim(r["Description"]);

      // Prefix group (typo \"Perfix\" is used in some datasets).
      if (partType === "Perfix" || partType === "Prefix") {
        prefix.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Firmware") {
        firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (partType === "Resistance" || partType === "Immunity") {
        resistance.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else {
        // Everything else (Perk, Splat, Nova, Part, etc.) goes into the universal list.
        universalPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      }
    }
  }

  // Merge in additional stat/description text from master list if present.
  const masterPath = getPath("repkit/Borderlands 4 Item Parts Master List - Repkits.csv");
  if (existsSync(masterPath)) {
    const { rows: masterRows } = readCsv(masterPath);
    const masterById = new Map<number, { stat: string; desc: string }>();
    for (const r of masterRows) {
      const id = parseInt(trim(r["ID"]), 10);
      if (!Number.isFinite(id)) continue;
      const stats = trim(r["Stats"]);
      const effects = trim(r["Effects"]);
      const statText = stats || effects;
      const desc = trim(r["Comments"]);
      masterById.set(id, { stat: statText, desc });
    }

    const applyMaster = (list: RepkitBuilderPart[]) => {
      for (const p of list) {
        const m = masterById.get(p.partId);
        if (!m) continue;
        if (m.stat) p.stat = m.stat;
        if (m.desc) p.description = m.desc;
      }
    };

    applyMaster(prefix);
    applyMaster(firmware);
    applyMaster(resistance);
    applyMaster(universalPerks);
  }

  // Ensure all known mfgs have an entry in modelsByMfg, even if null.
  for (const id of REPKIT_MFG_IDS) {
    if (!(id in modelsByMfg)) modelsByMfg[id] = null;
  }

  cached = {
    mfgs,
    raritiesByMfg,
    prefix,
    firmware,
    resistance,
    universalPerks,
    legendaryPerks,
    modelsByMfg,
  };
  return cached;
}

