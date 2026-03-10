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
  const re = /\{(\d+)(?::(\d+))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decodedFull)) !== null) {
    if (m[2] != null) {
      out.add(`{${m[1]}:${m[2]}}`);
    } else {
      out.add(`{${m[1]}}`);
      if (itemTypeId != null) out.add(`{${itemTypeId}:${m[1]}}`);
    }
  }
  return Array.from(out);
}

export function preferItemNameFromDecoded(decodedFull: string, partsByCode: Map<string, PartLookupItem>): string | undefined {
  if (!decodedFull) return undefined;
  const headerMatch = decodedFull.match(/^(\d+),/);
  const itemTypeId = headerMatch ? parseInt(headerMatch[1], 10) : undefined;
  const rarityCandidates: string[] = [];
  const barrelCandidates: string[] = [];
  const re = /\{(\d+)(?::(\d+))?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decodedFull)) !== null) {
    const code = m[2] != null ? `{${m[1]}:${m[2]}}` : `{${m[1]}}`;
    const part = getPartByCodeOrPrefixed(code, itemTypeId, partsByCode);
    if (!part) continue;
    const type = String(part.partType ?? "").toLowerCase();
    const isRarity = type.includes("rarity");
    const isBarrel = type.includes("barrel");
    if (!isRarity && !isBarrel) continue;
    const raw = String(part.effect ?? "").trim();
    if (!raw) continue;
    const base = raw.split(",")[0]?.split(" -")[0]?.trim() ?? "";
    if (!base || base.length < 3 || base.length > 40 || !/[a-zA-Z]/.test(base)) continue;
    if (GENERIC_NAME_WORDS.has(base.toLowerCase())) continue;
    if (isRarity) rarityCandidates.push(base);
    else barrelCandidates.push(base);
  }
  return rarityCandidates[0] ?? barrelCandidates[0];
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
