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

/** Grenade manufacturer IDs (same order as desktop). */
const GRENADE_MFG_IDS = [263, 267, 270, 272, 278, 291, 298, 311] as const;

const MFG_NAMES: Record<number, string> = {
  263: "Maliwan",
  267: "Jakobs",
  270: "Daedalus",
  272: "Order",
  278: "Ripper",
  291: "Vladof",
  298: "Torgue",
  311: "Tediore",
};

export interface GrenadeBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}

export interface GrenadeBuilderLegendaryPart extends GrenadeBuilderPart {
  mfgId: number;
  mfgName: string;
}

export interface GrenadeBuilderRarity {
  id: number;
  label: string;
}

export interface GrenadeBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, GrenadeBuilderRarity[]>;
  element: GrenadeBuilderPart[];
  firmware: GrenadeBuilderPart[];
  universalPerks: GrenadeBuilderPart[];
  legendaryPerks: GrenadeBuilderLegendaryPart[];
  mfgPerks: Record<number, GrenadeBuilderPart[]>;
}

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

let cached: GrenadeBuilderData | null = null;

export function getGrenadeBuilderData(): GrenadeBuilderData {
  if (cached) return cached;

  const mainBase = "grenade/grenade_main_perk";
  const mfgBase = "grenade/manufacturer_rarity_perk";
  const mainEn = getPath(`${mainBase}_EN.csv`);
  const mainPath = existsSync(mainEn) ? mainEn : getPath(`${mainBase}.csv`);
  const mfgEn = getPath(`${mfgBase}_EN.csv`);
  const mfgPath = existsSync(mfgEn) ? mfgEn : getPath(`${mfgBase}.csv`);

  const mfgs = GRENADE_MFG_IDS.map((id) => ({
    id,
    name: MFG_NAMES[id] ?? `Manufacturer ${id}`,
  }));

  const raritiesByMfg: Record<number, GrenadeBuilderRarity[]> = {};
  const mfgPerks: Record<number, GrenadeBuilderPart[]> = {};
  const legendaryPerks: GrenadeBuilderLegendaryPart[] = [];

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
      } else if (partType === "Perk") {
        if (!mfgPerks[mfgId]) mfgPerks[mfgId] = [];
        mfgPerks[mfgId].push({
          partId,
          stat,
          ...(desc ? { description: desc } : {}),
        });
      } else if (partType === "Legendary Perk") {
        legendaryPerks.push({
          partId,
          mfgId,
          mfgName: MFG_NAMES[mfgId] ?? `Mfg ${mfgId}`,
          stat,
          ...(desc ? { description: desc } : {}),
        });
      }
    }
  }

  const element: GrenadeBuilderPart[] = [];
  const firmware: GrenadeBuilderPart[] = [];
  const universalPerks: GrenadeBuilderPart[] = [];

  if (existsSync(mainPath)) {
    const { rows } = readCsv(mainPath);
    for (const r of rows) {
      const partId = parseInt(trim(r["Part_ID"]), 10);
      if (!Number.isFinite(partId)) continue;
      const partType = trim(r["Part_type"]);
      const stat = trim(r["Stat"]);

      if (partType === "Element") {
        element.push({ partId, stat });
      } else if (partType === "Firmware") {
        firmware.push({ partId, stat });
      } else if (partType === "Perk") {
        universalPerks.push({ partId, stat });
      }
    }
  }

  cached = {
    mfgs,
    raritiesByMfg,
    element,
    firmware,
    universalPerks,
    legendaryPerks,
    mfgPerks,
  };
  return cached;
}
