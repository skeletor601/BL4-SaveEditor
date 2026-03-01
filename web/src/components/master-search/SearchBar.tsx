interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = "Search" }: SearchBarProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-[200px] flex-1 px-3 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-[11px] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] min-h-[44px] touch-manipulation"
      aria-label="Search"
    />
  );
}
