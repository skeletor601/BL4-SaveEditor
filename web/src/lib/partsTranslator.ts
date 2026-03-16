/**
 * Parts Translator: parse decoded item serial strings and resolve part codes to names.
 * Input format: header||body where body has tokens like {type_id:part_id}, {type_id},
 * or '"c", skinId' / '"c", "Cosmetics_..."'.
 * Matches desktop qt_converter_tab.py logic (decoded string only; no Base85 here).
 */

export interface PartLookupRow {
  code: string;
  partName?: string;
  itemType?: string;
  partType?: string;
  effect?: string;
  manufacturer?: string;
  weaponType?: string;
  [key: string]: unknown;
}

/** One parsed part: either ("skin", skinToken) or (type_id, part_id). */
export type ParsedPart = ["skin", string] | [number, number];

export interface TranslatedLine {
  codeKey: string;
  partType: string;
  name: string;
  stats: string;
  qty: number;
  /** First position this part appeared in the decoded build (for left-to-right ordering). */
  firstIndex: number;
  /** All data fields from the parts DB for this part (for "show all fields" display). */
  allFields?: Record<string, unknown>;
}

/** Extract parts list from decoded string/body with {tid:pid}, {tid}, "c", skinId/string. */
export function parseDecodedSerial(decoded: string): { parts: ParsedPart[]; headerMfg: number | null } {
  const parts: ParsedPart[] = [];
  const hasHeader = decoded.includes("||");
  const [header, body] = hasHeader ? decoded.split("||", 2) : ["", decoded];
  let headerMfg: number | null = null;
  if (hasHeader) {
    try {
      const first = header.split("|")[0].trim().split(",")[0].trim();
      headerMfg = parseInt(first, 10);
      if (Number.isNaN(headerMfg)) headerMfg = null;
    } catch {
      // ignore
    }
  }
  // Tolerant parser:
  // - braces: {tid}, {tid:pid}, {tid:[id id ...]} (also accepts [] wrappers)
  // - skin: "c", 12  OR  "c", "Cosmetics_Weapon_..."
  const tokenRe = /[\{\[](\d+)(?::(\d+|\[[\d\s]+\]))?[\}\]]|"c",\s*(?:"((?:[^"\\]|\\.)*)"|(\d+))/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(body)) !== null) {
    if (m[3] !== undefined || m[4] !== undefined) {
      const skinToken = m[3] !== undefined ? m[3].replace(/\\"/g, '"').trim() : m[4];
      if (skinToken) parts.push(["skin", skinToken]);
      continue;
    }
    const outer = parseInt(m[1], 10);
    const inner = m[2];
    if (inner) {
      if (inner.includes("[")) {
        for (const sid of inner.replace(/[\[\]]/g, "").trim().split(/\s+/)) {
          const id = parseInt(sid, 10);
          if (!Number.isNaN(id)) parts.push([outer, id]);
        }
      } else {
        parts.push([outer, parseInt(inner, 10)]);
      }
    } else {
      const tid = headerMfg ?? outer;
      parts.push([tid, outer]);
    }
  }
  return { parts, headerMfg };
}

function codeKey(typeId: number, partId: number): string {
  return `{${typeId}:${partId}}`;
}

/** Look up one part and return (partType, name, stats, codeKey, allFields). Uses byCode map + optional elemental names. */
export function lookupPart(
  part: ParsedPart,
  byCode: Map<string, PartLookupRow[]>,
  elementalNames?: Map<number, string>
): { partType: string; name: string; stats: string; codeKey: string; allFields?: Record<string, unknown> } {
  if (part[0] === "skin") {
    const skinToken = part[1];
    return { partType: "Skin", name: skinToken, stats: "", codeKey: `"c", "${skinToken}"` };
  }
  const [typeId, partId] = part;
  const key = codeKey(typeId, partId);
  if (typeId === 1 && elementalNames?.get(partId)) {
    return {
      partType: "Elemental",
      name: elementalNames.get(partId)!,
      stats: "",
      codeKey: key,
    };
  }
  const rows = byCode.get(key);
  if (!rows?.length) {
    return { partType: "Unknown", name: key, stats: "", codeKey: key };
  }
  const row = rows[0];
  const partType = (row.partType ?? row.category ?? "Part") as string;
  const name = (row.partName ?? row.itemType ?? row.String ?? `ID ${partId}`) as string;
  const stats = (row.effect ?? row.Stats ?? row["Stats (Level 50, Common)"] ?? "") as string;
  const allFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && v !== "") {
      allFields[k] = v;
    }
  }
  return { partType, name, stats, codeKey: key, allFields: Object.keys(allFields).length ? allFields : undefined };
}

/** Build byCode map from API-style items (code like "{284:1}"). */
export function buildPartsByCode(items: PartLookupRow[]): Map<string, PartLookupRow[]> {
  const byCode = new Map<string, PartLookupRow[]>();
  for (const row of items) {
    const code = (row.code ?? "").trim();
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push(row);
    byCode.set(code, list);
  }
  return byCode;
}

/** Aggregate parsed parts into translated lines with counts. */
export function translateParts(
  parts: ParsedPart[],
  byCode: Map<string, PartLookupRow[]>,
  elementalNames?: Map<number, string>
): TranslatedLine[] {
  const counts = new Map<string, TranslatedLine>();
  parts.forEach((part, idx) => {
    const { partType, name, stats, codeKey: key, allFields } = lookupPart(part, byCode, elementalNames);
    const entry = counts.get(key);
    if (entry) {
      entry.qty += 1;
    } else {
      counts.set(key, { codeKey: key, partType, name, stats, qty: 1, firstIndex: idx, allFields });
    }
  });
  // Preserve build order: sort by firstIndex (left-to-right, top-to-bottom in the decoded string).
  return Array.from(counts.values()).sort((a, b) => a.firstIndex - b.firstIndex);
}

/** Preferred order for allFields keys when displaying. */
const FIELD_ORDER = [
  "code",
  "partType",
  "Part Type",
  "partName",
  "String",
  "Model Name",
  "manufacturer",
  "Manufacturer",
  "weaponType",
  "Weapon Type",
  "itemType",
  "Item Type",
  "category",
  "Category",
  "effect",
  "Effect",
  "Stats",
  "Stats (Level 50, Common)",
  "Effects",
  "Requirements",
  "rarity",
  "canonicalRarity",
  "elemental",
  "Elemental",
  "Unique Effect",
  "Visual Unique Barrel",
  "Search Text",
  "canonicalPartType",
  "canonicalManufacturer",
  "Specific Category",
  "Matched Legendary Name",
  "Canonical Name",
  "Is Legendary",
];

/** Format one translated line for display, including all data fields when present. */
export function formatTranslatedLine(line: TranslatedLine): string {
  const main =
    line.stats !== ""
      ? `  ${line.qty}×  ${line.codeKey}  [${line.partType}]  ${line.name}  —  ${line.stats}`
      : `  ${line.qty}×  ${line.codeKey}  [${line.partType}]  ${line.name}`;
  if (!line.allFields || Object.keys(line.allFields).length === 0) {
    return main;
  }
  const keys = Object.keys(line.allFields);
  const ordered = [
    ...FIELD_ORDER.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !FIELD_ORDER.includes(k)).sort(),
  ];
  const fieldLines = ordered.map((k) => {
    const v = line.allFields![k];
    const str = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
    return `     ${k}: ${str}`;
  });
  return [main, ...fieldLines].join("\n");
}
