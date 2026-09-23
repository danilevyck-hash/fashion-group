// ============================================================================
// Marketing — EL FRENO DE DUPLICADOS. Módulo PURO.
//
// Daniel (22-sep-2026): mismo proveedor normalizado + mismo monto + misma
// fecha → NO deja guardar. Hoy el freno mira solo el NÚMERO exacto de factura
// y solo AVISA; así entraron «0000063894» y «0000063895» de Impresora
// Comercial por $55,64 el mismo día, y «11-00007766» / «11-000007766» de
// Confecciones Boston por $6.163,20 — un cero de más y la misma factura entra
// dos veces.
//
// Medido contra producción el 22-sep-2026, entre las 94 facturas VIVAS, con
// esta misma clave: 6 grupos de facturas repetidas (12 facturas) sin contar
// los pagos de impulsadora. ⚠️ No se limpian: Daniel, *«no elimines ni
// modifiques nada, deja que secretaria lo haga cuando rediseñemos»*.
//
// 🔴 LA FECHA DE UN PAGO DE IMPULSADORA ES SU PERÍODO, no el día en que se
// cargó: Ana Trejos tiene 7 pagos de $800 cargados el 4-ago-2026, uno por
// cada mes atrasado, y son 7 pagos distintos. Quien llame a `esDuplicado`
// para un pago de impulsadora pasa `fecha = periodo_desde`. (El freno de
// solapamiento de períodos que ya existe en `impulsadoras.ts` no se toca.)
// ============================================================================

import { mismoProveedor, normalizarProveedor } from "./proveedor";

/** Lo mínimo que hace falta mirar para saber si es el mismo gasto. */
export interface HuellaDeGasto {
  proveedor: string | null | undefined;
  monto: number | string | null | undefined;
  /** "YYYY-MM-DD" — la fecha del documento; en impulsadora, `periodo_desde`. */
  fecha: string | null | undefined;
}

/** Monto a dos decimales como texto, para que 55.64 y 55.640 sean lo mismo. */
export function montoClave(monto: HuellaDeGasto["monto"]): string {
  const n = Number(monto);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * La clave del freno: proveedor normalizado | monto a dos decimales | fecha.
 * Vacía si falta cualquiera de los tres — sin los tres no se afirma nada.
 */
export function claveDeDuplicado(g: HuellaDeGasto): string {
  const p = normalizarProveedor(g.proveedor);
  const m = montoClave(g.monto);
  const f = String(g.fecha ?? "").slice(0, 10);
  if (p.length === 0 || m.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return "";
  return `${p}|${m}|${f}`;
}

/**
 * Busca el gasto ya guardado que es EL MISMO que el nuevo. `null` si no hay.
 *
 * Igualdad de la clave completa: proveedor por `mismoProveedor` (igualdad del
 * normalizado, nunca `includes`), monto a dos decimales y fecha exacta. Un
 * `existentes` con la misma fila que se está editando se filtra por `id`.
 */
export function buscarDuplicado<T extends HuellaDeGasto & { id?: string }>(
  nuevo: HuellaDeGasto & { id?: string },
  existentes: ReadonlyArray<T>,
): T | null {
  const clave = claveDeDuplicado(nuevo);
  if (clave.length === 0) return null;
  for (const e of existentes) {
    if (nuevo.id && e.id && String(nuevo.id) === String(e.id)) continue;
    if (!mismoProveedor(nuevo.proveedor, e.proveedor)) continue;
    if (claveDeDuplicado(e) === clave) return e;
  }
  return null;
}

/** 🔴 ¿Es un duplicado? Si lo es, NO se guarda. */
export function esDuplicado(
  nuevo: HuellaDeGasto & { id?: string },
  existentes: ReadonlyArray<HuellaDeGasto & { id?: string }>,
): boolean {
  return buscarDuplicado(nuevo, existentes) !== null;
}

/** Lo que se le dice a la persona. Dice cuál es, para que lo encuentre. */
export function mensajeDuplicado(existente: HuellaDeGasto & { numero?: string | null }): string {
  const proveedor = String(existente.proveedor ?? "").replace(/\s+/g, " ").trim();
  const monto = montoClave(existente.monto);
  const fecha = String(existente.fecha ?? "").slice(0, 10);
  const numero = String(existente.numero ?? "").trim();
  const cual = numero.length > 0 ? ` (N° ${numero})` : "";
  return `Ya existe un gasto de ${proveedor} por $${monto} del ${fecha}${cual}. No se guarda dos veces.`;
}
