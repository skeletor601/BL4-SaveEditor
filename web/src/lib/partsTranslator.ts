/**
 * Parts Translator: parse decoded item serial strings and resolve part codes to names.
 * Input format: header||body where body has tokens like {type_id:part_id}, {type_id}, or "c", skinId.
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

/** One parsed part: either ("skin", skinId) or (type_id, part_id). */
export type ParsedPart = ["skin", number] | [number, number];

export interface TranslatedLine {
  codeKey: string;
  partType: string;
  name: string;
  stats: string;
  qty: number;
}

/** Extract parts list from decoded string (header||body with {tid:pid}, {tid}, "c", skinId). */
export function parseDecodedSerial(decoded: string): { parts: ParsedPart[]; headerMfg: number | null } {
  const parts: ParsedPart[] = [];
  if (!decoded.includes("||")) return { parts, headerMfg: null };
  const [header, body] = decoded.split("||", 2);
  let headerMfg: number | null = null;
  try {
    const first = header.split("|")[0].trim().split(",")[0].trim();
    headerMfg = parseInt(first, 10);
    if (Number.isNaN(headerMfg)) headerMfg = null;
  } catch {
    // ignore
  }
  // Same regex as desktop: {tid}, {tid:pid}, {tid:[id id ...]}, or "c", skinId
  const tokenRe = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|\"c\",\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(body)) !== null) {
    if (m[3] !== undefined) {
      parts.push(["skin", parseInt(m[3], 10)]);
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

/** Look up one part and return (partType, name, stats, codeKey). Uses byCode map + optional elemental names. */
export function lookupPart(
  part: ParsedPart,
  byCode: Map<string, PartLookupRow[]>,
  elementalNames?: Map<number, string>
): { partType: string; name: string; stats: string; codeKey: string } {
  if (part[0] === "skin") {
    const skinId = part[1];
    const name = (elementalNames as Map<number, string> | undefined)?.get(skinId) ?? `Skin ID ${skinId}`;
    return { partType: "Skin", name, stats: "", codeKey: `"c", ${skinId}` };
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
  return { partType, name, stats, codeKey: key };
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
  for (const part of parts) {
    const { partType, name, stats, codeKey: key } = lookupPart(part, byCode, elementalNames);
    const entry = counts.get(key);
    if (entry) {
      entry.qty += 1;
    } else {
      counts.set(key, { codeKey: key, partType, name, stats, qty: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    if (a.partType !== b.partType) return a.partType.localeCompare(b.partType);
    return a.name.localeCompare(b.name);
  });
}

/** Format one translated line for display (desktop-style). */
export function formatTranslatedLine(line: TranslatedLine): string {
  if (line.stats) {
    return `  ${line.qty}×  ${line.codeKey}  [${line.partType}]  ${line.name}  —  ${line.stats}`;
  }
  return `  ${line.qty}×  ${line.codeKey}  [${line.partType}]  ${line.name}`;
}
