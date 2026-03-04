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

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

export interface EnhancementMfgPerk {
  index: number;
  name: string;
}

export interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: EnhancementMfgPerk[];
  rarities: Record<string, number>;
}

export interface Enhancement247Perk {
  code: number;
  name: string;
}

export interface EnhancementBuilderData {
  manufacturers: Record<string, EnhancementManufacturer>;
  /** Rarity name -> 247 rarity ID */
  rarityMap247: Record<string, number>;
  /** Builder 247 list (secondary_247) */
  secondary247: Enhancement247Perk[];
}

let cached: EnhancementBuilderData | null = null;

export function getEnhancementBuilderData(): EnhancementBuilderData {
  if (cached) return cached;

  const mfgPath = getPath("enhancement/Enhancement_manufacturers.csv");
  const perkPath = getPath("enhancement/Enhancement_perk.csv");
  const rarityPath = getPath("enhancement/Enhancement_rarity.csv");

  const manufacturers: Record<string, EnhancementManufacturer> = {};
  const rarityMap247: Record<string, number> = {};
  const secondary247: Enhancement247Perk[] = [];

  if (existsSync(mfgPath)) {
    const { rows } = readCsv(mfgPath);
    for (const r of rows) {
      const mfgName = trim(r["manufacturers_name"]);
      const mfgId = parseInt(trim(r["manufacturers_ID"]), 10);
      const perkId = parseInt(trim(r["perk_ID"]), 10);
      const perkName = trim(r["perk_name_EN"]);
      if (!mfgName || !Number.isFinite(mfgId)) continue;
      if (!manufacturers[mfgName]) {
        manufacturers[mfgName] = {
          code: mfgId,
          name: mfgName,
          perks: [],
          rarities: {},
        };
      }
      if (Number.isFinite(perkId) && perkName) {
        manufacturers[mfgName].perks.push({ index: perkId, name: perkName });
      }
    }
  }

  if (existsSync(rarityPath)) {
    const { rows } = readCsv(rarityPath);
    for (const r of rows) {
      const mfgId = parseInt(trim(r["manufacturers_ID"]), 10);
      const mfgName = trim(r["manufacturers_name"]);
      const rarityId = parseInt(trim(r["rarity_ID"]), 10);
      const rarityName = trim(r["rarity"]);
      if (!Number.isFinite(rarityId) || !rarityName) continue;
      if (mfgId === 247) {
        rarityMap247[rarityName] = rarityId;
      } else if (mfgName && manufacturers[mfgName]) {
        manufacturers[mfgName].rarities[rarityName] = rarityId;
      }
    }
  }

  if (existsSync(perkPath)) {
    const { rows } = readCsv(perkPath);
    for (const r of rows) {
      const code = parseInt(trim(r["perk_ID"]), 10);
      const name = trim(r["perk_name_EN"]);
      if (!Number.isFinite(code)) continue;
      secondary247.push({ code, name });
    }
  }

  cached = {
    manufacturers,
    rarityMap247,
    secondary247,
  };
  return cached;
}
