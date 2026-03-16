/**
 * Skill detail card popup for Class Mod builder.
 * Theme-aware: uses --color-accent, --color-panel-border, --color-text, etc.
 * Layout: type pill, icon + name, description, effect/stats box, close button.
 */

import { useEffect, useState } from "react";
import { apiUrl, fetchApi } from "@/lib/apiClient";

function getSkillIconFilename(skillNameEN: string, className: string): string {
  const norm = skillNameEN
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['']/g, "")
    .replace(/\s+/g, "_");
  const safeName = norm.replace(/[^a-zA-Z0-9_!]/g, "").toLowerCase();
  const suffixMap: Record<string, string> = { Vex: "_1", Rafa: "_2", Harlowe: "_3", Amon: "_4" };
  const suffix = suffixMap[className] ?? "";
  return `${safeName}${suffix}.png`;
}

export interface SkillDetails {
  name: string;
  type: string;
  description: string;
  stats: string[];
}

interface SkillCardPopupProps {
  skillName: string;
  className: string;
  onClose: () => void;
}

export default function SkillCardPopup({ skillName, className, onClose }: SkillCardPopupProps) {
  const [details, setDetails] = useState<SkillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ class: className, name: skillName });
    fetchApi(`accessories/class-mod/skill-details?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((data: SkillDetails) => {
        if (!cancelled) setDetails(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillName, className]);

  const iconFilename = getSkillIconFilename(skillName, className);
  const iconSrc = apiUrl(`accessories/class-mod/skill-icon/${className}/${iconFilename}`);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-card-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-xl"
        style={{ backgroundColor: "rgba(24,28,34,0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: type pill + close */}
        <div className="flex items-start justify-between gap-3 p-3 pb-0">
          <span
            className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text)] border border-[var(--color-panel-border)]"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          >
            {details?.type || "Skill"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors rounded"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="p-3 pt-2">
          {/* Icon + Name */}
          <div className="flex items-center gap-3 mb-3">
            <img
              src={iconSrc}
              alt=""
              className="w-12 h-12 object-contain flex-shrink-0 rounded border border-[var(--color-panel-border)]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <h2
              id="skill-card-title"
              className="text-lg font-bold text-[var(--color-text)] leading-tight"
            >
              {skillName}
            </h2>
          </div>

          {loading && (
            <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-[var(--color-text-muted)]">Could not load skill details.</p>
          )}
          {details && !loading && (
            <>
              {/* Effect / Stats box (reference: orange-bordered box with description + stats) */}
              <div className="rounded-xl border-2 border-[var(--color-panel-border)] p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  Effect / Stats
                </div>
                <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
                  {details.description}
                </p>
                {details.stats && details.stats.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-[var(--color-text)] space-y-0.5">
                    {details.stats.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
