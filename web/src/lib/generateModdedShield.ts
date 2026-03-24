/**
 * Modded Shield Generator — Terra's format: separate {246:[...]} blocks per perk ID,
 * core universals (Divider/Healthy/Capacity) always present with heavy stacking,
 * 2-5 random legendary perks from different manufacturers.
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
}

export interface GenerateModdedShieldResult {
  code: string;
  stats: ShieldStatsEstimate;
  recipeName: string;
}

const SHIELD_MFGS = [279, 283, 287, 293, 300, 306, 312, 321];
// Maliwan, Vladof, Tediore, Order, Ripper, Jakobs, Daedalus, Torgue

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Shield legendary perks — each has unique behavior */
const SHIELD_LEGENDARIES = [
  { code: "{279:1}", name: "Nucleosynthesis", mfg: 279 },
  { code: "{279:8}", name: "Psychosis", mfg: 279 },
  { code: "{283:6}", name: "Refreshments", mfg: 283 },
  { code: "{283:8}", name: "Bareknuckle", mfg: 283 },
  { code: "{283:11}", name: "Exoskeleton", mfg: 283 },
  { code: "{287:6}", name: "Shield Boi", mfg: 287 },
  { code: "{287:9}", name: "Bininu", mfg: 287 },
  { code: "{293:1}", name: "Glass", mfg: 293 },
  { code: "{293:2}", name: "Direct Current", mfg: 293 },
  { code: "{300:6}", name: "Short Circuit", mfg: 300 },
  { code: "{300:8}", name: "Overshield Eater", mfg: 300 },
  { code: "{300:11}", name: "Backdoor", mfg: 300 },
  { code: "{306:7}", name: "Vintage", mfg: 306 },
  { code: "{306:8}", name: "Shallot Shell", mfg: 306 },
  { code: "{312:6}", name: "Wings of Grace", mfg: 312 },
  { code: "{312:8}", name: "Power Play", mfg: 312 },
  { code: "{321:6}", name: "Bundled", mfg: 321 },
  { code: "{321:9}", name: "Sisyphusian", mfg: 321 },
];

/** Universal shield perks (type 246) — IDs 27-58 */
const SHIELD_UNIVERSAL_IDS = [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58];


export function generateModdedShield(
  options: GenerateModdedShieldOptions = {},
): GenerateModdedShieldResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 50)));

  // ── Header — random shield manufacturer prefix, no stock base ──
  const headerPrefix = pick([...SHIELD_MFGS]);
  const seed = String(randInt(1000, 9999));

  // ── Pick 2-5 random legendary perks (from different manufacturers) ──
  const shuffledLegs = [...SHIELD_LEGENDARIES].sort(() => Math.random() - 0.5);
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

  // ── Stack chosen legendaries for power ──
  const legStackCount = { stable: randInt(5, 15), op: randInt(20, 40), insane: randInt(50, 100) }[modPowerMode];
  const legendaryStacks = chosenLegs.map((l) => {
    const m = l.code.match(/\{(\d+):(\d+)\}/);
    if (!m) return l.code;
    return `{${m[1]}:[${Array(legStackCount).fill(m[2]).join(" ")}]}`;
  });

  // ── Universal shield perks (type 246) — SEPARATE block per perk ID (Terra's format) ──
  // Core stats ALWAYS included with heavy stacking (these give the shield actual capacity/health)
  const coreUniversalStacks = { stable: randInt(25, 50), op: randInt(100, 250), insane: randInt(250, 500) }[modPowerMode];
  const CORE_UNIVERSALS = [30, 50, 54]; // Divider, Healthy, Capacity — always present
  const universalTokens: string[] = [];
  for (const id of CORE_UNIVERSALS) {
    universalTokens.push(`{246:[${Array(coreUniversalStacks).fill(id).join(" ")}]}`);
  }

  // Extra universals — random bonus perks on top of the core
  const extraUniversalCount = { stable: randInt(4, 8), op: randInt(8, 14), insane: randInt(14, 20) }[modPowerMode];
  const extraUniversalIds = SHIELD_UNIVERSAL_IDS.filter((id) => !CORE_UNIVERSALS.includes(id));
  const shuffledExtra = [...extraUniversalIds].sort(() => Math.random() - 0.5);
  const chosenExtras = shuffledExtra.slice(0, extraUniversalCount);
  const extraStackCount = { stable: randInt(3, 8), op: randInt(10, 25), insane: randInt(25, 75) }[modPowerMode];
  for (const id of chosenExtras) {
    if (extraStackCount <= 1) {
      universalTokens.push(`{246:${id}}`);
    } else {
      universalTokens.push(`{246:[${Array(extraStackCount).fill(id).join(" ")}]}`);
    }
  }

  // ── Energy perks (type 248) — SEPARATE block per perk ID ──
  const energyIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const energyCount = randInt(3, 6);
  const chosenEnergy = [...energyIds].sort(() => Math.random() - 0.5).slice(0, energyCount);
  const energyStackCount = { stable: randInt(5, 8), op: randInt(12, 20), insane: randInt(25, 40) }[modPowerMode];
  const energyTokens: string[] = [];
  for (const id of chosenEnergy) {
    if (energyStackCount <= 1) {
      energyTokens.push(`{248:${id}}`);
    } else {
      energyTokens.push(`{248:[${Array(energyStackCount).fill(id).join(" ")}]}`);
    }
  }

  // ── Armor perks (type 237) — SEPARATE block per perk ID ──
  const armorIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const armorCount = randInt(3, 6);
  const chosenArmor = [...armorIds].sort(() => Math.random() - 0.5).slice(0, armorCount);
  const armorStackCount = { stable: randInt(5, 8), op: randInt(15, 25), insane: randInt(30, 50) }[modPowerMode];
  const armorTokens: string[] = [];
  for (const id of chosenArmor) {
    if (armorStackCount <= 1) {
      armorTokens.push(`{237:${id}}`);
    } else {
      armorTokens.push(`{237:[${Array(armorStackCount).fill(id).join(" ")}]}`);
    }
  }

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

  // ── Rarity: Pearl every 10th, otherwise Legendary ──
  // Terra's format: {11:82} for pearl rarity (first token)
  const isPearl = Math.floor(Math.random() * 10) === 0;
  const rarityToken = isPearl ? pick(["{11:82}", "{25:82}"]) : pick(["{11:83}", "{25:83}"]);

  // ── ASSEMBLY ──
  // Match Terra's format: rarity FIRST, then legendaries + universals + armor + energy + extras
  const allParts = [
    rarityToken,
    ...legendaryTokens,
    ...legendaryStacks,
    ...universalTokens,
    ...armorTokens,
    ...energyTokens,
    ...(ammoRegenToken ? [ammoRegenToken] : []),
    ...movementSpeedTokens,
    ...fireworksTokens,
    ...immortalityTokens,
  ];

  const componentStr = allParts.join(" ").replace(/\s{2,}/g, " ").trim();
  const decoded = `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${componentStr} |`;

  // ── Stats estimate ──
  const capacityMult = 1 + (CORE_UNIVERSALS.length * coreUniversalStacks * 0.02) + (chosenExtras.length * extraStackCount * 0.01);
  const rechargeMult = 1 + (chosenEnergy.length * energyStackCount * 0.015);
  const healthMult = 1 + (chosenArmor.length * armorStackCount * 0.01) + (legStackCount * chosenLegs.length * 0.005);

  const recipeName = chosenLegs.length > 0 ? chosenLegs.map((l) => l.name).join(" + ") : "Standard Shield";

  return {
    code: decoded,
    stats: {
      healthMultiplier: healthMult,
      capacityMultiplier: capacityMult,
      rechargeMultiplier: rechargeMult,
      legendaryPerks: legendaryNames,
      style: chosenLegs.length >= 4 ? "mega-legendary" : chosenLegs.length >= 3 ? "multi-legendary" : chosenLegs.length >= 2 ? "dual-legendary" : "focused",
    },
    recipeName,
  };
}
