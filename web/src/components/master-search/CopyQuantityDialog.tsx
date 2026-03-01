import { useState, useEffect, useRef } from "react";

interface CopyQuantityDialogProps {
  code: string;
  codePreview: string;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
}

export default function CopyQuantityDialog({
  code,
  codePreview,
  onConfirm,
  onCancel,
}: CopyQuantityDialogProps) {
  const [qty, setQty] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCopy = () => {
    const n = Math.max(1, Math.min(999, qty));
    onConfirm(n);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-dialog-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="bg-[var(--color-panel)] border border-[var(--color-panel-border)] rounded-xl p-5 min-w-[280px] max-w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="copy-dialog-title" className="m-0 mb-3.5 text-sm text-[var(--color-text)]">
          Copy code
        </h3>
        <p className="font-mono text-[11px] text-[var(--color-text-muted)] mb-3.5 break-all">
          {codePreview || code}
        </p>
        <label className="block text-[var(--color-text-muted)] text-[11px] mb-1.5">
          Quantity to copy
        </label>
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={999}
          value={qty}
          onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCopy();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm mb-4 focus:outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-[10px] border border-[var(--color-panel-border)] bg-[rgba(28,32,38,0.92)] text-[var(--color-text)] text-xs hover:border-[var(--color-accent)] touch-manipulation min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 rounded-[10px] border border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)] text-xs hover:border-[var(--color-accent)] touch-manipulation min-h-[44px] primary"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
