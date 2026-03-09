import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApi } from "@/lib/apiClient";
import { apiItemToPartRow, inferRarity } from "@/data/partsData";

const FAVORITES_KEY = "bl4-master-search-favorites";

export interface PartItem {
  code: string;
  itemType: string;
  rarity?: string;
  partName: string;
  effect?: string;
  category?: string;
}

function isLegendaryItem(item: PartItem): boolean {
  return inferRarity(apiItemToPartRow(item)).toLowerCase() === "legendary";
}

function isPearlItem(item: PartItem): boolean {
  return inferRarity(apiItemToPartRow(item)).toLowerCase() === "pearl";
}

function displayRarity(item: PartItem): string {
  const inferred = inferRarity(apiItemToPartRow(item));
  return inferred ? inferred.charAt(0).toUpperCase() + inferred.slice(1) : (item.rarity ?? "");
}

function loadFavorites(): Set<string> {
  try {
    const s = localStorage.getItem(FAVORITES_KEY);
    if (s) return new Set(JSON.parse(s) as string[]);
  } catch {}
  return new Set();
}

function saveFavorites(set: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
}

export default function MasterSearchPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sortRarity, setSortRarity] = useState("Default");
  const [manufacturer, setManufacturer] = useState("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<PartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [lightboxItem, setLightboxItem] = useState<PartItem | null>(null);

  const toggleFavorite = useCallback((code: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      saveFavorites(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category !== "All") params.set("category", category);
    params.set("limit", "500");
    fetchApi(`parts/search?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [query, category, refresh]);

  const filtered = useMemo(() => {
    let list = items;
    if (favoritesOnly) list = list.filter((p) => favorites.has(p.code));
    if (sortRarity === "Legendary first") {
      list = [...list].sort((a, b) => (isLegendaryItem(b) ? 1 : 0) - (isLegendaryItem(a) ? 1 : 0));
    }
    if (sortRarity === "Pearl first") {
      list = [...list].sort((a, b) => (isPearlItem(b) ? 1 : 0) - (isPearlItem(a) ? 1 : 0));
    }
    return list;
  }, [items, favoritesOnly, sortRarity, favorites]);

  const exportFavorites = () => {
    const favList = filtered.filter((p) => favorites.has(p.code));
    const blob = new Blob([JSON.stringify(favList, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bl4-favorites.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFavorites = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const arr = JSON.parse(r.result as string) as PartItem[];
          const codes = (Array.isArray(arr) ? arr : []).map((p) => p.code).filter(Boolean);
          setFavorites((prev) => {
            const next = new Set(prev);
            codes.forEach((c) => next.add(c));
            saveFavorites(next);
            return next;
          });
        } catch {}
      };
      r.readAsText(f);
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back to dashboard */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          ← Home
        </Link>
      </div>

      {/* Page title card (matches Dashboard style) */}
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Master Search</h1>
          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/20 text-accent border border-panel-border">
            BETA
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Search by code, part name, manufacturer, or type. Click a row for details.
        </p>
      </div>

      {/* Filters card */}
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-stretch">
            <input
              type="search"
              placeholder="Search (e.g. hellwalker, triple bypass, code…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2.5 rounded-lg border border-panel-border bg-panel text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-accent/50"
              aria-label="Search parts"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-2 rounded-lg border border-panel-border bg-panel text-accent text-sm"
                aria-label="Category"
              >
                <option value="All">All categories</option>
                <option value="Enhancement">Enhancement</option>
              </select>
              <select
                value={sortRarity}
                onChange={(e) => setSortRarity(e.target.value)}
                className="px-3 py-2 rounded-lg border border-panel-border bg-panel text-accent text-sm"
                aria-label="Sort by rarity"
              >
                <option value="Default">Default order</option>
                <option value="Pearl first">Pearl first</option>
                <option value="Legendary first">Legendary first</option>
              </select>
              <select
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="px-3 py-2 rounded-lg border border-panel-border bg-panel text-accent text-sm"
                aria-label="Manufacturer"
              >
                <option value="All">All manufacturers</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                  className="rounded border-panel-border text-accent"
                />
                Favorites only
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRefresh((r) => r + 1)}
              className="px-3 py-2 rounded-lg border border-panel-border text-accent text-sm hover:bg-panel transition-colors"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={exportFavorites}
              className="px-3 py-2 rounded-lg border border-panel-border text-accent text-sm hover:bg-panel transition-colors"
            >
              Export favorites
            </button>
            <button
              type="button"
              onClick={importFavorites}
              className="px-3 py-2 rounded-lg border border-panel-border text-accent text-sm hover:bg-panel transition-colors"
            >
              Import favorites
            </button>
          </div>
        </div>
      </div>

      {/* Results card */}
      <div className="rounded-lg border-2 border-[var(--color-panel-border)] bg-[rgba(48,52,60,0.45)] backdrop-blur-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-[var(--color-text-muted)]">Loading…</p>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[rgba(48,52,60,0.95)] border-b border-panel-border">
                  <tr>
                    <th className="text-left p-3 w-10" aria-label="Favorite" />
                    <th className="text-left p-3 font-medium text-[var(--color-text)]">Code</th>
                    <th className="text-left p-3 font-medium text-[var(--color-text)]">Item Type</th>
                    <th className="text-left p-3 font-medium text-[var(--color-text)]">Rarity</th>
                    <th className="text-left p-3 font-medium text-[var(--color-text)]">Part Name</th>
                    <th className="text-left p-3 font-medium text-[var(--color-text)]">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isPearl = isPearlItem(row);
                    const isLegendary = isLegendaryItem(row);
                    const rarityLabel = displayRarity(row) || "–";
                    const rarityClass = isPearl
                      ? "text-sky-300 font-semibold"
                      : isLegendary
                        ? "text-[var(--color-legendary)] font-semibold"
                        : "";
                    return (
                    <tr
                      key={row.code + row.partName}
                      className="border-b border-panel-border/50 hover:bg-accent/10 cursor-pointer transition-colors"
                      onClick={() => setLightboxItem(row)}
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(row.code);
                          }}
                          className="text-lg leading-none"
                          aria-label={favorites.has(row.code) ? "Remove favorite" : "Add favorite"}
                        >
                          {favorites.has(row.code) ? "★" : "☆"}
                        </button>
                      </td>
                      <td className={`p-3 font-mono text-xs ${rarityClass}`}>{row.code}</td>
                      <td className={`p-3 ${rarityClass}`}>{row.itemType}</td>
                      <td className={`p-3 ${rarityClass}`}>{rarityLabel}</td>
                      <td className={`p-3 font-mono text-xs ${rarityClass || "text-[var(--color-text)]"}`}>{row.partName}</td>
                      <td className={`p-3 max-w-md truncate ${rarityClass || "text-[var(--color-text-muted)]"}`}>{row.effect ?? "–"}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
            <p className="p-3 text-xs text-[var(--color-text-muted)] border-t border-panel-border">
              {filtered.length} result(s)
            </p>
          </>
        )}
      </div>

      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxItem(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Part details"
        >
          <div
            className="rounded-lg border-2 border-panel-border bg-[rgba(48,52,60,0.95)] backdrop-blur-sm max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-accent font-semibold">{lightboxItem.itemType}</h3>
            <p className="font-mono text-sm mt-1 text-[var(--color-text)]">{lightboxItem.partName}</p>
            <p className="text-sm mt-2 text-[var(--color-text-muted)]">{lightboxItem.effect ?? "–"}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Code: {lightboxItem.code}</p>
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              className="mt-4 px-4 py-2 rounded-lg border border-panel-border text-accent hover:bg-panel transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
