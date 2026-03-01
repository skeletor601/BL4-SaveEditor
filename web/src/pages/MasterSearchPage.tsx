import { useCallback, useEffect, useMemo, useState } from "react";

const FAVORITES_KEY = "bl4-master-search-favorites";

export interface PartItem {
  code: string;
  itemType: string;
  rarity?: string;
  partName: string;
  effect?: string;
  category?: string;
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
    fetch(`/api/parts/search?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [query, category, refresh]);

  const filtered = useMemo(() => {
    let list = items;
    if (favoritesOnly) list = list.filter((p) => favorites.has(p.code));
    if (sortRarity === "Legendary first") list = [...list].sort((a, b) => (b.rarity === "Legendary" ? 1 : 0) - (a.rarity === "Legendary" ? 1 : 0));
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">BL4 Master Search</h1>
        <span className="px-2 py-0.5 rounded text-xs bg-accent/20 text-accent border border-panel-border">BETA</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search anything (code, part, name)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded border border-panel-border bg-panel text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded border border-panel-border bg-panel text-accent"
        >
          <option value="All">Category: All</option>
          <option value="Enhancement">Enhancement</option>
        </select>
        <select
          value={sortRarity}
          onChange={(e) => setSortRarity(e.target.value)}
          className="px-3 py-2 rounded border border-panel-border bg-panel text-accent"
        >
          <option value="Default">Sort by rarity: Default</option>
          <option value="Legendary first">Legendary first</option>
        </select>
        <select
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          className="px-3 py-2 rounded border border-panel-border bg-panel text-accent"
        >
          <option value="All">Manufacturer: All</option>
        </select>
        <label className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} className="rounded border-panel-border text-accent" />
          Favorites only
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRefresh((r) => r + 1)} className="px-3 py-2 rounded border border-panel-border text-accent hover:bg-panel">Reload</button>
          <button type="button" onClick={exportFavorites} className="px-3 py-2 rounded border border-panel-border text-accent hover:bg-panel">Export favorites</button>
          <button type="button" onClick={importFavorites} className="px-3 py-2 rounded border border-panel-border text-accent hover:bg-panel">Import favorites</button>
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--color-text-muted)]">Loading…</p>
      ) : (
        <div className="border border-panel-border rounded-lg overflow-hidden bg-panel">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel border-b border-panel-border">
                <tr>
                  <th className="text-left p-2 w-10"></th>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Item Type</th>
                  <th className="text-left p-2">Rarity</th>
                  <th className="text-left p-2">Part Name</th>
                  <th className="text-left p-2">Effect</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.code + row.partName}
                    className={`border-b border-panel-border/50 hover:bg-accent/10 cursor-pointer ${row.rarity === "Legendary" ? "bg-accent/5" : ""}`}
                    onClick={() => setLightboxItem(row)}
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(row.code); }}
                        className="text-lg"
                        aria-label={favorites.has(row.code) ? "Remove favorite" : "Add favorite"}
                      >
                        {favorites.has(row.code) ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="p-2 font-mono">{row.code}</td>
                    <td className="p-2">{row.itemType}</td>
                    <td className="p-2">{row.rarity ?? "–"}</td>
                    <td className="p-2 font-mono text-xs">{row.partName}</td>
                    <td className="p-2 max-w-md truncate">{row.effect ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-2 text-[var(--color-text-muted)] text-xs">{filtered.length} result(s)</p>
        </div>
      )}

      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxItem(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Part details"
        >
          <div
            className="bg-panel border-2 border-panel-border rounded-lg max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-accent font-semibold">{lightboxItem.itemType}</h3>
            <p className="font-mono text-sm mt-1">{lightboxItem.partName}</p>
            <p className="text-sm mt-2">{lightboxItem.effect ?? "–"}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Code: {lightboxItem.code}</p>
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              className="mt-4 px-4 py-2 rounded border border-panel-border text-accent hover:bg-panel"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
