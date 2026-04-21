// ============================================================================
// Marketing module — normalización de texto (funciones puras, sin side effects)
// ============================================================================
import { fmtDate as fmtDateShared } from "@/lib/format";

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
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return fmtDateShared(`${y}-${m}-${day}`);
  }
  return fmtDateShared(d);
}
