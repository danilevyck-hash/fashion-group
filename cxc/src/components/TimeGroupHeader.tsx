"use client";

import { useState } from "react";

interface TimeGroupHeaderProps {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Number of columns the header should span (for table contexts) */
  colSpan?: number;
  /** Render as table row instead of div */
  asTableRow?: boolean;
}

export default function TimeGroupHeader({
  label,
  count,
  color,
  bgColor,
  defaultOpen = true,
  children,
}: TimeGroupHeaderProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`sticky top-14 z-[5] w-full flex items-center gap-3 px-4 py-2 text-left transition-colors bg-gray-50/90 backdrop-blur-sm border-b border-gray-200`}
      >
        <svg
          className={`w-3 h-3 ${color} transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className={`text-sm font-semibold ${color}`}>
          {label}
        </span>
        <span className="text-[11px] text-gray-400 tabular-nums">
          ({count} {count === 1 ? "guía" : "guías"})
        </span>
      </button>
      {open && children}
    </div>
  );
}
