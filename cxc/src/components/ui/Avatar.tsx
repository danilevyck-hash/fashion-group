"use client";

const ROLE_COLORS: Record<string, string> = {
  admin:        "bg-gray-900 text-white",
  secretaria:   "bg-amber-600 text-white",
  vendedor:     "bg-teal-700 text-white",
  bodega:       "bg-gray-400 text-white",
  contabilidad: "bg-sky-500 text-white",
};

const FALLBACK = "bg-gray-300 text-gray-700";

const SIZE_CLASSES: Record<string, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

export interface AvatarProps {
  name: string;
  role?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ name, role, size = "md", className = "" }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const color = (role && ROLE_COLORS[role]) || FALLBACK;
  return (
    <div
      className={`rounded-full flex items-center justify-center font-medium shrink-0 ${SIZE_CLASSES[size]} ${color} ${className}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
