/**
 * Modded Shield Generator — Type-Aware (Armor vs Energy)
 *
 * Rules from Terra:
 * 1. Pick a shield manufacturer → detect Armor or Energy type
 * 2. Legendaries must match the shield's type (Armor with Armor, Energy with Energy)
 *    EXCEPT Bininu which mixes freely
 * 3. Defense perks don't mix: Armor → {237}, Energy → {248}
 * 4. Universal {246} goes on everything — light stacking, many singles
 * 5. Bininu: NO Capacity (54), heavy self-stacking (50-100x), mix all legendaries
 * 6. Vintage: skip armor segments
 * 7. Legendary stacking IS the shield — more stacks of the primary = more shield
 * 8. Separate {246/237/248} blocks per perk ID (Terra's format)
 */

export interface GenerateModdedShieldOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
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
  shieldType: "Armor" | "Energy";
}

export interface GenerateModdedShieldResult {
  code: string;
  stats: ShieldStatsEstimate;
  recipeName: string;
}

// ── Constants ──

const SHIELD_MFGS = [279, 283, 287, 293, 300, 306, 312, 321];

const SHIELD_MFG_TYPE: Record<number, "Armor" | "Energy"> = {
  279: "Energy",   // Maliwan
  283: "Armor",    // Vladof
  287: "Armor",    // Tediore
  293: "Energy",   // Order
  300: "Energy",   // Ripper
  306: "Armor",    // Jakobs
  312: "Energy",   // Daedalus
  321: "Armor",    // Torgue
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** All shield legendary perks */
const SHIELD_LEGENDARIES = [
  // ── Armor manufacturer legendaries ──
  { code: "{283:6}", name: "Refreshments", mfg: 283, type: "Armor" as const },
  { code: "{283:8}", name: "Bareknuckle", mfg: 283, type: "Armor" as const },
  { code: "{283:11}", name: "Exoskeleton", mfg: 283, type: "Armor" as const },
  { code: "{287:6}", name: "Shield Boi", mfg: 287, type: "Armor" as const },
  { code: "{287:9}", name: "Bininu", mfg: 287, type: "Armor" as const },
  { code: "{306:7}", name: "Vintage", mfg: 306, type: "Armor" as const },
  { code: "{306:8}", name: "Shallot Shell", mfg: 306, type: "Armor" as const },
  { code: "{321:6}", name: "Bundled", mfg: 321, type: "Armor" as const },
  { code: "{321:9}", name: "Sisyphusian", mfg: 321, type: "Armor" as const },
  // ── Energy manufacturer legendaries ──
  { code: "{279:1}", name: "Nucleosynthesis", mfg: 279, type: "Energy" as const },
  { code: "{279:8}", name: "Psychosis", mfg: 279, type: "Energy" as const },
  { code: "{293:1}", name: "Glass", mfg: 293, type: "Energy" as const },
  { code: "{293:2}", name: "Direct Current", mfg: 293, type: "Energy" as const },
  { code: "{300:6}", name: "Short Circuit", mfg: 300, type: "Energy" as const },
  { code: "{300:8}", name: "Overshield Eater", mfg: 300, type: "Energy" as const },
  { code: "{300:11}", name: "Backdoor", mfg: 300, type: "Energy" as const },
  { code: "{312:6}", name: "Wings of Grace", mfg: 312, type: "Energy" as const },
  { code: "{312:8}", name: "Power Play", mfg: 312, type: "Energy" as const },
];

const ARMOR_LEGENDARIES = SHIELD_LEGENDARIES.filter((l) => l.type === "Armor");
const ENERGY_LEGENDARIES = SHIELD_LEGENDARIES.filter((l) => l.type === "Energy");

/** Armor-adjacent universal IDs — skipped when Vintage is active */
const ARMOR_ADJACENT_UNIVERSAL_IDS = [31, 32, 33, 34];

// ── Generator ──

export function generateModdedShield(
  options: GenerateModdedShieldOptions = {},
): GenerateModdedShieldResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 50)));

  // ── Step 1: Pick manufacturer + determine type ──
  const headerPrefix = pick([...SHIELD_MFGS]);
  const seed = String(randInt(1000, 9999));
  const shieldType = SHIELD_MFG_TYPE[headerPrefix] ?? "Energy";

  // ── Step 2: Decide if this is a Bininu build (20% chance on Armor shields) ──
  const isBininuBuild = shieldType === "Armor" && Math.random() < 0.20;
  const isVintageBuild = shieldType === "Armor" && !isBininuBuild && Math.random() < 0.15;

  // ── Step 3: Pick legendaries ──
  let chosenLegs: typeof SHIELD_LEGENDARIES = [];

  if (isBininuBuild) {
    // Bininu builds: Bininu is PRIMARY (heavy stacking), then mix ANY legendaries
    const bininu = SHIELD_LEGENDARIES.find((l) => l.name === "Bininu")!;
    chosenLegs.push(bininu);
    // Add 3-5 supporting legendaries from ANY type (Terra's code mixes freely)
    const supportPool = SHIELD_LEGENDARIES.filter((l) => l.name !== "Bininu");
    const shuffled = [...supportPool].sort(() => Math.random() - 0.5);
    const supportCount = randInt(3, 5);
    const usedMfgs = new Set<number>([287]); // Tediore already used
    for (const leg of shuffled) {
      if (chosenLegs.length >= supportCount + 1) break;
      if (!usedMfgs.has(leg.mfg)) {
        chosenLegs.push(leg);
        usedMfgs.add(leg.mfg);
      }
    }
  } else {
    // Normal: type-matched legendaries only
    const legendaryPool = shieldType === "Armor" ? ARMOR_LEGENDARIES : ENERGY_LEGENDARIES;
    const shuffled = [...legendaryPool].sort(() => Math.random() - 0.5);
    const legCount = randInt(2, 5);
    const usedMfgs = new Set<number>();

    // Vintage builds: ensure Vintage is included
    if (isVintageBuild) {
      const vintage = legendaryPool.find((l) => l.name === "Vintage");
      if (vintage) {
        chosenLegs.push(vintage);
        usedMfgs.add(vintage.mfg);
      }
    }

    for (const leg of shuffled) {
      if (chosenLegs.length >= legCount) break;
      if (!usedMfgs.has(leg.mfg)) {
        chosenLegs.push(leg);
        usedMfgs.add(leg.mfg);
      }
    }
  }

  const legendaryNames = chosenLegs.map((l) => l.name);
  const hasBininu = chosenLegs.some((l) => l.name === "Bininu");
  const hasVintage = chosenLegs.some((l) => l.name === "Vintage");

  // ── Step 4: Stack legendaries ──
  // PRIMARY legendary gets heavy stacking (this IS the shield)
  // Supporting legendaries get lighter stacking
  const legendaryStacks: string[] = [];

  for (let i = 0; i < chosenLegs.length; i++) {
    const leg = chosenLegs[i];
    const m = leg.code.match(/\{(\d+):(\d+)\}/);
    if (!m) continue;

    let stackCount: number;
    if (i === 0 && hasBininu) {
      // Bininu PRIMARY: massive stacking (50-100 at OP)
      stackCount = { stable: randInt(25, 50), op: randInt(50, 100), insane: randInt(100, 200) }[modPowerMode];
    } else if (i === 0) {
      // Normal PRIMARY legendary: heavy stacking
      stackCount = { stable: randInt(10, 20), op: randInt(20, 40), insane: randInt(40, 80) }[modPowerMode];
    } else {
      // Supporting legendaries: lighter
      stackCount = { stable: randInt(3, 8), op: randInt(5, 25), insane: randInt(15, 50) }[modPowerMode];
    }

    legendaryStacks.push(`{${m[1]}:[${Array(stackCount).fill(m[2]).join(" ")}]}`);
  }

  // ── Step 5: Universal perks {246} — light stacking, many singles (Terra's format) ──
  const universalTokens: string[] = [];

  if (hasBininu) {
    // Bininu: NO Capacity (54) — kills health regen
    // Healthy (50) + Divider (30) at moderate levels, plus light extras
    const healthyStacks = { stable: randInt(10, 20), op: randInt(20, 30), insane: randInt(30, 50) }[modPowerMode];
    universalTokens.push(`{246:[${Array(healthyStacks).fill(50).join(" ")}]}`);
    // Elements 22-26 at 10 each (Terra's pattern)
    for (const id of [22, 23, 24, 25, 26]) {
      universalTokens.push(`{246:[${Array(10).fill(id).join(" ")}]}`);
    }
    // Medium stacks
    const mediumIds = [32, 35, 36, 55, 56];
    for (const id of mediumIds) {
      const stacks = { stable: randInt(5, 10), op: randInt(10, 25), insane: randInt(20, 40) }[modPowerMode];
      universalTokens.push(`{246:[${Array(stacks).fill(id).join(" ")}]}`);
    }
    // Light stacks
    const lightIds = [37, 38];
    for (const id of lightIds) {
      universalTokens.push(`{246:[${Array(10).fill(id).join(" ")}]}`);
    }
    // Singles (Terra's pattern — lots of single perk activators)
    const singleIds = [5, 27, 28, 39, 40, 43, 44, 45, 46, 47, 48, 51, 52, 57, 58];
    const chosenSingles = [...singleIds].sort(() => Math.random() - 0.5).slice(0, randInt(8, 12));
    for (const id of chosenSingles) {
      universalTokens.push(`{246:${id}}`);
    }
  } else {
    // Normal shields: core stats + extras
    // Divider (30), Healthy (50), Capacity (54) — core
    const coreStacks = { stable: randInt(15, 30), op: randInt(30, 60), insane: randInt(60, 120) }[modPowerMode];
    for (const id of [30, 50, 54]) {
      universalTokens.push(`{246:[${Array(coreStacks).fill(id).join(" ")}]}`);
    }
    // Elements 22-26
    for (const id of [22, 23, 24, 25, 26]) {
      universalTokens.push(`{246:[${Array(10).fill(id).join(" ")}]}`);
    }
    // Medium extras
    let extraPool = [27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 52, 53, 55, 56, 57, 58];
    if (hasVintage) {
      extraPool = extraPool.filter((id) => !ARMOR_ADJACENT_UNIVERSAL_IDS.includes(id));
    }
    const extraCount = { stable: randInt(6, 10), op: randInt(10, 16), insane: randInt(14, 22) }[modPowerMode];
    const shuffledExtras = [...extraPool].sort(() => Math.random() - 0.5).slice(0, extraCount);
    const extraStacks = { stable: randInt(2, 6), op: randInt(5, 15), insane: randInt(10, 25) }[modPowerMode];
    for (const id of shuffledExtras) {
      if (extraStacks <= 2) {
        universalTokens.push(`{246:${id}}`);
      } else {
        universalTokens.push(`{246:[${Array(extraStacks).fill(id).join(" ")}]}`);
      }
    }
  }

  // ── Step 6: Type-specific defense perks (NOT both) ──
  const defenseTokens: string[] = [];

  if (hasBininu) {
    // Bininu: light energy perks (mostly singles like Terra's code)
    const energyPerkIds = [1, 6, 7, 8, 9, 12, 13, 27]; // Terra's range
    const chosenEnergy = [...energyPerkIds].sort(() => Math.random() - 0.5).slice(0, randInt(4, 7));
    for (const id of chosenEnergy) {
      if (id === 7) {
        // Stack {248:[7x10]} like Terra
        defenseTokens.push(`{248:[${Array(10).fill(id).join(" ")}]}`);
      } else {
        defenseTokens.push(`{248:${id}}`);
      }
    }
  } else if (shieldType === "Armor" && !hasVintage) {
    const armorIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const defenseCount = { stable: randInt(2, 5), op: randInt(3, 6), insane: randInt(5, 8) }[modPowerMode];
    const chosenArmor = [...armorIds].sort(() => Math.random() - 0.5).slice(0, defenseCount);
    const defenseStackCount = { stable: randInt(4, 6), op: randInt(11, 19), insane: randInt(23, 38) }[modPowerMode];
    for (const id of chosenArmor) {
      if (defenseStackCount <= 1) defenseTokens.push(`{237:${id}}`);
      else defenseTokens.push(`{237:[${Array(defenseStackCount).fill(id).join(" ")}]}`);
    }
  } else if (shieldType === "Energy") {
    const energyIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const defenseCount = { stable: randInt(2, 5), op: randInt(3, 6), insane: randInt(5, 8) }[modPowerMode];
    const chosenEnergy = [...energyIds].sort(() => Math.random() - 0.5).slice(0, defenseCount);
    const defenseStackCount = { stable: randInt(4, 6), op: randInt(11, 19), insane: randInt(23, 38) }[modPowerMode];
    for (const id of chosenEnergy) {
      if (defenseStackCount <= 1) defenseTokens.push(`{248:${id}}`);
      else defenseTokens.push(`{248:[${Array(defenseStackCount).fill(id).join(" ")}]}`);
    }
  }
  // Vintage: no defense tokens at all

  // ── Toggles ──
  const ammoRegenToken = options.ammoRegen ? "{22:[68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68 68]}" : "";
  const movementSpeedTokens = options.movementSpeed ? ["{234:42}", "{234:62}"] : [];
  const fireworksTokens = options.fireworks ? [
    "{321:[6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6]}",
  ] : [];
  const immortalityTokens = options.immortality ? [
    "{246:[" + Array(250).fill(30).join(" ") + "]}",
    "{246:[" + Array(250).fill(50).join(" ") + "]}",
  ] : [];

  // ── Rarity: Pearl every 10th, otherwise Legendary ──
  const isPearl = Math.floor(Math.random() * 10) === 0;
  const rarityToken = isPearl ? pick(["{11:82}", "{25:82}"]) : pick(["{11:83}", "{25:83}"]);

  // ── Bininu extras: class mod perks + Daedalus cross-insert (Terra's pattern) ──
  const bininuExtras: string[] = [];
  if (hasBininu) {
    // Heavy class mod perk 41 stacking (Terra uses 349x)
    const perk41Count = { stable: randInt(50, 100), op: randInt(150, 250), insane: randInt(250, 400) }[modPowerMode];
    bininuExtras.push(`{234:[${Array(perk41Count).fill(41).join(" ")}]}`);
    // Class mod perk 61
    const perk61Count = { stable: randInt(20, 40), op: randInt(50, 99), insane: randInt(99, 150) }[modPowerMode];
    bininuExtras.push(`{234:[${Array(perk61Count).fill(61).join(" ")}]}`);
    // Daedalus Repkit cross-insert {277:[1x50]}
    bininuExtras.push(`{277:[${Array(50).fill(1).join(" ")}]}`);
  }

  // ── ASSEMBLY ──
  const allParts = [
    rarityToken,
    ...legendaryStacks,
    ...universalTokens,
    ...defenseTokens,
    ...(ammoRegenToken ? [ammoRegenToken] : []),
    ...movementSpeedTokens,
    ...bininuExtras,
    ...fireworksTokens,
    ...immortalityTokens,
  ];

  const componentStr = allParts.join(" ").replace(/\s{2,}/g, " ").trim();
  const decoded = `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${componentStr} |`;

  // ── Stats estimate ──
  const totalLegStacks = legendaryStacks.reduce((sum, t) => {
    const m = t.match(/\[([^\]]+)\]/);
    return sum + (m ? m[1].split(/\s+/).filter(Boolean).length : 1);
  }, 0);
  const capacityMult = 1 + (totalLegStacks * 0.02);
  const rechargeMult = 1 + (defenseTokens.length * 0.05);
  const healthMult = 1 + (totalLegStacks * 0.01);

  const typeLabel = hasBininu ? "Bininu" : hasVintage ? "Vintage" : shieldType;
  const recipeName = `${typeLabel}: ${legendaryNames.join(" + ")}`;

  return {
    code: decoded,
    stats: {
      healthMultiplier: healthMult,
      capacityMultiplier: capacityMult,
      rechargeMultiplier: rechargeMult,
      legendaryPerks: legendaryNames,
      style: chosenLegs.length >= 4 ? "mega-legendary" : chosenLegs.length >= 3 ? "multi-legendary" : chosenLegs.length >= 2 ? "dual-legendary" : "focused",
      shieldType,
    },
    recipeName,
  };
}
