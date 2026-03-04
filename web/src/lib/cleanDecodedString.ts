/**
 * Clean a decoded serial string by combining like codes:
 * - Consecutive {typeId:partId} with the same typeId → {typeId:[partId1 partId2 ...]}
 * - Consecutive {typeId:[a]} {typeId:[b]} → {typeId:[a b ...]}
 * - Simple {id} uses header's first number as typeId for grouping.
 * Preserves non-brace content (e.g. "c", skin token).
 */

export function cleanDecodedString(decoded: string): { cleaned: string; error?: string } {
  const raw = (decoded || "").trim();
  if (!raw) return { cleaned: "", error: "Input is empty." };

  const idx = raw.indexOf("||");
  const header = idx >= 0 ? raw.slice(0, idx).trim() : "";
  const component = idx >= 0 ? raw.slice(idx + 2).trim() : raw;

  const firstNumberMatch = header.match(/^(\d+)/);
  const headerFirst = firstNumberMatch ? Number(firstNumberMatch[1]) : 0;

  const regex = /\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}/g;
  const tokens: { typeId: number; partIds: number[]; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(component)) !== null) {
    const outer = Number(m[1]);
    const inner = m[2];
    let typeId: number;
    let partIds: number[];
    if (inner === undefined) {
      typeId = headerFirst;
      partIds = [outer];
    } else if (inner.includes("[")) {
      typeId = outer;
      partIds = inner
        .replace(/[[\]]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isFinite);
    } else {
      typeId = outer;
      partIds = [Number(inner)];
    }
    tokens.push({ typeId, partIds, start: m.index, end: m.index + m[0].length });
  }

  if (tokens.length === 0) {
    return { cleaned: decoded };
  }

  const groups: { typeId: number; partIds: number[] }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (groups.length > 0 && groups[groups.length - 1].typeId === t.typeId) {
      groups[groups.length - 1].partIds.push(...t.partIds);
    } else {
      groups.push({ typeId: t.typeId, partIds: [...t.partIds] });
    }
  }

  const newPartStrs: string[] = [];
  for (const g of groups) {
    if (g.partIds.length === 1 && headerFirst !== 0 && g.typeId === headerFirst) {
      newPartStrs.push(`{${g.partIds[0]}}`);
    } else if (g.partIds.length === 1) {
      newPartStrs.push(`{${g.typeId}:${g.partIds[0]}}`);
    } else {
      newPartStrs.push(`{${g.typeId}:[${g.partIds.join(" ")}]}`);
    }
  }
  const newPartsStr = newPartStrs.join(" ");

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const before = component.slice(0, first.start);
  const after = component.slice(last.end);
  const newComponent = (before + newPartsStr + after).replace(/\s{2,}/g, " ").trim();

  const cleaned = header ? `${header}|| ${newComponent}` : newComponent;
  return { cleaned };
}
