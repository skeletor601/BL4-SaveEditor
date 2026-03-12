// @ts-nocheck
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
import SkinPreview from "@/components/weapon-toolbox/SkinPreview";

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

function buildDecodedFromShieldSelections(
  data: ShieldBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
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
return `${header} ${parts.join(" ")} |`;
}

function buildDecodedFromRepkitSelections(
  data: RepkitBuilderData,
  mfgId: number,
  level: number,
  seed: number,
  selections: Record<string, { label: string; qty: string }[]>,
  extraTokens: string[],
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
  return `${header} ${parts.join(" ")} |`;
}

export default function UnifiedItemBuilderPage() {
  const [category, setCategory] = useState<ItemCategory>("weapon");
  const [level, setLevel] = useState(50);
  const [seed, setSeed] = useState(1);
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

  // Weapon: list-based part selections (no caps), multi-select per category
  const [weaponData, setWeaponData] = useState<WeaponGenData | null>(null);
  const [weaponManufacturer, setWeaponManufacturer] = useState("");
  const [weaponWeaponType, setWeaponWeaponType] = useState("");
  const [showWeaponMfgModal, setShowWeaponMfgModal] = useState(false);
  const [showWeaponTypeModal, setShowWeaponTypeModal] = useState(false);
  const [weaponPartSelections, setWeaponPartSelections] = useState<Record<string, { label: string; qty: string }[]>>({});
  const [extraTokens, setExtraTokens] = useState<string[]>([]);
  const [showGodRollModal, setShowGodRollModal] = useState(false);
  const [autoFillWarning, setAutoFillWarning] = useState<string | null>(null);
  const [weaponPartPickerPartType, setWeaponPartPickerPartType] = useState<string | null>(null);
  const [weaponPartPickerChecked, setWeaponPartPickerChecked] = useState<Set<string>>(new Set());
  const [weaponPartPickerShowQty, setWeaponPartPickerShowQty] = useState(false);
  const [weaponPartPickerQty, setWeaponPartPickerQty] = useState("1");
  const [weaponSkinValue, setWeaponSkinValue] = useState("");

  // Grenade (when category === "grenade")
  const [grenadeData, setGrenadeData] = useState<GrenadeBuilderData | null>(null);
  const [grenadeMfgId, setGrenadeMfgId] = useState<number | null>(null);
  const [grenadePartSelections, setGrenadePartSelections] = useState<Record<string, { label: string; qty: string }[]>>({});
  const [grenadePartPickerPartType, setGrenadePartPickerPartType] = useState<string | null>(null);
  const [grenadePartPickerChecked, setGrenadePartPickerChecked] = useState<Set<string>>(new Set());
  const [grenadePartPickerShowQty, setGrenadePartPickerShowQty] = useState(false);
  const [grenadePartPickerQty, setGrenadePartPickerQty] = useState("1");
  const [showGrenadeMfgModal, setShowGrenadeMfgModal] = useState(false);
  const [grenadeExtraTokens, setGrenadeExtraTokens] = useState<string[]>([]);
  const [showGrenadeGodRollModal, setShowGrenadeGodRollModal] = useState(false);
  const [grenadeAutoFillWarning, setGrenadeAutoFillWarning] = useState<string | null>(null);

  // Shield (when category === "shield")
  const [shieldData, setShieldData] = useState<ShieldBuilderData | null>(null);
  const [shieldMfgId, setShieldMfgId] = useState<number | null>(null);
  const [showShieldMfgModal, setShowShieldMfgModal] = useState(false);
  const [shieldPartSelections, setShieldPartSelections] = useState<Record<string, { label: string; qty: string }[]>>({});
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
  const [showRepkitMfgModal, setShowRepkitMfgModal] = useState(false);
  const [repkitPartSelections, setRepkitPartSelections] = useState<Record<string, { label: string; qty: string }[]>>({});
  const [repkitPartPickerPartType, setRepkitPartPickerPartType] = useState<string | null>(null);
  const [repkitPartPickerChecked, setRepkitPartPickerChecked] = useState<Set<string>>(new Set());
  const [repkitPartPickerShowQty, setRepkitPartPickerShowQty] = useState(false);
  const [repkitPartPickerQty, setRepkitPartPickerQty] = useState("1");
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
    const decoded = buildDecodedFromWeaponPartSelections(
      weaponData,
      weaponMfgWtId,
      level,
      seed,
      weaponPartSelections,
      extraTokens,
      weaponSkinValue || undefined
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Weapon build updated; encoding…");
  }, [weaponData, weaponMfgWtId, level, seed, weaponPartSelections, extraTokens, weaponSkinValue]);

  useEffect(() => {
    if (category !== "weapon" || !weaponMfgWtId || !weaponData) return;
    rebuildWeaponDecoded();
  }, [category, weaponMfgWtId, weaponData, weaponPartSelections, extraTokens, weaponSkinValue, level, seed, rebuildWeaponDecoded]);

  const rebuildGrenadeDecoded = useCallback(() => {
    if (!grenadeData || grenadeMfgId == null) return;
    const decoded = buildDecodedFromGrenadeSelections(
      grenadeData,
      grenadeMfgId,
      level,
      seed,
      grenadePartSelections,
      grenadeExtraTokens,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Grenade build updated; encoding…");
  }, [grenadeData, grenadeMfgId, level, seed, grenadePartSelections, grenadeExtraTokens]);

  useEffect(() => {
    if (category !== "grenade" || grenadeMfgId == null || !grenadeData) return;
    rebuildGrenadeDecoded();
  }, [category, grenadeMfgId, grenadeData, grenadePartSelections, grenadeExtraTokens, level, seed, rebuildGrenadeDecoded]);

  const rebuildShieldDecoded = useCallback(() => {
    if (!shieldData || shieldMfgId == null) return;
    const decoded = buildDecodedFromShieldSelections(
      shieldData,
      shieldMfgId,
      level,
      seed,
      shieldPartSelections,
      shieldExtraTokens,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("Shield build updated; encoding…");
  }, [shieldData, shieldMfgId, level, seed, shieldPartSelections, shieldExtraTokens]);

  useEffect(() => {
    if (category !== "shield" || shieldMfgId == null || !shieldData) return;
    const hasShieldConfig =
      shieldExtraTokens.length > 0 ||
      Object.keys(shieldPartSelections).some((k) => (shieldPartSelections[k]?.length ?? 0) > 0);
    if (!hasShieldConfig) return;
    rebuildShieldDecoded();
  }, [
    category,
    shieldMfgId,
    shieldData,
    shieldExtraTokens,
    shieldPartSelections,
    level,
    seed,
    rebuildShieldDecoded,
  ]);

  const rebuildRepkitDecoded = useCallback(() => {
    if (!repkitData || repkitMfgId == null) return;
    const decoded = buildDecodedFromRepkitSelections(
      repkitData,
      repkitMfgId,
      level,
      seed,
      repkitPartSelections,
      repkitExtraTokens,
    );
    setLiveDecoded(decoded);
    setLastEditedCodecSide("decoded");
    setCodecStatus("RepKit build updated; encoding…");
  }, [repkitData, repkitMfgId, level, seed, repkitPartSelections, repkitExtraTokens]);

  useEffect(() => {
    if (category !== "repkit" || repkitMfgId == null || !repkitData) return;
    const hasRepkitConfig =
      repkitExtraTokens.length > 0 ||
      Object.keys(repkitPartSelections).some((k) => (repkitPartSelections[k]?.length ?? 0) > 0);
    if (!hasRepkitConfig) return;
    rebuildRepkitDecoded();
  }, [
    category,
    repkitMfgId,
    repkitData,
    repkitPartSelections,
    repkitExtraTokens,
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

  const handleRandomGrenade = useCallback(() => {
    if (!grenadeData?.mfgs?.length) return;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mfg = pick(grenadeData.mfgs);
    setGrenadeMfgId(mfg.id);
    setLevel(Math.floor(1 + Math.random() * 50));
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
    setLevel(Math.floor(1 + Math.random() * 50));
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
    setLevel(Math.floor(1 + Math.random() * 50));
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
      if (!legSel || legSel === NONE || !legendaryLabels.includes(legSel)) {
        setAutoFillWarning("Please select a Legendary type first, then click Auto fill.");
        return;
      }
    }
    if (raritySel === "Pearl" && pearlLabels.length) {
      const pearlList = weaponPartSelections["Pearl Type"] ?? [];
      const pearlSel = pearlList[0]?.label ?? "";
      if (!pearlSel || pearlSel === NONE || !pearlLabels.includes(pearlSel)) {
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

      {/* Weapon: Modding-tool style with collapsible part groups + multi-select per part type */}
      {category === "weapon" && weaponData && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>Weapon build</span>
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
                  const unlocked = masterUnlockGuidelines;
                  const mfgWtIds = unlocked && weaponData?.partsByMfgTypeId
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
                  const legendaryOptions: { partId: string; label: string }[] = unlocked
                    ? (() => {
                        const out: { partId: string; label: string }[] = [];
                        mfgWtIds.forEach((id) => {
                          const mfg = getMfgName(id);
                          (weaponData.legendaryByMfgTypeId[id] ?? []).forEach((r) => {
                            const base = `${r.partId} - ${r.description}`;
                            out.push({ partId: r.partId, label: withMfgIfNeeded(base, mfg) });
                          });
                        });
                        return out;
                      })()
                    : (weaponData.legendaryByMfgTypeId[weaponMfgWtId] ?? []).map((r) => {
                        const base = `${r.partId} - ${r.description}`;
                        return { partId: r.partId, label: withMfgIfNeeded(base, weaponManufacturer) };
                      });
                  const pearlOptions: { partId: string; label: string }[] = unlocked
                    ? (() => {
                        const out: { partId: string; label: string }[] = [];
                        mfgWtIds.forEach((id) => {
                          const mfg = getMfgName(id);
                          (weaponData.pearlByMfgTypeId[id] ?? []).forEach((r) => {
                            const base = `${r.partId} - ${r.description}`;
                            out.push({ partId: r.partId, label: withMfgIfNeeded(base, mfg) });
                          });
                        });
                        return out;
                      })()
                    : (weaponData.pearlByMfgTypeId[weaponMfgWtId] ?? []).map((r) => {
                        const base = `${r.partId} - ${r.description}`;
                        return { partId: r.partId, label: withMfgIfNeeded(base, weaponManufacturer) };
                      });
                  const elementalOptions = weaponData.elemental.map((e) => ({ partId: e.partId, label: `${e.partId} - ${e.stat}` }));
                  const getOpts = (partType: string): { partId: string; label: string }[] => {
                    if (partType === "Rarity") return rarityOptions.map((o) => ({ partId: o, label: o }));
                    if (partType === "Legendary Type") return legendaryOptions;
                    if (partType === "Pearl Type") return pearlOptions;
                    if (partType === "Element 1" || partType === "Element 2") return elementalOptions;
                    if (unlocked && weaponData.partsByMfgTypeId) {
                      const out: { partId: string; label: string }[] = [];
                      mfgWtIds.forEach((id) => {
                        const mfg = getMfgName(id);
                        (weaponData.partsByMfgTypeId[id]?.[partType] ?? []).forEach((p) => {
                          out.push({ partId: p.partId, label: withMfgIfNeeded(p.label, mfg) });
                        });
                      });
                      return out;
                    }
                    const parts = weaponData.partsByMfgTypeId[weaponMfgWtId]?.[partType] ?? [];
                    return parts.map((p) => ({ partId: p.partId, label: withMfgIfNeeded(p.label, weaponManufacturer) }));
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
                                    {entries.map((item, idx) => (
                                      <div key={`${partType}-${idx}-${item.label}`} className="part-item flex items-center gap-2 flex-wrap rounded-lg border border-[var(--color-panel-border)]/50 bg-[rgba(24,28,34,0.5)] p-2">
                                        <span className="flex-1 min-w-0 text-sm text-[var(--color-text)] truncate">{item.label}</span>
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
                                    ))}
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
                              <h3 className="text-[var(--color-accent)] font-medium text-sm">Select {weaponPartPickerPartType}</h3>
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
                                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30"
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
                                    <span className="text-sm text-[var(--color-text)]">{o.label}</span>
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
              }));
              const elementOptions = grenadeData.element.map((e) => ({ partId: String(e.partId), label: `${e.partId} - ${e.stat}` }));
              const firmwareOptions = grenadeData.firmware.map((f) => ({ partId: String(f.partId), label: `${f.partId} - ${f.stat}` }));
              const mfgPerksList = grenadeData.mfgPerks[grenadeMfgId] ?? [];
              const mfgPerkOptions = mfgPerksList.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}` }));
              const universalPerkOptions = grenadeData.universalPerks.map((p) => ({ partId: String(p.partId), label: `${p.partId} - ${p.stat}` }));

              const getOpts = (partType: string): { partId: string; label: string }[] => {
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
                                {entries.map((item, idx) => (
                                  <div key={`${partType}-${idx}-${item.label}`} className="part-item flex items-center gap-2 flex-wrap rounded-lg border border-[var(--color-panel-border)]/50 bg-[rgba(24,28,34,0.5)] p-2">
                                    <span className="flex-1 min-w-0 text-sm text-[var(--color-text)] truncate">{item.label}</span>
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
                                ))}
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
                              <label key={o.partId + o.label} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30">
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
                                <span className="text-sm text-[var(--color-text)]">{o.label}</span>
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
          </div>
        </details>
      )}

      {/* Shield: Manufacturer + Level + Seed + Add other parts + part groups (weapon-style) */}
      {category === "shield" && shieldData && shieldMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>Shield build</span>
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
                                  {entries.map((item, idx) => (
                                    <div key={`${partType}-${idx}-${item.label}`} className="part-item flex items-center gap-2 flex-wrap rounded-lg border border-[var(--color-panel-border)]/50 bg-[rgba(24,28,34,0.5)] p-2">
                                      <span className="flex-1 min-w-0 text-sm text-[var(--color-text)] truncate">{item.label}</span>
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
                                  ))}
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
                            {getOpts(shieldPartPickerPartType).map((o) => {
                              const info = (() => {
                                if (!descriptiveIdsGuidelines) return "";
                                const desc = String(o.description ?? "").trim();
                                if (desc) return desc;
                                // Fallback: show the "stat" portion from the label if present
                                const label = (o.label ?? "").trim();
                                const pieces = label.split(" - ");
                                if (pieces.length <= 1) return "";
                                return pieces.slice(1).join(" - ").trim();
                              })();
                              return (
                                <label key={o.partId + o.label} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30">
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
                                <span className="min-w-0">
                                  <span className="block text-sm text-[var(--color-text)]">{o.label}</span>
                                  {info && <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{info}</span>}
                                </span>
                              </label>
                              );
                            })}
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
          </div>
        </details>
      )}

      {/* RepKit: Manufacturer + Level + Seed + Add other parts + part groups (weapon-style) */}
      {category === "repkit" && repkitData && repkitMfgId != null && (
        <details className="rounded-xl border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.6)] overflow-hidden group" open>
          <summary className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--color-text-muted)] cursor-pointer list-none flex items-center justify-between min-h-[44px] touch-manipulation select-none">
            <span>RepKit build</span>
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

              const getOpts = (partType: string): { partId: string; label: string }[] => {
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
                                  {entries.map((item, idx) => (
                                    <div key={`${partType}-${idx}-${item.label}`} className="part-item flex items-center gap-2 flex-wrap rounded-lg border border-[var(--color-panel-border)]/50 bg-[rgba(24,28,34,0.5)] p-2">
                                      <span className="flex-1 min-w-0 text-sm text-[var(--color-text)] truncate">{item.label}</span>
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
                                  ))}
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
                              <label key={o.partId + o.label} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--color-accent)]/10 border-[var(--color-panel-border)]/30">
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
                                <span className="text-sm text-[var(--color-text)]">{o.label}</span>
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
          </div>
        </details>
      )}

      {/* RepKit: old dropdown-based UI (disabled, kept for reference) */}
      {category === "repkit" && repkitData && repkitMfgId != null && false && (
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
                className="rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.75)] p-2 flex flex-col gap-2"
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
                          : null,
                      );

                      if (!descriptiveIdsGuidelines) {
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
