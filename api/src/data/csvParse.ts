/**
 * Minimal CSV line parser: handles quoted fields (with commas inside).
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let val = "";
      while (i < line.length) {
        if (line[i] === '"') {
          i += 1;
          if (line[i] === '"') {
            val += '"';
            i += 1;
          } else break;
        } else {
          val += line[i];
          i += 1;
        }
      }
      out.push(val);
      if (line[i] === ",") i += 1;
    } else {
      let val = "";
      while (i < line.length && line[i] !== ",") {
        val += line[i];
        i += 1;
      }
      out.push(val.trim());
      if (line[i] === ",") i += 1;
    }
  }
  return out;
}

/** Split content into logical rows; newlines inside quoted fields do not start a new row. */
function splitCsvRows(content: string): string[] {
  const rows: string[] = [];
  let i = 0;
  let rowStart = 0;
  while (i < content.length) {
    if (content[i] === '"') {
      i += 1;
      while (i < content.length) {
        if (content[i] === '"') {
          i += 1;
          if (content[i] === '"') i += 1;
          else break;
        } else i += 1;
      }
    } else if (content[i] === "\n" || content[i] === "\r") {
      const end = content[i] === "\r" && content[i + 1] === "\n" ? i + 2 : i + 1;
      rows.push(content.slice(rowStart, i).trim());
      rowStart = end;
      i = end;
    } else i += 1;
  }
  if (rowStart < content.length) rows.push(content.slice(rowStart).trim());
  return rows.filter((r) => r.length > 0);
}

export function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = splitCsvRows(content);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}
