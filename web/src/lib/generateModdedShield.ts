/**
 * Modded Shield Generator — recipe-driven shield assembly.
 * Picks a random recipe from shield_recipes.json, then layers
 * toggle overrides (ammo regen, movement speed, fireworks, immortality).
 */

import shieldRecipesJson from "../../public/data/shield_recipes.json";

export interface ShieldRecipe {
  id: string;
  label: string;
  notes: string;
  legendaries: string[];
  universal: string;
  armor: string;
  energy: string;
  extras: string[];
}

export interface GenerateModdedShieldOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
  stockBaseDecoded?: string;
  skin?: string;
  skinOptions?: Array<{ label: string; value: string }>;
  /** Special toggles — all can stack together */
  ammoRegen?: boolean;
  movementSpeed?: boolean;
  fireworks?: boolean;
  immortality?: boolean;
}

export interface ShieldStatsEstimate {
  healthMultiplier: number;
  capacityMultiplier: number;
  rechargeMultiplier: number;
  legendaryPerks: string[];
  style: string;
}

export interface GenerateModdedShieldResult {
  code: string;
  stats: ShieldStatsEstimate;
  recipeName: string;
}

const SHIELD_MFGS = [279, 283, 287, 293, 300, 306, 312, 321];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Map perk code → human name for badge display */
const PERK_NAMES: Record<string, string> = {
  "279:1": "Nucleosynthesis", "279:8": "Psychosis",
  "283:6": "Refreshments", "283:8": "Bareknuckle", "283:11": "Exoskeleton",
  "287:6": "Shield Boi", "287:9": "Bininu",
  "293:1": "Glass", "293:2": "Direct Current",
  "300:6": "Short Circuit", "300:8": "Overshield Eater", "300:11": "Backdoor",
  "306:7": "Vintage", "306:8": "Shallot Shell",
  "312:6": "Wings of Grace", "312:8": "Power Play",
  "321:6": "Bundled", "321:9": "Sisyphusian",
};

const SHIELD_RECIPES: ShieldRecipe[] = shieldRecipesJson as ShieldRecipe[];

function parseHeader(decoded: string): { prefix: number; level: number; seed: string } | null {
  const m = decoded.match(/^(\d+)\s*,\s*0\s*,\s*1\s*,\s*(\d+)\s*\|\s*2\s*,\s*(\d+)\s*\|\|/);
  if (!m) return null;
  return { prefix: Number(m[1]), level: Number(m[2]), seed: m[3]! };
}

function parseStockParts(decoded: string): string[] {
  const partsMatch = decoded.match(/\|\|\s*(.+?)\s*\|/);
  if (!partsMatch?.[1]) return [];
  const tokens: string[] = [];
  const regex = /\{[^}]*(?:\[[^\]]*\][^}]*)?\}/g;
  let match;
  while ((match = regex.exec(partsMatch[1])) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** Extract unique legendary perk names from legendary token strings */
function extractLegendaryNames(legendaryTokens: string[]): string[] {
  const names = new Set<string>();
  for (const token of legendaryTokens) {
    // Match {MFG:PERK} or {MFG:[PERK PERK ...]}
    const singleMatch = token.match(/\{(\d+):(\d+)\}/);
    if (singleMatch) {
      const key = `${singleMatch[1]}:${singleMatch[2]}`;
      if (PERK_NAMES[key]) names.add(PERK_NAMES[key]);
      continue;
    }
    const arrayMatch = token.match(/\{(\d+):\[([^\]]+)\]\}/);
    if (arrayMatch) {
      const mfg = arrayMatch[1];
      const ids = [...new Set(arrayMatch[2].split(/\s+/).map((s) => s.trim()).filter(Boolean))];
      for (const id of ids) {
        const key = `${mfg}:${id}`;
        if (PERK_NAMES[key]) names.add(PERK_NAMES[key]);
      }
    }
  }
  return [...names];
}

/** Count total IDs in a {type:[...]} token for stats estimation */
function countIdsInToken(token: string): number {
  if (!token) return 0;
  const m = token.match(/\[([^\]]+)\]/);
  if (!m) return token.match(/\{\d+:\d+\}/) ? 1 : 0;
  return m[1].split(/\s+/).filter(Boolean).length;
}

/** Scale a recipe's tokens by power mode multiplier */
function scaleToken(token: string, scale: number): string {
  if (!token) return "";
  // For {type:[id id id ...]} tokens, multiply the count
  const m = token.match(/^\{(\d+):\[([^\]]+)\]\}$/);
  if (m) {
    const type = m[1];
    const ids = m[2].split(/\s+/).filter(Boolean);
    // Get unique IDs and their counts
    const idCounts = new Map<string, number>();
    for (const id of ids) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    const scaled: string[] = [];
    for (const [id, count] of idCounts) {
      const newCount = Math.max(1, Math.round(count * scale));
      for (let i = 0; i < newCount; i++) scaled.push(id);
    }
    return `{${type}:[${scaled.join(" ")}]}`;
  }
  return token;
}

export function generateModdedShield(
  options: GenerateModdedShieldOptions = {},
): GenerateModdedShieldResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 60)));

  // ── Power mode scale factors (recipes are written at ~OP level) ──
  const modeScale = { stable: 0.4, op: 1.0, insane: 2.5 }[modPowerMode];

  // ── Stock base ──
  let stockTokens: string[] = [];
  let headerPrefix = pick([...SHIELD_MFGS]);
  let seed = String(randInt(1000, 9999));

  if (options.stockBaseDecoded) {
    const header = parseHeader(options.stockBaseDecoded);
    if (header) {
      headerPrefix = header.prefix;
      seed = header.seed;
    }
    stockTokens = parseStockParts(options.stockBaseDecoded);
  }

  // ── Pick a random recipe ──
  const recipe = pick(SHIELD_RECIPES);

  // ── Scale legendary tokens by power mode ──
  const legendaryTokens = recipe.legendaries.map((t) => scaleToken(t, modeScale));
  const legendaryNames = extractLegendaryNames(recipe.legendaries);

  // ── Scale universal/armor/energy tokens ──
  const universalToken = scaleToken(recipe.universal, modeScale);
  const armorToken = scaleToken(recipe.armor, modeScale);
  const energyToken = scaleToken(recipe.energy, modeScale);

  // ── Scale extras (but keep single-value tokens like {234:42} as-is) ──
  const extraTokens = recipe.extras.map((t) => {
    if (t.includes("[")) return scaleToken(t, modeScale);
    return t;
  });

  // ── Toggle: Ammo Regen — {22:[68x15]} Vladof SMG barrel acc ──
  const ammoRegenToken = options.ammoRegen ? "{22:[68 68 68 68 68 68 68 68 68 68 68 68 68 68 68]}" : "";

  // ── Toggle: Movement Speed — {234:42} + {234:62} class mod perks ──
  const movementSpeedTokens = options.movementSpeed ? ["{234:42}", "{234:62}"] : [];

  // ── Toggle: Fireworks — Grand Finale on Kill {321:[6x50]} Torgue Bundled ──
  const fireworksTokens = options.fireworks ? [
    "{321:[6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6]}",
  ] : [];

  // ── Toggle: Immortality — {246:[30x250]} Divider + {246:[54x250]} Capacity massive stacking ──
  const immortalityTokens = options.immortality ? [
    "{246:[" + Array(250).fill(30).join(" ") + "]}",
    "{246:[" + Array(250).fill(54).join(" ") + "]}",
  ] : [];

  // ── Skin ──
  let chosenSkin = options.skin?.trim() || "";
  if (!chosenSkin && options.skinOptions?.length) {
    const allSkins = options.skinOptions.filter(
      (s) => !/christmas/i.test(String(s.label ?? "")) && !/christmas/i.test(String(s.value ?? "")),
    );
    const nonShiny = allSkins.filter((s) => !String(s.value ?? "").includes("Shiny"));
    const ultimate = allSkins.filter((s) => String(s.value ?? "").includes("Shiny_Ultimate"));
    const shiny = allSkins.filter((s) => String(s.value ?? "").includes("Shiny") && !String(s.value ?? "").includes("Shiny_Ultimate"));
    const skinPool = [
      ...nonShiny,
      ...(shiny.length > 0 ? [shiny[Math.floor(Math.random() * shiny.length)]!] : []),
      ...ultimate,
    ];
    if (skinPool.length > 0) chosenSkin = pick(skinPool).value;
  }

  // ── Pearl rarity every 10th ──
  const isPearl = Math.floor(Math.random() * 10) === 0;
  const pearlToken = isPearl ? pick(["{11:82}", "{25:82}"]) : "";

  // ── ASSEMBLY ──
  const allParts = [
    ...(pearlToken ? [pearlToken] : []),
    ...stockTokens,
    ...legendaryTokens,
    ...(universalToken ? [universalToken] : []),
    ...(energyToken ? [energyToken] : []),
    ...(armorToken ? [armorToken] : []),
    ...extraTokens,
    ...(ammoRegenToken ? [ammoRegenToken] : []),
    ...movementSpeedTokens,
    ...fireworksTokens,
    ...immortalityTokens,
  ];

  const componentStr = allParts.join(" ").replace(/\s{2,}/g, " ").trim();
  let decoded = `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${componentStr} |`;

  if (chosenSkin) {
    const safe = chosenSkin.replace(/"/g, '\\"');
    decoded = decoded.replace(/\|\s*$/, `| "c", "${safe}" |`);
  }

  // ── Stats estimate ──
  const universalCount = countIdsInToken(universalToken);
  const armorCount = countIdsInToken(armorToken);
  const energyCount = countIdsInToken(energyToken);
  const legCount = legendaryTokens.reduce((sum, t) => sum + countIdsInToken(t), 0);

  const capacityMult = 1 + (universalCount * 0.015);
  const rechargeMult = 1 + (energyCount * 0.02);
  const healthMult = 1 + (armorCount * 0.01) + (legCount * 0.005);

  return {
    code: decoded,
    stats: {
      healthMultiplier: healthMult,
      capacityMultiplier: capacityMult,
      rechargeMultiplier: rechargeMult,
      legendaryPerks: legendaryNames,
      style: legendaryNames.length >= 4 ? "mega-legendary" : legendaryNames.length >= 3 ? "multi-legendary" : legendaryNames.length >= 2 ? "dual-legendary" : "focused",
    },
    recipeName: recipe.label,
  };
}
