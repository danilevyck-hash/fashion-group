// ─────────────────────────────────────────────────────────────────────────────
// «SIN PAGAR HACE +90 D» — el único dato NUEVO del rediseño de Cuentas por
// Cobrar (5-sep-2026). Módulo PURO: acá no hay consultas ni fechas del reloj.
//
// LA DEFINICIÓN, en una línea: días desde el ÚLTIMO PAGO REAL del cliente en
// las 6 empresas del grupo. Un cliente que nunca pagó no tiene número: tiene
// una frase.
//
// 🔴 LAS RETENCIONES NO CUENTAN, NI LOS RECIBOS EN CERO. Es la misma regla que
// ya rige `switch_ultimo_pago_cliente_v2` (`es_retencion = false` y
// `total <> 0`) y la ruta de los últimos 3 pagos: una retención de ITBMS de
// $19,60 haría parecer que City Mall pagó ayer, y un recibo de $0,00 es una
// aplicación o un anulado, no plata que entró.
//
// 🔴 EL CRUCE ES POR CÓDIGO (D-XXX), NUNCA POR NOMBRE. El código es la
// identidad del cliente en las 6 empresas; unir por nombre multiplica filas y
// mezcla homónimos.
//
// ⚠️ «Nunca ha pagado» quiere decir «no hay un solo recibo suyo en lo que este
// sistema guarda», y `switch_recibos` arranca en 2023. No se afirma nada de
// antes de esa fecha.
//
// Medido contra producción el 5-sep-2026 (94 clientes con deuda):
//   · 37 clientes · $647.944,31 — con más de 90 días sin pagar O sin un pago
//   · de ésos, 7 NUNCA pagaron ($56.672,56), entre ellos ACTIVE SHOES, S.A.
//     con $43.806,10 y toda su deuda en 0-90 d (o sea: fila VERDE que igual
//     lleva el aviso — ése es justo el punto del cambio)
//   · los otros 30 suman $591.271,75, y 24 pasan los 180 días ($408.414,81)
// ─────────────────────────────────────────────────────────────────────────────

/** Más de esto sin pagar y el cliente sale en el aviso. Días. */
export const DIAS_SIN_PAGAR_UMBRAL = 90;

/**
 * Días transcurridos entre el último pago y `hoy` (los dos `YYYY-MM-DD`).
 * `null` = ese cliente no tiene ni un pago registrado («nunca ha pagado»).
 * Nunca devuelve negativos: un pago con fecha futura vale 0.
 */
export function diasSinPagar(ultimoPago: string | null | undefined, hoy: string): number | null {
  if (!ultimoPago) return null;
  const a = Date.parse(`${ultimoPago.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * ¿Este cliente lleva demasiado sin pagar?
 *
 * 🔴 `null` (nunca pagó) SÍ avisa. Callarlo sería lo contrario de lo que el
 * aviso existe para decir: el que nunca pagó es el caso más grave, no el
 * caso desconocido.
 */
export function avisaSinPagar(dias: number | null): boolean {
  return dias === null || dias > DIAS_SIN_PAGAR_UMBRAL;
}

/** Lo que se lee al lado del nombre del cliente, en gris chico. */
export function textoSinPagar(dias: number | null): string {
  return dias === null ? "nunca ha pagado" : `no paga hace ${dias} d`;
}

/** El rótulo de la celda 1 de la tira de totales. Singular y plural. */
export function rotuloSinPagar(cuantos: number): string {
  return `${cuantos} sin pagar hace +${DIAS_SIN_PAGAR_UMBRAL} d`;
}

/** Cuando no hay ninguno, la misma celda vuelve a decir cuántos clientes son. */
export function rotuloClientes(cuantos: number): string {
  return `${cuantos} ${cuantos === 1 ? "cliente" : "clientes"}`;
}

/** Lo mínimo que hace falta saber de un cliente para decidir si avisa. */
export interface ClienteConPago {
  /** Código Switch (D-XXX). Es la identidad; el nombre NO se usa para cruzar. */
  codigo: string | null;
  /** `YYYY-MM-DD` del último pago real, o `null` si nunca pagó. */
  ultimoPago: string | null;
}

/**
 * Los que avisan, de una lista. Devuelve el mismo objeto que entró (no lo copia
 * ni lo muta) para que quien llame conserve sus montos.
 */
export function filtrarSinPagar<T extends ClienteConPago>(clientes: T[], hoy: string): T[] {
  return clientes.filter((c) => avisaSinPagar(diasSinPagar(c.ultimoPago, hoy)));
}

/**
 * El ÚLTIMO PAGO DEL CLIENTE = el más reciente de sus pagos en CUALQUIERA de
 * las 6 empresas del grupo. Entra una lista de (código, fecha) por empresa y
 * sale un mapa código → fecha máxima.
 *
 * 🔴 Quien llame tiene que haber acotado ya a las 6 del grupo: acá no se sabe
 * de qué empresa viene cada fila, y una fila de Boston metida en esta lista
 * sería exactamente la mezcla que el módulo prohíbe.
 */
export function ultimoPagoPorCodigo(
  filas: { codigo: string | null | undefined; fecha: string | null | undefined }[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of filas) {
    const codigo = (f.codigo ?? "").trim();
    const fecha = (f.fecha ?? "").slice(0, 10);
    if (!codigo || !fecha) continue;
    const previo = mapa.get(codigo);
    if (!previo || fecha > previo) mapa.set(codigo, fecha);
  }
  return mapa;
}
