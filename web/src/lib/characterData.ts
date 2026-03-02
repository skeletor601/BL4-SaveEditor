/**
 * Read/write character and currency data from save object (matches desktop get_character_data / apply_character_and_currency_changes).
 */

import type { SaveData } from "@/contexts/SaveContext";

export interface CharacterFormData {
  charName: string;
  difficulty: string;
  level: string;
  xp: string;
  specLevel: string;
  specPoints: string;
  cash: string;
  eridium: string;
}

export interface CurrencyPaths {
  cash: (string | number)[] | null;
  eridium: (string | number)[] | null;
}

export interface CharacterData extends CharacterFormData {
  curPaths: CurrencyPaths;
}

function walkFind(
  node: unknown,
  targetKeys: string[],
  path: (string | number)[] = []
): (string | number)[] | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "object" && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (targetKeys.includes(k)) return path.concat(k);
      const found = walkFind(obj[k], targetKeys, path.concat(k));
      if (found?.length) return found;
    }
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = walkFind(node[i], targetKeys, path.concat(i));
      if (found?.length) return found;
    }
  }
  return null;
}

export function findCurrencyPaths(data: SaveData): CurrencyPaths {
  const cash = (data.currencies && typeof data.currencies === "object" && "cash" in (data.currencies as object))
    ? ["currencies", "cash"]
    : walkFind(data, ["cash", "money"]);
  const eridium = (data.currencies && typeof data.currencies === "object" && "eridium" in (data.currencies as object))
    ? ["currencies", "eridium"]
    : walkFind(data, ["eridium", "vaultcoin"]);
  return {
    cash: cash ?? null,
    eridium: eridium ?? null,
  };
}

export function getCharacterData(data: SaveData | null): CharacterData | null {
  if (!data || typeof data !== "object") return null;
  const state = (data.state as Record<string, unknown>) ?? data;
  if (typeof state !== "object") return null;

  const curPaths = findCurrencyPaths(data);
  const charName = String(state.char_name ?? state.charName ?? "").trim();
  const difficulty = String(state.player_difficulty ?? state.playerDifficulty ?? "").trim();
  const expList = state.experience;
  let level = "";
  let xp = "";
  let specLevel = "";
  let specPoints = "";
  if (Array.isArray(expList)) {
    const charExp = expList.find(
      (item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "Character"
    ) as Record<string, unknown> | undefined;
    const specExp = expList.find(
      (item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "Specialization"
    ) as Record<string, unknown> | undefined;
    if (charExp) {
      level = String(charExp.level ?? "");
      xp = String(charExp.points ?? "");
    }
    if (specExp) {
      specLevel = String(specExp.level ?? "");
      specPoints = String(specExp.points ?? "");
    }
  }

  let cash = "";
  let eridiumVal = "";
  if (curPaths.cash) {
    try {
      let cur: unknown = data;
      for (const p of curPaths.cash) cur = (cur as Record<string, unknown>)[p as string];
      cash = String(cur ?? "");
    } catch {
      cash = "";
    }
  }
  if (curPaths.eridium) {
    try {
      let cur: unknown = data;
      for (const p of curPaths.eridium) cur = (cur as Record<string, unknown>)[p as string];
      eridiumVal = String(cur ?? "");
    } catch {
      eridiumVal = "";
    }
  }

  return {
    charName,
    difficulty,
    level,
    xp,
    specLevel,
    specPoints,
    cash,
    eridium: eridiumVal,
    curPaths,
  };
}

function maybeInt(x: string): number {
  const s = String(x).trim();
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

function setByPath(root: SaveData, path: (string | number)[], value: unknown): void {
  let cur: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    cur = (cur as Record<string, unknown>)[key as string];
  }
  (cur as Record<string, unknown>)[path[path.length - 1] as string] = value;
}

/**
 * Returns a new save object with character/currency fields updated. Does not mutate original.
 */
export function applyCharacterData(saveData: SaveData, form: CharacterFormData): SaveData {
  const state = (saveData.state as Record<string, unknown>) ?? saveData;
  const curPaths = findCurrencyPaths(saveData);

  const nextState = { ...state };
  nextState.char_name = form.charName;
  nextState.player_difficulty = form.difficulty;

  const expListRaw = Array.isArray(nextState.experience) ? nextState.experience : [];
  const expList = expListRaw.map((item: unknown) =>
    typeof item === "object" && item !== null ? { ...(item as Record<string, unknown>) } : item
  );
  let charExp = expList.find(
    (item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "Character"
  ) as Record<string, unknown> | undefined;
  let specExp = expList.find(
    (item: unknown) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "Specialization"
  ) as Record<string, unknown> | undefined;

  if (!charExp) {
    charExp = { type: "Character", level: maybeInt(form.level), points: maybeInt(form.xp) };
    expList.push(charExp);
  } else {
    charExp.level = maybeInt(form.level);
    charExp.points = maybeInt(form.xp);
  }
  if (!specExp) {
    specExp = { type: "Specialization", level: maybeInt(form.specLevel), points: maybeInt(form.specPoints) };
    expList.push(specExp);
  } else {
    specExp.level = maybeInt(form.specLevel);
    specExp.points = maybeInt(form.specPoints);
  }
  nextState.experience = expList;

  const nextSave: SaveData = { ...saveData };
  nextSave.state = nextState;

  if (curPaths.cash && form.cash.trim()) setByPath(nextSave, curPaths.cash, maybeInt(form.cash));
  if (curPaths.eridium && form.eridium.trim()) setByPath(nextSave, curPaths.eridium, maybeInt(form.eridium));

  return nextSave;
}
