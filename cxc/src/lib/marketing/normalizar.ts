// ============================================================================
// Marketing module — normalización de texto (funciones puras, sin side effects)
// ============================================================================
import { fmtDate as fmtDateShared } from "@/lib/format";
import type { EstadoProyecto } from "./types";

/**
 * Estado de LECTURA de un proyecto (abierto | cerrado).
 * Mapea los estados legacy del workflow viejo a la dupla actual:
 *   - 'abierto'            → 'abierto'
 *   - 'enviado'|'cobrado'  → 'cerrado'   (legacy, nunca se reescriben)
 *   - 'cerrado'            → 'cerrado'
 *   - null/desconocido     → 'abierto'   (default seguro)
 * 🔴 Desde el 11-ago-2026 NADIE escribe el estado ("Cerrar proyecto" se
 * retiró de la UI): esto queda solo para leer sin sorpresas los valores
 * legacy que sigan en la columna.
 */
export function normalizarEstadoProyecto(raw: unknown): EstadoProyecto {
  const v = String(raw ?? "abierto");
  return v === "enviado" || v === "cobrado" || v === "cerrado"
    ? "cerrado"
    : "abierto";
}

/**
 * Trim + colapsa espacios múltiples a uno solo.
 * null/undefined → "".
 * Respeta acentos y ñ.
 */
export function normalizarTexto(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return s.replace(/\s+/g, " ").trim();
}

// Palabras pequeñas que se mantienen en minúscula dentro de Title Case
// (excepto si es la primera palabra).
const MINOR_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
  "o",
  "u",
  "a",
  "en",
  "por",
  "para",
  "con",
  "sin",
]);

/**
 * Convierte a Title Case: primera letra de cada palabra en mayúscula,
 * resto en minúscula. Respeta acentos.
 * Palabras pequeñas (de, la, y, etc.) quedan en minúscula salvo que sean la primera.
 *
 * Aplica a: tienda, proveedor, nombre de proyecto.
 */
export function tituloCase(s: string | null | undefined): string {
  const base = normalizarTexto(s);
  if (base.length === 0) return "";

  const palabras = base.split(" ");
  return palabras
    .map((palabra, idx) => {
      if (palabra.length === 0) return palabra;
      const lower = palabra.toLocaleLowerCase("es");
      if (idx > 0 && MINOR_WORDS.has(lower)) {
        return lower;
      }
      const first = lower.charAt(0).toLocaleUpperCase("es");
      return first + lower.slice(1);
    })
    .join(" ");
}

/**
 * Convierte a Sentence case: solo la primera letra en mayúscula, resto en minúscula.
 * Respeta acentos.
 *
 * Aplica a: concepto, notas, asunto.
 */
export function oracionCase(s: string | null | undefined): string {
  const base = normalizarTexto(s);
  if (base.length === 0) return "";
  const lower = base.toLocaleLowerCase("es");
  const first = lower.charAt(0).toLocaleUpperCase("es");
  return first + lower.slice(1);
}

/**
 * Normaliza un email: trim + collapse + toLowerCase.
 */
export function emailLower(s: string | null | undefined): string {
  return normalizarTexto(s).toLocaleLowerCase("es");
}

/**
 * Formatea un monto como moneda: $1,234.56.
 * null/undefined/NaN → "$0.00".
 */
export function formatearMonto(n: number | null | undefined): string {
  const valor = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const neg = valor < 0;
  const abs = Math.abs(valor).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (neg ? "-$" : "$") + abs;
}

/**
 * Formatea una fecha al estilo del proyecto: "5 abr 2026".
 * Reusa fmtDate de src/lib/format.ts para mantener consistencia.
 */
export function formatearFecha(d: string | Date | null | undefined): string {
  if (!d) return "";
  // Caso Date
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return fmtDateShared(`${y}-${m}-${day}`);
  }
  // String: si trae "T" o espacio, es TIMESTAMPTZ → parsear con Date para
  // evitar el bug de fmtDate que concatena "T12:00:00" y produce Invalid Date.
  const esTimestamp = d.includes("T") || d.includes(" ");
  if (esTimestamp) {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return fmtDateShared(`${y}-${m}-${day}`);
  }
  // DATE puro (YYYY-MM-DD)
  return fmtDateShared(d);
}

// ----------------------------------------------------------------------------
// Contadores de la fila de proyecto (lista de una marca).
//
// 🔴 SOLO SE DICEN LOS QUE NO SON CERO (aprobado por Daniel, 11-ago-2026):
// "2 facturas · 1 entrega", nunca "0 fotos" — un contador en cero es ruido que
// obliga a leer tres números para enterarse de uno. Con TODOS en cero la fila
// lo dice con palabras ("Sin gastos todavía"): un subtítulo vacío se leería
// como que a la fila le falta cargar algo.
// ----------------------------------------------------------------------------
export interface ContadoresProyecto {
  facturas: number;
  entregas: number;
  fotos: number;
}

export function contadoresDeProyecto(c: ContadoresProyecto): string {
  const partes: string[] = [];
  if (c.facturas > 0) {
    partes.push(`${c.facturas} ${c.facturas === 1 ? "factura" : "facturas"}`);
  }
  if (c.entregas > 0) {
    partes.push(`${c.entregas} ${c.entregas === 1 ? "entrega" : "entregas"}`);
  }
  if (c.fotos > 0) {
    partes.push(`${c.fotos} ${c.fotos === 1 ? "foto" : "fotos"}`);
  }
  return partes.length > 0 ? partes.join(" · ") : "Sin gastos todavía";
}
