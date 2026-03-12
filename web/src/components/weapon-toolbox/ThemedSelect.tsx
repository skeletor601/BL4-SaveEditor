import { useState, useEffect, useRef, type CSSProperties } from "react";

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  className: string;
  style?: CSSProperties;
  title?: string;
}

export default function ThemedSelect({
  value,
  onChange,
  options,
  className,
  style,
  title,
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!wrapperRef.current || !target) return;
      if (!wrapperRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, []);

  const selected = options.find((o) => o.value === value) ?? options[0] ?? { value: "", label: "" };

  return (
    <div ref={wrapperRef} className="relative" style={style}>
      <button
        type="button"
        className={`${className} text-left pr-8`}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="block truncate">{selected.label}</span>
      </button>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
        ▾
      </span>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={`${opt.value}-${opt.label}`}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 text-sm min-h-[38px] ${
                  active
                    ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
