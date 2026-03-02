export type QuickFilterType = "" | "damage" | "crit" | "splash";

export interface FilterState {
  category: string;
  partType: string;
  sortRarity: string;
  manufacturer: string;
  favoritesOnly: boolean;
  quickFilter: QuickFilterType;
}

const CATEGORIES = ["All", "Weapon", "Shield", "Class Mod", "Enhancement", "Grenade", "Repkit", "Heavy"];
const SORT_OPTIONS = ["Default", "Legendary first", "Epic first", "Rare first", "Common first"];

interface FiltersProps {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  onExportFavorites: () => void;
  onImportFavorites: () => void;
  manufacturerOptions: string[];
  partTypeOptions: string[];
}

export default function Filters({
  filters,
  onFiltersChange,
  onExportFavorites,
  onImportFavorites,
  manufacturerOptions,
  partTypeOptions,
}: FiltersProps) {
  const update = (patch: Partial<FilterState>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <div className="flex flex-wrap gap-3 sm:gap-[12px] py-3 sm:py-[14px] px-4 sm:px-5 bg-[rgba(18,21,26,0.6)] border-b border-[var(--color-panel-border)] items-center overflow-x-auto">
      <label className="text-[var(--color-text-muted)] text-[11px] mr-1 shrink-0">
        Category
      </label>
      <select
        value={filters.category}
        onChange={(e) => update({ category: e.target.value })}
        className="px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] min-w-[120px] min-h-[44px] focus:outline-none focus:border-[var(--color-accent)] touch-manipulation"
        aria-label="Category"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <label className="text-[var(--color-text-muted)] text-[11px] mr-1 shrink-0">
        Part type
      </label>
      <select
        value={filters.partType}
        onChange={(e) => update({ partType: e.target.value })}
        className="px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] min-w-[120px] min-h-[44px] focus:outline-none focus:border-[var(--color-accent)] touch-manipulation"
        aria-label="Part type"
      >
        {partTypeOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <span className="text-[var(--color-text-muted)] text-[11px] mr-1 shrink-0 w-full basis-full sm:basis-auto mt-1 sm:mt-0">Quick:</span>
      <button
        type="button"
        onClick={() => update({ quickFilter: filters.quickFilter === "damage" ? "" : "damage" })}
        className={`px-3 py-2 min-h-[44px] rounded-[10px] border text-[11px] touch-manipulation ${
          filters.quickFilter === "damage"
            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
            : "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        }`}
      >
        Damage
      </button>
      <button
        type="button"
        onClick={() => update({ quickFilter: filters.quickFilter === "crit" ? "" : "crit" })}
        className={`px-3 py-2 min-h-[44px] rounded-[10px] border text-[11px] touch-manipulation ${
          filters.quickFilter === "crit"
            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
            : "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        }`}
      >
        Crit damage
      </button>
      <button
        type="button"
        onClick={() => update({ quickFilter: filters.quickFilter === "splash" ? "" : "splash" })}
        className={`px-3 py-2 min-h-[44px] rounded-[10px] border text-[11px] touch-manipulation ${
          filters.quickFilter === "splash"
            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
            : "border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        }`}
      >
        Splash damage
      </button>

      <label className="text-[var(--color-text-muted)] text-[11px] mr-1 shrink-0">
        Sort by rarity
      </label>
      <select
        value={filters.sortRarity}
        onChange={(e) => update({ sortRarity: e.target.value })}
        className="px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] min-w-[120px] min-h-[44px] focus:outline-none focus:border-[var(--color-accent)] touch-manipulation"
        aria-label="Sort by rarity"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      <label className="text-[var(--color-text-muted)] text-[11px] mr-1 shrink-0">
        Manufacturer
      </label>
      <select
        value={filters.manufacturer}
        onChange={(e) => update({ manufacturer: e.target.value })}
        className="px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] min-w-[120px] min-h-[44px] focus:outline-none focus:border-[var(--color-accent)] touch-manipulation"
        aria-label="Manufacturer"
      >
        {manufacturerOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <label className="fav-check flex items-center gap-2 text-[var(--color-text-muted)] text-[11px] shrink-0 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={filters.favoritesOnly}
          onChange={(e) => update({ favoritesOnly: e.target.checked })}
          className="w-[18px] h-[18px] cursor-pointer"
          aria-label="Favorites only"
        />
        Favorites only
      </label>

      <div className="flex flex-wrap gap-2 ml-auto shrink-0">
        <button
          type="button"
          onClick={onExportFavorites}
          className="px-3 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] touch-manipulation"
        >
          Export favorites
        </button>
        <button
          type="button"
          onClick={onImportFavorites}
          className="px-3 py-2 min-h-[44px] rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] touch-manipulation"
        >
          Import favorites
        </button>
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)] ml-1 self-center max-w-[320px] w-full sm:w-auto shrink-0">
        Export saves to your Downloads folder as bl4-favorites.json. When importing, open that file from Downloads.
      </p>
    </div>
  );
}
