"use client";

import type { EstadoProyecto, EstadoCobranza } from "@/lib/marketing/types";

type Tipo = "proyecto" | "cobranza";
type Size = "sm" | "md";

interface EstadoBadgeProps {
  tipo: Tipo;
  estado: string;
  size?: Size;
}

// Color tokens alineados al design system del repo:
// blue, emerald, amber, gray, red
const PROYECTO_COLORS: Record<EstadoProyecto, string> = {
  abierto: "bg-blue-50 text-blue-700 border-blue-200",
  por_cobrar: "bg-amber-50 text-amber-700 border-amber-200",
  enviado: "bg-violet-50 text-violet-700 border-violet-200",
  cobrado: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PROYECTO_LABELS: Record<EstadoProyecto, string> = {
  abierto: "Abierto",
  por_cobrar: "Por cobrar",
  enviado: "Enviado",
  cobrado: "Cobrado",
};

const COBRANZA_COLORS: Record<EstadoCobranza, string> = {
  borrador: "bg-gray-100 text-gray-600 border-gray-200",
  enviada: "bg-blue-50 text-blue-700 border-blue-200",
  pagada_parcial: "bg-amber-50 text-amber-700 border-amber-200",
  pagada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disputada: "bg-red-50 text-red-700 border-red-200",
};

const COBRANZA_LABELS: Record<EstadoCobranza, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  pagada_parcial: "Pagada parcialmente",
  pagada: "Pagada",
  disputada: "Disputada",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function EstadoBadge({ tipo, estado, size = "sm" }: EstadoBadgeProps) {
  const colors =
    tipo === "proyecto"
      ? PROYECTO_COLORS[estado as EstadoProyecto] ??
        "bg-gray-100 text-gray-600 border-gray-200"
      : COBRANZA_COLORS[estado as EstadoCobranza] ??
        "bg-gray-100 text-gray-600 border-gray-200";

  const label =
    tipo === "proyecto"
      ? PROYECTO_LABELS[estado as EstadoProyecto] ?? estado
      : COBRANZA_LABELS[estado as EstadoCobranza] ?? estado;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${SIZES[size]} ${colors}`}
    >
      {label}
    </span>
  );
}

export default EstadoBadge;
