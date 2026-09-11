// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LA PÁGINA DE UNA EMPRESA: qué se ve y en qué orden (10-sep-2026).
//
// Daniel, textual: *«los pipeline tener default los no pagados»* → abre en
// «Por cobrar». Y sobre el orden: *«viejo es factura, no creado»* → la factura
// más vieja primero. Los que no tienen fecha de factura van AL FINAL y la
// pantalla dice «Falta la fecha de la factura».
//
// «En proceso» se retiró de la pantalla (0 usos en 3 meses): el valor se
// conserva en la base y acá cuenta como «por cobrar», que es lo que es.
// ─────────────────────────────────────────────────────────────────────────────

import { esPendiente } from "./pendientes";

export type FiltroEstado = "por-cobrar" | "cobrados";
export const FILTRO_DEFAULT: FiltroEstado = "por-cobrar";
export const FALTA_FECHA_FACTURA = "Falta la fecha de la factura";

export interface Ordenable {
  fecha_factura?: string | null;
  created_at?: string | null;
  estado?: string | null;
}

/** El filtro que viene de la URL, o el default si trae basura. */
export function filtroDesdeUrl(valor: string | null | undefined): FiltroEstado {
  return valor === "cobrados" ? "cobrados" : FILTRO_DEFAULT;
}

export function filtrarPorEstado<T extends Ordenable>(reclamos: readonly T[], filtro: FiltroEstado): T[] {
  return reclamos.filter((r) => (filtro === "cobrados" ? !esPendiente(r) : esPendiente(r)));
}

/**
 * Fecha de factura más vieja primero; sin fecha, al final (y entre esos, el
 * creado más recientemente arriba, que es el que Andrea tiene más fresco).
 */
export function ordenarPorFactura<T extends Ordenable>(reclamos: readonly T[]): T[] {
  return [...reclamos].sort((a, b) => {
    const fa = a.fecha_factura || "";
    const fb = b.fecha_factura || "";
    if (fa && fb) return fa.localeCompare(fb);
    if (fa) return -1;
    if (fb) return 1;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}
