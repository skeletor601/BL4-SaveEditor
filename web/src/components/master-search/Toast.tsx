interface ToastProps {
  message: string;
  visible: boolean;
}

export default function Toast({ message, visible }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-black/85 border border-[var(--color-accent-dim)] text-xs transition-opacity duration-200 z-[9999]"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {message}
    </div>
  );
}
