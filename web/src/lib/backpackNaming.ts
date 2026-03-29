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

const _GENERIC_NAME_WORDS = new Set([
  "rarity", "common", "uncommon", "rare", "epic", "legendary",
  "barrel", "body", "element", "firmware", "model", "skin", "part",
]);
void _GENERIC_NAME_WORDS;

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

/** Extract a clean display name from a partName.
 * Handles both spawn code patterns and human-readable names:
 * - "TOR_SG.comp_05_legendary_LeadBalloon" → "Lead Balloon"
 * - "DAD_AR.part_barrel_03_onslaught" → "Onslaught"
 * - "Legendary - Guardian Angel skin" → "Guardian Angel"
 * - "Nucleosynthesis" → "Nucleosynthesis"
 * - "Hellwalker, 1071 x 10 Damage, 45% Acc" → "Hellwalker"
 */
function extractCleanName(partName: string): string | undefined {
  if (!partName) return undefined;

  // Pattern 1: spawn code with legendary/pearl name
  // "TOR_SG.comp_05_legendary_LeadBalloon" → "LeadBalloon" → "Lead Balloon"
  const legendaryMatch = partName.match(/(?:legendary|pearl|pearlescent)_(\w+)/i);
  if (legendaryMatch?.[1] && !/^perk$/i.test(legendaryMatch[1])) {
    return legendaryMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  }

  // Pattern 2: spawn code with barrel name
  // "DAD_AR.part_barrel_03_onslaught" → "Onslaught"
  const barrelMatch = partName.match(/part_(?:unique_)?barrel_\d+_(\w+)/i);
  if (barrelMatch?.[1]) {
    return barrelMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  }

  // Pattern 3: human-readable "Legendary - Name skin" or "Legendary - Name"
  const legDashMatch = partName.match(/^(?:Legendary|Pearl)\s*-\s*(.+?)(?:\s+skin)?$/i);
  if (legDashMatch?.[1]) {
    const name = legDashMatch[1].trim();
    if (name.length >= 3 && !/^gold$/i.test(name)) return name;
  }

  // Pattern 4: human-readable stat string "Hellwalker, 1071 x 10 Damage..."
  // First word before comma is the name
  if (partName.includes(",") && /\d/.test(partName)) {
    const firstName = partName.split(",")[0].trim();
    if (firstName.length >= 3 && firstName.length <= 30 && !/^\d/.test(firstName) &&
        !firstName.includes(".") && !firstName.toLowerCase().startsWith("no stat")) {
      return firstName;
    }
  }

  // Pattern 5: plain name without patterns (e.g. "Nucleosynthesis", "Honey Badger")
  // Only if it's a short clean name, not a description or spawn code
  if (partName.length >= 3 && partName.length <= 30 &&
      !partName.includes(".") && !partName.includes("_") &&
      !partName.includes("{") && !/^\d/.test(partName) &&
      !partName.toLowerCase().startsWith("no stat") &&
      !/common|uncommon|rare|epic|model|firmware/i.test(partName)) {
    return partName.trim();
  }

  return undefined;
}

/** Known grenade names by {prefix:partId} — uses the in-game SKIN name (what the game displays).
 * Maps both the perk code AND the rarity/skin code to the same name.
 * IMPORTANT: Only match when the prefix matches the grenade's header prefix! */
const GRENADE_LEGENDARY_NAMES: Record<string, string> = {
  // Maliwan — skip Gold (generic)
  "{263:9}": "Destructive Disco", "{263:10}": "Destructive Disco",
  "{263:11}": "Recursive", "{263:12}": "Recursive",
  // Jakobs
  "{267:9}": "Spinning Blade", "{267:10}": "Spinning Blade",
  "{267:11}": "Sho Kunai", "{267:12}": "Sho Kunai",
  // Daedalus
  "{270:7}": "Buzz Axe", "{270:8}": "Fuse", "{270:9}": "Fuse",
  // Order
  "{272:7}": "Swarm", "{272:8}": "Swarm",
  "{272:9}": "Chaumurky", "{272:10}": "Chaumurky",
  "{272:11}": "Skully", "{272:12}": "Skully",
  // Ripper
  "{278:9}": "Jelly", "{278:10}": "Jelly",
  "{278:11}": "Buoy", "{278:12}": "Buoy",
  // Vladof
  "{291:6}": "Blockbuster", "{291:7}": "Blockbuster",
  "{291:8}": "Waterfall", "{291:9}": "Waterfall",
  // Torgue
  "{298:6}": "Firepot", "{298:7}": "Firepot",
  "{298:8}": "Slippy", "{298:9}": "Slippy",
  "{298:11}": "Countermeasure", "{298:12}": "Countermeasure",
  // Tediore
  "{311:6}": "Faulty Detonator", "{311:7}": "Faulty Detonator",
  "{311:8}": "UAV", "{311:9}": "UAV",
  "{311:11}": "Urchin", "{311:12}": "Urchin",
};
const GRENADE_PREFIXES = new Set([263,267,270,272,278,291,298,311]);

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
      // Extract prefix from the lookup code — simple tokens {X} use the header prefix
      const codeMatch = lookupCode.match(/\{(\d+):(\d+)\}/);
      const simpleMatch = !codeMatch ? lookupCode.match(/\{(\d+)\}/) : null;
      const codePfx = codeMatch ? Number(codeMatch[1]) : (simpleMatch ? itemTypeId : null);
      const partId = codeMatch ? Number(codeMatch[2]) : (simpleMatch ? Number(simpleMatch[1]) : null);

      const isWeapon = itemTypeId != null && itemTypeId >= 2 && itemTypeId <= 27;
      const isGrenade = itemTypeId != null && GRENADE_PREFIXES.has(itemTypeId);
      const isSamePrefix = codePfx === itemTypeId;

      // GRENADES: only match same-prefix legendary names (prevents anchors from being named)
      if (isGrenade && isSamePrefix && itemTypeId != null && partId != null) {
        const prefixedCode = `{${itemTypeId}:${partId}}`;
        const grenadeName = GRENADE_LEGENDARY_NAMES[prefixedCode] ?? GRENADE_LEGENDARY_NAMES[lookupCode];
        if (grenadeName) {
          barrelNames.push(grenadeName);
          continue;
        }
      }

      // Skip cross-prefix parts for naming (they're just cross-inserts, not the item's name)
      if (codePfx != null && !isSamePrefix && !isWeapon) continue;

      const part = getPartByCodeOrPrefixed(lookupCode, itemTypeId, partsByCode);
      if (!part) continue;
      const type = String(part.partType ?? "").toLowerCase();

      if (isWeapon) {
        // WEAPONS: only barrel names (first barrel = weapon name)
        const isBarrel = type.includes("barrel") && !type.includes("accessory");
        if (!isBarrel) continue;
        const cleanName = extractCleanName(part.partName ?? "") ?? extractCleanName(part.itemType ?? "");
        if (cleanName && cleanName.length >= 3 && cleanName.length <= 40) {
          barrelNames.push(cleanName);
        }
      } else {
        // NON-WEAPONS: rarity skin name — try itemType first (human name), fall back to partName (spawn code)
        const isRarity = type.includes("rarity");
        if (!isRarity) continue;
        const cleanName = extractCleanName(part.itemType ?? "") ?? extractCleanName(part.partName ?? "");
        if (cleanName && cleanName.length >= 3 && cleanName.length <= 40) {
          rarityNames.push(cleanName);
        }
      }
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
