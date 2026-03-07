import { useCallback, useMemo, useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { PartRow } from "@/data/partsData";
import {
  getRowKey,
  blob,
  deriveCategory,
  inferRarity,
  loadFavorites,
  saveFavorites,
  parseCode,
  buildCopyFormat,
  RARITY_ORDER,
  apiItemToPartRow,
  getPartType,
  getCanonicalManufacturer,
  CANONICAL_MANUFACTURERS,
} from "@/data/partsData";
import SearchBar from "@/components/master-search/SearchBar";
import Filters, { type FilterState } from "@/components/master-search/Filters";
import PartsTable from "@/components/master-search/PartsTable";
import CopyQuantityDialog from "@/components/master-search/CopyQuantityDialog";
import Toast from "@/components/master-search/Toast";
import { fetchApi } from "@/lib/apiClient";

const defaultFilters: FilterState = {
  category: "All",
  partType: "All",
  sortRarity: "Default",
  manufacturer: "All",
  rarity: "All",
  favoritesOnly: false,
  quickFilter: "",
};

function normalize(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

type SortCol = "code" | "itemType" | "rarity" | "partName" | "effect" | null;

export default function MasterSearch() {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [copyDialogRow, setCopyDialogRow] = useState<PartRow | null>(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [data, setData] = useState<PartRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const loadParts = useCallback(() => {
    setDataLoading(true);
    setDataError(false);
    fetchApi("parts/data")
      .then((r) => r.json())
      .then((body: { items?: unknown[] }) => {
        const items = body?.items ?? [];
        const rows = Array.isArray(items)
          ? (items as { code?: string; itemType?: string; partName?: string; effect?: string; category?: string; manufacturer?: string; partType?: string; rarity?: string; id?: number }[]).map(
              apiItemToPartRow
            )
          : [];
        setData(rows);
      })
      .catch(() => {
        setData([]);
        setDataError(true);
      })
      .finally(() => setDataLoading(false));
  }, []);

  useEffect(() => {
    loadParts();
  }, [loadParts, retryCount]);

  const toggleFavorite = useCallback((row: PartRow) => {
    const key = getRowKey(row);
    if (!key) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavorites(next);
      return next;
    });
  }, []);

  const filteredAndSorted = useMemo(() => {
    const selectedPartType = normalize(filters.partType);
    const selectedRarity = normalize(filters.rarity);
    const selectedManufacturer = normalize(filters.manufacturer);
    const searchLower = search.trim().toLowerCase();

    const list = data.filter((row) => {
      const raw = row as Record<string, unknown>;
      const rowPartType = row["Part Type"] ?? raw["partType"];
      const rowRarity = row.Rarity ?? raw["rarity"];
      const rowManufacturer = getCanonicalManufacturer(row);
      const rowName = normalize(row["String"] ?? raw["partName"] ?? row["Model Name"]);

      if (selectedPartType && selectedPartType !== "all") {
        const partTypeNorm = normalize(rowPartType);
        if (selectedPartType === "barrel") {
          if (partTypeNorm !== "barrel") return false;
          // Guard against mis-tagged rows that are not actual barrels.
          if (!rowName.includes("barrel")) return false;
        } else if (partTypeNorm !== selectedPartType) {
          return false;
        }
      }
      if (selectedRarity && selectedRarity !== "all") {
        if (normalize(rowRarity) !== selectedRarity) return false;
      }
      if (selectedManufacturer && selectedManufacturer !== "all") {
        if (normalize(rowManufacturer) !== selectedManufacturer) return false;
      }
      if (filters.category !== "All" && deriveCategory(row) !== filters.category) return false;
      if (searchLower) {
        const b = blob(row);
        const code = (row.code ?? row.Code ?? "").toString().toLowerCase();
        if (!b.includes(searchLower) && !code.includes(searchLower)) return false;
      }
      if (filters.favoritesOnly && !favorites.has(getRowKey(row))) return false;
      const b = blob(row);
      if (filters.quickFilter === "damage" && !b.includes("damage")) return false;
      if (filters.quickFilter === "ammo" && !b.includes("ammo") && !b.includes("magazine")) return false;
      return true;
    });

    if (filters.sortRarity !== "Default") {
      const order = RARITY_ORDER;
      const emptyOrder = 99;
      return [...list].sort((a, b) => {
        const ra = inferRarity(a);
        const rb = inferRarity(b);
        const ia = order[ra] ?? emptyOrder;
        const ib = order[rb] ?? emptyOrder;
        let cmp = 0;
        if (filters.sortRarity === "Legendary first" || filters.sortRarity === "Epic first" || filters.sortRarity === "Rare first") {
          cmp = ia - ib;
        } else if (filters.sortRarity === "Common first") {
          cmp = ib - ia;
        }
        if (cmp !== 0) return cmp;
        return String(getRowKey(a)).localeCompare(String(getRowKey(b)));
      });
    }
    return list;
  }, [data, search, filters, favorites]);

  const manufacturerOptions = useMemo(
    () => ["All", ...CANONICAL_MANUFACTURERS],
    []
  );

  const partTypeOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      const pt = getPartType(row);
      if (pt) set.add(pt);
    });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 2500);
    return () => clearTimeout(t);
  }, []);

  const exportFavorites = useCallback(() => {
    try {
      const payload = { version: 1, keys: Array.from(favorites) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bl4-favorites.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Saved to Downloads as bl4-favorites.json");
    } catch {
      showToast("Export failed");
    }
  }, [favorites, showToast]);

  const importFavorites = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = (reader.result as string) || "";
          const data = JSON.parse(text) as { keys?: string[] } | string[];
          const keys = Array.isArray(data) ? data : (data?.keys ?? []);
          let changed = false;
          setFavorites((prev) => {
            const next = new Set(prev);
            keys.forEach((k: unknown) => {
              if (typeof k === "string" && k && !next.has(k)) {
                next.add(k);
                changed = true;
              }
            });
            saveFavorites(next);
            return next;
          });
          showToast(changed ? `Favorites imported from ${file.name}` : "No new favorites in that file");
        } catch {
          showToast("Import failed");
        }
      };
      reader.readAsText(file, "utf-8");
    };
    input.click();
  }, [showToast]);

  const handleCopyCode = useCallback((row: PartRow) => {
    setCopyDialogRow(row);
  }, []);

  const handleCopyConfirm = useCallback(
    (qty: number) => {
      if (!copyDialogRow) return;
      const codeStr = (copyDialogRow.code ?? copyDialogRow.Code ?? "").toString().trim();
      const parsed = parseCode(codeStr);
      if (parsed) {
        const formatted = buildCopyFormat(parsed.prefix, parsed.part, qty);
        navigator.clipboard.writeText(formatted).then(
          () => showToast("Copied to clipboard"),
          () => showToast("Copy failed")
        );
      } else {
        navigator.clipboard.writeText(codeStr).then(
          () => showToast("Copied to clipboard"),
          () => showToast("Copy failed")
        );
      }
      setCopyDialogRow(null);
    },
    [copyDialogRow, showToast]
  );

  const handleSort = useCallback((col: SortCol) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("asc");
      return col;
    });
  }, []);

  return (
    <div className="min-h-full bg-[var(--color-bg)] text-[var(--color-text)]" style={{ fontFamily: "var(--font-sans)", fontSize: "10.5pt" }}>
      <header className="bg-[var(--color-panel)] border-b border-[var(--color-panel-border)] py-3 px-4 sm:px-5 flex items-center gap-4 flex-wrap">
        <h1 className="m-0 text-base sm:text-[16pt] font-bold tracking-wide">
          BL4 Master Search
        </h1>
        <span className="bg-[var(--color-accent-dim)] text-[var(--color-accent)] px-2.5 py-1 rounded-[10px] font-bold text-xs">
          BETA
        </span>
      </header>

      <div className="flex flex-wrap gap-3 items-center py-3 px-4 sm:px-5 bg-[rgba(18,21,26,0.6)] border-b border-[var(--color-panel-border)]">
        <SearchBar value={search} onChange={setSearch} placeholder="Search" />
      </div>

      <Filters
        filters={filters}
        onFiltersChange={setFilters}
        onExportFavorites={exportFavorites}
        onImportFavorites={importFavorites}
        manufacturerOptions={manufacturerOptions}
        partTypeOptions={partTypeOptions}
      />

      {dataError && (
        <div className="mx-4 my-3 p-4 rounded-lg border-2 border-amber-500/60 bg-[rgba(48,52,60,0.85)] backdrop-blur-sm">
          <p className="text-[var(--color-text)] mb-2">Couldn&apos;t load parts. Check your connection or try again.</p>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Retry
          </button>
        </div>
      )}

      {!dataError && !dataLoading && filteredAndSorted.length === 0 && (
        <div className="mx-4 my-3 p-4 rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm">
          <p className="text-[var(--color-text-muted)]">No results. Try a different search term or loosen the filters.</p>
        </div>
      )}

      <PartsTable
        rows={filteredAndSorted}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onCopyCode={handleCopyCode}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
        sortByRarity={filters.sortRarity}
      />

      <p className="px-4 py-2 text-[10px] text-[var(--color-text-muted)]">
        {dataLoading ? "Loading…" : dataError ? "Load failed" : `${filteredAndSorted.length} result(s)`}
      </p>

      {copyDialogRow && (
        <CopyQuantityDialog
          code={(copyDialogRow.code ?? copyDialogRow.Code ?? "").toString()}
          codePreview={(copyDialogRow.code ?? copyDialogRow.Code ?? "").toString()}
          onConfirm={handleCopyConfirm}
          onCancel={() => setCopyDialogRow(null)}
        />
      )}

      <Toast message={toast} visible={toastVisible} />
    </div>
  );
}
