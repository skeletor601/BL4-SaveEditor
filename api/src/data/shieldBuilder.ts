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

/** Shield manufacturer IDs (same order as desktop). */
const SHIELD_MFG_IDS = [279, 283, 287, 293, 300, 306, 312, 321] as const;

const SHIELD_MFG_NAMES: Record<number, string> = {
  279: "Maliwan",
  283: "Vladof",
  287: "Tediore",
  293: "Order",
  300: "Ripper",
  306: "Jakobs",
  312: "Daedalus",
  321: "Torgue",
};

/** Matches desktop `mfg_type_map_base` in qt_shield_editor_tab.py */
const SHIELD_MFG_TYPE_BY_ID: Record<number, "Energy" | "Armor"> = {
  279: "Energy",
  283: "Armor",
  287: "Armor",
  293: "Energy",
  300: "Energy",
  306: "Armor",
  312: "Energy",
  321: "Armor",
};

export interface ShieldBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

export interface ShieldBuilderLegendaryPart extends ShieldBuilderPart {
  mfgId: number;
  mfgName: string;
}

export interface ShieldBuilderRarity {
  id: number;
  label: string;
}

export interface ShieldBuilderData {
  mfgs: { id: number; name: string }[];
  mfgTypeById: Record<number, "Energy" | "Armor">;
  raritiesByMfg: Record<number, ShieldBuilderRarity[]>;
  /** Elemental resistance radio options. */
  element: ShieldBuilderPart[];
  /** Firmware radio options. */
  firmware: ShieldBuilderPart[];
  /** Universal perk list (type 246). */
  universalPerks: ShieldBuilderPart[];
  /** Energy perk list (type 248). */
  energyPerks: ShieldBuilderPart[];
  /** Armor perk list (type 237). */
  armorPerks: ShieldBuilderPart[];
  /** Legendary perks from manufacturer CSV. */
  legendaryPerks: ShieldBuilderLegendaryPart[];
  /** Model part per manufacturer (used when no legendary selected). */
  modelsByMfg: Record<number, number | null>;
}

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

let cached: ShieldBuilderData | null = null;

export function getShieldBuilderData(): ShieldBuilderData {
  if (cached) return cached;

  const mainBase = "shield/shield_main_perk";
  const mfgBase = "shield/manufacturer_perk";
  const mainEn = getPath(`${mainBase}_EN.csv`);
  const mainPath = existsSync(mainEn) ? mainEn : getPath(`${mainBase}.csv`);
  const mfgEn = getPath(`${mfgBase}_EN.csv`);
  const mfgPath = existsSync(mfgEn) ? mfgEn : getPath(`${mfgBase}.csv`);

  const mfgs = SHIELD_MFG_IDS.map((id) => ({
    id,
    name: SHIELD_MFG_NAMES[id] ?? `Manufacturer ${id}`,
  }));

  const raritiesByMfg: Record<number, ShieldBuilderRarity[]> = {};
  const legendaryPerks: ShieldBuilderLegendaryPart[] = [];
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
          mfgName: SHIELD_MFG_NAMES[mfgId] ?? `Mfg ${mfgId}`,
          stat,
          ...(desc ? { description: desc } : {}),
        });
      } else if (partType === "Model") {
        modelsByMfg[mfgId] = partId;
      }
    }
  }

  const element: ShieldBuilderPart[] = [];
  const firmware: ShieldBuilderPart[] = [];
  const universalPerks: ShieldBuilderPart[] = [];
  const energyPerks: ShieldBuilderPart[] = [];
  const armorPerks: ShieldBuilderPart[] = [];

  if (existsSync(mainPath)) {
    const { rows } = readCsv(mainPath);
    for (const r of rows) {
      const mainId = parseInt(trim(r["Shield_perk_main_ID"]), 10);
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["Stat"]);
      const desc = trim(r["Description"]);

      if (mainId === 246) {
        if (partType === "Elemental Resistance") {
          element.push({ partId, stat, ...(desc ? { description: desc } : {}) });
        } else if (partType === "Firmware") {
          firmware.push({ partId, stat, ...(desc ? { description: desc } : {}) });
        } else if (partType === "Perk") {
          universalPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
        }
      } else if (mainId === 248 && partType === "Perk") {
        energyPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      } else if (mainId === 237 && partType === "Perk") {
        armorPerks.push({ partId, stat, ...(desc ? { description: desc } : {}) });
      }
    }
  }

  for (const id of SHIELD_MFG_IDS) {
    if (!(id in modelsByMfg)) modelsByMfg[id] = null;
  }

  cached = {
    mfgs,
    mfgTypeById: SHIELD_MFG_TYPE_BY_ID,
    raritiesByMfg,
    element,
    firmware,
    universalPerks,
    energyPerks,
    armorPerks,
    legendaryPerks,
    modelsByMfg,
  };
  return cached;
}

