// ============================================================================
// Marketing — TODOS LOS MESES QUE UNA IMPULSADORA TIENE SIN PAGAR. Módulo PURO.
//
// 🩸 EL DEFECTO. La tarjeta miraba DOS meses: el anterior y el actual
// (`mesAnteriorISO` / `mesActualISO` en `impulsadoras.ts`). Un mes sin pagar
// más viejo que eso DESAPARECÍA de la pantalla: nadie lo veía y nadie lo
// pagaba. Medido contra producción el 22-sep-2026: Ana Trejos tiene pagos
// desde abril de 2024 y julio de 2026 estaba sin pagar sin que la pantalla lo
// dijera en ningún lado.
//
// 🔴 LA REGLA. Se listan todos los meses sin pagar DESDE EL PRIMER PAGO hasta
// el mes en curso de Panamá, el MÁS VIEJO ARRIBA. «Sin pagar» incluye el mes a
// medias (`parcial`): media quincena pagada no es un mes pagado, y la
// pantalla ya sabía decir qué días faltan.
//
// 🔑 DESDE EL PRIMER PAGO, y no desde la fecha de ingreso: la fecha de ingreso
// de una impulsadora no existe en la base (`mk_impulsadoras` tiene nombre,
// monto y `activa`). Inventar un arranque sería inventar una deuda. Sin ningún
// pago registrado la lista va VACÍA — no se sabe desde cuándo trabaja.
//
// Sin React, sin Supabase, sin `new Date()`: recibe el «hoy» de Panamá ya
// resuelto, como todo lo que en esta casa decide una fecha de negocio.
// ============================================================================

import { coberturaDelMes, mesDeFecha, type CoberturaMes, type Periodo } from "./periodo";

/** Un mes que todavía se debe. Es una `CoberturaMes` que nunca está pagada. */
export interface MesSinPagar extends CoberturaMes {
  estado: "parcial" | "pendiente";
}

/**
 * Tope de seguridad: 600 meses son 50 años. Una fecha mal tecleada («1024-04»)
 * no puede hacer que la pantalla dibuje diez mil chips ni que el servidor se
 * quede dando vueltas. Se recortan los meses MÁS VIEJOS, nunca los recientes.
 */
export const MAX_MESES_QUE_SE_MIRAN = 600;

/** Suma un mes a un "YYYY-MM-01". Aritmética de strings, sin `Date`. */
function mesSiguiente(mes: string): string {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** true si `a` ("YYYY-MM-01") es posterior a `b`. */
function esPosterior(a: string, b: string): boolean {
  return a > b;
}

/**
 * Todos los meses sin pagar, del más viejo al más nuevo.
 *
 * @param periodos  los períodos YA pagados (cualquier orden).
 * @param hoyPanamaISO  "YYYY-MM-DD" de hoy en Panamá. El último mes que se mira.
 */
export function mesesSinPagar(
  periodos: ReadonlyArray<Periodo>,
  hoyPanamaISO: string,
): MesSinPagar[] {
  if (!Array.isArray(periodos) || periodos.length === 0) return [];
  const hasta = mesDeFecha(String(hoyPanamaISO).slice(0, 10));
  if (!/^\d{4}-\d{2}-01$/.test(hasta)) return [];

  let primero = mesDeFecha(periodos[0].desde);
  for (const p of periodos) {
    const m = mesDeFecha(p.desde);
    if (m < primero) primero = m;
  }
  if (esPosterior(primero, hasta)) return [];

  // El tope recorta los meses MÁS VIEJOS: se empieza más tarde, nunca se
  // termina antes. Lo que no puede faltar es el mes de este mes.
  let mes = primero;
  const span =
    (Number(hasta.slice(0, 4)) - Number(mes.slice(0, 4))) * 12 +
    (Number(hasta.slice(5, 7)) - Number(mes.slice(5, 7))) +
    1;
  for (let sobran = span - MAX_MESES_QUE_SE_MIRAN; sobran > 0; sobran--) {
    mes = mesSiguiente(mes);
  }

  const out: MesSinPagar[] = [];
  while (!esPosterior(mes, hasta)) {
    const cob = coberturaDelMes(mes, periodos);
    if (cob.estado !== "pagado") out.push(cob as MesSinPagar);
    mes = mesSiguiente(mes);
  }
  return out;
}

/**
 * La línea que resume lo que debe. Dice CUÁNTOS meses y cuál es el más viejo,
 * que es lo único que hace falta para decidir a quién pagarle primero.
 * Sin nada que deber devuelve "" — no se dibuja una línea para decir cero.
 *
 * ⚠️ Los meses A MEDIAS se cuentan y se DICEN aparte. Medido el 22-sep-2026:
 * de los 24 meses que Ana Trejos tiene sin pagar, 5 son meses en los que falta
 * UN día (el pago se registró hasta el 30 de un mes de 31). Meterlos en el
 * mismo número sin avisar haría que «debe 24 meses» pareciera peor de lo que
 * es; esconderlos taparía media quincena sin pagar, que sí es plata.
 */
export function resumenDeLoQueDebe(
  meses: ReadonlyArray<MesSinPagar>,
  etiqueta: (mesISO: string) => string,
): string {
  if (meses.length === 0) return "";
  const n = meses.length;
  const aMedias = meses.filter((m) => m.estado === "parcial").length;
  const medio = aMedias > 0 ? ` (${aMedias} a medias)` : "";
  return `Debe ${n} ${n === 1 ? "mes" : "meses"}${medio} — el más viejo, ${etiqueta(meses[0].mes)}`;
}
