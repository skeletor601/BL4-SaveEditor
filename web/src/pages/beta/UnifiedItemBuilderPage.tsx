/**
 * Beta: Unified Item Builder.
 * One page to build/edit any item (weapon, grenade, shield, class mod, repkit, heavy, enhancement)
 * using our DB (parts/data, decode/encode APIs). Part Builder + Add other parts + quantity;
 * side panel = Current build parts (parsed from decoded).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { parse as yamlParse } from "yaml";
import { useSave } from "@/contexts/SaveContext";
import { fetchApi, getApiUnavailableError, isLikelyUnavailable } from "@/lib/apiClient";
import { usePersistedState } from "@/lib/usePersistedState";
import CleanCodeDialog from "@/components/weapon-toolbox/CleanCodeDialog";

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

const GRENADE_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Element", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Mfg Perk", slots: 4 },
  { key: "Universal Perk", slots: 1 },
];

const SHIELD_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Element", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Universal perks", slots: 1 },
  { key: "Energy perks", slots: 1 },
  { key: "Armor perks", slots: 1 },
];

const REPKIT_PART_ORDER: { key: string; slots: number }[] = [
  { key: "Rarity", slots: 1 },
  { key: "Prefix", slots: 1 },
  { key: "Firmware", slots: 1 },
  { key: "Resistance", slots: 1 },
  { key: "Legendary", slots: 1 },
  { key: "Universal perks", slots: 1 },
];

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

/** Build decoded string from weapon slot selections + extra tokens (same logic as WeaponGenView). */
function buildDecodedFromWeaponSlots(
  data: WeaponGenData,
  mfgWtId: string,
  level: number,
  seed: number,
  slotSelections: Record<string, string>,
  slotQuantities: Record<string, string>,
  extraTokens: string[]
): string {
  const header = `${mfgWtId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyFor = (key: string): number => {
    const raw = slotQuantities[key]?.trim() ?? "1";
    if (!raw || !/^\d+$/.test(raw)) return 1;
    return Math.max(1, Math.min(99, Number(raw)));
  };
  const raritySel = slotSelections["Rarity"];
  const isLegendary = raritySel === "Legendary";
  const isPearl = raritySel === "Pearl";
  if (isLegendary) {
    const legSel = slotSelections["Legendary Type"];
    const pid = partIdFromLabel(legSel ?? "");
    if (pid) {
      const qty = qtyFor("Legendary Type");
      if (qty <= 1) parts.push(`{${pid}}`);
      else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
    }
  } else if (isPearl) {
    const pearlSel = slotSelections["Pearl Type"];
    const pid = partIdFromLabel(pearlSel ?? "");
    if (pid) {
      const qty = qtyFor("Pearl Type");
      if (qty <= 1) parts.push(`{${pid}}`);
      else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
    }
  } else if (raritySel && raritySel !== NONE) {
    const entry = data.rarityByMfgTypeId[mfgWtId]?.find((r) => r.stat === raritySel);
    if (entry) {
      const qty = qtyFor("Rarity");
      if (qty <= 1) parts.push(`{${entry.partId}}`);
      else parts.push(`{${mfgWtId}:[${Array(qty).fill(entry.partId).join(" ")}]}`);
    }
  }
  ["Element 1", "Element 2"].forEach((key) => {
    const sel = slotSelections[key];
    const pid = partIdFromLabel(sel ?? "");
    if (!pid) return;
    const qty = qtyFor(key);
    if (qty <= 1) parts.push(`{1:${pid}}`);
    else parts.push(`{1:[${Array(qty).fill(pid).join(" ")}]}`);
  });
  const specialKeys = new Set(["Rarity", "Legendary Type", "Pearl Type", "Element 1", "Element 2"]);
  WEAPON_PART_ORDER.forEach(({ key: partType, slots }) => {
    if (specialKeys.has(partType)) return;
    for (let i = 0; i < slots; i++) {
      const key = slots > 1 ? `${partType}_${i}` : partType;
      const label = slotSelections[key];
      const pid = partIdFromLabel(label ?? "");
      if (!pid) return;
      const qty = qtyFor(key);
      if (qty <= 1) parts.push(`{${pid}}`);
      else parts.push(`{${mfgWtId}:[${Array(qty).fill(pid).join(" ")}]}`);
    }
  });
  extraTokens.forEach((t) => parts.push(t));
  return `${header} ${parts.join(" ")} |`;
}

const GRENADE_TYPE_ID = 245;

/** Build decoded string from grenade slot selections (matches GrenadeBuilderView order). */
function buildDecodedFromGrenadeSlots(
  data: GrenadeBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  slotSelections: Record<string, string>,
  slotQuantities: Record<string, string>,
  extraTokens: string[],
  universalPerkQtyById: Record<number, number>,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyFor = (key: string): number => {
    const raw = slotQuantities[key]?.trim() ?? "1";
    if (!raw || !/^\d+$/.test(raw)) return 1;
    return Math.max(1, Math.min(99, Number(raw)));
  };

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const raritySel = slotSelections["Rarity"];
  const rarityEntry = rarities.find((r) => r.label === raritySel);
  if (rarityEntry) {
    parts.push(`{${rarityEntry.id}}`);
  }

  const secondary245: number[] = [];

  const legendarySel = slotSelections["Legendary"];
  if (legendarySel && legendarySel !== NONE) {
    const qty = qtyFor("Legendary");
    if (legendarySel.includes(":")) {
      const [m, p] = legendarySel.split(":", 2);
      const legMfg = parseInt(m ?? "", 10);
      const legPartId = parseInt(p ?? "", 10);
      if (Number.isFinite(legMfg) && Number.isFinite(legPartId)) {
        if (legMfg === mfgId) {
          for (let i = 0; i < qty; i++) parts.push(`{${legPartId}}`);
        } else {
          if (qty <= 1) parts.push(`{${legMfg}:${legPartId}}`);
          else parts.push(`{${legMfg}:[${Array(qty).fill(legPartId).join(" ")}]}`);
        }
      }
    } else {
      const legPartId = partIdFromLabel(legendarySel);
      if (legPartId) {
        for (let i = 0; i < qty; i++) parts.push(`{${legPartId}}`);
      }
    }
  }

  const elementSel = slotSelections["Element"];
  if (elementSel && elementSel !== NONE) {
    const pid = partIdFromLabel(elementSel);
    if (pid) {
      const qty = qtyFor("Element");
      for (let i = 0; i < qty; i++) secondary245.push(Number(pid));
    }
  }
  const firmwareSel = slotSelections["Firmware"];
  if (firmwareSel && firmwareSel !== NONE) {
    const pid = partIdFromLabel(firmwareSel);
    if (pid) {
      const qty = qtyFor("Firmware");
      for (let i = 0; i < qty; i++) secondary245.push(Number(pid));
    }
  }

  for (let i = 0; i < 4; i++) {
    const key = `Mfg Perk_${i}`;
    const label = slotSelections[key];
    const pid = label && label !== NONE ? partIdFromLabel(label) : null;
    if (pid) {
      const qty = qtyFor(key);
      for (let j = 0; j < qty; j++) parts.push(`{${pid}}`);
    }
  }

  for (const [idStr, qtyRaw] of Object.entries(universalPerkQtyById ?? {})) {
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) continue;
    const qty = Math.max(1, Math.min(99, Number(qtyRaw) || 1));
    for (let i = 0; i < qty; i++) secondary245.push(id);
  }

  if (secondary245.length === 1) {
    parts.push(`{${GRENADE_TYPE_ID}:${secondary245[0]}}`);
  } else if (secondary245.length > 1) {
    const sorted = [...secondary245].sort((a, b) => a - b);
    parts.push(`{${GRENADE_TYPE_ID}:[${sorted.join(" ")}]}`);
  }

  extraTokens.forEach((t) => parts.push(t));
  return `${header} ${parts.join(" ")} |`;
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

function buildDecodedFromShieldSlots(
  data: ShieldBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  slotSelections: Record<string, string>,
  slotQuantities: Record<string, string>,
  extraTokens: string[],
  elementQtyById: Record<number, number>,
  universalQtyById: Record<number, number>,
  energyQtyById: Record<number, number>,
  armorQtyById: Record<number, number>,
  legendaryQtyById: Record<string, number>,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];
  const qtyFor = (key: string): number => {
    const raw = slotQuantities[key]?.trim() ?? "1";
    if (!raw || !/^\d+$/.test(raw)) return 1;
    return Math.max(1, Math.min(99, Number(raw)));
  };

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const raritySel = slotSelections["Rarity"];
  const rarityEntry = rarities.find((r) => r.label === raritySel);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  // Legendary or model (exactly like ShieldBuilderView)
  const legendaryEntries = Object.entries(legendaryQtyById ?? {}).filter(([, q]) => (q ?? 0) > 0);
  if (legendaryEntries.length === 0) {
    const modelId = data.modelsByMfg[mfgId];
    if (modelId != null) parts.push(`{${modelId}}`);
  } else {
    const otherMfgPerks: Record<number, number[]> = {};
    for (const [key, qtyRaw] of legendaryEntries) {
      const [mfgStr, idStr] = key.split(":", 2);
      const id = parseInt(idStr ?? "", 10);
      const mfg = parseInt(mfgStr ?? "", 10);
      if (!Number.isFinite(id) || !Number.isFinite(mfg)) continue;
      const qty = Math.max(1, Math.min(5, Number(qtyRaw) || 1));
      const leg = data.legendaryPerks.find((l) => l.partId === id && l.mfgId === mfg);
      if (!leg) continue;
      if (mfg === mfgId) {
        for (let i = 0; i < qty; i++) parts.push(`{${id}}`);
      } else {
        if (!otherMfgPerks[mfg]) otherMfgPerks[mfg] = [];
        for (let i = 0; i < qty; i++) otherMfgPerks[mfg].push(id);
      }
    }
    for (const [mfgKey, ids] of Object.entries(otherMfgPerks)) {
      const mfgNum = parseInt(mfgKey, 10);
      const sorted = [...ids].sort((a, b) => a - b);
      if (sorted.length === 1) parts.push(`{${mfgNum}:${sorted[0]}}`);
      else parts.push(`{${mfgNum}:[${sorted.join(" ")}]}`);
    }
  }

  const secondary246: number[] = [];
  const firmwareSel = slotSelections["Firmware"];
  if (firmwareSel && firmwareSel !== NONE) {
    const pid = partIdFromLabel(firmwareSel);
    if (pid) {
      const qty = qtyFor("Firmware");
      for (let i = 0; i < qty; i++) secondary246.push(Number(pid));
    }
  }
  secondary246.push(...expandQtyMap(elementQtyById));
  secondary246.push(...expandQtyMap(universalQtyById));

  const secondary246Token = buildTypeToken(SHIELD_TYPE_ID, secondary246);
  if (secondary246Token) parts.push(secondary246Token);
  const secondary248Token = buildTypeToken(SHIELD_ENERGY_PERK_TYPE_ID, expandQtyMap(energyQtyById));
  if (secondary248Token) parts.push(secondary248Token);
  const secondary237Token = buildTypeToken(SHIELD_ARMOR_PERK_TYPE_ID, expandQtyMap(armorQtyById));
  if (secondary237Token) parts.push(secondary237Token);

  extraTokens.forEach((t) => parts.push(t));
  return `${header} ${parts.join(" ")} |`;
}

function buildDecodedFromRepkitSlots(
  data: RepkitBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  slotSelections: Record<string, string>,
  extraTokens: string[],
  resistanceQtyById: Record<number, number>,
  universalQtyById: Record<number, number>,
  legendaryQtyById: Record<string, number>,
): string {
  const header = `${mfgId}, 0, 1, ${level}| 2, ${seed}||`;
  const parts: string[] = [];

  const rarities = data.raritiesByMfg[mfgId] ?? [];
  const raritySel = slotSelections["Rarity"];
  const rarityEntry = rarities.find((r) => r.label === raritySel);
  if (rarityEntry) parts.push(`{${rarityEntry.id}}`);

  const modelId = data.modelsByMfg[mfgId];
  if (modelId != null) parts.push(`{${modelId}}`);

  const otherMfgPerks: Record<number, number[]> = {};
  for (const [key, qtyRaw] of Object.entries(legendaryQtyById ?? {})) {
    const [mfgStr, idStr] = key.split(":", 2);
    const id = parseInt(idStr ?? "", 10);
    const legMfg = parseInt(mfgStr ?? "", 10);
    if (!Number.isFinite(id) || !Number.isFinite(legMfg)) continue;
    const qty = Math.max(1, Math.min(5, Number(qtyRaw) || 1));
    const leg = data.legendaryPerks.find((l) => l.partId === id && l.mfgId === legMfg);
    if (!leg) continue;
    if (legMfg === mfgId) {
      for (let i = 0; i < qty; i++) parts.push(`{${id}}`);
    } else {
      if (!otherMfgPerks[legMfg]) otherMfgPerks[legMfg] = [];
      for (let i = 0; i < qty; i++) otherMfgPerks[legMfg].push(id);
    }
  }
  for (const [mfgKey, ids] of Object.entries(otherMfgPerks)) {
    const mfgNum = parseInt(mfgKey, 10);
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.length === 1) parts.push(`{${mfgNum}:${sorted[0]}}`);
    else parts.push(`{${mfgNum}:[${sorted.join(" ")}]}`);
  }

  const secondary243: number[] = [];
  const addType243 = (id: number): void => {
    if (!Number.isFinite(id)) return;
    secondary243.push(id);
  };

  const prefixSel = slotSelections["Prefix"];
  if (prefixSel && prefixSel !== NONE) {
    const pid = partIdFromLabel(prefixSel);
    if (pid) addType243(Number(pid));
  }
  const firmwareSel = slotSelections["Firmware"];
  if (firmwareSel && firmwareSel !== NONE) {
    const pid = partIdFromLabel(firmwareSel);
    if (pid) addType243(Number(pid));
  }
  const resistanceIds = expandQtyMap(resistanceQtyById);
  let hasCombustion = false;
  let hasRadiation = false;
  let hasCorrosive = false;
  let hasShock = false;
  let hasCryo = false;
  Object.keys(resistanceQtyById ?? {}).forEach((idStr) => {
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return;
    if (REPKIT_COMBUSTION_IDS.has(id)) hasCombustion = true;
    if (REPKIT_RADIATION_IDS.has(id)) hasRadiation = true;
    if (REPKIT_CORROSIVE_IDS.has(id)) hasCorrosive = true;
    if (REPKIT_SHOCK_IDS.has(id)) hasShock = true;
    if (REPKIT_CRYO_IDS.has(id)) hasCryo = true;
  });
  secondary243.push(...resistanceIds);
  if (hasCombustion) addType243(REPKIT_COMBUSTION_MODEL_PLUS);
  if (hasRadiation) addType243(REPKIT_RADIATION_MODEL_PLUS);
  if (hasCorrosive) addType243(REPKIT_CORROSIVE_MODEL_PLUS);
  if (hasShock) addType243(REPKIT_SHOCK_MODEL_PLUS);
  if (hasCryo) addType243(REPKIT_CRYO_MODEL_PLUS);

  secondary243.push(...expandQtyMap(universalQtyById));
  const secondary243Token = buildTypeToken(REPKIT_TYPE_ID, secondary243);
  if (secondary243Token) parts.push(secondary243Token);

  extraTokens.forEach((t) => parts.push(t));
  return `${header} ${parts.join(" ")} |`;
}

export default function UnifiedItemBuilderPage() {
  const [category, setCategory] = useState<ItemCategory>("weapon");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
  const [firmwareLock, setFirmwareLock] = useState(false);
  const [buybackFlag, setBuybackFlag] = useState(false);
  const [liveBase85, setLiveBase85] = useState("");
  const [liveDecoded, setLiveDecoded] = useState("");
  const [lastEditedCodecSide, setLastEditedCodecSide] = useState<"base85" | "decoded" | null>(null);
  const [codecLoading, setCodecLoading] = useState(false);
  const [codecStatus, setCodecStatus] = useState<string>("Paste Base85 or decoded to start.");
  const [addToBackpackLoading, setAddToBackpackLoading] = useState(false);
  const [showCleanCodeDialog, setShowCleanCodeDialog] = useState(false);
  const codecRequestId = useRef(0);
  const { saveData, getYamlText, updateSaveData } = useSave();
  const [flagValue, setFlagValue] = usePersistedState("unified-item-builder.flagValue", 1);
  const [masterUnlockGuidelines, setMasterUnlockGuidelines] = usePersistedState("unified-item-builder.masterUnlock", false);
  const [descriptiveIdsGuidelines, setDescriptiveIdsGuidelines] = usePersistedState("unified-item-builder.descriptiveIds", true);

  // Add other parts (universal DB)
  const [universalParts, setUniversalParts] = useState<UniversalPartRow[]>([]);
  const [showAddPartsModal, setShowAddPartsModal] = useState(false);
  const [addPartsSearch, setAddPartsSearch] = useState("");
  const [addPartsMfg, setAddPartsMfg] = useState("");
  const [addPartsRarity, setAddPartsRarity] = useState("");

  // Quantity modal (after picking a part to add)
  const [pendingAddPart, setPendingAddPart] = useState<{ code: string; label: string } | null>(null);
  const [pendingAddQty, setPendingAddQty] = useState("1");
  const [editQtyIndex, setEditQtyIndex] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("1");

  // Weapon dropdown mode (when category === "weapon")
  const [weaponData, setWeaponData] = useState<WeaponGenData | null>(null);
  const [weaponManufacturer, setWeaponManufacturer] = useState("");
  const [weaponWeaponType, setWeaponWeaponType] = useState("");
  const [weaponSlotSelections, setWeaponSlotSelections] = useState<Record<string, string>>({});
  const [weaponSlotQuantities, setWeaponSlotQuantities] = useState<Record<string, string>>({});
  const [extraTokens, setExtraTokens] = useState<string[]>([]);
  const [showGodRollModal, setShowGodRollModal] = useState(false);
  const [autoFillWarning, setAutoFillWarning] = useState<string | null>(null);

  // Grenade (when category === "grenade")
  const [grenadeData, setGrenadeData] = useState<GrenadeBuilderData | null>(null);
  const [grenadeMfgId, setGrenadeMfgId] = useState<number | null>(null);
  const [grenadeSlotSelections, setGrenadeSlotSelections] = useState<Record<string, string>>({});
  const [grenadeSlotQuantities, setGrenadeSlotQuantities] = useState<Record<string, string>>({});
  const [grenadeUniversalPerkQtyById, setGrenadeUniversalPerkQtyById] = useState<Record<number, number>>({});
  const [showGrenadeUniversalPerksModal, setShowGrenadeUniversalPerksModal] = useState(false);
  const [grenadeUniversalSearch, setGrenadeUniversalSearch] = useState("");
  const [grenadeUniversalSelectedIds, setGrenadeUniversalSelectedIds] = useState<Set<number>>(new Set());
  const [grenadeUniversalApplyQty, setGrenadeUniversalApplyQty] = useState("1");
  const [grenadeExtraTokens, setGrenadeExtraTokens] = useState<string[]>([]);
  const [showGrenadeGodRollModal, setShowGrenadeGodRollModal] = useState(false);
  const [grenadeAutoFillWarning, setGrenadeAutoFillWarning] = useState<string | null>(null);

  // Shield (when category === "shield")
  const [shieldData, setShieldData] = useState<ShieldBuilderData | null>(null);
  const [shieldMfgId, setShieldMfgId] = useState<number | null>(null);
  const [shieldSlotSelections, setShieldSlotSelections] = useState<Record<string, string>>({});
  const [shieldSlotQuantities, setShieldSlotQuantities] = useState<Record<string, string>>({});
  const [shieldElementQtyById, setShieldElementQtyById] = useState<Record<number, number>>({});
  const [shieldUniversalQtyById, setShieldUniversalQtyById] = useState<Record<number, number>>({});
  const [shieldEnergyQtyById, setShieldEnergyQtyById] = useState<Record<number, number>>({});
  const [shieldArmorQtyById, setShieldArmorQtyById] = useState<Record<number, number>>({});
  const [shieldLegendaryQtyById, setShieldLegendaryQtyById] = useState<Record<string, number>>({});
  const [shieldExtraTokens, setShieldExtraTokens] = useState<string[]>([]);
  const [showShieldGodRollModal, setShowShieldGodRollModal] = useState(false);
  const [shieldAutoFillWarning, setShieldAutoFillWarning] = useState<string | null>(null);

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
  const [repkitMfgId, setRepkitMfgId] = useState<number | null>(null);
  const [repkitSlotSelections, setRepkitSlotSelections] = useState<Record<string, string>>({});
  const [repkitResistanceQtyById, setRepkitResistanceQtyById] = useState<Record<number, number>>({});
  const [repkitUniversalQtyById, setRepkitUniversalQtyById] = useState<Record<number, number>>({});
  const [repkitLegendaryQtyById, setRepkitLegendaryQtyById] = useState<Record<string, number>>({});
  const [repkitExtraTokens, setRepkitExtraTokens] = useState<string[]>([]);
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
    if (!weaponManufacturer || !weaponData?.mfgWtIdList?.length) return;
    const valid = weaponData.mfgWtIdList.some((e) => e.manufacturer === weaponManufacturer && e.weaponType === weaponWeaponType);
    if (!valid) {
      const fallback = weaponData.mfgWtIdList.find((e) => e.manufacturer === weaponManufacturer);
      if (fallback) setWeaponWeaponType(fallback.weaponType);
    }
  }, [weaponManufacturer, weaponWeaponType, weaponData?.mfgWtIdList]);

  const rebuildWeaponDecoded = useCallback(() => {
    if (!weaponData || !weaponMfgWtId) return;
    const decoded = buildDecodedFromWeaponSlots(
      weaponData,
      weaponMfgWtId,
      level,
      seed,
      weaponSlotSelections,
      weaponSlotQuantities,
      extraTokens
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Weapon build updated; encoding…");
  }, [weaponData, weaponMfgWtId, level, seed, weaponSlotSelections, weaponSlotQuantities, extraTokens]);

  useEffect(() => {
    if (category !== "weapon" || !weaponMfgWtId || !weaponData) return;
    rebuildWeaponDecoded();
  }, [category, weaponMfgWtId, weaponData, weaponSlotSelections, weaponSlotQuantities, extraTokens, level, seed, rebuildWeaponDecoded]);

  const rebuildGrenadeDecoded = useCallback(() => {
    if (!grenadeData || grenadeMfgId == null) return;
    const decoded = buildDecodedFromGrenadeSlots(
      grenadeData,
      grenadeMfgId,
      level,
      seed,
      grenadeSlotSelections,
      grenadeSlotQuantities,
      grenadeExtraTokens,
      grenadeUniversalPerkQtyById,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Grenade build updated; encoding…");
  }, [grenadeData, grenadeMfgId, level, seed, grenadeSlotSelections, grenadeSlotQuantities, grenadeExtraTokens, grenadeUniversalPerkQtyById]);

  useEffect(() => {
    if (category !== "grenade" || grenadeMfgId == null || !grenadeData) return;
    rebuildGrenadeDecoded();
  }, [category, grenadeMfgId, grenadeData, grenadeSlotSelections, grenadeSlotQuantities, grenadeExtraTokens, grenadeUniversalPerkQtyById, level, seed, rebuildGrenadeDecoded]);

  const rebuildShieldDecoded = useCallback(() => {
    if (!shieldData || shieldMfgId == null) return;
    const decoded = buildDecodedFromShieldSlots(
      shieldData,
      shieldMfgId,
      level,
      seed,
      shieldSlotSelections,
      shieldSlotQuantities,
      shieldExtraTokens,
      shieldElementQtyById,
      shieldUniversalQtyById,
      shieldEnergyQtyById,
      shieldArmorQtyById,
      shieldLegendaryQtyById,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Shield build updated; encoding…");
  }, [shieldData, shieldMfgId, level, seed, shieldSlotSelections, shieldSlotQuantities, shieldExtraTokens, shieldElementQtyById, shieldUniversalQtyById, shieldEnergyQtyById, shieldArmorQtyById, shieldLegendaryQtyById]);

  useEffect(() => {
    if (category !== "shield" || shieldMfgId == null || !shieldData) return;
    const hasShieldConfig =
      Object.keys(shieldSlotSelections).length > 0 ||
      shieldExtraTokens.length > 0 ||
      Object.keys(shieldElementQtyById).length > 0 ||
      Object.keys(shieldUniversalQtyById).length > 0 ||
      Object.keys(shieldEnergyQtyById).length > 0 ||
      Object.keys(shieldArmorQtyById).length > 0 ||
      Object.keys(shieldLegendaryQtyById).length > 0;
    if (!hasShieldConfig) return;
    rebuildShieldDecoded();
  }, [
    category,
    shieldMfgId,
    shieldData,
    shieldSlotSelections,
    shieldSlotQuantities,
    shieldExtraTokens,
    shieldElementQtyById,
    shieldUniversalQtyById,
    shieldEnergyQtyById,
    shieldArmorQtyById,
    shieldLegendaryQtyById,
    level,
    seed,
    rebuildShieldDecoded,
  ]);

  const rebuildRepkitDecoded = useCallback(() => {
    if (!repkitData || repkitMfgId == null) return;
    const decoded = buildDecodedFromRepkitSlots(
      repkitData,
      repkitMfgId,
      level,
      seed,
      repkitSlotSelections,
      repkitExtraTokens,
      repkitResistanceQtyById,
      repkitUniversalQtyById,
      repkitLegendaryQtyById,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("RepKit build updated; encoding…");
  }, [repkitData, repkitMfgId, level, seed, repkitSlotSelections, repkitExtraTokens, repkitResistanceQtyById, repkitUniversalQtyById, repkitLegendaryQtyById]);

  useEffect(() => {
    if (category !== "repkit" || repkitMfgId == null || !repkitData) return;
    const hasRepkitConfig =
      Object.keys(repkitSlotSelections).length > 0 ||
      repkitExtraTokens.length > 0 ||
      Object.keys(repkitResistanceQtyById).length > 0 ||
      Object.keys(repkitUniversalQtyById).length > 0 ||
      Object.keys(repkitLegendaryQtyById).length > 0;
    if (!hasRepkitConfig) return;
    rebuildRepkitDecoded();
  }, [
    category,
    repkitMfgId,
    repkitData,
    repkitSlotSelections,
    repkitExtraTokens,
    repkitResistanceQtyById,
    repkitUniversalQtyById,
    repkitLegendaryQtyById,
    level,
    seed,
    rebuildRepkitDecoded,
  ]);

  const handleRandomWeapon = useCallback(() => {
    if (!weaponData?.mfgWtIdList?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const list = weaponData.mfgWtIdList;
    const entry = list[Math.floor(Math.random() * list.length)];
    setWeaponManufacturer(entry.manufacturer);
    setWeaponWeaponType(entry.weaponType);
    setLevel(Math.floor(1 + Math.random() * 50));
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
    const elementalOptions = weaponData.elemental.map((e) => `${e.partId} - ${e.stat}`);
    const selections: Record<string, string> = {};
    const quantities: Record<string, string> = {};
    if (rarityChoices.length) selections["Rarity"] = pick(rarityChoices);
    if (selections["Rarity"] === "Legendary" && legendaryLabels.length) {
      selections["Legendary Type"] = pick(legendaryLabels);
    } else if (selections["Rarity"] === "Pearl" && pearlLabels.length) {
      selections["Pearl Type"] = pick(pearlLabels);
    }
    if (elementalOptions.length) {
      selections["Element 1"] = pick(elementalOptions);
      selections["Element 2"] = pick(elementalOptions);
    }
    WEAPON_PART_ORDER.forEach(({ key: partType, slots }) => {
      if (partType === "Legendary Type") {
        if (selections["Rarity"] !== "Legendary") {
          selections["Legendary Type"] = NONE;
          quantities["Legendary Type"] = "1";
          return;
        }
      }
      if (partType === "Pearl Type") {
        if (selections["Rarity"] !== "Pearl") {
          selections["Pearl Type"] = NONE;
          quantities["Pearl Type"] = "1";
          return;
        }
      }
      let opts: { partId: string; label: string }[];
      if (partType === "Rarity") opts = rarityChoices.map((o) => ({ partId: o, label: o }));
      else if (partType === "Legendary Type") opts = legendaryLabels.map((o) => ({ partId: o, label: o }));
      else if (partType === "Pearl Type") opts = pearlLabels.map((o) => ({ partId: o, label: o }));
      else if (partType === "Element 1" || partType === "Element 2") opts = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
      else opts = weaponData.partsByMfgTypeId[mfgWtId]?.[partType] ?? [];
      const choices = opts.length ? opts.map((o) => o.label) : [NONE];
      for (let i = 0; i < slots; i++) {
        const key = slots > 1 ? `${partType}_${i}` : partType;
        selections[key] = pick(choices);
        quantities[key] = "1";
      }
    });
    setWeaponSlotSelections(selections);
    setWeaponSlotQuantities(quantities);
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

  const handleRandomGrenade = useCallback(() => {
    if (!grenadeData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(grenadeData.mfgs);
    setGrenadeMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * 50));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setGrenadeExtraTokens([]);
    const rarities = grenadeData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, string> = {};
    const quantities: Record<string, string> = {};
    const universalPicked: Record<number, number> = {};
    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = r.label;
      quantities["Rarity"] = "1";
    }
    const legendaryForMfg = grenadeData.legendaryPerks.filter((l) => l.mfgId === mfg.id);
    const legendaryAll = grenadeData.legendaryPerks;
    if (legendaryForMfg.length) {
      const leg = pick(legendaryForMfg);
      selections["Legendary"] = `${leg.mfgId}:${leg.partId}`;
    } else if (legendaryAll.length) {
      const leg = pick(legendaryAll);
      selections["Legendary"] = `${leg.mfgId}:${leg.partId}`;
    }
    if (grenadeData.element.length) {
      const e = pick(grenadeData.element);
      selections["Element"] = `${e.partId} - ${e.stat}`;
      quantities["Element"] = String(Math.max(1, Math.floor(Math.random() * 5) + 1)); // 1–5
    }
    if (grenadeData.firmware.length) {
      const f = pick(grenadeData.firmware);
      selections["Firmware"] = `${f.partId} - ${f.stat}`;
      quantities["Firmware"] = String(Math.max(1, Math.floor(Math.random() * 5) + 1)); // 1–5
    }
    const mfgPerksList = grenadeData.mfgPerks[mfg.id] ?? [];
    for (let i = 0; i < 4; i++) {
      const key = `Mfg Perk_${i}`;
      if (mfgPerksList.length) {
        const p = pick(mfgPerksList);
        selections[key] = `${p.partId} - ${p.stat}`;
        quantities[key] = "1";
      }
    }
    if (grenadeData.universalPerks.length) {
      const u = pick(grenadeData.universalPerks);
      universalPicked[u.partId] = Math.max(1, Math.floor(Math.random() * 5) + 1);
    }
    setGrenadeSlotSelections(selections);
    setGrenadeSlotQuantities(quantities);
    setGrenadeUniversalPerkQtyById(universalPicked);
  }, [grenadeData]);

  const handleGrenadeAutoFill = useCallback(() => {
    setGrenadeAutoFillWarning(null);
    if (!grenadeData || grenadeMfgId == null) {
      setGrenadeAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (grenadeSlotSelections["Rarity"] ?? "").trim();
    if (!raritySel || raritySel === NONE) {
      setGrenadeAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const looksLegendary = /legendary/i.test(raritySel);
    const hasLegendaryOptions = grenadeData.legendaryPerks.length > 0;
    const selectedLegendary = (grenadeSlotSelections["Legendary"] ?? "").trim();
    if (looksLegendary && hasLegendaryOptions && (!selectedLegendary || selectedLegendary === NONE)) {
      setGrenadeAutoFillWarning("Please select a Legendary perk first, then click Auto fill.");
      return;
    }

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    // Preserve user-chosen rarity + legendary (if any), but fill everything else.
    const selections: Record<string, string> = {
      ...grenadeSlotSelections,
      Rarity: raritySel,
      ...(selectedLegendary ? { Legendary: selectedLegendary } : {}),
    };
    const quantities: Record<string, string> = { ...grenadeSlotQuantities, Rarity: "1" };

    if (grenadeData.element.length) {
      const e = pick(grenadeData.element);
      selections["Element"] = `${e.partId} - ${e.stat}`;
      quantities["Element"] = randQty(1, 4);
    }
    if (grenadeData.firmware.length) {
      const f = pick(grenadeData.firmware);
      selections["Firmware"] = `${f.partId} - ${f.stat}`;
      quantities["Firmware"] = randQty(1, 6);
    }

    const mfgPerksList = grenadeData.mfgPerks[grenadeMfgId] ?? [];
    for (let i = 0; i < 4; i++) {
      const key = `Mfg Perk_${i}`;
      if (mfgPerksList.length) {
        const p = pick(mfgPerksList);
        selections[key] = `${p.partId} - ${p.stat}`;
        quantities[key] = randQty(1, 4);
      }
    }

    // Universal perks: pick multiple with different stack sizes.
    const universalPicked: Record<number, number> = {};
    const pool = grenadeData.universalPerks ?? [];
    if (pool.length) {
      const targetCount = Math.max(1, Math.min(8, Math.floor(3 + Math.random() * 6))); // 3–8 perks
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(targetCount, shuffled.length))) {
        const qty = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5))); // 1–5
        universalPicked[p.partId] = qty;
      }
    }

    setGrenadeSlotSelections(selections);
    setGrenadeSlotQuantities(quantities);
    setGrenadeUniversalPerkQtyById(universalPicked);
  }, [grenadeData, grenadeMfgId, grenadeSlotSelections, grenadeSlotQuantities]);

  const handleRandomShield = useCallback(() => {
    if (!shieldData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(shieldData.mfgs);
    setShieldMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * 50));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setShieldExtraTokens([]);
    const rarities = shieldData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, string> = {};
    const quantities: Record<string, string> = {};
    const universalPicked: Record<number, number> = {};
    const energyPicked: Record<number, number> = {};
    const armorPicked: Record<number, number> = {};
    const legendaryPicked: Record<number, number> = {};
    const elementPicked: Record<number, number> = {};

    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = r.label;
      quantities["Rarity"] = "1";
    }
    const legendaryAll = shieldData.legendaryPerks;
    if (legendaryAll.length && Math.random() < 0.7) {
      const leg = pick(legendaryAll);
      legendaryPicked[leg.partId] = Math.max(1, Math.floor(Math.random() * 5) + 1); // 1–5
    }
    if (shieldData.element.length) {
      const e = pick(shieldData.element);
      elementPicked[e.partId] = Math.max(1, Math.floor(Math.random() * 5) + 1); // 1–5
    }
    if (shieldData.firmware.length) {
      const f = pick(shieldData.firmware);
      selections["Firmware"] = `${f.partId} - ${f.stat}`;
      quantities["Firmware"] = String(Math.max(1, Math.floor(Math.random() * 5) + 1)); // 1–5
    }

    const pickStacks = (pool: ShieldBuilderPart[], targetMin: number, targetMax: number): Record<number, number> => {
      const out: Record<number, number> = {};
      if (!pool.length) return out;
      const target = Math.max(1, Math.min(10, Math.floor(targetMin + Math.random() * (targetMax - targetMin + 1))));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(target, shuffled.length))) {
        out[p.partId] = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5))); // 1–5
      }
      return out;
    };

    Object.assign(universalPicked, pickStacks(shieldData.universalPerks, 2, 6));
    const shieldType = shieldData.mfgTypeById[mfg.id] ?? "Energy";
    if (shieldType === "Energy") Object.assign(energyPicked, pickStacks(shieldData.energyPerks, 2, 6));
    else Object.assign(armorPicked, pickStacks(shieldData.armorPerks, 2, 6));

    setShieldSlotSelections(selections);
    setShieldSlotQuantities(quantities);
    setShieldUniversalQtyById(universalPicked);
    setShieldEnergyQtyById(energyPicked);
    setShieldArmorQtyById(armorPicked);
    setShieldLegendaryQtyById(legendaryPicked);
    setShieldElementQtyById(elementPicked);
  }, [shieldData]);

  const handleShieldAutoFill = useCallback(() => {
    setShieldAutoFillWarning(null);
    if (!shieldData || shieldMfgId == null) {
      setShieldAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (shieldSlotSelections["Rarity"] ?? "").trim();
    if (!raritySel || raritySel === NONE) {
      setShieldAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const looksLegendary = /legendary/i.test(raritySel);
    const hasLegendaryStacks = Object.keys(shieldLegendaryQtyById ?? {}).length > 0;
    if (looksLegendary && shieldData.legendaryPerks.length > 0 && !hasLegendaryStacks) {
      setShieldAutoFillWarning("Please select at least one Legendary perk first, then click Auto fill.");
      return;
    }
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randQty = (min: number, max: number): string =>
      String(Math.max(1, Math.min(5, Math.floor(min + Math.random() * (max - min + 1)))));

    const selections: Record<string, string> = {
      Rarity: raritySel,
      ...shieldSlotSelections,
    };
    const quantities: Record<string, string> = { ...shieldSlotQuantities, Rarity: "1" };

    const elementPicked: Record<number, number> = { ...shieldElementQtyById };
    if (shieldData.element.length && Object.keys(elementPicked).length === 0) {
      const e = pick(shieldData.element);
      elementPicked[e.partId] = Math.max(1, Math.floor(Math.random() * 5) + 1); // 1–5
    }
    if (shieldData.firmware.length) {
      const f = pick(shieldData.firmware);
      selections["Firmware"] = `${f.partId} - ${f.stat}`;
      quantities["Firmware"] = randQty(1, 6);
    }

    const pickStacks = (pool: ShieldBuilderPart[], targetMin: number, targetMax: number): Record<number, number> => {
      const out: Record<number, number> = {};
      if (!pool.length) return out;
      const target = Math.max(1, Math.min(10, Math.floor(targetMin + Math.random() * (targetMax - targetMin + 1))));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(target, shuffled.length))) {
        out[p.partId] = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5))); // 1–5
      }
      return out;
    };

    const universalPicked = pickStacks(shieldData.universalPerks, 3, 8);
    const shieldType = shieldData.mfgTypeById[shieldMfgId] ?? "Energy";
    const energyPicked = shieldType === "Energy" ? pickStacks(shieldData.energyPerks, 3, 8) : {};
    const armorPicked = shieldType === "Armor" ? pickStacks(shieldData.armorPerks, 3, 8) : {};

    setShieldSlotSelections(selections);
    setShieldSlotQuantities(quantities);
    setShieldElementQtyById(elementPicked);
    setShieldUniversalQtyById(universalPicked);
    setShieldEnergyQtyById(energyPicked);
    setShieldArmorQtyById(armorPicked);
  }, [shieldData, shieldMfgId, shieldSlotSelections, shieldSlotQuantities, shieldElementQtyById, shieldLegendaryQtyById]);

  const handleRandomRepkit = useCallback(() => {
    if (!repkitData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(repkitData.mfgs);
    setRepkitMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * 50));
    setSeed(Math.floor(100 + Math.random() * 9900));
    setRepkitExtraTokens([]);
    const rarities = repkitData.raritiesByMfg[mfg.id] ?? [];
    const selections: Record<string, string> = {};
    const universalPicked: Record<number, number> = {};
    const resistancePicked: Record<number, number> = {};
    const legendaryPicked: Record<string, number> = {};

    if (rarities.length) {
      const r = pick(rarities);
      selections["Rarity"] = r.label;
    }
    if (repkitData.prefix.length) {
      const p = pick(repkitData.prefix);
      selections["Prefix"] = `${p.partId} - ${p.stat}`;
    }
    if (repkitData.firmware.length) {
      const f = pick(repkitData.firmware);
      selections["Firmware"] = `${f.partId} - ${f.stat}`;
    }
    if (repkitData.resistance.length) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...repkitData.resistance].sort(() => Math.random() - 0.5);
      for (const r of shuffled.slice(0, Math.min(target, shuffled.length))) {
        resistancePicked[r.partId] = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      }
    }
    if (repkitData.legendaryPerks.length && Math.random() < 0.8) {
      const l = pick(repkitData.legendaryPerks);
      legendaryPicked[`${l.mfgId}:${l.partId}`] = Math.max(1, Math.floor(Math.random() * 5) + 1);
    }
    if (repkitData.universalPerks.length) {
      const targetCount = Math.max(2, Math.min(8, Math.floor(2 + Math.random() * 7)));
      const shuffled = [...repkitData.universalPerks].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(targetCount, shuffled.length))) {
        universalPicked[p.partId] = Math.max(1, Math.floor(Math.random() * 5) + 1);
      }
    }

    setRepkitSlotSelections(selections);
    setRepkitResistanceQtyById(resistancePicked);
    setRepkitUniversalQtyById(universalPicked);
    setRepkitLegendaryQtyById(legendaryPicked);
  }, [repkitData]);

  const handleRepkitAutoFill = useCallback(() => {
    setRepkitAutoFillWarning(null);
    if (!repkitData || repkitMfgId == null) {
      setRepkitAutoFillWarning("Please select a manufacturer first.");
      return;
    }
    const raritySel = (repkitSlotSelections["Rarity"] ?? "").trim();
    if (!raritySel || raritySel === NONE) {
      setRepkitAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const looksLegendary = /legendary/i.test(raritySel);
    if (looksLegendary && repkitData.legendaryPerks.length > 0 && Object.keys(repkitLegendaryQtyById).length === 0) {
      setRepkitAutoFillWarning("Please select at least one Legendary perk first, then click Auto fill.");
      return;
    }

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const selections: Record<string, string> = {
      ...repkitSlotSelections,
      Rarity: raritySel,
    };

    if (!selections["Prefix"] || selections["Prefix"] === NONE) {
      if (repkitData.prefix.length) {
        const p = pick(repkitData.prefix);
        selections["Prefix"] = `${p.partId} - ${p.stat}`;
      }
    }
    if (!selections["Firmware"] || selections["Firmware"] === NONE) {
      if (repkitData.firmware.length) {
        const f = pick(repkitData.firmware);
        selections["Firmware"] = `${f.partId} - ${f.stat}`;
      }
    }
    const resistancePicked: Record<number, number> = { ...repkitResistanceQtyById };
    if (repkitData.resistance.length && Object.keys(resistancePicked).length === 0) {
      const target = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      const shuffled = [...repkitData.resistance].sort(() => Math.random() - 0.5);
      for (const r of shuffled.slice(0, Math.min(target, shuffled.length))) {
        resistancePicked[r.partId] = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      }
    }

    const universalPicked: Record<number, number> = {};
    if (repkitData.universalPerks.length) {
      const targetCount = Math.max(3, Math.min(10, Math.floor(3 + Math.random() * 8)));
      const shuffled = [...repkitData.universalPerks].sort(() => Math.random() - 0.5);
      for (const p of shuffled.slice(0, Math.min(targetCount, shuffled.length))) {
        universalPicked[p.partId] = Math.max(1, Math.min(5, Math.floor(1 + Math.random() * 5)));
      }
    }

    setRepkitSlotSelections(selections);
    setRepkitResistanceQtyById(resistancePicked);
    setRepkitUniversalQtyById(universalPicked);
  }, [repkitData, repkitMfgId, repkitSlotSelections, repkitLegendaryQtyById, repkitResistanceQtyById]);

  const handleAutoFill = useCallback(() => {
    setAutoFillWarning(null);
    if (!weaponData || !weaponMfgWtId) {
      setAutoFillWarning("Please select manufacturer and weapon type first.");
      return;
    }
    const hasLevel = /^\d+$/.test(String(level)) && Number(level) >= 1 && Number(level) <= 50;
    if (!hasLevel) {
      setAutoFillWarning("Please set a valid level (1–50) first.");
      return;
    }
    const raritySel = weaponSlotSelections["Rarity"] ?? "";
    if (!raritySel || raritySel === NONE) {
      setAutoFillWarning("Please select rarity first, then click Auto fill.");
      return;
    }
    const legendaryLabels = weaponData.legendaryByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    const pearlLabels = weaponData.pearlByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
    if (raritySel === "Legendary" && legendaryLabels.length) {
      const legSel = weaponSlotSelections["Legendary Type"] ?? "";
      if (!legSel || legSel === NONE || !legendaryLabels.includes(legSel)) {
        setAutoFillWarning("Please select a Legendary type first, then click Auto fill.");
        return;
      }
    }
    if (raritySel === "Pearl" && pearlLabels.length) {
      const pearlSel = weaponSlotSelections["Pearl Type"] ?? "";
      if (!pearlSel || pearlSel === NONE || !pearlLabels.includes(pearlSel)) {
        setAutoFillWarning("Please select a Pearl type first, then click Auto fill.");
        return;
      }
    }
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const elementalOptions = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
    const selections = { ...weaponSlotSelections };
    const quantities = { ...weaponSlotQuantities };
    if (elementalOptions.length) {
      selections["Element 1"] = pick(elementalOptions).label;
      selections["Element 2"] = pick(elementalOptions).label;
      quantities["Element 1"] = "1";
      quantities["Element 2"] = "1";
    }
    WEAPON_PART_ORDER.forEach(({ key: partType, slots }) => {
      if (partType === "Rarity" || partType === "Legendary Type" || partType === "Pearl Type") return;
      if (partType === "Element 1" || partType === "Element 2") return;
      const opts = weaponData.partsByMfgTypeId[weaponMfgWtId]?.[partType] ?? [];
      const choices = opts.length ? opts.map((o) => o.label) : [NONE];
      for (let i = 0; i < slots; i++) {
        const key = slots > 1 ? `${partType}_${i}` : partType;
        selections[key] = pick(choices);
        quantities[key] = "1";
      }
    });
    setWeaponSlotSelections(selections);
    setWeaponSlotQuantities(quantities);
  }, [weaponData, weaponMfgWtId, level, weaponSlotSelections, weaponSlotQuantities]);

  const handleCodecChange = useCallback(
    (side: "base85" | "decoded", value: string) => {
      setLastEditedCodecSide(side);
      if (side === "base85") setLiveBase85(value);
      else setLiveDecoded(value);
    },
    [],
  );

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
    } catch {
      setCodecStatus("Clipboard copy failed.");
    }
  }, [liveBase85, liveDecoded]);

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
        setCodecStatus("Item added to backpack. Use Download .sav on Select Save to export.");
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
    } else {
      appendToDecoded([token]);
    }
    setPendingAddPart(null);
    setPendingAddQty("1");
  }, [pendingAddPart, pendingAddQty, appendToDecoded, category, weaponMfgWtId, grenadeMfgId, shieldMfgId, repkitMfgId]);

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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border-2 border-[var(--color-accent)]/40 bg-[linear-gradient(135deg,rgba(24,28,34,0.95),rgba(24,28,34,0.75))] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              to="/beta"
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              ← Beta
            </Link>
            <h1 className="text-2xl font-semibold text-[var(--color-accent)] mt-1">
              Unified Item Builder
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Build or edit any item in one place. Uses our parts database and encode/decode APIs.
            </p>
            <div className="mt-3 rounded-lg border border-[var(--color-panel-border)] bg-black/20 px-3 py-2 text-xs text-[var(--color-text-muted)]">
              <strong className="text-[var(--color-text)]">How it works:</strong> For <strong>Weapon</strong>, pick manufacturer and weapon type, then use the dropdowns to choose parts (or &quot;Add other parts&quot; in any dropdown). For other categories, use Part Builder or Add other parts. The <strong>Current build parts</strong> panel shows what’s in the first line—reorder, remove, or edit quantity. Base85 updates automatically.
            </div>
          </div>
        </div>
      </section>

      {/* Item context */}
      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] p-3">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
          Item category
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`px-3 py-2 rounded-lg border text-sm min-h-[44px] touch-manipulation ${
                category === c.value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                  : "border-[var(--color-panel-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* Live codec: Base85 ⇄ Deserialized (between category and weapon build) */}
      <section className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Live codec (our encode/decode API)
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
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span>Flag</span>
            <select
              value={flagValue}
              onChange={(e) => setFlagValue(Number(e.target.value))}
              className="px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
            >
              <option value={1}>1 (Normal)</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={17}>17</option>
              <option value={33}>33</option>
              <option value={65}>65</option>
              <option value={129}>129</option>
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
          {!saveData && (
            <span className="text-xs text-[var(--color-text-muted)]">Load a save (Character → Select Save) to add to backpack.</span>
          )}
        </div>
      </section>

      {showCleanCodeDialog && (
        <CleanCodeDialog
          initialDecoded={liveDecoded}
          initialBase85={liveBase85}
          confirmPrompt="are you sure? This may alter the effects of your current code 1"
          onClose={() => setShowCleanCodeDialog(false)}
        />
      )}

      {/* Weapon: Manufacturer + Weapon type + Level + Seed + Add other parts + part slot dropdowns (collapsible on mobile) */}
      {category === "weapon" && weaponData && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>Weapon build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Pick manufacturer, weapon type, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; in any dropdown or the box below to add any part from the database.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
              <select
                value={weaponManufacturer}
                onChange={(e) => setWeaponManufacturer(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[10rem]"
              >
                {weaponData.manufacturers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Weapon type</label>
              <select
                value={weaponWeaponType}
                onChange={(e) => setWeaponWeaponType(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[10rem]"
              >
                {weaponTypesForManufacturer.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
              <input
                type="number"
                min={1}
                max={50}
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
                <button
                  type="button"
                  onClick={() => setShowAddPartsModal(true)}
                  className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                >
                  Add other parts
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                <button
                  type="button"
                  onClick={handleRandomWeapon}
                  className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                >
                  Random item
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">&nbsp;</label>
              <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] px-3 py-2 min-h-[44px] flex items-center min-w-[10rem]">
                <button
                  type="button"
                  onClick={() => setShowGodRollModal(true)}
                  disabled={!weaponData?.godrolls?.length}
                  className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  title={weaponData?.godrolls?.length ? "Pick a god roll preset" : "No god rolls loaded"}
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
                  onClick={handleAutoFill}
                  className="text-[var(--color-text)] hover:text-[var(--color-accent)] text-sm w-full text-left"
                  title="Fill empty part slots. Select manufacturer, type, level, rarity (and Legendary/Pearl type if applicable) first."
                >
                  Auto fill
                </button>
              </div>
            </div>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2">
              {(() => {
                const rarityStats = weaponData.rarityByMfgTypeId[weaponMfgWtId]?.map((r) => r.stat).filter(Boolean) ?? [];
                const hasLegendary = (weaponData.legendaryByMfgTypeId[weaponMfgWtId]?.length ?? 0) > 0;
                const hasPearl = (weaponData.pearlByMfgTypeId[weaponMfgWtId]?.length ?? 0) > 0;
                const rarityOptions = [...new Set(rarityStats)].sort();
                if (hasLegendary) rarityOptions.push("Legendary");
                if (hasPearl) rarityOptions.push("Pearl");
                const legendaryOptions = weaponData.legendaryByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
                const pearlOptions = weaponData.pearlByMfgTypeId[weaponMfgWtId]?.map((r) => `${r.partId} - ${r.description}`) ?? [];
                const elementalOptions = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
                return WEAPON_PART_ORDER.flatMap(({ key: partType, slots }) => {
                  const showLegendary = partType === "Legendary Type" && hasLegendary;
                  const showPearl = partType === "Pearl Type" && hasPearl;
                  if (partType === "Legendary Type" && !showLegendary) return [];
                  if (partType === "Pearl Type" && !showPearl) return [];
                  let opts: { partId: string; label: string }[];
                  if (partType === "Rarity") {
                    opts = rarityOptions.map((o) => ({ partId: o, label: o }));
                  } else if (partType === "Legendary Type") {
                    opts = legendaryOptions.map((o) => ({ partId: o, label: o }));
                  } else if (partType === "Pearl Type") {
                    opts = pearlOptions.map((o) => ({ partId: o, label: o }));
                  } else if (partType === "Element 1" || partType === "Element 2") {
                    opts = elementalOptions;
                  } else {
                    opts = weaponData.partsByMfgTypeId[weaponMfgWtId]?.[partType] ?? [];
                  }
                  return Array.from({ length: slots }, (_, i) => {
                    const key = slots > 1 ? `${partType}_${i}` : partType;
                    const value = weaponSlotSelections[key] ?? NONE;
                    return (
                      <div key={key} className="space-y-1">
                        <label className="block text-xs text-[var(--color-accent)]">
                          {slots > 1 ? `${partType} ${i + 1}` : partType}
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={value}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === ADD_OTHER_OPTION) {
                                setShowAddPartsModal(true);
                                return;
                              }
                              setWeaponSlotSelections((prev) => ({ ...prev, [key]: v }));
                              setWeaponSlotQuantities((prev) => ({ ...prev, [key]: "1" }));
                            }}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                          >
                            <option value={NONE}>{NONE}</option>
                            <option value={ADD_OTHER_OPTION}>Add other parts</option>
                            {opts.map((o) => (
                              <option key={o.partId + o.label} value={o.label}>{o.label}</option>
                            ))}
                          </select>
                          {value !== NONE && value !== ADD_OTHER_OPTION && (
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={weaponSlotQuantities[key] ?? "1"}
                              onChange={(e) => setWeaponSlotQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                              title="Quantity"
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                });
              })()}
            </div>
          )}
          </div>
        </details>
      )}

      {/* Grenade: Manufacturer + Level + Seed + Add other parts + part slot dropdowns */}
      {category === "grenade" && grenadeData && grenadeMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>Grenade build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <select
                  value={grenadeMfgId}
                  onChange={(e) => setGrenadeMfgId(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[10rem]"
                >
                  {grenadeData.mfgs.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={50}
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
            {showGrenadeUniversalPerksModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowGrenadeUniversalPerksModal(false)}>
                <div className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between shrink-0">
                    <h3 className="text-[var(--color-accent)] font-medium text-sm">Universal perks</h3>
                    <button type="button" onClick={() => setShowGrenadeUniversalPerksModal(false)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Close</button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] items-end">
                      <div>
                        <label className="block text-xs text-[var(--color-accent)] mb-1">Search</label>
                        <input
                          value={grenadeUniversalSearch}
                          onChange={(e) => setGrenadeUniversalSearch(e.target.value)}
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
                          value={grenadeUniversalApplyQty}
                          onChange={(e) => setGrenadeUniversalApplyQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.min(99, parseInt(grenadeUniversalApplyQty.trim(), 10) || 1));
                          if (grenadeUniversalSelectedIds.size === 0) return;
                          setGrenadeUniversalPerkQtyById((prev) => {
                            const next = { ...prev };
                            grenadeUniversalSelectedIds.forEach((id) => { next[id] = qty; });
                            return next;
                          });
                          setGrenadeUniversalSelectedIds(new Set());
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm min-h-[44px] touch-manipulation"
                        title="Set qty for all checked perks"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] overflow-hidden">
                      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--color-panel-border)]">
                        {grenadeData.universalPerks
                          .filter((p) => {
                            const q = grenadeUniversalSearch.trim().toLowerCase();
                            if (!q) return true;
                            const hay = `${p.partId} ${p.stat}`.toLowerCase();
                            return hay.includes(q);
                          })
                          .map((p) => {
                            const checked = grenadeUniversalSelectedIds.has(p.partId);
                            const currentQty = grenadeUniversalPerkQtyById[p.partId] ?? 0;
                            return (
                              <label key={p.partId} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(grenadeUniversalSelectedIds);
                                    if (e.target.checked) next.add(p.partId);
                                    else next.delete(p.partId);
                                    setGrenadeUniversalSelectedIds(next);
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--color-text)] break-words">{p.partId} - {p.stat}</div>
                                  {currentQty > 0 && (
                                    <div className="text-xs text-[var(--color-text-muted)]">In build: ×{currentQty}</div>
                                  )}
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
                const rarities = grenadeData.raritiesByMfg[grenadeMfgId] ?? [];
                const legendaryOptions = grenadeData.legendaryPerks.map((l) => ({ value: `${l.mfgId}:${l.partId}`, label: `${l.partId} - ${l.mfgName}: ${l.stat}` }));
                const elementOptions = grenadeData.element.map((e) => ({ partId: String(e.partId), label: `${e.partId} - ${e.stat}` }));
                const firmwareOptions = grenadeData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}` }));
                const mfgPerksList = grenadeData.mfgPerks[grenadeMfgId] ?? [];
                return GRENADE_PART_ORDER.flatMap(({ key: partType, slots }) => {
                  let opts: { partId: string; label: string; value?: string }[];
                  if (partType === "Rarity") {
                    opts = rarities.map((r) => ({ partId: String(r.id), label: r.label, value: r.label }));
                  } else if (partType === "Legendary") {
                    return [(
                      <div key="Legendary" className="space-y-1">
                        <label className="block text-xs text-[var(--color-accent)]">Legendary</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={grenadeSlotSelections["Legendary"] ?? NONE}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === ADD_OTHER_OPTION) { setShowAddPartsModal(true); return; }
                              setGrenadeSlotSelections((prev) => ({ ...prev, Legendary: v }));
                              setGrenadeSlotQuantities((prev) => ({ ...prev, Legendary: "1" }));
                            }}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                          >
                            <option value={NONE}>{NONE}</option>
                            <option value={ADD_OTHER_OPTION}>Add other parts</option>
                            {legendaryOptions.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          {(grenadeSlotSelections["Legendary"] ?? NONE) !== NONE && (grenadeSlotSelections["Legendary"] ?? NONE) !== ADD_OTHER_OPTION && (
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={grenadeSlotQuantities["Legendary"] ?? "1"}
                              onChange={(e) => setGrenadeSlotQuantities((prev) => ({ ...prev, Legendary: e.target.value }))}
                              className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                              title="Quantity"
                            />
                          )}
                        </div>
                      </div>
                    )];
                  } else if (partType === "Element") {
                    opts = elementOptions;
                  } else if (partType === "Firmware") {
                    opts = firmwareOptions;
                  } else if (partType === "Mfg Perk") {
                    opts = mfgPerksList.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}` }));
                  } else if (partType === "Universal Perk") {
                    return [(
                      <div key="Universal Perk" className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs text-[var(--color-accent)]">Universal perks (multi-select)</label>
                          <button
                            type="button"
                            onClick={() => setShowGrenadeUniversalPerksModal(true)}
                            className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm min-h-[44px] touch-manipulation"
                          >
                            Select perks…
                          </button>
                        </div>
                        <div className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2">
                          {Object.keys(grenadeUniversalPerkQtyById).length === 0 ? (
                            <div className="text-sm text-[var(--color-text-muted)]">None selected.</div>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(grenadeUniversalPerkQtyById)
                                .sort((a, b) => Number(a[0]) - Number(b[0]))
                                .map(([idStr, qty]) => {
                                  const id = Number(idStr);
                                  const perk = grenadeData.universalPerks.find((p) => p.partId === id);
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
                                          setGrenadeUniversalPerkQtyById((prev) => ({ ...prev, [id]: v }));
                                        }}
                                        className="w-16 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                                        title="Quantity"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGrenadeUniversalPerkQtyById((prev) => {
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
                  } else {
                    return [];
                  }
                  if (partType === "Legendary") return [];
                  if (partType === "Universal Perk") return [];
                  return Array.from({ length: slots }, (_, i) => {
                    const key = slots > 1 ? `${partType}_${i}` : partType;
                    const value = grenadeSlotSelections[key] ?? NONE;
                    const displayValue = partType === "Rarity" ? value : value;
                    return (
                      <div key={key} className="space-y-1">
                        <label className="block text-xs text-[var(--color-accent)]">
                          {slots > 1 ? `${partType} ${i + 1}` : partType}
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={displayValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === ADD_OTHER_OPTION) { setShowAddPartsModal(true); return; }
                              setGrenadeSlotSelections((prev) => ({ ...prev, [key]: v }));
                              setGrenadeSlotQuantities((prev) => ({ ...prev, [key]: "1" }));
                            }}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                          >
                            <option value={NONE}>{NONE}</option>
                            <option value={ADD_OTHER_OPTION}>Add other parts</option>
                            {opts.map((o) => (
                              <option key={(o as { value?: string }).value ?? o.partId + o.label} value={(o as { value?: string }).value ?? o.label}>{o.label}</option>
                            ))}
                          </select>
                          {value !== NONE && value !== ADD_OTHER_OPTION && partType !== "Rarity" && (
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={grenadeSlotQuantities[key] ?? "1"}
                              onChange={(e) => setGrenadeSlotQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-14 px-2 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px]"
                              title="Quantity"
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                });
              })()}
            </div>
          </div>
        </details>
      )}

      {/* Shield: Manufacturer + Level + Seed + Add other parts + part slot dropdowns */}
      {category === "shield" && shieldData && shieldMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>Shield build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <select
                  value={shieldMfgId}
                  onChange={(e) => setShieldMfgId(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[10rem]"
                >
                  {shieldData.mfgs.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({shieldData.mfgTypeById[m.id] ?? "Unknown"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={50}
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
                const legendaryOptions = shieldData.legendaryPerks.map((l) => ({ value: `${l.mfgId}:${l.partId}`, label: `${l.partId} - ${l.mfgName}: ${l.stat}` }));
                const elementOptions = shieldData.element.map((e) => ({ partId: String(e.partId), label: `${e.partId} - ${e.stat}` }));
                const firmwareOptions = shieldData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}` }));
                const shieldType = shieldData.mfgTypeById[shieldMfgId] ?? "Energy";
                return SHIELD_PART_ORDER.flatMap(({ key: partType }) => {
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
          </div>
        </details>
      )}

      {/* RepKit: Manufacturer + Level + Seed + Add other parts + part slot dropdowns */}
      {category === "repkit" && repkitData && repkitMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>RepKit build (dropdowns)</span>
            <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-0">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Pick manufacturer, level, and seed; then choose parts from each dropdown. Use &quot;Add other parts&quot; to add any part from the database.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Manufacturer</label>
                <select
                  value={repkitMfgId}
                  onChange={(e) => setRepkitMfgId(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm min-h-[44px] min-w-[10rem]"
                >
                  {repkitData.mfgs.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={50}
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

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div />

        {/* Side: Current build parts (collapsible on small screens) */}
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.55)] overflow-hidden group flex flex-col min-h-0" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none shrink-0">
            <span>Current build parts</span>
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
                className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2"
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
                    {descriptiveIdsGuidelines ? (
                      <>
                        <div className="text-sm text-[var(--color-text)] break-words">
                          {getPartLabel(
                            part,
                            partsByCode,
                            elementNameByPartId,
                            category === "shield"
                              ? shieldExtraLabels
                              : category === "grenade"
                              ? grenadeExtraLabels
                              : category === "repkit"
                              ? repkitExtraLabels
                              : null,
                          )}
                        </div>
                        <code className="text-xs font-mono text-[var(--color-text-muted)] break-all block mt-0.5">
                          {part.raw}
                        </code>
                      </>
                    ) : (
                      <code className="text-sm font-mono text-[var(--color-text)] break-all">
                        {part.raw}
                        {part.qty > 1 && <span className="ml-1 text-[var(--color-text-muted)]">×{part.qty}</span>}
                      </code>
                    )}
                    {descriptiveIdsGuidelines && part.qty > 1 && (
                      <span className="ml-1 text-xs text-[var(--color-text-muted)]">×{part.qty}</span>
                    )}
                    {editQtyIndex === i ? (
                      <div className="mt-2 flex items-center gap-2">
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
                      (part.prefix != null || part.partId != null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditQtyIndex(i);
                            setEditQtyValue(String(part.qty));
                          }}
                          className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
                        >
                          Edit qty
                        </button>
                      )
                    )}
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
              </div>
            ))}
          </div>
          </div>
        </details>
      </section>

      {/* Item guidelines (at bottom: legend, notes, Master Unlock, Descriptive IDs) */}
      <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.5)] overflow-hidden group">
        <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
          <span>Item guidelines</span>
          <span className="text-[var(--color-panel-border)] group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-0 border-t border-[var(--color-panel-border)] space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Checkbox legend:</strong> ✓ Checked = Required part is present | ☐ Unchecked = Required part is missing
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Base skin:</strong> The base skin comes from the rarity of the item. Changing the rarity will change the base skin. You can still customize the skin through customization options as well.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">Local manufacturer parts:</strong> Only parts from the local manufacturer will render on a gun in game. To make a complete model, you should first fulfill the guidelines with parts from the local manufacturer before adding parts from other manufacturers.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={masterUnlockGuidelines}
                onChange={(e) => setMasterUnlockGuidelines(e.target.checked)}
                className="rounded border-[var(--color-panel-border)]"
              />
              <span>🔓 Master Unlock: Allow parts from any typeId for all categories</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={descriptiveIdsGuidelines}
                onChange={(e) => setDescriptiveIdsGuidelines(e.target.checked)}
                className="rounded border-[var(--color-panel-border)]"
              />
              <span>📝 Descriptive IDs: Show part names alongside IDs in the parts list</span>
            </label>
          </div>
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
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 min-h-0">
              {filteredAddParts.map((p, idx) => (
                <button
                  key={`${p.code}-${idx}`}
                  type="button"
                  onClick={() => {
                    setPendingAddPart({ code: p.code, label: p.label });
                    setPendingAddQty("1");
                    setShowAddPartsModal(false);
                  }}
                  className="w-full text-left rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] px-3 py-2 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] min-h-[44px]"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs">{p.code}</span>
                    <span className="block truncate">{p.label}</span>
                    {(p.manufacturer || p.rarity || p.partType) && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {[p.manufacturer, p.rarity, p.partType].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {p.effect && (
                      <span className="text-xs text-[var(--color-accent)] mt-0.5 truncate" title={p.effect}>
                        {p.effect.length > 90 ? `…${p.effect.slice(-86)}` : p.effect}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {filteredAddParts.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] py-4">No parts match. Try different filters.</p>
              )}
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
    </div>
  );
}
