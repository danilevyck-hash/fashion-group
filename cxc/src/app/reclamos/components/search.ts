import { Reclamo } from "./types";

/** Por dónde matcheó la búsqueda (para indicarlo en la UI cuando no es obvio). */
export type MatchVia = { tipo: "reclamo" | "factura" | "item"; valor: string } | null;

/**
 * Búsqueda de reclamos — match parcial (contiene), insensible a mayúsculas.
 * Campos: N° de reclamo, N° de factura (del reclamo o de cualquiera de sus
 * ítems — los reclamos multi-factura llevan la factura por ítem) y código/
 * referencia de los ítems. Devuelve por dónde matcheó, en orden de prioridad
 * (reclamo → factura → ítem).
 */
export function matchReclamo(r: Reclamo, query: string): MatchVia {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const has = (v: string | null | undefined) => (v || "").toLowerCase().includes(q);
  if (has(r.nro_reclamo)) return { tipo: "reclamo", valor: r.nro_reclamo };
  if (has(r.nro_factura)) return { tipo: "factura", valor: r.nro_factura };
  for (const it of r.reclamo_items ?? []) {
    if (has(it.nro_factura)) return { tipo: "factura", valor: it.nro_factura };
  }
  for (const it of r.reclamo_items ?? []) {
    if (has(it.referencia)) return { tipo: "item", valor: it.referencia };
  }
  return null;
}

/**
 * Texto del indicador "por qué apareció este resultado". Null cuando ya es
 * obvio en la fila: match por N° de reclamo, o por la factura del header (que
 * ya se ve en la columna Factura). Queda: factura de un ítem, o código de ítem.
 */
export function matchHint(r: Reclamo, via: MatchVia): string | null {
  if (!via) return null;
  if (via.tipo === "item") return `Ítem: ${via.valor}`;
  if (via.tipo === "factura" && via.valor !== r.nro_factura) return `Factura ${via.valor}`;
  return null;
}
