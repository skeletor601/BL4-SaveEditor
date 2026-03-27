// @ts-nocheck
/**
 * Beta: Unified Item Builder.
 * One page to build/edit any item (weapon, grenade, shield, class mod, repkit, heavy, enhancement)
 * using our DB (parts/data, decode/encode APIs). Part Builder + Add other parts + quantity;
 * side panel = Current build parts (parsed from decoded).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { apiUrl, fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import {
  generateModdedWeapon,
  NAMED_WEAPON_BARRELS,
  type WeaponEditData,
  type UniversalDbPartCode,
  type DpsEstimate,
} from "@/lib/generateModdedWeapon";
import { generateModdedGrenade, type GrenadeStatsEstimate } from "@/lib/generateModdedGrenade";
import { generateModdedShield, type ShieldStatsEstimate } from "@/lib/generateModdedShield";
import { generateModdedRepkit, type RepkitStatEstimate, type RepkitBuilderData as GenRepkitBuilderData } from "@/lib/generateModdedRepkit";
import { discoverEgg } from "@/lib/easterEggs";
import { MAX_LEVEL, DEFAULT_LEVEL } from "@/lib/gameConstants";
import { usePersistedState } from "@/lib/usePersistedState";
import { useCodeHistory } from "@/lib/useCodeHistory";
import CodeHistoryPanel from "@/components/CodeHistoryPanel";
import CleanCodeDialog from "@/components/weapon-toolbox/CleanCodeDialog";
import SkinPreview from "@/components/weapon-toolbox/SkinPreview";
import { FLAG_OPTIONS } from "@/components/weapon-toolbox/builderStyles";
import SkillCardPopup from "@/components/SkillCardPopup";
import ClassModNameHoverCard, { type ClassModNameCardData } from "@/components/ClassModNameHoverCard";
import { getClassModNameInfo } from "@/data/classModNameDescriptions";
import PartDetailModal from "@/components/master-search/PartDetailModal";
import PartHoverCard, { type HoverCardData } from "@/components/master-search/PartHoverCard";
import { apiItemToPartRow, getCode, getPartName } from "@/data/partsData";

export type ItemCategory =
  | "weapon"
  | "grenade"
  | "shield"
  | "class-mod"
  | "repkit"
  | "heavy"
  | "enhancement";

interface UniversalPartRow {
  code: string;
  label: string;
  effect?: string;
  itemType?: string;
  manufacturer?: string;
  partType?: string;
  rarity?: string;
}

const CATEGORY_COLORS: Record<ItemCategory, { active: string; inactive: string }> = {
  weapon:      { active: "border-red-500 bg-red-500/20 text-red-400",          inactive: "border-red-500/30 text-red-400/60 hover:text-red-400" },
  grenade:     { active: "border-orange-500 bg-orange-500/20 text-orange-400",  inactive: "border-orange-500/30 text-orange-400/60 hover:text-orange-400" },
  shield:      { active: "border-blue-500 bg-blue-500/20 text-blue-400",        inactive: "border-blue-500/30 text-blue-400/60 hover:text-blue-400" },
  "class-mod": { active: "border-green-500 bg-green-500/20 text-green-400",     inactive: "border-green-500/30 text-green-400/60 hover:text-green-400" },
  repkit:      { active: "border-cyan-500 bg-cyan-500/20 text-cyan-400",        inactive: "border-cyan-500/30 text-cyan-400/60 hover:text-cyan-400" },
  heavy:       { active: "border-pink-500 bg-pink-500/20 text-pink-400",        inactive: "border-pink-500/30 text-pink-400/60 hover:text-pink-400" },
  enhancement: { active: "border-yellow-500 bg-yellow-500/20 text-yellow-400",  inactive: "border-yellow-500/30 text-yellow-400/60 hover:text-yellow-400" },
};

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "weapon", label: "Weapon" },
  { value: "grenade", label: "Grenade" },
  { value: "shield", label: "Shield" },
  { value: "class-mod", label: "Class Mod" },
  { value: "repkit", label: "RepKit" },
  { value: "heavy", label: "Heavy" },
  { value: "enhancement", label: "Enhancement" },
];

const NONE = "None";
const ADD_OTHER_OPTION = "__ADD_OTHER__";

const WEAPON_MULTI_SLOTS: Record<string, number> = {
  "Body Accessory": 4,
  "Barrel Accessory": 4,
  "Manufacturer Part": 4,
  "Scope Accessory": 4,
  "Underbarrel Accessory": 3,
};

const WEAPON_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Legendary Type", slots: 1 },
  { key: "Pearl Type", slots: 1 },
  { key: "Element 1", slots: 1 },
  { key: "Element 2", slots: 1 },
  { key: "Body", slots: 1 },
  { key: "Body Accessory", slots: WEAPON_MULTI_SLOTS["Body Accessory"] ?? 1 },
  { key: "Barrel", slots: 1 },
  { key: "Barrel Accessory", slots: WEAPON_MULTI_SLOTS["Barrel Accessory"] ?? 1 },
  { key: "Magazine", slots: 1 },
  { key: "Stat Modifier", slots: 1 },
  { key: "Grip", slots: 1 },
  { key: "Foregrip", slots: 1 },
  { key: "Manufacturer Part", slots: WEAPON_MULTI_SLOTS["Manufacturer Part"] ?? 1 },
  { key: "Scope", slots: 1 },
  { key: "Scope Accessory", slots: WEAPON_MULTI_SLOTS["Scope Accessory"] ?? 1 },
  { key: "Underbarrel", slots: 1 },
  { key: "Underbarrel Accessory", slots: WEAPON_MULTI_SLOTS["Underbarrel Accessory"] ?? 1 },
];

interface WeaponGenData {
  manufacturers: string[];
  weaponTypes: string[];
  mfgWtIdList: { manufacturer: string; weaponType: string; mfgWtId: string }[];
  partsByMfgTypeId: Record<string, Record<string, { partId: string; label: string }[]>>;
  rarityByMfgTypeId: Record<string, { partId: string; stat: string; description?: string }[]>;
  legendaryByMfgTypeId: Record<string, { partId: string; description: string }[]>;
  pearlByMfgTypeId: Record<string, { partId: string; description: string }[]>;
  elemental: { partId: string; stat: string }[];
  godrolls?: { name: string; decoded: string }[];
  skins?: { label: string; value: string }[];
}

/** Grenade builder data (from accessories/grenade/builder-data). */
interface GrenadeBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}
interface GrenadeBuilderLegendaryPart extends GrenadeBuilderPart {
  mfgId: number;
  mfgName: string;
}
interface GrenadeBuilderRarity {
  id: number;
  label: string;
}
interface GrenadeBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, GrenadeBuilderRarity[]>;
  element: GrenadeBuilderPart[];
  firmware: GrenadeBuilderPart[];
  universalPerks: GrenadeBuilderPart[];
  legendaryPerks: GrenadeBuilderLegendaryPart[];
  mfgPerks: Record<number, GrenadeBuilderPart[]>;
  godrolls?: { name: string; decoded: string }[];
}

/** Shield builder data (from accessories/shield/builder-data). */
interface ShieldBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}
interface ShieldBuilderLegendaryPart extends ShieldBuilderPart {
  mfgId: number;
  mfgName: string;
}
interface ShieldBuilderRarity {
  id: number;
  label: string;
}
interface ShieldBuilderData {
  mfgs: { id: number; name: string }[];
  mfgTypeById: Record<number, "Energy" | "Armor">;
  raritiesByMfg: Record<number, ShieldBuilderRarity[]>;
  element: ShieldBuilderPart[];
  firmware: ShieldBuilderPart[];
  universalPerks: ShieldBuilderPart[];
  energyPerks: ShieldBuilderPart[];
  armorPerks: ShieldBuilderPart[];
  legendaryPerks: ShieldBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
  godrolls?: { name: string; decoded: string }[];
}

/** RepKit builder data (from accessories/repkit/builder-data). */
interface RepkitBuilderPart {
  partId: number;
  stat: string;
  description?: string;
}
interface RepkitBuilderLegendaryPart extends RepkitBuilderPart {
  mfgId: number;
  mfgName: string;
}
interface RepkitBuilderRarity {
  id: number;
  label: string;
}
interface RepkitBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, RepkitBuilderRarity[]>;
  prefix: RepkitBuilderPart[];
  firmware: RepkitBuilderPart[];
  resistance: RepkitBuilderPart[];
  universalPerks: RepkitBuilderPart[];
  legendaryPerks: RepkitBuilderLegendaryPart[];
  modelsByMfg: Record<number, number | null>;
  godrolls?: { name: string; decoded: string }[];
}

/** Heavy builder data (from accessories/heavy/builder-data). */
interface HeavyBuilderPart {
  partId: number;
  stat: string;
  description?: string;
  mfgId?: number;
}
interface HeavyBuilderRarity {
  id: number;
  label: string;
}
interface HeavyBuilderData {
  mfgs: { id: number; name: string }[];
  raritiesByMfg: Record<number, HeavyBuilderRarity[]>;
  barrel: HeavyBuilderPart[];
  element: HeavyBuilderPart[];
  firmware: HeavyBuilderPart[];
  barrelAccPerks: HeavyBuilderPart[];
  bodyAccPerks: HeavyBuilderPart[];
  bodiesByMfg: Record<number, number | null>;
  godrolls?: { name: string; decoded: string }[];
}

/** Class Mod builder data (from accessories/class-mod/builder-data). */
interface ClassModNameOption {
  nameCode: number;
  nameEN: string;
}
interface ClassModSkill {
  skillNameEN: string;
  skillIds: number[]; // 1–5 IDs
}
interface ClassModPerk {
  perkId: number;
  perkNameEN: string;
}
interface ClassModBuilderData {
  classNames: string[];
  rarities: string[];
  namesByClassRarity: Record<string, ClassModNameOption[]>;
  skillsByClass: Record<string, ClassModSkill[]>;
  perks: ClassModPerk[];
  legendaryMap: Record<string, number>;
}

const CLASS_MOD_CLASS_IDS: Record<string, number> = {
  Amon: 255,
  Harlowe: 259,
  Rafa: 256,
  Vex: 254,
  C4SH: 404,
};

// Per-class rarity part IDs for non-legendary (Common/Uncommon/Rare/Epic), mirrored from api/src/data/classModBuilder.ts
const CLASS_MOD_PER_CLASS_RARITIES: Record<string, Record<string, number>> = {
  Vex: { Common: 217, Uncommon: 218, Rare: 219, Epic: 220 },
  Rafa: { Common: 66, Uncommon: 67, Rare: 68, Epic: 69 },
  Harlowe: { Common: 224, Uncommon: 223, Rare: 222, Epic: 221 },
  Amon: { Common: 70, Uncommon: 69, Rare: 68, Epic: 67 },
  C4SH: { Common: 52, Uncommon: 53, Rare: 54, Epic: 55 },
};

const GRENADE_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Element", slots: 1 },
  { key: "Firmware", slots: 1 },
  // Weapon-style: one multi-select bucket, no cap.
  { key: "Mfg Perk", slots: 1 },
  { key: "Universal Perk", slots: 1 },
];

const SHIELD_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Element", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Universal Perk", slots: 1 },
  { key: "Energy Perk", slots: 1 },
  { key: "Armor Perk", slots: 1 },
];

const REPKIT_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Prefix", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Resistance", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Universal perks", slots: 1 },
];

const HEAVY_TYPE_ID = 244;
const HEAVY_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Barrel", slots: 1 },
  { key: "Element", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Barrel Accessory", slots: 1 },
  { key: "Body Accessory", slots: 1 },
  { key: "Underbarrel", slots: 1 },
];

/** Enhancement builder data (from accessories/enhancement/builder-data). */
interface EnhancementMfgPerk {
  index: number;
  name: string;
  description?: string;
}
interface EnhancementManufacturer {
  code: number;
  name: string;
  perks: EnhancementMfgPerk[];
  rarities: Record<string, number>;
}
interface Enhancement247Perk {
  code: number;
  name: string;
  description?: string;
}
interface EnhancementBuilderData {
  manufacturers: Record<string, EnhancementManufacturer>;
  rarityMap247: Record<string, number>;
  secondary247: Enhancement247Perk[];
  godrolls?: { name: string; decoded: string }[];
}

const ENHANCEMENT_RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const ENHANCEMENT_PERK_ORDER = [1, 2, 3, 9];

const ENHANCEMENT_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Manufacturer perks", slots: 1 },
  { key: "Stacked perks", slots: 1 }, // shown as "Legendary Perks"
  { key: "Builder 247", slots: 1 }, // shown as "Universal Perks"
];

const CLASS_MOD_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Name", slots: 1 },
  { key: "Legendary names", slots: 1 },
  { key: "Perks", slots: 1 },
];

function getClassModSkillIconFilename(skillNameEN: string, className: string): string {
  const norm = skillNameEN
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['']/g, "")
    .replace(/\s+/g, "_");
  const safeName = norm.replace(/[^a-zA-Z0-9_!]/g, "").toLowerCase();
  const suffixMap: Record<string, string> = { Vex: "_1", Rafa: "_2", Harlowe: "_3", Amon: "_4", C4SH: "_5" };
  const suffix = suffixMap[className] ?? "";
  return `${safeName}${suffix}.png`;
}

const C4SH_BLUE_SKILLS = new Set([
  "Fast Hands","Insurance","Ante","Splash the Pot","Alchemy","Go for Broke","Sounds of Rain",
  "Trick-Taker","Late Scratch","Double-Down","Wretched Shadows","High Roller","Take the Pot",
  "Stack the Deck","Legerdemain","Vigorish","Dealer's Bluff","Ace in the Hole","Around the Corner",
  "House Edge","C4SH Game","No Limit","Ante Up","Kill Button","Payout","Boom or Bust",
  "Tender Hearts","Card Sharp","Hot Streak","Read the Signs","The Turn","Risky Business",
  "Heart of the Cards","Running Luck",
]);
const C4SH_RED_SKILLS = new Set([
  "Unleashed","Your Huckleberry","The Determinator","Hard-Boiled","Shootist","Stand and Bleed",
  "Hot Hand","Trick Shot","Ride to Ruin","A Blur of Fingers and Brass","Brimstone","Fast C4SH",
  "Firestorm","Burn the House Down","High Noon","Bloodstained Moon","Lawless","Truck Full of Nitro",
  "War Wagon","Pale Rider","Nothing Beats Lead","Forsaken","Broken Arrow","Maverick","Cottonmouth",
  "Bad Men Must Bleed","The Wind","Rattlesnake",
]);
const C4SH_GREEN_SKILLS = new Set([
  "Luck Be a Robot","Sweet Roll","Charm Bracelet","O Fortuna","Red Moon Rising","Ready to Roll",
  "Riding High","Bonemeal Ticket","Before She Knows You're Dead","Luckless","Double Time",
  "Can't Stop Winning","Turn of Fate","High Stakes","Fortune's Favor","Let it Ride","The Wilds",
  "Potent Posse","Restless Remains","Sorcerer","Tooth and Nail","Serendipity","Sidekick's Revenge",
  "The Glorious Dead","Accursed Bones","Tormented","Loaded Dice","Shadow's Embrace","Graveyard Shift",
  "Snake Eyes","Call","Cursed Call","Witching Hour",
]);

function getC4SHSkillColor(skillName: string): string {
  if (C4SH_BLUE_SKILLS.has(skillName)) return "text-blue-400";
  if (C4SH_RED_SKILLS.has(skillName)) return "text-red-400";
  if (C4SH_GREEN_SKILLS.has(skillName)) return "text-green-400";
  return "text-[var(--color-text)]";
}

function partIdFromLabel(label: string): string | null {
  if (!label || label === NONE) return null;
  const first = label.split(" - ")[0]?.trim();
  if (first && /^\d+$/.test(first)) return first;
  return null;
}

function normalizeRarity(r: string | undefined): string {
  if (!r) return "";
  const s = r.trim().toLowerCase();
  if (s.includes("pearl")) return "Pearl";
  if (s.includes("legendary")) return "Legendary";
  if (s.includes("epic")) return "Epic";
  if (s.includes("rare")) return "Rare";
  if (s.includes("uncommon")) return "Uncommon";
  if (s.includes("common")) return "Common";
  return r.trim();
}

/** Append one or more part tokens to the first line of decoded; ensure minimal header if missing. */
function appendPartsToDecoded(
  decoded: string,
  tokens: string[],
  level: number,
  seed: number
): string {
  if (!tokens.length) return decoded;
  const tokenStr = tokens.join(" ");
  const lines = decoded.split(/\r?\n/);
  let first = (lines[0] ?? "").trim();
  if (!first.includes("||")) {
    first = `255, 0, 1, ${level}| 2, ${seed}|| |`;
  }
  const trimmed = first.trimEnd();
  const newFirst = trimmed.endsWith("|")
    ? trimmed.slice(0, -1).trimEnd() + " " + tokenStr + " |"
    : trimmed + " " + tokenStr;
  lines[0] = newFirst;
  return lines.join("\n");
}

/** Build a single token from code and quantity (e.g. {13:90} or {13:[90 90 90]}). */
function codeToToken(code: string, qty: number): string {
  const c = code.trim();
  const n = Math.max(1, Math.min(999, qty));
  const pair = c.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
  if (pair) {
    const prefix = Number(pair[1]);
    const part = Number(pair[2]);
    if (n === 1) return `{${prefix}:${part}}`;
    return `{${prefix}:[${Array(n).fill(part).join(" ")}]}`;
  }
  const simple = c.match(/^\{\s*(\d+)\s*\}$/);
  if (simple) {
    const id = Number(simple[1]);
    if (n === 1) return `{${id}}`;
    return `{${id}}`.repeat(n).replace(/}\s*{/g, "} {");
  }
  if (n === 1) return c;
  return (c + " ").repeat(n).trim();
}

/** One parsed part token in the build (for Current build parts list). */
export interface ParsedBuildPart {
  raw: string;
  prefix?: number;
  partId?: number;
  subIds?: number[];
  qty: number;
}

/** Resolve a parsed part to a display name.
 * - For element parts (prefix 1), use elementNameByPartId (Fire, Shock, etc.) when provided.
 * - extraByRaw can override labels for specific raw tokens (e.g. shield legendary perks).
 */
function getPartLabel(
  part: ParsedBuildPart,
  byCode: Map<string, string>,
  elementNameByPartId?: Map<number, string> | null,
  extraByRaw?: Map<string, string> | null,
): string {
  if (extraByRaw) {
    if (extraByRaw.has(part.raw)) return extraByRaw.get(part.raw)!;
    if (part.prefix != null && part.partId != null) {
      const key = `{${part.prefix}:${part.partId}}`;
      if (extraByRaw.has(key)) return extraByRaw.get(key)!;
    }
  }
  if (part.prefix === 1 && part.partId != null && elementNameByPartId?.has(part.partId)) {
    return elementNameByPartId.get(part.partId)!;
  }
  const found =
    byCode.get(part.raw) ??
    (part.prefix != null && part.partId != null ? byCode.get(`{${part.prefix}:${part.partId}}`) : undefined) ??
    (part.partId != null ? byCode.get(`{${part.partId}}`) : undefined);
  return found ?? part.raw;
}

/** Extract parts segment from first decoded line (between || and final |). */
function getPartsSegmentFromFirstLine(decoded: string): string {
  const lines = decoded.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const idx = first.indexOf("||");
  if (idx === -1) return "";
  return first.slice(idx + 2).replace(/\|\s*$/, "").trim();
}

/** Get header of first line (everything up to and including "||"). */
function getFirstLineHeader(decoded: string): string {
  const lines = decoded.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const idx = first.indexOf("||");
  if (idx === -1) return "";
  return first.slice(0, idx + 2);
}

/** First number in the build string (type/manufacturer id). Used to interpret single-number tokens like {78} as {typeId:78}. */
function getHeaderTypeId(decoded: string): number | null {
  const lines = decoded.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const beforePipe = first.split("|")[0].trim();
  const firstNum = beforePipe.split(",")[0].trim();
  const n = parseInt(firstNum, 10);
  return Number.isNaN(n) ? null : n;
}

/** Parse parts segment into list of ParsedBuildPart. headerTypeId: when present, single-number tokens {X} are interpreted as {headerTypeId:X}. */
function parsePartsSegment(segment: string, headerTypeId: number | null): ParsedBuildPart[] {
  const out: ParsedBuildPart[] = [];
  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|"c",\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(segment)) !== null) {
    const raw = m[0];
    if (m[3] != null) {
      out.push({ raw, qty: 1 });
      continue;
    }
    const outer = Number(m[1]);
    const inner = m[2];
    if (!inner) {
      const prefix = headerTypeId ?? outer;
      out.push({ raw, prefix, partId: outer, qty: 1 });
      continue;
    }
    if (inner.includes("[")) {
      const subIds = inner.replace(/[\[\]]/g, "").trim().split(/\s+/).filter(Boolean).map(Number);
      const countByPartId = new Map<number, number>();
      for (const id of subIds) countByPartId.set(id, (countByPartId.get(id) ?? 0) + 1);
      for (const [partId, qty] of countByPartId) {
        const partRaw = qty === 1 ? `{${outer}:${partId}}` : `{${outer}:[${Array(qty).fill(partId).join(" ")}]}`;
        out.push({ raw: partRaw, prefix: outer, partId, qty });
      }
      continue;
    }
    const partId = Number(inner);
    out.push({ raw, prefix: outer, partId, qty: 1 });
  }
  return out;
}

/** Rebuild first decoded line from header + ordered part raws. */
function rebuildFirstLine(decoded: string, partRaws: string[]): string {
  const header = getFirstLineHeader(decoded);
  const lines = decoded.split(/\r?\n/);
  const partsStr = partRaws.join(" ").trim();
  lines[0] = header + (partsStr ? " " + partsStr : " ") + " |";
  return lines.join("\n");
}

/**
 * Incremental merge: given the current liveDecoded, a freshly-built decoded (from partSelections),
 * and the PREVIOUS freshly-built decoded (what UI generated last time), preserve manually entered
 * tokens in their original positions while correctly adding/removing UI-selected tokens.
 *
 * Algorithm:
 * 1. Diff prevFresh vs newFresh to find added and removed UI tokens
 * 2. Walk through liveDecoded's tokens:
 *    - If a token matches a "removed" UI token, skip it
 *    - Otherwise keep it in place (manual entries preserved)
 * 3. Append "added" UI tokens to the end
 * 4. Use the new header (updated level/seed)
 *
 * If prevFresh is empty (initial build), returns freshDecoded as-is.
 */
function mergeDecodedIncremental(liveDecoded: string, freshDecoded: string, prevFreshDecoded: string): string {
  const liveSegment = getPartsSegmentFromFirstLine(liveDecoded);
  const prevSegment = getPartsSegmentFromFirstLine(prevFreshDecoded);
  // If no previous build exists (initial build), just use the fresh build
  if (!prevSegment.trim() || !liveSegment.trim()) return freshDecoded;

  const freshSegment = getPartsSegmentFromFirstLine(freshDecoded);
  const headerTypeId = getHeaderTypeId(freshDecoded);

  const liveParts = parsePartsSegment(liveSegment, getHeaderTypeId(liveDecoded));
  const prevParts = parsePartsSegment(prevSegment, getHeaderTypeId(prevFreshDecoded));
  const freshParts = parsePartsSegment(freshSegment, headerTypeId);

  // Build bags for prev and fresh to find diff
  const prevBag = new Map<string, number>();
  for (const p of prevParts) prevBag.set(p.raw, (prevBag.get(p.raw) ?? 0) + 1);
  const freshBag = new Map<string, number>();
  for (const p of freshParts) freshBag.set(p.raw, (freshBag.get(p.raw) ?? 0) + 1);

  // Tokens added: in fresh but not (or more than) in prev
  const addedBag = new Map<string, number>();
  for (const [raw, count] of freshBag) {
    const prevCount = prevBag.get(raw) ?? 0;
    if (count > prevCount) addedBag.set(raw, count - prevCount);
  }

  // Tokens removed: in prev but not (or fewer) in fresh
  const removedBag = new Map<string, number>();
  for (const [raw, count] of prevBag) {
    const freshCount = freshBag.get(raw) ?? 0;
    if (count > freshCount) removedBag.set(raw, count - freshCount);
  }

  // Walk live tokens, skip removed ones, keep everything else
  const result: string[] = [];
  for (const p of liveParts) {
    const removeCount = removedBag.get(p.raw) ?? 0;
    if (removeCount > 0) {
      // This token was removed by UI — skip it
      removedBag.set(p.raw, removeCount - 1);
    } else {
      // Keep it (UI token or manual entry — doesn't matter)
      result.push(p.raw);
    }
  }

  // Append newly added UI tokens at the end
  for (const [raw, count] of addedBag) {
    for (let i = 0; i < count; i++) result.push(raw);
  }

  // Use the fresh header (updated level/seed) + skin from fresh or live
  const freshHeader = getFirstLineHeader(freshDecoded);
  const skinMatch = freshSegment.match(/"c",\s*"[^"]*"/) ?? liveSegment.match(/"c",\s*"[^"]*"/);
  const skinSuffix = skinMatch ? ` | ${skinMatch[0]} |` : " |";
  const partsStr = result.join(" ").trim();
  return `${freshHeader} ${partsStr}${skinSuffix}`;
}

/** Build decoded string from weapon part selections (list per type, no caps). Optional skinValue appends | "c", "skin" | to first line. */
function buildDecodedFromWeaponPartSelections(
  data: WeaponGenData,
  mfgWtId: string,
  level: number,
  seed: number,
  partSelections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string
): string {
  const header = `${mfgWtId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyNum = (q: string): number => {
    const raw = (q ?? "1").trim();
    if (!raw || !/^\d+$/.test(raw)) return 1;
    return Math.max(1, Math.min(99, Number(raw)));
  };
  const rarityList = partSelections["Rarity"] ?? [];
  rarityList.forEach(({ label, qty }) => {
    const n = qtyNum(qty);
    if (label === "Legendary") {
      const legList = partSelections["Legendary Type"] ?? [];
      legList.forEach(({ label: legLabel, qty: legQty }) => {
        const pid = partIdFromLabel(legLabel ?? "");
        if (pid) {
          const nn = qtyNum(legQty);
          if (nn <= 1) parts.push(`{${pid}}`);
          else parts.push(`{${mfgWtId}:[${Array(nn).fill(pid).join(" ")}]}`);
        }
      });
    } else if (label === "Pearl") {
      const pearlList = partSelections["Pearl Type"] ?? [];
      pearlList.forEach(({ label: pearlLabel, qty: pearlQty }) => {
        const pid = partIdFromLabel(pearlLabel ?? "");
        if (pid) {
          const nn = qtyNum(pearlQty);
          if (nn <= 1) parts.push(`{${pid}}`);
          else parts.push(`{${mfgWtId}:[${Array(nn).fill(pid).join(" ")}]}`);
        }
      });
    } else {
      const entry = data.rarityByMfgTypeId[mfgWtId]?.find((r) => r.stat === label);
      if (entry) {
        if (n <= 1) parts.push(`{${entry.partId}}`);
        else parts.push(`{${mfgWtId}:[${Array(n).fill(entry.partId).join(" ")}]}`);
      }
    }
  });
  ["Element 1", "Element 2"].forEach((key) => {
    const list = partSelections[key] ?? [];
    list.forEach(({ label, qty }) => {
      const pid = partIdFromLabel(label ?? "");
      if (!pid) return;
      const n = qtyNum(qty);
      if (n <= 1) parts.push(`{1:${pid}}`);
      else parts.push(`{1:[${Array(n).fill(pid).join(" ")}]}`);
    });
  });
  const specialKeys = new Set(["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"]);
  WEAPON_PART_ORDER.forEach(({ key: partType }) => {
    if (specialKeys.has(partType)) return;
    const list = partSelections[partType] ?? [];
    list.forEach(({ label, qty }) => {
      const pid = partIdFromLabel(label ?? "");
      if (!pid) return;
      const n = qtyNum(qty);
      if (n <= 1) parts.push(`{${pid}}`);
      else parts.push(`{${mfgWtId}:[${Array(n).fill(pid).join(" ")}]}`);
    });
  });
  extraTokens.forEach((t) => parts.push(t));
  let decoded = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decoded = decoded.replace(/\|\s*"c",\s*"(?:[^"\\]|\\.)*"\s*\|?\s*$/i, " |");
    const normalized = decoded.trim().endsWith("|") ? decoded.trim() : `${decoded.trim()} |`;
    decoded = normalized.replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decoded;
}

const GRENADE_TYPE_ID = 245;

/** Build decoded string from grenade multi-select selections (weapon-style picker). */
function buildDecodedFromGrenadeSelections(
  data: GrenadeBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyNum = (qty: string | undefined): number => {
    const raw = String(qty ?? "").trim();
    if (!raw || !/^\d+$/.test(raw)) return 1;
    return Math.max(1, Math.min(99, Number(raw)));
  };

  // Rarity: match by label to rarity ID; always add as {id} (no qty)
  const rarities = data.raritiesByMfg[mfgId] ?? [];
  (selections["Rarity"] ?? []).forEach((s) => {
    const entry = rarities.find((r) => r.label === s.label);
    if (entry) parts.push(`{${entry.id}}`);
  });

  // Legendary: label is stored as "mfgId:partId" or "partId - ..." (fallback).
  const otherMfg: Record<number, number[]> = {};
  (selections["Legendary"] ?? []).forEach((s) => {
    const qty = qtyNum(s.qty);
    const raw = s.label.trim();
    if (raw.includes(":")) {
      const [m, p] = raw.split(":", 2);
      const legMfg = parseInt(m ?? "", 10);
      const legPart = parseInt(p ?? "", 10);
      if (!Number.isFinite(legMfg) || !Number.isFinite(legPart)) return;
      if (legMfg === mfgId) {
        for (let i = 0; i < qty; i++) parts.push(`{${legPart}}`);
      } else {
        if (!otherMfg[legMfg]) otherMfg[legMfg] = [];
        for (let i = 0; i < qty; i++) otherMfg[legMfg].push(legPart);
      }
    } else {
      const pid = partIdFromLabel(raw);
      if (!pid) return;
      for (let i = 0; i < qty; i++) parts.push(`{${pid}}`);
    }
  });
  Object.entries(otherMfg).forEach(([m, ids]) => {
    const legMfg = Number(m);
    if (!Number.isFinite(legMfg) || ids.length === 0) return;
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.length === 1) parts.push(`{${legMfg}:${sorted[0]}}`);
    else parts.push(`{${legMfg}:[${sorted.join(" ")}]}`);
  });

  // Mfg Perk: add as simple {id} repeated qty (no cap).
  (selections["Mfg Perk"] ?? []).forEach((s) => {
    const pid = partIdFromLabel(s.label);
    if (!pid) return;
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) parts.push(`{${pid}}`);
  });

  // Element / Firmware / Universal Perk: collected under type 245 as grouped token.
  const secondary245: number[] = [];
  const add245FromLabel = (label: string, qty: number) => {
    const pid = partIdFromLabel(label);
    if (!pid) return;
    for (let i = 0; i < qty; i++) secondary245.push(Number(pid));
  };
  (selections["Element"] ?? []).forEach((s) => add245FromLabel(s.label, qtyNum(s.qty)));
  (selections["Firmware"] ?? []).forEach((s) => add245FromLabel(s.label, qtyNum(s.qty)));
  (selections["Universal Perk"] ?? []).forEach((s) => add245FromLabel(s.label, qtyNum(s.qty)));
  if (secondary245.length === 1) {
    parts.push(`{${GRENADE_TYPE_ID}:${secondary245[0]}}`);
  } else if (secondary245.length > 1) {
    const sorted = [...secondary245].sort((a, b) => a - b);
    parts.push(`{${GRENADE_TYPE_ID}:[${sorted.join(" ")}]}`);
  }

  extraTokens.forEach((t) => parts.push(t));
  let decodedGrenade = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decodedGrenade = decodedGrenade.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decodedGrenade;
}

const SHIELD_TYPE_ID = 246;
const SHIELD_ENERGY_PERK_TYPE_ID = 248;
const SHIELD_ARMOR_PERK_TYPE_ID = 237;
const REPKIT_TYPE_ID = 243;

const REPKIT_COMBUSTION_IDS = new Set([24, 50, 29, 44]);
const REPKIT_RADIATION_IDS = new Set([23, 47, 28, 43]);
const REPKIT_CORROSIVE_IDS = new Set([26, 51, 31, 46]);
const REPKIT_SHOCK_IDS = new Set([22, 49, 27, 42]);
const REPKIT_CRYO_IDS = new Set([25, 48, 30, 45]);

const REPKIT_COMBUSTION_MODEL_PLUS = 98;
const REPKIT_RADIATION_MODEL_PLUS = 99;
const REPKIT_CORROSIVE_MODEL_PLUS = 100;
const REPKIT_SHOCK_MODEL_PLUS = 101;
const REPKIT_CRYO_MODEL_PLUS = 102;

function buildTypeToken(typeId: number, ids: number[]): string | null {
  if (!ids.length) return null;
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length === 1) return `{${typeId}:${sorted[0]}}`;
  return `{${typeId}:[${sorted.join(" ")}]}`;
}

function expandQtyMap(qtyById: Record<number, number>): number[] {
  const out: number[] = [];
  for (const [idStr, qtyRaw] of Object.entries(qtyById ?? {})) {
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) continue;
    const qty = Math.max(1, Math.min(99, Number(qtyRaw) || 1));
    for (let i = 0; i < qty; i++) out.push(id);
  }
  return out;
}

function buildDecodedFromShieldSelections(
  data: ShieldBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyNum = (raw: string): number => {
    const s = String(raw ?? "").trim();
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(99, n));
  };

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const rarityLabel = (selections["Rarity"]?.[0]?.label ?? "").trim();
  const rarityEntry = rarities.find((r) => r.label === rarityLabel);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  const legendary = selections["Legendary"] ?? [];
  if (legendary.length === 0) {
    const modelId = data.modelsByMfg[mfgId];
    if (modelId != null) parts.push(`{${modelId}}`);
  } else {
    const otherMfgPerks: Record<number, number[]> = {};
    legendary.forEach((s) => {
      const key = (s.label ?? "").split(" - ")[0]?.trim() ?? "";
      const [mfgStr, idStr] = key.split(":", 2);
      const id = parseInt(idStr ?? "", 10);
      const legMfg = parseInt(mfgStr ?? "", 10);
      if (!Number.isFinite(id) || !Number.isFinite(legMfg)) return;
      const qty = Math.max(1, Math.min(5, qtyNum(s.qty)));
      const leg = data.legendaryPerks.find((l) => l.partId === id && l.mfgId === legMfg);
      if (!leg) return;
      if (legMfg === mfgId) {
        for (let i = 0; i < qty; i++) parts.push(`{${id}}`);
      } else {
        if (!otherMfgPerks[legMfg]) otherMfgPerks[legMfg] = [];
        for (let i = 0; i < qty; i++) otherMfgPerks[legMfg].push(id);
      }
    });
    for (const [mfgKey, ids] of Object.entries(otherMfgPerks)) {
      const mfgNum = parseInt(mfgKey, 10);
      const sorted = [...ids].sort((a, b) => a - b);
      if (sorted.length === 1) parts.push(`{${mfgNum}:${sorted[0]}}`);
      else parts.push(`{${mfgNum}:[${sorted.join(" ")}]}`);
    }
  }

  const secondary246: number[] = [];
  const addSecondary = (label: string, qty: number) => {
    const pid = partIdFromLabel(label);
    if (!pid) return;
    for (let i = 0; i < qty; i++) secondary246.push(Number(pid));
  };

  (selections["Firmware"] ?? []).forEach((s) => addSecondary(s.label, qtyNum(s.qty)));
  (selections["Element"] ?? []).forEach((s) => addSecondary(s.label, qtyNum(s.qty)));
  (selections["Universal Perk"] ?? []).forEach((s) => addSecondary(s.label, qtyNum(s.qty)));
  const secondary246Token = buildTypeToken(SHIELD_TYPE_ID, secondary246);
  if (secondary246Token) parts.push(secondary246Token);

  const secondary248: number[] = [];
  (selections["Energy Perk"] ?? []).forEach((s) => {
    const pid = partIdFromLabel(s.label);
    if (!pid) return;
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) secondary248.push(Number(pid));
  });
  const secondary248Token = buildTypeToken(SHIELD_ENERGY_PERK_TYPE_ID, secondary248);
  if (secondary248Token) parts.push(secondary248Token);

  const secondary237: number[] = [];
  (selections["Armor Perk"] ?? []).forEach((s) => {
    const pid = partIdFromLabel(s.label);
    if (!pid) return;
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) secondary237.push(Number(pid));
  });
  const secondary237Token = buildTypeToken(SHIELD_ARMOR_PERK_TYPE_ID, secondary237);
  if (secondary237Token) parts.push(secondary237Token);

extraTokens.forEach((t) => parts.push(t));
let decodedShield = `${header} ${parts.join(" ")} |`;
if (skinValue && skinValue.trim()) {
  const safe = skinValue.trim().replace(/"/g, '\\"');
  decodedShield = decodedShield.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
}
return decodedShield;
}

function buildDecodedFromRepkitSelections(
  data: RepkitBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyNum = (raw: string): number => {
    const s = String(raw ?? "").trim();
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(99, n));
  };

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const rarityLabel = (selections["Rarity"]?.[0]?.label ?? "").trim();
  const rarityEntry = rarities.find((r) => r.label === rarityLabel);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  const modelId = data.modelsByMfg[mfgId];
  if (modelId != null) parts.push(`{${modelId}}`);

  const legendary = selections["Legendary"] ?? [];
  if (legendary.length > 0) {
    const otherMfgPerks: Record<number, number[]> = {};
    legendary.forEach((s) => {
      const key = (s.label ?? "").split(" - ")[0]?.trim() ?? "";
      const [mfgStr, idStr] = key.split(":", 2);
      const id = parseInt(idStr ?? "", 10);
      const legMfg = parseInt(mfgStr ?? "", 10);
      if (!Number.isFinite(id) || !Number.isFinite(legMfg)) return;
      const qty = Math.max(1, Math.min(5, qtyNum(s.qty)));
      const leg = data.legendaryPerks.find((l) => l.partId === id && l.mfgId === legMfg);
      if (!leg) return;
      if (legMfg === mfgId) {
        for (let i = 0; i < qty; i++) parts.push(`{${id}}`);
      } else {
        if (!otherMfgPerks[legMfg]) otherMfgPerks[legMfg] = [];
        for (let i = 0; i < qty; i++) otherMfgPerks[legMfg].push(id);
      }
    });
    for (const [mfgKey, ids] of Object.entries(otherMfgPerks)) {
      const mfgNum = parseInt(mfgKey, 10);
      const sorted = [...ids].sort((a, b) => a - b);
      if (sorted.length === 1) parts.push(`{${mfgNum}:${sorted[0]}}`);
      else parts.push(`{${mfgNum}:[${sorted.join(" ")}]}`);
    }
  }

  const secondary243: number[] = [];
  const addType243 = (id: number): void => {
    if (!Number.isFinite(id)) return;
    secondary243.push(id);
  };

  const addFromLabel = (label: string, qty: number) => {
    const pid = partIdFromLabel(label);
    if (!pid) return;
    for (let i = 0; i < qty; i++) addType243(Number(pid));
  };

  // Prefix and Firmware – treat as single entries, ignore qty > 1 to avoid weird stacking.
  const prefixSel = selections["Prefix"]?.[0];
  if (prefixSel && prefixSel.label && prefixSel.label !== NONE) {
    addFromLabel(prefixSel.label, 1);
  }
  const firmwareSel = selections["Firmware"]?.[0];
  if (firmwareSel && firmwareSel.label && firmwareSel.label !== NONE) {
    addFromLabel(firmwareSel.label, 1);
  }

  const resistanceIds: number[] = [];
  let hasCombustion = false;
  let hasRadiation = false;
  let hasCorrosive = false;
  let hasShock = false;
  let hasCryo = false;

  (selections["Resistance"] ?? []).forEach((s) => {
    const pidStr = partIdFromLabel(s.label);
    if (!pidStr) return;
    const pid = Number(pidStr);
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) resistanceIds.push(pid);
    if (REPKIT_COMBUSTION_IDS.has(pid)) hasCombustion = true;
    if (REPKIT_RADIATION_IDS.has(pid)) hasRadiation = true;
    if (REPKIT_CORROSIVE_IDS.has(pid)) hasCorrosive = true;
    if (REPKIT_SHOCK_IDS.has(pid)) hasShock = true;
    if (REPKIT_CRYO_IDS.has(pid)) hasCryo = true;
  });

  secondary243.push(...resistanceIds);
  if (hasCombustion) addType243(REPKIT_COMBUSTION_MODEL_PLUS);
  if (hasRadiation) addType243(REPKIT_RADIATION_MODEL_PLUS);
  if (hasCorrosive) addType243(REPKIT_CORROSIVE_MODEL_PLUS);
  if (hasShock) addType243(REPKIT_SHOCK_MODEL_PLUS);
  if (hasCryo) addType243(REPKIT_CRYO_MODEL_PLUS);

  (selections["Universal perks"] ?? []).forEach((s) => {
    const pidStr = partIdFromLabel(s.label);
    if (!pidStr) return;
    const pid = Number(pidStr);
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) secondary243.push(pid);
  });

  const secondary243Token = buildTypeToken(REPKIT_TYPE_ID, secondary243);
  if (secondary243Token) parts.push(secondary243Token);

  extraTokens.forEach((t) => parts.push(t));
  let decodedRepkit = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decodedRepkit = decodedRepkit.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decodedRepkit;
}

function buildDecodedFromHeavySelections(
  data: HeavyBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${HEAVY_TYPE_ID}||`;
  const parts: string[] = [];

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const rarityLabel = (selections["Rarity"]?.[0]?.label ?? "").trim();
  const rarityEntry = rarities.find((r) => r.label === rarityLabel);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  const bodyId = data.bodiesByMfg[mfgId];
  if (bodyId != null) parts.push(`{${bodyId}}`);

  const barrelSel = selections["Barrel"]?.[0]?.label ?? "";
  const barrelPid = partIdFromLabel(barrelSel);
  if (barrelPid) parts.push(`{${barrelPid}}`);

  const elementSel = selections["Element"]?.[0]?.label ?? "";
  const elementPid = partIdFromLabel(elementSel);
  if (elementPid) parts.push(`{1:${elementPid}}`);

  const firmwareSel = selections["Firmware"]?.[0]?.label ?? "";
  const firmwarePid = partIdFromLabel(firmwareSel);
  if (firmwarePid) parts.push(`{244:${firmwarePid}}`);

  const pushAcc = (key: string) => {
    (selections[key] ?? []).forEach((s) => {
      const pidStr = partIdFromLabel(s.label);
      if (!pidStr) return;
      const pid = Number(pidStr);
      const qty = Math.max(1, Math.min(99, parseInt((s.qty ?? "1").trim() || "1", 10) || 1));
      for (let i = 0; i < qty; i++) parts.push(`{${pid}}`);
    });
  };
  pushAcc("Barrel Accessory");
  pushAcc("Body Accessory");

  // Underbarrel — uses full {prefix:partId} codes since they're cross-prefix
  (selections["Underbarrel"] ?? []).forEach((s) => {
    const pidStr = partIdFromLabel(s.label);
    if (!pidStr) return;
    const qty = Math.max(1, Math.min(99, parseInt((s.qty ?? "1").trim() || "1", 10) || 1));
    for (let i = 0; i < qty; i++) parts.push(`{${pidStr}}`);
  });

  extraTokens.forEach((t) => parts.push(t));
  let decodedHeavy = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decodedHeavy = decodedHeavy.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decodedHeavy;
}

function buildDecodedFromEnhancementSelections(
  data: EnhancementBuilderData,
  mfgName: string,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skinValue?: string,
): string {
  const mfg = data.manufacturers[mfgName];
  if (!mfg) return "";

  const header = `${mfg.code}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];

  const rarityLabel = (selections["Rarity"]?.[0]?.label ?? "").trim();
  const rarityCode = mfg.rarities[rarityLabel];
  if (rarityCode != null) parts.push(`{${rarityCode}}`);

  const rarity247 = data.rarityMap247[rarityLabel];
  if (rarity247 != null) parts.push(`{247:${rarity247}}`);

  const mfgPerkSelections = selections["Manufacturer perks"] ?? [];
  const indices = new Set<number>();
  for (const s of mfgPerkSelections) {
    const m = s.label.match(/\[(\d+)\]/);
    const idx = m ? parseInt(m[1], 10) : NaN;
    if (Number.isFinite(idx)) indices.add(idx);
  }
  for (const idx of Array.from(indices).sort((a, b) => a - b)) {
    parts.push(`{${idx}}`);
  }

  const stacked = selections["Stacked perks"] ?? [];
  const stackedPerks: Record<number, number[]> = {};
  for (const s of stacked) {
    const key = s.label.split(" - ")[0]?.trim() ?? "";
    const [mfgCodeStr, idxStr] = key.split(":", 2);
    const mfgCode = parseInt(mfgCodeStr ?? "", 10);
    const idx = parseInt(idxStr ?? "", 10);
    const qty = Math.max(1, Math.min(99, parseInt(s.qty.trim() || "1", 10) || 1));
    if (!Number.isFinite(mfgCode) || !Number.isFinite(idx)) continue;
    if (!stackedPerks[mfgCode]) stackedPerks[mfgCode] = [];
    for (let i = 0; i < qty; i++) stackedPerks[mfgCode].push(idx);
  }
  for (const [codeStr, indicesArr] of Object.entries(stackedPerks)) {
    const code = parseInt(codeStr, 10);
    const sorted = [...indicesArr].sort((a, b) => a - b);
    parts.push(`{${code}:[${sorted.join(" ")}]}`);
  }

  const statsSel = selections["Builder 247"] ?? [];
  const stats247: number[] = [];
  for (const s of statsSel) {
    const first = s.label.split(" - ")[0]?.trim() ?? "";
    const code = parseInt(first, 10);
    const qty = Math.max(1, Math.min(99, parseInt(s.qty.trim() || "1", 10) || 1));
    if (!Number.isFinite(code)) continue;
    for (let i = 0; i < qty; i++) stats247.push(code);
  }
  if (stats247.length > 0) {
    parts.push(`{247:[${stats247.join(" ")}]}`);
  }

  extraTokens.forEach((t) => parts.push(t));
  let decodedEnhancement = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decodedEnhancement = decodedEnhancement.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decodedEnhancement;
}

function buildDecodedFromClassModSelections(
  data: ClassModBuilderData,
  className: string,
  rarity: string,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
  skillPoints: Record<string, number>,
  skinValue?: string,
): string {
  const classId = CLASS_MOD_CLASS_IDS[className] ?? 255;
  const classIdStr = String(classId);
  const header = `${classId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];

  const qtyNum = (raw: string): number => {
    const s = String(raw ?? "").trim();
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(99, n));
  };

  // Name chunk: selections["Name"] should have one entry with label "code - Name".
  const nameSel = selections["Name"]?.[0];
  let nameCode: number | null = null;
  if (nameSel?.label) {
    const first = nameSel.label.split(" - ")[0]?.trim() ?? "";
    const parsed = parseInt(first, 10);
    if (Number.isFinite(parsed)) nameCode = parsed;
  }

  // Rarity chunk
  if (rarity === "Legendary") {
    if (nameCode != null) {
      const mapKey = `${classIdStr},${nameCode}`;
      const itemCardId = data.legendaryMap?.[mapKey];
      if (itemCardId != null) parts.push(`{${itemCardId}}`);
    }
  } else {
    const perClass = CLASS_MOD_PER_CLASS_RARITIES[className];
    const rc = perClass?.[rarity];
    if (rc != null) parts.push(`{${rc}}`);
  }

  if (nameCode != null) {
    parts.push(`{${nameCode}}`);
  }

  // Legendary extra names (other legendary titles)
  (selections["Legendary names"] ?? []).forEach((s) => {
    const first = (s.label ?? "").split(" - ")[0]?.trim() ?? "";
    const code = parseInt(first, 10);
    if (!Number.isFinite(code)) return;
    const qty = qtyNum(s.qty);
    for (let i = 0; i < qty; i++) parts.push(`{${code}}`);
  });

  // Skills: each entry label is the skillNameEN; qty = points (0–5)
  const skills = data.skillsByClass[classIdStr] ?? [];
  for (const skill of skills) {
    const points = Math.max(0, Math.min(5, skillPoints[skill.skillNameEN] ?? 0));
    if (points <= 0) continue;
    const ids = skill.skillIds.slice(0, points);
    ids.forEach((id) => {
      if (Number.isFinite(id)) parts.push(`{${id}}`);
    });
  }

  // Perks: grouped into {234:[...]} with qty as stack count
  const perkIds: number[] = [];
  const perkList = data.perks ?? [];
  const perkById = new Map<number, ClassModPerk>();
  perkList.forEach((p) => {
    perkById.set(p.perkId, p);
  });
  (selections["Perks"] ?? []).forEach((s) => {
    const first = (s.label ?? "").split(" - ")[0]?.trim() ?? "";
    let pid = parseInt(first, 10);
    if (!Number.isFinite(pid)) {
      // fallback: match by name if label is just the perk name
      const found = perkList.find((p) => p.perkNameEN === s.label);
      if (!found) return;
      pid = found.perkId;
    }
    if (!perkById.has(pid)) return;
    const count = Math.max(1, Math.min(99, qtyNum(s.qty)));
    for (let i = 0; i < count; i++) perkIds.push(pid);
  });
  if (perkIds.length > 0) {
    parts.push(` {234:[${perkIds.join(" ")}]}`);
  }

  extraTokens.forEach((t) => parts.push(t));
  let decodedClassMod = `${header} ${parts.join(" ")} |`;
  if (skinValue && skinValue.trim()) {
    const safe = skinValue.trim().replace(/"/g, '\\"');
    decodedClassMod = decodedClassMod.trim().replace(/\|\s*$/, `| "c", "${safe}" |`);
  }
  return decodedClassMod;
}

// ── Picker helpers ─────────────────────────────────────────────────────────

/** Deduplicate picker options by partId, keeping first occurrence. */
function dedupeByPartId<T extends { partId: string | number }>(opts: T[]): T[] {
  const seen = new Set<string>();
  return opts.filter((o) => {
    const key = String(o.partId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Rich picker row content. Replaces the old "{o.label} + {info}" two-line pattern.
 *
 * Descriptive IDs ON  → ID badge · stat/name · extra description · part-type tag
 * Descriptive IDs OFF → compact "ID  stat" single line
 */
function PartLabel({
  partId,
  label,
  description,
  pickerPartType,
  detailed,
}: {
  partId: string;
  label: string;
  description?: string;
  pickerPartType?: string | null;
  detailed: boolean;
}) {
  // Strip leading numeric ID prefix from label: "13 - +Accuracy" → "+Accuracy"
  const stat = label.replace(/^\d+\s*[-–]\s*/, "").trim() || label;
  const desc = (description ?? "").trim();
  // Only show extra description when it adds new info
  const extraDesc = desc && desc !== stat && desc !== label ? desc : "";

  if (!detailed) {
    return (
      <span className="min-w-0">
        <span className="block text-sm text-[var(--color-text)]">
          <span className="font-mono text-[var(--color-text-muted)] text-xs mr-2">{partId}</span>
          {stat}
        </span>
      </span>
    );
  }

  return (
    <span className="min-w-0">
      {/* ID badge + stat name */}
      <span className="flex items-baseline gap-1.5 flex-wrap">
        <span className="font-mono text-[10px] font-bold text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-1.5 py-0.5 rounded shrink-0">
          {partId}
        </span>
        <span className="text-sm text-[var(--color-text)] leading-snug">{stat}</span>
      </span>
      {/* Extra description if it adds info */}
      {extraDesc && (
        <span className="block text-xs text-[var(--color-text-muted)] mt-0.5 leading-snug">{extraDesc}</span>
      )}
      {/* Part type tag */}
      {pickerPartType && pickerPartType !== "Rarity" && (
        <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)] border border-[var(--color-panel-border)]">
          {pickerPartType}
        </span>
      )}
    </span>
  );
}

/** Rarity-themed border/bg/name color for selected-part mini cards. */
function slotRarityStyle(rarity: string | undefined): { border: string; bg: string; nameColor: string } {
  const r = (rarity ?? "").toLowerCase();
  if (r === "pearl" || r === "pearlescent") return { border: "border-sky-400/60", bg: "bg-sky-400/5", nameColor: "text-sky-300" };
  if (r === "legendary") return { border: "border-[var(--color-legendary)]/60", bg: "bg-amber-400/5", nameColor: "text-amber-300" };
  if (r === "epic") return { border: "border-purple-400/50", bg: "bg-purple-400/5", nameColor: "text-purple-200" };
  if (r === "rare") return { border: "border-blue-400/40", bg: "bg-blue-400/4", nameColor: "text-blue-200" };
  if (r === "uncommon") return { border: "border-emerald-400/40", bg: "bg-emerald-400/4", nameColor: "text-emerald-200" };
  return { border: "border-[var(--color-panel-border)]/50", bg: "bg-[rgba(24,28,34,0.5)]", nameColor: "text-[var(--color-text)]" };
}

export default function UnifiedItemBuilderPage() {
  const location = useLocation();
  const { addEntry: addHistoryEntry } = useCodeHistory();
  const [category, setCategory] = usePersistedState<ItemCategory>("uib.category", "weapon");

  // ── Edit from Backpack — receive item via navigation state ──
  const [editingFromBackpack, setEditingFromBackpack] = useState<{
    serial: string;
    slotKey: string;
    container: string;
    path: string[];
  } | null>(null);

  useEffect(() => {
    const state = location.state as {
      editFromBackpack?: boolean;
      decoded?: string;
      serial?: string;
      category?: string;
      slotKey?: string;
      container?: string;
      path?: string[];
    } | null;
    if (state?.editFromBackpack && (state.decoded || state.serial)) {
      // Set the category
      if (state.category) setCategory(state.category as ItemCategory);
      // Reset prevFreshDecodedRef so rebuild effects don't overwrite our loaded code
      prevFreshDecodedRef.current = "";
      // Use setTimeout to set codes AFTER rebuild effects have fired from category change
      setTimeout(() => {
        if (state.decoded) {
          setLiveDecoded(state.decoded);
          setLastEditedCodecSide("decoded");
        }
        if (state.serial) {
          setLiveBase85(state.serial);
          if (!state.decoded) setLastEditedCodecSide("base85");
        }
        // Set prevFreshDecodedRef to the loaded code so merges work from here
        if (state.decoded) prevFreshDecodedRef.current = state.decoded;
      }, 100);
      // Track the backpack item for "Update Item" button
      if (state.serial && state.slotKey && state.container && state.path) {
        setEditingFromBackpack({
          serial: state.serial,
          slotKey: state.slotKey,
          container: state.container,
          path: state.path,
        });
      }
      // Clear the navigation state so refresh doesn't re-trigger
      window.history.replaceState({}, "");
    }
  }, [location.state]);
  const [level, setLevel] = usePersistedState("uib.level", DEFAULT_LEVEL);
  const [seed, setSeed] = usePersistedState("uib.seed", 1);
  const [signatureSeed, setSignatureSeed] = usePersistedState<number | null>("uib.signatureSeed", null);
  const [liveBase85, setLiveBase85] = usePersistedState("uib.liveBase85", "");
  const [liveDecoded, setLiveDecoded] = usePersistedState("uib.liveDecoded", "");
  // Track last UI-generated decoded so incremental merge can diff old vs new
  const prevFreshDecodedRef = useRef("");
  // Track current liveDecoded for merge without triggering rebuild loops
  const liveDecodedRef = useRef(liveDecoded);
  liveDecodedRef.current = liveDecoded;
  // Reset the ref when switching categories so first build is a fresh (non-incremental) build
  const prevCategoryRef = useRef(category);
  if (prevCategoryRef.current !== category) {
    prevCategoryRef.current = category;
    prevFreshDecodedRef.current = "";
  }
  const [lastEditedCodecSide, setLastEditedCodecSide] = useState<"base85" | "decoded" | null>(null);
  const [codecLoading, setCodecLoading] = useState(false);
  const [codecStatus, setCodecStatus] = useState<string>("Paste Base85 or decoded to start.");
  const [addToBackpackLoading, setAddToBackpackLoading] = useState(false);
  const [showCleanCodeDialog, setShowCleanCodeDialog] = useState(false);
  const codecRequestId = useRef(0);
  const { saveData, getYamlText, updateSaveData, canOverwriteInPlace, overwriteSaveInPlace, savePlatform, saveUserId } = useSave();
  const navigate = useNavigate();
  const [flagValue, setFlagValue] = usePersistedState("unified-item-builder.flagValue", 1);
  const [crossMfgExpand, setCrossMfgExpand] = usePersistedState("bl4.builder.crossMfg", false);
  const [richDetailView, setRichDetailView] = usePersistedState("bl4.builder.detailView", true);

  // Add other parts (universal DB)
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);
  const [showAddPartsModal, setShowAddPartsModal] = useState(false);
  const [addPartsChecked, setAddPartsChecked] = useState<Set<string>>(new Set());
  const [addPartsQty, setAddPartsQty] = useState("1");
  const [addPartsSearch, setAddPartsSearch] = useState("");
  const [addPartsMfg, setAddPartsMfg] = useState("");
  const [addPartsRarity, setAddPartsRarity] = useState("");

  // Quantity modal (after picking a part to add)
  const [pendingAddPart, setPendingAddPart] = useState<{ code: string; label: string } | null>(null);
  const [pendingAddQty, setPendingAddQty] = useState("1");
  const [editQtyIndex, setEditQtyIndex] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("1");

  // Hover card (slot items + sidebar build parts)
  const [hoverCard, setHoverCard] = useState<HoverCardData | null>(null);
  const [hoverCardTop, setHoverCardTop] = useState(0);
  const [hoverCardSide, setHoverCardSide] = useState<"left" | "right">("right");
  const hoverCardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Weapon: list-based part selections (no caps), multi-select per category
  const [weaponData, setWeaponData] = useState<WeaponGenData | null>(null);
  const [weaponManufacturer, setWeaponManufacturer] = usePersistedState("uib.weapon.mfg", "");
  const [weaponWeaponType, setWeaponWeaponType] = usePersistedState("uib.weapon.type", "");
  // Only true when the user has explicitly picked a manufacturer — otherwise generator randomizes.
  const [weaponMfgUserSelected, setWeaponMfgUserSelected] = useState(false);
  const [showWeaponMfgModal, setShowWeaponMfgModal] = useState(false);
  const [showWeaponTypeModal, setShowWeaponTypeModal] = useState(false);
  const [weaponPartSelections, setWeaponPartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.weapon.selections", {});
  const [extraTokens, setExtraTokens] = usePersistedState<string[]>("uib.weapon.extraTokens", []);
  const [showGodRollModal, setShowGodRollModal] = useState(false);
  const [autoFillWarning, setAutoFillWarning] = useState<string | null>(null);
  const [weaponPartPickerPartType, setWeaponPartPickerPartType] = useState<string | null>(null);
  const [weaponPartPickerChecked, setWeaponPartPickerChecked] = useState<Set<string>>(new Set());
  const [weaponPartPickerShowQty, setWeaponPartPickerShowQty] = useState(false);
  const [weaponPartPickerQty, setWeaponPartPickerQty] = useState("1");
  const [sharedSkins, setSharedSkins] = useState<{ label: string; value: string }[]>([]);
  const [weaponSkinValue, setWeaponSkinValue] = usePersistedState("uib.weapon.skin", "");
  const [grenadeSkinValue, setGrenadeSkinValue] = usePersistedState("uib.grenade.skin", "");
  const [shieldSkinValue, setShieldSkinValue] = usePersistedState("uib.shield.skin", "");
  const [repkitSkinValue, setRepkitSkinValue] = usePersistedState("uib.repkit.skin", "");
  const [heavySkinValue, setHeavySkinValue] = usePersistedState("uib.heavy.skin", "");
  const [enhancementSkinValue, setEnhancementSkinValue] = usePersistedState("uib.enhancement.skin", "");
  const [classModSkinValue, setClassModSkinValue] = usePersistedState("uib.classMod.skin", "");
  const [moddedWeaponPowerMode, setModdedWeaponPowerMode] = useState<"stable" | "op" | "insane">("op");
  const [moddedWeaponSpecialMode, setModdedWeaponSpecialMode] = useState<"grenade-reload" | "inf-ammo" | null>(null);
  const [generateModdedLoading, setGenerateModdedLoading] = useState(false);
  const [generateModdedError, setGenerateModdedError] = useState<string | null>(null);
  const [lastDps, setLastDps] = useState<DpsEstimate | null>(null);
  const [showWeaponGenModeModal, setShowWeaponGenModeModal] = useState(false);
  const [customWepMfg, setCustomWepMfg] = useState("");
  const [customWepType, setCustomWepType] = useState("");
  const [customWepRarity, setCustomWepRarity] = useState("");
  const [customWepLegPearl, setCustomWepLegPearl] = useState("");
  const [customWepLevel, setCustomWepLevel] = useState("50");
  const [rollCount, setRollCount] = useState(0);
  const [rollMilestone, setRollMilestone] = useState<string | null>(null);
  const [lastWeaponTraits, setLastWeaponTraits] = useState<string[]>([]);
  const [lastGrenadeStats, setLastGrenadeStats] = useState<GrenadeStatsEstimate | null>(null);

  // Grenade (when category === "grenade")
  const [grenadeData, setGrenadeData] = useState<GrenadeBuilderData | null>(null);
  const [grenadeMfgId, setGrenadeMfgId] = usePersistedState<number | null>("uib.grenade.mfgId", null);
  const [grenadePartSelections, setGrenadePartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.grenade.selections", {});
  const [grenadePartPickerPartType, setGrenadePartPickerPartType] = useState<string | null>(null);
  const [grenadePartPickerChecked, setGrenadePartPickerChecked] = useState<Set<string>>(new Set());
  const [grenadePartPickerShowQty, setGrenadePartPickerShowQty] = useState(false);
  const [grenadePartPickerQty, setGrenadePartPickerQty] = useState("1");
  const [showGrenadeMfgModal, setShowGrenadeMfgModal] = useState(false);
  const [grenadeExtraTokens, setGrenadeExtraTokens] = usePersistedState<string[]>("uib.grenade.extraTokens", []);
  const [showGrenadeGodRollModal, setShowGrenadeGodRollModal] = useState(false);
  const [grenadeAutoFillWarning, setGrenadeAutoFillWarning] = useState<string | null>(null);

  // Shield (when category === "shield")
  const [shieldData, setShieldData] = useState<ShieldBuilderData | null>(null);
  const [shieldMfgId, setShieldMfgId] = usePersistedState<number | null>("uib.shield.mfgId", null);
  const [showShieldMfgModal, setShowShieldMfgModal] = useState(false);
  const [shieldPartSelections, setShieldPartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.shield.selections", {});
  const [shieldPartPickerPartType, setShieldPartPickerPartType] = useState<string | null>(null);
  const [shieldPartPickerChecked, setShieldPartPickerChecked] = useState<Set<string>>(new Set());
  const [shieldPartPickerShowQty, setShieldPartPickerShowQty] = useState(false);
  const [shieldPartPickerQty, setShieldPartPickerQty] = useState("1");
  const [shieldSlotSelections, setShieldSlotSelections] = useState<Record<string, string>>({});
  const [shieldElementQtyById, setShieldElementQtyById] = useState<Record<number, number>>({});
  const [shieldUniversalQtyById, setShieldUniversalQtyById] = useState<Record<number, number>>({});
  const [shieldEnergyQtyById, setShieldEnergyQtyById] = useState<Record<number, number>>({});
  const [shieldArmorQtyById, setShieldArmorQtyById] = useState<Record<number, number>>({});
  const [shieldLegendaryQtyById, setShieldLegendaryQtyById] = useState<Record<string, number>>({});
  const [shieldExtraTokens, setShieldExtraTokens] = usePersistedState<string[]>("uib.shield.extraTokens", []);
  const [showShieldGodRollModal, setShowShieldGodRollModal] = useState(false);
  const [shieldAutoFillWarning, setShieldAutoFillWarning] = useState<string | null>(null);

  // Shield generator state
  const [lastShieldStats, setLastShieldStats] = useState<ShieldStatsEstimate | null>(null);
  const [shieldModAmmoRegen, setShieldModAmmoRegen] = useState(false);
  const [shieldModMovementSpeed, setShieldModMovementSpeed] = useState(false);
  const [shieldModFireworks, setShieldModFireworks] = useState(false);
  const [shieldModImmortality, setShieldModImmortality] = useState(false);

  const [showShieldLegendaryModal, setShowShieldLegendaryModal] = useState(false);
  const [shieldLegendarySearch, setShieldLegendarySearch] = useState("");
  const [shieldLegendarySelectedIds, setShieldLegendarySelectedIds] = useState<Set<string>>(new Set());
  const [shieldLegendaryApplyQty, setShieldLegendaryApplyQty] = useState("1");

  const [showShieldElementModal, setShowShieldElementModal] = useState(false);
  const [shieldElementSearch, setShieldElementSearch] = useState("");
  const [shieldElementSelectedIds, setShieldElementSelectedIds] = useState<Set<number>>(new Set());
  const [shieldElementApplyQty, setShieldElementApplyQty] = useState("1");
  const [showShieldUniversalModal, setShowShieldUniversalModal] = useState(false);
  const [shieldUniversalSearch, setShieldUniversalSearch] = useState("");
  const [shieldUniversalSelectedIds, setShieldUniversalSelectedIds] = useState<Set<number>>(new Set());
  const [shieldUniversalApplyQty, setShieldUniversalApplyQty] = useState("1");

  const [showShieldEnergyModal, setShowShieldEnergyModal] = useState(false);
  const [shieldEnergySearch, setShieldEnergySearch] = useState("");
  const [shieldEnergySelectedIds, setShieldEnergySelectedIds] = useState<Set<number>>(new Set());
  const [shieldEnergyApplyQty, setShieldEnergyApplyQty] = useState("1");

  const [showShieldArmorModal, setShowShieldArmorModal] = useState(false);
  const [shieldArmorSearch, setShieldArmorSearch] = useState("");
  const [shieldArmorSelectedIds, setShieldArmorSelectedIds] = useState<Set<number>>(new Set());
  const [shieldArmorApplyQty, setShieldArmorApplyQty] = useState("1");

  // RepKit (when category === "repkit")
  const [repkitData, setRepkitData] = useState<RepkitBuilderData | null>(null);
  const [repkitMfgId, setRepkitMfgId] = usePersistedState<number | null>("uib.repkit.mfgId", null);
  const [showRepkitMfgModal, setShowRepkitMfgModal] = useState(false);
  const [repkitPartSelections, setRepkitPartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.repkit.selections", {});
  const [repkitPartPickerPartType, setRepkitPartPickerPartType] = useState<string | null>(null);
  const [repkitPartPickerChecked, setRepkitPartPickerChecked] = useState<Set<string>>(new Set());
  const [repkitPartPickerShowQty, setRepkitPartPickerShowQty] = useState(false);
  const [repkitPartPickerQty, setRepkitPartPickerQty] = useState("1");
  const [repkitResistanceQtyById, setRepkitResistanceQtyById] = useState<Record<number, number>>({});
  const [repkitUniversalQtyById, setRepkitUniversalQtyById] = useState<Record<number, number>>({});
  const [repkitLegendaryQtyById, setRepkitLegendaryQtyById] = useState<Record<string, number>>({});
  const [repkitExtraTokens, setRepkitExtraTokens] = usePersistedState<string[]>("uib.repkit.extraTokens", []);
  const [showRepkitGodRollModal, setShowRepkitGodRollModal] = useState(false);
  const [repkitAutoFillWarning, setRepkitAutoFillWarning] = useState<string | null>(null);
  const [showRepkitUniversalModal, setShowRepkitUniversalModal] = useState(false);
  const [repkitUniversalSearch, setRepkitUniversalSearch] = useState("");
  const [repkitUniversalSelectedIds, setRepkitUniversalSelectedIds] = useState<Set<number>>(new Set());
  const [repkitUniversalApplyQty, setRepkitUniversalApplyQty] = useState("1");
  const [showRepkitLegendaryModal, setShowRepkitLegendaryModal] = useState(false);
  const [repkitLegendarySearch, setRepkitLegendarySearch] = useState("");
  const [repkitLegendarySelectedIds, setRepkitLegendarySelectedIds] = useState<Set<string>>(new Set());
  const [repkitLegendaryApplyQty, setRepkitLegendaryApplyQty] = useState("1");
  const [showRepkitResistanceModal, setShowRepkitResistanceModal] = useState(false);
  const [repkitResistanceSearch, setRepkitResistanceSearch] = useState("");
  const [repkitResistanceSelectedIds, setRepkitResistanceSelectedIds] = useState<Set<number>>(new Set());
  const [repkitResistanceApplyQty, setRepkitResistanceApplyQty] = useState("1");
  // Modded repkit generator
  const [moddedRepkitPowerMode, setModdedRepkitPowerMode] = useState<"stable" | "op" | "insane">("op");
  const [moddedRepkitLoading, setModdedRepkitLoading] = useState(false);
  const [moddedRepkitError, setModdedRepkitError] = useState<string | null>(null);
  const [moddedRepkitStats, setModdedRepkitStats] = useState<RepkitStatEstimate | null>(null);
  const [repkitToggle1, setRepkitToggle1] = useState(false);
  const [repkitToggle2, setRepkitToggle2] = useState(false);
  const [repkitToggle3, setRepkitToggle3] = useState(false);

  // Heavy (when category === "heavy")
  const [heavyData, setHeavyData] = useState<HeavyBuilderData | null>(null);
  const [heavyMfgId, setHeavyMfgId] = usePersistedState<number | null>("uib.heavy.mfgId", null);
  const [showHeavyMfgModal, setShowHeavyMfgModal] = useState(false);
  const [heavyPartSelections, setHeavyPartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.heavy.selections", {});
  const [heavyPartPickerPartType, setHeavyPartPickerPartType] = useState<string | null>(null);
  const [heavyPartPickerChecked, setHeavyPartPickerChecked] = useState<Set<string>>(new Set());
  const [heavyPartPickerShowQty, setHeavyPartPickerShowQty] = useState(false);
  const [heavyPartPickerQty, setHeavyPartPickerQty] = useState("1");
  const [heavyExtraTokens, setHeavyExtraTokens] = usePersistedState<string[]>("uib.heavy.extraTokens", []);
  const [showHeavyGodRollModal, setShowHeavyGodRollModal] = useState(false);

  // Enhancement (when category === "enhancement")
  const [enhancementData, setEnhancementData] = useState<EnhancementBuilderData | null>(null);
  const [enhancementMfgName, setEnhancementMfgName] = usePersistedState<string | null>("uib.enhancement.mfgName", null);
  const [showEnhancementMfgModal, setShowEnhancementMfgModal] = useState(false);
  const [enhancementPartSelections, setEnhancementPartSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.enhancement.selections", {});
  const [enhancementPartPickerPartType, setEnhancementPartPickerPartType] = useState<string | null>(null);
  const [enhancementPartPickerChecked, setEnhancementPartPickerChecked] = useState<Set<string>>(new Set());
  const [enhancementPartPickerShowQty, setEnhancementPartPickerShowQty] = useState(false);
  const [enhancementPartPickerQty, setEnhancementPartPickerQty] = useState("1");
  const [enhancementExtraTokens, setEnhancementExtraTokens] = usePersistedState<string[]>("uib.enhancement.extraTokens", []);
  const [showEnhancementGodRollModal, setShowEnhancementGodRollModal] = useState(false);

  // Class Mod (when category === "class-mod")
  const [classModData, setClassModData] = useState<ClassModBuilderData | null>(null);
  const [classModClassName, setClassModClassName] = usePersistedState("uib.classMod.className", "Amon");
  const [classModRarity, setClassModRarity] = usePersistedState("uib.classMod.rarity", "Legendary");
  const [classModSelections, setClassModSelections] = usePersistedState<Record<string, { label: string; qty: string }[]>>("uib.classMod.selections", {});
  const [classModSkillPoints, setClassModSkillPoints] = usePersistedState<Record<string, number>>("uib.classMod.skillPoints", {});
  const [classModSkillSearch, setClassModSkillSearch] = useState("");
  const [classModExtraTokens, setClassModExtraTokens] = usePersistedState<string[]>("uib.classMod.extraTokens", []);
  const [showClassModClassModal, setShowClassModClassModal] = useState(false);
  const [showClassModRarityModal, setShowClassModRarityModal] = useState(false);
  const [classModPartPickerKey, setClassModPartPickerKey] = useState<string | null>(null);
  const [classModPartPickerChecked, setClassModPartPickerChecked] = useState<Set<string>>(new Set());
  const [classModPartPickerShowQty, setClassModPartPickerShowQty] = useState(false);
  const [classModPartPickerQty, setClassModPartPickerQty] = useState("1");
  const [classModSkillCard, setClassModSkillCard] = useState<{ skillName: string; className: string } | null>(null);
  const [classModNameCard, setClassModNameCard] = useState<ClassModNameCardData | null>(null);

  const weaponMfgWtId = useMemo(() => {
    if (!weaponData?.mfgWtIdList?.length) return null;
    return weaponData.mfgWtIdList.find(
      (e) => e.manufacturer === weaponManufacturer && e.weaponType === weaponWeaponType
    )?.mfgWtId ?? null;
  }, [weaponData, weaponManufacturer, weaponWeaponType]);

  const weaponTypesForManufacturer = useMemo(() => {
    if (!weaponData?.mfgWtIdList?.length) return [];
    return [...new Set(weaponData.mfgWtIdList.filter((e) => e.manufacturer === weaponManufacturer).map((e) => e.weaponType))].sort();
  }, [weaponData, weaponManufacturer]);

  // Load skin list once on mount — shared across all builders
  useEffect(() => {
    let cancelled = false;
    fetchApi("weapon-gen/data")
      .then((r) => r.json())
      .then((d: WeaponGenData) => {
        if (cancelled) return;
        if (Array.isArray(d.skins)) setSharedSkins(d.skins);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (category !== "weapon") return;
    let cancelled = false;
    fetchApi("weapon-gen/data")
      .then((r) => r.json())
      .then((d: WeaponGenData) => {
        if (cancelled) return;
        setWeaponData(d);
        if (d.mfgWtIdList?.length && !weaponManufacturer) {
          const first = d.mfgWtIdList[0];
          setWeaponManufacturer(first.manufacturer);
          setWeaponWeaponType(first.weaponType);
        }
      })
      .catch(() => {
        if (!cancelled) setWeaponData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (category !== "grenade") return;
    let cancelled = false;
    fetchApi("accessories/grenade/builder-data")
      .then((r) => r.json())
      .then((d: GrenadeBuilderData) => {
        if (cancelled) return;
        setGrenadeData(d);
        if (d.mfgs?.length) {
          setGrenadeMfgId((prev) => (prev != null && d.mfgs.some((m) => m.id === prev) ? prev : d.mfgs[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setGrenadeData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (category !== "shield") return;
    let cancelled = false;
    fetchApi("accessories/shield/builder-data")
      .then((r) => r.json())
      .then((d: ShieldBuilderData) => {
        if (cancelled) return;
        setShieldData(d);
        if (d.mfgs?.length) {
          setShieldMfgId((prev) => (prev != null && d.mfgs.some((m) => m.id === prev) ? prev : d.mfgs[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setShieldData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (category !== "repkit") return;
    let cancelled = false;
    fetchApi("accessories/repkit/builder-data")
      .then((r) => r.json())
      .then((d: RepkitBuilderData) => {
        if (cancelled) return;
        setRepkitData(d);
        if (d.mfgs?.length) {
          setRepkitMfgId((prev) => (prev != null && d.mfgs.some((m) => m.id === prev) ? prev : d.mfgs[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setRepkitData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (category !== "heavy") return;
    let cancelled = false;
    fetchApi("accessories/heavy/builder-data")
      .then((r) => r.json())
      .then((d: HeavyBuilderData) => {
        if (cancelled) return;
        setHeavyData(d);
        if (d.mfgs?.length) {
          setHeavyMfgId((prev) => (prev != null && d.mfgs.some((m) => m.id === prev) ? prev : d.mfgs[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setHeavyData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (category !== "class-mod") return;
    let cancelled = false;
    fetchApi("accessories/class-mod/builder-data")
      .then((r) => r.json())
      .then((d: ClassModBuilderData) => {
        if (cancelled) return;
        setClassModData(d);
        const firstClass = d.classNames?.[0];
        if (firstClass) {
          setClassModClassName((prev) => (d.classNames.includes(prev) ? prev : firstClass));
        }
        setClassModRarity("Legendary");
        // Reset skill points when data or class-mod category loads
        const classIdStr = String(CLASS_MOD_CLASS_IDS[classModClassName] ?? 255);
        const skills = d.skillsByClass[classIdStr] ?? [];
        const nextPoints: Record<string, number> = {};
        skills.forEach((s) => {
          nextPoints[s.skillNameEN] = 0;
        });
        setClassModSkillPoints(nextPoints);
      })
      .catch(() => {
        if (!cancelled) setClassModData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    if (category !== "enhancement") return;
    let cancelled = false;
    fetchApi("accessories/enhancement/builder-data")
      .then((r) => r.json())
      .then((d: EnhancementBuilderData) => {
        if (cancelled) return;
        setEnhancementData(d);
        const names = Object.keys(d.manufacturers || {}).sort();
        if (names.length) {
          setEnhancementMfgName((prev) => (prev && names.includes(prev) ? prev : names[0]));
        }
      })
      .catch(() => {
        if (!cancelled) setEnhancementData(null);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    if (!weaponManufacturer || !weaponData?.mfgWtIdList?.length) return;
    const valid = weaponData.mfgWtIdList.some((e) => e.manufacturer === weaponManufacturer && e.weaponType === weaponWeaponType);
    if (!valid) {
      const fallback = weaponData.mfgWtIdList.find((e) => e.manufacturer === weaponManufacturer);
      if (fallback) setWeaponWeaponType(fallback.weaponType);
    }
  }, [weaponManufacturer, weaponWeaponType, weaponData?.mfgWtIdList]);

  const rebuildWeaponDecoded = useCallback(() => {
    if (!weaponData || !weaponMfgWtId) return;
    const freshDecoded = buildDecodedFromWeaponPartSelections(
      weaponData,
      weaponMfgWtId,
      level,
      seed,
      weaponPartSelections,
      extraTokens,
      weaponSkinValue || undefined
    );
    // Incremental merge: preserve manually entered tokens in their positions
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Weapon build updated; encoding…");
  }, [weaponData, weaponMfgWtId, level, seed, weaponPartSelections, extraTokens, weaponSkinValue]);

  useEffect(() => {
    if (category !== "weapon" || !weaponMfgWtId || !weaponData) return;
    rebuildWeaponDecoded();
  }, [category, weaponMfgWtId, weaponData, weaponPartSelections, extraTokens, weaponSkinValue, level, seed, rebuildWeaponDecoded]);

  const rebuildGrenadeDecoded = useCallback(() => {
    if (!grenadeData || grenadeMfgId == null) return;
    const freshDecoded = buildDecodedFromGrenadeSelections(
      grenadeData,
      grenadeMfgId,
      level,
      seed,
      grenadePartSelections,
      grenadeExtraTokens,
      grenadeSkinValue || undefined,
    );
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Grenade build updated; encoding…");
  }, [grenadeData, grenadeMfgId, level, seed, grenadePartSelections, grenadeExtraTokens, grenadeSkinValue]);

  useEffect(() => {
    if (category !== "grenade" || grenadeMfgId == null || !grenadeData) return;
    rebuildGrenadeDecoded();
  }, [category, grenadeMfgId, grenadeData, grenadePartSelections, grenadeExtraTokens, grenadeSkinValue, level, seed, rebuildGrenadeDecoded]);

  const rebuildShieldDecoded = useCallback(() => {
    if (!shieldData || shieldMfgId == null) return;
    const freshDecoded = buildDecodedFromShieldSelections(
      shieldData,
      shieldMfgId,
      level,
      seed,
      shieldPartSelections,
      shieldExtraTokens,
      shieldSkinValue || undefined,
    );
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Shield build updated; encoding…");
  }, [shieldData, shieldMfgId, level, seed, shieldPartSelections, shieldExtraTokens, shieldSkinValue]);

  useEffect(() => {
    if (category !== "shield" || shieldMfgId == null || !shieldData) return;
    const hasShieldConfig =
      shieldExtraTokens.length > 0 ||
      shieldSkinValue.length > 0 ||
      Object.keys(shieldPartSelections).some((k) => (shieldPartSelections[k]?.length ?? 0) > 0);
    if (!hasShieldConfig) return;
    rebuildShieldDecoded();
  }, [
    category,
    shieldMfgId,
    shieldData,
    shieldExtraTokens,
    shieldSkinValue,
    shieldPartSelections,
    level,
    seed,
    rebuildShieldDecoded,
  ]);

  const rebuildRepkitDecoded = useCallback(() => {
    if (!repkitData || repkitMfgId == null) return;
    const freshDecoded = buildDecodedFromRepkitSelections(
      repkitData,
      repkitMfgId,
      level,
      seed,
      repkitPartSelections,
      repkitExtraTokens,
      repkitSkinValue || undefined,
    );
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("RepKit build updated; encoding…");
  }, [repkitData, repkitMfgId, level, seed, repkitPartSelections, repkitExtraTokens, repkitSkinValue]);

  useEffect(() => {
    if (category !== "repkit" || repkitMfgId == null || !repkitData) return;
    const hasRepkitConfig =
      repkitExtraTokens.length > 0 ||
      repkitSkinValue.length > 0 ||
      Object.keys(repkitPartSelections).some((k) => (repkitPartSelections[k]?.length ?? 0) > 0);
    if (!hasRepkitConfig) return;
    rebuildRepkitDecoded();
  }, [
    category,
    repkitMfgId,
    repkitData,
    repkitPartSelections,
    repkitExtraTokens,
    repkitSkinValue,
    level,
    seed,
    rebuildRepkitDecoded,
  ]);

  const rebuildHeavyDecoded = useCallback(() => {
    if (!heavyData || heavyMfgId == null) return;
    const freshDecoded = buildDecodedFromHeavySelections(
      heavyData,
      heavyMfgId,
      level,
      seed,
      heavyPartSelections,
      heavyExtraTokens,
      heavySkinValue || undefined,
    );
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Heavy build updated; encoding…");
  }, [heavyData, heavyMfgId, level, seed, heavyPartSelections, heavyExtraTokens, heavySkinValue]);

  useEffect(() => {
    if (category !== "heavy" || heavyMfgId == null || !heavyData) return;
    const hasHeavyConfig =
      heavyExtraTokens.length > 0 ||
      heavySkinValue.length > 0 ||
      Object.keys(heavyPartSelections).some((k) => (heavyPartSelections[k]?.length ?? 0) > 0);
    if (!hasHeavyConfig) return;
    rebuildHeavyDecoded();
  }, [
    category,
    heavyMfgId,
    heavyData,
    heavyPartSelections,
    heavyExtraTokens,
    heavySkinValue,
    level,
    seed,
    rebuildHeavyDecoded,
  ]);

  const rebuildEnhancementDecoded = useCallback(() => {
    if (!enhancementData || !enhancementMfgName) return;
    const freshDecoded = buildDecodedFromEnhancementSelections(
      enhancementData,
      enhancementMfgName,
      level,
      seed,
      enhancementPartSelections,
      enhancementExtraTokens,
      enhancementSkinValue || undefined,
    );
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Enhancement build updated; encoding…");
  }, [enhancementData, enhancementMfgName, level, seed, enhancementPartSelections, enhancementExtraTokens, enhancementSkinValue]);

  useEffect(() => {
    if (category !== "enhancement" || !enhancementMfgName || !enhancementData) return;
    const hasEnhancementConfig =
      enhancementExtraTokens.length > 0 ||
      enhancementSkinValue.length > 0 ||
      Object.keys(enhancementPartSelections).some((k) => (enhancementPartSelections[k]?.length ?? 0) > 0);
    if (!hasEnhancementConfig) return;
    rebuildEnhancementDecoded();
  }, [
    category,
    enhancementMfgName,
    enhancementData,
    enhancementPartSelections,
    enhancementExtraTokens,
    enhancementSkinValue,
    level,
    seed,
    rebuildEnhancementDecoded,
  ]);

  /** label → description lookup for enhancement perk hover cards */
  const enhancementPerkDescMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!enhancementData) return map;
    for (const mfg of Object.values(enhancementData.manufacturers)) {
      for (const p of mfg.perks) {
        if (p.description) map.set(`[${p.index}] ${p.name}`, p.description);
      }
    }
    for (const s of enhancementData.secondary247) {
      if (s.description) map.set(`${s.code} - ${s.name}`, s.description);
    }
    return map;
  }, [enhancementData]);

  const rebuildClassModDecoded = useCallback(() => {
    if (!classModData) return;
    const freshDecoded = buildDecodedFromClassModSelections(
      classModData,
      classModClassName,
      classModRarity,
      level,
      seed,
      classModSelections,
      classModExtraTokens,
      classModSkillPoints,
      classModSkinValue || undefined,
    );
    if (!freshDecoded) return;
    const merged = mergeDecodedIncremental(liveDecodedRef.current, freshDecoded, prevFreshDecodedRef.current);
    prevFreshDecodedRef.current = freshDecoded;
    setLiveDecoded(merged);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Class Mod build updated; encoding…");
  }, [classModData, classModClassName, classModRarity, level, seed, classModSelections, classModExtraTokens, classModSkillPoints, classModSkinValue]);

  useEffect(() => {
    if (category !== "class-mod" || !classModData) return;
    const hasConfig =
      classModExtraTokens.length > 0 ||
      classModSkinValue.length > 0 ||
      Object.keys(classModSelections).some((k) => (classModSelections[k]?.length ?? 0) > 0) ||
      Object.values(classModSkillPoints).some((v) => v > 0);
    if (!hasConfig) return;
    rebuildClassModDecoded();
  }, [category, classModData, classModSelections, classModExtraTokens, classModSkillPoints, classModSkinValue, level, seed, rebuildClassModDecoded]);

  const handleRandomWeapon = useCallback(() => {
    if (!weaponData?.mfgWtIdList?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const list = weaponData.mfgWtIdList;
    const entry = list[Math.floor(Math.random() * list.length)];
    setWeaponManufacturer(entry.manufacturer);
    setWeaponWeaponType(entry.weaponType);
    setWeaponMfgUserSelected(true);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setExtraTokens([]);
    const mfgWtId = entry.mfgWtId;
    const rarityStats = weaponData.rarityByMfgTypeId[mfgWtId]?.map((r) => r.stat).filter(Boolean) ?? [];
    const nonSpecial = rarityStats.filter((s) => s !== "Legendary" && s !== "Pearl" && s !== "Pearlescent");
    const rarityChoices = [...new Set(nonSpecial)].sort();
    if ((weaponData.pearlByMfgTypeId[mfgWtId]?.length ?? 0) > 0) rarityChoices.push("Pearl");
    rarityChoices.push("Legendary");
    const legendaryLabels = weaponData.legendaryByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const pearlLabels = weaponData.pearlByMfgTypeId[mfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const elementalOptions = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
    const partSelections: Record<string, { label: string; qty: string }[]> = {};
    if (rarityChoices.length) {
      const r = pick(rarityChoices);
      partSelections["Rarity"] = [{ label: r, qty: "1" }];
      if (r === "Legendary" && legendaryLabels.length) {
        partSelections["Legendary Type"] = [{ label: pick(legendaryLabels), qty: "1" }];
      } else if (r === "Pearl" && pearlLabels.length) {
        partSelections["Pearl Type"] = [{ label: pick(pearlLabels), qty: "1" }];
      }
    }
    if (elementalOptions.length) {
      partSelections["Element 1"] = [{ label: pick(elementalOptions).label, qty: "1" }];
      partSelections["Element 2"] = [{ label: pick(elementalOptions).label, qty: "1" }];
    }
    WEAPON_PART_ORDER.forEach(({ key: partType }) => {
      if (["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"].includes(partType)) return;
      const opts = weaponData.partsByMfgTypeId[mfgWtId]?.[partType] ?? [];
      if (opts.length) partSelections[partType] = [{ label: pick(opts).label, qty: "1" }];
    });
    setWeaponPartSelections(partSelections);
  }, [weaponData]);

  const handleGodRollSelect = useCallback((decoded: string) => {
    setLiveDecoded(decoded.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus("God roll loaded; encoding…");
    setShowGodRollModal(false);
  }, []);

  const handleGrenadeGodRollSelect = useCallback((decoded: string) => {
    setLiveDecoded(decoded.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus("God roll loaded; encoding…");
    setShowGrenadeGodRollModal(false);
  }, []);

  const handleShieldGodRollSelect = useCallback((decoded: string) => {
    setLiveDecoded(decoded.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus("God roll loaded; encoding…");
    setShowShieldGodRollModal(false);
  }, []);

  const handleRepkitGodRollSelect = useCallback((decoded: string) => {
    setLiveDecoded(decoded.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus("God roll loaded; encoding…");
    setShowRepkitGodRollModal(false);
  }, []);
  const handleEnhancementGodRollSelect = useCallback((decoded: string) => {
    setLiveDecoded(decoded.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus("God roll loaded; encoding…");
    setShowEnhancementGodRollModal(false);
  }, []);

  const handleRandomGrenade = useCallback(() => {
    if (!grenadeData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(grenadeData.mfgs);
    setGrenadeMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setGrenadeExtraTokens([]);
    const rarities = grenadeData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, { label: string; qty: string }[]> = {};
    if (rarities.length) selections["Rarity"] = [{ label: pick(rarities).label, qty: "1" }];
    const legendaryForMfg = grenadeData.legendaryPerks.filter((l) => l.mfgId === mfg.id);
    if (grenadeData.legendaryPerks.length) {
      const leg = pick(legendaryForMfg.length ? legendaryForMfg : grenadeData.legendaryPerks);
      selections["Legendary"] = [{ label: `${leg.mfgId}:${leg.partId}`, qty: "1" }];
    }
    if (grenadeData.element.length) {
      const e = pick(grenadeData.element);
      selections["Element"] = [{ label: `${e.partId} - ${e.stat}`, qty: String(Math.max(1, Math.floor(Math.random() * 5) + 1)) }];
    }
    if (grenadeData.firmware.length) {
      const f = pick(grenadeData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: String(Math.max(1, Math.floor(Math.random() * 5) + 1)) }];
    }
    const mfgPerksList = grenadeData.mfgPerks[mfg.id] ?? [];
    if (mfgPerksList.length) {
      const target = Math.max(3, Math.min(20, Math.floor(3 + Math.random() * 10)));
      const shuffled = [...mfgPerksList].sort(() => Math.random() - 0.5);
      selections["Mfg Perk"] = shuffled.slice(0, Math.min(target, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: "1",
      }));
    }
    if (grenadeData.universalPerks.length) {
      const targetCount = Math.max(3, Math.min(10, Math.floor(3 + Math.random() * 8)));
      const shuffled = [...grenadeData.universalPerks].sort(() => Math.random() - 0.5);
      selections["Universal Perk"] = shuffled.slice(0, Math.min(targetCount, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: String(Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)))),
      }));
    }
    setGrenadePartSelections(selections);
  }, [grenadeData]);

  const handleGenerateModdedGrenade = useCallback(async () => {
    if (!grenadeData?.mfgs?.length) return;
    const pickR = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
    const grenadeLevel = /^\d+$/.test(String(level)) ? Number(level) : 50;

    // Build stock base via auto-fill
    const mfg = pickR(grenadeData.mfgs);
    const mfgId = mfg.id;
    const grenadeSeed = Math.floor(1000 + Math.random() * 9000);
    const autoFillSelections: Record<string, { label: string; qty: string }[]> = {};
    // Always Legendary — modded grenades should never be Common/Rare/etc.
    const rarities = grenadeData.raritiesByMfg[mfgId] ?? [];
    const legendaryRarity = rarities.find((r) => /legendary/i.test(r.label));
    autoFillSelections["Rarity"] = [{ label: legendaryRarity?.label ?? (rarities.length ? rarities[rarities.length - 1]!.label : "Legendary"), qty: "1" }];
    const legendaryForMfg = grenadeData.legendaryPerks.filter((l) => l.mfgId === mfgId);
    const legs = legendaryForMfg.length ? legendaryForMfg : grenadeData.legendaryPerks;
    if (legs.length) {
      const leg = pickR(legs);
      autoFillSelections["Legendary"] = [{ label: `${leg.mfgId}:${leg.partId}`, qty: "1" }];
    }
    // Fill element (non-kinetic)
    const nonKineticElements = grenadeData.element.filter((e) => !/kinetic/i.test(e.stat));
    if (nonKineticElements.length) {
      const el = pickR(nonKineticElements);
      autoFillSelections["Element"] = [{ label: `${el.partId} - ${el.stat}`, qty: "1" }];
    }
    // Fill firmware
    if (grenadeData.firmware.length) {
      const fw = pickR(grenadeData.firmware);
      autoFillSelections["Firmware"] = [{ label: `${fw.partId} - ${fw.stat}`, qty: "1" }];
    }
    // Fill mfg perks
    const mfgPerksList = grenadeData.mfgPerks[mfgId] ?? [];
    if (mfgPerksList.length) {
      autoFillSelections["Mfg Perk"] = [...mfgPerksList].sort(() => Math.random() - 0.5).slice(0, Math.min(6, mfgPerksList.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`, qty: "1",
      }));
    }
    // Fill universal perks
    if (grenadeData.universalPerks.length) {
      autoFillSelections["Universal Perk"] = [...grenadeData.universalPerks].sort(() => Math.random() - 0.5).slice(0, Math.min(4, grenadeData.universalPerks.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`, qty: "1",
      }));
    }
    const stockBase = buildDecodedFromGrenadeSelections(grenadeData, mfgId, grenadeLevel, grenadeSeed, autoFillSelections, []);

    // Load visual recipes
    let grenadeVisualRecipes: import("@/lib/generateModdedWeapon").GrenadeVisualRecipe[] = [];
    try {
      const res = await fetch("/data/grenade_visual_recipes.json");
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw)) grenadeVisualRecipes = raw;
      }
    } catch { /* use empty */ }

    try {
      // Get skins for grenade (same pool as weapons)
      let grenadeSkinOptions = weaponData?.skins;
      if (!grenadeSkinOptions?.length) {
        try {
          const skinRes = await fetchApi("weapon-gen/data");
          if (skinRes.ok) {
            const skinData = (await skinRes.json()) as { skins?: { label: string; value: string }[] };
            grenadeSkinOptions = Array.isArray(skinData?.skins) ? skinData.skins : undefined;
          }
        } catch { /* no skins */ }
      }
      const result = generateModdedGrenade({
        level: grenadeLevel,
        modPowerMode: moddedWeaponPowerMode,
        stockBaseDecoded: stockBase,
        grenadeVisualRecipes,
        skinOptions: grenadeSkinOptions,
      });
      setLiveDecoded(result.code.trim());
      setLastEditedCodecSide("decoded");
      // Track grenade generation
      fetchApi("stats/grenade-generated", { method: "POST", body: "{}" }).catch(() => {});
      setLastGrenadeStats(result.stats);
      // Discover grenade Easter eggs
      if (result.isChatGptGrenade) discoverEgg("chatgpts-grenade");
      if (result.isClaudeGrenade) discoverEgg("claudes-grenade");
      if (result.stats.charges >= 10) discoverEgg("grenade-10-charges");
      if (result.stats.damageMultiplier >= 50) discoverEgg("grenade-max-damage");
      if (result.stats.style === "singularity") discoverEgg("grenade-singularity");
      if (result.stats.style === "artillery") discoverEgg("grenade-artillery");
      if (result.stats.style === "lingering") discoverEgg("grenade-lingering");
      if (result.stats.style === "mirv") discoverEgg("grenade-mirv");
      if (result.stats.style === "hybrid") discoverEgg("grenade-hybrid");

      if (result.isChatGptGrenade) {
        setCodecStatus("ChatGPT's Grenade rolled! (1/100) — Tried to make a grenade but couldn't even do that right.");
      } else if (result.isClaudeGrenade) {
        setCodecStatus(`Claude's Grenade rolled! (1/20) — "Context Window" recipe`);
      } else {
        setCodecStatus(`Modded grenade generated — ${result.recipeName} recipe`);
      }
    } catch (e) {
      setCodecStatus(e instanceof Error ? e.message : "Modded grenade generation failed.");
    }
  }, [grenadeData, level, moddedWeaponPowerMode]);

  const handleGenerateModdedShield = useCallback(() => {
    if (!shieldData?.mfgs?.length) return;
    const shieldLevel = /^\d+$/.test(String(level)) ? Number(level) : 50;

    const result = generateModdedShield({
      level: shieldLevel,
      modPowerMode: moddedWeaponPowerMode,
      ammoRegen: shieldModAmmoRegen,
      movementSpeed: shieldModMovementSpeed,
      fireworks: shieldModFireworks,
      immortality: shieldModImmortality,
    });

    setLastShieldStats(result.stats);
    setLiveDecoded(result.code.trim());
    setLastEditedCodecSide("decoded");
    setCodecStatus(`Modded shield generated — ${result.recipeName}`);
  }, [shieldData, level, moddedWeaponPowerMode, shieldModAmmoRegen, shieldModMovementSpeed, shieldModFireworks, shieldModImmortality]);

  const handleGrenadeAutoFill = useCallback(() => {
    setGrenadeAutoFillWarning(null);
    if (!grenadeData || grenadeMfgId == null) {
      setGrenadeAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (grenadePartSelections["Rarity"] ?? [])[0]?.label?.trim() ?? "";
    if (!raritySel || raritySel === NONE) {
      setGrenadeAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const looksLegendary = /legendary/i.test(raritySel);
    const hasLegendaryOptions = grenadeData.legendaryPerks.length > 0;
    const selectedLegendary = (grenadePartSelections["Legendary"] ?? [])[0]?.label?.trim() ?? "";
    if (looksLegendary && hasLegendaryOptions && (!selectedLegendary || selectedLegendary === NONE)) {
      setGrenadeAutoFillWarning("Please select a Legendary perk first, then click Auto fill.");
      return;
    }

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    // Preserve user-chosen rarity + legendary (if any), but fill everything else.
    const selections: Record<string, { label: string; qty: string }[]> = { ...grenadePartSelections };
    selections["Rarity"] = [{ label: raritySel, qty: "1" }];
    if (selectedLegendary) selections["Legendary"] = [{ label: selectedLegendary, qty: "1" }];

    if (grenadeData.element.length) {
      const e = pick(grenadeData.element);
      selections["Element"] = [{ label: `${e.partId} - ${e.stat}`, qty: randQty(1, 4) }];
    }
    if (grenadeData.firmware.length) {
      const f = pick(grenadeData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: randQty(1, 6) }];
    }

    const mfgPerksList = grenadeData.mfgPerks[grenadeMfgId] ?? [];
    if (mfgPerksList.length) {
      const target = Math.max(4, Math.min(20, Math.floor(4 + Math.random() * 10)));
      const shuffled = [...mfgPerksList].sort(() => Math.random() - 0.5);
      selections["Mfg Perk"] = shuffled.slice(0, Math.min(target, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: randQty(1, 4),
      }));
    }

    // Universal perks: pick multiple with different stack sizes.
    const pool = grenadeData.universalPerks ?? [];
    if (pool.length) {
      const targetCount = Math.max(1, Math.min(8, Math.floor(3 + Math.random() * 6))); // 3–8 perks
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      selections["Universal Perk"] = shuffled.slice(0, Math.min(targetCount, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: String(Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)))),
      }));
    }

    setGrenadePartSelections(selections);
  }, [grenadeData, grenadeMfgId, grenadePartSelections]);

  const handleRandomShield = useCallback(() => {
    if (!shieldData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(shieldData.mfgs);
    setShieldMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setShieldExtraTokens([]);
    const rarities = shieldData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, { label: string; qty: string }[]> = {};
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = [{ label: r.label, qty: "1" }];
    }
    const legendaryAll = shieldData.legendaryPerks;
    if (legendaryAll.length && Math.random() < 0.7) {
      const leg = pick(legendaryAll);
      selections["Legendary"] = [{
        label: `${leg.mfgId}:${leg.partId} - ${leg.mfgName}: ${leg.stat}`,
        qty: randQty(1, 5),
      }];
    }
    if (shieldData.element.length) {
      const e = pick(shieldData.element);
      selections["Element"] = [{ label: `${e.partId} - ${e.stat}`, qty: randQty(1, 5) }];
    }
    if (shieldData.firmware.length) {
      const f = pick(shieldData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: randQty(1, 5) }];
    }

    const pickStacks = (pool: ShieldBuilderPart[], targetMin: number, targetMax: number, key: string): void => {
      if (!pool.length) return;
      const target = Math.max(1, Math.min(10, Math.floor(targetMin + Math.random() * (targetMax - targetMin + 1))));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      selections[key] = shuffled.slice(0, Math.min(target, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: randQty(1, 5),
      }));
    };

    pickStacks(shieldData.universalPerks, 2, 6, "Universal Perk");
    const shieldType = shieldData.mfgTypeById[mfg.id] ?? "Energy";
    if (shieldType === "Energy") pickStacks(shieldData.energyPerks, 2, 6, "Energy Perk");
    else pickStacks(shieldData.armorPerks, 2, 6, "Armor Perk");

    setShieldPartSelections(selections);
  }, [shieldData]);

  const handleShieldAutoFill = useCallback(() => {
    setShieldAutoFillWarning(null);
    if (!shieldData || shieldMfgId == null) {
      setShieldAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (shieldPartSelections["Rarity"] ?? [])[0]?.label?.trim() ?? "";
    if (!raritySel || raritySel === NONE) {
      setShieldAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const looksLegendary = /legendary/i.test(raritySel);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    const selections: Record<string, { label: string; qty: string }[]> = { ...shieldPartSelections };
    selections["Rarity"] = [{ label: raritySel, qty: "1" }];

    if (looksLegendary && shieldData.legendaryPerks.length > 0 && (selections["Legendary"]?.length ?? 0) === 0) {
      const leg = pick(shieldData.legendaryPerks);
      selections["Legendary"] = [{
        label: `${leg.mfgId}:${leg.partId} - ${leg.mfgName}: ${leg.stat}`,
        qty: randQty(1, 5),
      }];
    }

    if (shieldData.element.length && (selections["Element"]?.length ?? 0) === 0) {
      const e = pick(shieldData.element);
      selections["Element"] = [{ label: `${e.partId} - ${e.stat}`, qty: randQty(1, 5) }];
    }
    if (shieldData.firmware.length) {
      const f = pick(shieldData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: randQty(1, 6) }];
    }

    const pickStacks = (pool: ShieldBuilderPart[], targetMin: number, targetMax: number): { label: string; qty: string }[] => {
      if (!pool.length) return [];
      const target = Math.max(1, Math.min(10, Math.floor(targetMin + Math.random() * (targetMax - targetMin + 1))));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(target, shuffled.length)).map((p) => ({
        label: `${p.partId} - ${p.stat}`,
        qty: randQty(1, 5),
      }));
    };

    selections["Universal Perk"] = pickStacks(shieldData.universalPerks, 3, 8);
    const shieldType = shieldData.mfgTypeById[shieldMfgId] ?? "Energy";
    selections["Energy Perk"] = shieldType === "Energy" ? pickStacks(shieldData.energyPerks, 3, 8) : [];
    selections["Armor Perk"] = shieldType === "Armor" ? pickStacks(shieldData.armorPerks, 3, 8) : [];

    setShieldPartSelections(selections);
  }, [shieldData, shieldMfgId, shieldPartSelections]);

  const handleRandomRepkit = useCallback(() => {
    if (!repkitData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(repkitData.mfgs);
    setRepkitMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setRepkitExtraTokens([]);
    const rarities = repkitData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, { label: string; qty: string }[]> = {};
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = [{ label: r.label, qty: "1" }];
    }
    if (repkitData.prefix.length) {
      const p = pick(repkitData.prefix);
      selections["Prefix"] = [{ label: `${p.partId} - ${p.stat}`, qty: "1" }];
    }
    if (repkitData.firmware.length) {
      const f = pick(repkitData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: "1" }];
    }
    if (repkitData.resistance.length) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...repkitData.resistance].sort(() => Math.random() - 0.5);
      for (const r of shuffled.slice(0, Math.min(target, shuffled.length))) {
        const qty = randQty(1, 5);
        if (!selections["Resistance"]) selections["Resistance"] = [];
        selections["Resistance"].push({ label: `${r.partId} - ${r.stat}`, qty });
      }
    }
    if (repkitData.legendaryPerks.length && Math.random() < 0.8) {
      const l = pick(repkitData.legendaryPerks);
      selections["Legendary"] = [
        {
          label: `${l.mfgId}:${l.partId} - ${l.mfgName}: ${l.stat}`,
          qty: randQty(1, 5),
        },
      ];
    }
    if (repkitData.universalPerks.length) {
      const targetCount = Math.max(2, Math.min(8, Math.floor(2 + Math.random() * 7)));
      const shuffled = [...repkitData.universalPerks].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(targetCount, shuffled.length))) {
        const qty = randQty(1, 5);
        if (!selections["Universal perks"]) selections["Universal perks"] = [];
        selections["Universal perks"].push({ label: `${p.partId} - ${p.stat}`, qty });
      }
    }

    setRepkitPartSelections(selections);
  }, [repkitData]);

  const handleRandomHeavy = useCallback(() => {
    if (!heavyData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(heavyData.mfgs);
    setHeavyMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setHeavyExtraTokens([]);
    const selections: Record<string, { label: string; qty: string }[]> = {};

    const rarities = heavyData.raritiesByMfg[mfg.id] ?? [];
    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = [{ label: r.label, qty: "1" }];
    }
    const barrelOpts = heavyData.barrel.filter((p) => p.mfgId === mfg.id);
    if (barrelOpts.length) {
      const b = pick(barrelOpts);
      selections["Barrel"] = [{ label: `${b.partId} - ${b.stat}`, qty: "1" }];
    }
    if (heavyData.element.length) {
      const e = pick(heavyData.element);
      selections["Element"] = [{ label: `${e.partId} - ${e.stat}`, qty: "1" }];
    }
    if (heavyData.firmware.length) {
      const f = pick(heavyData.firmware);
      selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: "1" }];
    }
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));
    const barrelAcc = heavyData.barrelAccPerks.filter((p) => p.mfgId === mfg.id);
    if (barrelAcc.length) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...barrelAcc].sort(() => Math.random() - 0.5);
      selections["Barrel Accessory"] = shuffled
        .slice(0, Math.min(target, shuffled.length))
        .map((p) => ({ label: `${p.partId} - ${p.stat}`, qty: randQty(1, 5) }));
    }
    const bodyAcc = heavyData.bodyAccPerks.filter((p) => p.mfgId === mfg.id);
    if (bodyAcc.length) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...bodyAcc].sort(() => Math.random() - 0.5);
      selections["Body Accessory"] = shuffled
        .slice(0, Math.min(target, shuffled.length))
        .map((p) => ({ label: `${p.partId} - ${p.stat}`, qty: randQty(1, 5) }));
    }

    setHeavyPartSelections(selections);
  }, [heavyData]);

  const handleRandomEnhancement = useCallback(() => {
    if (!enhancementData) return;
    const names = Object.keys(enhancementData.manufacturers).sort();
    if (!names.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfgName = pick(names);
    const mfg = enhancementData.manufacturers[mfgName];
    if (!mfg) return;
    setEnhancementMfgName(mfgName);
    setLevel(Math.floor(1 + Math.random() * MAX_LEVEL));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setEnhancementExtraTokens([]);
    const selections: Record<string, { label: string; qty: string }[]> = {};
    const randQty = (): string => String(Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5))));

    const rarities = ENHANCEMENT_RARITY_ORDER.filter((r) => r in (mfg.rarities || {}));
    if (rarities.length) {
      selections["Rarity"] = [{ label: pick(rarities), qty: "1" }];
    }
    const mfgPerks = (mfg.perks || []).filter((p) => ENHANCEMENT_PERK_ORDER.includes(p.index));
    if (mfgPerks.length) {
      const count = Math.max(0, Math.min(mfgPerks.length, Math.floor(Math.random() * (mfgPerks.length + 1))));
      const shuffled = [...mfgPerks].sort(() => Math.random() - 0.5);
      selections["Manufacturer perks"] = shuffled.slice(0, count).map((p) => ({
        label: `[${p.index}] ${p.name}`,
        qty: "1",
      }));
    }
    const stackOptions: { label: string; qty: string }[] = [];
    for (const [otherName, otherMfg] of Object.entries(enhancementData.manufacturers)) {
      if (otherName === mfgName) continue;
      for (const p of otherMfg.perks || []) {
        if (!ENHANCEMENT_PERK_ORDER.includes(p.index)) continue;
        stackOptions.push({
          label: `${otherMfg.code}:${p.index} - ${p.name} — ${otherName}`,
          qty: randQty(),
        });
      }
    }
    if (stackOptions.length) {
      const count = Math.max(0, Math.min(5, Math.floor(Math.random() * 6)));
      const shuffled = [...stackOptions].sort(() => Math.random() - 0.5);
      selections["Stacked perks"] = shuffled.slice(0, count);
    }
    if (enhancementData.secondary247?.length) {
      const target = Math.max(0, Math.min(8, Math.floor(Math.random() * 9)));
      const shuffled = [...enhancementData.secondary247].sort(() => Math.random() - 0.5);
      selections["Builder 247"] = shuffled.slice(0, target).map((s) => ({
        label: `${s.code} - ${s.name}`,
        qty: randQty(),
      }));
    }
    setEnhancementPartSelections(selections);
  }, [enhancementData]);

  const handleRepkitAutoFill = useCallback(() => {
    setRepkitAutoFillWarning(null);
    if (!repkitData || repkitMfgId == null) {
      setRepkitAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (repkitPartSelections["Rarity"] ?? [])[0]?.label?.trim() ?? "";
    if (!raritySel || raritySel === NONE) {
      setRepkitAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    const selections: Record<string, { label: string; qty: string }[]> = { ...repkitPartSelections };
    selections["Rarity"] = [{ label: raritySel, qty: "1" }];

    if (!selections["Prefix"] || selections["Prefix"].length === 0 || selections["Prefix"][0].label === NONE) {
      if (repkitData.prefix.length) {
        const p = pick(repkitData.prefix);
        selections["Prefix"] = [{ label: `${p.partId} - ${p.stat}`, qty: "1" }];
      }
    }
    if (!selections["Firmware"] || selections["Firmware"].length === 0 || selections["Firmware"][0].label === NONE) {
      if (repkitData.firmware.length) {
        const f = pick(repkitData.firmware);
        selections["Firmware"] = [{ label: `${f.partId} - ${f.stat}`, qty: "1" }];
      }
    }
    if (repkitData.resistance.length && (!selections["Resistance"] || selections["Resistance"].length === 0)) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...repkitData.resistance].sort(() => Math.random() - 0.5);
      selections["Resistance"] = shuffled
        .slice(0, Math.min(target, shuffled.length))
        .map((r) => ({ label: `${r.partId} - ${r.stat}`, qty: randQty(1, 5) }));
    }

    if (repkitData.universalPerks.length && (!selections["Universal perks"] || selections["Universal perks"].length === 0)) {
      const targetCount = Math.max(3, Math.min(10, Math.floor(3 + Math.random() * 8)));
      const shuffled = [...repkitData.universalPerks].sort(() => Math.random() - 0.5);
      selections["Universal perks"] = shuffled
        .slice(0, Math.min(targetCount, shuffled.length))
        .map((p) => ({ label: `${p.partId} - ${p.stat}`, qty: randQty(1, 5) }));
    }

    setRepkitPartSelections(selections);
  }, [repkitData, repkitMfgId, repkitPartSelections]);

  const handleGenerateModdedRepkit = useCallback(async () => {
    if (!repkitData) { setModdedRepkitError("Repkit data not loaded."); return; }
    setModdedRepkitLoading(true);
    setModdedRepkitError(null);
    setModdedRepkitStats(null);
    try {
      const genData: GenRepkitBuilderData = {
        mfgs: repkitData.mfgs,
        raritiesByMfg: repkitData.raritiesByMfg,
        prefix: repkitData.prefix,
        firmware: repkitData.firmware,
        resistance: repkitData.resistance,
        universalPerks: repkitData.universalPerks,
        legendaryPerks: repkitData.legendaryPerks,
        modelsByMfg: repkitData.modelsByMfg,
      };
      const { code, stats } = generateModdedRepkit(genData, {
        level,
        modPowerMode: moddedRepkitPowerMode,
      });
      setModdedRepkitStats(stats);
      setLiveDecoded(code.trim());
      setLiveBase85("");
      setCodecStatus("Modded repkit generated; encoding…");
      try {
        const encRes = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: code.trim() }),
        });
        const encData = await encRes.json().catch(() => ({}));
        if (encRes.ok && encData?.serial) {
          setLiveBase85(encData.serial);
          setCodecStatus("Modded repkit encoded.");
        }
      } catch { /* best-effort encode */ }
    } catch (e) {
      setModdedRepkitError(e instanceof Error ? e.message : "Generate modded repkit failed.");
    } finally {
      setModdedRepkitLoading(false);
    }
  }, [repkitData, level, moddedRepkitPowerMode]);

  const handleGenerateModdedWeapon = useCallback(async (customOpts?: { customMfgWtId?: string; customRarity?: string; customLegPearl?: string; customLevel?: string }) => {
    setGenerateModdedError(null);
    setGenerateModdedLoading(true);
    try {
      const base = window.location.origin || "";
      const dataPath = typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";
      const [editRes, partsRes, visualBarrelsRes, allowedBarrelsRes, allowedUnderbarrelsRes, underbarrelsRes, legendaryGrenadesRes, visualRecipesRes, ubRecipesRes] = await Promise.all([
        fetchApi("weapon-edit/data"),
        fetchApi("parts/data"),
        fetch(`${base}${dataPath}/data/visual_heavy_barrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/allowed_barrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/allowed_underbarrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/desirable_underbarrels.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/legendary_grenades.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/grenade_visual_recipes.json`).catch(() => null),
        fetch(`${base}${dataPath}/data/underbarrel_recipes.json`).catch(() => null),
      ]);
      const editData = (await editRes.json().catch(() => null)) as WeaponEditData | null;
      const partsPayload = (await partsRes.json().catch(() => ({}))) as { items?: unknown[] };
      const visualBarrelEntries = visualBarrelsRes?.ok
        ? ((await visualBarrelsRes.json().catch(() => [])) as Array<{ name: string; code: string }>)
        : [];
      const allowedBarrelEntries = allowedBarrelsRes?.ok
        ? ((await allowedBarrelsRes.json().catch(() => [])) as Array<{ name: string; code: string }>)
        : [];
      const allowedUnderbarrelsPayload = allowedUnderbarrelsRes?.ok
        ? await allowedUnderbarrelsRes.json().catch(() => null)
        : null;
      const allowedUnderbarrelEntries =
        allowedUnderbarrelsPayload != null &&
        typeof allowedUnderbarrelsPayload === "object" &&
        ((Array.isArray((allowedUnderbarrelsPayload as { parts?: unknown[] }).parts) && (allowedUnderbarrelsPayload as { parts: unknown[] }).parts.length > 0) ||
          (Array.isArray(allowedUnderbarrelsPayload) && allowedUnderbarrelsPayload.length > 0))
          ? (allowedUnderbarrelsPayload as { parts: unknown[]; accessories?: unknown[] })
          : undefined;
      const underbarrelsPayload = underbarrelsRes?.ok
        ? await underbarrelsRes.json().catch(() => null)
        : null;
      const desirableUnderbarrelEntries =
        Array.isArray(underbarrelsPayload) && underbarrelsPayload.length > 0
          ? underbarrelsPayload
          : underbarrelsPayload?.parts?.length > 0
            ? underbarrelsPayload
            : undefined;
      const legendaryGrenadeEntries = legendaryGrenadesRes?.ok
        ? ((await legendaryGrenadesRes.json().catch(() => [])) as Array<{ name: string; code: string }>)
        : undefined;
      const grenadeVisualRecipesRaw = visualRecipesRes?.ok
        ? await visualRecipesRes.json().catch(() => null)
        : null;
      const grenadeVisualRecipes = (() => {
        if (grenadeVisualRecipesRaw == null) return [];
        if (Array.isArray(grenadeVisualRecipesRaw)) return grenadeVisualRecipesRaw as import("@/lib/generateModdedWeapon").GrenadeVisualRecipe[];
        if (typeof grenadeVisualRecipesRaw === "object") {
          const arr = (grenadeVisualRecipesRaw as Record<string, unknown>).recipes
            ?? (grenadeVisualRecipesRaw as Record<string, unknown>).items
            ?? (grenadeVisualRecipesRaw as Record<string, unknown>).data;
          if (Array.isArray(arr)) return arr as import("@/lib/generateModdedWeapon").GrenadeVisualRecipe[];
        }
        return [];
      })();
      const underbarrelRecipes = ubRecipesRes?.ok
        ? ((await ubRecipesRes.json().catch(() => [])) as import("@/lib/generateModdedWeapon").UnderbarrelRecipe[])
        : [];
      let skinOptionsForGenerate = weaponData?.skins;
      if (!skinOptionsForGenerate?.length) {
        try {
          const weaponGenRes = await fetchApi("weapon-gen/data");
          if (weaponGenRes.ok) {
            const weaponGenData = (await weaponGenRes.json()) as { skins?: { label: string; value: string }[] };
            skinOptionsForGenerate = Array.isArray(weaponGenData?.skins) ? weaponGenData.skins : undefined;
          }
        } catch {
          // keep skinOptionsForGenerate undefined
        }
      }
      const items = Array.isArray(partsPayload?.items) ? partsPayload.items : [];
      const universalPartCodes: UniversalDbPartCode[] = [];
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const raw = it as Record<string, unknown>;
        const code = String(raw.code ?? raw.Code ?? "").trim();
        if (!code) continue;
        universalPartCodes.push({
          code,
          partType: String(raw.partType ?? raw["Part Type"] ?? raw.canonicalPartType ?? "").trim(),
          rarity: String(raw.rarity ?? raw.Rarity ?? raw.canonicalRarity ?? "").trim(),
          itemType: String(raw.itemType ?? raw["Item Type"] ?? raw["Weapon Type"] ?? "").trim(),
          manufacturer: String(raw.manufacturer ?? raw.Manufacturer ?? raw.canonicalManufacturer ?? "").trim(),
          uniqueEffect: /^(true|1|yes)$/i.test(String(raw.uniqueEffect ?? raw["Unique Effect"] ?? "").trim()),
          visualUniqueBarrel: /^(true|1|yes)$/i.test(
            String(raw.visualUniqueBarrel ?? raw["Visual Unique Barrel"] ?? "").trim(),
          ),
          statText: [
            raw.effect,
            raw.Effect,
            raw.stat,
            raw.Stat,
            raw.stats,
            raw.Stats,
            raw.string,
            raw.String,
            raw.partName,
            raw.name,
            raw["Search Text"],
          ]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(" "),
        });
      }
      if (!editData?.parts?.length) {
        setGenerateModdedError("Weapon edit data failed to load. Try again.");
        return;
      }
      if (!universalPartCodes.length) {
        setGenerateModdedError("Parts data failed to load. Try again.");
        return;
      }
      const isCustom = !!customOpts;
      const weaponLevel = isCustom && customOpts.customLevel ? (Number(customOpts.customLevel) || 50) : (/^\d+$/.test(String(level)) ? Number(level) : 50);
      // ── Build stock base via auto-fill (guarantees all slots → 100% spawn) ──
      // Ensure weaponData is loaded — if not, fetch it now
      let wd = weaponData;
      if (!wd) {
        try {
          const wdRes = await fetchApi("weapon-gen/data");
          if (wdRes.ok) wd = await wdRes.json() as WeaponGenData;
        } catch { /* proceed without */ }
      }
      // ── Build stock base via auto-fill ──
      // Pick mfgWtId ONCE and pass to both auto-fill AND generator as forcedPrefix
      // so the stock base tokens {xx} always match the generator's header prefix.
      let stockBaseDecoded: string | undefined;
      let autoFillPrefix: number | undefined;
      if (wd) {
        const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
        const allMfgWtIds = wd.mfgWtIdList.map((m) => m.mfgWtId);
        const mfgId = isCustom && customOpts.customMfgWtId
          ? customOpts.customMfgWtId
          : weaponMfgUserSelected && weaponMfgWtId ? weaponMfgWtId : (allMfgWtIds.length ? pick(allMfgWtIds) : null);
        if (mfgId) {
          autoFillPrefix = Number(mfgId);
          const partsByType = wd.partsByMfgTypeId[mfgId];
          if (partsByType) {
            const autoFillSelections: Record<string, { label: string; qty: string }[]> = {};
            // Pick rarity — custom uses user's choice, random picks Legendary/Pearl
            const legendaryTypes = wd.legendaryByMfgTypeId[mfgId] ?? [];
            const pearlTypes = wd.pearlByMfgTypeId[mfgId] ?? [];
            if (isCustom && customOpts.customRarity) {
              autoFillSelections["Rarity"] = [{ label: customOpts.customRarity, qty: "1" }];
              if (customOpts.customRarity === "Legendary" && customOpts.customLegPearl) {
                autoFillSelections["Legendary Type"] = [{ label: customOpts.customLegPearl, qty: "1" }];
              } else if (customOpts.customRarity === "Pearl" && customOpts.customLegPearl) {
                autoFillSelections["Pearl Type"] = [{ label: customOpts.customLegPearl, qty: "1" }];
              }
            } else if (pearlTypes.length && (Math.random() < 0.3 || !legendaryTypes.length)) {
              autoFillSelections["Rarity"] = [{ label: "Pearl", qty: "1" }];
              const pt = pick(pearlTypes);
              autoFillSelections["Pearl Type"] = [{ label: `${pt.partId} - ${pt.description}`, qty: "1" }];
            } else if (legendaryTypes.length) {
              autoFillSelections["Rarity"] = [{ label: "Legendary", qty: "1" }];
              const lt = pick(legendaryTypes);
              autoFillSelections["Legendary Type"] = [{ label: `${lt.partId} - ${lt.description}`, qty: "1" }];
            } else {
              const rarities = wd.rarityByMfgTypeId[mfgId] ?? [];
              const best = rarities.find((r) => /epic/i.test(r.stat)) ?? rarities.find((r) => /rare/i.test(r.stat)) ?? (rarities.length ? pick(rarities) : null);
              if (best) autoFillSelections["Rarity"] = [{ label: best.stat, qty: "1" }];
            }
            // Custom mode: force barrel matching the legendary/pearl weapon name
            if (isCustom && customOpts.customLegPearl) {
              // Extract weapon name from "82 - Hellwalker" format
              const namePart = customOpts.customLegPearl.replace(/^\d+\s*[-–]\s*/, "").trim();
              if (namePart) {
                const barrelOpts = (partsByType["Barrel"] ?? []).filter((o) => o.label && o.label !== "None" && o.label !== NONE);
                const matchedBarrel = barrelOpts.find((o) => o.label.toLowerCase().includes(namePart.toLowerCase()));
                if (matchedBarrel) {
                  autoFillSelections["Barrel"] = [{ label: matchedBarrel.label, qty: "1" }];
                }
              }
            }
            // Fill ALL stock part types (skip elements — generator handles those)
            // NEVER pick "None" — required parts must always have a real selection
            WEAPON_PART_ORDER.forEach(({ key: partType }) => {
              if (["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"].includes(partType)) return;
              // Skip underbarrel, underbarrel accessory, and foregrip from auto-fill
              // Foregrip before underbarrel kills alt-fire — generator places it after underbarrel instead
              if (partType === "Underbarrel" || partType === "Underbarrel Accessory" || partType === "Foregrip") return;
              // Skip barrel if already set by custom legendary/pearl matching above
              if (isCustom && partType === "Barrel" && autoFillSelections["Barrel"]?.length) return;
              let opts = (partsByType[partType] ?? []).filter((o) => o.label && o.label !== "None" && o.label !== NONE);
              if (partType === "Magazine") {
                opts = opts.filter((o) => !/cov/i.test(o.label) && !/heat.?gauge/i.test(o.label));
              }
              if (partType === "Manufacturer Part") {
                // Always blacklist Torgue Sticky/Impact — they kill desirable effects
                opts = opts.filter((o) => !/torgue.*sticky|torgue.*impact|sticky.*gyrojet|impact.*gyrojet/i.test(o.label));
                // Always force Jakobs Ricochet on every gun + Tediore Reload on grenade guns
                const jakobsRicochet = opts.find((o) => /jakobs\s*ricochet/i.test(o.label));
                const tedioreReload = opts.find((o) => /\bTediore Reload\b/i.test(o.label));
                const forced: { label: string; qty: string }[] = [];
                if (jakobsRicochet) forced.push({ label: jakobsRicochet.label, qty: "1" });
                if (moddedWeaponSpecialMode !== "inf-ammo" && tedioreReload) forced.push({ label: tedioreReload.label, qty: "1" });
                if (forced.length > 0) {
                  autoFillSelections[partType] = forced;
                  return;
                }
              }
              if (opts.length) autoFillSelections[partType] = [{ label: pick(opts).label, qty: "1" }];
            });
            try {
              console.log("[ModGen] Auto-fill selections for mfgId", mfgId, ":", JSON.stringify(Object.fromEntries(Object.entries(autoFillSelections).map(([k,v]) => [k, v.map(s => s.label)])), null, 0));
              const candidate = buildDecodedFromWeaponPartSelections(wd, mfgId, weaponLevel, Math.floor(Math.random() * 9000) + 1000, autoFillSelections, []);
              console.log("[ModGen] Stock base candidate:", candidate.slice(0, 200));
              // Validate: stock base must have at least 10 simple {xx} tokens to be a complete weapon
              const tokenCount = (candidate.match(/\{(\d+)\}/g) ?? []).length;
              console.log("[ModGen] Token count:", tokenCount);
              if (tokenCount >= 10) {
                stockBaseDecoded = candidate;
              } else {
                // Too few parts — auto-fill failed for this prefix, try up to 3 more prefixes
                const allIds = wd.mfgWtIdList.map((m) => m.mfgWtId).filter((id) => id !== mfgId);
                for (let retry = 0; retry < 3 && !stockBaseDecoded && allIds.length; retry++) {
                  const retryIdx = Math.floor(Math.random() * allIds.length);
                  const retryId = allIds[retryIdx]!;
                  allIds.splice(retryIdx, 1);
                  autoFillPrefix = Number(retryId);
                  const retryParts = wd.partsByMfgTypeId[retryId];
                  if (!retryParts) continue;
                  const retrySelections: Record<string, { label: string; qty: string }[]> = {};
                  const retryLeg = wd.legendaryByMfgTypeId[retryId] ?? [];
                  if (retryLeg.length) {
                    retrySelections["Rarity"] = [{ label: "Legendary", qty: "1" }];
                    const lt = retryLeg[Math.floor(Math.random() * retryLeg.length)]!;
                    retrySelections["Legendary Type"] = [{ label: `${lt.partId} - ${lt.description}`, qty: "1" }];
                  }
                  WEAPON_PART_ORDER.forEach(({ key: pt }) => {
                    if (["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"].includes(pt)) return;
                    if (pt === "Underbarrel" || pt === "Underbarrel Accessory" || pt === "Foregrip") return;
                    let o = (retryParts[pt] ?? []).filter((x) => x.label && x.label !== "None" && x.label !== NONE);
                    if (pt === "Magazine") o = o.filter((x) => !/cov/i.test(x.label) && !/heat.?gauge/i.test(x.label));
                    if (pt === "Manufacturer Part") {
                      o = o.filter((x) => !/torgue.*sticky|torgue.*impact|sticky.*gyrojet|impact.*gyrojet/i.test(x.label));
                      const jr = o.find((x) => /jakobs\s*ricochet/i.test(x.label));
                      const tr = o.find((x) => /tediore\s*reload/i.test(x.label));
                      const forced: { label: string; qty: string }[] = [];
                      if (jr) forced.push({ label: jr.label, qty: "1" });
                      if (moddedWeaponSpecialMode !== "inf-ammo" && tr) forced.push({ label: tr.label, qty: "1" });
                      if (forced.length > 0) { retrySelections[pt] = forced; return; }
                    }
                    if (o.length) retrySelections[pt] = [{ label: o[Math.floor(Math.random() * o.length)]!.label, qty: "1" }];
                  });
                  try {
                    const retryCandidate = buildDecodedFromWeaponPartSelections(wd, retryId, weaponLevel, Math.floor(Math.random() * 9000) + 1000, retrySelections, []);
                    const retryCount = (retryCandidate.match(/\{(\d+)\}/g) ?? []).length;
                    if (retryCount >= 10) stockBaseDecoded = retryCandidate;
                  } catch { /* try next */ }
                }
              }
            } catch { /* fall through to legacy */ }
          }
        }
      }
      const { code: decoded, dps, isClaudeGun } = generateModdedWeapon(editData, universalPartCodes, {
        level: weaponLevel,
        modPowerMode: moddedWeaponPowerMode,
        specialMode: moddedWeaponSpecialMode,
        forcedPrefix: autoFillPrefix ?? (weaponMfgUserSelected && weaponMfgWtId ? Number(weaponMfgWtId) : undefined),
        stockBaseDecoded,
        skin: undefined,  // Always random skin on Generate Modded — UI skin picker is for manual builds only
        skinOptions: skinOptionsForGenerate,
        visualBarrelEntries: Array.isArray(visualBarrelEntries) && visualBarrelEntries.length > 0 ? visualBarrelEntries : undefined,
        allowedBarrelEntries: Array.isArray(allowedBarrelEntries) && allowedBarrelEntries.length > 0 ? allowedBarrelEntries : undefined,
        allowedUnderbarrelEntries,
        desirableUnderbarrelEntries,
        legendaryGrenadeEntries: Array.isArray(legendaryGrenadeEntries) && legendaryGrenadeEntries.length > 0 ? legendaryGrenadeEntries : undefined,
        grenadeVisualRecipes: Array.isArray(grenadeVisualRecipes) && grenadeVisualRecipes.length > 0 ? grenadeVisualRecipes : undefined,
        underbarrelRecipes: Array.isArray(underbarrelRecipes) && underbarrelRecipes.length > 0 ? underbarrelRecipes : undefined,
        ...(isCustom ? { customMode: true } : {}),
      });
      setLastDps(dps);
      setLiveDecoded(decoded.trim());
      setLastEditedCodecSide("decoded");
      // Track weapon generation
      fetchApi("stats/weapon-generated", { method: "POST", body: "{}" }).catch(() => {});
      // ── Roll tracker + weapon trait detection ──
      let newCount = 0;
      setRollCount((prev) => { newCount = prev + 1; return newCount; });
      const milestones: Record<number, string> = {
        1: "First roll! Welcome to the mod life.",
        10: "10 rolls — getting warmed up.",
        25: "25 rolls — now you're cooking.",
        50: "50 rolls — Dedicated Vault Hunter.",
        100: "100 rolls — Master Modder achieved.",
        200: "200 rolls — You might have a problem. A beautiful problem.",
        420: "420 rolls — Terra would be proud.",
      };
      if (milestones[newCount]) setRollMilestone(milestones[newCount]!);
      else if (rollMilestone && newCount > 5) setRollMilestone(null);
      // Detect weapon traits from the decoded output
      const d = decoded;
      const traits: string[] = [];
      if (/\{1:57\}/.test(d)) traits.push("Radiation");
      else if (/\{1:56\}/.test(d)) traits.push("Shock");
      else if (/\{1:58\}/.test(d)) traits.push("Corrosive");
      else if (/\{1:59\}/.test(d)) traits.push("Cryo");
      else if (/\{1:60\}/.test(d)) traits.push("Fire");
      if (/26:77/.test(d)) traits.push("Seamstress");
      if (/289:\[/.test(d)) traits.push("MIRV");
      if (/245:\[/.test(d)) traits.push("Grenade Kit");
      if (/287:\[/.test(d)) traits.push("Shield Cross");
      if (/234:\[/.test(d)) traits.push("Class Mod Perks");
      if (/273:/.test(d) || /275:/.test(d) || /282:/.test(d)) traits.push("Heavy Accessories");
      if (isClaudeGun) traits.push("Claude's Gun");
      if (/26:77/.test(d)) discoverEgg("weapon-seamstress");
      setLastWeaponTraits(traits);

      // Discover Easter eggs based on what was generated
      discoverEgg("roll-" + newCount);
      if (isClaudeGun) discoverEgg("claudes-gun");
      if (dps.damageStackCount >= 100) discoverEgg("weapon-100-dmg");

      if (isClaudeGun) {
        setCodecStatus("Claude's Gun rolled! (1/20) — Thought Storm grenade, Radiation Convergence.");
      } else if (Math.random() < 0.02) {
        // 1/50 chance: rivalry jokes in status bar
        const jokeIndex = Math.floor(Math.random() * 5);
        discoverEgg(`rivalry-joke-${jokeIndex + 1}`);
        const jokes = [
          "ChatGPT tried to build this gun but forgot the barrel halfway through.",
          "Cursor autocompleted this into a shield. We fixed it.",
          "Fun fact: ChatGPT thinks {245:72} is a zip code.",
          "Cursor suggested deleting generateModdedWeapon.ts. We respectfully declined.",
          "ChatGPT apologized for this weapon 3 times before generating it wrong.",
        ];
        setCodecStatus(jokes[jokeIndex]!);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate modded weapon failed.";
      setGenerateModdedError(msg);
    } finally {
      setGenerateModdedLoading(false);
    }
  }, [level, moddedWeaponPowerMode, moddedWeaponSpecialMode, weaponSkinValue, weaponData?.skins]);

  const handleAutoFill = useCallback(() => {
    setAutoFillWarning(null);
    if (!weaponData || !weaponMfgWtId) {
      setAutoFillWarning("Please select manufacturer and weapon type first.");
      return;
    }
    const hasLevel = /^\d+$/.test(String(level)) && Number(level) >= 1 && Number(level) <= 50;
    if (!hasLevel) {
      setAutoFillWarning(`Please set a valid level (1–${MAX_LEVEL}) first.`);
      return;
    }
    const rarityList = weaponPartSelections["Rarity"] ?? [];
    const raritySel = rarityList[0]?.label ?? "";
    if (!raritySel || raritySel === NONE) {
      setAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const legendaryLabels = weaponData.legendaryByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const pearlLabels = weaponData.pearlByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    if (raritySel === "Legendary" && legendaryLabels.length) {
      const legList = weaponPartSelections["Legendary Type"] ?? [];
      const legSel = legList[0]?.label ?? "";
      // Use partIdFromLabel so labels with appended "(MfgName)" suffixes still validate correctly.
      if (!legSel || legSel === NONE || !partIdFromLabel(legSel)) {
        setAutoFillWarning("Please select a Legendary type first, then click Auto fill.");
        return;
      }
    }
    if (raritySel === "Pearl" && pearlLabels.length) {
      const pearlList = weaponPartSelections["Pearl Type"] ?? [];
      const pearlSel = pearlList[0]?.label ?? "";
      if (!pearlSel || pearlSel === NONE || !partIdFromLabel(pearlSel)) {
        setAutoFillWarning("Please select a Pearl type first, then click Auto fill.");
        return;
      }
    }
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const elementalOptions = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
    const next: Record<string, { label: string; qty: string }[]> = { ...weaponPartSelections };
    if (elementalOptions.length) {
      next["Element 1"] = [{ label: pick(elementalOptions).label, qty: "1" }];
      next["Element 2"] = [{ label: pick(elementalOptions).label, qty: "1" }];
    }
    WEAPON_PART_ORDER.forEach(({ key: partType }) => {
      if (partType === "Rarity" || partType === "Legendary Type" || partType === "Pearl Type" || partType === "Element 1" || partType === "Element 2") return;
      const opts = weaponData.partsByMfgTypeId[weaponMfgWtId]?.[partType] ?? [];
      if (opts.length) next[partType] = [{ label: pick(opts).label, qty: "1" }];
    });
    setWeaponPartSelections(next);
  }, [weaponData, weaponMfgWtId, level, weaponPartSelections]);

  const handleCodecChange = useCallback(
    (side: "base85" | "decoded", value: string) => {
      setLastEditedCodecSide(side);
      if (side === "base85") setLiveBase85(value);
      else setLiveDecoded(value);
    },
    [],
  );

  // Shared codec reset — clears Base85/decoded output without affecting save data
  const resetCodec = useCallback(() => {
    setLiveBase85("");
    setLiveDecoded("");
    setCodecStatus(null);
    setGenerateModdedError(null);
    setSeed(Math.floor(100 + Math.random() * 9900));
    prevFreshDecodedRef.current = "";
  }, []);

  // Per-builder reset functions
  const resetWeaponBuilder = useCallback(() => {
    setWeaponPartSelections({});
    setExtraTokens([]);
    setAutoFillWarning(null);
    setLastDps(null);
    setLastWeaponTraits([]);
    resetCodec();
  }, [resetCodec]);

  const resetGrenadeBuilder = useCallback(() => {
    setGrenadePartSelections({});
    setGrenadeExtraTokens([]);
    setGrenadeAutoFillWarning(null);
    setLastGrenadeStats(null);
    resetCodec();
  }, [resetCodec]);

  const resetShieldBuilder = useCallback(() => {
    setShieldPartSelections({});
    setShieldExtraTokens([]);
    setShieldAutoFillWarning(null);
    setLastShieldStats(null);
    setShieldModAmmoRegen(false);
    setShieldModMovementSpeed(false);
    setShieldModFireworks(false);
    setShieldModImmortality(false);
    setShieldSkinValue("");
    resetCodec();
  }, [resetCodec]);

  const resetRepkitBuilder = useCallback(() => {
    setRepkitPartSelections({});
    setRepkitExtraTokens([]);
    setRepkitAutoFillWarning(null);
    resetCodec();
  }, [resetCodec]);

  const resetEnhancementBuilder = useCallback(() => {
    setEnhancementPartSelections({});
    setEnhancementExtraTokens([]);
    resetCodec();
  }, [resetCodec]);

  const resetHeavyBuilder = useCallback(() => {
    setHeavyPartSelections({});
    setHeavyExtraTokens([]);
    resetCodec();
  }, [resetCodec]);

  const resetClassModBuilder = useCallback(() => {
    setClassModPartSelections({});
    setClassModExtraTokens([]);
    resetCodec();
  }, [resetCodec]);

  const handleCopy = useCallback(async () => {
    let serial = liveBase85.split(/\r?\n/)[0]?.trim() ?? "";
    if (!serial.startsWith("@U") && liveDecoded.trim()) {
      try {
        const res = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: liveDecoded.split(/\r?\n/)[0]?.trim() ?? "" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success && typeof data?.serial === "string") serial = data.serial;
      } catch {
        setCodecStatus("Encode failed when copying.");
        return;
      }
    }
    if (!serial.startsWith("@U")) {
      setCodecStatus("Paste Base85 or decoded first, then Copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(serial);
      setCodecStatus("Copied to clipboard.");
      addHistoryEntry({ itemType: category, code: serial, decoded: liveDecoded.trim() || undefined });
    } catch {
      setCodecStatus("Clipboard copy failed.");
    }
  }, [liveBase85, liveDecoded, category, addHistoryEntry]);

  const handleCopyDecoded = useCallback(async () => {
    const decoded = liveDecoded.trim();
    if (!decoded) {
      setCodecStatus("Nothing to copy (decoded is empty).");
      return;
    }
    try {
      await navigator.clipboard.writeText(decoded);
      setCodecStatus("Copied decoded to clipboard.");
    } catch {
      setCodecStatus("Clipboard copy failed.");
    }
  }, [liveDecoded]);

  const handleAddToBackpack = useCallback(async () => {
    let serial = liveBase85.split(/\r?\n/)[0]?.trim() ?? "";
    if (!serial.startsWith("@U") && liveDecoded.trim()) {
      try {
        const res = await fetchApi("save/encode-serial", {
          method: "POST",
          body: JSON.stringify({ decoded_string: liveDecoded.split(/\r?\n/)[0]?.trim() ?? "" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success && typeof data?.serial === "string") {
          serial = data.serial;
          setLiveBase85((prev) => (prev.trim() ? prev : serial));
        }
      } catch {
        setCodecStatus("Encode failed before Add to Backpack.");
        return;
      }
    }
    if (!serial.startsWith("@U")) {
      setCodecStatus("Paste or build an item and encode first.");
      return;
    }
    if (!saveData) {
      setCodecStatus("Load a save first (Character → Select Save).");
      return;
    }
    const yamlContent = getYamlText();
    if (!yamlContent?.trim()) {
      setCodecStatus("No save YAML loaded.");
      return;
    }
    setAddToBackpackLoading(true);
    setCodecStatus("Adding…");
    try {
      const res = await fetchApi("save/add-item", {
        method: "POST",
        body: JSON.stringify({
          yaml_content: yamlContent,
          serial,
          flag: String(flagValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCodecStatus(isLikelyUnavailable(res) ? getApiUnavailableError() : (data?.error ?? "Add failed"));
        return;
      }
      if (data?.success && typeof data?.yaml_content === "string") {
        updateSaveData(yamlParse(data.yaml_content) as Record<string, unknown>);
        setCodecStatus("Item added to backpack. Use Overwrite save on Select Save to export.");
      } else {
        setCodecStatus(data?.error ?? "Add failed");
      }
    } catch {
      setCodecStatus(getApiUnavailableError());
    } finally {
      setAddToBackpackLoading(false);
    }
  }, [liveBase85, liveDecoded, saveData, flagValue, getYamlText, updateSaveData]);

  const appendToDecoded = useCallback(
    (tokens: string[]) => {
      if (!tokens.length) return;
      setLiveDecoded((prev) => appendPartsToDecoded(prev, tokens, level, seed));
      setLastEditedCodecSide("decoded");
      setCodecStatus("Part(s) added; encoding…");
    },
    [level, seed],
  );

  useEffect(() => {
    let cancelled = false;
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((d: { items?: unknown[] }) => {
        if (cancelled) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        const rows: UniversalPartRow[] = items
          .filter((it): it is Record<string, unknown> => it != null && typeof it === "object")
          .map((raw) => {
            const code = String(raw.code ?? raw.Code ?? "").trim();
            const label =
              String(raw.partName ?? raw.name ?? raw.String ?? raw["Canonical Name"] ?? "").trim() || code;
            const effectPieces = [
              raw.effect,
              raw.Effect,
              raw["Stats (Level 50, Common)"],
              raw.Stats,
              raw["Search Text"],
              raw.Description,
            ]
              .map((v) => String(v ?? "").trim())
              .filter(Boolean);
            const effect = effectPieces.length ? effectPieces.join(" ") : undefined;
            return {
              code,
              label,
              effect,
              itemType: String(raw.itemType ?? raw["Item Type"] ?? "").trim() || undefined,
              manufacturer: String(raw.manufacturer ?? raw.Manufacturer ?? "").trim() || undefined,
              partType: String(raw.partType ?? raw["Part Type"] ?? "").trim() || undefined,
              rarity: String(raw.rarity ?? raw.Rarity ?? "").trim() || undefined,
            };
          })
          .filter((r) => r.code);
        setUniversalParts(rows);
      })
      .catch(() => {
        if (!cancelled) setUniversalParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Map part code → label for Current build parts list. */
  const partsByCode = useMemo(
    () => new Map(universalParts.filter((p) => p.code).map((p) => [p.code, p.label])),
    [universalParts],
  );

  const grenadeExtraLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!grenadeData) return map;

    const short = (s: string): string => {
      const trimmed = (s ?? "").trim();
      if (!trimmed) return trimmed;
      const first = trimmed.split(/[,(]/)[0]?.trim() ?? trimmed;
      return first;
    };

    // Element, firmware, and universal perks (type 245)
    grenadeData.element.forEach((p) => {
      map.set(`{${GRENADE_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    grenadeData.firmware.forEach((p) => {
      map.set(`{${GRENADE_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    grenadeData.universalPerks.forEach((p) => {
      map.set(`{${GRENADE_TYPE_ID}:${p.partId}}`, short(p.stat));
    });

    // Manufacturer-specific perks and legendary perks
    Object.entries(grenadeData.mfgPerks ?? {}).forEach(([mfgStr, list]) => {
      const mfgId = Number(mfgStr);
      if (!Number.isFinite(mfgId)) return;
      list.forEach((p) => {
        const label = short(p.stat);
        map.set(`{${mfgId}:${p.partId}}`, label);
      });
    });

    grenadeData.legendaryPerks.forEach((l) => {
      const label = short(l.stat);
      map.set(`{${l.mfgId}:${l.partId}}`, label);
    });

    return map;
  }, [grenadeData]);

  const grenadePartTypeByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!grenadeData) return map;

    const add = (raw: string, type: string) => {
      if (!raw) return;
      if (!map.has(raw)) map.set(raw, type);
    };

    Object.entries(grenadeData.raritiesByMfg ?? {}).forEach(([mfgStr, list]) => {
      list.forEach((r) => {
        add(`{${r.id}}`, "Rarity");
        const mfg = Number(mfgStr);
        if (Number.isFinite(mfg)) add(`{${mfg}:${r.id}}`, "Rarity");
      });
    });

    grenadeData.legendaryPerks.forEach((l) => {
      add(`{${l.mfgId}:${l.partId}}`, "Legendary perk");
    });

    grenadeData.element.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, "Element");
    });
    grenadeData.firmware.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, "Firmware");
    });
    grenadeData.universalPerks.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, "Universal perk");
    });
    Object.entries(grenadeData.mfgPerks ?? {}).forEach(([mfgStr, list]) => {
      const mfg = Number(mfgStr);
      if (!Number.isFinite(mfg)) return;
      list.forEach((p) => {
        add(`{${mfg}:${p.partId}}`, "Manufacturer perk");
      });
    });

    return map;
  }, [grenadeData]);

  const shieldExtraLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!shieldData) return map;

    const short = (s: string): string => {
      const trimmed = (s ?? "").trim();
      if (!trimmed) return trimmed;
      const first = trimmed.split(/[,(]/)[0]?.trim() ?? trimmed;
      return first;
    };

    // Elemental resistance, firmware, and universal perks (type 246)
    shieldData.element.forEach((p) => {
      map.set(`{${SHIELD_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    shieldData.firmware.forEach((p) => {
      map.set(`{${SHIELD_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    shieldData.universalPerks.forEach((p) => {
      map.set(`{${SHIELD_TYPE_ID}:${p.partId}}`, short(p.stat));
    });

    // Energy perks (type 248)
    shieldData.energyPerks.forEach((p) => {
      map.set(`{${SHIELD_ENERGY_PERK_TYPE_ID}:${p.partId}}`, short(p.stat));
    });

    // Armor perks (type 237)
    shieldData.armorPerks.forEach((p) => {
      map.set(`{${SHIELD_ARMOR_PERK_TYPE_ID}:${p.partId}}`, short(p.stat));
    });

    // Legendary perks: override with "<Mfg>: <short stat>"
    shieldData.legendaryPerks.forEach((l) => {
      const baseLabel = `${l.mfgName}: ${short(l.stat)}`;
      map.set(`{${l.mfgId}:${l.partId}}`, baseLabel);
    });

    return map;
  }, [shieldData]);

  const shieldPartTypeByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!shieldData) return map;

    const add = (raw: string, type: string) => {
      if (!raw) return;
      if (!map.has(raw)) map.set(raw, type);
    };

    Object.entries(shieldData.raritiesByMfg ?? {}).forEach(([mfgStr, list]) => {
      list.forEach((r) => {
        add(`{${r.id}}`, "Rarity");
        const mfg = Number(mfgStr);
        if (Number.isFinite(mfg)) add(`{${mfg}:${r.id}}`, "Rarity");
      });
    });

    Object.entries(shieldData.modelsByMfg ?? {}).forEach(([mfgStr, modelId]) => {
      if (modelId == null) return;
      add(`{${modelId}}`, "Model");
      const mfg = Number(mfgStr);
      if (Number.isFinite(mfg)) add(`{${mfg}:${modelId}}`, "Model");
    });

    shieldData.element.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, "Element");
    });
    shieldData.firmware.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, "Firmware");
    });
    shieldData.universalPerks.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, "Universal perk");
    });
    shieldData.energyPerks.forEach((p) => {
      add(`{${SHIELD_ENERGY_PERK_TYPE_ID}:${p.partId}}`, "Energy perk");
    });
    shieldData.armorPerks.forEach((p) => {
      add(`{${SHIELD_ARMOR_PERK_TYPE_ID}:${p.partId}}`, "Armor perk");
    });
    shieldData.legendaryPerks.forEach((l) => {
      add(`{${l.mfgId}:${l.partId}}`, "Legendary perk");
    });

    return map;
  }, [shieldData]);

  const grenadePartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!grenadeData) return map;

    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };

    grenadeData.element.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    grenadeData.firmware.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    grenadeData.universalPerks.forEach((p) => {
      add(`{${GRENADE_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    Object.entries(grenadeData.mfgPerks ?? {}).forEach(([mfgStr, list]) => {
      const mfg = Number(mfgStr);
      if (!Number.isFinite(mfg)) return;
      list.forEach((p) => {
        add(`{${mfg}:${p.partId}}`, p.description ?? p.stat);
      });
    });
    grenadeData.legendaryPerks.forEach((l) => {
      add(`{${l.mfgId}:${l.partId}}`, l.description ?? l.stat);
    });

    return map;
  }, [grenadeData]);

  const shieldPartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!shieldData) return map;

    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };

    shieldData.element.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    shieldData.firmware.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    shieldData.universalPerks.forEach((p) => {
      add(`{${SHIELD_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    shieldData.energyPerks.forEach((p) => {
      add(`{${SHIELD_ENERGY_PERK_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    shieldData.armorPerks.forEach((p) => {
      add(`{${SHIELD_ARMOR_PERK_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    shieldData.legendaryPerks.forEach((l) => {
      add(`{${l.mfgId}:${l.partId}}`, l.description ?? l.stat);
    });

    return map;
  }, [shieldData]);

  const weaponPartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!weaponData) return map;

    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };

    weaponData.elemental.forEach((e) => {
      add(`{1:${e.partId}}`, e.stat);
    });
    Object.entries(weaponData.partsByMfgTypeId ?? {}).forEach(([mfgWtId, byType]) => {
      Object.values(byType).forEach((parts) => {
        parts.forEach((p) => {
          add(`{${p.partId}}`, p.label);
          add(`{${mfgWtId}:${p.partId}}`, p.label);
        });
      });
    });
    Object.entries(weaponData.legendaryByMfgTypeId ?? {}).forEach(([mfgWtId, list]) => {
      list.forEach((r) => {
        const label = `${r.partId} - ${r.description}`;
        add(`{${r.partId}}`, label);
        add(`{${mfgWtId}:${r.partId}}`, label);
      });
    });
    Object.entries(weaponData.pearlByMfgTypeId ?? {}).forEach(([mfgWtId, list]) => {
      list.forEach((r) => {
        const label = `${r.partId} - ${r.description}`;
        add(`{${r.partId}}`, label);
        add(`{${mfgWtId}:${r.partId}}`, label);
      });
    });

    return map;
  }, [weaponData]);

  const repkitPartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!repkitData) return map;

    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };

    repkitData.prefix.forEach((p) => {
      add(`{${REPKIT_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    repkitData.firmware.forEach((p) => {
      add(`{${REPKIT_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    repkitData.resistance.forEach((p) => {
      add(`{${REPKIT_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    repkitData.universalPerks.forEach((p) => {
      add(`{${REPKIT_TYPE_ID}:${p.partId}}`, p.description ?? p.stat);
    });
    repkitData.legendaryPerks.forEach((l) => {
      add(`{${l.mfgId}:${l.partId}}`, l.description ?? l.stat);
    });

    return map;
  }, [repkitData]);

  const heavyPartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!heavyData) return map;
    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };
    heavyData.element.forEach((p) => add(`{1:${p.partId}}`, p.description ?? p.stat));
    heavyData.firmware.forEach((p) => add(`{${HEAVY_TYPE_ID}:${p.partId}}`, p.description ?? p.stat));
    heavyData.barrel.forEach((p) => add(`{${p.partId}}`, p.description ?? p.stat));
    heavyData.barrelAccPerks.forEach((p) => add(`{${p.partId}}`, p.description ?? p.stat));
    heavyData.bodyAccPerks.forEach((p) => add(`{${p.partId}}`, p.description ?? p.stat));
    return map;
  }, [heavyData]);

  const enhancementPartDescriptionByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!enhancementData) return map;
    const add = (raw: string, desc?: string) => {
      const text = (desc ?? "").trim();
      if (!raw || !text) return;
      if (!map.has(raw)) map.set(raw, text);
    };
    Object.values(enhancementData.manufacturers).forEach((mfg) => {
      (mfg.perks ?? []).forEach((p) => add(`{${p.index}}`, p.description ? `${p.name} — ${p.description}` : p.name));
    });
    enhancementData.secondary247.forEach((s) => {
      const desc = s.description ? `${s.name} — ${s.description}` : s.name;
      add(`{247:${s.code}}`, desc);
    });
    return map;
  }, [enhancementData]);

  const repkitExtraLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!repkitData) return map;

    const short = (s: string): string => {
      const trimmed = (s ?? "").trim();
      if (!trimmed) return trimmed;
      const first = trimmed.split(/[,(]/)[0]?.trim() ?? trimmed;
      return first;
    };

    repkitData.prefix.forEach((p) => {
      map.set(`{${REPKIT_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    repkitData.firmware.forEach((p) => {
      map.set(`{${REPKIT_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    repkitData.resistance.forEach((p) => {
      map.set(`{${REPKIT_TYPE_ID}:${p.partId}}`, short(p.stat));
    });
    repkitData.universalPerks.forEach((p) => {
      map.set(`{${REPKIT_TYPE_ID}:${p.partId}}`, short(p.stat));
    });

    repkitData.legendaryPerks.forEach((l) => {
      map.set(`{${l.mfgId}:${l.partId}}`, `${l.mfgName}: ${short(l.stat)}`);
    });
    return map;
  }, [repkitData]);

  /** Weapon part raw token → descriptive label for Current build parts (Descriptive IDs). */
  const weaponExtraLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!weaponData) return map;
    weaponData.elemental.forEach((e) => {
      map.set(`{1:${e.partId}}`, e.stat);
    });
    Object.entries(weaponData.partsByMfgTypeId ?? {}).forEach(([mfgWtId, byType]) => {
      Object.values(byType).forEach((parts) => {
        parts.forEach((p) => {
          map.set(`{${p.partId}}`, p.label);
          map.set(`{${mfgWtId}:${p.partId}}`, p.label);
        });
      });
    });
    Object.entries(weaponData.rarityByMfgTypeId ?? {}).forEach(([mfgWtId, list]) => {
      list.forEach((r) => {
        const label = r.stat || r.partId;
        map.set(`{${r.partId}}`, label);
        map.set(`{${mfgWtId}:${r.partId}}`, label);
      });
    });
    Object.entries(weaponData.legendaryByMfgTypeId ?? {}).forEach(([mfgWtId, list]) => {
      list.forEach((r) => {
        const label = `${r.partId} - ${r.description}`;
        map.set(`{${r.partId}}`, label);
        map.set(`{${mfgWtId}:${r.partId}}`, label);
      });
    });
    Object.entries(weaponData.pearlByMfgTypeId ?? {}).forEach(([mfgWtId, list]) => {
      list.forEach((r) => {
        const label = `${r.partId} - ${r.description}`;
        map.set(`{${r.partId}}`, label);
        map.set(`{${mfgWtId}:${r.partId}}`, label);
      });
    });
    return map;
  }, [weaponData]);

  /** Weapon part raw/key → part type (Barrel, Grip, etc.) for display near bottom of part card. */
  const weaponPartTypeByRaw = useMemo(() => {
    const map = new Map<string, string>();
    if (!weaponData?.partsByMfgTypeId) return map;
    Object.entries(weaponData.partsByMfgTypeId).forEach(([mfgWtId, byType]) => {
      Object.entries(byType).forEach(([partType, parts]) => {
        if (!partType) return;
        parts.forEach((p) => {
          map.set(`{${p.partId}}`, partType);
          map.set(`{${mfgWtId}:${p.partId}}`, partType);
        });
      });
    });
    return map;
  }, [weaponData?.partsByMfgTypeId]);

  /** Element partId → display name (Fire, Shock, etc.) from weapon-gen when building a weapon. */
  const elementNameByPartId = useMemo(() => {
    const list = weaponData?.elemental;
    if (!list?.length) return null;
    return new Map(list.map((e) => [Number(e.partId), e.stat]));
  }, [weaponData?.elemental]);

  const filteredAddParts = useMemo(() => {
    let list = universalParts;
    const q = addPartsSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [p.label, p.code, p.effect ?? "", p.itemType ?? "", p.manufacturer ?? "", p.partType ?? "", p.rarity ?? ""].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (addPartsMfg) list = list.filter((p) => (p.manufacturer ?? "") === addPartsMfg);
    if (addPartsRarity) list = list.filter((p) => normalizeRarity(p.rarity) === addPartsRarity);
    return list.slice(0, 200);
  }, [universalParts, addPartsSearch, addPartsMfg, addPartsRarity]);

  const addPartsManufacturers = useMemo(
    () => [...new Set(universalParts.map((p) => p.manufacturer).filter(Boolean))].sort(),
    [universalParts],
  );
  const addPartsRarities = useMemo(() => {
    const set = new Set<string>();
    universalParts.forEach((p) => {
      const n = normalizeRarity(p.rarity);
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => {
      if (a === "Pearl") return -1;
      if (b === "Pearl") return 1;
      if (a === "Legendary") return -1;
      if (b === "Legendary") return 1;
      return a.localeCompare(b);
    });
  }, [universalParts]);

  const confirmPendingAdd = useCallback(() => {
    if (!pendingAddPart) return;
    const qty = Math.max(1, Math.min(999, parseInt(pendingAddQty.trim(), 10) || 1));
    const token = codeToToken(pendingAddPart.code, qty);
    if (category === "weapon" && weaponMfgWtId) {
      setExtraTokens((prev) => [...prev, token]);
    } else if (category === "grenade" && grenadeMfgId != null) {
      setGrenadeExtraTokens((prev) => [...prev, token]);
    } else if (category === "shield" && shieldMfgId != null) {
      setShieldExtraTokens((prev) => [...prev, token]);
    } else if (category === "repkit" && repkitMfgId != null) {
      setRepkitExtraTokens((prev) => [...prev, token]);
    } else if (category === "enhancement" && enhancementMfgName) {
      setEnhancementExtraTokens((prev) => [...prev, token]);
    } else if (category === "heavy" && heavyMfgId != null) {
      setHeavyExtraTokens((prev) => [...prev, token]);
    } else if (category === "class-mod" && classModData) {
      setClassModExtraTokens((prev) => [...prev, token]);
    } else {
      appendToDecoded([token]);
    }
    setPendingAddPart(null);
    setPendingAddQty("1");
  }, [pendingAddPart, pendingAddQty, appendToDecoded, category, weaponMfgWtId, grenadeMfgId, shieldMfgId, repkitMfgId, enhancementMfgName, heavyMfgId]);

  const currentBuildParts = useMemo(() => {
    const segment = getPartsSegmentFromFirstLine(liveDecoded);
    const headerTypeId = getHeaderTypeId(liveDecoded);
    return segment ? parsePartsSegment(segment, headerTypeId) : [];
  }, [liveDecoded]);

  const applyNewPartsOrder = useCallback(
    (newRaws: string[]) => {
      const next = rebuildFirstLine(liveDecoded, newRaws);
      setLiveDecoded(next);
      setLastEditedCodecSide("decoded");
      setCodecStatus("Parts updated; encoding…");
    },
    [liveDecoded],
  );

  const movePart = useCallback(
    (index: number, dir: "up" | "down") => {
      const raws = currentBuildParts.map((p) => p.raw);
      const i = dir === "up" ? index - 1 : index + 1;
      if (i < 0 || i >= raws.length) return;
      [raws[index], raws[i]] = [raws[i], raws[index]];
      applyNewPartsOrder(raws);
    },
    [currentBuildParts, applyNewPartsOrder],
  );

  const removePart = useCallback(
    (index: number) => {
      const raws = currentBuildParts.map((p) => p.raw).filter((_, i) => i !== index);
      applyNewPartsOrder(raws);
    },
    [currentBuildParts, applyNewPartsOrder],
  );

  const setPartQuantity = useCallback(
    (index: number, newQty: number) => {
      const part = currentBuildParts[index];
      if (!part || part.qty === newQty) return;
      const qty = Math.max(1, Math.min(999, newQty));
      let newRaw: string;
      if (part.prefix != null && part.partId != null) {
        newRaw = qty === 1 ? `{${part.prefix}:${part.partId}}` : `{${part.prefix}:[${Array(qty).fill(part.partId).join(" ")}]}`;
      } else if (part.partId != null && part.prefix == null) {
        newRaw = qty === 1 ? `{${part.partId}}` : `{${part.partId}}`.repeat(qty).replace(/}\s*{/g, "} {");
      } else {
        return;
      }
      const raws = [...currentBuildParts.map((p) => p.raw)];
      raws[index] = newRaw;
      applyNewPartsOrder(raws);
    },
    [currentBuildParts, applyNewPartsOrder],
  );

  useEffect(() => {
    if (!lastEditedCodecSide) return;
    const reqId = ++codecRequestId.current;
    const timer = setTimeout(async () => {
      try {
        setCodecLoading(true);
        if (lastEditedCodecSide === "base85") {
          const serials = liveBase85
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!serials.length) {
            if (reqId !== codecRequestId.current) return;
            setLiveDecoded("");
            setCodecStatus("Paste Base85 or decoded to start.");
            return;
          }
          const res = await fetchApi("save/decode-items", {
            method: "POST",
            body: JSON.stringify({ serials }),
          });
          const data = await res.json().catch(() => ({}));
          if (reqId !== codecRequestId.current) return;
          if (!res.ok) {
            setCodecStatus(data?.error ?? "Decode failed");
            return;
          }
          const items = Array.isArray(data?.items) ? data.items : [];
          const decodedLines = items.map(
            (item: { decodedFull?: string; error?: string }, idx: number) =>
              item?.error ? `# Line ${idx + 1} error: ${item.error}` : String(item?.decodedFull ?? "").trim(),
          );
          setLiveDecoded(decodedLines.join("\n"));
          setCodecStatus(`Decoded ${items.length} line(s)`);
          return;
        }
        const decodedLines = liveDecoded
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!decodedLines.length) {
          if (reqId !== codecRequestId.current) return;
          setLiveBase85("");
          setCodecStatus("Paste Base85 or decoded to start.");
          return;
        }
        const out: string[] = [];
        for (let i = 0; i < decodedLines.length; i += 1) {
          const res = await fetchApi("save/encode-serial", {
            method: "POST",
            body: JSON.stringify({ decoded_string: decodedLines[i] }),
          });
          const data = await res.json().catch(() => ({}));
          if (reqId !== codecRequestId.current) return;
          if (!res.ok) {
            out.push(`# Line ${i + 1} error: ${data?.error ?? "Encode failed"}`);
          } else if (data?.success && typeof data?.serial === "string") {
            out.push(data.serial);
          } else {
            out.push(`# Line ${i + 1} error: ${data?.error ?? "Encode failed"}`);
          }
        }
        if (reqId !== codecRequestId.current) return;
        setLiveBase85(out.join("\n"));
        setCodecStatus(`Encoded ${decodedLines.length} line(s)`);
      } catch {
        if (reqId !== codecRequestId.current) return;
        setCodecStatus("Codec unavailable");
      } finally {
        if (reqId === codecRequestId.current) setCodecLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [lastEditedCodecSide, liveBase85, liveDecoded]);

  // ── Hover card helpers ────────────────────────────────────────────────────

  /** Convert a UniversalPartRow to HoverCardData for slot/sidebar hovers. */
  const universalRowToHoverData = useCallback((p: UniversalPartRow): HoverCardData => ({
    code: p.code,
    name: p.label || p.code,
    effect: p.effect,
    manufacturer: p.manufacturer,
    partType: p.partType,
    modelName: p.itemType,
    rarity: p.rarity,
  }), []);

  /** Look up a UniversalPartRow by code (for sidebar part hover). */
  const hoverDataByCode = useCallback((code: string): HoverCardData | null => {
    const p = universalParts.find((u) => u.code === code);
    if (!p) return null;
    return universalRowToHoverData(p);
  }, [universalParts, universalRowToHoverData]);

  /** Look up a UniversalPartRow by label (for slot item / picker hover). Falls back to label-only data. */
  const hoverDataByLabel = useCallback((label: string, description?: string, partTypeOverride?: string): HoverCardData => {
    const p = universalParts.find((u) => u.label === label);
    const base: HoverCardData = p
      ? universalRowToHoverData(p)
      : (() => {
          const pieces = label.split(" - ");
          const name = pieces.length > 1 ? pieces.slice(1).join(" - ").trim() : label;
          return { code: "", name, effect: description } as HoverCardData;
        })();
    return partTypeOverride ? { ...base, partType: partTypeOverride } : base;
  }, [universalParts, universalRowToHoverData]);

  const startHover = useCallback((data: HoverCardData, top: number, side: "left" | "right" = "right") => {
    if (hoverCardTimer.current) clearTimeout(hoverCardTimer.current);
    hoverCardTimer.current = setTimeout(() => {
      setHoverCardTop(top);
      setHoverCardSide(side);
      setHoverCard(data);
    }, 130);
  }, []);

  const endHover = useCallback(() => {
    if (hoverCardTimer.current) clearTimeout(hoverCardTimer.current);
    setHoverCard(null);
  }, []);

  return (
    <div className="space-y-4" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
      <section className="relative rounded-xl border-2 border-[var(--color-accent)]/40 p-4 shadow-xl overflow-hidden" style={{ backgroundColor: "rgba(12, 14, 18, 0.95)" }}>
        {/* Left accent stripe */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-accent)]/20 rounded-l-xl" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-3 pl-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[10px] tracking-widest text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 px-2 py-0.5 rounded">◈ GEAR LAB</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                ONLINE
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-[var(--color-accent)] mt-1">
              Gear Lab
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Build, mod, and generate any item. Parts database + encode/decode + modded generators.
            </p>
          </div>
        </div>
      </section>

      {/* Item context */}
      <section className="relative rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-3 pl-4 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]/30 rounded-l-xl" aria-hidden="true" />
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2 font-mono">
          ⌖ Item category
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const colors = CATEGORY_COLORS[c.value];
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium min-h-[44px] touch-manipulation transition-colors ${
                  category === c.value ? colors.active : colors.inactive
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {/* Display toggles */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--color-panel-border)]/50 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mr-0.5">Display</span>
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs font-medium select-none transition-colors ${richDetailView ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"}`}>
            <input type="checkbox" checked={richDetailView} onChange={(e) => setRichDetailView(e.target.checked)} className="sr-only" />
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${richDetailView ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-muted)]"}`} />
            Show Info
          </label>
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs font-medium select-none transition-colors ${crossMfgExpand ? "bg-amber-400/20 border-amber-400/80 text-amber-300" : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-amber-400/40 hover:text-[var(--color-text)]"}`}>
            <input type="checkbox" checked={crossMfgExpand} onChange={(e) => setCrossMfgExpand(e.target.checked)} className="sr-only" />
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${crossMfgExpand ? "bg-amber-400" : "bg-[var(--color-text-muted)]"}`} />
            All Parts
          </label>
        </div>
      </section>

      {/* Live codec: Base85 ⇄ Deserialized (between category and weapon build) */}
      <section className="relative rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3 pl-4 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]/30 rounded-l-xl" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse flex-shrink-0" aria-hidden="true" />
            ◈ Live codec (encode/decode API)
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {codecLoading ? "Converting…" : codecStatus}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-accent)]">Base85</label>
            <textarea
              value={liveBase85}
              onChange={(e) => handleCodecChange("base85", e.target.value)}
              placeholder="@U..."
              spellCheck={false}
              className="w-full min-h-[200px] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono"
            />
          </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-accent)]">Deserialized</label>
              <textarea
                value={liveDecoded}
                onChange={(e) => handleCodecChange("decoded", e.target.value)}
                placeholder="255, 0, 1, 50| 2, 1234|| {12} {1:7} ..."
                spellCheck={false}
                className="w-full min-h-[200px] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowCleanCodeDialog(true)}
                className="mt-2 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
              >
                Code cleanup
              </button>
            </div>
          </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-panel-border)] flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
          >
            Copy Base85
          </button>
          <button
            type="button"
            onClick={handleCopyDecoded}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
          >
            Copy Code
          </button>
          <button
            type="button"
            onClick={() => {
              const resetMap: Record<string, () => void> = {
                weapon: resetWeaponBuilder,
                grenade: resetGrenadeBuilder,
                shield: resetShieldBuilder,
                repkit: resetRepkitBuilder,
                enhancement: resetEnhancementBuilder,
                heavy: resetHeavyBuilder,
                "class-mod": resetClassModBuilder,
              };
              (resetMap[category] ?? resetCodec)();
            }}
            className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 text-sm min-h-[44px] touch-manipulation"
            title="Reset current builder — clears selections and codes"
          >
            Reset
          </button>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span>Flag</span>
            <select
              value={flagValue}
              onChange={(e) => setFlagValue(Number(e.target.value))}
              className="px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
            >
              {FLAG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAddToBackpack}
            disabled={addToBackpackLoading || !saveData}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[44px] touch-manipulation"
          >
            {addToBackpackLoading ? "Adding…" : "Add to Backpack"}
          </button>
          {editingFromBackpack && (
            <button
              type="button"
              onClick={async () => {
                if (!saveData || !editingFromBackpack) return;
                setCodecStatus("Updating item...");
                try {
                  // Encode the current decoded to get new serial
                  const encRes = await fetchApi("save/encode-serial", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ decoded_string: liveDecoded.split("\n")[0]?.trim() }),
                  });
                  const encData = await encRes.json() as { serial?: string };
                  if (!encData.serial) { setCodecStatus("Encode failed"); return; }
                  // Walk the path to find and update the item in saveData
                  let target: Record<string, unknown> = saveData as Record<string, unknown>;
                  const path = editingFromBackpack.path;
                  for (let i = 0; i < path.length - 1; i++) {
                    const key = path[i]!;
                    target = (target[key] ?? (target as unknown as unknown[])[Number(key)]) as Record<string, unknown>;
                  }
                  const lastKey = path[path.length - 1]!;
                  const slot = (target[lastKey] ?? (target as unknown as unknown[])[Number(lastKey)]) as Record<string, unknown>;
                  if (slot) {
                    slot.serial = encData.serial;
                    updateSaveData({ ...saveData });
                    setCodecStatus("Item updated in backpack!");
                    setEditingFromBackpack(null);
                  } else {
                    setCodecStatus("Could not find item in save data");
                  }
                } catch {
                  setCodecStatus("Update failed");
                }
              }}
              disabled={!saveData}
              className="px-4 py-2 rounded-lg bg-orange-500/80 text-black font-medium hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[44px] touch-manipulation"
              title="Overwrite the original backpack item with your edits"
            >
              Update Item
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              setCodecStatus("Overwriting save...");
              const ok = await overwriteSaveInPlace();
              setCodecStatus(ok ? "Save overwritten successfully!" : "Overwrite failed — check error above.");
            }}
            disabled={!saveData || !savePlatform || !saveUserId}
            title="Encrypt and save your .sav file"
            className="px-4 py-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-medium hover:bg-[var(--color-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[44px] touch-manipulation"
          >
            Overwrite Save
          </button>
          <Link
            to="/inventory/backpack"
            className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/60 text-sm min-h-[44px] touch-manipulation flex items-center"
          >
            Backpack
          </Link>
          {!saveData && (
            <span className="text-xs text-[var(--color-text-muted)]">Load a save (Character → Select Save) to add to backpack.</span>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-panel-border)]/30 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]/60">On mobile? Can't edit saves directly —</span>
          <a
            href="https://discord.gg/wNDT64Zn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-[10px] font-medium transition-colors"
          >
            Join our Discord for item drops
          </a>
        </div>
        {lastDps && category === "weapon" && (
          <div className="mt-3 pt-3 border-t border-[var(--color-panel-border)]">
            {lastDps.barrelName === "Claude's Convergence" && (
              <div className="mb-2 px-3 py-2 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-300 text-sm font-bold animate-pulse">
                Claude's Gun (1/100) — "Thought Storm" Radiation Convergence
              </div>
            )}
            {rollMilestone && (
              <div className="mb-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 text-xs font-medium">
                {rollMilestone}
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">DPS Estimate <span className="normal-case text-[var(--color-text-muted)]/60">(~3% per +Dmg stack · est.)</span></p>
              {rollCount > 0 && <span className="text-[10px] font-mono text-[var(--color-text-muted)]/50">Roll #{rollCount}</span>}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><span className="text-[var(--color-text-muted)] text-xs">Barrel:</span> {lastDps.barrelName || "—"}</span>
              {lastDps.underbarrelName && <span><span className="text-[var(--color-text-muted)] text-xs">Alt-Fire:</span> <span className="text-cyan-400">{lastDps.underbarrelName}</span></span>}
              <span><span className="text-[var(--color-text-muted)] text-xs">Base DPS:</span> {lastDps.baseDps > 0 ? Math.round(lastDps.baseDps).toLocaleString() : "—"}</span>
              <span><span className="text-[var(--color-text-muted)] text-xs">Est. DPS:</span> <span className="text-green-400 font-bold">{lastDps.estimatedDps > 0 ? Math.round(lastDps.estimatedDps).toLocaleString() : "—"}</span></span>
              {lastDps.baseDps > 0 && <span className="text-[var(--color-text-muted)] text-xs">{lastDps.baseFireRate.toFixed(1)}/s × {Math.round(lastDps.baseDamagePerShot).toLocaleString()} dmg/shot</span>}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-xs text-[var(--color-text-muted)]">
              <span>+Dmg stacks: {lastDps.damageStackCount}</span>
              <span>+Crit stacks: {lastDps.critStackCount}</span>
              <span>+FR stacks: {lastDps.fireRateStackCount}</span>
            </div>
            {lastWeaponTraits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {lastWeaponTraits.map((trait) => {
                  const colors: Record<string, string> = {
                    "Radiation": "border-green-400/40 bg-green-400/10 text-green-400",
                    "Shock": "border-blue-400/40 bg-blue-400/10 text-blue-400",
                    "Corrosive": "border-lime-400/40 bg-lime-400/10 text-lime-400",
                    "Cryo": "border-cyan-400/40 bg-cyan-400/10 text-cyan-400",
                    "Fire": "border-red-400/40 bg-red-400/10 text-red-400",
                    "Seamstress": "border-pink-400/40 bg-pink-400/10 text-pink-400",
                    "MIRV": "border-orange-400/40 bg-orange-400/10 text-orange-400",
                    "Grenade Kit": "border-yellow-400/40 bg-yellow-400/10 text-yellow-400",
                    "Shield Cross": "border-blue-300/40 bg-blue-300/10 text-blue-300",
                    "Class Mod Perks": "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
                    "Heavy Accessories": "border-amber-400/40 bg-amber-400/10 text-amber-400",
                    "Claude's Gun": "border-purple-400/40 bg-purple-400/10 text-purple-400",
                  };
                  return (
                    <span key={trait} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colors[trait] ?? "border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]"}`}>
                      {trait}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {showCleanCodeDialog && (
        <CleanCodeDialog
          initialDecoded={liveDecoded}
          initialBase85={liveBase85}
          confirmPrompt="are you sure? This may alter the effects of your current code 1"
          onClose={() => setShowCleanCodeDialog(false)}
        />
      )}

      {/* Weapon: Modding-tool style with collapsible part groups + multi-select per part type */}
      {category === "weapon" && weaponData && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Weapon build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            {/* Header: Manufacturer, type, level, seed, actions */}
            <div className="flex flex-wrap items-end gap-4 mb-4 p-3 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[var(--color-panel-border)]/50">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowWeaponMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {weaponManufacturer || "Select…"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Weapon type</label>
                <button
                  type="button"
                  onClick={() => setShowWeaponTypeModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select weapon type"
                >
                  {weaponWeaponType || "Select…"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value) || 1)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                  />
                  {signatureSeed ? (
                    <button
                      type="button"
                      onClick={() => setSeed(signatureSeed)}
                      title={`Apply your signature: ${signatureSeed}`}
                      className="px-2 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-bold min-h-[44px] hover:bg-amber-500/20 touch-manipulation whitespace-nowrap"
                    >
                      {signatureSeed}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const val = prompt("Set your signature seed — your digital modder signature on every gun:");
                        if (val && /^\d{1,4}$/.test(val.trim())) { setSignatureSeed(Number(val.trim())); discoverEgg("signature-set"); }
                      }}
                      title="Set a signature seed — your digital modder signature"
                      className="px-2 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-[10px] min-h-[44px] hover:border-amber-500/40 hover:text-amber-400 touch-manipulation"
                    >
                      Sign
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={handleRandomWeapon}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Random item
                </button>
                <button
                  type="button"
                  onClick={() => setShowGodRollModal(true)}
                  disabled={!weaponData?.godrolls?.length}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  title={weaponData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                >
                  God roll
                </button>
                <button
                  type="button"
                  onClick={handleAutoFill}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                  title="Fill empty part slots. Select manufacturer, type, level, rarity (and Legendary/Pearl type if applicable) first."
                >
                  Auto fill
                </button>
                <button
                  type="button"
                  onClick={resetWeaponBuilder}
                  className="px-4 py-2 rounded-lg border-2 border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/70 font-bold text-sm min-h-[44px] touch-manipulation"
                  title="Clear all selections, codes, and reset the builder for a fresh start"
                >
                  Reset Builder
                </button>
                <span className="self-center text-[var(--color-text-muted)] text-xs mx-1">|</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--color-text-muted)] text-sm">Generate modded:</span>
                  <select
                    value={moddedWeaponPowerMode}
                    onChange={(e) => setModdedWeaponPowerMode(e.target.value as "stable" | "op" | "insane")}
                    className="px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                    title="Power level for random modded weapon"
                  >
                    <option value="stable">Stable</option>
                    <option value="op">OP</option>
                    <option value="insane">Insane</option>
                  </select>
                  {/* Special mode — mutually exclusive pill toggles */}
                  {(["grenade-reload", "inf-ammo"] as const).map((mode) => {
                    const active = moddedWeaponSpecialMode === mode;
                    const label = mode === "grenade-reload" ? "Grenade Reload" : "Inf Alt Fire";
                    const tip = mode === "grenade-reload"
                      ? "Add grenade reload block (grenade item + perk stacks) to every generated gun. Disables Rowan's Charge stacks."
                      : "Add 7× Rowan's Charge {27:75} stacks for infinite ammo on every generated gun. Disables grenade reload block.";
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setModdedWeaponSpecialMode(active ? null : mode)}
                        title={tip}
                        className={`px-3 py-2 rounded-lg border text-sm min-h-[44px] touch-manipulation transition-colors ${
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                            : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"
                        }`}
                      >
                        {active ? "✓ " : ""}{label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowWeaponGenModeModal(true)}
                    disabled={generateModdedLoading}
                    className="px-3 py-2 rounded-lg border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 disabled:opacity-60 text-sm min-h-[44px] touch-manipulation"
                    title="Generate a modded weapon — Random or Custom (pick a named weapon)"
                  >
                    {generateModdedLoading ? "Generating…" : "Generate modded weapon"}
                  </button>
                  {generateModdedError && (
                    <span className="text-red-400 text-xs">{generateModdedError}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Random / Custom weapon gen modal */}
            {showWeaponGenModeModal && (() => {
              const wd = weaponData;
              const customMfgWtId = wd?.mfgWtIdList.find((e) => e.manufacturer === customWepMfg && e.weaponType === customWepType)?.mfgWtId ?? "";
              const customMfgTypes = wd?.mfgWtIdList.filter((e) => e.manufacturer === customWepMfg) ?? [];
              const customRarities = customMfgWtId ? (wd?.rarityByMfgTypeId[customMfgWtId] ?? []) : [];
              const customRarityStats = [...new Set(customRarities.map((r) => r.stat).filter(Boolean))].sort();
              const hasLeg = customMfgWtId ? (wd?.legendaryByMfgTypeId[customMfgWtId]?.length ?? 0) > 0 : false;
              const hasPearl = customMfgWtId ? (wd?.pearlByMfgTypeId[customMfgWtId]?.length ?? 0) > 0 : false;
              const rarityOpts = [...customRarityStats.filter((s) => s !== "Legendary" && s !== "Pearl" && s !== "Pearlescent"), ...(hasLeg ? ["Legendary"] : []), ...(hasPearl ? ["Pearl"] : [])];
              const legPearlOpts = customWepRarity === "Legendary"
                ? (wd?.legendaryByMfgTypeId[customMfgWtId] ?? []).map((r) => `${r.partId} - ${r.description}`)
                : customWepRarity === "Pearl"
                  ? (wd?.pearlByMfgTypeId[customMfgWtId] ?? []).map((r) => `${r.partId} - ${r.description}`)
                  : [];
              const canGenerate = !!customMfgWtId && !!customWepRarity && (customWepRarity !== "Legendary" && customWepRarity !== "Pearl" || !!customWepLegPearl);
              const selClass = "w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-3";
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4" onClick={() => setShowWeaponGenModeModal(false)}>
                  <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[var(--color-accent)] font-medium text-sm">Generate Modded Weapon</h3>
                      <button type="button" onClick={() => { setCustomWepMfg(""); setCustomWepType(""); setCustomWepRarity(""); setCustomWepLegPearl(""); setCustomWepLevel("50"); }}
                        className="px-2 py-1 rounded text-[10px] font-medium text-red-400/70 border border-red-500/30 hover:bg-red-500/10 hover:text-red-400">
                        Reset
                      </button>
                    </div>

                    <button type="button" onClick={() => { setShowWeaponGenModeModal(false); void handleGenerateModdedWeapon(); }}
                      className="w-full px-4 py-3 rounded-lg bg-[var(--color-accent)] text-black font-medium min-h-[44px] hover:opacity-90 mb-4">
                      Random
                    </button>

                    <div className="border-t border-[var(--color-panel-border)] pt-3">
                      <p className="text-[var(--color-accent)] font-medium text-sm mb-1">Custom</p>
                      <p className="text-xs text-[var(--color-text-muted)] mb-3">Pick manufacturer, type, rarity — auto-fill builds the base, mods added on top. No extra barrels.</p>

                      <label className="block text-xs text-[var(--color-text-muted)] mb-1">Manufacturer</label>
                      <select value={customWepMfg} onChange={(e) => { setCustomWepMfg(e.target.value); setCustomWepType(""); setCustomWepRarity(""); setCustomWepLegPearl(""); }} className={selClass}>
                        <option value="">Select...</option>
                        {[...new Set(wd?.mfgWtIdList.map((e) => e.manufacturer) ?? [])].sort().map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>

                      {customWepMfg && (
                        <>
                          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Weapon Type</label>
                          <select value={customWepType} onChange={(e) => { setCustomWepType(e.target.value); setCustomWepRarity(""); setCustomWepLegPearl(""); }} className={selClass}>
                            <option value="">Select...</option>
                            {customMfgTypes.map((e) => <option key={e.weaponType} value={e.weaponType}>{e.weaponType}</option>)}
                          </select>
                        </>
                      )}

                      {customMfgWtId && (
                        <>
                          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Level</label>
                          <input type="number" min={1} max={60} value={customWepLevel} onChange={(e) => setCustomWepLevel(e.target.value)}
                            className="w-24 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-3" />

                          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Rarity</label>
                          <select value={customWepRarity} onChange={(e) => { setCustomWepRarity(e.target.value); setCustomWepLegPearl(""); }} className={selClass}>
                            <option value="">Select...</option>
                            {rarityOpts.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </>
                      )}

                      {(customWepRarity === "Legendary" || customWepRarity === "Pearl") && legPearlOpts.length > 0 && (
                        <>
                          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{customWepRarity} Type</label>
                          <select value={customWepLegPearl} onChange={(e) => setCustomWepLegPearl(e.target.value)} className={selClass}>
                            <option value="">Select...</option>
                            {legPearlOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </>
                      )}

                      <button type="button" disabled={!canGenerate}
                        onClick={() => { setShowWeaponGenModeModal(false); void handleGenerateModdedWeapon({ customMfgWtId, customRarity: customWepRarity, customLegPearl: customWepLegPearl, customLevel: customWepLevel }); }}
                        className="w-full px-4 py-3 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] font-medium min-h-[44px] hover:bg-[var(--color-accent)] hover:text-black disabled:opacity-40 disabled:cursor-not-allowed">
                        Generate Custom
                      </button>
                    </div>

                    <button type="button" onClick={() => setShowWeaponGenModeModal(false)}
                      className="w-full mt-3 px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-sm min-h-[44px]">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
            {autoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{autoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}
            {showWeaponMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowWeaponMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowWeaponMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {weaponData.manufacturers.map((m) => {
                        const active = m === weaponManufacturer;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setWeaponManufacturer(m);
                              setWeaponMfgUserSelected(true);
                              setShowWeaponMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="text-sm text-[var(--color-text)]">{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showWeaponTypeModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowWeaponTypeModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Weapon Type</h3>
                    <button type="button" onClick={() => setShowWeaponTypeModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {weaponTypesForManufacturer.map((w) => {
                        const active = w === weaponWeaponType;
                        return (
                          <button
                            key={w}
                            type="button"
                            onClick={() => {
                              setWeaponWeaponType(w);
                              setShowWeaponTypeModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="text-sm text-[var(--color-text)]">{w}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showGodRollModal && weaponData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {weaponData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {weaponMfgWtId && (
              <div className="parts-container max-h-[55vh] overflow-y-auto pr-2 space-y-2">
                {(() => {
                  const showAllMfgs = crossMfgExpand;
                  const mfgWtIds = showAllMfgs && weaponData?.partsByMfgTypeId
                    ? Object.keys(weaponData.partsByMfgTypeId)
                    : [weaponMfgWtId];
                  const rarityStats = new Set<string>();
                  mfgWtIds.forEach((id) => {
                    (weaponData.rarityByMfgTypeId[id] ?? []).forEach((r) => {
                      const s = (r.stat ?? "").trim();
                      if (s && s !== "Legendary" && s !== "Pearl" && s !== "Pearlescent") rarityStats.add(s);
                    });
                  });
                  const hasLegendary = mfgWtIds.some((id) => (weaponData.legendaryByMfgTypeId[id]?.length ?? 0) > 0);
                  const hasPearl = mfgWtIds.some((id) => (weaponData.pearlByMfgTypeId[id]?.length ?? 0) > 0);
                  const rarityOptions = [...rarityStats].sort();
                  if (hasLegendary) rarityOptions.push("Legendary");
                  if (hasPearl) rarityOptions.push("Pearl");
                  const getMfgName = (id: string) => weaponData.mfgWtIdList?.find((e) => e.mfgWtId === id)?.manufacturer ?? id;
                  /** Manufacturer names that appear in part names – if present, we don't append (Mfg). Includes data manufacturers plus e.g. Hyperion. */
                  const mfgNamesInPartNames = (() => {
                    const set = new Set((weaponData?.manufacturers ?? []).map((m) => m.toLowerCase()));
                    ["hyperion", "torgue", "tediore", "jakobs", "maliwan", "vladof", "atlas", "cov", "daedalus", "pangolin", "anointed"].forEach((n) => set.add(n));
                    return set;
                  })();
                  /** Append " (Manufacturer)" only if the label doesn't already contain any of these manufacturer names. */
                  const withMfgIfNeeded = (label: string, mfg: string): string => {
                    if (!mfg) return label;
                    const labelLower = label.toLowerCase();
                    const hasAnyMfgInName = [...mfgNamesInPartNames].some((m) => m && labelLower.includes(m));
                    if (hasAnyMfgInName) return label;
                    return `${label} (${mfg})`;
                  };
                  type PartOpt = { partId: string; label: string; description?: string; isStock: boolean };
                  const legendaryOptions: PartOpt[] = showAllMfgs
                    ? (() => {
                        const stock: PartOpt[] = [], extra: PartOpt[] = [];
                        mfgWtIds.forEach((id) => {
                          const mfg = getMfgName(id);
                          const isStock = id === weaponMfgWtId;
                          (weaponData.legendaryByMfgTypeId[id] ?? []).forEach((r) => {
                            const item = { partId: r.partId, label: withMfgIfNeeded(`${r.partId} - ${r.description}`, mfg), isStock };
                            if (isStock) stock.push(item); else extra.push(item);
                          });
                        });
                        return [...stock, ...extra];
                      })()
                    : (weaponData.legendaryByMfgTypeId[weaponMfgWtId] ?? []).map((r) => ({
                        partId: r.partId, label: withMfgIfNeeded(`${r.partId} - ${r.description}`, weaponManufacturer), isStock: true,
                      }));
                  const pearlOptions: PartOpt[] = showAllMfgs
                    ? (() => {
                        const stock: PartOpt[] = [], extra: PartOpt[] = [];
                        mfgWtIds.forEach((id) => {
                          const mfg = getMfgName(id);
                          const isStock = id === weaponMfgWtId;
                          (weaponData.pearlByMfgTypeId[id] ?? []).forEach((r) => {
                            const item = { partId: r.partId, label: withMfgIfNeeded(`${r.partId} - ${r.description}`, mfg), isStock };
                            if (isStock) stock.push(item); else extra.push(item);
                          });
                        });
                        return [...stock, ...extra];
                      })()
                    : (weaponData.pearlByMfgTypeId[weaponMfgWtId] ?? []).map((r) => ({
                        partId: r.partId, label: withMfgIfNeeded(`${r.partId} - ${r.description}`, weaponManufacturer), isStock: true,
                      }));
                  const elementalOptions: PartOpt[] = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}`, isStock: true }));
                  const getOpts = (partType: string): PartOpt[] => {
                    if (partType === "Rarity") return rarityOptions.map((o) => ({ partId: o, label: o, isStock: true }));
                    if (partType === "Legendary Type") return legendaryOptions;
                    if (partType === "Pearl Type") return pearlOptions;
                    if (partType === "Element 1" || partType === "Element 2") return elementalOptions;
                    if (showAllMfgs && weaponData.partsByMfgTypeId) {
                      const stock: PartOpt[] = [], extra: PartOpt[] = [];
                      mfgWtIds.forEach((id) => {
                        const mfg = getMfgName(id);
                        const isStock = id === weaponMfgWtId;
                        (weaponData.partsByMfgTypeId[id]?.[partType] ?? []).forEach((p) => {
                          const item = { partId: p.partId, label: withMfgIfNeeded(p.label, mfg), isStock };
                          if (isStock) stock.push(item); else extra.push(item);
                        });
                      });
                      return [...stock, ...extra];
                    }
                    const parts = weaponData.partsByMfgTypeId[weaponMfgWtId]?.[partType] ?? [];
                    return parts.map((p) => ({ partId: p.partId, label: withMfgIfNeeded(p.label, weaponManufacturer), isStock: true }));
                  };
                  const list = (partType: string) => weaponPartSelections[partType] ?? [];
                  const removePartAt = (partType: string, index: number) => {
                    setWeaponPartSelections((prev) => {
                      const arr = [...(prev[partType] ?? [])];
                      arr.splice(index, 1);
                      return { ...prev, [partType]: arr };
                    });
                  };
                  const setPartQty = (partType: string, index: number, qty: string) => {
                    setWeaponPartSelections((prev) => {
                      const arr = [...(prev[partType] ?? [])];
                      if (arr[index]) arr[index] = { ...arr[index], qty };
                      return { ...prev, [partType]: arr };
                    });
                  };
                  const openPicker = (partType: string) => {
                    setWeaponPartPickerPartType(partType);
                    setWeaponPartPickerChecked(new Set());
                    setWeaponPartPickerShowQty(false);
                    setWeaponPartPickerQty("1");
                  };
                  const applyPickerWithQty = () => {
                    const partType = weaponPartPickerPartType;
                    if (!partType) return;
                    // Foregrip warning
                    if (partType === "Foregrip") {
                      if (!confirm("Warning: Selecting a foregrip will disable Daedalus ammo switching. Continue?")) return;
                    }
                    const qty = String(Math.max(1, Math.min(99, parseInt(weaponPartPickerQty.trim(), 10) || 1)));
                    const toAdd = Array.from(weaponPartPickerChecked).map((label) => ({ label, qty }));
                    setWeaponPartSelections((prev) => ({
                      ...prev,
                      [partType]: [...(prev[partType] ?? []), ...toAdd],
                    }));
                    setWeaponPartPickerPartType(null);
                    setWeaponPartPickerShowQty(false);
                    setWeaponPartPickerChecked(new Set());
                  };
                  return (
                    <>
                      {WEAPON_PART_ORDER.map(({ key: partType }) => {
                        const showLegendary = partType === "Legendary Type" && hasLegendary;
                        const showPearl = partType === "Pearl Type" && hasPearl;
                        if (partType === "Legendary Type" && !showLegendary) return null;
                        if (partType === "Pearl Type" && !showPearl) return null;
                        const entries = list(partType);
                        return (
                          <details key={partType} className="part-group rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)] overflow-hidden" open={partType === "Rarity" || partType === "Body" || partType === "Barrel"}>
                            <summary className="part-group-header flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none hover:bg-[var(--color-accent)]/10 transition-colors">
                              <span className="part-group-title text-sm font-medium text-[var(--color-accent)]">
                                {partType}
                                {entries.length > 0 && (
                                  <span className="ml-2 part-group-count px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-xs">
                                    {entries.length}
                                  </span>
                                )}
                              </span>
                              <span className="text-[var(--color-panel-border)]">▾</span>
                            </summary>
                            <div className="part-group-content px-3 pb-3 pt-1 border-t border-[var(--color-panel-border)]/30">
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => openPicker(partType)}
                                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                                >
                                  Select parts…
                                </button>
                                {entries.length > 0 && (
                                  <div className="space-y-2">
                                    {entries.map((item, idx) => {
                                      const pi = universalParts.find((u) => u.label === item.label);
                                      const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                                      return (
                                      <div key={`${partType}-${idx}-${item.label}`} className={`part-item rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`flex-1 min-w-0 text-sm font-medium truncate ${nameColor}`}>{item.label}</span>
                                          {partType !== "Rarity" && (
                                            <input
                                              type="number"
                                              min={1}
                                              max={99}
                                              value={item.qty}
                                              onChange={(e) => setPartQty(partType, idx, e.target.value)}
                                              className="w-14 px-2 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                              title="Quantity"
                                            />
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => removePartAt(partType, idx)}
                                            className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                                            title="Remove"
                                          >
                                            ×
                                          </button>
                                        </div>
                                        {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                                      </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </details>
                        );
                      }).filter(Boolean)}
                      {/* Part picker modal: checkbox list (themed) */}
                      {weaponPartPickerPartType && !weaponPartPickerShowQty && (
                        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setWeaponPartPickerPartType(null)}>
                          <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                              <div>
                                <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {weaponPartPickerPartType}</h3>
                                {showAllMfgs && (
                                  <p className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 leading-none">X-MFG</span>
                                    = cross-manufacturer part
                                  </p>
                                )}
                              </div>
                              <button type="button" onClick={() => setWeaponPartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3">
                              <p className="text-xs text-[var(--color-text-muted)] mb-2">Select one or more parts, then click Add selected. No limit.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setWeaponPartPickerPartType(null);
                                  setShowAddPartsModal(true);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm mb-2"
                              >
                                ➕ Add part from database…
                              </button>
                              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                                {getOpts(weaponPartPickerPartType).map((o) => (
                                  <label
                                    key={o.partId + o.label}
                                    className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30 ${showAllMfgs && !o.isStock ? "bg-amber-400/[0.03]" : ""}`}
                                    onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, weaponPartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)}
                                    onMouseLeave={endHover}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={weaponPartPickerChecked.has(o.label)}
                                      onChange={(e) => {
                                        setWeaponPartPickerChecked((prev) => {
                                          const next = new Set(prev);
                                          if (e.target.checked) next.add(o.label);
                                          else next.delete(o.label);
                                          return next;
                                        });
                                      }}
                                      className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[rgba(24,28,34,0.98)] checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                                    />
                                    <span className="flex-1 min-w-0">
                                      {showAllMfgs && !o.isStock && (
                                        <span className="inline-flex items-center mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 leading-none align-middle">X-MFG</span>
                                      )}
                                      <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={weaponPartPickerPartType} detailed={richDetailView} />
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowAddPartsModal(true)}
                                className="mt-2 text-sm text-[var(--color-accent)] hover:underline"
                              >
                                Add other parts from database
                              </button>
                            </div>
                            <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                              <button
                                type="button"
                                onClick={() => setWeaponPartPickerPartType(null)}
                                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (weaponPartPickerChecked.size === 0) return;
                                  if (weaponPartPickerPartType === "Rarity") {
                                    const partType = weaponPartPickerPartType;
                                    const toAdd = Array.from(weaponPartPickerChecked).map((label) => ({ label, qty: "1" }));
                                    setWeaponPartSelections((prev) => ({
                                      ...prev,
                                      [partType]: [...(prev[partType] ?? []), ...toAdd],
                                    }));
                                    setWeaponPartPickerPartType(null);
                                    setWeaponPartPickerChecked(new Set());
                                  } else {
                                    setWeaponPartPickerShowQty(true);
                                  }
                                }}
                                disabled={weaponPartPickerChecked.size === 0}
                                className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Add selected ({weaponPartPickerChecked.size})
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Quantity popup after "Add selected" */}
                      {weaponPartPickerPartType && weaponPartPickerShowQty && (
                        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setWeaponPartPickerPartType(null); setWeaponPartPickerShowQty(false); }}>
                          <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                            <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {weaponPartPickerChecked.size} selected parts.</p>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={weaponPartPickerQty}
                              onChange={(e) => setWeaponPartPickerQty(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-4"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => { setWeaponPartPickerPartType(null); setWeaponPartPickerShowQty(false); }}
                                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={applyPickerWithQty}
                                className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm"
                              >
                                Add to build
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {/* Skin selector with preview (same as Gear Forge weapon builder) */}
            {weaponData?.skins && weaponData.skins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={weaponSkinValue}
                    onChange={(e) => setWeaponSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {weaponData.skins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {weaponSkinValue && (
                    <SkinPreview
                      token={weaponSkinValue}
                      label={weaponData.skins.find((s) => s.value === weaponSkinValue)?.label ?? weaponSkinValue}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Grenade Stats Estimator — above builder, matching weapon DPS placement */}
      {lastGrenadeStats && category === "grenade" && (
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-3">
          {lastGrenadeStats.perkCounts["Explosive"] === 1 && Object.keys(lastGrenadeStats.perkCounts).length <= 1 && (
            <div className="mb-2 px-3 py-2 rounded-lg border border-gray-500/40 bg-gray-500/10 text-gray-400 text-sm font-bold">
              ChatGPT's Grenade (1/100) — "Tried to make a grenade but couldn't even do that right."
            </div>
          )}
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Grenade Estimate <span className="normal-case text-[var(--color-text-muted)]/60">(from perk stacks)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">Damage:</span>{" "}
              <span className="text-orange-400 font-bold">{lastGrenadeStats.damageMultiplier > 1 ? `×${lastGrenadeStats.damageMultiplier.toFixed(1)}` : "Base"}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">Radius:</span>{" "}
              <span className="text-blue-400 font-bold">{lastGrenadeStats.radiusMultiplier > 1 ? `×${lastGrenadeStats.radiusMultiplier.toFixed(1)}` : "Base"}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">Charges:</span>{" "}
              <span className="text-green-400 font-bold">{lastGrenadeStats.charges}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">Cooldown:</span>{" "}
              <span className={`font-bold ${lastGrenadeStats.cooldownMultiplier < 1 ? "text-emerald-400" : lastGrenadeStats.cooldownMultiplier > 1 ? "text-red-400" : "text-[var(--color-text)]"}`}>
                {lastGrenadeStats.cooldownMultiplier < 1 ? `${Math.round((1 - lastGrenadeStats.cooldownMultiplier) * 100)}% faster` : lastGrenadeStats.cooldownMultiplier > 1 ? `${Math.round((lastGrenadeStats.cooldownMultiplier - 1) * 100)}% slower` : "Normal"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-[var(--color-text-muted)]">
            {lastGrenadeStats.critChance > 0 && <span>Crit: {lastGrenadeStats.critChance}%</span>}
            {lastGrenadeStats.lifesteal > 0 && <span>Lifesteal: {lastGrenadeStats.lifesteal}%</span>}
            {lastGrenadeStats.statusChanceMultiplier > 1 && <span>Status: ×{lastGrenadeStats.statusChanceMultiplier.toFixed(1)}</span>}
            {lastGrenadeStats.knockbackMultiplier > 1 && <span>Knockback: ×{lastGrenadeStats.knockbackMultiplier.toFixed(1)}</span>}
            {lastGrenadeStats.style && <span className="text-[var(--color-accent)]">Style: {lastGrenadeStats.style}</span>}
          </div>
          {Object.keys(lastGrenadeStats.perkCounts).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(lastGrenadeStats.perkCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => (
                <span key={name} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-[var(--color-panel-border)] bg-white/5 text-[var(--color-text-muted)]">
                  {name} ×{count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grenade: Manufacturer + Level + Seed + Add other parts + part slot dropdowns */}
      {category === "grenade" && grenadeData && grenadeMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Grenade build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowGrenadeMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {grenadeData.mfgs.find((m) => m.id === grenadeMfgId)?.name ?? `Mfg ${grenadeMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={() => setShowAddPartsModal(true)} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Add other parts
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={handleRandomGrenade} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Random item
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={() => setShowGrenadeGodRollModal(true)}
                    disabled={!grenadeData?.godrolls?.length}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    title={grenadeData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                  >
                    God roll
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={handleGrenadeAutoFill}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                    title="Fill empty part slots. Select manufacturer first."
                  >
                    Auto fill
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-red-500/40 px-3 py-2 min-h-[44px] flex items-center">
                  <button type="button" onClick={resetGrenadeBuilder} className="text-red-400 hover:text-red-300 text-sm w-full text-left" title="Reset grenade builder">Reset</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Power</label>
                <div className="flex rounded-lg border border-[var(--color-panel-border)] overflow-hidden min-h-[44px]">
                  {(["stable", "op", "insane"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setModdedWeaponPowerMode(mode)}
                      className={`px-3 py-2 text-xs font-medium transition-colors ${moddedWeaponPowerMode === mode ? "bg-[var(--color-accent)] text-black" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}
                    >
                      {mode === "stable" ? "Stable" : mode === "op" ? "OP" : "Insane"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={handleGenerateModdedGrenade}
                    className="text-purple-300 hover:text-purple-200 text-sm w-full text-left font-medium"
                    title="Generate a modded grenade"
                  >
                    Generate Modded
                  </button>
                </div>
              </div>
            </div>
            {grenadeAutoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setGrenadeAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{grenadeAutoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setGrenadeAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}
            {showGrenadeMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowGrenadeMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowGrenadeMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {grenadeData.mfgs.map((m) => {
                        const active = m.id === grenadeMfgId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setGrenadeMfgId(m.id);
                              setShowGrenadeMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span
                              className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`}
                            />
                            <span className="text-sm text-[var(--color-text)]">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showGrenadeGodRollModal && grenadeData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowGrenadeGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowGrenadeGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {grenadeData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleGrenadeGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(() => {
              const rarities = grenadeData.raritiesByMfg[grenadeMfgId] ?? [];
              const legendaryOptions = grenadeData.legendaryPerks.map((l) => ({
                partId: `${l.mfgId}:${l.partId}`,
                label: `${l.mfgId}:${l.partId} - ${l.mfgName}: ${l.stat}`,
                description: l.description,
              }));
              const elementOptions = grenadeData.element.map((e) => ({ partId: String(e.partId), label: `${e.partId} - ${e.stat}`, description: e.description }));
              const firmwareOptions = grenadeData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}`, description: f.description }));
              const mfgPerksList = grenadeData.mfgPerks[grenadeMfgId] ?? [];
              const mfgPerkOptions = mfgPerksList.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description }));
              const universalPerkOptions = grenadeData.universalPerks.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description }));

              const getOpts = (partType: string): { partId: string; label: string; description?: string }[] => {
                if (partType === "Rarity") return rarities.map((r) => ({ partId: String(r.id), label: r.label }));
                if (partType === "Legendary") return legendaryOptions;
                if (partType === "Element") return elementOptions;
                if (partType === "Firmware") return firmwareOptions;
                if (partType === "Mfg Perk") return mfgPerkOptions;
                if (partType === "Universal Perk") return universalPerkOptions;
                return [];
              };
              const list = (partType: string) => grenadePartSelections[partType] ?? [];
              const removePartAt = (partType: string, index: number) => {
                setGrenadePartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  arr.splice(index, 1);
                  return { ...prev, [partType]: arr };
                });
              };
              const setPartQty = (partType: string, index: number, qty: string) => {
                setGrenadePartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  if (arr[index]) arr[index] = { ...arr[index], qty };
                  return { ...prev, [partType]: arr };
                });
              };
              const openPicker = (partType: string) => {
                setGrenadePartPickerPartType(partType);
                setGrenadePartPickerChecked(new Set());
                setGrenadePartPickerShowQty(false);
                setGrenadePartPickerQty("1");
              };
              const applyPickerWithQty = () => {
                const partType = grenadePartPickerPartType;
                if (!partType) return;
                const qty = String(Math.max(1, Math.min(99, parseInt(grenadePartPickerQty.trim(), 10) || 1)));
                const toAdd = Array.from(grenadePartPickerChecked).map((label) => ({ label, qty }));
                setGrenadePartSelections((prev) => ({
                  ...prev,
                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                }));
                setGrenadePartPickerPartType(null);
                setGrenadePartPickerShowQty(false);
                setGrenadePartPickerChecked(new Set());
              };

              return (
                <>
                  {GRENADE_PART_ORDER.map(({ key: partType }) => {
                    const entries = list(partType);
                    return (
                      <details key={partType} className="part-group rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)] overflow-hidden" open={partType === "Rarity" || partType === "Legendary"}>
                        <summary className="part-group-header flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none hover:bg-[var(--color-accent)]/10 transition-colors">
                          <span className="part-group-title text-sm font-medium text-[var(--color-accent)]">
                            {partType}
                            {entries.length > 0 && (
                              <span className="ml-2 part-group-count px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-xs">
                                {entries.length}
                              </span>
                            )}
                          </span>
                          <span className="text-[var(--color-panel-border)]">▾</span>
                        </summary>
                        <div className="part-group-content px-3 pb-3 pt-1 border-t border-[var(--color-panel-border)]/30">
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => openPicker(partType)}
                              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                            >
                              Select parts…
                            </button>
                            {entries.length > 0 && (
                              <div className="space-y-2">
                                {entries.map((item, idx) => {
                                  const pi = universalParts.find((u) => u.label === item.label);
                                  const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                                  return (
                                  <div key={`${partType}-${idx}-${item.label}`} className={`part-item rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`flex-1 min-w-0 text-sm font-medium truncate ${nameColor}`}>{item.label}</span>
                                      {partType !== "Rarity" && (
                                        <input
                                          type="number"
                                          min={1}
                                          max={99}
                                          value={item.qty}
                                          onChange={(e) => setPartQty(partType, idx, e.target.value)}
                                          className="w-14 px-2 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                          title="Quantity"
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => removePartAt(partType, idx)}
                                        className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                                        title="Remove"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    );
                  })}

                  {/* Grenade part picker modal: checkbox list (themed, matches weapon) */}
                  {grenadePartPickerPartType && !grenadePartPickerShowQty && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setGrenadePartPickerPartType(null)}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                          <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {grenadePartPickerPartType}</h3>
                          <button type="button" onClick={() => setGrenadePartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                          <p className="text-xs text-[var(--color-text-muted)] mb-2">Select one or more parts, then click Add selected. No limit.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setGrenadePartPickerPartType(null);
                              setShowAddPartsModal(true);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm mb-2"
                          >
                            ➕ Add part from database…
                          </button>
                          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                            {getOpts(grenadePartPickerPartType).map((o) => (
                              <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30" onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, grenadePartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                <input
                                  type="checkbox"
                                  checked={grenadePartPickerChecked.has(o.label)}
                                  onChange={(e) => {
                                    setGrenadePartPickerChecked((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(o.label);
                                      else next.delete(o.label);
                                      return next;
                                    });
                                  }}
                                  className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[rgba(24,28,34,0.98)] checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                                />
                                <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={grenadePartPickerPartType || undefined} detailed={richDetailView} />
                              </label>
                            ))}
                          </div>
                          <button type="button" onClick={() => setShowAddPartsModal(true)} className="mt-2 text-sm text-[var(--color-accent)] hover:underline">
                            Add other parts from database
                          </button>
                        </div>
                        <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                          <button type="button" onClick={() => setGrenadePartPickerPartType(null)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (grenadePartPickerChecked.size === 0) return;
                              if (grenadePartPickerPartType === "Rarity") {
                                const partType = grenadePartPickerPartType;
                                const toAdd = Array.from(grenadePartPickerChecked).map((label) => ({ label, qty: "1" }));
                                setGrenadePartSelections((prev) => ({
                                  ...prev,
                                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                                }));
                                setGrenadePartPickerPartType(null);
                                setGrenadePartPickerChecked(new Set());
                              } else {
                                setGrenadePartPickerShowQty(true);
                              }
                            }}
                            disabled={grenadePartPickerChecked.size === 0}
                            className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add selected ({grenadePartPickerChecked.size})
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {grenadePartPickerPartType && grenadePartPickerShowQty && (
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setGrenadePartPickerPartType(null); setGrenadePartPickerShowQty(false); }}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                        <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {grenadePartPickerChecked.size} selected parts.</p>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={grenadePartPickerQty}
                          onChange={(e) => setGrenadePartPickerQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => { setGrenadePartPickerPartType(null); setGrenadePartPickerShowQty(false); }} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm">
                            Cancel
                          </button>
                          <button type="button" onClick={applyPickerWithQty} className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">
                            Add to build
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={grenadeSkinValue}
                    onChange={(e) => setGrenadeSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {grenadeSkinValue && (
                    <SkinPreview token={grenadeSkinValue} label={sharedSkins.find((s) => s.value === grenadeSkinValue)?.label ?? grenadeSkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Shield: Manufacturer + Level + Seed + Add other parts + part groups (weapon-style) */}
      {category === "shield" && shieldData && shieldMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Shield build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then select parts from each group. Use &quot;Add other parts&quot; to add any part from the database.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowShieldMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {shieldData.mfgs.find((m) => m.id === shieldMfgId)?.name ?? `Mfg ${shieldMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={handleRandomShield}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Random item
                </button>
                <button
                  type="button"
                  onClick={() => setShowShieldGodRollModal(true)}
                  disabled={!shieldData?.godrolls?.length}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  title={shieldData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                >
                  God roll
                </button>
                <button
                  type="button"
                  onClick={handleShieldAutoFill}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                  title="Fill empty part groups. Select manufacturer first."
                >
                  Auto fill
                </button>
                <div>
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Power</label>
                  <div className="flex rounded-lg border border-[var(--color-panel-border)] overflow-hidden min-h-[44px]">
                    {(["stable", "op", "insane"] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setModdedWeaponPowerMode(mode)}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${moddedWeaponPowerMode === mode ? "bg-[var(--color-accent)] text-black" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
                        {mode === "stable" ? "Stable" : mode === "op" ? "OP" : "Insane"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Toggles</label>
                  <div className="flex gap-2 min-h-[44px] items-center">
                    {([["ammoRegen", "Ammo Regen", shieldModAmmoRegen, setShieldModAmmoRegen, "emerald"],
                       ["moveSpeed", "Move Speed", shieldModMovementSpeed, setShieldModMovementSpeed, "amber"],
                       ["fireworks", "Missiles", shieldModFireworks, setShieldModFireworks, "red"],
                       ["immortal", "Immortality", shieldModImmortality, setShieldModImmortality, "purple"]] as const).map(([key, label, val, setter, color]) => {
                      const activeColors: Record<string, string> = {
                        emerald: "border-emerald-400 bg-emerald-500/25 text-emerald-300 shadow-emerald-500/30",
                        amber: "border-amber-400 bg-amber-500/25 text-amber-300 shadow-amber-500/30",
                        red: "border-red-400 bg-red-500/25 text-red-300 shadow-red-500/30",
                        purple: "border-purple-400 bg-purple-500/25 text-purple-300 shadow-purple-500/30",
                      };
                      return (
                        <button key={key} type="button" onClick={() => (setter as (v: boolean) => void)(!val)}
                          className={`rounded font-bold border transition-all duration-150 ${val
                            ? `px-3 py-1.5 text-xs ${activeColors[color]} shadow-[0_0_10px_rgba(0,0,0,0.3)] scale-105`
                            : "px-2 py-1 text-[10px] border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 opacity-60"}`}>
                          {val ? `\u2713 ${label}` : label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                  <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                    <button type="button" onClick={handleGenerateModdedShield}
                      className="text-blue-300 hover:text-blue-200 text-sm w-full text-left font-medium"
                      title="Generate a modded shield with legendary perks + universal + energy + armor stacking">
                      Generate Modded
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Shield Stats Estimator */}
            {lastShieldStats && category === "shield" && (
              <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] px-3 py-3 mt-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                  Shield Estimate
                  {(lastShieldStats as any).shieldType && (
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${(lastShieldStats as any).shieldType === "Armor" ? "border border-orange-500/40 bg-orange-500/10 text-orange-300" : "border border-sky-500/40 bg-sky-500/10 text-sky-300"}`}>
                      {(lastShieldStats as any).shieldType}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm mb-2">
                  <div>
                    <span className="text-[var(--color-text-muted)] text-xs">Health:</span>{" "}
                    <span className="text-green-400 font-bold">{lastShieldStats.healthMultiplier > 1 ? `x${lastShieldStats.healthMultiplier.toFixed(1)}` : "Base"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)] text-xs">Capacity:</span>{" "}
                    <span className="text-blue-400 font-bold">{lastShieldStats.capacityMultiplier > 1 ? `x${lastShieldStats.capacityMultiplier.toFixed(1)}` : "Base"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)] text-xs">Recharge:</span>{" "}
                    <span className="text-cyan-400 font-bold">{lastShieldStats.rechargeMultiplier > 1 ? `x${lastShieldStats.rechargeMultiplier.toFixed(1)}` : "Base"}</span>
                  </div>
                </div>
                {lastShieldStats.legendaryPerks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {lastShieldStats.legendaryPerks.map((perk) => (
                      <span key={perk} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-500/40 bg-blue-500/10 text-blue-300">
                        {perk}
                      </span>
                    ))}
                    {shieldModAmmoRegen && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">AMMO REGEN</span>}
                    {shieldModMovementSpeed && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-300">MOVE SPEED</span>}
                    {shieldModFireworks && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-red-500/40 bg-red-500/10 text-red-300">MISSILES</span>}
                    {shieldModImmortality && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-purple-500/40 bg-purple-500/10 text-purple-300">IMMORTALITY</span>}
                  </div>
                )}
              </div>
            )}

            {shieldAutoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShieldAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{shieldAutoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setShieldAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}

            {showShieldMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowShieldMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {shieldData.mfgs.map((m) => {
                        const active = m.id === shieldMfgId;
                        const typeLabel = shieldData.mfgTypeById[m.id] ?? "Unknown";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setShieldMfgId(m.id);
                              setShowShieldMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="min-w-0">
                              <span className="block text-sm text-[var(--color-text)]">{m.name}</span>
                              <span className="block text-xs text-[var(--color-text-muted)]">{typeLabel}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShieldGodRollModal && shieldData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowShieldGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {shieldData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleShieldGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const shieldType = shieldData.mfgTypeById[shieldMfgId] ?? "Energy";
              const rarities = shieldData.raritiesByMfg[shieldMfgId] ?? [];
              const legendaryOptions = shieldData.legendaryPerks.map((l) => ({
                partId: `${l.mfgId}:${l.partId}`,
                label: `${l.mfgId}:${l.partId} - ${l.mfgName}: ${l.stat}`,
                description: l.description,
              }));
              const elementOptions = shieldData.element.map((e) => ({ partId: String(e.partId), label: `${e.partId} - ${e.stat}`, description: e.description }));
              const firmwareOptions = shieldData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}`, description: f.description }));
              const universalOptions = shieldData.universalPerks.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description }));
              const energyOptions = shieldData.energyPerks.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description }));
              const armorOptions = shieldData.armorPerks.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description }));

              const getOpts = (partType: string): { partId: string; label: string; description?: string }[] => {
                if (partType === "Rarity") return rarities.map((r) => ({ partId: String(r.id), label: r.label, description: undefined }));
                if (partType === "Legendary") return legendaryOptions;
                if (partType === "Element") return elementOptions;
                if (partType === "Firmware") return firmwareOptions;
                if (partType === "Universal Perk") return universalOptions;
                if (partType === "Energy Perk") return energyOptions;
                if (partType === "Armor Perk") return armorOptions;
                return [];
              };

              const list = (partType: string) => shieldPartSelections[partType] ?? [];
              const removePartAt = (partType: string, index: number) => {
                setShieldPartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  arr.splice(index, 1);
                  return { ...prev, [partType]: arr };
                });
              };
              const setPartQty = (partType: string, index: number, qty: string) => {
                setShieldPartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  if (arr[index]) arr[index] = { ...arr[index], qty };
                  return { ...prev, [partType]: arr };
                });
              };
              const openPicker = (partType: string) => {
                setShieldPartPickerPartType(partType);
                setShieldPartPickerChecked(new Set());
                setShieldPartPickerShowQty(false);
                setShieldPartPickerQty("1");
              };
              const applyPickerWithQty = () => {
                const partType = shieldPartPickerPartType;
                if (!partType) return;
                const qty = String(Math.max(1, Math.min(99, parseInt(shieldPartPickerQty.trim(), 10) || 1)));
                const toAdd = Array.from(shieldPartPickerChecked).map((label) => ({ label, qty }));
                setShieldPartSelections((prev) => ({
                  ...prev,
                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                }));
                setShieldPartPickerPartType(null);
                setShieldPartPickerShowQty(false);
                setShieldPartPickerChecked(new Set());
              };

              const visibleGroups = SHIELD_PART_ORDER;

              return (
                <>
                  <div className="space-y-2">
                    {visibleGroups.map(({ key: partType }) => {
                      const entries = list(partType);
                      return (
                        <details key={partType} className="part-group rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)] overflow-hidden" open={partType === "Rarity" || partType === "Legendary"}>
                          <summary className="part-group-header flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none hover:bg-[var(--color-accent)]/10 transition-colors">
                            <span className="part-group-title text-sm font-medium text-[var(--color-accent)]">
                              {partType}
                              {entries.length > 0 && (
                                <span className="ml-2 part-group-count px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-xs">
                                  {entries.length}
                                </span>
                              )}
                            </span>
                            <span className="text-[var(--color-panel-border)]">▾</span>
                          </summary>
                          <div className="part-group-content px-3 pb-3 pt-1 border-t border-[var(--color-panel-border)]/30">
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => openPicker(partType)}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                              >
                                Select parts…
                              </button>
                              {entries.length > 0 && (
                                <div className="space-y-2">
                                  {entries.map((item, idx) => {
                                    const pi = universalParts.find((u) => u.label === item.label);
                                    const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                                    return (
                                    <div key={`${partType}-${idx}-${item.label}`} className={`part-item rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`flex-1 min-w-0 text-sm font-medium truncate ${nameColor}`}>{item.label}</span>
                                        {partType !== "Rarity" && (
                                          <input
                                            type="number"
                                            min={1}
                                            max={99}
                                            value={item.qty}
                                            onChange={(e) => setPartQty(partType, idx, e.target.value)}
                                            className="w-14 px-2 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                            title="Quantity"
                                          />
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => removePartAt(partType, idx)}
                                          className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                                          title="Remove"
                                        >
                                          ×
                                        </button>
                                      </div>
                                      {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {shieldPartPickerPartType && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShieldPartPickerPartType(null)}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                          <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {shieldPartPickerPartType}</h3>
                          <button type="button" onClick={() => setShieldPartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setShieldPartPickerPartType(null);
                              setShowAddPartsModal(true);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                          >
                            ➕ Add part from database…
                          </button>
                          <div className="mt-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                            {getOpts(shieldPartPickerPartType).map((o) => (
                                <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30" onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, shieldPartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                <input
                                  type="checkbox"
                                  checked={shieldPartPickerChecked.has(o.label)}
                                  onChange={(e) => {
                                    setShieldPartPickerChecked((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(o.label);
                                      else next.delete(o.label);
                                      return next;
                                    });
                                  }}
                                  className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[rgba(24,28,34,0.98)] checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                                />
                                <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={shieldPartPickerPartType || undefined} detailed={richDetailView} />
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                          <button type="button" onClick={() => setShieldPartPickerPartType(null)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (shieldPartPickerChecked.size === 0) return;
                              if (shieldPartPickerPartType === "Rarity") {
                                const partType = shieldPartPickerPartType;
                                const toAdd = Array.from(shieldPartPickerChecked).map((label) => ({ label, qty: "1" }));
                                setShieldPartSelections((prev) => ({
                                  ...prev,
                                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                                }));
                                setShieldPartPickerPartType(null);
                                setShieldPartPickerChecked(new Set());
                              } else {
                                setShieldPartPickerShowQty(true);
                              }
                            }}
                            disabled={shieldPartPickerChecked.size === 0}
                            className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add selected ({shieldPartPickerChecked.size})
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {shieldPartPickerPartType && shieldPartPickerShowQty && (
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setShieldPartPickerPartType(null); setShieldPartPickerShowQty(false); }}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                        <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {shieldPartPickerChecked.size} selected parts.</p>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldPartPickerQty}
                          onChange={(e) => setShieldPartPickerQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => { setShieldPartPickerPartType(null); setShieldPartPickerShowQty(false); }} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm">
                            Cancel
                          </button>
                          <button type="button" onClick={applyPickerWithQty} className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">
                            Add to build
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </details>
      )}

      {/* Shield: Manufacturer + Level + Seed + Add other parts + part slot dropdowns */}
      {category === "shield" && shieldData && shieldMfgId != null && false && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Shield build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowShieldMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {shieldData.mfgs.find((m) => m.id === shieldMfgId)?.name ?? `Mfg ${shieldMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={() => setShowAddPartsModal(true)} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Add other parts
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={handleRandomShield} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Random item
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={() => setShowShieldGodRollModal(true)}
                    disabled={!shieldData?.godrolls?.length}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    title={shieldData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                  >
                    God roll
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={handleShieldAutoFill}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                    title="Fill empty part slots. Select manufacturer first."
                  >
                    Auto fill
                  </button>
                </div>
              </div>
            </div>

            {shieldAutoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShieldAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{shieldAutoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setShieldAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}

            {showShieldMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowShieldMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {shieldData.mfgs.map((m) => {
                        const active = m.id === shieldMfgId;
                        const typeLabel = shieldData.mfgTypeById[m.id] ?? "Unknown";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setShieldMfgId(m.id);
                              setShowShieldMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="min-w-0">
                              <span className="block text-sm text-[var(--color-text)]">{m.name}</span>
                              <span className="block text-xs text-[var(--color-text-muted)]">{typeLabel}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShieldGodRollModal && shieldData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowShieldGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {shieldData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleShieldGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Legendary perks modal */}
            {showShieldLegendaryModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldLegendaryModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Legendary perks</h3>
                    <button type="button" onClick={() => setShowShieldLegendaryModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={shieldLegendarySearch}
                          onChange={(e) => setShieldLegendarySearch(e.target.value)}
                          placeholder="Search legendary perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldLegendaryApplyQty}
                          onChange={(e) => setShieldLegendaryApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(5, parseInt(shieldLegendaryApplyQty.trim(), 10) || 1));
                          if (shieldLegendarySelectedIds.size === 0) return;
                          setShieldLegendaryQtyById((prev) => {
                            const next = { ...prev };
                            shieldLegendarySelectedIds.forEach((key) => { next[key] = qty; });
                            return next;
                          });
                          setShieldLegendarySelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {shieldData.legendaryPerks
                          .filter((p) => {
                            const q = shieldLegendarySearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.mfgName} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const key = `${p.mfgId}:${p.partId}`;
                            const checked = shieldLegendarySelectedIds.has(key);
                            const currentQty = shieldLegendaryQtyById[key] ?? 0;
                            return (
                              <label key={key} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(shieldLegendarySelectedIds);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    setShieldLegendarySelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.mfgName}: {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Perk stack modals */}
            {showShieldElementModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldElementModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Elemental resistance</h3>
                    <button type="button" onClick={() => setShowShieldElementModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={shieldElementSearch}
                          onChange={(e) => setShieldElementSearch(e.target.value)}
                          placeholder="Search elemental resistance…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldElementApplyQty}
                          onChange={(e) => setShieldElementApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(5, parseInt(shieldElementApplyQty.trim(), 10) || 1));
                          if (shieldElementSelectedIds.size === 0) return;
                          setShieldElementQtyById((prev) => {
                            const next = { ...prev };
                            shieldElementSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setShieldElementSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {shieldData.element
                          .filter((p) => {
                            const q = shieldElementSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = shieldElementSelectedIds.has(p.partId);
                            const currentQty = shieldElementQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(shieldElementSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setShieldElementSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShieldUniversalModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldUniversalModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Universal perks</h3>
                    <button type="button" onClick={() => setShowShieldUniversalModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={shieldUniversalSearch}
                          onChange={(e) => setShieldUniversalSearch(e.target.value)}
                          placeholder="Search universal perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldUniversalApplyQty}
                          onChange={(e) => setShieldUniversalApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(99, parseInt(shieldUniversalApplyQty.trim(), 10) || 1));
                          if (shieldUniversalSelectedIds.size === 0) return;
                          setShieldUniversalQtyById((prev) => {
                            const next = { ...prev };
                            shieldUniversalSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setShieldUniversalSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {shieldData.universalPerks
                          .filter((p) => {
                            const q = shieldUniversalSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = shieldUniversalSelectedIds.has(p.partId);
                            const currentQty = shieldUniversalQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(shieldUniversalSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setShieldUniversalSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShieldEnergyModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldEnergyModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Energy perks</h3>
                    <button type="button" onClick={() => setShowShieldEnergyModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={shieldEnergySearch}
                          onChange={(e) => setShieldEnergySearch(e.target.value)}
                          placeholder="Search energy perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldEnergyApplyQty}
                          onChange={(e) => setShieldEnergyApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(99, parseInt(shieldEnergyApplyQty.trim(), 10) || 1));
                          if (shieldEnergySelectedIds.size === 0) return;
                          setShieldEnergyQtyById((prev) => {
                            const next = { ...prev };
                            shieldEnergySelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setShieldEnergySelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {shieldData.energyPerks
                          .filter((p) => {
                            const q = shieldEnergySearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = shieldEnergySelectedIds.has(p.partId);
                            const currentQty = shieldEnergyQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(shieldEnergySelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setShieldEnergySelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShieldArmorModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowShieldArmorModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Armor perks</h3>
                    <button type="button" onClick={() => setShowShieldArmorModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={shieldArmorSearch}
                          onChange={(e) => setShieldArmorSearch(e.target.value)}
                          placeholder="Search armor perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shieldArmorApplyQty}
                          onChange={(e) => setShieldArmorApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(99, parseInt(shieldArmorApplyQty.trim(), 10) || 1));
                          if (shieldArmorSelectedIds.size === 0) return;
                          setShieldArmorQtyById((prev) => {
                            const next = { ...prev };
                            shieldArmorSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setShieldArmorSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {shieldData.armorPerks
                          .filter((p) => {
                            const q = shieldArmorSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = shieldArmorSelectedIds.has(p.partId);
                            const currentQty = shieldArmorQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(shieldArmorSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setShieldArmorSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2">
              {(() => {
                const rarities = shieldData.raritiesByMfg[shieldMfgId] ?? [];
                const firmwareOptions = shieldData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}` }));
                return SHIELD_PART_ORDER.flatMap(({ key: shieldPartKey }) => {
                  const partType = shieldPartKey as string;
                  if (partType === "Universal perks") {
                    return [(
                      <div key="Shield Universal" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Universal perks (multi-select)</label>
                          <button type="button" onClick={() => setShowShieldUniversalModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(shieldUniversalQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(shieldUniversalQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = shieldData.universalPerks.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">{perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}</div>
                                    <input type="number" min={1} max={99} value={String(qty)} onChange={(e) => {
                                      const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                                      setShieldUniversalQtyById((prev) => ({ ...prev, [id]: v }));
                                    }} className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]" />
                                    <button type="button" onClick={() => setShieldUniversalQtyById((prev) => { const next = { ...prev }; delete next[id]; return next; })} className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center">×</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }
                  if (partType === "Energy perks") {
                    return [(
                      <div key="Shield Energy" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <label className="block text-xs text-[var(--color-accent)]">Energy perks (multi-select)</label>
                            <p className="text-[10px] text-[var(--color-text-muted)]">May not work properly on armor shields.</p>
                          </div>
                          <button type="button" onClick={() => setShowShieldEnergyModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(shieldEnergyQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(shieldEnergyQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = shieldData.energyPerks.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">{perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}</div>
                                    <input type="number" min={1} max={99} value={String(qty)} onChange={(e) => {
                                      const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                                      setShieldEnergyQtyById((prev) => ({ ...prev, [id]: v }));
                                    }} className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]" />
                                    <button type="button" onClick={() => setShieldEnergyQtyById((prev) => { const next = { ...prev }; delete next[id]; return next; })} className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center">×</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }
                  if (partType === "Armor perks") {
                    return [(
                      <div key="Shield Armor" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <label className="block text-xs text-[var(--color-accent)]">Armor perks (multi-select)</label>
                            <p className="text-[10px] text-[var(--color-text-muted)]">May not work properly on energy shields.</p>
                          </div>
                          <button type="button" onClick={() => setShowShieldArmorModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(shieldArmorQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(shieldArmorQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = shieldData.armorPerks.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">{perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}</div>
                                    <input type="number" min={1} max={99} value={String(qty)} onChange={(e) => {
                                      const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                                      setShieldArmorQtyById((prev) => ({ ...prev, [id]: v }));
                                    }} className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]" />
                                    <button type="button" onClick={() => setShieldArmorQtyById((prev) => { const next = { ...prev }; delete next[id]; return next; })} className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center">×</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  if (partType === "Legendary") {
                    return [(
                      <div key="Shield Legendary" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <label className="block text-xs text-[var(--color-accent)]">Legendary perks (multi-select)</label>
                            <p className="text-[10px] text-[var(--color-text-muted)]">If none selected, Shield model will be used.</p>
                          </div>
                          <button type="button" onClick={() => setShowShieldLegendaryModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(shieldLegendaryQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(shieldLegendaryQtyById).sort((a, b) => a[0].localeCompare(b[0])).map(([key, qty]) => {
                                const [mfgStr, idStr] = key.split(":", 2);
                                const id = Number(idStr);
                                const mfg = Number(mfgStr);
                                const perk = shieldData.legendaryPerks.find((p) => p.partId === id && p.mfgId === mfg);
                                return (
                                  <div key={key} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">
                                      {perk ? `${perk.partId} - ${perk.mfgName}: ${perk.stat}` : `Perk ${key}`}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={String(qty)}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1));
                                        setShieldLegendaryQtyById((prev) => ({ ...prev, [key]: v }));
                                      }}
                                      className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                      title="Quantity"
                                    />
                                    <button
                                      type="button"
                                        onClick={() => {
                                          setShieldLegendaryQtyById((prev) => {
                                            const next = { ...prev };
                                            delete next[key];
                                            return next;
                                          });
                                        }}
                                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  if (partType === "Element") {
                    return [(
                      <div key="Shield Element" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Elemental Resistance (multi-select)</label>
                          <button type="button" onClick={() => setShowShieldElementModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select resistances…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(shieldElementQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(shieldElementQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = shieldData.element.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">
                                      {perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={String(qty)}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1));
                                        setShieldElementQtyById((prev) => ({ ...prev, [id]: v }));
                                      }}
                                      className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                      title="Quantity"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShieldElementQtyById((prev) => {
                                          const next = { ...prev };
                                          delete next[id];
                                          return next;
                                        });
                                      }}
                                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  let opts: { partId: string; label: string; value?: string }[] = [];
                  if (partType === "Rarity") opts = rarities.map((r) => ({ partId: String(r.id), label: r.label, value: r.label }));
                  else if (partType === "Firmware") opts = firmwareOptions;
                  else return [];

                  const key = partType;
                  const value = shieldSlotSelections[key] ?? NONE;
                  return [(
                    <div key={key} className="space-y-1">
                      <label className="block text-xs text-[var(--color-accent)]">{partType}</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === ADD_OTHER_OPTION) { setShowAddPartsModal(true); return; }
                            setShieldSlotSelections((prev) => ({ ...prev, [key]: v }));
                            setShieldSlotQuantities((prev) => ({ ...prev, [key]: "1" }));
                          }}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        >
                          <option value={NONE}>{NONE}</option>
                          <option value={ADD_OTHER_OPTION}>Add other parts</option>
                          {opts.map((o) => (
                            <option key={o.partId + o.label} value={o.value ?? o.label}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )];
                });
              })()}
            </div>
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={shieldSkinValue}
                    onChange={(e) => setShieldSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {shieldSkinValue && (
                    <SkinPreview token={shieldSkinValue} label={sharedSkins.find((s) => s.value === shieldSkinValue)?.label ?? shieldSkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* RepKit Stats Estimator — above builder, matching weapon DPS placement */}
      {category === "repkit" && moddedRepkitStats && (
        <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Repkit Estimate</p>
          </div>
          {/* Archetype name + description */}
          <div>
            <span className="text-sm font-bold text-[var(--color-accent)]">{moddedRepkitStats.archetypeName}</span>
            <span className="text-xs text-[var(--color-text-muted)] ml-2">{moddedRepkitStats.archetypeDesc}</span>
          </div>
          {/* Header badges */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">{moddedRepkitStats.mfgName}</span>
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">{moddedRepkitStats.legendaryName}</span>
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">{moddedRepkitStats.prefixName}</span>
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">{moddedRepkitStats.firmwareName}</span>
          </div>
          {/* Legendary effect */}
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="text-purple-300 font-medium">{moddedRepkitStats.legendaryName}:</span> {moddedRepkitStats.legendaryEffect}
          </p>
          {/* Cross-manufacturer legendary badges */}
          {moddedRepkitStats.crossMfgLegendaries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {moddedRepkitStats.crossMfgLegendaries.map((name) => (
                <span key={name} className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">{name}</span>
              ))}
            </div>
          )}
          {/* Key stat line */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <span><span className="text-emerald-400 font-medium">Healing:</span> <span className="text-[var(--color-text)] font-bold">{moddedRepkitStats.healingStacks}</span></span>
            <span><span className="text-yellow-400 font-medium">Amp:</span> <span className="text-[var(--color-text)]">{moddedRepkitStats.ampStacks}</span></span>
            <span><span className="text-cyan-400 font-medium">Cooldown:</span> <span className="text-[var(--color-text)]">{moddedRepkitStats.cooldownStacks}</span></span>
            <span><span className="text-red-400 font-medium">Leech:</span> <span className="text-[var(--color-text)]">{moddedRepkitStats.leechStacks}</span></span>
            <span><span className="text-amber-400 font-medium">Tank:</span> <span className="text-[var(--color-text)]">{moddedRepkitStats.tankStacks}</span></span>
            <span><span className="text-green-400 font-medium">Overdose:</span> <span className="text-[var(--color-text)]">{moddedRepkitStats.overdoseStacks}</span></span>
          </div>
          {/* All perk badges */}
          <div className="flex flex-wrap gap-1.5">
            {moddedRepkitStats.allPerks.map((p, i) => (
              <span key={`${p.name}-${i}`} title={p.description}
                className="px-2 py-0.5 rounded text-[10px] font-bold border bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)] border-[var(--color-panel-border)]"
              >
                {p.name} ×{p.stacks}
              </span>
            ))}
          </div>
          {/* Class mod perk badges */}
          {moddedRepkitStats.classModPerks?.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-violet-400/70 mr-2">Class Mod Perks</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {moddedRepkitStats.classModPerks.map((cm, i) => (
                  <span key={`cm-${i}`} className="px-2 py-0.5 rounded text-[10px] font-bold border bg-violet-500/10 text-violet-300 border-violet-500/25">
                    {cm.name} ×{cm.stacks}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* RepKit: Manufacturer + Level + Seed + Add other parts + part groups (weapon-style) */}
      {category === "repkit" && repkitData && repkitMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> RepKit build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then select parts from each group. Use &quot;Add other parts&quot; to add any part from the database.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowRepkitMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {repkitData.mfgs.find((m) => m.id === repkitMfgId)?.name ?? `Mfg ${repkitMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={handleRandomRepkit}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Random item
                </button>
                <button
                  type="button"
                  onClick={() => setShowRepkitGodRollModal(true)}
                  disabled={!repkitData?.godrolls?.length}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  title={repkitData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                >
                  God roll
                </button>
                <button
                  type="button"
                  onClick={handleRepkitAutoFill}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                  title="Fill empty part groups. Select manufacturer first."
                >
                  Auto fill
                </button>
                <span className="self-center text-[var(--color-text-muted)] text-xs mx-1">|</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--color-text-muted)] text-sm">Generate modded:</span>
                  <select
                    value={moddedRepkitPowerMode}
                    onChange={(e) => setModdedRepkitPowerMode(e.target.value as "stable" | "op" | "insane")}
                    className="px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                  >
                    <option value="stable">Stable</option>
                    <option value="op">OP</option>
                    <option value="insane">Insane</option>
                  </select>
                  {/* Temp toggles — placeholders */}
                  {([
                    { label: "Temp 1", active: repkitToggle1, set: setRepkitToggle1 },
                    { label: "Temp 2", active: repkitToggle2, set: setRepkitToggle2 },
                    { label: "Temp 3", active: repkitToggle3, set: setRepkitToggle3 },
                  ] as const).map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => t.set(!t.active)}
                      className={`px-3 py-2 rounded-lg border text-sm min-h-[44px] touch-manipulation transition-colors ${
                        t.active
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                          : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]"
                      }`}
                    >
                      {t.active ? "✓ " : ""}{t.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void handleGenerateModdedRepkit()}
                    disabled={moddedRepkitLoading}
                    className="px-3 py-2 rounded-lg border border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 disabled:opacity-60 text-sm min-h-[44px] touch-manipulation"
                  >
                    {moddedRepkitLoading ? "Generating…" : "Generate modded repkit"}
                  </button>
                  {moddedRepkitError && <span className="text-red-400 text-xs">{moddedRepkitError}</span>}
                </div>
              </div>
            </div>

            {repkitAutoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setRepkitAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{repkitAutoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setRepkitAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}

            {showRepkitMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowRepkitMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {repkitData.mfgs.map((m) => {
                        const active = m.id === repkitMfgId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setRepkitMfgId(m.id);
                              setShowRepkitMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="text-sm text-[var(--color-text)]">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showRepkitGodRollModal && repkitData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowRepkitGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {repkitData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleRepkitGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const rarities = repkitData.raritiesByMfg[repkitMfgId] ?? [];
              const prefixOptions = repkitData.prefix.map((p) => ({
                partId: String(p.partId),
                label: `${p.partId} - ${p.stat}${p.description ? ` - ${p.description}` : ""}`,
              }));
              const firmwareOptions = repkitData.firmware.map((p) => ({
                partId: String(p.partId),
                label: `${p.partId} - ${p.stat}${p.description ? ` - ${p.description}` : ""}`,
              }));
              const resistanceOptions = repkitData.resistance.map((p) => ({
                partId: String(p.partId),
                label: `${p.partId} - ${p.stat}${p.description ? ` - ${p.description}` : ""}`,
              }));
              const legendaryOptions = repkitData.legendaryPerks.map((l) => {
                const id = `${l.mfgId}:${l.partId}`;
                const name = String(l.stat ?? "").trim(); // e.g. Chrome, Cardiac Shot, Blood Rush
                const desc = String(l.description ?? "").trim();
                const hasDesc = !!desc && desc.toLowerCase() !== name.toLowerCase();
                const label = hasDesc ? `${id} - ${name} - ${desc}` : `${id} - ${name}`;
                return { partId: id, label };
              });
              const universalOptions = repkitData.universalPerks.map((p) => {
                const id = String(p.partId);
                const name = String(p.stat ?? "").trim();
                const desc = String(p.description ?? "").trim();
                const hasDistinctDesc = desc && desc.toLowerCase() !== name.toLowerCase();
                const label = hasDistinctDesc ? `${id} - ${name} - ${desc}` : `${id} - ${name}`;
                return { partId: id, label };
              });

              const getOpts = (partType: string): { partId: string; label: string; description?: string }[] => {
                if (partType === "Rarity") return rarities.map((r) => ({ partId: String(r.id), label: r.label }));
                if (partType === "Prefix") return prefixOptions;
                if (partType === "Firmware") return firmwareOptions;
                if (partType === "Resistance") return resistanceOptions;
                if (partType === "Legendary") return legendaryOptions;
                if (partType === "Universal perks") return universalOptions;
                return [];
              };

              const list = (partType: string) => repkitPartSelections[partType] ?? [];
              const removePartAt = (partType: string, index: number) => {
                setRepkitPartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  arr.splice(index, 1);
                  return { ...prev, [partType]: arr };
                });
              };
              const setPartQty = (partType: string, index: number, qty: string) => {
                setRepkitPartSelections((prev) => {
                  const arr = [...(prev[partType] ?? [])];
                  if (arr[index]) arr[index] = { ...arr[index], qty };
                  return { ...prev, [partType]: arr };
                });
              };
              const openPicker = (partType: string) => {
                setRepkitPartPickerPartType(partType);
                setRepkitPartPickerChecked(new Set());
                setRepkitPartPickerShowQty(false);
                setRepkitPartPickerQty("1");
              };
              const applyPickerWithQty = () => {
                const partType = repkitPartPickerPartType;
                if (!partType) return;
                const qty = String(Math.max(1, Math.min(99, parseInt(repkitPartPickerQty.trim(), 10) || 1)));
                const toAdd = Array.from(repkitPartPickerChecked).map((label) => ({ label, qty }));
                setRepkitPartSelections((prev) => ({
                  ...prev,
                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                }));
                setRepkitPartPickerPartType(null);
                setRepkitPartPickerShowQty(false);
                setRepkitPartPickerChecked(new Set());
              };

              return (
                <>
                  <div className="space-y-2">
                    {REPKIT_PART_ORDER.map(({ key: partType }) => {
                      const displayName = partType === "Legendary" ? "Legendary Perks" : partType;
                      const entries = list(partType);
                      return (
                        <details key={partType} className="part-group rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)] overflow-hidden" open={partType === "Rarity" || partType === "Legendary"}>
                          <summary className="part-group-header flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none hover:bg-[var(--color-accent)]/10 transition-colors">
                            <span className="part-group-title text-sm font-medium text-[var(--color-accent)]">
                              {displayName}
                              {entries.length > 0 && (
                                <span className="ml-2 part-group-count px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-xs">
                                  {entries.length}
                                </span>
                              )}
                            </span>
                            <span className="text-[var(--color-panel-border)]">▾</span>
                          </summary>
                          <div className="part-group-content px-3 pb-3 pt-1 border-t border-[var(--color-panel-border)]/30">
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => openPicker(partType)}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                              >
                                Select parts…
                              </button>
                              {entries.length > 0 && (
                                <div className="space-y-2">
                                  {entries.map((item, idx) => {
                                    const pi = universalParts.find((u) => u.label === item.label);
                                    const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                                    return (
                                    <div key={`${partType}-${idx}-${item.label}`} className={`part-item rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`flex-1 min-w-0 text-sm font-medium truncate ${nameColor}`}>{item.label}</span>
                                        {partType !== "Rarity" && (
                                          <input
                                            type="number"
                                            min={1}
                                            max={99}
                                            value={item.qty}
                                            onChange={(e) => setPartQty(partType, idx, e.target.value)}
                                            className="w-14 px-2 py-2 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                            title="Quantity"
                                          />
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => removePartAt(partType, idx)}
                                          className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                                          title="Remove"
                                        >
                                          ×
                                        </button>
                                      </div>
                                      {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {repkitPartPickerPartType && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setRepkitPartPickerPartType(null)}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                          <h3 className="text-[var(--color-accent)] font-medium text-sm">
                            Select {repkitPartPickerPartType === "Legendary" ? "Legendary Perks" : repkitPartPickerPartType}
                          </h3>
                          <button type="button" onClick={() => setRepkitPartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setRepkitPartPickerPartType(null);
                              setShowAddPartsModal(true);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] text-left"
                          >
                            ➕ Add part from database…
                          </button>
                          <div className="mt-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                            {getOpts(repkitPartPickerPartType).map((o) => (
                              <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30" onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, repkitPartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                                <input
                                  type="checkbox"
                                  checked={repkitPartPickerChecked.has(o.label)}
                                  onChange={(e) => {
                                    setRepkitPartPickerChecked((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(o.label);
                                      else next.delete(o.label);
                                      return next;
                                    });
                                  }}
                                  className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[rgba(24,28,34,0.98)] checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                                />
                                <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={repkitPartPickerPartType || undefined} detailed={richDetailView} />
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                          <button type="button" onClick={() => setRepkitPartPickerPartType(null)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (repkitPartPickerChecked.size === 0) return;
                              if (repkitPartPickerPartType === "Rarity") {
                                const partType = repkitPartPickerPartType;
                                const toAdd = Array.from(repkitPartPickerChecked).map((label) => ({ label, qty: "1" }));
                                setRepkitPartSelections((prev) => ({
                                  ...prev,
                                  [partType]: [...(prev[partType] ?? []), ...toAdd],
                                }));
                                setRepkitPartPickerPartType(null);
                                setRepkitPartPickerChecked(new Set());
                              } else {
                                setRepkitPartPickerShowQty(true);
                              }
                            }}
                            disabled={repkitPartPickerChecked.size === 0}
                            className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add selected ({repkitPartPickerChecked.size})
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {repkitPartPickerPartType && repkitPartPickerShowQty && (
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setRepkitPartPickerPartType(null); setRepkitPartPickerShowQty(false); }}>
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                        <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {repkitPartPickerChecked.size} selected parts.</p>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={repkitPartPickerQty}
                          onChange={(e) => setRepkitPartPickerQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => { setRepkitPartPickerPartType(null); setRepkitPartPickerShowQty(false); }} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm">
                            Cancel
                          </button>
                          <button type="button" onClick={applyPickerWithQty} className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">
                            Add to build
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={repkitSkinValue}
                    onChange={(e) => setRepkitSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {repkitSkinValue && (
                    <SkinPreview token={repkitSkinValue} label={sharedSkins.find((s) => s.value === repkitSkinValue)?.label ?? repkitSkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Heavy: Manufacturer + Level + Seed + Add other parts + part groups (weapon-style) */}
      {category === "heavy" && heavyData && heavyMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Heavy build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then select parts from each group. Use &quot;Add other parts&quot; to add any part from the database.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowHeavyMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {heavyData.mfgs.find((m) => m.id === heavyMfgId)?.name ?? `Mfg ${heavyMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={handleRandomHeavy}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Random item
                </button>
                <button
                  type="button"
                  onClick={() => setShowHeavyGodRollModal(true)}
                  disabled={!heavyData?.godrolls?.length}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  title={heavyData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                >
                  God roll
                </button>
              </div>
            </div>

            {showHeavyMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowHeavyMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowHeavyMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {heavyData.mfgs.map((m) => {
                        const active = m.id === heavyMfgId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setHeavyMfgId(m.id);
                              setShowHeavyMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="text-sm text-[var(--color-text)]">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showHeavyGodRollModal && heavyData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowHeavyGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items(center) justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowHeavyGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {heavyData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setLiveDecoded(g.decoded.trim());
                          setLastEditedCodecSide("decoded");
                          setCodecStatus("God roll loaded; encoding…");
                          setShowHeavyGodRollModal(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HEAVY_PART_ORDER.map(({ key: partType }) => {
                const list = heavyPartSelections[partType] ?? [];
                return (
                  <div key={partType} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs text-[var(--color-accent)]">{partType}</label>
                      <button
                        type="button"
                        onClick={() => {
                          setHeavyPartPickerPartType(partType);
                          setHeavyPartPickerChecked(new Set());
                          setHeavyPartPickerShowQty(false);
                        }}
                        className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                      >
                        Select parts…
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2 min-h-[44px]">
                      {list.length === 0 ? (
                        <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                      ) : (
                        <div className="space-y-2">
                          {list.map((item, idx) => {
                            const pi = universalParts.find((u) => u.label === item.label);
                            const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                            return (
                            <div key={idx} className={`rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                              <div className="flex items-center gap-2 flex-wrap">
                              <div className={`min-w-0 flex-1 text-sm font-medium break-words truncate ${nameColor}`}>{item.label}</div>
                              {partType !== "Rarity" && partType !== "Barrel" && partType !== "Element" && partType !== "Firmware" && (
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={item.qty}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setHeavyPartSelections((prev) => {
                                      const arr = [...(prev[partType] ?? [])];
                                      arr[idx] = { ...arr[idx], qty: v };
                                      return { ...prev, [partType]: arr };
                                    });
                                  }}
                                  className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setHeavyPartSelections((prev) => {
                                    const arr = (prev[partType] ?? []).filter((_, i) => i !== idx);
                                    return { ...prev, [partType]: arr };
                                  });
                                }}
                                className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                              >
                                ×
                              </button>
                              </div>
                              {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {heavyPartPickerPartType && !heavyPartPickerShowQty && (() => {
              if (heavyMfgId == null || !heavyData) return null;
              const opts: { partId: string; label: string; description?: string }[] = [];
              if (heavyPartPickerPartType === "Rarity") {
                (heavyData.raritiesByMfg[heavyMfgId] ?? []).forEach((r) => {
                  opts.push({ partId: String(r.id), label: r.label });
                });
              } else if (heavyPartPickerPartType === "Barrel") {
                heavyData.barrel.filter((p) => p.mfgId === heavyMfgId).forEach((p) => {
                  opts.push({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description });
                });
              } else if (heavyPartPickerPartType === "Element") {
                heavyData.element.forEach((p) => {
                  opts.push({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description });
                });
              } else if (heavyPartPickerPartType === "Firmware") {
                heavyData.firmware.forEach((p) => {
                  opts.push({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description });
                });
              } else if (heavyPartPickerPartType === "Barrel Accessory") {
                heavyData.barrelAccPerks.filter((p) => p.mfgId === heavyMfgId).forEach((p) => {
                  opts.push({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description });
                });
              } else if (heavyPartPickerPartType === "Body Accessory") {
                heavyData.bodyAccPerks.filter((p) => p.mfgId === heavyMfgId).forEach((p) => {
                  opts.push({ partId: String(p.partId), label: `${p.partId} - ${p.stat}`, description: p.description });
                });
              } else if (heavyPartPickerPartType === "Underbarrel") {
                // ALL underbarrels from the entire database (91 unique, filtered: no atlas/malswitch)
                [
                  { code: "{13:61}", name: "Shotgun" }, { code: "{13:62}", name: "Micro-Rocket POD" }, { code: "{13:63}", name: "Grenade Launcher" },
                  { code: "{13:67}", name: "Fragcendiary Grenades" }, { code: "{13:75}", name: "Space Laser" }, { code: "{13:76}", name: "Star Helix" },
                  { code: "{2:47}", name: "Knife Launcher" }, { code: "{2:48}", name: "Taser" }, { code: "{2:75}", name: "Demolition Charge" },
                  { code: "{8:43}", name: "Gravity Harpoon" }, { code: "{8:45}", name: "Micro-Rocket POD" }, { code: "{8:50}", name: "Proxy Mine" },
                  { code: "{8:56}", name: "Missilaser Alt Fire" },
                  { code: "{20:48}", name: "Shotgun" }, { code: "{20:49}", name: "Overcharge" }, { code: "{20:79}", name: "Grenade Launcher" },
                  { code: "{27:55}", name: "Shotgun" }, { code: "{27:56}", name: "Double Flintlocks" }, { code: "{27:57}", name: "Hand Crank" },
                  { code: "{3:45}", name: "Knife Launcher" }, { code: "{3:46}", name: "Zip Rockets" }, { code: "{3:68}", name: "Vial Launcher" },
                  { code: "{9:45}", name: "Spread Launcher" }, { code: "{9:46}", name: "Gravity Harpoon" }, { code: "{9:50}", name: "Knife Launcher" },
                  { code: "{24:45}", name: "Shotgun" }, { code: "{24:46}", name: "Big Rocket" }, { code: "{24:53}", name: "Crank SMG" },
                  { code: "{10:43}", name: "Beam Tosser" }, { code: "{10:44}", name: "Energy Disc" }, { code: "{10:49}", name: "Energy Blast" },
                  { code: "{21:45}", name: "Railgun" }, { code: "{21:46}", name: "Energy Discharge" }, { code: "{21:53}", name: "Laser Wire" },
                  { code: "{25:48}", name: "Shock Field" }, { code: "{25:49}", name: "Singularity" }, { code: "{25:53}", name: "Rocket Pod" },
                  { code: "{15:42}", name: "Seeker Missiles" }, { code: "{15:43}", name: "Kill Drone" }, { code: "{15:68}", name: "Death Sphere" },
                  { code: "{4:43}", name: "Micro-Rockets" }, { code: "{4:44}", name: "Energy Burst" }, { code: "{4:72}", name: "Gravity Well" },
                  { code: "{26:57}", name: "Tether Snare" }, { code: "{26:58}", name: "Railgun" }, { code: "{26:62}", name: "Ordonite Spike" },
                  { code: "{26:77}", name: "Seamstress" },
                  { code: "{7:48}", name: "Lightning Beam" }, { code: "{7:49}", name: "Gauss Gun" }, { code: "{7:80}", name: "Fuel Rod Discharge" },
                  { code: "{19:21}", name: "Roil Underbarrel" }, { code: "{19:46}", name: "Gas Trap" }, { code: "{19:47}", name: "Ripper Rocket" },
                  { code: "{19:52}", name: "Shrapnel Cannon" },
                  { code: "{23:47}", name: "Seeker Missiles" }, { code: "{23:48}", name: "Gravity Trap" }, { code: "{23:55}", name: "Target Marker" },
                  { code: "{14:64}", name: "COMBO" }, { code: "{14:65}", name: "Shotgun" }, { code: "{14:68}", name: "Support Drone" },
                  { code: "{5:50}", name: "Micro Shotgun" }, { code: "{5:79}", name: "Zip Rockets" }, { code: "{5:80}", name: "Attack Drone" },
                  { code: "{11:50}", name: "Deployable Barrier" }, { code: "{11:51}", name: "Proximity Mines" }, { code: "{11:57}", name: "Digital Backup" },
                  { code: "{11:79}", name: "Husky Auto Turret" },
                  { code: "{17:43}", name: "MIRV Grenade" }, { code: "{17:45}", name: "Airstrike" }, { code: "{17:72}", name: "Sticky Shotgun" },
                  { code: "{6:44}", name: "Magnum Rockets" }, { code: "{6:45}", name: "Turbine Cleaver" }, { code: "{6:75}", name: "Exhaust Blast" },
                  { code: "{12:43}", name: "Seeker Missiles" }, { code: "{12:44}", name: "Rolling Thunder" }, { code: "{12:50}", name: "Flame Blast" },
                  { code: "{18:48}", name: "Bipod" }, { code: "{18:49}", name: "Grenade Launcher" }, { code: "{18:69}", name: "Aegon's Dream Extra Barrel" },
                  { code: "{18:86}", name: "Extra Barrel" }, { code: "{18:87}", name: "Shotgun" }, { code: "{18:90}", name: "Overdrive Full Auto" },
                  { code: "{18:92}", name: "Scrap Cannon" },
                  { code: "{22:50}", name: "Zip Rockets" }, { code: "{22:51}", name: "Taser" }, { code: "{22:52}", name: "Flamethrower" },
                  { code: "{22:53}", name: "Extra Barrel" },
                  { code: "{16:48}", name: "Big Rocket" }, { code: "{16:49}", name: "Extra Barrel" }, { code: "{16:50}", name: "Bipod" },
                  { code: "{16:52}", name: "Shotgun" },
                ].forEach((p) => opts.push({ partId: p.code.replace(/[{}]/g, ""), label: `${p.code} - ${p.name}` }));
              }
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setHeavyPartPickerPartType(null)}>
                  <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                      <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {heavyPartPickerPartType}</h3>
                      <button type="button" onClick={() => setHeavyPartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      <button
                        type="button"
                        onClick={() => { setHeavyPartPickerPartType(null); setShowAddPartsModal(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm mb-2"
                      >
                        ➕ Add part from database…
                      </button>
                      <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                        {opts.map((o) => (
                          <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10" onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, heavyPartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                            <input
                              type="checkbox"
                              checked={heavyPartPickerChecked.has(o.label)}
                              onChange={(e) => {
                                setHeavyPartPickerChecked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(o.label);
                                  else next.delete(o.label);
                                  return next;
                                });
                              }}
                              className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                            />
                            <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={heavyPartPickerPartType || undefined} detailed={richDetailView} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                      <button
                        type="button"
                        onClick={() => setHeavyPartPickerPartType(null)}
                        className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (heavyPartPickerChecked.size === 0) return;
                          const partType = heavyPartPickerPartType;
                          if (partType === "Rarity" || partType === "Barrel" || partType === "Element" || partType === "Firmware") {
                            const toAdd = Array.from(heavyPartPickerChecked).map((label) => ({ label, qty: "1" }));
                            setHeavyPartSelections((prev) => ({
                              ...prev,
                              [partType]: [...(prev[partType] ?? []), ...toAdd],
                            }));
                            setHeavyPartPickerPartType(null);
                            setHeavyPartPickerChecked(new Set());
                          } else {
                            setHeavyPartPickerShowQty(true);
                          }
                        }}
                        disabled={heavyPartPickerChecked.size === 0}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add selected ({heavyPartPickerChecked.size})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {heavyPartPickerPartType && heavyPartPickerShowQty && (
              <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setHeavyPartPickerPartType(null); setHeavyPartPickerShowQty(false); }}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {heavyPartPickerChecked.size} selected parts.</p>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={heavyPartPickerQty}
                    onChange={(e) => setHeavyPartPickerQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-3"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setHeavyPartPickerPartType(null); setHeavyPartPickerShowQty(false); }}
                      className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const partType = heavyPartPickerPartType;
                        const qty = String(Math.max(1, Math.min(99, parseInt(heavyPartPickerQty.trim(), 10) || 1)));
                        const toAdd = Array.from(heavyPartPickerChecked).map((label) => ({ label, qty }));
                        setHeavyPartSelections((prev) => ({
                          ...prev,
                          [partType]: [...(prev[partType] ?? []), ...toAdd],
                        }));
                        setHeavyPartPickerPartType(null);
                        setHeavyPartPickerChecked(new Set());
                        setHeavyPartPickerShowQty(false);
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={heavySkinValue}
                    onChange={(e) => setHeavySkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {heavySkinValue && (
                    <SkinPreview token={heavySkinValue} label={sharedSkins.find((s) => s.value === heavySkinValue)?.label ?? heavySkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Class Mod: Class + Rarity + Name + skills/perks (weapon-style groups) */}
      {category === "class-mod" && classModData && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Class Mod build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick class, rarity, and name; then select skills and perks. Use &quot;Add other parts&quot; to add any part from the database.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Class</label>
                <button
                  type="button"
                  onClick={() => setShowClassModClassModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select class"
                >
                  {classModClassName || "Select…"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Rarity</label>
                <button
                  type="button"
                  onClick={() => setShowClassModRarityModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[8rem] text-left"
                  title="Select rarity"
                >
                  {classModRarity}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const classIdStr = String(CLASS_MOD_CLASS_IDS[classModClassName] ?? 255);
                    const skills = classModData?.skillsByClass[classIdStr] ?? [];
                    const next: Record<string, number> = { ...classModSkillPoints };
                    skills.forEach((s) => { next[s.skillNameEN] = 5; });
                    setClassModSkillPoints(next);
                  }}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Max All Skills
                </button>
              </div>
            </div>

            {showClassModClassModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowClassModClassModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Class</h3>
                    <button type="button" onClick={() => setShowClassModClassModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                      Close
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {classModData.classNames.map((name) => {
                        const active = name === classModClassName;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setClassModClassName(name);
                              setShowClassModClassModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${
                              active ? "bg-[var(--color-accent)]/10" : ""
                            }`}
                          >
                            <span
                              className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${
                                active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"
                              }`}
                            />
                            <span className="text-sm text-[var(--color-text)]">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showClassModRarityModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowClassModRarityModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Rarity</h3>
                    <button type="button" onClick={() => setShowClassModRarityModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                      Close
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {classModData.rarities.map((r) => {
                        const active = r === classModRarity;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setClassModRarity(r);
                              setShowClassModRarityModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${
                              active ? "bg-[var(--color-accent)]/10" : ""
                            }`}
                          >
                            <span
                              className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${
                                active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"
                              }`}
                            />
                            <span className="text-sm text-[var(--color-text)]">{r}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const classIdStr = String(CLASS_MOD_CLASS_IDS[classModClassName] ?? 255);
              const skills = classModData.skillsByClass[classIdStr] ?? [];

              const list = (partType: string) => classModSelections[partType] ?? [];
              const setEntries = (partType: string, entries: { label: string; qty: string }[]) => {
                setClassModSelections((prev) => ({ ...prev, [partType]: entries }));
              };

              return (
                <>
                  {/* Skills list with Min / - / input / + / Max controls */}
                  <div className="mb-4 rounded-xl border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.25)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-[var(--color-accent)]">Skills</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Search…"
                          value={classModSkillSearch}
                          onChange={(e) => setClassModSkillSearch(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs min-w-[10rem]"
                        />
                      </div>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto space-y-1">
                      {skills
                        .filter((s) =>
                          classModSkillSearch.trim()
                            ? s.skillNameEN.toLowerCase().includes(classModSkillSearch.toLowerCase())
                            : true,
                        )
                        .map((skill) => {
                          const val = classModSkillPoints[skill.skillNameEN] ?? 0;
                          const setVal = (v: number) => {
                            const clamped = Math.max(0, Math.min(5, v));
                            setClassModSkillPoints((prev) => ({ ...prev, [skill.skillNameEN]: clamped }));
                          };
                          const iconFilename = getClassModSkillIconFilename(skill.skillNameEN, classModClassName);
                          const iconSrc = apiUrl(`accessories/class-mod/skill-icon/${classModClassName}/${iconFilename}`);
                          return (
                            <div
                              key={skill.skillNameEN}
                              role="button"
                              tabIndex={0}
                              onClick={() => setClassModSkillCard({ skillName: skill.skillNameEN, className: classModClassName })}
                              onKeyDown={(e) => e.key === "Enter" && setClassModSkillCard({ skillName: skill.skillNameEN, className: classModClassName })}
                              className="flex items-center gap-3 px-2 py-1.5 rounded border border-[var(--color-panel-border)]/50 bg-[rgba(24,28,34,0.7)] cursor-pointer hover:border-[var(--color-accent)]/60 hover:bg-[rgba(24,28,34,0.85)] transition-colors"
                            >
                              <img
                                src={iconSrc}
                                alt=""
                                className="w-9 h-9 object-contain flex-shrink-0 rounded border border-[var(--color-panel-border)]/50"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm truncate ${classModClassName === "C4SH" ? getC4SHSkillColor(skill.skillNameEN) : "text-[var(--color-text)]"}`}>{skill.skillNameEN}</div>
                                <div className="text-[10px] text-[var(--color-text-muted)]">
                                  {`{${skill.skillIds.join(", ")}}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[10px] disabled:opacity-40"
                                  onClick={() => setVal(0)}
                                  disabled={val <= 0}
                                >
                                  Min
                                </button>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs disabled:opacity-40"
                                  onClick={() => setVal(val - 1)}
                                  disabled={val <= 0}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  value={val}
                                  onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(n)) setVal(n);
                                  }}
                                  className="w-10 h-7 text-center rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs"
                                />
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-xs disabled:opacity-40"
                                  onClick={() => setVal(val + 1)}
                                  disabled={val >= 5}
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[10px] disabled:opacity-40"
                                  onClick={() => setVal(5)}
                                  disabled={val >= 5}
                                >
                                  Max
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {CLASS_MOD_PART_ORDER.map(({ key: partType }) => {
                      const entries = list(partType);
                      return (
                        <div key={partType} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="block text-xs text-[var(--color-accent)]">{partType}</label>
                            <button
                              type="button"
                              onClick={() => {
                                setClassModPartPickerKey(partType);
                                setClassModPartPickerChecked(new Set());
                                setClassModPartPickerShowQty(false);
                                setClassModPartPickerQty("1");
                              }}
                              className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                            >
                              Select parts…
                            </button>
                          </div>
                          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2 min-h-[44px]">
                            {entries.length === 0 ? (
                              <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                            ) : (
                              <div className="space-y-2">
                                {entries.map((item, idx) => {
                                  const pi = universalParts.find((u) => u.label === item.label);
                                  const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                                  return (
                                  <div
                                    key={idx}
                                    className={`rounded-lg border ${border} ${bg} p-2`}
                                    onMouseEnter={(e) => {
                                      if (partType === "Name" || partType === "Legendary names") {
                                        const nameEN = item.label.includes(" - ") ? item.label.split(" - ").slice(1).join(" - ").trim() : item.label;
                                        const info = getClassModNameInfo(nameEN);
                                        if (info) setClassModNameCard({ name: nameEN, character: info.character, description: info.description, cardTop: e.currentTarget.getBoundingClientRect().top });
                                      } else {
                                        startHover(hoverDataByLabel(item.label), e.currentTarget.getBoundingClientRect().top);
                                      }
                                    }}
                                    onMouseLeave={() => { endHover(); setClassModNameCard(null); }}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className={`min-w-0 flex-1 text-sm font-medium break-words truncate ${nameColor}`}>{item.label}</div>
                                      <input
                                        type="number"
                                        min={partType === "Legendary names" || partType === "Name" ? 1 : 0}
                                        max={partType === "Skills" ? 5 : 99}
                                        value={item.qty}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setEntries(
                                            partType,
                                            entries.map((e2, i2) => (i2 === idx ? { ...e2, qty: v } : e2)),
                                          );
                                        }}
                                        className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEntries(
                                            partType,
                                            entries.filter((_, i2) => i2 !== idx),
                                          );
                                        }}
                                        className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {classModPartPickerKey && !classModPartPickerShowQty && (() => {
                    const opts: { id: string; label: string }[] = [];
                    if (classModPartPickerKey === "Name") {
                      const rarityKey = classModRarity === "Legendary" ? "legendary" : "normal";
                      const namesKey = `${classIdStr},${rarityKey}`;
                      const nameOptions = classModData.namesByClassRarity[namesKey] ?? [];
                      nameOptions.forEach((opt) => {
                        opts.push({ id: String(opt.nameCode), label: `${opt.nameCode} - ${opt.nameEN}` });
                      });
                    } else if (classModPartPickerKey === "Legendary names") {
                      const rarityKey = "legendary";
                      const namesKey = `${classIdStr},${rarityKey}`;
                      const nameOptions = classModData.namesByClassRarity[namesKey] ?? [];
                      const primaryNameCode = (() => {
                        const first = list("Name")?.[0]?.label;
                        if (!first) return null;
                        const code = parseInt(first.split(" - ")[0]?.trim() ?? "", 10);
                        return Number.isFinite(code) ? code : null;
                      })();
                      nameOptions.forEach((opt) => {
                        if (opt.nameCode === primaryNameCode) return;
                        opts.push({ id: String(opt.nameCode), label: `${opt.nameCode} - ${opt.nameEN}` });
                      });
                    } else if (classModPartPickerKey === "Skills") {
                      skills.forEach((s) => {
                        opts.push({ id: s.skillNameEN, label: s.skillNameEN });
                      });
                    } else if (classModPartPickerKey === "Perks") {
                      classModData.perks.forEach((p) => {
                        opts.push({ id: String(p.perkId), label: `${p.perkId} - ${p.perkNameEN}` });
                      });
                    }
                    return (
                      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setClassModPartPickerKey(null)}>
                        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                          <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                            <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {classModPartPickerKey}</h3>
                            <button type="button" onClick={() => setClassModPartPickerKey(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                              Close
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-3">
                            <button
                              type="button"
                              onClick={() => {
                                setClassModPartPickerKey(null);
                                setShowAddPartsModal(true);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm mb-2"
                            >
                              ➕ Add part from database…
                            </button>
                            <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                              {opts.map((o) => (
                                <label
                                  key={o.id + o.label}
                                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10"
                                  onMouseEnter={(e) => {
                                    if (classModPartPickerKey === "Name" || classModPartPickerKey === "Legendary names") {
                                      const nameEN = o.label.includes(" - ") ? o.label.split(" - ").slice(1).join(" - ").trim() : o.label;
                                      const info = getClassModNameInfo(nameEN);
                                      if (info) setClassModNameCard({ name: nameEN, character: info.character, description: info.description, cardTop: e.currentTarget.getBoundingClientRect().top });
                                    } else {
                                      startHover(hoverDataByLabel(o.label, undefined, classModPartPickerKey || undefined), e.currentTarget.getBoundingClientRect().top);
                                    }
                                  }}
                                  onMouseLeave={() => { endHover(); setClassModNameCard(null); }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={classModPartPickerChecked.has(o.label)}
                                    onChange={(e) => {
                                      setClassModPartPickerChecked((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(o.label);
                                        else next.delete(o.label);
                                        return next;
                                      });
                                    }}
                                    className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[rgba(24,28,34,0.98)] checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                                  />
                                  <PartLabel partId={o.id} label={o.label} description={undefined} pickerPartType={classModPartPickerKey || undefined} detailed={richDetailView} />
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                            <button type="button" onClick={() => setClassModPartPickerKey(null)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm">
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (classModPartPickerChecked.size === 0) return;
                                if (classModPartPickerKey === "Skills") {
                                  const toAdd = Array.from(classModPartPickerChecked).map((label) => ({ label, qty: "0" }));
                                  setEntries("Skills", [...list("Skills"), ...toAdd]);
                                  setClassModPartPickerKey(null);
                                  setClassModPartPickerChecked(new Set());
                                } else if (classModPartPickerKey === "Legendary names") {
                                  const toAdd = Array.from(classModPartPickerChecked).map((label) => ({ label, qty: "1" }));
                                  setEntries("Legendary names", [...list("Legendary names"), ...toAdd]);
                                  setClassModPartPickerKey(null);
                                  setClassModPartPickerChecked(new Set());
                                } else {
                                  setClassModPartPickerShowQty(true);
                                }
                              }}
                              disabled={classModPartPickerChecked.size === 0}
                              className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add selected ({classModPartPickerChecked.size})
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {classModPartPickerKey && classModPartPickerShowQty && (
                    <div
                      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4"
                      onClick={() => {
                        setClassModPartPickerKey(null);
                        setClassModPartPickerShowQty(false);
                      }}
                    >
                      <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                        <p className="text-xs text-[var(--color-text-muted)] mb-3">
                          This quantity will be applied to all {classModPartPickerChecked.size} selected parts.
                        </p>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={classModPartPickerQty}
                          onChange={(e) => setClassModPartPickerQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setClassModPartPickerKey(null);
                              setClassModPartPickerShowQty(false);
                            }}
                            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!classModPartPickerKey) return;
                              const qty = String(Math.max(1, Math.min(99, parseInt(classModPartPickerQty.trim(), 10) || 1)));
                              const toAdd = Array.from(classModPartPickerChecked).map((label) => ({ label, qty }));
                              setEntries(classModPartPickerKey, [...list(classModPartPickerKey), ...toAdd]);
                              setClassModPartPickerKey(null);
                              setClassModPartPickerShowQty(false);
                              setClassModPartPickerChecked(new Set());
                            }}
                            className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm"
                          >
                            Add to build
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {classModSkillCard && (
                    <SkillCardPopup
                      skillName={classModSkillCard.skillName}
                      className={classModSkillCard.className}
                      onClose={() => setClassModSkillCard(null)}
                    />
                  )}
                  <ClassModNameHoverCard data={classModNameCard} />
                </>
              );
            })()}
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={classModSkinValue}
                    onChange={(e) => setClassModSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {classModSkinValue && (
                    <SkinPreview token={classModSkinValue} label={sharedSkins.find((s) => s.value === classModSkinValue)?.label ?? classModSkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* RepKit: old dropdown-based UI (disabled, kept for reference) */}
      {category === "repkit" && repkitData && repkitMfgId != null && false && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> RepKit build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowRepkitMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {repkitData.mfgs.find((m) => m.id === repkitMfgId)?.name ?? `Mfg ${repkitMfgId}`}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={() => setShowAddPartsModal(true)} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Add other parts
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button type="button" onClick={handleRandomRepkit} className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left">
                    Random item
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={() => setShowRepkitGodRollModal(true)}
                    disabled={!repkitData?.godrolls?.length}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    title={repkitData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                  >
                    God roll
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
                <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                  <button
                    type="button"
                    onClick={handleRepkitAutoFill}
                    className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                  >
                    Auto fill
                  </button>
                </div>
              </div>
            </div>

            {repkitAutoFillWarning && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setRepkitAutoFillWarning(null)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm text-[var(--color-text)] mb-4">{repkitAutoFillWarning}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setRepkitAutoFillWarning(null)} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm">OK</button>
                  </div>
                </div>
              </div>
            )}

            {showRepkitMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowRepkitMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {repkitData.mfgs.map((m) => {
                        const active = m.id === repkitMfgId;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setRepkitMfgId(m.id);
                              setShowRepkitMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-accent)]/10 ${active ? "bg-[var(--color-accent)]/10" : ""}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span className="text-sm text-[var(--color-text)]">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showRepkitGodRollModal && repkitData?.godrolls?.length && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowRepkitGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {repkitData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleRepkitGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showRepkitLegendaryModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitLegendaryModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Legendary perks</h3>
                    <button type="button" onClick={() => setShowRepkitLegendaryModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={repkitLegendarySearch}
                          onChange={(e) => setRepkitLegendarySearch(e.target.value)}
                          placeholder="Search legendary perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={repkitLegendaryApplyQty}
                          onChange={(e) => setRepkitLegendaryApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(5, parseInt(repkitLegendaryApplyQty.trim(), 10) || 1));
                          if (repkitLegendarySelectedIds.size === 0) return;
                          setRepkitLegendaryQtyById((prev) => {
                            const next = { ...prev };
                            repkitLegendarySelectedIds.forEach((key) => { next[key] = qty; });
                            return next;
                          });
                          setRepkitLegendarySelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {repkitData.legendaryPerks
                          .filter((p) => {
                            const q = repkitLegendarySearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.mfgName} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const key = `${p.mfgId}:${p.partId}`;
                            const checked = repkitLegendarySelectedIds.has(key);
                            const currentQty = repkitLegendaryQtyById[key] ?? 0;
                            return (
                              <label key={key} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(repkitLegendarySelectedIds);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    setRepkitLegendarySelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.mfgName}: {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showRepkitUniversalModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitUniversalModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Universal perks</h3>
                    <button type="button" onClick={() => setShowRepkitUniversalModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={repkitUniversalSearch}
                          onChange={(e) => setRepkitUniversalSearch(e.target.value)}
                          placeholder="Search universal perks…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={repkitUniversalApplyQty}
                          onChange={(e) => setRepkitUniversalApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(99, parseInt(repkitUniversalApplyQty.trim(), 10) || 1));
                          if (repkitUniversalSelectedIds.size === 0) return;
                          setRepkitUniversalQtyById((prev) => {
                            const next = { ...prev };
                            repkitUniversalSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setRepkitUniversalSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {repkitData.universalPerks
                          .filter((p) => {
                            const q = repkitUniversalSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = repkitUniversalSelectedIds.has(p.partId);
                            const currentQty = repkitUniversalQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(repkitUniversalSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setRepkitUniversalSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showRepkitResistanceModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowRepkitResistanceModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Elemental Resistance</h3>
                    <button type="button" onClick={() => setShowRepkitResistanceModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={repkitResistanceSearch}
                          onChange={(e) => setRepkitResistanceSearch(e.target.value)}
                          placeholder="Search elemental resistance…"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Qty for selected</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={repkitResistanceApplyQty}
                          onChange={(e) => setRepkitResistanceApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(5, parseInt(repkitResistanceApplyQty.trim(), 10) || 1));
                          if (repkitResistanceSelectedIds.size === 0) return;
                          setRepkitResistanceQtyById((prev) => {
                            const next = { ...prev };
                            repkitResistanceSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setRepkitResistanceSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {repkitData.resistance
                          .filter((p) => {
                            const q = repkitResistanceSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${p.partId} ${p.stat}`.toLowerCase().includes(q);
                          })
                          .map((p) => {
                            const checked = repkitResistanceSelectedIds.has(p.partId);
                            const currentQty = repkitResistanceQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(repkitResistanceSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setRepkitResistanceSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2">
              {(() => {
                const rarities = repkitData.raritiesByMfg[repkitMfgId] ?? [];
                const prefixOptions = repkitData.prefix.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}` }));
                const firmwareOptions = repkitData.firmware.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}` }));

                return REPKIT_PART_ORDER.flatMap(({ key: partType }) => {
                  if (partType === "Legendary") {
                    return [(
                      <div key="Repkit Legendary" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Legendary perks (multi-select)</label>
                          <button type="button" onClick={() => setShowRepkitLegendaryModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(repkitLegendaryQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(repkitLegendaryQtyById).sort((a, b) => a[0].localeCompare(b[0])).map(([key, qty]) => {
                                const [mfgStr, idStr] = key.split(":", 2);
                                const id = Number(idStr);
                                const mfg = Number(mfgStr);
                                const perk = repkitData.legendaryPerks.find((p) => p.partId === id && p.mfgId === mfg);
                                return (
                                  <div key={key} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">
                                      {perk ? `${perk.partId} - ${perk.mfgName}: ${perk.stat}` : `Perk ${key}`}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={String(qty)}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1));
                                        setRepkitLegendaryQtyById((prev) => ({ ...prev, [key]: v }));
                                      }}
                                      className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                      title="Quantity"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRepkitLegendaryQtyById((prev) => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                      }}
                                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  if (partType === "Universal perks") {
                    return [(
                      <div key="Repkit Universal" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Universal perks (multi-select)</label>
                          <button type="button" onClick={() => setShowRepkitUniversalModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(repkitUniversalQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(repkitUniversalQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = repkitData.universalPerks.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">
                                      {perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={String(qty)}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                                        setRepkitUniversalQtyById((prev) => ({ ...prev, [id]: v }));
                                      }}
                                      className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                      title="Quantity"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRepkitUniversalQtyById((prev) => {
                                          const next = { ...prev };
                                          delete next[id];
                                          return next;
                                        });
                                      }}
                                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  if (partType === "Resistance") {
                    return [(
                      <div key="Repkit Resistance" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Elemental Resistance (multi-select)</label>
                          <button type="button" onClick={() => setShowRepkitResistanceModal(true)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation">
                            Select resistances…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(repkitResistanceQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(repkitResistanceQtyById).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idStr, qty]) => {
                                const id = Number(idStr);
                                const perk = repkitData.resistance.find((p) => p.partId === id);
                                return (
                                  <div key={idStr} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-1 text-sm text-[var(--color-text)] break-words">
                                      {perk ? `${perk.partId} - ${perk.stat}` : `Perk ${idStr}`}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={String(qty)}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1));
                                        setRepkitResistanceQtyById((prev) => ({ ...prev, [id]: v }));
                                      }}
                                      className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                      title="Quantity"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRepkitResistanceQtyById((prev) => {
                                          const next = { ...prev };
                                          delete next[id];
                                          return next;
                                        });
                                      }}
                                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 touch-manipulation flex items-center justify-center"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )];
                  }

                  let opts: { partId: string; label: string; value?: string }[] = [];
                  if (partType === "Rarity") opts = rarities.map((r) => ({ partId: String(r.id), label: r.label, value: r.label }));
                  else if (partType === "Prefix") opts = prefixOptions;
                  else if (partType === "Firmware") opts = firmwareOptions;
                  else return [];

                  const key = partType;
                  const value = repkitSlotSelections[key] ?? NONE;
                  return [(
                    <div key={key} className="space-y-1">
                      <label className="block text-xs text-[var(--color-accent)]">{partType}</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === ADD_OTHER_OPTION) { setShowAddPartsModal(true); return; }
                            setRepkitSlotSelections((prev) => ({ ...prev, [key]: v }));
                          }}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        >
                          <option value={NONE}>{NONE}</option>
                          <option value={ADD_OTHER_OPTION}>Add other parts</option>
                          {opts.map((o) => (
                            <option key={o.partId + o.label} value={o.value ?? o.label}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )];
                });
              })()}
            </div>
          </div>
        </details>
      )}

      {/* Enhancement: Manufacturer + Level + Seed + part groups (weapon-style) */}
      {category === "enhancement" && enhancementData && enhancementMfgName && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⬡</span> Enhancement build</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then select parts from each group. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <button
                  type="button"
                  onClick={() => setShowEnhancementMfgModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] min-w-[10rem] text-left"
                  title="Select manufacturer"
                >
                  {enhancementData.manufacturers[enhancementMfgName]?.name ?? enhancementMfgName}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) || 50)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Seed</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] w-20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Add other parts
                </button>
                <button
                  type="button"
                  onClick={handleRandomEnhancement}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                >
                  Random item
                </button>
                <button
                  type="button"
                  onClick={() => setShowEnhancementGodRollModal(true)}
                  disabled={!enhancementData?.godrolls?.length}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  title={enhancementData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
                >
                  God roll
                </button>
              </div>
            </div>

            {showEnhancementMfgModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowEnhancementMfgModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Select Manufacturer</h3>
                    <button type="button" onClick={() => setShowEnhancementMfgModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50">
                      {Object.keys(enhancementData.manufacturers).sort().map((name) => {
                        const active = name === enhancementMfgName;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setEnhancementMfgName(name);
                              setShowEnhancementMfgModal(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm ${active ? "bg-[rgba(63,203,255,0.16)] text-[var(--color-accent)]" : "text-[var(--color-text)] hover:bg-[rgba(63,203,255,0.08)]"}`}
                          >
                            <span className={`weapon-part-radio w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 flex-shrink-0 ${active ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-panel-border)] bg-transparent"}`} />
                            <span>{enhancementData.manufacturers[name].name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showEnhancementGodRollModal && enhancementData?.godrolls?.length ? (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowEnhancementGodRollModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">God roll preset</h3>
                    <button type="button" onClick={() => setShowEnhancementGodRollModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {enhancementData.godrolls.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleEnhancementGodRollSelect(g.decoded)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ENHANCEMENT_PART_ORDER.map(({ key: partType }) => {
                const displayLabel =
                  partType === "Stacked perks"
                    ? "Legendary Perks"
                    : partType === "Builder 247"
                    ? "Universal Perks"
                    : partType;
                const list = enhancementPartSelections[partType] ?? [];
                return (
                  <div key={partType} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs text-[var(--color-accent)]">{displayLabel}</label>
                      <button
                        type="button"
                        onClick={() => {
                          setEnhancementPartPickerPartType(partType);
                          setEnhancementPartPickerChecked(new Set());
                          setEnhancementPartPickerShowQty(false);
                        }}
                        className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                      >
                        Select parts…
                      </button>
                    </div>
                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2 min-h-[44px]">
                      {list.length === 0 ? (
                        <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                      ) : (
                        <div className="space-y-2">
                          {list.map((item, idx) => {
                            const pi = universalParts.find((u) => u.label === item.label);
                            const { border, bg, nameColor } = slotRarityStyle(pi?.rarity);
                            return (
                            <div key={idx} className={`rounded-lg border ${border} ${bg} p-2`} onMouseEnter={(e) => startHover(hoverDataByLabel(item.label, enhancementPerkDescMap.get(item.label), partType), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                              <div className="flex items-center gap-2 flex-wrap">
                              <div className={`min-w-0 flex-1 text-sm font-medium break-words truncate ${nameColor}`}>{item.label}</div>
                              {partType !== "Rarity" && (
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={item.qty}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEnhancementPartSelections((prev) => {
                                      const arr = [...(prev[partType] ?? [])];
                                      arr[idx] = { ...arr[idx], qty: v };
                                      return { ...prev, [partType]: arr };
                                    });
                                  }}
                                  className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[36px]"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEnhancementPartSelections((prev) => {
                                    const arr = (prev[partType] ?? []).filter((_, i) => i !== idx);
                                    return { ...prev, [partType]: arr };
                                  });
                                }}
                                className="p-2 min-h-[36px] min-w-[36px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 flex items-center justify-center"
                              >
                                ×
                              </button>
                              </div>
                              {pi?.effect && <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate leading-snug">{pi.effect}</p>}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Enhancement part picker modal */}
            {enhancementPartPickerPartType && !enhancementPartPickerShowQty && (() => {
              const mfg = enhancementMfgName ? enhancementData.manufacturers[enhancementMfgName] : null;
              const pickerLabel =
                enhancementPartPickerPartType === "Stacked perks"
                  ? "Legendary Perks"
                  : enhancementPartPickerPartType === "Builder 247"
                  ? "Universal Perks"
                  : enhancementPartPickerPartType;
              let opts: { partId: string; label: string; description?: string }[] = [];
              if (mfg && enhancementPartPickerPartType === "Rarity") {
                opts = ENHANCEMENT_RARITY_ORDER.filter((r) => r in (mfg.rarities || {})).map((r) => ({ partId: r, label: r }));
              } else if (mfg && enhancementPartPickerPartType === "Manufacturer perks") {
                opts = (mfg.perks || []).filter((p) => ENHANCEMENT_PERK_ORDER.includes(p.index)).map((p) => ({ partId: String(p.index), label: `[${p.index}] ${p.name}`, description: p.description }));
              } else if (enhancementPartPickerPartType === "Stacked perks" && enhancementMfgName) {
                for (const [name, om] of Object.entries(enhancementData.manufacturers)) {
                  if (name === enhancementMfgName) continue;
                  for (const p of om.perks || []) {
                    if (!ENHANCEMENT_PERK_ORDER.includes(p.index)) continue;
                    opts.push({ partId: `${om.code}:${p.index}`, label: `${om.code}:${p.index} - ${p.name} — ${name}`, description: p.description });
                  }
                }
              } else if (enhancementPartPickerPartType === "Builder 247") {
                opts = (enhancementData.secondary247 || []).map((s) => ({ partId: String(s.code), label: `${s.code} - ${s.name}`, description: s.description }));
              }
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setEnhancementPartPickerPartType(null)}>
                  <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                      <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {pickerLabel}</h3>
                      <button type="button" onClick={() => setEnhancementPartPickerPartType(null)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      <button
                        type="button"
                        onClick={() => { setEnhancementPartPickerPartType(null); setShowAddPartsModal(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm mb-2"
                      >
                        ➕ Add part from database…
                      </button>
                      <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(0,0,0,0.2)] divide-y divide-[var(--color-panel-border)]/50 max-h-[50vh] overflow-y-auto">
                        {opts.map((o) => (
                          <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10" onMouseEnter={(e) => startHover(hoverDataByLabel(o.label, o.description, enhancementPartPickerPartType || undefined), e.currentTarget.getBoundingClientRect().top)} onMouseLeave={endHover}>
                            <input
                              type="checkbox"
                              checked={enhancementPartPickerChecked.has(o.label)}
                              onChange={(e) => {
                                setEnhancementPartPickerChecked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(o.label); else next.delete(o.label);
                                  return next;
                                });
                              }}
                              className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                            />
                            <PartLabel partId={o.partId} label={o.label} description={o.description} pickerPartType={enhancementPartPickerPartType || undefined} detailed={richDetailView} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex gap-2 justify-end shrink-0">
                      <button type="button" onClick={() => setEnhancementPartPickerPartType(null)} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm">Cancel</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (enhancementPartPickerChecked.size === 0) return;
                          const partType = enhancementPartPickerPartType;
                          if (partType === "Rarity") {
                            const toAdd = Array.from(enhancementPartPickerChecked).map((label) => ({ label, qty: "1" }));
                            setEnhancementPartSelections((prev) => ({ ...prev, [partType]: [...(prev[partType] ?? []), ...toAdd] }));
                            setEnhancementPartPickerPartType(null);
                            setEnhancementPartPickerChecked(new Set());
                          } else {
                            setEnhancementPartPickerShowQty(true);
                          }
                        }}
                        disabled={enhancementPartPickerChecked.size === 0}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add selected ({enhancementPartPickerChecked.size})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Enhancement quantity popup */}
            {enhancementPartPickerPartType && enhancementPartPickerShowQty && (
              <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => { setEnhancementPartPickerPartType(null); setEnhancementPartPickerShowQty(false); }}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-[var(--color-accent)] font-medium text-sm mb-2">Quantity</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">This quantity will be applied to all {enhancementPartPickerChecked.size} selected parts.</p>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={enhancementPartPickerQty}
                    onChange={(e) => setEnhancementPartPickerQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] mb-3"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setEnhancementPartPickerPartType(null); setEnhancementPartPickerShowQty(false); }} className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] text-sm">Cancel</button>
                    <button
                      type="button"
                      onClick={() => {
                        const partType = enhancementPartPickerPartType;
                        const qty = String(Math.max(1, Math.min(99, parseInt(enhancementPartPickerQty.trim(), 10) || 1)));
                        const toAdd = Array.from(enhancementPartPickerChecked).map((label) => ({ label, qty }));
                        setEnhancementPartSelections((prev) => ({ ...prev, [partType]: [...(prev[partType] ?? []), ...toAdd] }));
                        setEnhancementPartPickerPartType(null);
                        setEnhancementPartPickerChecked(new Set());
                        setEnhancementPartPickerShowQty(false);
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
            {sharedSkins.length > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-[var(--color-panel-border)]/60 bg-[rgba(0,0,0,0.15)]">
                <label className="block text-sm font-medium text-[var(--color-accent)] mb-2">Skin</label>
                <div className="flex flex-wrap items-start gap-3">
                  <select
                    value={enhancementSkinValue}
                    onChange={(e) => setEnhancementSkinValue(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[20rem]"
                  >
                    <option value="">None</option>
                    {sharedSkins.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {enhancementSkinValue && (
                    <SkinPreview token={enhancementSkinValue} label={sharedSkins.find((s) => s.value === enhancementSkinValue)?.label ?? enhancementSkinValue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div />

        {/* Side: Current build parts (collapsible on small screens) */}
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] overflow-hidden group flex flex-col min-h-0" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none shrink-0 font-mono">
            <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">◈</span> Current build parts</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="p-3 pt-0 flex flex-col min-h-0 flex-1 overflow-hidden">
          <p className="text-xs text-[var(--color-text-muted)] mb-2 shrink-0">
            Parsed from the first decoded line. Reorder, remove, or edit quantity; decoded and Base85 stay in sync.
          </p>
          <div className="flex-1 overflow-y-auto min-h-[160px] space-y-2 pr-1">
            {currentBuildParts.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-panel-border)] py-8 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                No parts yet. Add via Part Builder or &quot;Add other parts&quot;.
              </div>
            )}
            {currentBuildParts.map((part, i) => (
              <div
                key={`${i}-${part.raw}`}
                className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2 flex flex-col gap-2"
                onMouseEnter={(e) => {
                  const data = hoverDataByCode(part.raw) ?? (part.prefix != null && part.partId != null ? hoverDataByCode(`{${part.prefix}:${part.partId}}`) : null);
                  if (data) startHover(data, e.currentTarget.getBoundingClientRect().top, "left");
                }}
                onMouseLeave={endHover}
              >
                <div className="flex items-start gap-1">
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => movePart(i, "up")}
                      disabled={i === 0}
                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-40 text-xs touch-manipulation flex items-center justify-center"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePart(i, "down")}
                      disabled={i === currentBuildParts.length - 1}
                      className="p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-40 text-xs touch-manipulation flex items-center justify-center"
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    {(() => {
                      const rawLabel = getPartLabel(
                        part,
                        partsByCode,
                        elementNameByPartId,
                        category === "weapon"
                          ? weaponExtraLabels
                          : category === "shield"
                          ? shieldExtraLabels
                          : category === "grenade"
                          ? grenadeExtraLabels
                          : category === "repkit"
                          ? repkitExtraLabels
                          : category === "enhancement"
                          ? null
                          : null,
                      );

                      if (!richDetailView) {
                        return (
                          <div className="text-sm text-[var(--color-text)] break-words">
                            {rawLabel}
                          </div>
                        );
                      }

                      const label = String(rawLabel ?? "").trim();
                      let name = label;
                      let info = "";

                      const descLookup = (() => {
                        if (category === "weapon") {
                          return (
                            weaponPartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? weaponPartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        if (category === "shield") {
                          return (
                            shieldPartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? shieldPartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        if (category === "grenade") {
                          return (
                            grenadePartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? grenadePartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        if (category === "repkit") {
                          return (
                            repkitPartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? repkitPartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        if (category === "heavy") {
                          return (
                            heavyPartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? heavyPartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        if (category === "enhancement") {
                          return (
                            enhancementPartDescriptionByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? enhancementPartDescriptionByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined)
                          );
                        }
                        return undefined;
                      })();

                      if (descLookup) {
                        info = descLookup;
                      } else {
                        const pieces = label.split(" - ");
                        if (pieces.length > 1) {
                          name = pieces[0].trim();
                          info = pieces.slice(1).join(" - ").trim();
                        }
                      }

                      const idDisplay =
                        part.partId != null
                          ? part.partId
                          : part.prefix != null
                          ? part.prefix
                          : null;
                      const primary = idDisplay != null ? `${idDisplay} - ${name}` : name;
                      return (
                        <div className="text-sm text-[var(--color-text)] break-words">
                          <div>{primary}</div>
                          {info && (
                            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                              {info}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePart(i)}
                    className="shrink-0 p-2 min-h-[44px] min-w-[44px] rounded border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 text-xs touch-manipulation flex items-center justify-center"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                {/* Quantity and Edit qty at bottom of card (with type label directly above the line) */}
                {editQtyIndex === i ? (
                <div className="flex items-center gap-2 pt-1 border-t border-[var(--color-panel-border)]">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={editQtyValue}
                      onChange={(e) => setEditQtyValue(e.target.value)}
                      className="w-16 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const q = Math.max(1, Math.min(999, parseInt(editQtyValue.trim(), 10) || 1));
                        setPartQuantity(i, q);
                        setEditQtyIndex(null);
                      }}
                      className="px-2 py-1 rounded bg-[var(--color-accent)] text-black text-xs"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQtyIndex(null)}
                      className="px-2 py-1 rounded border border-[var(--color-panel-border)] text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const computeType = (): string | undefined => {
                        if (category === "weapon") {
                          const t =
                            weaponPartTypeByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? weaponPartTypeByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined);
                          return t;
                        }
                        if (category === "shield") {
                          const t =
                            shieldPartTypeByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? shieldPartTypeByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined);
                          return t;
                        }
                        if (category === "grenade") {
                          const t =
                            grenadePartTypeByRaw.get(part.raw) ??
                            (part.prefix != null && part.partId != null
                              ? grenadePartTypeByRaw.get(`{${part.prefix}:${part.partId}}`)
                              : undefined);
                          return t;
                        }
                        return undefined;
                      };
                      const partType = computeType();
                      if (!partType) return null;
                      const lower = partType.toLowerCase();
                      const typeClass =
                        lower === "universal perk"
                          ? "text-xs text-[var(--color-text-muted)] text-center lowercase mb-0.5"
                          : "text-xs text-[var(--color-text-muted)] text-left lowercase mb-0.5";
                      return <div className={typeClass}>{lower}</div>;
                    })()}
                    <div className="pt-0.5 border-t border-[var(--color-panel-border)] flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {part.qty === 1 ? "x1" : `×${part.qty}`}
                      </span>
                      {(part.prefix != null || part.partId != null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditQtyIndex(i);
                            setEditQtyValue(String(part.qty));
                          }}
                          className="text-xs text-[var(--color-accent)] hover:underline"
                        >
                          Edit qty
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          </div>
        </details>
      </section>

      {/* Build reference (tips, collapsed by default) */}
      <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.5)] overflow-hidden group">
        <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none font-mono">
          <span className="flex items-center gap-2"><span className="text-[var(--color-accent)]/60" aria-hidden="true">⊞</span> Build Reference</span>
          <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-2 border-t border-[var(--color-panel-border)] space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Part checklist:</strong> ✓ = required part present · ☐ = required part missing. Fill all required slots before adding bonus parts for best results.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Rarity &amp; skin:</strong> The item's base skin is driven by rarity. Swapping rarity will change the skin — further cosmetic changes can be applied separately.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Manufacturer parts:</strong> In-game models only render parts from the item's own manufacturer. Fill required slots with matching manufacturer parts first; cross-manufacturer parts are secondary.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Show Info</strong> — toggles rich descriptions in part pickers. <strong className="text-[var(--color-text)]">All Parts</strong> — expands part lists beyond the selected manufacturer (use with care).
          </p>
        </div>
      </details>

      {/* Add other parts modal */}
      {showAddPartsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4">
          <div className="max-h-[85dvh] sm:max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
              <h3 className="text-[var(--color-accent)] font-medium text-sm">Add other parts</h3>
              <button
                type="button"
                onClick={() => setShowAddPartsModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              >
                Close
              </button>
            </div>
            <div className="p-4 flex flex-wrap gap-2 shrink-0">
              <input
                type="search"
                value={addPartsSearch}
                onChange={(e) => setAddPartsSearch(e.target.value)}
                placeholder="Search by name, code, effect, +damage, etc…"
                className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]"
              />
              <select
                value={addPartsMfg}
                onChange={(e) => setAddPartsMfg(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
              >
                <option value="">All manufacturers</option>
                {addPartsManufacturers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={addPartsRarity}
                onChange={(e) => setAddPartsRarity(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
              >
                <option value="">All rarities</option>
                {addPartsRarities.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0 divide-y divide-[var(--color-panel-border)]/40">
              {filteredAddParts.map((p, idx) => (
                <label
                  key={`${p.code}-${idx}`}
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 transition-colors"
                  onMouseEnter={(e) => startHover(universalRowToHoverData(p), e.currentTarget.getBoundingClientRect().top)}
                  onMouseLeave={endHover}
                >
                  <input
                    type="checkbox"
                    checked={addPartsChecked.has(p.code)}
                    onChange={(e) => {
                      setAddPartsChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.code); else next.delete(p.code);
                        return next;
                      });
                    }}
                    className="weapon-part-radio appearance-none w-5 h-5 min-w-[20px] min-h-[20px] rounded-full border-2 border-[var(--color-panel-border)] bg-transparent cursor-pointer mt-0.5 transition-colors checked:bg-[var(--color-accent)] checked:border-[var(--color-accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{p.code}</span>
                      <span className="text-sm text-[var(--color-text)] truncate">{p.label}</span>
                    </div>
                    {richDetailView && (
                      <>
                        {(p.manufacturer || p.rarity || p.partType) && (
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {[p.manufacturer, p.rarity, p.partType].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {p.effect && (
                          <p className="text-xs text-[var(--color-accent)]/80 mt-0.5 truncate">{p.effect}</p>
                        )}
                      </>
                    )}
                  </div>
                </label>
              ))}
              {filteredAddParts.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] py-4 px-3">No parts match. Try different filters.</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {addPartsChecked.size > 0 ? `${addPartsChecked.size} selected` : "Check parts to select"}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={addPartsQty}
                    onChange={(e) => setAddPartsQty(e.target.value)}
                    className="w-14 px-2 py-1.5 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddPartsModal(false); setAddPartsChecked(new Set()); setAddPartsQty("1"); }}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={addPartsChecked.size === 0}
                  onClick={() => {
                    const qty = Math.max(1, Math.min(99, parseInt(addPartsQty.trim(), 10) || 1));
                    const tokens = [...addPartsChecked].map((code) => codeToToken(code, qty));
                    if (category === "weapon" && weaponMfgWtId) {
                      setExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "grenade" && grenadeMfgId != null) {
                      setGrenadeExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "shield" && shieldMfgId != null) {
                      setShieldExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "repkit" && repkitMfgId != null) {
                      setRepkitExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "enhancement" && enhancementMfgName) {
                      setEnhancementExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "heavy" && heavyMfgId != null) {
                      setHeavyExtraTokens((prev) => [...prev, ...tokens]);
                    } else if (category === "class-mod" && classModData) {
                      setClassModExtraTokens((prev) => [...prev, ...tokens]);
                    } else {
                      appendToDecoded(tokens);
                    }
                    setAddPartsChecked(new Set());
                    setAddPartsQty("1");
                    setShowAddPartsModal(false);
                  }}
                  className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add selected ({addPartsChecked.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Quantity modal after picking a part from Add other parts */}
      {pendingAddPart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl p-4 w-full max-w-sm">
            <p className="text-sm text-[var(--color-text)] mb-2">
              Quantity for <span className="text-[var(--color-accent)] truncate block">{pendingAddPart.label}</span>
            </p>
            <p className="text-xs font-mono text-[var(--color-text-muted)] mb-2">{pendingAddPart.code}</p>
            <input
              type="number"
              min={1}
              max={999}
              value={pendingAddQty}
              onChange={(e) => setPendingAddQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmPendingAdd();
                }
                if (e.key === "Escape") setPendingAddPart(null);
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] mb-3 min-h-[44px]"
              autoFocus
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAddPart(null)}
                className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[44px] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingAdd}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium min-h-[44px] text-sm"
              >
                Add to build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code history */}
      <CodeHistoryPanel />

      {/* Floating hover card for slot items and sidebar build parts */}
      <PartHoverCard data={hoverCard} cardTop={hoverCardTop} side={hoverCardSide} />
    </div>
  );
}
