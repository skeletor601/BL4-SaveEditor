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

export interface GenerateModdedGrenadeResult {
  code: string;
  recipeName: string;
  isClaudeGrenade?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (lo: number, hi: number) => Math.random() * (hi - lo) + lo;
const groupedToken = (prefix: number, ids: number[]): string => `{${prefix}:[${ids.join(" ")}]}`;

// IDs forbidden from the {245:[...]} block — same rules as weapon generator.
const GRENADE_245_FIRMWARE_WHITELIST = [5, 6, 10, 17, 20];
const GRENADE_245_FORBIDDEN = new Set([1,2,3,4,7,8,9,11,12,13,14,15,16,18,19,70,71,87,88]);
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

export function generateModdedGrenade(
  options: GenerateModdedGrenadeOptions = {},
): GenerateModdedGrenadeResult {
  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 60)));

  // ── Claude's Grenade Easter egg — 1/20 chance ──────────────────────────────
  // "Context Window": Singularity pulls everything in, all 5 Lingering elements fire outward.
  const isClaudeGrenade = Math.random() < 0.05;

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

  if (isClaudeGrenade) {
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

  return {
    code: decoded,
    recipeName,
    ...(isClaudeGrenade ? { isClaudeGrenade: true } : {}),
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
    24, 40, 53, 62, 66, 76, 77, 21,
  ].filter((id) => !GRENADE_245_FORBIDDEN.has(id));
  return `{245:[${ids.join(" ")}]}`;
}
