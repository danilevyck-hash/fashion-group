// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — QUÉ ES UN RECLAMO VIEJO (20-sep-2026). UN SOLO NÚMERO, UN SOLO
// LUGAR: la portada y el aviso semanal de Telegram leen esta constante.
//
// 🔴 EL CORTE SON 120 DÍAS, Y NO SE ELIGIÓ A OJO. Medido contra producción el
// 20-sep-2026 sobre los 19 reclamos abiertos:
//
//     90 días  → 15 de 19 (79 %) · $5.284,97
//    120 días  →  6 de 19 (32 %) · $3.190,82   ← el corte
//    180 días  →  5 de 19 (26 %) · $3.060,82
//
// Nueve reclamos están entre 93 y 103 días: son UNA MISMA TANDA, así que con 90
// el aviso los agarra a todos y deja de señalar nada —el mismo error que el
// chip «Alerta» que salía en 28 de 29 (*«un color que sale siempre deja de
// avisar»*)—. **120 es el primer corte donde el aviso apunta a una minoría de
// verdad.** Daniel lo eligió con estos tres números a la vista.
//
// 🔴 LA FECHA DE LA FACTURA ES LA QUE HAY, SIN ASTERISCOS (20-sep-2026). De los
// 33 reclamos vivos solo **4 tienen PDF**, así que en los otros 29 la fecha
// real no existe en ninguna parte y no hay de dónde sacarla. Daniel, textual:
// *«si puedes sacar la fecha de la factura y arreglarlo, belleza; sino usa la
// fecha de creación como la de la factura y ya, una sola fecha menos enredo»*.
// Por eso ni la pantalla ni el aviso llevan una advertencia al lado de los
// días: **una sola fecha**. ⚠️ Hacia adelante no se arrastra — al CREAR, el PDF
// es obligatorio (`validateReclamoNuevo`) y la fecha sale de la factura.
//
// 🔴 NO HAY CORTE DE «PERDIDO»: Daniel, 10-sep-2026, *«nunca por perdido»*.
// Esto NO esconde nada ni da nada por perdido — solo dice qué mirar primero.
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde } from "./dias";
import { esPendiente } from "./pendientes";
import { totalDe, type ReclamoDePortada } from "./portada";

/** Días desde la fecha de la FACTURA a partir de los cuales un reclamo es viejo. */
export const DIAS_RECLAMO_VIEJO = 120;

export interface ReclamoViejo {
  id: string;
  empresa: string;
  /** El número que se le muestra a la gente. */
  nroReclamo: string;
  dias: number;
  monto: number;
}

/** true si el reclamo sigue por cobrar y pasa del corte. Sin fecha, NO es viejo. */
export function esReclamoViejo(
  r: ReclamoDePortada & { estado?: string | null },
  hoy: string,
): boolean {
  if (!esPendiente(r)) return false;
  const d = diasDesde(r.fecha_factura, hoy);
  return d !== null && d >= DIAS_RECLAMO_VIEJO;
}

/**
 * Los reclamos por cobrar que pasan del corte, **del más viejo al menos viejo**.
 * Empate → el orden de entrada (el `sort` de JS es estable), nunca el azar.
 */
export function reclamosViejos(
  reclamos: readonly (ReclamoDePortada & { nro_reclamo?: string | null })[],
  hoy: string,
): ReclamoViejo[] {
  return reclamos
    .filter((r) => esReclamoViejo(r, hoy))
    .map((r) => ({
      id: r.id,
      empresa: r.empresa,
      nroReclamo: String(r.nro_reclamo ?? "").trim() || r.id,
      dias: diasDesde(r.fecha_factura, hoy) as number,
      monto: totalDe(r),
    }))
    .sort((a, b) => b.dias - a.dias);
}

export interface ResumenViejos {
  n: number;
  monto: number;
  /** Los tres más viejos, ya ordenados. Menos de tres si no hay más. */
  masViejos: ReclamoViejo[];
}

/** Cuántos son, cuánto suman y los TRES más viejos. */
export function resumenViejos(
  reclamos: readonly (ReclamoDePortada & { nro_reclamo?: string | null })[],
  hoy: string,
): ResumenViejos {
  const viejos = reclamosViejos(reclamos, hoy);
  return {
    n: viejos.length,
    monto: viejos.reduce((s, v) => s + v.monto, 0),
    masViejos: viejos.slice(0, 3),
  };
}
