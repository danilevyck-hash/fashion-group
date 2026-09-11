// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — «RECLAMADO» SE MARCA SOLO (10-sep-2026).
//
// Daniel, textual: *«lo más importante es tener el dato y saber si se pagó o
// no»*. Y antes de eso, saber si YA SE LE RECLAMÓ al proveedor: medido el
// 10-sep-2026, de 29 reclamos por cobrar **9 nunca se mandaron** ($9.592,03,
// el 64% de la plata) y en la pantalla los 29 se veían iguales.
//
// `reclamos.reclamado_en` se escribe la PRIMERA vez que el reclamo sale de la
// casa —se descarga su Excel o su PDF, o se manda el correo— y nunca se pisa
// (`marcarReclamados` en `marcar-reclamado.ts`). Este módulo es puro: decide
// qué se dice en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDate } from "@/lib/format";
import { esPendiente } from "./pendientes";

export const SIN_RECLAMAR = "Sin reclamar";

export interface ConReclamado {
  reclamado_en?: string | null;
  estado?: string | null;
}

/** true si ya salió de la casa (correo o descarga) al menos una vez. */
export function estaReclamado(r: ConReclamado): boolean {
  return !!r.reclamado_en;
}

/** «Reclamado 17 jul 2026» o «Sin reclamar». */
export function textoReclamado(r: ConReclamado): string {
  if (!r.reclamado_en) return SIN_RECLAMAR;
  return `Reclamado ${fmtDate(r.reclamado_en.slice(0, 10))}`;
}

/** Los que siguen por cobrar y nunca se le mandaron al proveedor. */
export function sinReclamar<T extends ConReclamado>(reclamos: readonly T[]): T[] {
  return reclamos.filter((r) => esPendiente(r) && !estaReclamado(r));
}
