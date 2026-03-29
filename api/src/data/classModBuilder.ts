import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseCsv } from "./csvParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function getPath(relative: string): string {
  return join(repoRoot, relative);
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
  C4SH: 404,
};

const CLASS_ID_TO_NAME: Record<number, string> = {};
for (const [name, id] of Object.entries(CLASS_IDS)) CLASS_ID_TO_NAME[id] = name;

export const CLASS_NAMES = ["Amon", "Harlowe", "Rafa", "Vex", "C4SH"] as const;

/** Per-class rarity part IDs for non-legendary (Common/Uncommon/Rare/Epic). */
const PER_CLASS_RARITIES: Record<string, Record<string, number>> = {
  Vex: { Common: 217, Uncommon: 218, Rare: 219, Epic: 220 },
  Rafa: { Common: 66, Uncommon: 67, Rare: 68, Epic: 69 },
  Harlowe: { Common: 224, Uncommon: 223, Rare: 222, Epic: 221 },
  Amon: { Common: 70, Uncommon: 69, Rare: 68, Epic: 67 },
  C4SH: { Common: 52, Uncommon: 53, Rare: 54, Epic: 55 },
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

interface UniversalRow {
  code: string; name: string; manufacturer: string; category: string;
  partType: string; description: string; rarity: string; character: string;
}

function loadUniversalDb(): UniversalRow[] {
  const path = getPath("master_search/db/universal_parts_db.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return (raw?.rows ?? raw ?? []) as UniversalRow[];
  } catch { return []; }
}

function parseCode(code: string): { typeId: number; partId: number } {
  const m = code.match(/^\{(\d+):(\d+)\}$/);
  return m ? { typeId: parseInt(m[1]), partId: parseInt(m[2]) } : { typeId: 0, partId: 0 };
}

let cached: ClassModBuilderData | null = null;

export function getClassModBuilderData(): ClassModBuilderData {
  if (cached) return cached;

  const allRows = loadUniversalDb().filter((r) => r.category === "Class Mod");

  const namesByClassRarity: Record<string, ClassModNameOption[]> = {};
  const skillsByClass: Record<string, ClassModSkill[]> = {};
  const legendaryMap: Record<string, number> = {};
  const perks: ClassModPerk[] = [];
  const seenPerks = new Set<number>();

  // --- Names from universal DB ---
  for (const row of allRows) {
    if (row.partType !== "Name") continue;
    const { typeId, partId } = parseCode(row.code);
    if (!partId) continue;
    const className = row.character || CLASS_ID_TO_NAME[typeId] || "";
    if (!className) continue;
    const classId = CLASS_IDS[className];
    if (!classId) continue;
    const rarity = (row.rarity || "").toLowerCase().includes("legendary") ? "legendary" : "normal";
    const nameEN = trim(row.description) || trim(row.name).split(" - ").pop() || "";
    const key = `${classId},${rarity}`;
    if (!namesByClassRarity[key]) namesByClassRarity[key] = [];
    namesByClassRarity[key].push({ nameCode: partId, nameEN });
  }

  // --- Skills from universal DB ---
  // Skills have 5 entries per skill (one per tier). Group by (character, skillName) → collect all partIds.
  const skillGroups = new Map<string, { skillNameEN: string; skillIds: number[] }>();
  for (const row of allRows) {
    if (row.partType !== "Skill") continue;
    const { partId } = parseCode(row.code);
    if (!partId) continue;
    const className = row.character || "";
    if (!className) continue;
    const classId = CLASS_IDS[className];
    if (!classId) continue;
    const skillName = trim(row.description) || trim(row.name).split(" - ").pop() || "";
    if (!skillName) continue;
    const groupKey = `${classId}|${skillName}`;
    if (!skillGroups.has(groupKey)) {
      skillGroups.set(groupKey, { skillNameEN: skillName, skillIds: [] });
    }
    skillGroups.get(groupKey)!.skillIds.push(partId);
  }
  for (const [groupKey, skill] of skillGroups) {
    const classId = groupKey.split("|")[0];
    const className = CLASS_ID_TO_NAME[Number(classId)] || "";
    if (!className) continue;
    // Sort skill IDs ascending (tier 1 through 5)
    skill.skillIds.sort((a, b) => a - b);
    if (!skillsByClass[classId]) skillsByClass[classId] = [];
    skillsByClass[classId].push(skill);
  }
  // Sort skills alphabetically within each class
  for (const classId of Object.keys(skillsByClass)) {
    skillsByClass[classId].sort((a, b) => a.skillNameEN.localeCompare(b.skillNameEN));
  }

  // --- Perks from universal DB ---
  for (const row of allRows) {
    if (row.partType !== "Perk") continue;
    const { partId } = parseCode(row.code);
    if (!partId || seenPerks.has(partId)) continue;
    seenPerks.add(partId);
    const perkNameEN = trim(row.name) || trim(row.description) || "";
    perks.push({ perkId: partId, perkNameEN });
  }

  // --- Legendary map from CSV (cross-reference not in universal DB) ---
  const legendaryMapPath = getPath("class_mods/Class_legendary_map.csv");
  if (existsSync(legendaryMapPath)) {
    const content = readFileSync(legendaryMapPath, "utf-8");
    const { rows } = parseCsv(content);
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
