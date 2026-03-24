/**
 * Modded Shield Generator — Type-Aware (Armor vs Energy)
 *
 * Rules from Terra:
 * 1. Pick a shield manufacturer → detect Armor or Energy type
 * 2. Legendaries must match the shield's type (Armor with Armor, Energy with Energy)
 * 3. Defense perks don't mix: Armor → {237}, Energy → {248}
 * 4. Universal {246} goes on everything
 * 5. Bininu → bias health perks; Vintage → skip armor segments
 * 6. Separate {246/237/248} blocks per perk ID (Terra's format)
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

/** Universal shield perks (type 246) — IDs 27-58 */
const SHIELD_UNIVERSAL_IDS = [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58];

/** Health-related universal IDs — boosted when Bininu is active */
const HEALTH_UNIVERSAL_IDS = [30, 50, 54]; // Divider, Healthy, Capacity

/** Armor-adjacent universal IDs — skipped when Vintage is active */
const ARMOR_ADJACENT_UNIVERSAL_IDS = [31, 32, 33, 34]; // armor-related universals

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

  // ── Step 2: Pick legendaries matching the shield's type only ──
  const legendaryPool = shieldType === "Armor" ? ARMOR_LEGENDARIES : ENERGY_LEGENDARIES;
  const shuffledLegs = [...legendaryPool].sort(() => Math.random() - 0.5);
  const legCount = randInt(2, 5);
  const chosenLegs: typeof SHIELD_LEGENDARIES = [];
  const usedMfgs = new Set<number>();
  for (const leg of shuffledLegs) {
    if (chosenLegs.length >= legCount) break;
    if (!usedMfgs.has(leg.mfg)) {
      chosenLegs.push(leg);
      usedMfgs.add(leg.mfg);
    }
  }
  const legendaryTokens = chosenLegs.map((l) => l.code);
  const legendaryNames = chosenLegs.map((l) => l.name);

  // Track special legendaries
  const hasBininu = chosenLegs.some((l) => l.name === "Bininu");
  const hasVintage = chosenLegs.some((l) => l.name === "Vintage");

  // ── Step 3: Stack legendaries (reduced 25%) ──
  const legStackCount = { stable: randInt(4, 11), op: randInt(15, 30), insane: randInt(38, 75) }[modPowerMode];
  const legendaryStacks = chosenLegs.map((l) => {
    const m = l.code.match(/\{(\d+):(\d+)\}/);
    if (!m) return l.code;
    return `{${m[1]}:[${Array(legStackCount).fill(m[2]).join(" ")}]}`;
  });

  // ── Step 4: Core universals — always present (reduced 25%) ──
  let coreStacks = { stable: randInt(19, 38), op: randInt(75, 188), insane: randInt(188, 375) }[modPowerMode];
  const universalTokens: string[] = [];

  // Bininu bonus: double Healthy + Divider stacks
  for (const id of HEALTH_UNIVERSAL_IDS) {
    const stacks = (hasBininu && (id === 30 || id === 50)) ? coreStacks * 2 : coreStacks;
    universalTokens.push(`{246:[${Array(stacks).fill(id).join(" ")}]}`);
  }

  // ── Step 5: Extra universals (reduced 25%) ──
  const extraCount = { stable: randInt(3, 6), op: randInt(6, 11), insane: randInt(11, 15) }[modPowerMode];
  let extraPool = SHIELD_UNIVERSAL_IDS.filter((id) => !HEALTH_UNIVERSAL_IDS.includes(id));

  // Vintage: exclude armor-adjacent universals
  if (hasVintage) {
    extraPool = extraPool.filter((id) => !ARMOR_ADJACENT_UNIVERSAL_IDS.includes(id));
  }

  const shuffledExtras = [...extraPool].sort(() => Math.random() - 0.5);
  const chosenExtras = shuffledExtras.slice(0, extraCount);
  const extraStackCount = { stable: randInt(2, 6), op: randInt(8, 19), insane: randInt(19, 56) }[modPowerMode];
  for (const id of chosenExtras) {
    if (extraStackCount <= 1) {
      universalTokens.push(`{246:${id}}`);
    } else {
      universalTokens.push(`{246:[${Array(extraStackCount).fill(id).join(" ")}]}`);
    }
  }

  // ── Step 6: Type-specific defense perks (NOT both) ──
  const defenseTokens: string[] = [];
  const defenseCount = { stable: randInt(2, 5), op: randInt(3, 6), insane: randInt(5, 8) }[modPowerMode];
  const defenseStackCount = { stable: randInt(4, 6), op: randInt(11, 19), insane: randInt(23, 38) }[modPowerMode];

  if (shieldType === "Armor") {
    // Vintage: skip armor segments entirely
    if (!hasVintage) {
      const armorIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      const chosenArmor = [...armorIds].sort(() => Math.random() - 0.5).slice(0, defenseCount);
      for (const id of chosenArmor) {
        if (defenseStackCount <= 1) {
          defenseTokens.push(`{237:${id}}`);
        } else {
          defenseTokens.push(`{237:[${Array(defenseStackCount).fill(id).join(" ")}]}`);
        }
      }
    }
  } else {
    // Energy shield → energy perks only
    const energyIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chosenEnergy = [...energyIds].sort(() => Math.random() - 0.5).slice(0, defenseCount);
    for (const id of chosenEnergy) {
      if (defenseStackCount <= 1) {
        defenseTokens.push(`{248:${id}}`);
      } else {
        defenseTokens.push(`{248:[${Array(defenseStackCount).fill(id).join(" ")}]}`);
      }
    }
  }

  // ── Toggles ──
  const ammoRegenToken = options.ammoRegen ? "{22:[68 68 68 68 68 68 68 68 68 68 68 68 68 68 68]}" : "";
  const movementSpeedTokens = options.movementSpeed ? ["{234:42}", "{234:62}"] : [];
  const fireworksTokens = options.fireworks ? [
    "{321:[6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6 6]}",
  ] : [];
  const immortalityTokens = options.immortality ? [
    "{246:[" + Array(250).fill(30).join(" ") + "]}",
    "{246:[" + Array(250).fill(54).join(" ") + "]}",
  ] : [];

  // ── Rarity: Pearl every 10th, otherwise Legendary ──
  const isPearl = Math.floor(Math.random() * 10) === 0;
  const rarityToken = isPearl ? pick(["{11:82}", "{25:82}"]) : pick(["{11:83}", "{25:83}"]);

  // ── ASSEMBLY ──
  const allParts = [
    rarityToken,
    ...legendaryTokens,
    ...legendaryStacks,
    ...universalTokens,
    ...defenseTokens,
    ...(ammoRegenToken ? [ammoRegenToken] : []),
    ...movementSpeedTokens,
    ...fireworksTokens,
    ...immortalityTokens,
  ];

  const componentStr = allParts.join(" ").replace(/\s{2,}/g, " ").trim();
  const decoded = `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${componentStr} |`;

  // ── Stats estimate ──
  const capacityMult = 1 + (HEALTH_UNIVERSAL_IDS.length * coreStacks * 0.02) + (chosenExtras.length * extraStackCount * 0.01);
  const rechargeMult = shieldType === "Energy" ? 1 + (defenseCount * defenseStackCount * 0.02) : 1;
  const healthMult = 1 + (shieldType === "Armor" && !hasVintage ? defenseCount * defenseStackCount * 0.01 : 0) + (legStackCount * chosenLegs.length * 0.005);

  const typeLabel = shieldType;
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
