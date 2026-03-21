/**
 * Modded Grenade Generator — builds a grenade from a stock auto-fill base,
 * then layers cross-inserts (shield, enhancement, class mod perks) and a
 * scaled visual recipe {245:[...]} block on top.
 *
 * Flow: auto-fill stock base → parse → append modded parts → final decoded string.
 */

import type { GrenadeVisualRecipe, GrenadeVisualRecipeGroup } from "./generateModdedWeapon";

// ── Grenade manufacturer IDs ──────────────────────────────────────────────────
const GRENADE_MFGS: number[] = [263, 267, 270, 272, 278, 291, 298, 311];
//                    MAL  JAK  DAE  ORD  RIP  VLA  TOR  TED

export interface GenerateModdedGrenadeOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
  /** Pre-built stock grenade decoded string from auto-fill. */
  stockBaseDecoded?: string;
  /** Grenade visual recipes (from grenade_visual_recipes.json). */
  grenadeVisualRecipes?: GrenadeVisualRecipe[];
  /** Skin value to apply. */
  skin?: string;
}

export interface GrenadeStatsEstimate {
  /** Estimated damage multiplier from perk stacks */
  damageMultiplier: number;
  /** Estimated radius multiplier from perk stacks */
  radiusMultiplier: number;
  /** Total grenade charges (base 2 + Overflow stacks) */
  charges: number;
  /** Cooldown multiplier (1.0 = normal, lower = faster) */
  cooldownMultiplier: number;
  /** Critical hit chance % */
  critChance: number;
  /** Lifesteal % */
  lifesteal: number;
  /** Status effect chance multiplier */
  statusChanceMultiplier: number;
  /** Knockback multiplier */
  knockbackMultiplier: number;
  /** Style tag from recipe */
  style: string;
  /** Perk count breakdown */
  perkCounts: Record<string, number>;
}

export interface GenerateModdedGrenadeResult {
  code: string;
  recipeName: string;
  stats: GrenadeStatsEstimate;
  isClaudeGrenade?: boolean;
  isChatGptGrenade?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (lo: number, hi: number) => Math.random() * (hi - lo) + lo;
const groupedToken = (prefix: number, ids: number[]): string => `{${prefix}:[${ids.join(" ")}]}`;

// IDs forbidden from the {245:[...]} block for standalone grenades.
// Overflow (70) and Express (71) are ALLOWED here — they're great on grenades (more charges, faster cooldown).
// Only blocked in the WEAPON generator's grenade reload block.
const GRENADE_245_FIRMWARE_WHITELIST = [5, 6, 10, 17, 20];
const GRENADE_245_FORBIDDEN = new Set([1,2,3,4,7,8,9,11,12,13,14,15,16,18,19,87,88]);
const GRENADE_PERK_HARD_CAP: Record<number, number> = { 73: 5, 76: 5 };

// Non-kinetic element IDs for {245:XX} element codes
const GRENADE_ELEMENTS = [24, 25, 26, 27, 28]; // Corrosive, Cryo, Fire, Radiation, Shock

/**
 * Parse the parts section from a decoded grenade string.
 * Returns individual token strings like "{245:[...]}", "{298:11}", "{42}", etc.
 */
function parseStockParts(decoded: string): string[] {
  const partsMatch = decoded.match(/\|\|\s*(.+?)\s*\|/);
  if (!partsMatch?.[1]) return [];
  const raw = partsMatch[1].trim();
  const tokens: string[] = [];
  const regex = /\{[^}]*(?:\[[^\]]*\][^}]*)?\}/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Extract the header (prefix, level, seed) from a decoded string.
 */
function parseHeader(decoded: string): { prefix: number; level: number; seed: string } | null {
  const m = decoded.match(/^(\d+)\s*,\s*0\s*,\s*1\s*,\s*(\d+)\s*\|\s*2\s*,\s*(\d+)\s*\|\|/);
  if (!m) return null;
  return { prefix: Number(m[1]), level: Number(m[2]), seed: m[3]! };
}

/** Parse all {245:[...]} tokens from a decoded string and count perk IDs. */
function countGrenadePerks(decoded: string): Record<number, number> {
  const counts: Record<number, number> = {};
  const regex = /\{245:\[([^\]]+)\]\}/g;
  let m;
  while ((m = regex.exec(decoded)) !== null) {
    const ids = m[1]!.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
    for (const id of ids) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

/** Calculate grenade stats from perk counts. */
function calculateGrenadeStats(perkCounts: Record<number, number>, style: string): GrenadeStatsEstimate {
  const c = (id: number) => perkCounts[id] ?? 0;

  // Damage: 72 (+13% per), 76 (+19% per), 80 (+25% per), 39 (+15% amp per)
  const damageMultiplier = Math.pow(1.13, c(72)) * Math.pow(1.19, c(76)) * Math.pow(1.25, c(80)) * Math.pow(1.15, c(39));

  // Radius: 73 (+25% per), 76 (+38% per), 81 (+38% per), 51 (+13% per bounce)
  const radiusMultiplier = Math.pow(1.25, c(73)) * Math.pow(1.38, c(76)) * Math.pow(1.38, c(81)) * Math.pow(1.13, c(51));

  // Charges: base 2 + Overflow (70) gives +1 per stack
  const charges = 2 + c(70);

  // Cooldown: Express (71) -12% per stack, Nuke (76) +25% per stack
  const cooldownMultiplier = Math.pow(0.88, c(71)) * Math.pow(1.25, c(76));

  // Crit: 75 (15% chance per stack), 69 (30% chance for 5s per stack)
  const critChance = Math.min(100, c(75) * 15 + c(69) * 30);

  // Lifesteal: 78 (+10% per stack)
  const lifesteal = c(78) * 10;

  // Status: 66 (+300% per stack), 74 (+10% per stack)
  const statusChanceMultiplier = 1 + (c(66) * 3) + (c(74) * 0.1);

  // Knockback: 77 (+50% per stack)
  const knockbackMultiplier = 1 + (c(77) * 0.5);

  // Named perk counts for display
  const PERK_NAMES: Record<number, string> = {
    29: "MIRV", 30: "Divider", 31: "Spring", 32: "Artillery", 33: "Singularity",
    34: "Lingering", 39: "Damage Amp", 40: "Tightly Packed", 42: "Micro MIRV",
    44: "Long Division", 46: "Pulling", 55: "Missiles", 57: "Mortar",
    59: "Gnawing", 60: "Collapsing", 63: "Pulsing", 65: "Fracture",
    66: "Alchemic", 67: "Bouncing Blade", 69: "Penetrator", 70: "Overflow",
    71: "Express", 72: "Explosive", 73: "Expansive", 74: "Hazardous",
    75: "Exacting", 76: "Nuke", 77: "Concussive", 78: "Bloodthirsty",
    79: "Merciless", 80: "Lethal", 81: "Wideload",
  };
  const namedCounts: Record<string, number> = {};
  for (const [id, count] of Object.entries(perkCounts)) {
    const name = PERK_NAMES[Number(id)];
    if (name && count > 0) namedCounts[name] = count;
  }

  return {
    damageMultiplier,
    radiusMultiplier,
    charges,
    cooldownMultiplier,
    critChance,
    lifesteal,
    statusChanceMultiplier,
    knockbackMultiplier,
    style,
    perkCounts: namedCounts,
  };
}

export function generateModdedGrenade(
  options: GenerateModdedGrenadeOptions = {},
): GenerateModdedGrenadeResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 60)));

  // ── Easter eggs ──────────────────────────────────────────────────────────────
  // Claude's Grenade (1/20): "Context Window" — all 5 Lingering + Singularity cascade
  // ChatGPT's Grenade (1/100): absolutely terrible, no perks, apologizes
  const eggRoll = Math.random();
  const isClaudeGrenade = eggRoll < 0.05;
  const isChatGptGrenade = !isClaudeGrenade && eggRoll < 0.06; // 1% chance

  // ── Stock base ──────────────────────────────────────────────────────────────
  let stockTokens: string[] = [];
  let headerPrefix = pick([...GRENADE_MFGS]);
  let seed = String(randInt(1000, 9999));

  if (options.stockBaseDecoded) {
    const header = parseHeader(options.stockBaseDecoded);
    if (header) {
      headerPrefix = header.prefix;
      seed = header.seed;
    }
    stockTokens = parseStockParts(options.stockBaseDecoded);
  }

  // ── Element: always non-kinetic ─────────────────────────────────────────────
  const chosenElement = isClaudeGrenade ? 27 : pick(GRENADE_ELEMENTS); // Claude = Radiation
  const elementToken = `{245:${chosenElement}}`;

  // ── Firmware: one whitelisted, 1-3 stacks ───────────────────────────────────
  const firmwareId = isClaudeGrenade ? 10 : pick(GRENADE_245_FIRMWARE_WHITELIST); // Claude = Deadeye
  const firmwareCount = isClaudeGrenade ? 3 : randInt(1, 3);
  const firmwareIds = Array(firmwareCount).fill(firmwareId);

  // ── Visual recipe {245:[...]} block ─────────────────────────────────────────
  const scaleForMode = { stable: 1.0, op: 1.5, insane: 2.0 }[modPowerMode];
  let recipeName = "Terra Fallback";
  let grenadePerkBlock: string;

  if (isChatGptGrenade) {
    // ChatGPT's Grenade — absolutely awful, barely functional
    recipeName = "ChatGPT's Grenade";
    grenadePerkBlock = "{245:[72]}"; // Single Explosive perk. That's it. One.
  } else if (isClaudeGrenade) {
    // "Context Window" — Singularity + all 5 Lingering elements + MIRV cascade
    recipeName = "Context Window";
    const s = (n: number) => Math.max(1, Math.round(n * scaleForMode * randFloat(0.9, 1.1)));
    const ids = [
      ...firmwareIds,
      ...Array(s(30)).fill(33),   // Singularity dominant
      ...Array(s(20)).fill(60),   // Collapsing
      ...Array(s(10)).fill(46),   // Pulling
      ...Array(s(8)).fill(29),    // MIRV
      ...Array(s(4)).fill(40),    // Tightly Packed
      ...Array(s(10)).fill(59),   // Gnawing DOT
      ...Array(s(15)).fill(34),   // Lingering Incendiary
      ...Array(s(10)).fill(35),   // Lingering Corrosive
      ...Array(s(10)).fill(36),   // Lingering Shock
      ...Array(s(10)).fill(37),   // Lingering Cryo
      ...Array(s(10)).fill(38),   // Lingering Radiation
      ...Array(s(12)).fill(21),   // Duration (Lingering)
      ...Array(s(8)).fill(63),    // Pulsing
      ...Array(s(6)).fill(65),    // Fracture pillars
      ...Array(s(20)).fill(72),   // Explosive
      ...Array(Math.min(5, s(5))).fill(73), // Expansive (cap 5)
      ...Array(s(5)).fill(69),    // Penetrator
      ...Array(s(5)).fill(39),    // Damage Amp
      ...Array(s(6)).fill(74),    // Hazardous
      ...Array(s(4)).fill(66),    // Alchemic
    ];
    grenadePerkBlock = `{245:[${ids.join(" ")}]}`;
  } else {
    const recipes = (options.grenadeVisualRecipes ?? []).filter((r) => r?.groups?.length > 0);
    if (recipes.length > 0) {
      const recipe = pick(recipes);
      recipeName = recipe.label;
      const groupTokens = recipe.groups.map((group: GrenadeVisualRecipeGroup) => {
        const ids: number[] = [];
        for (const entry of group.entries) {
          if (GRENADE_245_FORBIDDEN.has(entry.id)) continue;
          const rawCount = Math.max(1, Math.round(entry.n * scaleForMode * randFloat(0.8, 1.2)));
          const count = GRENADE_PERK_HARD_CAP[entry.id] !== undefined
            ? Math.min(rawCount, GRENADE_PERK_HARD_CAP[entry.id])
            : rawCount;
          for (let i = 0; i < count; i++) ids.push(entry.id);
        }
        return ids.length > 0 ? `{245:[${ids.join(" ")}]}` : null;
      }).filter((t): t is string => t !== null);

      if (groupTokens.length > 0) {
        // Inject firmware into first token
        const fwInject = firmwareIds.join(" ");
        groupTokens[0] = groupTokens[0]!.replace("{245:[", `{245:[${fwInject} `);
        // Append Overflow + Express to last token — more charges + faster cooldown on every grenade
        const overflowExpress = Array(randInt(8, 16)).fill(70).concat(Array(randInt(8, 16)).fill(71));
        const lastIdx = groupTokens.length - 1;
        groupTokens[lastIdx] = groupTokens[lastIdx]!.replace(/\]\}$/, ` ${overflowExpress.join(" ")}]}`);
        grenadePerkBlock = groupTokens.join(" ");
      } else {
        grenadePerkBlock = buildFallbackPerkBlock(firmwareIds, modPowerMode, scaleForMode);
      }
    } else {
      grenadePerkBlock = buildFallbackPerkBlock(firmwareIds, modPowerMode, scaleForMode);
    }
  }

  // ── Cross-inserts — modded grenades accept ALL part types ─────────────────
  // Shield, enhancement, class mod, weapon, heavy — everything stacks on grenades.

  // Shield body cross-insert {246:[...]} — adds shield behaviors
  const shieldBodyInsert = "{246:[22 22 23 23 26 26 25 25 24 24 31 39 40 45 46 58 58]}";

  // Shield manufacturer cross-inserts (various shield MFGs add different defensive behaviors)
  // Maliwan=279, Vladof=283, Tediore=287, Jakobs=306, Daedalus=312
  const tedioreShieldCount = { stable: randInt(30, 50), op: randInt(50, 80), insane: randInt(80, 120) }[modPowerMode];
  const tedioreShieldInsert = groupedToken(287, Array(tedioreShieldCount).fill(9));
  const vladofShieldCount = { stable: randInt(8, 15), op: randInt(15, 25), insane: randInt(20, 35) }[modPowerMode];
  const vladofShieldInsert = groupedToken(283, Array(vladofShieldCount).fill(pick([1, 2, 3, 5, 9])));

  // Enhancement cross-inserts — Terra's pattern from all 4 manufacturers
  const enhancementPattern = [1, 1, 9, 9, 2, 2, 3, 3];
  const daedalusEnhInsert = groupedToken(299, enhancementPattern);
  const jakobsEnhInsert = groupedToken(268, enhancementPattern);
  const maliwanEnhInsert = groupedToken(271, enhancementPattern);
  const tedioreEnhInsert = groupedToken(292, [9, 9, 2, 2, 3, 3, 9, 9, 9, 9, 9]);

  // Enhancement stat perks {247:[...]} — stat boosts from enhancement system
  const enhStatIds = [1, 2, 3, 9];
  const enhStatCount = { stable: randInt(4, 8), op: randInt(8, 14), insane: randInt(12, 20) }[modPowerMode];
  const enhStatInsert = groupedToken(247, Array.from({ length: enhStatCount }, () => pick(enhStatIds)));

  // Class mod perk cross-insert {234:[...]} — imports skill behaviors
  const classModPerkIds = [42, 42, 42, 42, 42, 21, 21, 21, 22, 22, 22, 23, 26, 28, 28, 28, 30, 30, 30, 31, 31, 31, 31];
  const classModPerkCount = { stable: randInt(15, 25), op: randInt(20, 35), insane: randInt(30, 50) }[modPowerMode];
  const classModInsert = groupedToken(234, Array.from({ length: classModPerkCount }, () => pick(classModPerkIds)));

  // Tediore Enhancement Divider {292:[9×10]}
  const dividerStacks = groupedToken(292, Array(10).fill(9));

  // Heavy weapon cross-inserts — MIRV/Two-Shot behavior on the grenade
  const heavyAccessoryInsert = groupedToken(289, [17, 16, 17]);

  // Weapon barrel cross-inserts — adds projectile behavior from weapon barrels
  // Pick a random weapon visual barrel effect to cross-insert
  const weaponBarrelCrossInserts = [
    "{7:64}",   // Convergence
    "{10:62}",  // Mantra
    "{22:68}",  // Onslaught
    "{275:30}", // DiscJockey
    "{273:35}", // Javelin
  ];
  const weaponBarrelInsert = pick(weaponBarrelCrossInserts);

  // Ammo efficiency cross-inserts (from weapon system)
  const freeChargerStacks = groupedToken(281, Array(randInt(12, 24)).fill(3));
  const angelsShareStacks = groupedToken(282, Array(randInt(8, 16)).fill(14));

  // ── Grenade anchors ─────────────────────────────────────────────────────────
  const torgueAnchor = "{298:11}";
  const vladofWaterfall = "{291:8}";

  // ── ASSEMBLY ────────────────────────────────────────────────────────────────
  const allParts = [
    // Stock base (from auto-fill — all required slots filled)
    ...stockTokens,

    // Element override
    elementToken,

    // Grenade perk block with anchors
    torgueAnchor,
    vladofWaterfall,
    grenadePerkBlock,
    vladofWaterfall,

    // Shield cross-inserts
    shieldBodyInsert,
    tedioreShieldInsert,
    vladofShieldInsert,

    // Enhancement cross-inserts (all manufacturers)
    daedalusEnhInsert,
    jakobsEnhInsert,
    maliwanEnhInsert,
    tedioreEnhInsert,
    enhStatInsert,
    dividerStacks,

    // Class mod perks
    classModInsert,

    // Heavy weapon accessories (MIRV/Two-Shot behavior)
    heavyAccessoryInsert,

    // Weapon barrel cross-insert (projectile behavior)
    weaponBarrelInsert,

    // Ammo efficiency stacks
    freeChargerStacks,
    angelsShareStacks,
  ];

  const componentStr = allParts.join(" ").replace(/\s{2,}/g, " ").trim();
  let decoded = `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${componentStr} |`;

  if (options.skin?.trim()) {
    const safe = options.skin.trim().replace(/"/g, '\\"');
    decoded = decoded.replace(/\|\s*$/, `| "c", "${safe}" |`);
  }

  // Calculate grenade stats from the generated code
  const perkCounts = countGrenadePerks(decoded);
  const style = isClaudeGrenade ? "hybrid" : isChatGptGrenade ? "none" : (options.grenadeVisualRecipes?.find((r) => r.label === recipeName)?.style ?? "hybrid");
  const stats = calculateGrenadeStats(perkCounts, style);

  return {
    code: decoded,
    recipeName,
    stats,
    ...(isClaudeGrenade ? { isClaudeGrenade: true } : {}),
    ...(isChatGptGrenade ? { isChatGptGrenade: true } : {}),
  };
}

/** Fallback perk block when no recipes are provided. */
function buildFallbackPerkBlock(
  firmwareIds: number[],
  _modPowerMode: string,
  _scaleForMode: number,
): string {
  const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const ids: number[] = [
    ...firmwareIds,
    ...Array(ri(16, 24)).fill(72),   // Explosive dominant
    ...Array(ri(10, 16)).fill(39),   // Damage Amp
    ...Array(ri(10, 16)).fill(75),   // Exacting
    ...[21, 22, 30, 34, 35, 36, 37, 38, 44, 45, 63, 64, 65, 69, 73, 77, 78, 79].flatMap(
      (id) => Array(ri(4, 8)).fill(id),
    ),
    ...Array(ri(8, 16)).fill(70),  // Overflow — extra grenade charges
    ...Array(ri(8, 16)).fill(71),  // Express — faster grenade cooldown
    24, 40, 53, 62, 66, 76, 77, 21,
  ].filter((id) => !GRENADE_245_FORBIDDEN.has(id));
  return `{245:[${ids.join(" ")}]}`;
}
