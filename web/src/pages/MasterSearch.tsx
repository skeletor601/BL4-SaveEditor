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
  getManufacturer,
} from "@/data/partsData";
import { SAMPLE_PARTS } from "@/data/sampleParts";
import SearchBar from "@/components/master-search/SearchBar";
import Filters, { type FilterState } from "@/components/master-search/Filters";
import PartsTable from "@/components/master-search/PartsTable";
import CopyQuantityDialog from "@/components/master-search/CopyQuantityDialog";
import Toast from "@/components/master-search/Toast";

const defaultFilters: FilterState = {
  category: "All",
  partType: "All",
  sortRarity: "Default",
  manufacturer: "All",
  favoritesOnly: false,
  quickFilter: "",
};

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

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    setDataLoading(true);
    fetch("/api/parts/data")
      .then((r) => r.json())
      .then((body: { items?: unknown[] }) => {
        const items = body?.items ?? [];
        const rows = Array.isArray(items)
          ? (items as { code?: string; itemType?: string; partName?: string; effect?: string; category?: string; manufacturer?: string; partType?: string; id?: number }[]).map(apiItemToPartRow)
          : [];
        setData(rows.length > 0 ? rows : SAMPLE_PARTS);
      })
      .catch(() => setData(SAMPLE_PARTS))
      .finally(() => setDataLoading(false));
  }, []);

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
    const q = search.trim().toLowerCase();
    let list = data.filter((row) => {
      if (filters.category !== "All" && deriveCategory(row) !== filters.category) return false;
      if (filters.manufacturer !== "All" && getManufacturer(row) !== filters.manufacturer) return false;
      if (filters.partType !== "All") {
        const pt = (row["Part Type"] ?? "").toString().trim();
        if (pt !== filters.partType) return false;
      }
      if (filters.favoritesOnly && !favorites.has(getRowKey(row))) return false;
      const b = blob(row);
      if (q && !b.includes(q)) return false;
      if (filters.quickFilter === "damage" && !b.includes("damage")) return false;
      if (filters.quickFilter === "crit" && (!(b.includes("crit") || b.includes("critical")) || !b.includes("damage"))) return false;
      if (filters.quickFilter === "splash" && (!b.includes("splash") || !b.includes("damage"))) return false;
      return true;
    });
    if (filters.sortRarity !== "Default") {
      const order = RARITY_ORDER;
      list = [...list].sort((a, b) => {
        const ra = inferRarity(a);
        const rb = inferRarity(b);
        const ia = order[ra] ?? 99;
        const ib = order[rb] ?? 99;
        if (filters.sortRarity === "Legendary first") return ia - ib;
        if (filters.sortRarity === "Epic first") return ia - ib;
        if (filters.sortRarity === "Rare first") return ia - ib;
        if (filters.sortRarity === "Common first") return ib - ia;
        return 0;
      });
    }
    return list;
  }, [data, search, filters, favorites]);

  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      const m = getManufacturer(row);
      if (m) set.add(m);
    });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const partTypeOptions = useMemo(() => {
    const set = new Set<string>();
    const manufacturer = filters.manufacturer;
    data.forEach((row) => {
      if (manufacturer !== "All" && getManufacturer(row) !== manufacturer) return;
      const pt = (row["Part Type"] ?? "").toString().trim();
      if (pt) set.add(pt);
    });
    return ["All", ...Array.from(set).sort()];
  }, [data, filters.manufacturer]);

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
        onFiltersChange={(next) => {
          if (next.manufacturer !== filters.manufacturer) {
            setFilters({ ...next, partType: "All" });
          } else {
            setFilters(next);
          }
        }}
        onExportFavorites={exportFavorites}
        onImportFavorites={importFavorites}
        manufacturerOptions={manufacturerOptions}
        partTypeOptions={partTypeOptions}
      />

      <PartsTable
        rows={filteredAndSorted}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onCopyCode={handleCopyCode}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <p className="px-4 py-2 text-[10px] text-[var(--color-text-muted)]">
        {dataLoading ? "Loading…" : `${filteredAndSorted.length} result(s)`}
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
