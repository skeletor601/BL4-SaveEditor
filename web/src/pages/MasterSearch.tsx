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

// Curated part type groups shown per category (keeps the dropdown sane)
const KNOWN_WEAPON_PART_TYPES = new Set([
  "barrel", "barrel accessory", "body", "body accessory", "grip", "foregrip",
  "magazine", "scope", "scope accessory", "underbarrel", "underbarrel accessory",
  "stat modifier",
]);

const PART_TYPE_MATCHERS: Record<string, (pt: string) => boolean> = {
  "All":                   () => true,
  "Barrel":                (pt) => pt === "barrel",
  "Barrel Accessory":      (pt) => pt === "barrel accessory",
  "Body":                  (pt) => pt === "body",
  "Body Accessory":        (pt) => pt === "body accessory",
  "Grip":                  (pt) => pt === "grip",
  "Foregrip":              (pt) => pt === "foregrip",
  "Magazine":              (pt) => pt === "magazine",
  "Scope":                 (pt) => pt === "scope",
  "Scope Accessory":       (pt) => pt === "scope accessory",
  "Underbarrel":           (pt) => pt === "underbarrel",
  "Underbarrel Accessory": (pt) => pt === "underbarrel accessory",
  "Stat Modifier":         (pt) => pt === "stat modifier",
  "Manufacturer Part":     (pt) => pt === "manufacturer part",
  "Rarity":                (pt) => pt === "rarity" || pt === "rarities",
  "Skill":                 (pt) => pt === "skill",
  "Perk / Augment":        (pt) => ["perk", "primary", "secondary", "legendary", "core", "augment"].includes(pt),
  "Firmware":              (pt) => pt === "firmware",
  "Shield Body":           (pt) => pt === "shield" || pt === "shield body",
  "Enhancement Stat":      (pt) =>
    pt.length > 0 &&
    !KNOWN_WEAPON_PART_TYPES.has(pt) &&
    !["manufacturer part", "rarity", "rarities", "skill", "perk", "primary",
      "secondary", "legendary", "core", "augment", "firmware", "shield",
      "shield body", "name"].includes(pt),
};

const PART_TYPE_GROUPS_BY_CATEGORY: Record<string, string[]> = {
  All:         ["All", "Barrel", "Barrel Accessory", "Body", "Body Accessory", "Foregrip",
                 "Grip", "Magazine", "Scope", "Scope Accessory", "Underbarrel",
                 "Underbarrel Accessory", "Stat Modifier", "Manufacturer Part",
                 "Rarity", "Skill", "Perk / Augment", "Firmware", "Enhancement Stat", "Shield Body"],
  Weapon:      ["All", "Barrel", "Barrel Accessory", "Body", "Body Accessory", "Foregrip",
                 "Grip", "Magazine", "Scope", "Scope Accessory", "Underbarrel",
                 "Underbarrel Accessory", "Stat Modifier", "Manufacturer Part"],
  Shield:      ["All", "Shield Body", "Manufacturer Part", "Rarity"],
  "Class Mod": ["All", "Skill", "Manufacturer Part"],
  Enhancement: ["All", "Enhancement Stat", "Rarity", "Manufacturer Part"],
  Grenade:     ["All", "Perk / Augment", "Firmware", "Manufacturer Part", "Rarity"],
  Repkit:      ["All", "Perk / Augment", "Firmware", "Manufacturer Part", "Rarity"],
  Heavy:       ["All", "Perk / Augment", "Firmware", "Manufacturer Part", "Rarity"],
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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkQty, setBulkQty] = useState(1);

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

  const toggleSelectRow = useCallback((row: PartRow) => {
    const key = getRowKey(row);
    if (!key) return;
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback((rows: PartRow[], nextChecked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        const key = getRowKey(row);
        if (!key) continue;
        if (nextChecked) next.add(key);
        else next.delete(key);
      }
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

      if (selectedPartType && selectedPartType !== "all") {
        const matcher = PART_TYPE_MATCHERS[filters.partType];
        const partTypeNorm = normalize(rowPartType);
        if (matcher) {
          if (!matcher(partTypeNorm)) return false;
        } else {
          // Fallback: exact match against the raw normalized value
          if (partTypeNorm !== selectedPartType) return false;
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
      if (filters.quickFilter === "rarity") {
        const pt = normalize(getPartType(row));
        const rarity = inferRarity(row);
        const isSpecial = rarity === "legendary" || rarity === "pearl";
        if (!(pt === "rarity" && isSpecial)) return false;
      }
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
        if (
          filters.sortRarity === "Pearl first" ||
          filters.sortRarity === "Legendary first" ||
          filters.sortRarity === "Epic first" ||
          filters.sortRarity === "Rare first"
        ) {
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

  const partTypeOptions = useMemo(
    () => PART_TYPE_GROUPS_BY_CATEGORY[filters.category] ?? PART_TYPE_GROUPS_BY_CATEGORY.All,
    [filters.category]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 2500);
    return () => clearTimeout(t);
  }, []);

  const health = useMemo(() => {
    let missingPartType = 0;
    let missingRarity = 0;
    let unknownMfg = 0;
    let duplicateCode = 0;
    const seenCode = new Set<string>();
    for (const row of data) {
      const raw = row as Record<string, unknown>;
      const pt = normalize(row["Part Type"] ?? raw["partType"]);
      if (!pt) missingPartType += 1;
      const rarity = normalize(row.Rarity ?? raw["rarity"]);
      if (!rarity) missingRarity += 1;
      if (!getCanonicalManufacturer(row)) unknownMfg += 1;
      const code = normalize(row.code ?? row.Code);
      if (code) {
        if (seenCode.has(code)) duplicateCode += 1;
        else seenCode.add(code);
      }
    }
    return { total: data.length, missingPartType, missingRarity, unknownMfg, duplicateCode };
  }, [data]);

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

  const handleBulkCopy = useCallback(() => {
    const q = Math.max(1, Math.min(999, bulkQty || 1));
    const selected = filteredAndSorted.filter((row) => selectedRows.has(getRowKey(row)));
    if (selected.length === 0) {
      showToast("No selected rows to copy");
      return;
    }
    const parts = selected.map((row) => {
      const codeStr = (row.code ?? row.Code ?? "").toString().trim();
      const parsed = parseCode(codeStr);
      return parsed ? buildCopyFormat(parsed.prefix, parsed.part, q) : codeStr;
    });
    navigator.clipboard.writeText(parts.join("\n")).then(
      () => showToast(`Copied ${selected.length} code(s)`),
      () => showToast("Bulk copy failed")
    );
  }, [bulkQty, filteredAndSorted, selectedRows, showToast]);

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

      <div className="mx-4 mt-3 p-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.35)] text-xs text-[var(--color-text-muted)]">
        <span className="font-semibold text-[var(--color-accent)] mr-3">Data health</span>
        <span className="mr-3">Rows: {health.total}</span>
        <span className="mr-3">Missing part type: {health.missingPartType}</span>
        <span className="mr-3">Missing rarity: {health.missingRarity}</span>
        <span className="mr-3">Unknown manufacturer: {health.unknownMfg}</span>
        <span>Duplicate code entries: {health.duplicateCode}</span>
      </div>

      <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 p-3 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.35)]">
        <span className="text-xs text-[var(--color-text-muted)]">
          Selected visible rows: {filteredAndSorted.filter((r) => selectedRows.has(getRowKey(r))).length}
        </span>
        <label className="text-xs text-[var(--color-text-muted)]">
          Qty:
          <input
            type="number"
            min={1}
            max={999}
            value={bulkQty}
            onChange={(e) => setBulkQty(parseInt(e.target.value, 10) || 1)}
            className="ml-2 w-20 px-2 py-1 rounded border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)]"
          />
        </label>
        <button
          type="button"
          onClick={handleBulkCopy}
          className="px-3 py-2 rounded-[10px] border border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] text-xs"
        >
          Bulk copy selected
        </button>
        <button
          type="button"
          onClick={() => setSelectedRows(new Set())}
          className="px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] text-[var(--color-text-muted)] text-xs"
        >
          Clear selection
        </button>
      </div>

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
        selectedKeys={selectedRows}
        onToggleFavorite={toggleFavorite}
        onToggleSelect={toggleSelectRow}
        onToggleSelectAllVisible={toggleSelectAllVisible}
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
