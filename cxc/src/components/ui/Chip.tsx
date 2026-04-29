"use client";

import type { ReactNode } from "react";

type Variant = "neutral" | "success" | "warning" | "danger" | "accent";

const VARIANTS: Record<Variant, { idle: string; active: string }> = {
  neutral: {
    idle:   "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
    active: "border-stone-900 bg-stone-900 text-white",
  },
  success: {
    idle:   "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
    active: "border-emerald-600 bg-emerald-600 text-white",
  },
  warning: {
    idle:   "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
    active: "border-amber-600 bg-amber-600 text-white",
  },
  danger: {
    idle:   "border-red-200 bg-white text-red-600 hover:bg-red-50",
    active: "border-red-600 bg-red-600 text-white",
  },
  accent: {
    idle:   "border-teal-200 bg-white text-teal-700 hover:bg-teal-50",
    active: "border-teal-700 bg-teal-700 text-white",
  },
};

export interface ChipProps {
  children: ReactNode;
  variant?: Variant;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Chip({ children, variant = "neutral", active = false, onClick, className = "" }: ChipProps) {
  const v = VARIANTS[variant];
  const base = "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors";
  const state = active ? v.active : v.idle;
  const interactive = onClick ? "cursor-pointer" : "cursor-default";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${state} ${interactive} ${className}`}>
        {children}
      </button>
    );
  }

  return (
    <span className={`${base} ${state} ${interactive} ${className}`}>
      {children}
    </span>
  );
}
