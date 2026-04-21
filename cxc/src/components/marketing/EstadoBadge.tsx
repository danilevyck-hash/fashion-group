"use client";

import type { EstadoProyecto } from "@/lib/marketing/types";

type Tipo = "proyecto";
type Size = "sm" | "md";

interface EstadoBadgeProps {
  tipo?: Tipo;
  estado: string;
  size?: Size;
}

const PROYECTO_COLORS: Record<EstadoProyecto, string> = {
  abierto: "bg-blue-50 text-blue-700 border-blue-200",
  enviado: "bg-violet-50 text-violet-700 border-violet-200",
  cobrado: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PROYECTO_LABELS: Record<EstadoProyecto, string> = {
  abierto: "Abierto",
  enviado: "Enviado",
  cobrado: "Cobrado",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function EstadoBadge({ estado, size = "sm" }: EstadoBadgeProps) {
  const colors =
    PROYECTO_COLORS[estado as EstadoProyecto] ??
    "bg-gray-100 text-gray-600 border-gray-200";
  const label = PROYECTO_LABELS[estado as EstadoProyecto] ?? estado;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${SIZES[size]} ${colors}`}
    >
      {label}
    </span>
  );
}

export default EstadoBadge;
