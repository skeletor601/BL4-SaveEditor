/**
 * Modded Shield Generator — builds a shield from a stock auto-fill base,
 * then layers legendary perks, universal perks, and power stacking.
 */

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

export function generateModdedShield(
  options: GenerateModdedShieldOptions = {},
): GenerateModdedShieldResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 60)));

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

  // ── Pick 2-4 random legendary perks (from different manufacturers) ──
  const shuffledLegs = [...SHIELD_LEGENDARIES].sort(() => Math.random() - 0.5);
  const legCount = randInt(2, 4);
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
  const legStackCount = { stable: randInt(5, 10), op: randInt(15, 30), insane: randInt(40, 80) }[modPowerMode];
  const legendaryStacks = chosenLegs.map((l) => {
    const m = l.code.match(/\{(\d+):(\d+)\}/);
    if (!m) return l.code;
    return `{${m[1]}:[${Array(legStackCount).fill(m[2]).join(" ")}]}`;
  });

  // ── Universal shield perks (type 246) — random selection ──
  const universalCount = { stable: randInt(6, 10), op: randInt(10, 16), insane: randInt(16, 24) }[modPowerMode];
  const shuffledUniversal = [...SHIELD_UNIVERSAL_IDS].sort(() => Math.random() - 0.5);
  const chosenUniversals = shuffledUniversal.slice(0, universalCount);
  // Stack each universal perk
  const universalStackCount = { stable: randInt(3, 6), op: randInt(8, 15), insane: randInt(15, 30) }[modPowerMode];
  const universalIds: number[] = [];
  for (const id of chosenUniversals) {
    for (let i = 0; i < universalStackCount; i++) universalIds.push(id);
  }
  const universalToken = universalIds.length > 0 ? `{246:[${universalIds.join(" ")}]}` : "";

  // ── Energy perks (type 248) ──
  const energyIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const energyCount = randInt(3, 6);
  const chosenEnergy = [...energyIds].sort(() => Math.random() - 0.5).slice(0, energyCount);
  const energyStackCount = { stable: randInt(3, 5), op: randInt(8, 12), insane: randInt(15, 25) }[modPowerMode];
  const energyPerkIds: number[] = [];
  for (const id of chosenEnergy) {
    for (let i = 0; i < energyStackCount; i++) energyPerkIds.push(id);
  }
  const energyToken = energyPerkIds.length > 0 ? `{248:[${energyPerkIds.join(" ")}]}` : "";

  // ── Armor perks (type 237) ──
  const armorIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const armorCount = randInt(3, 6);
  const chosenArmor = [...armorIds].sort(() => Math.random() - 0.5).slice(0, armorCount);
  const armorStackCount = { stable: randInt(3, 5), op: randInt(8, 15), insane: randInt(15, 30) }[modPowerMode];
  const armorPerkIds: number[] = [];
  for (const id of chosenArmor) {
    for (let i = 0; i < armorStackCount; i++) armorPerkIds.push(id);
  }
  const armorToken = armorPerkIds.length > 0 ? `{237:[${armorPerkIds.join(" ")}]}` : "";

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
    ...legendaryStacks,
    ...(universalToken ? [universalToken] : []),
    ...(energyToken ? [energyToken] : []),
    ...(armorToken ? [armorToken] : []),
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
  const capacityMult = 1 + (universalCount * universalStackCount * 0.02);
  const rechargeMult = 1 + (energyCount * energyStackCount * 0.015);
  const healthMult = 1 + (armorCount * armorStackCount * 0.01) + (legStackCount * chosenLegs.length * 0.005);

  const recipeName = chosenLegs.length > 0 ? chosenLegs.map((l) => l.name).join(" + ") : "Standard Shield";

  return {
    code: decoded,
    stats: {
      healthMultiplier: healthMult,
      capacityMultiplier: capacityMult,
      rechargeMultiplier: rechargeMult,
      legendaryPerks: legendaryNames,
      style: chosenLegs.length >= 3 ? "multi-legendary" : chosenLegs.length >= 2 ? "dual-legendary" : "focused",
    },
    recipeName,
  };
}
