import { useState } from "react";
import MobilePicker, { type PickerOption } from "./MobilePicker";

interface MobileSelectProps {
  label: string;
  required?: boolean;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Themed select field that opens a full-screen picker sheet. */
export default function MobileSelect({ label, required, options, value, onChange, placeholder }: MobileSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? "Select…";

  return (
    <div className="mobile-field">
      <div className="mobile-label">
        {label}
        {required && <span className="required">Required</span>}
      </div>
      <button type="button" className="mobile-select-btn" onClick={() => setOpen(true)}>
        <span style={{ opacity: value ? 1 : 0.5 }}>{selectedLabel}</span>
        <span className="chevron">▾</span>
      </button>
      {open && (
        <MobilePicker
          title={label}
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
