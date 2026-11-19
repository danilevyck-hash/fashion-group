/* ─────────────────────────────────────────────────────────────────────────────
 * QUIEN COBRA SUS HORAS EXTRA SIN APROBACIÓN (19-nov-2026). Módulo PURO.
 *
 * Daniel, sobre el 309 (Wiliant, guardia de Multifashion, 27-nov → 27-dic-2026):
 * *«sin aprobar horas extras»*. Sus horas extra, domingos (y sábados no
 * laborables) y feriados trabajados se pagan como si tuvieran decisión «sí»:
 * no salen en Aprobaciones, no son pendientes y no frenan el cierre.
 *
 * 🔑 UNA SOLA PUERTA: `leerAprobaciones` (lo leen el Reporte, la Planilla, el
 * aviso ámbar, el freno del cierre —que recalcula por la Planilla— y el Excel).
 * Acá se le agrega un «sí» por cada día del período, sin escribir en la base.
 * 🔴 Una decisión «sí» o «no» GUARDADA sigue mandando: nunca se pisa.
 *
 * ponytail: lista escrita a mano y temporal, hasta el 28-dic-2026 (quítalo ese
 * día). Si vuelve a pasar con otra persona, que sea una casilla de la ficha
 * («Aplica horas extra · sin aprobación»), no una lista que crece.
 * ────────────────────────────────────────────────────────────────────────── */

import { claveDia, decisionDe, type Aprobacion } from "./aprobaciones";

export const APRUEBAN_SOLOS: ReadonlySet<string> = new Set(["309"]);

/** Quién firma el «sí» que no escribió nadie. */
export const POR_APRUEBAN_SOLOS = "Sin aprobación (decisión de Daniel)";

/** Los días YYYY-MM-DD de `desde` a `hasta`, inclusive. Aritmética UTC: sin zona. */
function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Las filas leídas + un «sí» por día para quien aprueba solo, salvo lo ya decidido. */
export function conAprobadosSolos(
  filas: readonly Aprobacion[],
  desde: string,
  hasta: string,
  solos: ReadonlySet<string> = APRUEBAN_SOLOS,
): Aprobacion[] {
  const decididas = new Set(
    filas.filter((f) => decisionDe(f) !== null).map((f) => claveDia(f.codigo, f.fecha)),
  );
  // Una fila PENDIENTE de quien aprueba solo se reemplaza por el «sí».
  const out = filas.filter((f) => !(solos.has(f.codigo) && decisionDe(f) === null));
  for (const codigo of solos) {
    for (const fecha of diasDelRango(desde, hasta)) {
      if (decididas.has(claveDia(codigo, fecha))) continue;
      out.push({
        codigo, fecha, aprobado: true, decision: "si",
        minutosVistos: 0, por: POR_APRUEBAN_SOLOS, cuando: null,
      });
    }
  }
  return out;
}
