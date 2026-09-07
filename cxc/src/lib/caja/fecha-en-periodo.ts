/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — UN RECIBO CON FECHA FUERA DE SU PERÍODO (7-sep-2026).
 *
 * 🩸 Medido: el período Nº3 abrió el 2 de septiembre y **25 de sus 26 recibos
 * son anteriores** (el más viejo, del 23 de junio); el Nº2 tiene 10 así. No es
 * un error de nadie: el recibo llega tarde y se teclea cuando aparece, en una
 * tanda de semanas atrás.
 *
 * 🔴 Por eso **avisa, NUNCA bloquea**, con «Guardar igual». Lo único que hace
 * es que Angela vea, en el momento de guardar, que ese papel es de otro ciclo.
 *
 * Módulo PURO: compara cadenas `YYYY-MM-DD`, que ordenan bien alfabéticamente.
 * Sin `new Date()`, sin husos horarios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { diaEnPalabras } from "./gasto-repetido";

export interface PeriodoConFechas {
  numero?: number | null;
  fecha_apertura?: string | null;
  fecha_cierre?: string | null;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ¿Dónde cae la fecha del recibo respecto de su período?
 *  · `"antes"`   — anterior a la apertura;
 *  · `"despues"` — posterior al cierre (solo si el período ya cerró);
 *  · `null`      — adentro, o no se puede saber (falta la fecha, o viene con
 *                  un formato que no se entiende: ante la duda, no se opina).
 */
export function fechaFueraDelPeriodo(
  fecha: string | null | undefined,
  periodo: PeriodoConFechas,
): "antes" | "despues" | null {
  const f = String(fecha ?? "");
  if (!ES_FECHA.test(f)) return null;

  const apertura = String(periodo.fecha_apertura ?? "");
  if (ES_FECHA.test(apertura) && f < apertura) return "antes";

  const cierre = String(periodo.fecha_cierre ?? "");
  if (ES_FECHA.test(cierre) && f > cierre) return "despues";

  return null;
}

/**
 * El aviso tal como se lee en pantalla, o `null` cuando la fecha está adentro.
 * Dice el hecho y nada más — la decisión es de quien está cargando.
 */
export function mensajeFechaFueraDelPeriodo(
  fecha: string | null | undefined,
  periodo: PeriodoConFechas,
): string | null {
  const donde = fechaFueraDelPeriodo(fecha, periodo);
  if (!donde) return null;

  const cual = periodo.numero ? `el período Nº ${periodo.numero}` : "este período";
  if (donde === "antes") {
    return `Este recibo es del ${diaEnPalabras(fecha)}, antes de que abriera ${cual} (${diaEnPalabras(periodo.fecha_apertura)}).`;
  }
  return `Este recibo es del ${diaEnPalabras(fecha)}, después de que cerrara ${cual} (${diaEnPalabras(periodo.fecha_cierre)}).`;
}
