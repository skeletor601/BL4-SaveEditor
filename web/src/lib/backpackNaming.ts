export interface PartLookupItem {
  code: string;
  itemType: string;
  partName: string;
  effect?: string;
  category?: string;
  manufacturer?: string;
  partType?: string;
  weaponType?: string;
  rarity?: string;
}

const GENERIC_NAME_WORDS = new Set([
  "rarity", "common", "uncommon", "rare", "epic", "legendary",
  "barrel", "body", "element", "firmware", "model", "skin", "part",
]);

function getPartByCodeOrPrefixed(
  code: string,
  itemTypeId: number | undefined,
  partsByCode: Map<string, PartLookupItem>,
): PartLookupItem | undefined {
  const part = partsByCode.get(code);
  if (part) return part;
  const single = code.match(/^\{(\d+)\}$/);
  if (single && itemTypeId != null) {
    const n = single[1];
    return partsByCode.get(`{${itemTypeId}:${n}}`) ?? undefined;
  }
  return undefined;
}

export function collectLookupCodesFromDecoded(decodedFull: string): string[] {
  if (!decodedFull) return [];
  const out = new Set<string>();
  const headerMatch = decodedFull.match(/^(\d+),/);
  const itemTypeId = headerMatch ? parseInt(headerMatch[1], 10) : undefined;
  // Match {tid:pid}, {tid:[id id ...]}, and bare {tid}
  const re = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decodedFull)) !== null) {
    const tid = m[1];
    const inner = m[2];
    if (inner == null) {
      out.add(`{${tid}}`);
      if (itemTypeId != null) out.add(`{${itemTypeId}:${tid}}`);
    } else if (inner.startsWith("[")) {
      // Array style: {tid:[id1 id2 ...]} — emit one lookup code per unique id
      for (const sid of inner.replace(/[\[\]]/g, "").trim().split(/\s+/)) {
        if (sid) out.add(`{${tid}:${sid}}`);
      }
    } else {
      out.add(`{${tid}:${inner}}`);
    }
  }
  return Array.from(out);
}

/** Extract a clean display name from a partName like "TOR_SG.comp_05_legendary_LeadBalloon" → "Lead Balloon" */
function extractCleanName(partName: string): string | undefined {
  if (!partName) return undefined;
  // Try to get the name after the last underscore in legendary/pearl part names
  // e.g. "TOR_SG.comp_05_legendary_LeadBalloon" → "LeadBalloon" → "Lead Balloon"
  const legendaryMatch = partName.match(/(?:legendary|pearl|pearlescent)_(\w+)/i);
  if (legendaryMatch?.[1]) {
    // Split CamelCase into words: "LeadBalloon" → "Lead Balloon"
    return legendaryMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  }
  // Try barrel part names like "DAD_AR.part_barrel_03_onslaught" → "Onslaught"
  const barrelMatch = partName.match(/part_barrel_\d+_(\w+)/i);
  if (barrelMatch?.[1]) {
    return barrelMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  }
  return undefined;
}

export function preferItemNameFromDecoded(decodedFull: string, partsByCode: Map<string, PartLookupItem>): string | undefined {
  if (!decodedFull) return undefined;
  const headerMatch = decodedFull.match(/^(\d+),/);
  const itemTypeId = headerMatch ? parseInt(headerMatch[1], 10) : undefined;
  const barrelNames: string[] = [];
  const rarityNames: string[] = [];
  // Match simple {X:Y}, grouped {X:[Y Y Y]}, and bare {X} tokens
  // For grouped tokens, check ALL unique IDs (rarity + barrel can be in same group)
  const re = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decodedFull)) !== null) {
    const prefix = m[1];
    const inner = m[2];
    // Build list of all IDs to check in this token
    const idsToCheck: string[] = [];
    if (inner == null) {
      idsToCheck.push(`{${prefix}}`);
    } else if (inner.startsWith("[")) {
      // Grouped: check ALL unique IDs
      const uniqueIds = [...new Set(inner.replace(/[\[\]]/g, "").trim().split(/\s+/).filter(Boolean))];
      for (const id of uniqueIds) idsToCheck.push(`{${prefix}:${id}}`);
    } else {
      idsToCheck.push(`{${prefix}:${inner}}`);
    }

    for (const lookupCode of idsToCheck) {
      const part = getPartByCodeOrPrefixed(lookupCode, itemTypeId, partsByCode);
      if (!part) continue;
      const type = String(part.partType ?? "").toLowerCase();
      const isRarity = type.includes("rarity");
      const isBarrel = type.includes("barrel") && !type.includes("accessory");
      const isLegendaryPerk = type.includes("legendary");
      const isModel = type.includes("model");
      const isFirmware = type.includes("firmware");
      if (!isRarity && !isBarrel && !isLegendaryPerk && !isModel && !isFirmware) continue;

      // Barrel names always win, then legendary perks, then rarity
      const target = isBarrel ? barrelNames : (isLegendaryPerk || isModel || isFirmware) ? barrelNames : rarityNames;

      // Try extracting clean name from partName first (most reliable)
      const cleanName = extractCleanName(part.partName ?? "");
      if (cleanName && cleanName.length >= 3 && cleanName.length <= 40) {
        target.push(cleanName);
        continue;
      }

      // Fallback: try effect/stat text
      const raw = String(part.effect ?? part.partName ?? "").trim();
      if (!raw) continue;
      const base = raw.split(",")[0]?.split(" -")[0]?.trim() ?? "";
      if (!base || base.length < 3 || base.length > 40 || !/[a-zA-Z]/.test(base)) continue;
      if (GENERIC_NAME_WORDS.has(base.toLowerCase())) continue;
      target.push(base);
    }
  }
  // Always prefer barrel name over rarity name — barrel = the in-game weapon name
  return barrelNames[0] ?? rarityNames[0];
}

export function toBackpackGroupLabel(itemType: string | undefined): string {
  const v = String(itemType ?? "").trim();
  if (!v) return "Other";
  const map: Record<string, string> = {
    Pistol: "Pistols",
    Shotgun: "Shotguns",
    SMG: "SMGs",
    "Assault Rifle": "Assault Rifles",
    Sniper: "Snipers",
    "Heavy Weapon": "Heavy Weapons",
    Grenade: "Grenades",
    Shield: "Shields",
    Repkit: "Repkits",
    Enhancement: "Enhancements",
    "Class Mod": "Class Mods",
  };
  return map[v] ?? (v.endsWith("s") ? v : `${v}s`);
}
