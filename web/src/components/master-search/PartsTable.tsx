import type { PartRow } from "@/data/partsData";
import {
  getRowKey,
  getCode,
  getPartName,
  getEffect,
  inferRarity,
  isLegendaryByName,
} from "@/data/partsData";
import LegendaryBadge from "./LegendaryBadge";

type SortCol = "code" | "itemType" | "rarity" | "partName" | "effect" | null;
type SortDir = "asc" | "desc";

interface PartsTableProps {
  rows: PartRow[];
  favorites: Set<string>;
  onToggleFavorite: (row: PartRow) => void;
  onCopyCode: (row: PartRow) => void;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
}

function sortRows(rows: PartRow[], sortCol: SortCol, sortDir: SortDir): PartRow[] {
  if (!sortCol) return rows;
  const mult = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va: string | number, vb: string | number;
    switch (sortCol) {
      case "code":
        va = getCode(a);
        vb = getCode(b);
        break;
      case "itemType":
        va = (a["Model Name"] ?? "").toString();
        vb = (b["Model Name"] ?? "").toString();
        break;
      case "rarity":
        va = inferRarity(a);
        vb = inferRarity(b);
        break;
      case "partName":
        va = getPartName(a);
        vb = getPartName(b);
        break;
      case "effect":
        va = getEffect(a);
        vb = getEffect(b);
        break;
      default:
        return 0;
    }
    const cmp = String(va).localeCompare(String(vb));
    return mult * cmp;
  });
}

export default function PartsTable({
  rows,
  favorites,
  onToggleFavorite,
  onCopyCode,
  sortCol,
  sortDir,
  onSort,
}: PartsTableProps) {
  const sorted = sortRows(rows, sortCol, sortDir);

  const th = (col: SortCol, label: string) => (
    <th
      scope="col"
      className="sticky top-0 z-10 bg-[rgba(22,25,30,0.98)] text-left py-3 px-3.5 text-[11px] font-bold tracking-wide border-b border-[var(--color-panel-border)] text-[var(--color-accent)] cursor-pointer hover:underline"
      onClick={() => onSort(col)}
    >
      {label}
      {sortCol === col && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-auto py-4 px-4 sm:px-5 max-h-[calc(100vh-180px)]">
        <table className="w-full border-collapse bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded-xl overflow-hidden">
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 z-10 w-10 text-center bg-[rgba(22,25,30,0.98)] py-3 px-3.5 text-[11px] font-bold border-b border-[var(--color-panel-border)] text-[var(--color-accent)]">
                ★
              </th>
              {th("code", "Code")}
              {th("itemType", "Item type")}
              {th("rarity", "Rarity")}
              {th("partName", "Part name")}
              {th("effect", "Effect")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = getRowKey(row);
              const isFav = favorites.has(key);
              const isLeg = isLegendaryByName(row);
              const rarity = inferRarity(row);
              const code = getCode(row);
              return (
                <tr
                  key={key}
                  className={`border-b border-[rgba(60,68,78,0.3)] hover:bg-[var(--color-accent-dim)] ${isLeg ? "legendary-row" : ""}`}
                >
                  <td
                    className="w-10 text-center py-2.5 px-3.5 text-base cursor-pointer select-none hover:text-[var(--color-accent)]"
                    onClick={() => onToggleFavorite(row)}
                  >
                    {isFav ? "★" : "☆"}
                  </td>
                  <td
                    className="py-2.5 px-3.5 text-xs font-mono cursor-pointer hover:underline hover:text-[var(--color-accent)]"
                    onClick={() => onCopyCode(row)}
                  >
                    {code}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs">
                    {(row["Model Name"] ?? "").toString() || "—"}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs">
                    <LegendaryBadge rarity={rarity} isLegendary={isLeg} />
                  </td>
                  <td className="py-2.5 px-3.5 text-xs font-mono">
                    {getPartName(row)}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs max-w-md truncate">
                    {getEffect(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden overflow-auto py-4 px-4 max-h-[calc(100vh-180px)] space-y-3">
        {sorted.map((row) => {
          const key = getRowKey(row);
          const isFav = favorites.has(key);
          const isLeg = isLegendaryByName(row);
          const rarity = inferRarity(row);
          const code = getCode(row);
          return (
            <div
              key={key}
              className={`rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 ${isLeg ? "border-[var(--color-legendary)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  type="button"
                  className="text-lg touch-manipulation"
                  onClick={() => onToggleFavorite(row)}
                  aria-label={isFav ? "Remove favorite" : "Add favorite"}
                >
                  {isFav ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  className="font-mono text-[11px] text-[var(--color-accent)] hover:underline touch-manipulation"
                  onClick={() => onCopyCode(row)}
                >
                  {code}
                </button>
              </div>
              <p className="text-xs font-semibold text-[var(--color-text)]">
                {(row["Model Name"] ?? "").toString() || "—"}
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                <LegendaryBadge rarity={rarity} isLegendary={isLeg} />
              </p>
              <p className="font-mono text-[11px] text-[var(--color-text-muted)] mt-1 break-all">
                {getPartName(row)}
              </p>
              <p className="text-xs mt-2 text-[var(--color-text-muted)] line-clamp-2">
                {getEffect(row)}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
