import { useEffect } from "react";

export interface PickerOption {
  value: string;
  label: string;
  badge?: string;
}

interface MobilePickerProps {
  title: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

/** Full-screen bottom-sheet picker with themed radio buttons. */
export default function MobilePicker({ title, options, value, onChange, onClose }: MobilePickerProps) {
  // Prevent body scroll while picker is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="mobile-picker-overlay" onClick={onClose}>
      <div className="mobile-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-picker-header">
          <h3>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 14, padding: 8, cursor: "pointer" }}
          >
            Done
          </button>
        </div>
        <div className="mobile-picker-list">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`mobile-picker-item ${selected ? "selected" : ""}`}
                onClick={() => { onChange(opt.value); onClose(); }}
              >
                <span className="mobile-picker-radio" />
                <span style={{ flex: 1 }}>
                  {opt.label}
                  {opt.badge && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.15)", padding: "2px 6px", borderRadius: 4 }}>
                      {opt.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
