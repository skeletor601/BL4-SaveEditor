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

/** Class IDs matching desktop qt_class_mod_editor_tab.py */
export const CLASS_IDS: Record<string, number> = {
  Amon: 255,
  Harlowe: 259,
  Rafa: 256,
  Vex: 254,
};

export const CLASS_NAMES = ["Amon", "Harlowe", "Rafa", "Vex"] as const;

/** Per-class rarity part IDs for non-legendary (Common/Uncommon/Rare/Epic). */
const PER_CLASS_RARITIES: Record<string, Record<string, number>> = {
  Vex: { Common: 217, Uncommon: 218, Rare: 219, Epic: 220 },
  Rafa: { Common: 66, Uncommon: 67, Rare: 68, Epic: 69 },
  Harlowe: { Common: 224, Uncommon: 223, Rare: 222, Epic: 221 },
  Amon: { Common: 70, Uncommon: 69, Rare: 68, Epic: 67 },
};

export interface ClassModNameOption {
  nameCode: number;
  nameEN: string;
}

export interface ClassModSkill {
  skillNameEN: string;
  skillIds: number[]; // 1–5 IDs
}

export interface ClassModPerk {
  perkId: number;
  perkNameEN: string;
}

export interface ClassModBuilderData {
  classNames: string[];
  rarities: string[];
  /** (classId, rarity) -> names. rarity is "legendary" | "normal" */
  namesByClassRarity: Record<string, ClassModNameOption[]>;
  /** classId -> skills */
  skillsByClass: Record<string, ClassModSkill[]>;
  perks: ClassModPerk[];
  /** (classId, L_name_ID) -> item_card_ID for legendary rarity chunk */
  legendaryMap: Record<string, number>;
  /** (classId, rarity) -> rarity part ID for non-legendary */
  rarityCode: (classKey: string, rarityEn: string) => number | null;
}

let cached: ClassModBuilderData | null = null;

export function getClassModBuilderData(): ClassModBuilderData {
  if (cached) return cached;

  const namesPath = getPath("class_mods/Class_rarity_name.csv");
  const skillsPath = getPath("class_mods/Skills.csv");
  const perksPath = getPath("class_mods/Class_perk.csv");
  const legendaryMapPath = getPath("class_mods/Class_legendary_map.csv");

  const namesByClassRarity: Record<string, ClassModNameOption[]> = {};
  const skillsByClass: Record<string, ClassModSkill[]> = {};
  const legendaryMap: Record<string, number> = {};
  const perks: ClassModPerk[] = [];

  if (existsSync(namesPath)) {
    const { rows } = readCsv(namesPath);
    for (const r of rows) {
      const classId = trim(r["class_ID"]);
      const rarity = trim(r["rarity"]).toLowerCase(); // "legendary" | "normal"
      const nameCode = parseInt(trim(r["name_code"]), 10);
      const nameEN = trim(r["name_EN"]);
      if (!classId || !Number.isFinite(nameCode)) continue;
      const key = `${classId},${rarity}`;
      if (!namesByClassRarity[key]) namesByClassRarity[key] = [];
      namesByClassRarity[key].push({ nameCode, nameEN });
    }
  }

  if (existsSync(skillsPath)) {
    const { rows } = readCsv(skillsPath);
    for (const r of rows) {
      const classId = trim(r["class_ID"]);
      const skillNameEN = trim(r["skill_name_EN"]);
      const skillIds: number[] = [];
      for (let i = 1; i <= 5; i++) {
        const id = parseInt(trim(r[`skill_ID_${i}`]), 10);
        if (Number.isFinite(id)) skillIds.push(id);
      }
      if (!classId || !skillNameEN) continue;
      if (!skillsByClass[classId]) skillsByClass[classId] = [];
      skillsByClass[classId].push({ skillNameEN, skillIds });
    }
  }

  if (existsSync(perksPath)) {
    const { rows } = readCsv(perksPath);
    for (const r of rows) {
      const perkId = parseInt(trim(r["perk_ID"]), 10);
      const perkNameEN = trim(r["perk_name_EN"]);
      if (!Number.isFinite(perkId)) continue;
      perks.push({ perkId, perkNameEN });
    }
  }

  if (existsSync(legendaryMapPath)) {
    const { rows } = readCsv(legendaryMapPath);
    for (const r of rows) {
      const classId = trim(r["class_ID"]);
      const lNameId = trim(r["L_name_ID"]);
      const itemCardId = parseInt(trim(r["item_card_ID"]), 10);
      if (!classId || !lNameId || !Number.isFinite(itemCardId)) continue;
      legendaryMap[`${classId},${lNameId}`] = itemCardId;
    }
  }

  function rarityCode(classKey: string, rarityEn: string): number | null {
    if (rarityEn === "Legendary") return null;
    const perClass = PER_CLASS_RARITIES[classKey];
    if (!perClass) return null;
    return perClass[rarityEn] ?? null;
  }

  cached = {
    classNames: [...CLASS_NAMES],
    rarities: ["Common", "Uncommon", "Rare", "Epic", "Legendary"],
    namesByClassRarity,
    skillsByClass,
    perks,
    legendaryMap,
    rarityCode,
  };
  return cached;
}
