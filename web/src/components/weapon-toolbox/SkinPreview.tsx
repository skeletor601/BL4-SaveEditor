import { useState, useCallback, useEffect } from "react";
import { getSkinImageUrl } from "@/lib/skinImage";

interface SkinPreviewProps {
  /** Current skin token (value from dropdown). */
  token: string | null;
  /** Display name (label from dropdown). */
  label: string;
  /** Optional class for the container. */
  className?: string;
}

export default function SkinPreview({ token, label, className = "" }: SkinPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const imageUrl = getSkinImageUrl(token);
  const showPreview = token && imageUrl && !imgError;

  const handleImageLoad = useCallback(() => {
    setImgError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImgError(true);
  }, []);

  const openLightbox = useCallback(() => {
    if (!showPreview) return;
    setLightboxOpen(true);
  }, [showPreview]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  if (!token) return null;

  return (
    <>
      <div
        className={`flex flex-wrap items-start gap-3 ${className}`}
        style={{ minHeight: "80px" }}
      >
        {showPreview ? (
          <>
            <div
              className="relative flex-shrink-0 rounded-lg border border-[var(--color-panel-border)] bg-[rgba(10,10,16,0.8)] p-1 transition-transform duration-150 hover:scale-105 hover:border-[var(--color-accent)] cursor-pointer"
              style={{ width: 220, height: 110 }}
              onClick={openLightbox}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openLightbox();
                }
              }}
              aria-label={`Skin preview: ${label}. Click to enlarge.`}
            >
              <img
                src={imageUrl}
                alt={label}
                className="w-full h-full object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            </div>
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-semibold text-[var(--color-text)]">{label}</span>
              <span className="text-xs text-[var(--color-text-muted)] font-mono">{token}</span>
            </div>
          </>
        ) : (
          imageUrl && (
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-semibold text-[var(--color-text)]">{label}</span>
              <span className="text-xs text-[var(--color-text-muted)] font-mono">{token}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                Preview image not found for this skin.
              </span>
            </div>
          )
        )}
      </div>

      {lightboxOpen && showPreview && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Skin preview: ${label}`}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-xl border-2 border-[var(--color-accent)] bg-[rgba(10,10,16,0.95)] p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl}
              alt={label}
              className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
            />
            <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
              {label} — Click outside or press Escape to close
            </p>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full border border-[var(--color-panel-border)] bg-[var(--color-panel)] text-[var(--color-text)] hover:bg-[var(--color-panel-border)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
