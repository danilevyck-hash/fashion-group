// ============================================================================
// Marketing — colores y siglas para empresas pagadoras internas
// ============================================================================
// Mapea empresa_codigo (companies.ts) → estilos Tailwind + sigla corta para
// usar en pills y tags. Consistente entre overlay, FacturaCard, EntregasSection
// y futuras vistas que necesiten identificar visualmente la empresa interna.
// ============================================================================

import { getCompany } from "@/lib/companies";

export interface EmpresaStyle {
  /** Sigla corta de 2 letras (FW, VI, FS, AS, AW, CB, JS) */
  code: string;
  /** Nombre legible (Fashion Wear, Vistana International, etc.) */
  nombre: string;
  /** Clase Tailwind para fondo (bg-amber-50, etc.) */
  bg: string;
  /** Clase Tailwind para texto (text-amber-900, etc.) */
  text: string;
  /** Clase Tailwind para borde (border-amber-200, etc.) */
  border: string;
}

const STYLES: Record<string, Omit<EmpresaStyle, "nombre">> = {
  fashion_wear: {
    code: "FW",
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-200",
  },
  vistana: {
    code: "VI",
    bg: "bg-purple-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
  fashion_shoes: {
    code: "FS",
    bg: "bg-blue-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  active_shoes: {
    code: "AS",
    bg: "bg-emerald-50",
    text: "text-emerald-900",
    border: "border-emerald-200",
  },
  active_wear: {
    code: "AW",
    bg: "bg-pink-50",
    text: "text-pink-900",
    border: "border-pink-200",
  },
  confecciones_boston: {
    code: "CB",
    bg: "bg-gray-100",
    text: "text-gray-800",
    border: "border-gray-300",
  },
  joystep: {
    code: "JS",
    bg: "bg-indigo-50",
    text: "text-indigo-900",
    border: "border-indigo-200",
  },
};

const FALLBACK: Omit<EmpresaStyle, "nombre"> = {
  code: "—",
  bg: "bg-gray-50",
  text: "text-gray-700",
  border: "border-gray-200",
};

/**
 * Devuelve estilos + sigla + nombre legible para una empresa interna.
 * Si el código no está en la tabla (empresa nueva sin estilo asignado),
 * usa fallback gris neutro y deriva sigla de la inicial del nombre.
 */
export function getEmpresaStyle(codigo: string | null | undefined): EmpresaStyle {
  if (!codigo) {
    return { ...FALLBACK, nombre: "" };
  }
  const company = getCompany(codigo);
  const nombre = company?.name ?? codigo;
  const style = STYLES[codigo];
  if (style) {
    return { ...style, nombre };
  }
  // Sigla derivada: 2 letras del nombre legible
  const parts = nombre.split(/\s+/).filter(Boolean);
  const sigla =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : nombre.slice(0, 2).toUpperCase();
  return { ...FALLBACK, code: sigla || "—", nombre };
}
