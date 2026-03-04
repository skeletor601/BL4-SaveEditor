import { useState } from "react";
import { cleanDecodedString } from "@/lib/cleanDecodedString";

interface CleanCodeDialogProps {
  initialDecoded: string;
  initialBase85?: string;
  onClose: () => void;
}

export default function CleanCodeDialog({
  initialDecoded,
  initialBase85 = "",
  onClose,
}: CleanCodeDialogProps) {
  const [decodedInput, setDecodedInput] = useState(initialDecoded);
  const [base85Input, setBase85Input] = useState(initialBase85);
  const [cleanedDecoded, setCleanedDecoded] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClean = () => {
    if (!confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    const { cleaned, error } = cleanDecodedString(decodedInput.trim());
    if (error) {
      setCleanedDecoded(`Error: ${error}`);
      return;
    }
    setCleanedDecoded(cleaned);
    setConfirmOpen(false);
  };

  const handleCopyOutput = () => {
    if (cleanedDecoded) {
      navigator.clipboard.writeText(cleanedDecoded);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.98)] shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--color-panel-border)] flex items-center justify-between">
          <h3 className="text-[var(--color-accent)] font-medium">Clean Code</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm"
          >
            Close
          </button>
        </div>
        <p className="px-4 pt-2 text-sm text-[var(--color-text-muted)]">
          Paste your decoded code below, then click Clean Code. Confirm when prompted. Copy the output back into your build.
        </p>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Deserialized (decoded)</label>
            <textarea
              value={decodedInput}
              onChange={(e) => setDecodedInput(e.target.value)}
              placeholder="e.g. 9, 0, 1, 50| 2, 1253|| {83} {82} {22:33} {22:16} ..."
              rows={5}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] resize-y"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Base85 (optional)</label>
            <textarea
              value={base85Input}
              onChange={(e) => setBase85Input(e.target.value)}
              placeholder="Paste Base85 here if you prefer"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] resize-y"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Output (cleaned)</label>
            <textarea
              readOnly
              value={cleanedDecoded}
              placeholder="Click Clean Code to combine like codes (e.g. {22:[33 16 77]})"
              rows={5}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] text-sm font-mono resize-y"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--color-panel-border)] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClean}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[40px] text-sm"
          >
            {confirmOpen ? "Are you sure? Click again to clean" : "Clean Code"}
          </button>
          {confirmOpen && (
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] min-h-[40px] text-sm"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyOutput}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] min-h-[40px] text-sm"
          >
            Copy output
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] min-h-[40px] text-sm ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
