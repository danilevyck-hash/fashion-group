"use client";

import { useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Inline combobox used by GastoTable's in-place edit (legacy text path).
 * Closed-set form inputs now use a native <select> backed by a catálogo.
 */
export default function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const matches = value.length >= 1
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className={className}
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={() => { onChange(m); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
