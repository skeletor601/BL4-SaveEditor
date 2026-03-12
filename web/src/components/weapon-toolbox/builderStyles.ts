/**
 * Shared CSS classes for weapon and accessory builders so they look and behave the same.
 */

export const inputClass =
  "w-full min-w-0 px-3 py-2 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(24,28,34,0.9)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] min-h-[44px]";

export const labelClass = "text-sm font-medium text-[var(--color-accent)]";

export const blockClass =
  "border border-[var(--color-panel-border)] rounded-lg p-4 bg-[rgba(24,28,34,0.6)]";

export const buttonSecondaryClass =
  "px-4 py-2 rounded-lg border border-[var(--color-panel-border)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)] hover:border-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] min-h-[44px] touch-manipulation";

export const buttonPrimaryClass =
  "px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium hover:opacity-90 min-h-[44px] touch-manipulation disabled:opacity-50";

export const FLAG_OPTIONS = [
  { value: 1, label: "1 (Normal)" },
  { value: 3, label: "3 (Favorite)" },
  { value: 5, label: "5 (Junk)" },
  { value: 17, label: "17 (Group1)" },
  { value: 33, label: "33 (Group2)" },
  { value: 65, label: "65 (Group3)" },
  { value: 129, label: "129 (Group4)" },
];
