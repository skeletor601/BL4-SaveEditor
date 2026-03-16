import { useState, useRef, useCallback } from "react";
import type { PartRow } from "@/data/partsData";
import {
  getRowKey,
  getCode,
  getPartName,
  getEffect,
  inferRarity,
  isLegendaryByName,
  deriveCategory,
} from "@/data/partsData";
import LegendaryBadge from "./LegendaryBadge";
import PartDetailModal from "./PartDetailModal";
import PartHoverCard, { type HoverCardData } from "./PartHoverCard";

type SortCol = "code" | "itemType" | "rarity" | "partName" | "effect" | null;
type SortDir = "asc" | "desc";

interface PartsTableProps {
  rows: PartRow[];
  favorites: Set<string>;
  selectedKeys: Set<string>;
  onToggleFavorite: (row: PartRow) => void;
  onToggleSelect: (row: PartRow) => void;
  onToggleSelectAllVisible: (rows: PartRow[], nextChecked: boolean) => void;
  onCopyCode: (row: PartRow) => void;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  sortByRarity?: string;
}

function sortRows(rows: PartRow[], sortCol: SortCol, sortDir: SortDir): PartRow[] {
  if (!sortCol) return rows;
  const mult = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va: string | number, vb: string | number;
    switch (sortCol) {
      case "code":
        va = getCode(a); vb = getCode(b); break;
      case "itemType":
        va = (a["Model Name"] ?? "").toString();
        vb = (b["Model Name"] ?? "").toString();
        break;
      case "rarity":
        va = inferRarity(a); vb = inferRarity(b); break;
      case "partName":
        va = getPartName(a); vb = getPartName(b); break;
      case "effect":
        va = getEffect(a); vb = getEffect(b); break;
      default:
        return 0;
    }
    return mult * String(va).localeCompare(String(vb));
  });
}

// ── Convert PartRow → HoverCardData ──────────────────────────────────────────

function rowToHoverData(row: PartRow): HoverCardData {
  const rarity = inferRarity(row);
  const isPearl = rarity === "pearl";
  const isLeg = rarity === "legendary" || (!isPearl && isLegendaryByName(row));
  return {
    code: getCode(row),
    name: getPartName(row),
    effect: getEffect(row),
    manufacturer: (row.Manufacturer ?? (row as Record<string, unknown>)["manufacturer"] ?? "").toString().trim() || undefined,
    partType: (row["Part Type"] ?? (row as Record<string, unknown>)["partType"] ?? "").toString().trim() || undefined,
    modelName: (row["Model Name"] ?? "").toString().trim() || undefined,
    weaponType: (row["Weapon Type"] ?? (row as Record<string, unknown>)["weaponType"] ?? "").toString().trim() || undefined,
    rarity: isLeg ? "legendary" : isPearl ? "pearl" : rarity || undefined,
    category: deriveCategory(row) || (row.category ?? "").toString().trim() || undefined,
  };
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function PartsTable({
  rows,
  favorites,
  selectedKeys,
  onToggleFavorite,
  onToggleSelect,
  onToggleSelectAllVisible,
  onCopyCode,
  sortCol,
  sortDir,
  onSort,
  sortByRarity,
}: PartsTableProps) {
  const [hoverData, setHoverData] = useState<HoverCardData | null>(null);
  const [cardTop, setCardTop] = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mobile only: tap card → open detail modal
  const [mobileDetailRow, setMobileDetailRow] = useState<PartRow | null>(null);

  const useRarityOrder = sortByRarity && sortByRarity !== "Default";
  const sorted = useRarityOrder ? rows : sortRows(rows, sortCol, sortDir);
  const selectedVisibleCount = sorted.reduce((n, row) => (selectedKeys.has(getRowKey(row)) ? n + 1 : n), 0);
  const allVisibleSelected = sorted.length > 0 && selectedVisibleCount === sorted.length;

  const handleRowEnter = useCallback((row: PartRow, e: React.MouseEvent<HTMLTableRowElement>) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setCardTop(top);
      setHoverData(rowToHoverData(row));
    }, 130);
  }, []);

  const handleRowLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverData(null);
  }, []);

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
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => onToggleSelectAllVisible(sorted, e.target.checked)}
                  aria-label="Select all visible rows"
                />
              </th>
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
              const rarity = inferRarity(row);
              const isPearl = rarity === "pearl";
              const isLeg = rarity === "legendary" || (!isPearl && isLegendaryByName(row));
              const itemTypeStr = (row["Model Name"] ?? (row as Record<string, unknown>).itemType ?? "").toString();
              const code = getCode(row);
              return (
                <tr
                  key={key}
                  className={`border-b border-[rgba(60,68,78,0.3)] hover:bg-[var(--color-accent-dim)] cursor-pointer ${
                    isPearl ? "bg-sky-400/10" : isLeg ? "legendary-row" : ""
                  } ${selectedKeys.has(key) ? "bg-[var(--color-accent)]/10" : ""}`}
                  onClick={() => onToggleSelect(row)}
                  onMouseEnter={(e) => handleRowEnter(row, e)}
                  onMouseLeave={handleRowLeave}
                >
                  <td className="w-10 text-center py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => onToggleSelect(row)}
                      aria-label="Select row"
                    />
                  </td>
                  <td
                    className="w-10 text-center py-2.5 px-3.5 text-base cursor-pointer select-none hover:text-[var(--color-accent)]"
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(row); }}
                  >
                    {isFav ? "★" : "☆"}
                  </td>
                  <td
                    className="py-2.5 px-3.5 text-xs font-mono cursor-pointer hover:underline hover:text-[var(--color-accent)]"
                    onClick={(e) => { e.stopPropagation(); onCopyCode(row); }}
                  >
                    {code}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs">{itemTypeStr || "—"}</td>
                  <td className="py-2.5 px-3.5 text-xs">
                    <LegendaryBadge rarity={rarity} isLegendary={isLeg} isPearl={isPearl} />
                  </td>
                  <td className="py-2.5 px-3.5 text-xs font-mono">{getPartName(row)}</td>
                  <td className="py-2.5 px-3.5 text-xs max-w-md truncate">{getEffect(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hover card (desktop only, no pointer events so it doesn't interfere) */}
      <PartHoverCard data={hoverData} cardTop={cardTop} />

      {/* Mobile: stacked cards */}
      <div className="md:hidden overflow-auto py-4 px-4 max-h-[calc(100vh-180px)] space-y-3">
        {sorted.map((row) => {
          const key = getRowKey(row);
          const isFav = favorites.has(key);
          const isSelected = selectedKeys.has(key);
          const rarity = inferRarity(row);
          const isPearl = rarity === "pearl";
          const isLeg = rarity === "legendary" || (!isPearl && isLegendaryByName(row));
          const itemTypeStr = (row["Model Name"] ?? (row as Record<string, unknown>).itemType ?? "").toString();
          const code = getCode(row);
          return (
            <div
              key={key}
              onClick={() => onToggleSelect(row)}
              className={`rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 cursor-pointer hover:border-[var(--color-accent)]/50 transition-colors ${
                isPearl ? "border-sky-300/80 bg-sky-400/10" : isLeg ? "border-[var(--color-legendary)]" : ""
              } ${isSelected ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  type="button"
                  className="text-lg touch-manipulation"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(row); }}
                  aria-label={isFav ? "Remove favorite" : "Add favorite"}
                >
                  {isFav ? "★" : "☆"}
                </button>
                <label className="text-[11px] flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row)} />
                  Select
                </label>
                <button
                  type="button"
                  className="font-mono text-[11px] text-[var(--color-accent)] hover:underline touch-manipulation"
                  onClick={(e) => { e.stopPropagation(); onCopyCode(row); }}
                >
                  {code}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] touch-manipulation"
                  onClick={(e) => { e.stopPropagation(); setMobileDetailRow(row); }}
                >
                  Details
                </button>
              </div>
              <p className="text-xs font-semibold text-[var(--color-text)]">{itemTypeStr || "—"}</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                <LegendaryBadge rarity={rarity} isLegendary={isLeg} isPearl={isPearl} />
              </p>
              <p className="font-mono text-[11px] text-[var(--color-text-muted)] mt-1 break-all">{getPartName(row)}</p>
              <p className="text-xs mt-2 text-[var(--color-text-muted)] line-clamp-2">{getEffect(row)}</p>
            </div>
          );
        })}
      </div>

      {/* Mobile detail modal */}
      <PartDetailModal row={mobileDetailRow} onClose={() => setMobileDetailRow(null)} />
    </>
  );
}
