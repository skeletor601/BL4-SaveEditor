/**
 * Shared modded weapon generator. Returns a single-line decoded weapon string.
 * Used by Unified Item Builder (in-place) and can be used by Weapon Edit view.
 *
 * ========== LOCKED RULES – DO NOT REVERT OR REMOVE ==========
 * 1. Magazine: ONLY Vladof 50-round {18:14}. No pickMagazineToken(), no COV/Order.
 * 2. Stat stacks: NEVER use code 27:75 (exclude via isExcludedStatCode).
 * 3. Exemplar: {9:[28 32 40 55 59 62...]} — two separate groups per gun, cycling those IDs. Terra confirmed great.
 * 4. Grenade 245 block: NEVER use IDs 1–20 (firmware), 70 (Overflow), 71 (Express), 87–88 (firmware).
 *    Safe perk range: 21–81 excluding 70 & 71. Enforced by GRENADE_245_FORBIDDEN set (runtime filter).
 * 5. Barrels: when allowedBarrelEntries is set, only those barrels; same for allowedUnderbarrelEntries.
 *    Terra's rule: MAX 5 unique barrel codes per gun. Slots = visual(1)+primary(1)+extra_same_prefix(0-2)+cross(0-1).
 *    Extra barrels are stacked as grouped tokens (amplifies effect); cross-prefix limited to 0-1 unique code.
 * 6. Underbarrel: exclude malswitch (UNDERBARREL_EXCLUDED). When allowedUnderbarrelEntries set, use only that list.
 * 7. Skin: use options.skin or random from skinOptions (non-Christmas). Always add skin when chosenSkin is set.
 * 8. Tediore Reload no stat changes: always include when available. Underbarrel then foregrip (one only).
 * 9. Full-auto string (Terra-confirmed exact values): {281:[3×36]} Free Charger, {275:[23×9]} Heat Exchange, {26:[30×3]} Order SR mag — makes any gun fully automatic.
 *    Also: {282:14} Angel's Share, {286:1} Ventilator (variable stacks).
 * 10. Seamstress extras when {26:77} underbarrel detected: {13:70} + {11:75} Anarchy (12 pellets) + {11:81} Eigenburst barrel.
 * 11. Pearl rarity: ALWAYS put {11:82} (Eigenburst rarity) as the absolute FIRST token. Rarity = first token wins.
 * 12. Class mod perks cross-insert: {234:[21-31...]} — class mod skill perk IDs embedded in weapon, imports skill behaviors.
 * 13. Stacked Vladof mags: {18:[14×N]} instead of single {18:14}. Stack 8-16 times by mode.
 * 14. Split Rowan's + fire rate: separate grouped tokens {27:[15×N]} and {27:[75×N]} instead of mixed.
 * 15. Pearl rarity pool: pick from [{11:82},{25:82}] — confirmed codes. First token always wins rarity.
 * 16. Extreme same-prefix stacking: pick a random barrel/body acc from own prefix, repeat 30-80×.
 * 17. {292:[9×10]} Tediore Enhancement Divider — exactly 10 stacks on every gun. Terra-confirmed rule.
 * 18. {11:75} near end on every gun — Terra confirmed: enables player flight.
 * 19. Terra's perfect gun (type 20, seed 420) rules — all confirmed:
 *     {298:11} Torgue grenade anchor before {245:[...]} block (alongside {291:8}).
 *     {287:[9×150]} Tediore Shield cross-insert. {234:[42×50]} class mod perk 42 dominant.
 *     {299/268/271:[1 1 9 9 2 2 3 3]} enhancement cross-inserts (all 3 manufacturers).
 *     {292:[9 9 2 2 3 3 9 9 9 9 9]} Tediore Enhancement (variant pattern).
 *     {246:[22-58...]} Shield body cross-insert. {14:[78 3 3...]} stability group with part 78.
 *     Grenade perk 72 is the dominant visual (42 stacks). New heavy perk IDs: 34,39,45,64,77,78.
 *     {289:16}={MAL_HW MIRV, spawns 3 orbs}, {289:2}={MAL_HW MIRV dXa variant} — both in {289} block = main gun visuals.
 *     {289:[17 16 2 17...]} Two-Shot + both MIRV variants. {26:77} Seamstress = alt fire + wild reload.
 *     Tediore MIRV cross-inserts ({13:21},{2:71},...) from all weapon types — pick N, adds MIRV to shots.
 * See docs/MODDED_WEAPON_GENERATOR_RULES.md for full list. Do not "restore" or "uncomment" {9:[...]} or other magazines.
 * ========== END LOCKED RULES ==========
 */

export interface WeaponEditPartRow {
  mfgWtId: string;
  manufacturer: string;
  weaponType: string;
  partId: string;
  partType: string;
  string: string;
  stat: string;
}

export interface WeaponEditElementalRow {
  elementalId: string;
  partId: string;
  stat: string;
}

export interface WeaponEditData {
  parts: WeaponEditPartRow[];
  elemental: WeaponEditElementalRow[];
}

export interface UniversalDbPartCode {
  code: string;
  partType?: string;
  rarity?: string;
  itemType?: string;
  weaponType?: string;
  manufacturer?: string;
  statText?: string;
  string?: string;
  partName?: string;
  uniqueEffect?: boolean;
  visualUniqueBarrel?: boolean;
}

/** Manually curated list: name + code, e.g. { name: "Onslaught", code: "{22:68}" }. Load from /data/visual_heavy_barrels.json */
export interface VisualBarrelEntry {
  name: string;
  code: string;
  visual?: boolean;
}
/** Manually curated list for underbarrel slot. Load from /data/desirable_underbarrels.json */
export interface DesirableUnderbarrelEntry {
  name: string;
  code: string;
}
/** Underbarrel part (actual underbarrel). partType pairs with accessories. */
export interface DesirableUnderbarrelPart {
  name: string;
  code: string;
  partType?: string;
}
/** Underbarrel accessory; must be used with a part that has the same partType. */
export interface DesirableUnderbarrelAccessory {
  name: string;
  code: string;
  partType: string;
}
export type DesirableUnderbarrelData =
  | DesirableUnderbarrelEntry[]
  | { parts: DesirableUnderbarrelPart[]; accessories?: DesirableUnderbarrelAccessory[] };

/** A single entry in a grenade visual recipe group: perk id repeated n times (at insane scale). */
export interface GrenadeVisualRecipeEntry {
  id: number;
  n: number;
}
/** One {245:[...]} token worth of entries. Order is ABSOLUTE. */
export interface GrenadeVisualRecipeGroup {
  entries: GrenadeVisualRecipeEntry[];
}
/**
 * Named visual recipe. Each group produces one {245:[...]} token.
 * Stack counts are scaled by mode (stable=1.0×, op=2.0×, insane=3.5×) with ±20% jitter, min 1.
 * Recipe n values represent the STABLE baseline. Effects are multiplicative so higher modes amplify significantly.
 * Elemental code swaps on any recipe produce entirely new visuals — only the 245 block changes.
 */
export interface GrenadeVisualRecipe {
  id: string;
  label: string;
  notes?: string;
  /** Style tag(s) — used to pick complementary perks to append after the recipe sequence.
   * "lingering" | "singularity" | "artillery" | "mirv" | "hybrid" */
  style?: string;
  groups: GrenadeVisualRecipeGroup[];
}

export interface GenerateModdedWeaponOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
  skin?: string;
  /** When set, force the generator to use this mfgWtId prefix (from the weapon builder dropdown). */
  forcedPrefix?: number;
  /** When set, a code is picked at random and pasted to the left of the first barrel. Edit web/public/data/visual_heavy_barrels.json */
  visualBarrelEntries?: VisualBarrelEntry[];
  /** When set, only barrels in this list are used (primary + extra + cross). Edit web/public/data/allowed_barrels.json. */
  allowedBarrelEntries?: Array<{ name: string; code: string }>;
  /** When set, ONLY underbarrels (and accessories) from this list are used; no fallback to edit data. Edit web/public/data/allowed_underbarrels.json. Same shape as desirableUnderbarrelData. */
  allowedUnderbarrelEntries?: DesirableUnderbarrelData;
  /** When set, underbarrel is picked from this list instead of from edit data. Edit web/public/data/desirable_underbarrels.json. Ignored if allowedUnderbarrelEntries is set. */
  desirableUnderbarrelEntries?: DesirableUnderbarrelData;
  /** When set, grenade block wrapper uses only these codes (actual legendary grenades from web/public/data/legendary_grenades.json). Format: { "name": "...", "code": "{prefix:part}" }. */
  legendaryGrenadeEntries?: Array<{ name: string; code: string }>;
  /** When skin is not set, a random skin is picked from this list (excluding Christmas). */
  skinOptions?: Array<{ label: string; value: string }>;
  /**
   * Named visual recipes from web/public/data/grenade_visual_recipes.json.
   * When set, one recipe is picked at random and used to drive the {245:[...]} perk block.
   * Each group in the recipe becomes one {245:[...]} token. Scales by modPowerMode.
   * Falls back to the hardcoded Terra pattern when not provided.
   */
  grenadeVisualRecipes?: GrenadeVisualRecipe[];
  /**
   * Special mode for the modded weapon generator.
   * - "grenade-reload": always add the grenade block; never add Rowan's Charge (27:75) stacks.
   * - "inf-ammo": always add 7× Rowan's Charge (27:75) stacks; skip the grenade block entirely.
   * - undefined/null: default probabilistic behaviour (tediore check + 35% chance).
   */
  specialMode?: "grenade-reload" | "inf-ammo" | null;
  /**
   * Pre-built stock weapon decoded string from auto-fill.
   * When provided, the generator uses this as the base (all stock slots filled) and
   * appends modded parts on top. This guarantees 100% spawn rate since auto-fill always
   * produces a valid weapon. Format: "prefix, 0, 1, level| 2, seed|| {parts...} |"
   */
  stockBaseDecoded?: string;
}

type ParsedComponent =
  | string
  | { type: "skin"; id: number; raw: string }
  | { type: "elemental"; id: number; subId: number; raw: string }
  | { type: "group"; id: number; subIds: number[]; raw: string }
  | { type: "part"; mfgId: number; id: number; raw: string }
  | { type: "simple"; id: number; raw: string };

function parseCodePair(code: string): { prefix: number; part: number } | null {
  const s = String(code ?? "").trim();
  const m2 = s.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
  if (m2) return { prefix: Number(m2[1]), part: Number(m2[2]) };
  const m1 = s.match(/^\{\s*(\d+)\s*\}$/);
  if (m1) {
    const n = Number(m1[1]);
    return { prefix: n, part: n };
  }
  return null;
}

function parseComponentString(componentStr: string): ParsedComponent[] {
  const out: ParsedComponent[] = [];
  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|"c",\s*(\d+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(componentStr)) !== null) {
    if (match.index > lastIndex) {
      out.push(componentStr.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (match[3]) {
      out.push({ type: "skin", id: Number(match[3]), raw });
    } else {
      const outerId = Number(match[1]);
      const inner = match[2];
      if (inner) {
        if (inner.includes("[")) {
          const subIds = inner
            .replace("[", "")
            .replace("]", "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((v) => Number(v));
          out.push({ type: "group", id: outerId, subIds, raw });
        } else {
          if (outerId === 1) {
            out.push({ type: "elemental", id: outerId, subId: Number(inner), raw });
          } else {
            out.push({ type: "part", mfgId: outerId, id: Number(inner), raw });
          }
        }
      } else {
        out.push({ type: "simple", id: outerId, raw });
      }
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < componentStr.length) {
    out.push(componentStr.slice(lastIndex));
  }
  return out.filter((c) => (typeof c === "string" ? c.trim() !== "" : true));
}

// Legacy enhancement prefixes (no longer used after simplified rules but kept for reference).
// const ENHANCEMENT_PREFIXES = [234, 246, 268, 271, 275, 281, 287, 292, 299] as const;
// const GUN_BENEFICIAL_PREFIXES = [234, 246, 247] as const;

/**
 * Underbarrels to NEVER pick. Denylist approach — everything not excluded is allowed.
 * Excluded: Atlas tracker darts/grenades, malswitch, elemental switch, ammo switcher,
 * weapon-specific mode switches with no cross-weapon value, placeholder DB entries.
 */
const UNDERBARREL_EXCLUDED =
  /\batlas\b|\btracker\b|\bmalswitch\b|\belemental\s+switch\b|\bmaliwan\s+elemental\b|\bammo\s+switch\b|\bdaedalus\s+ammo\b|\bvertical\s+mode\b|\blegendary\s+perk\b|dad_ar_underbarrel_04|\bknife\s*launcher\b|\bknife\b|\bharpoon\b|\bmeathook\b|\bgravity\b/i;

function isAllowedUnderbarrel(row: WeaponEditPartRow): boolean {
  const t = `${(row.stat ?? "").trim()} ${(row.string ?? "").trim()}`.toLowerCase();
  return !UNDERBARREL_EXCLUDED.test(t);
}

export interface DpsEstimate {
  /** Barrel display name (e.g. "F.A.N.G.") */
  barrelName: string;
  /** Base damage per shot (damage × pellets) at Level 50 Common from barrel String */
  baseDamagePerShot: number;
  /** Base fire rate in shots/sec from barrel String */
  baseFireRate: number;
  /** Base DPS = baseDamagePerShot × baseFireRate (no mods) */
  baseDps: number;
  /** Number of +Damage stacks added by the generator */
  damageStackCount: number;
  /** Number of +Crit Damage stacks added */
  critStackCount: number;
  /** Number of +Fire Rate stacks added */
  fireRateStackCount: number;
  /** Estimated DPS with all stacks (3% per +Damage stack, 2% per +FR stack, 3% crit at 30% crit rate) */
  estimatedDps: number;
}

export interface GenerateModdedWeaponResult {
  code: string;
  dps: DpsEstimate;
  /** True when the 1/20 Claude's Gun Easter egg was rolled. */
  isClaudeGun?: boolean;
}

/** Parse barrel display String/Stat for base damage, pellet count, and fire rate.
 * Handles multiple formats from the CSV:
 *   "571 Damage"        / "1785 DMG"
 *   "265 x 6 Damage"    / "1485 x 4 DMG"
 *   "6.8/s Fire Rate"   / "6.8/s FR"  / "4.0/s Reload"
 */
function parseBarrelStats(str: string): { name: string; damage: number; pellets: number; fireRate: number } {
  const name = str.split(",")[0]?.trim() ?? "";
  // Multi-pellet: "1485 x 4 DMG", "265 x 6 Damage", "669x3 Damage"
  const multiMatch = str.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+)\s*(?:Damage|DMG)/i);
  // Single pellet: "571 Damage", "1785 DMG"
  const singleMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:Damage|DMG)/i);
  let damage = 0, pellets = 1;
  if (multiMatch) {
    damage = parseFloat(multiMatch[1]);
    pellets = parseInt(multiMatch[2]);
  } else if (singleMatch) {
    damage = parseFloat(singleMatch[1]);
  }
  // Fire rate: "6.8/s Fire Rate", "6.8/s FR", "4.0/s Reload"
  const frMatch = str.match(/([\d.]+)\s*\/s\s*(?:Fire\s*Rate|FR|Reload)/i);
  const fireRate = frMatch ? parseFloat(frMatch[1]) : 0;
  return { name, damage, pellets, fireRate };
}

/** Count how many part IDs are inside a grouped token like {13:[9 9 9 9 9]} */
function countGroupedStacks(tokens: string[]): number {
  return tokens.reduce((sum, t) => {
    const m = t.match(/\[([^\]]*)\]/);
    if (!m || !m[1].trim()) return sum;
    return sum + m[1].trim().split(/\s+/).length;
  }, 0);
}

/**
 * Generates a random modded weapon decoded string (single line).
 * @throws Error with user-facing message on failure
 */
export function generateModdedWeapon(
  weaponEditData: WeaponEditData,
  universalPartCodes: UniversalDbPartCode[],
  options: GenerateModdedWeaponOptions = {},
): GenerateModdedWeaponResult {
  const retryDepth = Math.max(0, Math.min(12, Number((options as { __retryDepth?: unknown }).__retryDepth ?? 0) || 0));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 60)));
  const skinFromOptions = (options.skin ?? "").trim();

  // ── Claude's Gun — 1/20 chance Easter egg ─────────────────────────────────────────────
  // Hardcoded Ripper Shotgun Convergence. Seed 6211 (DrLecter's signature).
  // Stock base hand-built from a real auto-filled Convergence, all explicit {7:xx} format.
  const isClaudeGun = Math.random() < 0.05; // 1 in 20
  // Stock base hand-built from a real auto-filled Convergence, all explicit {7:xx} format.
  const CLAUDE_GUN_STOCK_BASE = "7, 0, 1, 50| 2, 6211|| {1:13} {7:2} {7:64} {7:[66 66 66 66 66]} {7:[68 68 68 68 68]} {7:[69 69 69 69 69]} {7:[70 70 70 70 70]} {7:[71 71 71 71 71]} {7:[72 72 72 72 72]} {7:[16 16]} {7:41} {7:42} {7:43} {7:50} {7:12} {7:74} {7:75} {7:28} {7:[34 34 34 34 34]} {7:[35 35 35 35 35]} {7:[36 36 36 36 36]} {7:[48 48 48 48 48]} |";
  /** Only use skins from the skin selector (skinOptions), excluding Christmas. No stock/default skin. */
  const nonChristmasSkins = (options.skinOptions ?? []).filter(
    (s) => !/christmas/i.test(String(s.label ?? "")) && !/christmas/i.test(String(s.value ?? "")),
  );
  const chosenSkin =
    skinFromOptions ||
    (nonChristmasSkins.length > 0 ? pick(nonChristmasSkins).value : "");

  /**
   * Power mode rebalance (requested):
   * - Stable: unchanged.
   * - Insane: previous OP values.
   * - OP: midpoint between Stable and previous OP.
   */
  const modeCfg = {
    stable: {
      exemplarCycleRepeats: [8, 24] as const,
      exemplarAmmoCount: [12, 48] as const,
      exemplarFireCount: [10, 36] as const,
      useStabilityGroupChance: 0.7,
      bodyAccRange: [4, 8] as const,
      barrelAccRange: [4, 8] as const,
      grenadePerkRange: [16, 52] as const,
      underAccRange: [1, 3] as const,
      statRange: [2, 6] as const,
      damageRange: [10, 20] as const,
      enhancementRepeatRange: [0, 6] as const,
    },
    op: {
      exemplarCycleRepeats: [12, 48] as const,
      exemplarAmmoCount: [18, 94] as const,
      exemplarFireCount: [14, 63] as const,
      useStabilityGroupChance: 0.575,
      bodyAccRange: [4, 10] as const,
      barrelAccRange: [4, 10] as const,
      grenadePerkRange: [20, 86] as const,
      underAccRange: [1, 5] as const,
      statRange: [3, 8] as const,
      damageRange: [55, 85] as const,
      enhancementRepeatRange: [4, 27] as const,
    },
    insane: {
      exemplarCycleRepeats: [16, 72] as const,
      exemplarAmmoCount: [24, 140] as const,
      exemplarFireCount: [18, 90] as const,
      useStabilityGroupChance: 0.45,
      bodyAccRange: [4, 12] as const,
      barrelAccRange: [4, 12] as const,
      grenadePerkRange: [24, 120] as const,
      underAccRange: [1, 6] as const,
      statRange: [3, 10] as const,
      damageRange: [100, 150] as const,
      enhancementRepeatRange: [8, 48] as const,
    },
  }[modPowerMode];

  const candidates = universalPartCodes
    .map((row) => ({ row, parsed: parseCodePair(row.code) }))
    .filter((x): x is { row: UniversalDbPartCode; parsed: { prefix: number; part: number } } => x.parsed != null);

  const isSpecialRarity = (row: { stat?: string; string?: string }) =>
    /(legendary|pearl|pearlescent)/.test(norm(`${row.stat ?? ""} ${row.string ?? ""}`));

  const weaponRowsByPrefix = new Map<number, WeaponEditPartRow[]>();
  for (const row of weaponEditData.parts) {
    const pfx = Number(row.mfgWtId);
    if (!Number.isFinite(pfx)) continue;
    if (!weaponRowsByPrefix.has(pfx)) weaponRowsByPrefix.set(pfx, []);
    weaponRowsByPrefix.get(pfx)!.push(row);
  }

  const isBarrelExcluded = (text: string) =>
    /\bnoisy\s*cricket\b|kaleidosplode|queens\s*rest|queensrest|potatothrower|potato\s*thrower/i.test(norm(text));
  const legendaryBarrelIdsByPrefix = new Map<number, Set<number>>();
  const legendaryRarityIdsByPrefix = new Map<number, Set<number>>();
  for (const c of candidates) {
    const pt = norm(c.row.partType);
    const r = norm(c.row.rarity);
    if (r !== "legendary" && r !== "pearl" && r !== "pearlescent") continue;
    if (pt === "barrel") {
      const barrelText = norm(`${c.row.statText ?? ""} ${c.row.string ?? ""} ${c.row.partName ?? ""}`);
      if (isBarrelExcluded(barrelText)) continue;
      if (!legendaryBarrelIdsByPrefix.has(c.parsed.prefix)) legendaryBarrelIdsByPrefix.set(c.parsed.prefix, new Set());
      legendaryBarrelIdsByPrefix.get(c.parsed.prefix)!.add(c.parsed.part);
    } else if (pt === "rarity") {
      if (!legendaryRarityIdsByPrefix.has(c.parsed.prefix)) legendaryRarityIdsByPrefix.set(c.parsed.prefix, new Set());
      legendaryRarityIdsByPrefix.get(c.parsed.prefix)!.add(c.parsed.part);
    }
  }

  const hasCoreParts = (prefix: number): boolean => {
    const rows = weaponRowsByPrefix.get(prefix) ?? [];
    const hasBody = rows.some((r) => norm(r.partType) === "body");
    const hasBarrel = rows.some((r) => norm(r.partType) === "barrel");
    const hasMagazine = rows.some((r) => norm(r.partType) === "magazine");
    // Spawn safety: require core slots we always try to fill.
    const hasGrip = rows.some((r) => norm(r.partType) === "grip");
    const hasScope = rows.some((r) => norm(r.partType) === "scope");
    const hasMfgPart = rows.some((r) => norm(r.partType) === "manufacturer part");
    return hasBody && hasBarrel && hasMagazine && hasGrip && hasScope && hasMfgPart;
  };

  const validPrefixesLegendary = Array.from(weaponRowsByPrefix.keys()).filter((p) => {
    const rows = weaponRowsByPrefix.get(p) ?? [];
    const partIds = new Set(rows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)));
    const barrelSet = legendaryBarrelIdsByPrefix.get(p) ?? new Set<number>();
    const raritySet = legendaryRarityIdsByPrefix.get(p) ?? new Set<number>();
    const hasLegendaryBarrel =
      Array.from(barrelSet).some((id) => partIds.has(id)) ||
      rows.some((r) => norm(r.partType) === "barrel" && isSpecialRarity(r));
    const hasLegendaryRarity =
      Array.from(raritySet).some((id) => partIds.has(id)) ||
      rows.some((r) => norm(r.partType) === "rarity" && isSpecialRarity(r));
    return hasCoreParts(p) && hasLegendaryBarrel && hasLegendaryRarity;
  });
  const validPrefixesFallback = Array.from(weaponRowsByPrefix.keys()).filter((p) => {
    const rows = weaponRowsByPrefix.get(p) ?? [];
    const hasAnyRarity = rows.some((r) => norm(r.partType) === "rarity");
    const hasAnyBarrel = rows.some((r) => norm(r.partType) === "barrel");
    return hasCoreParts(p) && hasAnyRarity && hasAnyBarrel;
  });
  const validPrefixes = validPrefixesLegendary.length ? validPrefixesLegendary : validPrefixesFallback;
  if (!validPrefixes.length) throw new Error("No valid weapon prefix has required core parts and barrel/rarity.");

  // Use forcedPrefix from options (dropdown selection) when provided, valid, AND has all core parts.
  // A prefix missing core slots (body/barrel/mag/grip/scope/mfg) causes the weapon to not spawn.
  // Claude's Gun: always prefix 7 (Ripper Shotgun) with hardcoded stock base.
  const forcedPfx = options.forcedPrefix != null && Number.isFinite(options.forcedPrefix) ? options.forcedPrefix : null;
  const headerPrefix = isClaudeGun
    ? 7
    : forcedPfx != null && weaponRowsByPrefix.has(forcedPfx) && hasCoreParts(forcedPfx)
      ? forcedPfx
      : pick(validPrefixes);
  const seed = isClaudeGun ? "6211" : String(randInt(1000, 9999));
  // Override stockBaseDecoded for Claude's Gun
  if (isClaudeGun) options = { ...options, stockBaseDecoded: CLAUDE_GUN_STOCK_BASE };
  const weaponRows = weaponEditData.parts.filter((r) => Number(r.mfgWtId) === headerPrefix);
  const weaponManufacturer = norm(weaponRows[0]?.manufacturer ?? "");
  const legendaryRarityRows = weaponRows.filter(
    (r) => norm(r.partType) === "rarity" && /(legendary|pearl|pearlescent)/.test(norm(`${r.stat} ${r.string}`)),
  );
  const validCurrentPartIds = new Set(weaponRows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)));
  const mappedLegendaryRarityIds = Array.from(legendaryRarityIdsByPrefix.get(headerPrefix) ?? []).filter((id) =>
    validCurrentPartIds.has(id),
  );
  const anyRarityRows = weaponRows.filter((r) => norm(r.partType) === "rarity");
  if (!legendaryRarityRows.length && !mappedLegendaryRarityIds.length && !anyRarityRows.length) {
    throw new Error("Could not find a rarity part for selected weapon prefix.");
  }
  const firstRarityCode =
    legendaryRarityRows.length
      ? `{${pick(legendaryRarityRows).partId}}`
      : mappedLegendaryRarityIds.length
        ? `{${pick(mappedLegendaryRarityIds)}}`
        : `{${pick(anyRarityRows).partId}}`;

  const toPartIds = (types: string[]): number[] => {
    const set = new Set(types.map((t) => norm(t)));
    return weaponRows
      .filter((r) => set.has(norm(r.partType)))
      .map((r) => Number(r.partId))
      .filter((n) => Number.isFinite(n));
  };
  const pickToken = (types: string[]): string | null => {
    const ids = toPartIds(types);
    if (!ids.length) return null;
    return `{${pick(ids)}}`;
  };
  /** Underbarrel IDs only for allowed types (excludes Atlas Tracker Dart, Tracker Grenade). */
  const toPartIdsAllowedUnderbarrel = (): number[] =>
    weaponRows
      .filter((r) => norm(r.partType) === "underbarrel" && isAllowedUnderbarrel(r))
      .map((r) => Number(r.partId))
      .filter((n) => Number.isFinite(n));
  const pickUnderbarrelToken = (): string | null => {
    const ids = toPartIdsAllowedUnderbarrel();
    if (!ids.length) return null;
    return `{${pick(ids)}}`;
  };
  const groupedToken = (prefix: number, ids: number[]): string => `{${prefix}:[${ids.join(" ")}]}`;
  const stackTokens = (types: string[], minCount: number, maxCount: number): string[] => {
    const ids = toPartIds(types);
    if (!ids.length) return [];
    const count = randInt(minCount, maxCount);
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) out.push(`{${pick(ids)}}`);
    return out;
  };

  /** Never use 27:75 in any stat/damage stacks (per modded weapon rules). */
  const isExcludedStatCode = (prefix: number, part: number) => prefix === 27 && part === 75;

  // Stackable accessory part types — the only types whose stat bonus stacks meaningfully.
  // Barrels/bodies/manufacturer parts are excluded (their "damage" is in the string/display, not the stat field).
  const STACKABLE_PART_TYPES = new Set(["barrel accessory", "body accessory", "scope accessory", "grip", "foregrip"]);

  // addStatStacks: matches ONLY against r.stat (not r.string) so barrel display text never pollutes.
  // Picks ONE part from the pool and repeats it N times as a single grouped block — clean stacking.
  const addStatStacks = (
    statMatcher: (stat: string) => boolean,
    minCount: number,
    maxCount: number,
  ): string[] => {
    const pool = weaponEditData.parts.filter((r) => {
      const pfx = Number(r.mfgWtId);
      const part = Number(r.partId);
      if (!Number.isFinite(pfx) || !Number.isFinite(part)) return false;
      if (isExcludedStatCode(pfx, part)) return false;
      if (!STACKABLE_PART_TYPES.has(norm(r.partType))) return false;
      return statMatcher(norm(r.stat ?? ""));
    });
    if (!pool.length) return [];
    // Pick one part and repeat it — consistent single-code stacking like {prefix:[id id id...]}.
    const chosen = pick(pool);
    const pfx = Number(chosen.mfgWtId);
    const part = Number(chosen.partId);
    const count = randInt(minCount, maxCount);
    return [`{${pfx}:[${Array(count).fill(part).join(" ")}]}`];
  };

  // Exemplar damage stacks — Terra confirmed these are great. Use IDs [28 32 40 55 59 62] cycling.
  // Terra's code uses two separate {9:[...]} groups. Cycles vary by mode.
  const exemplarIds = [28, 32, 40, 55, 59, 62];
  const exemplarCycles = { stable: randInt(4, 8), op: randInt(6, 11), insane: randInt(8, 14) }[modPowerMode];
  const buildExemplarGroup = (cycles: number) =>
    groupedToken(9, Array.from({ length: cycles * exemplarIds.length }, (_, i) => exemplarIds[i % exemplarIds.length]!));
  const exemplarStacks = [buildExemplarGroup(exemplarCycles), buildExemplarGroup(exemplarCycles)];

  // Terra's perfect gun uses {14:[78 3 3 3 3 3 3 3 3 3 3 3]} — part 78 leads, then all 3s.
  const exemplarStabilityGroup =
    Math.random() < modeCfg.useStabilityGroupChance
      ? [groupedToken(14, [78, ...Array.from({ length: randInt(8, 42) }, () => 3)])]
      : [];

  // Damage stacks — match r.stat exactly "+Damage" (accessory parts only, barrels excluded).
  const damageStacks = addStatStacks(
    (stat) => /^\+damage$/.test(stat),
    modeCfg.damageRange[0],
    modeCfg.damageRange[1],
  );
  // Crit damage stacks on top.
  const weaponTypeDamageStacks = addStatStacks(
    (stat) => /\+crit\s*damage|\+critical\s*damage/.test(stat),
    modeCfg.statRange[0],
    modeCfg.statRange[1],
  );
  // Movement speed stacks (not in weapon CSV stat field, skip gracefully if pool empty).
  const movementSpeedStacks = addStatStacks(
    (stat) => /movement\s*speed|move\s*speed/.test(stat),
    1,
    Math.max(1, modeCfg.statRange[1]),
  );
  // Find Tediore Reload (no stat changes) early — universalPartCodes have no statText so search
  // weaponEditData.parts by .string display name instead.
  const tedioreReloadRowsEarly = weaponEditData.parts.filter((r) => {
    if (norm(r.partType) !== "manufacturer part") return false;
    const s = norm(r.string ?? "");
    return /tediore\s*reload/i.test(s) && !/shooting|combo|mirv/i.test(s);
  });
  const samePrefixTedioreRowEarly = tedioreReloadRowsEarly.find((r) => Number(r.mfgWtId) === headerPrefix);
  const tedioreReloadRowEarly = samePrefixTedioreRowEarly ?? (tedioreReloadRowsEarly.length ? pick(tedioreReloadRowsEarly) : null);
  // Cross-prefix universal fallback: if weapon-specific DB has no Tediore Reload, search universalPartCodes.
  // Needed for weapon types (e.g. pistol, heavy) where the category builder-data doesn't include a Tediore Reload part.
  const tedioreReloadCodeFromUniversal: string | null = (() => {
    if (tedioreReloadRowEarly != null) return null; // already found above
    const found = universalPartCodes.find((r) => {
      if (norm(r.partType ?? "") !== "manufacturer part") return false;
      const s = norm(r.string ?? r.partName ?? "");
      return /tediore\s*reload/i.test(s) && !/shooting|combo|mirv/i.test(s);
    });
    return found?.code ?? null;
  })();
  const tedioreReloadCode =
    tedioreReloadRowEarly != null
      ? Number(tedioreReloadRowEarly.mfgWtId) === headerPrefix
        ? `{${tedioreReloadRowEarly.partId}}`
        : `{${tedioreReloadRowEarly.mfgWtId}:${tedioreReloadRowEarly.partId}}`
      : tedioreReloadCodeFromUniversal;
  // Rowans Charge {27:75} mixed with {27:15} +Fire Rate in a single grouped token.
  // Reference builds use 6+7, 18+7 (codes 2 & 3 from creator analysis). Varies by mode.
  // specialMode overrides: "inf-ammo" = always max, "grenade-reload" = always off,
  // default = guaranteed when no grenade reload is available; 35% chance otherwise.
  // Rowan's Charge {27:75} and +Fire Rate {27:15} split into separate grouped tokens (Code 7 pattern).
  // Reference: {27:[15×13]} then later {27:[75×10]} — each token independently sized.
  const rowansChargeCount = { stable: randInt(3, 7), op: randInt(5, 11), insane: randInt(6, 14) }[modPowerMode];
  // Fire rate capped lower — {27:15} on top of the full-auto string drains ammo in seconds for fast weapon types.
  const rowansFireRateCount = { stable: randInt(2, 4), op: randInt(3, 5), insane: randInt(3, 5) }[modPowerMode];
  const rowansChargeStacks =
    options.specialMode === "inf-ammo"
      ? [groupedToken(27, Array(9).fill(75)), groupedToken(27, Array(7).fill(15))]
      : options.specialMode === "grenade-reload"
        ? []
        : tedioreReloadCode == null || Math.random() < 0.35
          ? [groupedToken(27, Array(rowansChargeCount).fill(75)), groupedToken(27, Array(rowansFireRateCount).fill(15))]
          : [];
  const fireRateStacks = [
    ...exemplarStabilityGroup,
    ...addStatStacks(
      (stat) => /\+fire rate|\+fr\b/.test(stat),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
    ),
  ];

  const barrelRowOk = (r: WeaponEditPartRow) => !isBarrelExcluded(norm(`${r.stat ?? ""} ${r.string ?? ""}`));
  const allowedPrefixPart: Set<string> = new Set();
  const allowedPartByPrefix = new Map<number, Set<number>>();
  if (options.allowedBarrelEntries?.length) {
    for (const e of options.allowedBarrelEntries) {
      const p = parseCodePair(String(e?.code ?? "").trim());
      if (!p) continue;
      allowedPrefixPart.add(`${p.prefix}:${p.part}`);
      if (!allowedPartByPrefix.has(p.prefix)) allowedPartByPrefix.set(p.prefix, new Set());
      allowedPartByPrefix.get(p.prefix)!.add(p.part);
    }
  }
  const mappedLegendaryBarrels = Array.from(legendaryBarrelIdsByPrefix.get(headerPrefix) ?? []).filter((id) =>
    validCurrentPartIds.has(id),
  );
  let samePrefixBarrels = mappedLegendaryBarrels.length
    ? mappedLegendaryBarrels
    : weaponRows
        .filter((r) => norm(r.partType) === "barrel" && isSpecialRarity(r) && barrelRowOk(r))
        .map((r) => Number(r.partId))
        .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
  let anyPrefixBarrels = weaponRows
    .filter((r) => norm(r.partType) === "barrel" && barrelRowOk(r))
    .map((r) => Number(r.partId))
    .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
  if (allowedPartByPrefix.size > 0) {
    const allowedSamePrefix = allowedPartByPrefix.get(headerPrefix);
    if (allowedSamePrefix?.size) {
      samePrefixBarrels = samePrefixBarrels.filter((id) => allowedSamePrefix.has(id));
      anyPrefixBarrels = anyPrefixBarrels.filter((id) => allowedSamePrefix.has(id));
    }
  }
  const usableSamePrefixBarrels = samePrefixBarrels.length ? samePrefixBarrels : anyPrefixBarrels;
  if (!usableSamePrefixBarrels.length) throw new Error("Could not build stock weapon core: missing Barrel for selected prefix.");

  // uniqueEffectBarrels / allUniqueBarrels removed — visual barrel slot now always uses the curated
  // visual barrel pool (with hardcoded fallback), never the old allUniqueBarrels/crossPrefixBarrels path.
  let crossPrefixBarrels = Array.from(weaponRowsByPrefix.entries()).flatMap(([pfx, rows]) => {
    if (pfx === headerPrefix) return [];
    const idsInPrefix = new Set(rows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)));
    const mapped = Array.from(legendaryBarrelIdsByPrefix.get(pfx) ?? []).filter((id) => idsInPrefix.has(id));
    if (mapped.length) return mapped.map((part) => ({ prefix: pfx, part }));
    return rows
      .filter((r) => norm(r.partType) === "barrel" && isSpecialRarity(r) && barrelRowOk(r))
      .map((r) => ({ prefix: pfx, part: Number(r.partId) }))
      .filter((x) => Number.isFinite(x.part));
  });
  if (allowedPrefixPart.size > 0) {
    crossPrefixBarrels = crossPrefixBarrels.filter((c) => allowedPrefixPart.has(`${c.prefix}:${c.part}`));
  }
  const chosenBarrelId = pick(usableSamePrefixBarrels);
  const primaryBarrelToken = `{${chosenBarrelId}}`;
  const chosenBarrelRow = weaponRows.find((r) => norm(r.partType) === "barrel" && Number(r.partId) === chosenBarrelId);
  // Stat column has the display name + damage numbers; String column is just the spawn code.
  // Try stat first, fall back to string if stat is empty.
  const barrelStats = chosenBarrelRow
    ? parseBarrelStats(chosenBarrelRow.stat || chosenBarrelRow.string)
    : { name: "", damage: 0, pellets: 1, fireRate: 0 };
  // Always paste a visual barrel to the left of the primary barrel (game reads left-to-right, leftmost barrel sets the visual).
  // Rule: first barrel MUST be from a visual-only pool. Never use entries that don't have visual: true.
  // Priority: (1) entries with visual:true from JSON, (2) hardcoded fallback. Never use the full JSON list
  // when it contains non-visual barrels (e.g. AI-generated list with mixed visual/non-visual).
  const FALLBACK_VISUAL_BARRELS: VisualBarrelEntry[] = [
    { name: "BottledLightning", code: "{289:26}", visual: true },
    { name: "DiscJockey",       code: "{275:30}", visual: true },
    { name: "GammaVoid",        code: "{289:24}", visual: true },
    { name: "javelin",          code: "{273:35}", visual: true },
    { name: "jetset",           code: "{275:35}", visual: true },
    { name: "mantra",           code: "{10:62}",  visual: true },
    { name: "onslaught",        code: "{22:68}",  visual: true },
    { name: "Sidewinder",       code: "{273:37}", visual: true },
    { name: "Convergence",      code: "{7:64}",   visual: true },
    { name: "Ravenfire",        code: "{273:40}", visual: true },
    { name: "Streamer",         code: "{275:1}",  visual: true },
  ];
  const visualOnly = (options.visualBarrelEntries ?? []).filter((e) => e.visual === true);
  const visualBarrelPool = visualOnly.length > 0 ? visualOnly : FALLBACK_VISUAL_BARRELS;
  const chosenVisualBarrel = isClaudeGun ? "{7:64}" : pick(visualBarrelPool).code.trim();  // Claude's Gun: Convergence
  // Stack the visual barrel 2-4× (Terra stacks Bod 3×) to reinforce the visual identity.
  const visualBarrelStackCount = isClaudeGun ? 4 : { stable: randInt(2, 3), op: 3, insane: randInt(3, 4) }[modPowerMode];
  const uniqueFirstBarrelToken = (() => {
    // If the code is a simple {prefix:part}, stack as a grouped token.
    const m = chosenVisualBarrel.match(/^\{(\d+):(\d+)\}$/);
    if (m) return groupedToken(Number(m[1]), Array(visualBarrelStackCount).fill(Number(m[2])));
    // Multi-code visual barrels (e.g. combo entries) — repeat the whole code.
    return Array(visualBarrelStackCount).fill(chosenVisualBarrel).join(" ");
  })();

  // ── Heavy barrel accessory cross-insert — applies to ALL guns ──────────────────────────────
  // Terra's pattern: {289:[17 16 17]} on every gun — MIRV/Two-Shot/etc. enhance projectile
  // behavior regardless of what weapon type the gun is. Each heavy manufacturer contributes
  // unique accessories: Torgue rockets, Ripper beams, Vladof multi-barrel, Maliwan MIRV.
  // Pick one heavy manufacturer and add 2-4 accessories from it.
  // Heavy barrel accessory reference (kept for documentation):
  // 273 Torgue: 1=homing, 6/9/12/22=triple barrel, 10/11/23/24=air burst/shrapnel, 26=two-shot, 27=FR, 28=mag, 29=scanning
  // 275 Ripper: 2/18=explosive, 3/21=beam splitter, 4/9/24=compound, 5/7/25=ricochet, 22/6/8=wide disk, 23=heat exchange
  // 282 Vladof: 13=additional barrel, 14=angel's share, 15/27=magic bullet, 16/28=devil's share, 17=additional barrels, 18=explosive, 19=two-shot, 20=penetration
  // 289 Maliwan: 2/16=MIRV, 3/19=proxy homing, 12=ricochet, 13=penetration, 14=speed loader, 15=overload, 17=two-shot, 18=aerodynamics
  // Heavy barrel accessories from ALL manufacturers — Terra's approach.
  // Not just one random manufacturer — use specific desirable parts from each.
  const heavyBarrelAccessoryTokens: string[] = (() => {
    if (isClaudeGun) {
      return [groupedToken(289, [16, 19, 17, 15])];
    }
    const tokens: string[] = [];
    // Torgue (273): Scanning + Fire Rate
    tokens.push(groupedToken(273, [29, 27]));
    // Vladof (282): Explosive Rounds + Additional Barrels
    tokens.push("{282:18}", "{282:17}");
    // Maliwan (289): Proxy Homing + Aerodynamics
    tokens.push(groupedToken(289, [3, 19]));
    return tokens;
  })();

  // ── Terra's barrel cap: max 5 unique barrel codes per gun ──────────────────────────────────
  // visual(1) + primary(1) already used = 3 slots remaining.
  // Extra same-prefix: pick 1-2 unique additional barrel IDs (not repeating), stack each ×N as a grouped token.
  // Stacking the same barrel multiple times amplifies its effect without adding new unique codes.
  // Cross-prefix: pick 0-1 unique barrel from a different weapon type prefix.
  const extraBarrelUniqueCount = { stable: 1, op: 2, insane: 2 }[modPowerMode];
  const crossBarrelUniqueCount =
    modPowerMode === "stable"
      ? 0
      : modPowerMode === "op"
        ? (Math.random() < 0.25 ? 1 : 0)
        : (Math.random() < 0.50 ? 1 : 0); // insane = previous OP-ish frequency
  const extraBarrelStackSize = { stable: randInt(8, 15), op: randInt(12, 20), insane: randInt(15, 25) }[modPowerMode];
  const extraSamePrefixBarrelIds = (() => {
    const pool = usableSamePrefixBarrels.filter((id) => id !== chosenBarrelId);
    return [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(extraBarrelUniqueCount, pool.length));
  })();
  // Stack each unique extra barrel as a grouped token (same code repeated)
  const samePrefixBarrelParts: string[] = extraSamePrefixBarrelIds.map((id) =>
    groupedToken(headerPrefix, Array(extraBarrelStackSize).fill(id)),
  );
  // Cross-prefix: 0 or 1 additional unique barrel from another weapon type
  const crossParts: string[] = (() => {
    if (crossBarrelUniqueCount === 0 || !crossPrefixBarrels.length) return [];
    const c = pick(crossPrefixBarrels);
    return [`{${c.prefix}:${c.part}}`];
  })();
  let barrelAccessoryStack = stackTokens(
    ["barrel accessory"],
    modeCfg.barrelAccRange[0],
    modeCfg.barrelAccRange[1],
  );
  if (toPartIds(["barrel accessory"]).length > 0 && barrelAccessoryStack.length < 4) {
    throw new Error("Could not build stock weapon core: missing enough Barrel Accessory parts.");
  }
  // Spawn safety: if own prefix has NO barrel accessories, grab from another prefix.
  if (barrelAccessoryStack.length === 0) {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const accs = rows.filter((r) => norm(r.partType) === "barrel accessory");
      if (accs.length) { barrelAccessoryStack = [pick(accs)].map((a) => `{${pfx}:${a.partId}}`); break; }
    }
  }

  // Stacked Vladof 50-round magazines {18:[14×N]} — Code 7 uses 12 stacked mags.
  // Stacking multiples reinforces the mag reference for the spawner and adds ammo capacity anchors.
  const vladof50MagCount = { stable: randInt(4, 8), op: randInt(6, 11), insane: randInt(8, 14) }[modPowerMode];
  const magazineToken = groupedToken(18, Array(vladof50MagCount).fill(14));
  // No Order/COV prefix; we use the same magazine on every gun.
  // Grip, scope — REQUIRED for weapon to spawn. If own prefix has none, cross-reference other prefixes.
  const gripToken = pickToken(["grip"]) ?? (() => {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const grips = rows.filter((r) => norm(r.partType) === "grip");
      if (grips.length) { const g = pick(grips); return `{${pfx}:${g.partId}}`; }
    }
    return null;
  })();
  const scopeToken = pickToken(["scope"]) ?? (() => {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const scopes = rows.filter((r) => norm(r.partType) === "scope");
      if (scopes.length) { const s = pick(scopes); return `{${pfx}:${s.partId}}`; }
    }
    return null;
  })();
  // tedioreReloadCode already computed above (early detection using weaponEditData.parts).
  const manufacturerPartsCount =
    weaponManufacturer.includes("tediore") || tedioreReloadCode != null
      ? randInt(2, 5)
      : 1;
  const baseManufacturerTokens =
    manufacturerPartsCount <= 1
      ? (() => {
          const t = pickToken(["manufacturer part"]);
          return t ? [t] : [];
        })()
      : stackTokens(["manufacturer part"], manufacturerPartsCount, manufacturerPartsCount);
  // Spawn safety: if own prefix has NO manufacturer parts, grab from another prefix.
  let manufacturerTokens =
    tedioreReloadCode != null
      ? [tedioreReloadCode, ...baseManufacturerTokens.filter((t) => t !== tedioreReloadCode)]
      : baseManufacturerTokens;
  if (manufacturerTokens.length === 0) {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const mfg = rows.filter((r) => norm(r.partType) === "manufacturer part");
      if (mfg.length) { manufacturerTokens = [`{${pfx}:${pick(mfg).partId}}`]; break; }
    }
  }
  // Daedalus alt-ammo disabled: causes infinite ammo which breaks grenade reload mechanic.
  // Exactly one foregrip; placed at the very end (after underbarrel).
  const foregripToken = pickToken(["foregrip"]) ?? (() => {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const fg = rows.filter((r) => norm(r.partType) === "foregrip");
      if (fg.length) return `{${pfx}:${pick(fg).partId}}`;
    }
    return null;
  })();

  const crossPrefixUnderbarrels: { prefix: number; part: number }[] = [];
  const crossPrefixUnderbarrelAccessories: { prefix: number; part: number }[] = [];
  for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
    for (const r of rows) {
      const pt = norm(r.partType);
      const part = Number(r.partId);
      if (!Number.isFinite(part)) continue;
      if (pt === "underbarrel" && isAllowedUnderbarrel(r)) {
        crossPrefixUnderbarrels.push({ prefix: pfx, part });
      } else if (pt === "underbarrel accessory") {
        // Allow grabbing underbarrel accessories from totally different weapon types/manufacturers.
        crossPrefixUnderbarrelAccessories.push({ prefix: pfx, part });
      }
    }
  }
  const elementPool = weaponEditData.elemental ?? [];
  const nonSwitchElementIds = elementPool
    .filter((e) => !/\bswitch\s+between\b/.test(norm(e.stat ?? "")) && !/\bkinetic\b/i.test(e.stat ?? ""))
    .map((e) => Number(e.partId))
    .filter((n) => Number.isFinite(n) && n !== 55);  // 55 = Kinetic — always excluded
  // {1:56}=Shock, {1:57}=Radiation, {1:58}=Corrosive, {1:59}=Cryo, {1:60}=Fire.
  // Picked early so both altFireTokens and extendedElementTokens can use the same element.
  const chosenElementId = isClaudeGun ? 57 : pick([56, 57, 58, 59, 60]);  // Claude's Gun: Radiation (purple)
  let altFireTokens: string[] = [];
  let shouldUseUnderbarrelAlt = true;
  const bodyToken = pickToken(["body"]);
  if (!bodyToken) throw new Error("Could not build stock weapon core: missing Body.");
  let bodyAccessoryStack = stackTokens(
    ["body accessory"],
    modeCfg.bodyAccRange[0],
    modeCfg.bodyAccRange[1],
  );
  if (toPartIds(["body accessory"]).length > 0 && bodyAccessoryStack.length < 4) {
    throw new Error("Could not build stock weapon core: missing enough Body Accessory parts.");
  }
  // Spawn safety: if own prefix has NO body accessories, grab from another prefix.
  if (bodyAccessoryStack.length === 0) {
    for (const [pfx, rows] of weaponRowsByPrefix.entries()) {
      if (pfx === headerPrefix) continue;
      const accs = rows.filter((r) => norm(r.partType) === "body accessory");
      if (accs.length) { bodyAccessoryStack = [pick(accs)].map((a) => `{${pfx}:${a.partId}}`); break; }
    }
  }

  let underbarrelToken = "";
  let underbarrelAccessoryStack: string[] = [];
  if (shouldUseUnderbarrelAlt) {
    const allowedUb = options.allowedUnderbarrelEntries;
    const desirableUb = options.desirableUnderbarrelEntries;
    const hasAllowed =
      allowedUb != null &&
      ((Array.isArray(allowedUb) && allowedUb.length > 0) ||
        (Array.isArray((allowedUb as { parts?: unknown[] }).parts) && (allowedUb as { parts: unknown[] }).parts.length > 0));
    const ubData = hasAllowed ? allowedUb : desirableUb;
    const useAllowedOnly = hasAllowed;
    const isNewShape =
      ubData != null &&
      !Array.isArray(ubData) &&
      Array.isArray((ubData as { parts?: unknown[] }).parts) &&
      (ubData as { parts: unknown[] }).parts.length > 0;
    const ubPartsRaw = isNewShape
      ? (ubData as { parts: DesirableUnderbarrelPart[] }).parts
      : Array.isArray(ubData)
        ? (ubData as DesirableUnderbarrelEntry[])
        : [];
    const ubParts = Array.isArray(ubPartsRaw)
      ? ubPartsRaw.filter((e) => !UNDERBARREL_EXCLUDED.test(String((e as { name?: string }).name ?? "").trim()))
      : [];
    const ubAccessories = isNewShape && Array.isArray((ubData as { accessories?: unknown[] }).accessories)
      ? (ubData as { accessories: DesirableUnderbarrelAccessory[] }).accessories
      : [];

    if (ubParts.length > 0) {
      const useAccessory =
        ubAccessories.length > 0 && Math.random() < 0.5;
      if (useAccessory && ubAccessories.length > 0) {
        const acc = pick(ubAccessories);
        const partType = (acc.partType ?? "").trim().toLowerCase();
        const matchingParts = (ubParts as DesirableUnderbarrelPart[]).filter(
          (p) => (p.partType ?? "").trim().toLowerCase() === partType,
        );
        if (matchingParts.length > 0) {
          const part = pick(matchingParts);
          underbarrelToken = part.code.trim();
          underbarrelAccessoryStack = [acc.code.trim()];
        } else {
          underbarrelToken = pick(ubParts as DesirableUnderbarrelEntry[]).code.trim();
        }
      } else {
        underbarrelToken = pick(ubParts as DesirableUnderbarrelEntry[]).code.trim();
      }
    }
    // Fallback 1: crossPrefix allowed underbarrels (UNDERBARREL_ALLOWED filter)
    if (!underbarrelToken) {
      const preferCross = crossPrefixUnderbarrels.length > 0 && Math.random() < 0.65;
      if (preferCross && crossPrefixUnderbarrels.length > 0) {
        const u = pick(crossPrefixUnderbarrels);
        underbarrelToken = `{${u.prefix}:${u.part}}`;
      }
    }
    if (!underbarrelToken) underbarrelToken = pickUnderbarrelToken() ?? "";
    if (!underbarrelToken && crossPrefixUnderbarrels.length > 0) {
      const u = pick(crossPrefixUnderbarrels);
      underbarrelToken = `{${u.prefix}:${u.part}}`;
    }
    // Fallback 2: any non-excluded underbarrel across ALL weapon data (no UNDERBARREL_ALLOWED restriction).
    // This guarantees every gun always gets an underbarrel.
    if (!underbarrelToken) {
      const globalUbPool = weaponEditData.parts.filter(
        (r) =>
          norm(r.partType) === "underbarrel" &&
          !UNDERBARREL_EXCLUDED.test(`${r.stat ?? ""} ${r.string ?? ""}`.toLowerCase()),
      );
      if (globalUbPool.length) {
        const r = pick(globalUbPool);
        underbarrelToken =
          Number(r.mfgWtId) === headerPrefix
            ? `{${r.partId}}`
            : `{${r.mfgWtId}:${r.partId}}`;
      }
    }
    if (underbarrelToken && nonSwitchElementIds.length > 0) {
      // Elemental alt-fire alongside underbarrel (already handled above).
    } else if (!underbarrelToken && nonSwitchElementIds.length >= 2) {
      const first = pick(nonSwitchElementIds);
      const secondPool = nonSwitchElementIds.filter((id) => id !== first);
      const second = secondPool.length ? pick(secondPool) : null;
      if (second != null) {
        altFireTokens = [`{1:${first}}`, `{1:${second}}`];
        shouldUseUnderbarrelAlt = false;
      }
    }
    // Guaranteed fallback — every gun ALWAYS gets an underbarrel, no exceptions, no mode dependencies.
    // 15% chance to force Seamstress {26:77} — Terra's favorite, enables needle launcher + flight.
    // Otherwise pick from the curated desirable list.
    if (!underbarrelToken) {
      if (Math.random() < 0.15) {
        underbarrelToken = "{26:77}";
      } else if (ubPartsRaw.length > 0) {
        underbarrelToken = pick(ubPartsRaw as DesirableUnderbarrelEntry[]).code.trim();
      } else {
        underbarrelToken = "{26:77}";
      }
    }
    // When not using the allowed list, optionally add one underbarrel accessory from edit data if it complements the chosen underbarrel.
    if (!useAllowedOnly) {
      const parseCodePair = (code: string): { prefix: number; part: number } | null => {
        const s = code.trim();
        const m2 = s.match(/^\{\s*(\d+)\s*:\s*(\d+)\s*\}$/);
        if (m2) return { prefix: Number(m2[1]), part: Number(m2[2]) };
        const m1 = s.match(/^\{\s*(\d+)\s*\}$/);
        if (m1) {
          const n = Number(m1[1]);
          return { prefix: n, part: n };
        }
        return null;
      };
      const ubParsed = parseCodePair(underbarrelToken);
      if (ubParsed) {
        const ubRow = weaponEditData.parts.find(
          (r) => Number(r.mfgWtId) === ubParsed.prefix && Number(r.partId) === ubParsed.part,
        );
        if (ubRow) {
          const ubText = norm(`${ubRow.stat ?? ""} ${ubRow.string ?? ""}`);
          const ubWords = new Set(
            ubText
              .split(/\W+/)
              .filter((w) => w.length >= 4),
          );
          const samePrefixUnderbarrelAcc = weaponRows.filter((r) => norm(r.partType) === "underbarrel accessory");
          const complementaryAccIds = samePrefixUnderbarrelAcc
            .filter((r) => {
              const t = norm(`${r.stat ?? ""} ${r.string ?? ""}`);
              const words = new Set(
                t
                  .split(/\W+/)
                  .filter((w) => w.length >= 4),
              );
              for (const w of ubWords) {
                if (words.has(w)) return true;
              }
              return false;
            })
            .map((r) => Number(r.partId))
            .filter((n) => Number.isFinite(n));
          if (complementaryAccIds.length) {
            underbarrelAccessoryStack = [`{${pick(complementaryAccIds)}}`];
          } else {
            underbarrelAccessoryStack = [];
          }
        }
      }
    }
  }

  // {273:1} on every gun — makes Seamstress (and other projectiles) home to cursor.
  const homingToken = "{273:1}";
  const isNeedleLauncherUnderbarrel = ((): boolean => {
    if (!underbarrelToken) return false;
    const colonMatch = underbarrelToken.match(/\{(\d+):(\d+)\}/);
    const pfx = colonMatch ? Number(colonMatch[1]) : Number(underbarrelToken.match(/\{(\d+)\}/)?.[1]);
    const part = colonMatch ? Number(colonMatch[2]) : Number(underbarrelToken.match(/\{(\d+)\}/)?.[1]);
    const ubPrefix = Number.isFinite(pfx) && Number.isFinite(part) && colonMatch ? pfx : headerPrefix;
    const ubPart = colonMatch ? part : Number(underbarrelToken.match(/\{(\d+)\}/)?.[1]) || part;
    if (!Number.isFinite(ubPrefix) || !Number.isFinite(ubPart)) return false;
    const row = weaponEditData.parts.find(
      (r) =>
        Number(r.mfgWtId) === ubPrefix &&
        Number(r.partId) === ubPart &&
        norm(r.partType) === "underbarrel",
    );
    if (!row) return false;
    const t = norm(`${row.stat ?? ""} ${row.string ?? ""}`);
    return /\bseamstress\b|\bneedle\s*launcher\b|\bcallous\b/.test(t);
  })();
  const daedalusShotgunAmmoToken = (() => {
    if (!isNeedleLauncherUnderbarrel) return "";
    const c = candidates.find(
      ({ row }) =>
        norm(row.partType) === "manufacturer part" &&
        /\bdaedalus\b/.test(norm(row.manufacturer ?? "")) &&
        /\bshotgun\b.*\bammo\b|\bammo\b.*\bshotgun\b/.test(norm(row.statText ?? "")),
    );
    if (!c) return "";
    return c.parsed.prefix === headerPrefix ? `{${c.parsed.part}}` : `{${c.parsed.prefix}:${c.parsed.part}}`;
  })();
  // {13:70} + {11:75} only when Seamstress underbarrel.
  // {11:75} = Tediore SG Anarchy barrel (335 x 12 Damage, 12 pellets) — each pellet becomes a homing needle via Seamstress.
  // {11:81} = Eigenburst barrel — cross-inserts full Eigenburst behavior alongside the rarity token {11:82}.
  const isSeamstressUnderbarrel = underbarrelToken.includes("26:77");
  const seamstressExtras = isSeamstressUnderbarrel ? ["{13:70}", "{11:75}", "{11:81}"] : [];
  const homingStacks273 = isNeedleLauncherUnderbarrel
    ? [groupedToken(273, Array.from({ length: randInt(8, 24) }, () => 1))]
    : [];

  // Two-Shot ×10 — Terra's gun stacks 10 for maximum projectile multiplication.
  // MIRV separate — splits projectiles into orbs.
  const twoShotCount = { stable: randInt(5, 7), op: randInt(8, 10), insane: 10 }[modPowerMode];
  const multiProjectileToken = groupedToken(289, Array(twoShotCount).fill(17));

  // Cross-manufacturer ammo-efficiency stacks (from Uxhiha/Terra-Morpheous weapon analysis).
  // {281:3}  = Order Enhancement "Free Charger"  — 30% chance to fire for free at max charge.
  // {282:14} = Vladof HW "Angel's Share"         — every 6th shot doesn't cost ammo.
  // {286:1}  = COV Enhancement "Ventilator"      — 25% chance 0 Heat when fired.
  // {275:23} = Ripper HW "Heat Exchange"         — fires full auto after initial charge.
  // {273:29} = Torgue HW "Scanning"              — rockets home toward nearby targets.
  // ammoEffRanges removed — full-auto string is now fixed doubled values per Terra's pattern.
  // Terra's full-auto string DOUBLED — two copies of Free Charger + Heat Exchange.
  // Terra's gun has both sets for maximum full-auto reliability.
  // {281:[3×36]} Free Charger × 36, {275:[23×9]} Heat Exchange × 9, {26:[30×3]} Order SR mag × 3.
  const freeChargerStacks  = [groupedToken(281, Array(36).fill(3)), groupedToken(281, Array(36).fill(3))];
  const heatExchangeStacks = [groupedToken(275, Array(9).fill(23)), groupedToken(275, Array(9).fill(23))];
  const orderSrMagStacks   = [groupedToken(26,  Array(3).fill(30))];
  // Angel's Share — Terra uses a single {282:14}. Too many stacks = gun never needs to reload.
  // Keep it light: 1-3 stacks so the gun still reloads (important for grenade reload to trigger).
  const angelsShareStacks  = [groupedToken(282, Array.from({ length: randInt(1, 3) }, () => 14))];
  // Ventilator on ALL guns except grenade-reload (COV heat mechanic disables reload trigger).
  // Terra uses {286:[1×6]} on regular guns. Scales by mode.
  const ventilatorStacks = options.specialMode === "grenade-reload"
    ? []
    : [groupedToken(286, Array.from({ length: { stable: randInt(3, 5), op: randInt(5, 7), insane: randInt(6, 8) }[modPowerMode] }, () => 1))];
  // {273:29} Scanning — rockets home toward nearby targets; complements {273:1} Reticle Homing.
  const scanningHomingToken = "{273:29}";

  // Cross-manufacturer crit & damage stacks (discovered from creator weapon analysis).
  // {3:6}  = Jakobs Pistol +Crit Damage body accessory — cross-prefix crit stacking.
  // {22:72} = Vladof SMG +Damage barrel accessory — cross-prefix damage stacking.
  // {18:31} = Vladof AR barrel accessory — additional cross-prefix stacking (Code 7: 14 stacks).
  const crossCritRanges   = { stable: [6, 12] as const, op: [8, 16] as const, insane: [10, 20] as const }[modPowerMode];
  const crossDmgRanges    = { stable: [4,  8] as const, op: [5, 11] as const, insane: [6,  14] as const }[modPowerMode];
  const crossBarrelAccRanges = { stable: [4, 8] as const, op: [6, 12] as const, insane: [8, 16] as const }[modPowerMode];
  const jakobsCritStacks   = [groupedToken(3,  Array.from({ length: randInt(crossCritRanges[0],    crossCritRanges[1])    }, () => 6))];
  const vladofSmgDmgStacks  = [groupedToken(22, Array.from({ length: randInt(crossDmgRanges[0],    crossDmgRanges[1])     }, () => 72))];
  const vladofArBarrelStacks = [groupedToken(18, Array.from({ length: randInt(crossBarrelAccRanges[0], crossBarrelAccRanges[1]) }, () => 31))];

  // ── Tediore MIRV cross-inserts — "Tediore MIRV, no stat changes" Manufacturer Parts ──
  // Cross-inserting these from different weapon prefixes applies MIRV splitting behavior to the gun's shots.
  // Terra confirmed: {289:16} (Heavy MIRV) + {289:2} (Heavy MIRV dXa) = main gun visual orbs.
  // These manufacturer-part MIRVs add additional MIRV layers on top of {289:16/2}.
  // IMPORTANT: ALL Daedalus-prefix MIRV codes are excluded from this pool.
  // Daedalus manufacturer parts control ammo type — cross-inserting ANY Daedalus mfg part
  // overrides the underbarrel's alt-fire to that ammo type (e.g. {2:71} → pistol ammo on micro-rockets).
  // Removed: {13:21} DAD_AR, {2:71} DAD_PS, {8:72} DAD_SG, {20:91} DAD_SM.
  const mirvPool = [
    "{27:20}", // JAK_AR — Jakobs AR Tediore MIRV
    "{3:61}",  // JAK_PS — Jakobs Pistol Tediore MIRV
    "{9:65}",  // JAK_SG — Jakobs Shotgun Tediore MIRV
    "{24:68}", // JAK_SR — Jakobs Sniper Tediore MIRV
    "{10:74}", // MAL_SG — Maliwan Shotgun Tediore MIRV
    "{21:76}", // MAL_SM — Maliwan SMG Tediore MIRV
    "{25:76}", // MAL_SR — Maliwan Sniper Tediore MIRV
    "{15:63}", // ORD_AR — Order AR Tediore MIRV
    "{4:65}",  // ORD_PS — Order Pistol Tediore MIRV
    "{26:19}", // ORD_SR — Order Sniper Tediore MIRV
    "{7:77}",  // BOR_SG — Ripper Shotgun Tediore MIRV
    "{19:77}", // BOR_SM — Ripper SMG Tediore MIRV
    "{23:77}", // BOR_SR — Ripper Sniper Tediore MIRV
    "{14:10}", // TED_AR — Tediore AR Tediore MIRV
    "{5:10}",  // TED_PS — Tediore Pistol Tediore MIRV
    "{11:10}", // TED_SG — Tediore Shotgun Tediore MIRV
    "{17:69}", // TOR_AR — Torgue AR Tediore MIRV
    "{6:71}",  // TOR_PS — Torgue Pistol Tediore MIRV
    "{12:72}", // TOR_SG — Torgue Shotgun Tediore MIRV
    "{18:83}", // VLA_AR — Vladof AR Tediore MIRV
    "{22:83}", // VLA_SM — Vladof SMG Tediore MIRV
    "{16:84}", // VLA_SR — Vladof Sniper Tediore MIRV
  ];
  // Pick N unique codes from the pool (shuffle + slice).
  const mirvPickCount = { stable: 4, op: 6, insane: 8 }[modPowerMode];
  const mirvInserts: string[] = [...mirvPool]
    .sort(() => Math.random() - 0.5)
    .slice(0, mirvPickCount);

  // Class mod perk cross-insert {234:[...]} — embeds class mod skill perk IDs into the weapon.
  // Code 7 pattern: IDs 21,22,23,26,28,30,31 with repetition for weighting.
  // Terra's perfect gun: ID 42 appears 50×. Added with high weight.
  // Prefix 234 = class mod perks. Cross-inserting these imports skill behaviors into the weapon.
  const classModPerkIds = [42, 42, 42, 42, 42, 21, 21, 21, 22, 22, 22, 23, 26, 28, 28, 28, 30, 30, 30, 31, 31, 31, 31];
  const classModPerkCount = { stable: randInt(20, 35), op: randInt(28, 45), insane: randInt(35, 55) }[modPowerMode];
  const classModCrossInsert = [groupedToken(234, Array.from({ length: classModPerkCount }, () => pick(classModPerkIds)))];

  // ── Terra's cross-manufacturer enhancement & shield inserts (confirmed from perfect gun) ──
  // {287:[9×N]} = Tediore Shield manufacturer — Terra uses 150 stacks. Visual/behavior enhancer.
  const tedioreShieldCount = { stable: randInt(50, 80), op: randInt(75, 115), insane: randInt(100, 150) }[modPowerMode];
  const tedioreShieldInsert = [groupedToken(287, Array(tedioreShieldCount).fill(9))];

  // Enhancement manufacturer cross-inserts — Terra's exact pattern [1 1 9 9 2 2 3 3]:
  // {299} Daedalus, {268} Jakobs, {271} Maliwan, {292} Tediore (extra 9s in Terra's variant).
  const enhancementPattern = [1, 1, 9, 9, 2, 2, 3, 3];
  const tedioreEnhancementPattern = [9, 9, 2, 2, 3, 3, 9, 9, 9, 9, 9];
  const daedalusEnhInsert  = [groupedToken(299, enhancementPattern)];
  const jakobsEnhInsert    = [groupedToken(268, enhancementPattern)];
  const maliwanEnhInsert   = [groupedToken(271, enhancementPattern)];
  const tedioreEnhInsert   = [groupedToken(292, tedioreEnhancementPattern)];

  // {246:[...]} Shield body cross-insert — Terra's exact parts from perfect gun.
  const shieldBodyInsert = ["{246:[22 22 23 23 26 26 25 25 24 24 31 39 40 45 46 58 58]}"];

  // When auto-fill provides the stock base, use ONLY the universal element override (chosenElementId).
  // The weapon-specific elemental IDs (12, 14, 51, etc.) can resolve to wrong elements in-game.
  if (options.stockBaseDecoded) {
    // Single universal element — no weapon-specific altFire
    altFireTokens = [];
  } else if (nonSwitchElementIds.length > 0) {
    const wantMultiple = nonSwitchElementIds.length >= 2 && Math.random() < 0.5;
    const count = wantMultiple ? randInt(2, Math.min(nonSwitchElementIds.length, 4)) : 1;
    const chosen: number[] = [];
    const pool = [...nonSwitchElementIds];
    for (let i = 0; i < count && pool.length; i += 1) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool[idx]!);
      pool.splice(idx, 1);
    }
    altFireTokens = chosen.map((id) => `{1:${id}}`);
  } else {
    altFireTokens = [`{1:${chosenElementId}}`];
  }

  // ── Terra's grenade perk system ─────────────────────────────────────────────────────────────
  // Always on every gun — the {245:[...]} block drives visual effects based on which IDs are stacked.
  // Build grenade visual perk block(s).
  // When grenadeVisualRecipes is provided, pick one recipe at random and generate {245:[...]} token(s).
  // Scale factors: stable=0.35, op=0.65, insane=1.0. Each entry count gets ±20% jitter, min 1.
  // Each group in the recipe → one {245:[...]} token; multi-group recipes produce multiple tokens.
  // Elemental code swaps produce entirely new visuals — only the 245 block drives the visual.
  // Falls back to hardcoded Terra pattern when no recipes are provided.
  const randFloat = (lo: number, hi: number) => Math.random() * (hi - lo) + lo;
  // Map universal element override ID (56-60) to grenade element ID (24-28)
  // 56=Shock→28, 57=Radiation→27, 58=Corrosive→24, 59=Cryo→25, 60=Fire→26
  const ELEMENT_TO_GRENADE: Record<number, number> = { 56: 28, 57: 27, 58: 24, 59: 25, 60: 26 };
  const grenadeElementId = ELEMENT_TO_GRENADE[chosenElementId] ?? 24;
  // Recipe n values are the STABLE baseline. Effects are multiplicative so op/insane multiply up significantly.
  const scaleForMode = { stable: 1.0, op: 1.5, insane: 2.0 }[modPowerMode];
  // Perks that CRASH the game above a certain stack count — hard cap regardless of mode.
  // 73 = Expansive, 76 = Nuke — both crash above 5 stacks.
  const GRENADE_PERK_HARD_CAP: Record<number, number> = { 73: 5, 76: 5 };
  // IDs forbidden from the {245:[...]} block on weapons — NEVER include these regardless of source.
  // Most firmware IDs (1–20) are blocked, EXCEPT the 5 whitelisted ones below.
  // 70    = Overflow  (increases grenade charge count — meaningless/harmful on a weapon).
  // 71    = Express   (reduces grenade cooldown — meaningless/harmful on a weapon).
  // 87,88 = additional grenade firmware IDs.
  // Whitelisted firmware: 5=High Caliber, 6=Gadget Ahoy, 10=Deadeye, 17=Get Throwin', 20=Daed-dy O'
  const GRENADE_245_FIRMWARE_WHITELIST = [5, 6, 10, 17, 20];
  const GRENADE_245_FORBIDDEN = new Set(
    [1,2,3,4,7,8,9,11,12,13,14,15,16,18,19,70,71,87,88],
  );
  // Pick ONE whitelisted firmware per gun, stacked 1-3× (max 3), prepended to the {245:[...]} block.
  const firmwarePerkId = isClaudeGun ? 10 : pick(GRENADE_245_FIRMWARE_WHITELIST);  // Claude's Gun: Deadeye
  const firmwareStackCount = isClaudeGun ? 3 : randInt(1, 3);  // Claude's Gun: max stacks
  const firmwarePerkIds: number[] = Array(firmwareStackCount).fill(firmwarePerkId);
  const rawList = options.grenadeVisualRecipes ?? [];
  const recipes = rawList.filter((r) => {
    const g = (r as { groups?: unknown[]; group?: unknown }).groups ?? (r as { group?: unknown }).group;
    const groups = Array.isArray(g) ? g : g != null ? [g] : [];
    return groups.length > 0;
  });
  let terraGrenadePerkBlock: string;
  // ── Claude's Gun: "Thought Storm" grenade recipe ──────────────────────────────────────
  // Singularity core pulls enemies → Lingering radiation beams cook them → Artillery fires outward.
  // Two 245 groups: vortex setup, then payload. Signature visual: purple radiation vortex with
  // spinning beams and bullet streams firing from the center. Deadeye firmware (10×3) prepended.
  if (isClaudeGun) {
    const claudeScale = { stable: 1.0, op: 1.8, insane: 2.5 }[modPowerMode];
    const s = (n: number) => Math.max(1, Math.round(n * claudeScale * randFloat(0.9, 1.1)));
    const group1Ids = [
      27,                              // Radiation element anchor
      ...Array(s(20)).fill(33),   // Singularity dominant
      ...Array(s(12)).fill(60),   // Collapsing — maximum pull
      ...Array(s(8)).fill(46),    // Pulling — each child gets singularity
      ...Array(s(6)).fill(29),    // MIRV — splits into vortex children
      ...Array(s(3)).fill(40),    // Tightly Packed — extra MIRV count
      ...Array(s(5)).fill(59),    // Gnawing — DOT in the vortex
    ];
    const group2Ids = [
      ...firmwarePerkIds,           // Deadeye ×3
      ...Array(s(20)).fill(34),   // Lingering beams — radiation spin
      ...Array(s(8)).fill(21),    // Duration — beams last longer
      ...Array(s(5)).fill(63),    // Pulsing — elemental waves
      ...Array(s(15)).fill(32),   // Artillery — bullets from center
      ...Array(s(8)).fill(53),    // Artillery Duration
      ...Array(s(4)).fill(55),    // Missiles — homing from artillery
      ...Array(s(4)).fill(65),    // Fracture — radiation pillars
      ...Array(s(15)).fill(72),   // Explosive — damage amp
      ...Array(Math.min(5, s(5))).fill(73),  // Expansive (hard cap 5)
      ...Array(s(4)).fill(69),    // Penetrator — crits on pulled targets
      ...Array(s(4)).fill(39),    // Damage Amp
      ...Array(s(4)).fill(74),    // Hazardous — status stacking
      ...Array(s(3)).fill(79),    // Merciless — crit damage
    ];
    // Cap total to 300 IDs
    const allClaudeIds = [...group1Ids, ...group2Ids].slice(0, 300);
    const splitAt = group1Ids.length > 150 ? 150 : group1Ids.length;
    terraGrenadePerkBlock = `{245:[${allClaudeIds.slice(0, splitAt).join(" ")}]} {245:[${allClaudeIds.slice(splitAt).join(" ")}]}`;
  } else if (recipes.length > 0) {
    // Enforce grenade recipes: keep trying until we get at least one non-empty token.
    const remaining = [...recipes];
    let chosenTokens: string[] = [];
    let chosenRecipe: GrenadeVisualRecipe | null = null;
    while (remaining.length > 0 && chosenTokens.length === 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      const recipe = remaining[idx]!;
      remaining.splice(idx, 1);
      const recipeGroups: GrenadeVisualRecipeGroup[] = Array.isArray(recipe.groups) ? recipe.groups : [];
      // Cap total grenade perk IDs at 300 to stay within game's decoded string limit.
      // Multi-group recipes (e.g. Ride the Lightning with 19 groups) can exceed this easily.
      const MAX_GRENADE_PERK_IDS = 300;
      let totalIds = 0;
      const groupTokens: (string | null)[] = [];
      for (const group of recipeGroups) {
        if (totalIds >= MAX_GRENADE_PERK_IDS) break;
        const entries = group.entries ?? [];
        const ids: number[] = [];
        for (const entry of entries) {
          // Swap grenade element anchors (24-28) to match the gun's chosen element
          const entryId = [24, 25, 26, 27, 28].includes(entry.id) ? grenadeElementId : entry.id;
          if (GRENADE_245_FORBIDDEN.has(entryId)) continue;
          if (totalIds + ids.length >= MAX_GRENADE_PERK_IDS) break;
          const rawCount = Math.max(1, Math.round(entry.n * scaleForMode * randFloat(0.8, 1.2)));
          const count = GRENADE_PERK_HARD_CAP[entryId] !== undefined
            ? Math.min(rawCount, GRENADE_PERK_HARD_CAP[entryId])
            : rawCount;
          const remaining = MAX_GRENADE_PERK_IDS - totalIds - ids.length;
          const capped = Math.min(count, remaining);
          for (let i = 0; i < capped; i++) ids.push(entryId);
        }
        totalIds += ids.length;
        groupTokens.push(ids.length > 0 ? `{245:[${ids.join(" ")}]}` : null);
      }
      const validTokens = groupTokens.filter((t): t is string => t !== null);
      if (validTokens.length > 0 && validTokens.join(" ").trim().length > 0) {
        chosenTokens = validTokens;
        chosenRecipe = recipe;
      }
    }
    if (chosenTokens.length > 0) {
      // Inject whitelisted firmware into the first recipe token
      const firstToken = chosenTokens[0];
      const fwInject = firmwarePerkIds.join(" ");
      chosenTokens[0] = firstToken.replace("{245:[", `{245:[${fwInject} `);

      // Append style-matched complementary perks to the LAST token (preserves recipe sequence)
      // MIRV perks (29,40,41,42,43) included in ALL styles — MIRV goes with everything
      const MIRV_POOL = [29, 40, 41, 42, 43];
      const STYLE_COMPLEMENTS: Record<string, number[]> = {
        lingering:    [21, 62, 63, 64, 65, 34, 35, 36, 37, 38, ...MIRV_POOL],  // Duration, Pulsing, Splat Pack, Fracture, element variants + MIRV
        singularity:  [33, 46, 58, 59, 60, 61, ...MIRV_POOL],                    // Pull, Prolonged, Gnawing, Collapsing, Repulsor + MIRV
        artillery:    [32, 53, 54, 55, 57, ...MIRV_POOL],                         // Artillery, Duration, Ricochet, Missiles, Mortar + MIRV
        mirv:         [29, 40, 41, 42, 43, 22, 30, 44, 45, 47],                  // MIRV chain + Spawning, Divider, Long Division, Splinter, Repeater
        hybrid:       [29, 40, 42, 69, 39, 72, 74],                               // MIRV core + Penetrator, Damage Amp, Explosive, Hazardous
      };
      const recipeStyle = chosenRecipe?.style?.toLowerCase() ?? "";
      const stylePool = STYLE_COMPLEMENTS[recipeStyle];
      if (stylePool && stylePool.length > 0) {
        const complementCount = { stable: randInt(2, 4), op: randInt(3, 6), insane: randInt(4, 8) }[modPowerMode];
        const shuffled = [...stylePool].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, Math.min(complementCount, shuffled.length));
        const complementStacks = chosen.flatMap((id) => {
          const stackSize = Math.max(1, Math.round(randInt(3, 8) * scaleForMode));
          return Array(stackSize).fill(id);
        });
        // Append to last token — after the recipe sequence
        const lastIdx = chosenTokens.length - 1;
        chosenTokens[lastIdx] = chosenTokens[lastIdx]!.replace(/\]\}$/, ` ${complementStacks.join(" ")}]}`);
      }

      terraGrenadePerkBlock = chosenTokens.join(" ");
    } else {
      const baseHeavyStack = { stable: randInt(6, 8), op: randInt(8, 9), insane: 10 }[modPowerMode];
      const dominantStack  = { stable: randInt(16, 24), op: randInt(23, 35), insane: randInt(30, 45) }[modPowerMode];
      const heavyStack2    = { stable: randInt(10, 16), op: randInt(14, 22), insane: randInt(18, 28) }[modPowerMode];
      const terraPerkIds: number[] = [
        ...firmwarePerkIds,
        ...Array(dominantStack).fill(72),
        ...Array(heavyStack2).fill(39),
        ...Array(heavyStack2).fill(75),
        ...[21, 22, 30, 34, 35, 36, 37, 38, 44, 45, 63, 64, 65, 69, 73, 77, 78, 79].flatMap((id) => Array(baseHeavyStack).fill(id)),
        grenadeElementId, 40, 53, 62, 66, 76,
        77, 21,
      ].filter((id) => !GRENADE_245_FORBIDDEN.has(id));
      terraGrenadePerkBlock = `{245:[${terraPerkIds.join(" ")}]}`;
    }
  } else {
    // Terra's perfect gun fallback pattern: 72 dominant visual, then secondary + standard perks.
    const baseHeavyStack = { stable: randInt(6, 8), op: randInt(8, 9), insane: 10 }[modPowerMode];
    const dominantStack  = { stable: randInt(16, 24), op: randInt(23, 35), insane: randInt(30, 45) }[modPowerMode];
    const heavyStack2    = { stable: randInt(10, 16), op: randInt(14, 22), insane: randInt(18, 28) }[modPowerMode];
    const terraPerkIds: number[] = [
      ...firmwarePerkIds,
      ...Array(dominantStack).fill(72),
      ...Array(heavyStack2).fill(39),
      ...Array(heavyStack2).fill(75),
      ...[21, 22, 30, 34, 35, 36, 37, 38, 44, 45, 63, 64, 65, 69, 73, 77, 78, 79].flatMap((id) => Array(baseHeavyStack).fill(id)),
      24, 40, 53, 62, 66, 76,
      77, 21,
    ].filter((id) => !GRENADE_245_FORBIDDEN.has(id));
    terraGrenadePerkBlock = `{245:[${terraPerkIds.join(" ")}]}`;
  }
  // {298:11} = Torgue grenade anchor — Terra's perfect gun uses this (not {291:8}).
  // {291:8} = Vladof Waterfall grenade — wraps {245:[...]} on both sides for grenade reload.
  const torgueGrenadeAnchor = "{298:11}";
  const vladofGrenadeAnchor = "{291:8}";

  // Grenade system: {298:11} Torgue anchor + {291:8} Vladof waterfall wrap the {245:[...]} perk block.
  // No extra legendary grenade wrapper — Torgue + Vladof anchors are sufficient.
  const grenadeParts: string[] =
    options.specialMode === "inf-ammo"
      ? []
      : [torgueGrenadeAnchor, vladofGrenadeAnchor, terraGrenadePerkBlock, vladofGrenadeAnchor];

  const finalGrenadeParts = grenadeParts;

  // Other heavy enhancement stacks were cleared as part of the simplified rules; no generic enhancement/stalker stacks.

  // NOTE: stockMagToken removed — placing the weapon's native magazine at the end caused COV-type
  // heat-gauge magazines to override the stacked Vladof mag. The game reads the last magazine token
  // as the active one. The stacked {18:[14×N]} Vladof mag in stockBase is the only magazine needed.

  // ── ASSEMBLY ORDER ────────────────────────────────────────────────────────────────────────
  // 1. Full stock weapon base (rarity → body → barrel → mag → grip → scope → mfg parts)
  //    The game needs every stock slot filled or the weapon won't spawn.
  // 2. Modded additions on top (extra barrels, stacks, grenade reload, underbarrel).
  // 3. Stock magazine last — gives spawner a native mag code, renders after everything else
  //    so it doesn't override the visual during firing.
  // Rarity code matched to visual barrel — so the gun's NAME matches its visual.
  // e.g. Hellwalker barrel {9:82} → rarity {9:83} → gun displays as "Hellwalker"
  // Fallback: {11:82} Eigenburst if visual barrel has no mapping.
  const VISUAL_BARREL_RARITY: Record<string, string> = {
    "{2:1}": "{2:54}",     // Zipper
    "{6:54}": "{6:1}",     // Roach
    "{7:64}": "{7:100}",   // Convergence
    "{8:52}": "{8:53}",    // Bod (talks!)
    "{8:54}": "{8:55}",    // Acey May
    "{8:57}": "{8:58}",    // Missilaser
    "{9:82}": "{9:83}",    // Hellwalker (pentagram shots)
    "{9:86}": "{9:85}",    // Rainbow Vomit
    "{9:90}": "{9:80}",    // TKs Wave
    "{10:56}": "{10:1}",   // Kaleidosplode
    "{10:58}": "{10:57}",  // Sweet Embrace
    "{10:62}": "{10:80}",  // Mantra
    "{11:77}": "{11:78}",  // Forsaken Chaos
    "{11:81}": "{11:82}",  // Eigenburst
    "{12:56}": "{12:57}",  // Lead Balloon
    "{13:57}": "{13:72}",  // Lumberjack
    "{13:77}": "{13:73}",  // Star Helix
    "{14:78}": "{14:35}",  // LaserDisc
    "{16:68}": "{16:69}",  // Midnight Defiance
    "{18:64}": "{18:65}",  // Wombo Combo
    "{18:99}": "{18:63}",  // Bubbles
    "{19:17}": "{19:1}",   // Prince Harming
    "{19:20}": "{19:19}",  // Hellfire
    "{21:59}": "{21:60}",  // Ohm I Got
    "{21:62}": "{21:63}",  // Plasma Coil
    "{21:80}": "{21:60}",  // Songbird
    "{22:66}": "{22:67}",  // Kaoson
    "{22:68}": "{22:1}",   // Onslaught
    "{22:87}": "{22:88}",  // Birts Bees
    "{22:91}": "{22:1}",   // Mercury
    "{23:20}": "{23:19}",  // Stray
    "{25:20}": "{25:59}",  // Complex Root
    "{25:60}": "{25:61}",  // Katagawas Revenge
    "{25:81}": "{25:82}",  // Conflux
    "{27:73}": "{27:1}",   // Bonnie and Clyde
  };
  const pearlRarityToken = VISUAL_BARREL_RARITY[chosenVisualBarrel] ?? pick(["{11:82}", "{25:82}"]);

  // Removed: extreme same-prefix stacking and body ×10 repeats (bloat without synergy).

  // {292:[9×10]} Tediore Enhancement "Divider" — Terra confirmed: always exactly 10 stacks on every gun.
  const dividerStacks = [groupedToken(292, Array(10).fill(9))];

  // ALL 6 elements — Terra's approach: {1:[55 56 57 58 59 60]} gives the gun every element type.
  // chosenElementId still used for grenade block element matching.
  const extendedElementTokens = ["{1:[55 56 57 58 59 60]}"];

  // ── STOCK BASE ──────────────────────────────────────────────────────────────────────────
  // When stockBaseDecoded is provided (from auto-fill), use it as the complete stock weapon.
  // This guarantees all required slots are filled → 100% spawn rate.
  // Otherwise fall back to hand-building (legacy path).
  const stockBaseParts: string[] = (() => {
    if (options.stockBaseDecoded) {
      // Parse the parts section from the decoded string: "prefix, ...|| PARTS |"
      const partsMatch = options.stockBaseDecoded.match(/\|\|\s*(.+?)\s*\|/);
      if (partsMatch?.[1]) {
        // Parse tokens and convert simple {xx} to explicit {prefix:xx} to avoid ambiguity.
        // Without this, {1} could be misread as elemental prefix 1 instead of "part 1 of this weapon."
        const parsed = parseComponentString(partsMatch[1].trim());
        return parsed
          .filter((c) => typeof c !== "string")
          .map((c) => {
            if (typeof c === "string") return c;
            // Simple tokens like {42} → convert to {headerPrefix:42}
            if (c.type === "simple") return `{${headerPrefix}:${c.id}}`;
            // Everything else (grouped, cross-prefix) stays as-is
            return c.raw;
          });
      }
    }
    // Legacy fallback: hand-build stock base (magazineToken added separately in assembly)
    return [
      firstRarityCode,
      bodyToken,
      ...bodyAccessoryStack,
      primaryBarrelToken,
      ...barrelAccessoryStack,
      ...(gripToken ? [gripToken] : []),
      ...(scopeToken ? [scopeToken] : []),
      ...manufacturerTokens,
    ];
  })();

  const allNewParts = [
    // ── Pearl rarity FIRST — rarity = first token wins (Rule 11) ──
    pearlRarityToken,
    // ── Visual barrel BEFORE stock base — game reads left-to-right, leftmost barrel sets the visual ──
    ...(uniqueFirstBarrelToken ? [uniqueFirstBarrelToken] : []),
    // ── Extended elements early — Terra places these right after Pearl rarity ──
    ...extendedElementTokens,
    // ── Stock base (from auto-fill or hand-built) — all required slots filled ──
    ...stockBaseParts,
    // Vladof 50-round stacked magazine — ammo capacity mod on top of stock mag
    magazineToken,
    // Heavy barrel accessories on ALL guns (MIRV, Two-Shot, Triple Barrel, etc.)
    ...heavyBarrelAccessoryTokens,

    // ── Modded additions ──
    ...altFireTokens,
    homingToken,                                             // {273:1} — barrel accessory, stays here
    scanningHomingToken,                                     // {273:29} — barrel accessory, stays here
    ...(daedalusShotgunAmmoToken ? [daedalusShotgunAmmoToken] : []),
    ...homingStacks273,
    ...damageStacks,
    ...weaponTypeDamageStacks,
    ...movementSpeedStacks,
    ...fireRateStacks,
    ...freeChargerStacks,
    ...heatExchangeStacks,
    ...orderSrMagStacks,
    ...angelsShareStacks,
    ...ventilatorStacks,
    ...exemplarStacks,
    ...jakobsCritStacks,
    ...vladofSmgDmgStacks,
    ...vladofArBarrelStacks,
    ...mirvInserts,                                          // Tediore MIRV cross-inserts
    ...classModCrossInsert,
    ...tedioreShieldInsert,                                  // {287:[9×N]} Tediore Shield
    ...daedalusEnhInsert,                                    // {299:[1 1 9 9 2 2 3 3]}
    ...jakobsEnhInsert,                                      // {268:[1 1 9 9 2 2 3 3]}
    ...maliwanEnhInsert,                                     // {271:[1 1 9 9 2 2 3 3]}
    ...tedioreEnhInsert,                                     // {292:[9 9 2 2 3 3 9 9 9 9 9]}
    ...shieldBodyInsert,                                     // {246:[...]}
    ...dividerStacks,
    // Terra grenade perk block — drives visual effects
    ...finalGrenadeParts,
    // Foregrip — only from legacy path
    ...(options.stockBaseDecoded ? [] : foregripToken ? [foregripToken] : []),
    // Underbarrel — ALWAYS added from desirable list or legacy path
    ...(options.stockBaseDecoded ? [] : underbarrelAccessoryStack),
    ...(underbarrelToken ? [underbarrelToken] : []),
    // ── Effect BARRELS at END — "as far away as possible" from visual barrel (Terra's rule) ──
    // Only actual barrels here, not accessories or non-barrel tokens
    ...seamstressExtras,                                     // {13:70} + {11:75} Anarchy + {11:81} Eigenburst (only if Seamstress UB)
    multiProjectileToken,                                    // {289:[17 16 17]} MIRV/Two-Shot barrels
    ...rowansChargeStacks,                                   // {27:[75×N]} Stalker / Rowan's Charge
    ...samePrefixBarrelParts,                                // Extra same-prefix barrels
    ...crossParts,                                           // Cross-prefix barrels
    "{11:75}",                                               // Flight barrel — absolute last

    // stockMagToken removed — was causing COV magazines to override Vladof mag (game uses last mag token).
  ];
  if (!allNewParts.length) throw new Error("Could not build random modded parts.");

  const finalParts = parseComponentString(allNewParts.join(" ")).filter((c) => typeof c !== "string");
  const newComponentStr = finalParts
    .map((p) => (typeof p === "string" ? p : p.raw))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const safeSkin = chosenSkin ? chosenSkin.replace(/"/g, '\\"') : "";
  const updatedDecoded = safeSkin
    ? `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} | "c", "${safeSkin}" |`
    : `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} |`;

  // Spawn safety: if a COV magazine override is present, regenerate (instead of patching/replacing tokens).
  // Detect COV magazine codes from the universal DB and search explicit {prefix:part} + {prefix:[...]} tokens.
  const covMagazineCodes = (() => {
    const set = new Set<string>();
    for (const row of universalPartCodes) {
      if (norm(row.partType) !== "magazine") continue;
      if (!/cov/.test(norm(row.manufacturer ?? ""))) continue;
      const p = parseCodePair(row.code);
      if (!p) continue;
      set.add(`${p.prefix}:${p.part}`);
    }
    return set;
  })();
  if (covMagazineCodes.size > 0) {
    // Also detect "simple" tokens {id} which imply {headerPrefix:id} for the current weapon prefix.
    const covMagazineSimpleIds = (() => {
      const set = new Set<number>();
      for (const row of weaponRows) {
        if (norm(row.partType) !== "magazine") continue;
        const m = norm(row.manufacturer ?? "");
        const s = norm(`${row.string ?? ""} ${row.stat ?? ""}`);
        if (!/\bcov\b/.test(m) && !/\bcov\b/.test(s) && !/heat\s*gauge/.test(s)) continue;
        const id = Number(row.partId);
        if (Number.isFinite(id)) set.add(id);
      }
      return set;
    })();
    const hasCov = finalParts.some((p) => {
      if (typeof p === "string") return false;
      if (p.type === "simple") return covMagazineSimpleIds.has(p.id);
      if (p.type === "part") return covMagazineCodes.has(`${p.mfgId}:${p.id}`);
      if (p.type === "group") return p.subIds.some((sid) => covMagazineCodes.has(`${p.id}:${sid}`));
      return false;
    });
    if (hasCov) {
      if (retryDepth < 10) {
        return generateModdedWeapon(weaponEditData, universalPartCodes, { ...(options as object), __retryDepth: retryDepth + 1 } as GenerateModdedWeaponOptions);
      }
      throw new Error("Generated weapon had a COV magazine override; try again.");
    }
  }

  // DPS estimate — uses real base stats from the barrel's String field.
  const dmgStackCount = countGroupedStacks(damageStacks);
  const critStackCount = countGroupedStacks(weaponTypeDamageStacks);
  const frStackCount = countGroupedStacks(fireRateStacks);
  const baseDamagePerShot = barrelStats.damage * barrelStats.pellets;
  const baseFireRate = barrelStats.fireRate;
  const baseDps = baseDamagePerShot * baseFireRate;
  // Multiplicative compounding — each stack multiplies on top of previous ones.
  // Calibrated from in-game data: 9% per +Dmg, 3% per +Crit at 30% rate, 5% per +FR.
  // Example: 62 dmg + 7 crit + 47 FR → estimated 9.46M vs actual 9.63M (98% accuracy).
  const dmgMultiplier = Math.pow(1.09, dmgStackCount);
  const critMultiplier = Math.pow(1 + 0.03 * 0.30, critStackCount);
  const frMultiplier = Math.pow(1.05, frStackCount);
  const estimatedDps = baseDps * dmgMultiplier * critMultiplier * frMultiplier;

  return {
    code: updatedDecoded,
    dps: {
      barrelName: isClaudeGun ? "Claude's Convergence" : barrelStats.name,
      baseDamagePerShot,
      baseFireRate,
      baseDps,
      damageStackCount: dmgStackCount,
      critStackCount,
      fireRateStackCount: frStackCount,
      estimatedDps,
    },
    ...(isClaudeGun ? { isClaudeGun: true } : {}),
  };
}
