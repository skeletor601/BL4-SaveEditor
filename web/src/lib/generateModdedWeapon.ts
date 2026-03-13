/**
 * Shared modded weapon generator. Returns a single-line decoded weapon string.
 * Used by Unified Item Builder (in-place) and can be used by Weapon Edit view.
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
  manufacturer?: string;
  statText?: string;
  string?: string;
  partName?: string;
  uniqueEffect?: boolean;
  visualUniqueBarrel?: boolean;
}

export interface GenerateModdedWeaponOptions {
  level?: number;
  modPowerMode?: "stable" | "op" | "insane";
  skin?: string;
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

/** Underbarrels that do nothing - never pick these. */
const UNDERBARREL_EXCLUDED = /\batlas\b.*\btracker\b.*\bdart\b|\btracker\s*dart\b|\btracker\s+grenade\b|\bgrenade\s+tracker\b/i;
/** Only pick underbarrels that match these (Seamstress, Spread Launcher, Grenade Launcher, etc.). */
const UNDERBARREL_ALLOWED =
  /seamstress|needle\s*launcher|spread\s*launcher|beam\s*tosser|energy\s*disc|fragcendiary|singularity|grenade\s*launcher|missile\s*launcher|micro\s*rocket|gravity\s*well|death\s*sphere|airstrike|flame\s*thrower|flamethrower|underbarrel\s*launcher|rocket\s*launcher|frag\s*launcher/i;

function isAllowedUnderbarrel(row: WeaponEditPartRow): boolean {
  const t = `${(row.stat ?? "").trim()} ${(row.string ?? "").trim()}`.toLowerCase();
  if (UNDERBARREL_EXCLUDED.test(t)) return false;
  return UNDERBARREL_ALLOWED.test(t);
}

/**
 * Generates a random modded weapon decoded string (single line).
 * @throws Error with user-facing message on failure
 */
export function generateModdedWeapon(
  weaponEditData: WeaponEditData,
  universalPartCodes: UniversalDbPartCode[],
  options: GenerateModdedWeaponOptions = {},
): string {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const modPowerMode = options.modPowerMode ?? "op";
  const level = Math.max(1, Math.min(255, Math.trunc(options.level ?? 50)));
  const chosenSkin = (options.skin ?? "").trim();

  const modeCfg = {
    stable: {
      exemplarCycleRepeats: [8, 24] as const,
      exemplarAmmoCount: [12, 48] as const,
      exemplarFireCount: [10, 36] as const,
      useStabilityGroupChance: 0.7,
      bodyAccRange: [4, 8] as const,
      barrelAccRange: [4, 8] as const,
      extraBarrelsRange: [4, 10] as const,
      crossBarrelRange: [2, 5] as const,
      grenadePerkRange: [16, 52] as const,
      underAccRange: [1, 3] as const,
      statRange: [2, 6] as const,
      enhancementRepeatRange: [0, 6] as const,
    },
    op: {
      exemplarCycleRepeats: [16, 72] as const,
      exemplarAmmoCount: [24, 140] as const,
      exemplarFireCount: [18, 90] as const,
      useStabilityGroupChance: 0.45,
      bodyAccRange: [4, 12] as const,
      barrelAccRange: [4, 12] as const,
      extraBarrelsRange: [8, 22] as const,
      crossBarrelRange: [4, 10] as const,
      grenadePerkRange: [24, 120] as const,
      underAccRange: [1, 6] as const,
      statRange: [3, 10] as const,
      enhancementRepeatRange: [8, 48] as const,
    },
    insane: {
      exemplarCycleRepeats: [56, 180] as const,
      exemplarAmmoCount: [120, 420] as const,
      exemplarFireCount: [90, 320] as const,
      useStabilityGroupChance: 0.85,
      bodyAccRange: [8, 20] as const,
      barrelAccRange: [8, 24] as const,
      extraBarrelsRange: [18, 48] as const,
      crossBarrelRange: [8, 20] as const,
      grenadePerkRange: [80, 280] as const,
      underAccRange: [3, 10] as const,
      statRange: [8, 20] as const,
      enhancementRepeatRange: [24, 120] as const,
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

  const isBarrelExcluded = (text: string) => /\bnoisy\s*cricket\b|kaleidosplode/.test(norm(text));
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
    return hasBody && hasBarrel && hasMagazine;
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

  const headerPrefix = pick(validPrefixes);
  const seed = String(randInt(1000, 9999));
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
  const toPartIdsMagazineNoCharge = (): number[] => {
    const magRows = weaponRows.filter((r) => norm(r.partType) === "magazine");
    const noCharge = magRows.filter(
      (r) => !/\bcharge\s*time\b|\bmaximum\s*charge\b|\bcharge\s*up\b|\bcharging\b/.test(norm(`${r.stat} ${r.string}`)),
    );
    return (noCharge.length ? noCharge : magRows)
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
  const pickMagazineToken = (): string | null => {
    const ids = toPartIdsMagazineNoCharge();
    if (!ids.length) return null;
    return `{${pick(ids)}}`;
  };
  const groupedToken = (prefix: number, ids: number[]): string => `{${prefix}:[${ids.join(" ")}]}`;
  const repeatPattern = (ids: number[], repeats: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < repeats; i += 1) out.push(...ids);
    return out;
  };
  const stackTokens = (types: string[], minCount: number, maxCount: number): string[] => {
    const ids = toPartIds(types);
    if (!ids.length) return [];
    const count = randInt(minCount, maxCount);
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) out.push(`{${pick(ids)}}`);
    return out;
  };

  const addStatStacks = (
    matcher: (text: string) => boolean,
    minCount: number,
    maxCount: number,
  ): string[] => {
    const nonRarityCandidates = candidates.filter(({ row }) => norm(row.partType) !== "rarity");
    const local = nonRarityCandidates.filter(
      ({ row, parsed }) =>
        parsed.prefix === headerPrefix && validCurrentPartIds.has(parsed.part) && matcher(norm(row.statText)),
    );
    const fallback = nonRarityCandidates.filter(({ row }) => matcher(norm(row.statText)));
    const pool = local.length ? local : fallback;
    if (!pool.length) return [];
    const outTokens: string[] = [];
    const byPrefix = new Map<number, number[]>();
    const picks = randInt(minCount, maxCount);
    for (let i = 0; i < picks; i += 1) {
      const c = pick(pool);
      const pfx = c.parsed.prefix;
      if (pfx === headerPrefix) outTokens.push(`{${c.parsed.part}}`);
      else {
        if (!byPrefix.has(pfx)) byPrefix.set(pfx, []);
        byPrefix.get(pfx)!.push(c.parsed.part);
      }
    }
    for (const [pfx, ids] of byPrefix.entries()) {
      if (!ids.length) continue;
      outTokens.push(`{${pfx}:[${ids.join(" ")}]}`);
    }
    return outTokens;
  };

  const exemplarDamageGroup = groupedToken(
    9,
    repeatPattern([28, 32, 40, 55, 59, 62, 68], randInt(modeCfg.exemplarCycleRepeats[0], modeCfg.exemplarCycleRepeats[1])),
  );
  const exemplarAmmoGroup = groupedToken(
    22,
    Array.from({ length: randInt(modeCfg.exemplarAmmoCount[0], modeCfg.exemplarAmmoCount[1]) }, () => 72),
  );
  const exemplarFireGroup = groupedToken(
    292,
    Array.from({ length: randInt(modeCfg.exemplarFireCount[0], modeCfg.exemplarFireCount[1]) }, () => 9),
  );
  const exemplarStabilityGroup =
    Math.random() < modeCfg.useStabilityGroupChance
      ? [groupedToken(14, Array.from({ length: randInt(8, 42) }, () => 3))]
      : [];

  const damageStacks = [
    exemplarDamageGroup,
    ...addStatStacks(
      (text) => /\bdamage\b|\bsplash\b|\bbonus damage\b|\bgun damage\b|\bmelee damage\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
    ),
  ];
  const ammoStacks = [
    exemplarAmmoGroup,
    ...addStatStacks(
      (text) =>
        // Prefer ammo/shot count, but avoid explicit magazine size perks.
        (/\bammo\b|\bshots?\b/.test(text)) &&
        !/\bmag(azine)?\s*size\b|\bmagsize\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
    ),
  ];
  const fireRateStacks = [
    exemplarFireGroup,
    ...exemplarStabilityGroup,
    ...addStatStacks(
      (text) => /\bfire rate\b|\/s fr\b|\bfr\b/.test(text),
      modeCfg.statRange[0],
      modeCfg.statRange[1],
    ),
  ];

  const barrelRowOk = (r: WeaponEditPartRow) => !isBarrelExcluded(norm(`${r.stat ?? ""} ${r.string ?? ""}`));
  const mappedLegendaryBarrels = Array.from(legendaryBarrelIdsByPrefix.get(headerPrefix) ?? []).filter((id) =>
    validCurrentPartIds.has(id),
  );
  const samePrefixBarrels = mappedLegendaryBarrels.length
    ? mappedLegendaryBarrels
    : weaponRows
        .filter((r) => norm(r.partType) === "barrel" && isSpecialRarity(r) && barrelRowOk(r))
        .map((r) => Number(r.partId))
        .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
  const anyPrefixBarrels = weaponRows
    .filter((r) => norm(r.partType) === "barrel" && barrelRowOk(r))
    .map((r) => Number(r.partId))
    .filter((n) => Number.isFinite(n) && validCurrentPartIds.has(n));
  const usableSamePrefixBarrels = samePrefixBarrels.length ? samePrefixBarrels : anyPrefixBarrels;
  if (!usableSamePrefixBarrels.length) throw new Error("Could not build stock weapon core: missing Barrel for selected prefix.");

  const uniqueEffectBarrels = candidates.filter(({ row }) => {
    if (norm(row.partType) !== "barrel") return false;
    if (row.visualUniqueBarrel === true || row.uniqueEffect === true) return true;
    const t = norm(`${row.statText ?? ""} ${row.string ?? ""} ${row.partName ?? ""}`);
    if (isBarrelExcluded(t)) return false;
    return /\bunique\b|\balt(ernate)?\s*(fire|barrel)?\b|\bappearance\b|\bvisual\b|\bdifferent\s*look\b/i.test(t);
  });
  const samePrefixUniqueBarrels = uniqueEffectBarrels.filter(
    ({ parsed }) => parsed.prefix === headerPrefix && validCurrentPartIds.has(parsed.part),
  );
  const crossUniqueBarrels = uniqueEffectBarrels.filter(({ parsed }) => parsed.prefix !== headerPrefix);
  const allUniqueBarrels = [...samePrefixUniqueBarrels, ...crossUniqueBarrels];
  const useUniqueBarrel = allUniqueBarrels.length > 0 && (Math.random() < 0.85);
  const uniqueFirstBarrelToken = useUniqueBarrel && allUniqueBarrels.length
    ? (() => {
        const u = pick(allUniqueBarrels);
        return u.parsed.prefix === headerPrefix ? `{${u.parsed.part}}` : `{${u.parsed.prefix}:${u.parsed.part}}`;
      })()
    : "";
  const primaryBarrelToken = `{${pick(usableSamePrefixBarrels)}}`;
  const crossPrefixBarrels = Array.from(weaponRowsByPrefix.entries()).flatMap(([pfx, rows]) => {
    if (pfx === headerPrefix) return [];
    const idsInPrefix = new Set(rows.map((r) => Number(r.partId)).filter((n) => Number.isFinite(n)));
    const mapped = Array.from(legendaryBarrelIdsByPrefix.get(pfx) ?? []).filter((id) => idsInPrefix.has(id));
    if (mapped.length) return mapped.map((part) => ({ prefix: pfx, part }));
    return rows
      .filter((r) => norm(r.partType) === "barrel" && isSpecialRarity(r) && barrelRowOk(r))
      .map((r) => ({ prefix: pfx, part: Number(r.partId) }))
      .filter((x) => Number.isFinite(x.part));
  });
  const samePrefixBarrelParts: string[] = [];
  for (let i = 0; i < randInt(modeCfg.extraBarrelsRange[0], modeCfg.extraBarrelsRange[1]); i += 1) {
    if (!usableSamePrefixBarrels.length) break;
    samePrefixBarrelParts.push(`{${pick(usableSamePrefixBarrels)}}`);
  }
  const crossByPrefix = new Map<number, number[]>();
  const crossPickCount = randInt(modeCfg.crossBarrelRange[0], modeCfg.crossBarrelRange[1]);
  for (let i = 0; i < crossPickCount; i += 1) {
    if (!crossPrefixBarrels.length) break;
    const c = pick(crossPrefixBarrels);
    if (!crossByPrefix.has(c.prefix)) crossByPrefix.set(c.prefix, []);
    crossByPrefix.get(c.prefix)!.push(c.part);
  }
  const crossParts = Array.from(crossByPrefix.entries()).map(
    ([prefix, parts]) => `{${prefix}:[${parts.join(" ")}]}`,
  );
  const barrelAccessoryStack = stackTokens(
    ["barrel accessory"],
    modeCfg.barrelAccRange[0],
    modeCfg.barrelAccRange[1],
  );
  if (toPartIds(["barrel accessory"]).length > 0 && barrelAccessoryStack.length < 4) {
    throw new Error("Could not build stock weapon core: missing enough Barrel Accessory parts.");
  }

  const magazineToken = pickMagazineToken();
  if (!magazineToken) throw new Error("Could not build stock weapon core: missing Magazine.");
  const gripToken = pickToken(["grip"]);
  const scopeToken = pickToken(["scope"]);
  const manufacturerPartsCount =
    weaponManufacturer.includes("tediore") ||
    candidates.some(
      ({ row, parsed }) =>
        parsed.prefix === headerPrefix && /\btediore\b|\breload\b/.test(norm(row.statText)),
    )
      ? randInt(2, 5)
      : 1;
  const baseManufacturerTokens =
    manufacturerPartsCount <= 1
      ? (() => {
          const t = pickToken(["manufacturer part"]);
          return t ? [t] : [];
        })()
      : stackTokens(["manufacturer part"], manufacturerPartsCount, manufacturerPartsCount);
  // Tediore reload options: ensure at least one such part on every gun.
  const tedioreReloadCandidates = candidates.filter(({ row }) => {
    const t = norm(row.statText ?? "");
    return /\btediore\b/.test(t) && /\breload\b|\bthrown\b|\bthrow\b/.test(t);
  });
  const manufacturerTokens =
    tedioreReloadCandidates.length > 0
      ? (() => {
          const chosen = pick(tedioreReloadCandidates);
          const reloadToken =
            chosen.parsed.prefix === headerPrefix
              ? `{${chosen.parsed.part}}`
              : `{${chosen.parsed.prefix}:${chosen.parsed.part}}`;
          return [...baseManufacturerTokens, reloadToken];
        })()
      : baseManufacturerTokens;
  const currentWeaponTypeNorm = norm(weaponRows[0]?.weaponType ?? "");
  const daedalusAltAmmoCandidates = candidates.filter(
    ({ row }) =>
      norm(row.partType) === "manufacturer part" &&
      norm(row.manufacturer) === "daedalus" &&
      (!currentWeaponTypeNorm || norm(row.itemType) === currentWeaponTypeNorm),
  );
  const shouldUseDaedalusAltAmmo = daedalusAltAmmoCandidates.length > 0 && Math.random() < 0.35;
  const daedalusAltAmmoToken = shouldUseDaedalusAltAmmo
    ? (() => {
        const c = pick(daedalusAltAmmoCandidates);
        return c.parsed.prefix === headerPrefix ? `{${c.parsed.part}}` : `{${c.parsed.prefix}:${c.parsed.part}}`;
      })()
    : "";
  // Never select a foregrip part for these modded builds.
  const foregripToken: string | null = null;

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
    .filter((e) => !/\bswitch\s+between\b/.test(norm(e.stat ?? "")))
    .map((e) => Number(e.partId))
    .filter((n) => Number.isFinite(n));
  let altFireTokens: string[] = [];
  let shouldUseUnderbarrelAlt = true;
  const bodyToken = pickToken(["body"]);
  if (!bodyToken) throw new Error("Could not build stock weapon core: missing Body.");
  const bodyAccessoryStack = stackTokens(
    ["body accessory"],
    modeCfg.bodyAccRange[0],
    modeCfg.bodyAccRange[1],
  );
  if (toPartIds(["body accessory"]).length > 0 && bodyAccessoryStack.length < 4) {
    throw new Error("Could not build stock weapon core: missing enough Body Accessory parts.");
  }

  let underbarrelToken = "";
  let underbarrelAccessoryStack: string[] = [];
  const underbarrelInfiniteAmmoToken = "{27:[75 75 75 75 75 75 75]}";
  if (shouldUseUnderbarrelAlt) {
    const preferCross = crossPrefixUnderbarrels.length > 0 && Math.random() < 0.65;
    if (preferCross && crossPrefixUnderbarrels.length > 0) {
      const u = pick(crossPrefixUnderbarrels);
      underbarrelToken = `{${u.prefix}:${u.part}}`;
    }
    if (!underbarrelToken) underbarrelToken = pickUnderbarrelToken() ?? "";
    if (!underbarrelToken && crossPrefixUnderbarrels.length > 0) {
      const u = pick(crossPrefixUnderbarrels);
      underbarrelToken = `{${u.prefix}:${u.part}}`;
    }
    if (!underbarrelToken && nonSwitchElementIds.length >= 2) {
      const first = pick(nonSwitchElementIds);
      const secondPool = nonSwitchElementIds.filter((id) => id !== first);
      const second = secondPool.length ? pick(secondPool) : null;
      if (second != null) {
        altFireTokens = [`{1:${first}}`, `{1:${second}}`];
        shouldUseUnderbarrelAlt = false;
      }
    }
    if (shouldUseUnderbarrelAlt && !underbarrelToken) {
      throw new Error("Could not apply alt-fire mode: no underbarrel available and no dual-element fallback.");
    }
    // Exactly one underbarrel accessory, but ONLY if it clearly complements the chosen underbarrel.
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

  const multiProjectileToken = "{289:[17 17 17 17 17]}";
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
    return /\bseamstress\b|\bneedle\s*launcher\b/.test(t);
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
  const homingStacks273 = isNeedleLauncherUnderbarrel
    ? [groupedToken(273, Array.from({ length: randInt(8, 24) }, () => 1))]
    : [];

  if (underbarrelToken && nonSwitchElementIds.length > 0) {
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
  }

  // Grenade reload block: always add on every gun.
  // Pattern: {267:1} {245:[...grenade perks...]} {267:3} OR {291:8} {245:[...]} {291:9}
  const grenadeParts: string[] = [];
  const grenadePerkPool = candidates.filter(
    ({ parsed, row }) => parsed.prefix === 245 && norm(row.partType) !== "rarity",
  );
  // Filter 245 perks down to ones mentioning fire or corrosive/acid, so we only use those elements.
  const grenadePerkFireCorrosivePool = grenadePerkPool.filter(({ row }) => {
    const t = norm(row.statText ?? "");
    return /\bfire\b|\bincendiary\b|\bburning\b|\bignite\b|\bflame\b/.test(t) ||
      /\bcorrosive\b|\bacid\b|\bcorrode\b|\btoxic\b/.test(t);
  });
  const perkSource = grenadePerkFireCorrosivePool.length ? grenadePerkFireCorrosivePool : grenadePerkPool;
  const grenadePrefix = Math.random() < 0.5 ? 267 : 291;
  const grenadeCode = grenadePrefix === 267 ? "{267:1}" : "{291:8}";
  const grenadeRarityCode = grenadePrefix === 267 ? "{267:3}" : "{291:9}";
  grenadeParts.push(grenadeCode);
  if (perkSource.length) {
    const count = randInt(40, 120);
    const perkIds: number[] = [];
    for (let i = 0; i < count; i += 1) {
      perkIds.push(pick(perkSource).parsed.part);
    }
    grenadeParts.push(`{245:[${perkIds.join(" ")}]}`);
  }
  grenadeParts.push(grenadeRarityCode);

  // Other heavy enhancement stacks were cleared as part of the simplified rules; no generic enhancement/stalker stacks.

  const allNewParts = [
    firstRarityCode,
    ...altFireTokens,
    bodyToken,
    ...bodyAccessoryStack,
    ...(uniqueFirstBarrelToken ? [uniqueFirstBarrelToken] : []),
    primaryBarrelToken,
    ...samePrefixBarrelParts,
    ...crossParts,
    ...barrelAccessoryStack,
    multiProjectileToken,
    ...(daedalusShotgunAmmoToken ? [daedalusShotgunAmmoToken] : []),
    ...homingStacks273,
    magazineToken,
    ...(gripToken ? [gripToken] : []),
    ...(foregripToken ? [foregripToken] : []),
    ...(scopeToken ? [scopeToken] : []),
    ...(daedalusAltAmmoToken ? [daedalusAltAmmoToken] : []),
    ...manufacturerTokens,
    ...damageStacks,
    ...ammoStacks,
    ...fireRateStacks,
    ...underbarrelAccessoryStack,
    ...(shouldUseUnderbarrelAlt ? [underbarrelInfiniteAmmoToken] : []),
    ...grenadeParts,
    // Underbarrel must always be the last code.
    ...(underbarrelToken ? [underbarrelToken] : []),
  ];
  if (!allNewParts.length) throw new Error("Could not build random modded parts.");

  const finalParts = parseComponentString(allNewParts.join(" ")).filter((c) => typeof c !== "string");
  const newComponentStr = finalParts
    .map((p) => (typeof p === "string" ? p : p.raw))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const safeSkin = chosenSkin.replace(/"/g, '\\"');
  const updatedDecoded = safeSkin
    ? `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} | "c", "${safeSkin}" |`
    : `${headerPrefix}, 0, 1, ${level}| 2, ${seed}|| ${newComponentStr} |`;
  return updatedDecoded;
}
