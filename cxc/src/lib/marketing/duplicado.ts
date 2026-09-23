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
// 🔴 EL ARREGLO DEL 23-sep-2026 — Daniel: *«me debes dejar subir si las
// facturas suman igual pero cliente es diferente, como en el caso de Impreco a
// Nova Lux»*. El mismo proveedor puede hacer dos trabajos por el mismo monto
// el mismo día para DOS tiendas distintas, y eso es plata real que hay que
// poder cargar. Entonces la llave suma la TIENDA («General» cuenta como una
// tienda más), y además:
//
//   🔴 DOS NÚMEROS DE FACTURA DISTINTOS NUNCA SON LA MISMA FACTURA. Si las dos
//   traen número y no son el mismo, no se frena aunque todo lo demás coincida.
//   Si a alguna le falta el número, decide la llave.
//
// ⚠️ El número se compara SIN los ceros de relleno («11-00007766» y
// «11-000007766» son el mismo número, y «000008123» y «0000008123» también):
// ese cero de más era justo la forma en que la misma factura entraba dos
// veces, y ese caso se sigue frenando.
//
// Medido contra producción el 23-sep-2026, entre las 79 facturas VIVAS que no
// son pagos de impulsadora: con la llave vieja 5 grupos repetidos (10
// facturas); con la nueva queda 1 grupo (2 facturas, Confecciones Boston del
// 10-sep-2026, misma tienda y el mismo número con un cero de más). Los otros
// cuatro dejan de estar trabados: dos por TIENDA distinta (Krysthel, $963,00 y
// $214,00 del 27-jun-2025) y dos por NÚMERO distinto (Krysthel $1.070,00 del
// 18-dic-2025 e Impresora Comercial $55,64 del 8-abr-2026). ⚠️ No se limpian:
// Daniel, *«no elimines ni modifiques nada, deja que secretaria lo haga cuando
// rediseñemos»*.
//
// 🔴 LA FECHA DE UN PAGO DE IMPULSADORA ES SU PERÍODO, no el día en que se
// cargó: Ana Trejos tiene 7 pagos de $800 cargados el 4-ago-2026, uno por
// cada mes atrasado, y son 7 pagos distintos. Quien llame a `esDuplicado`
// para un pago de impulsadora pasa `fecha = periodo_desde`. (El freno de
// solapamiento de períodos que ya existe en `impulsadoras.ts` no se toca.)
// ⚠️ En un pago de impulsadora la «tienda» de la llave es LA IMPULSADORA: es
// lo que separa un pago de otro, igual que hoy.
// ============================================================================

import { TIENDA_GENERAL } from "./gasto";
import { mismoProveedor, normalizarProveedor } from "./proveedor";

/** Lo mínimo que hace falta mirar para saber si es el mismo gasto. */
export interface HuellaDeGasto {
  proveedor: string | null | undefined;
  monto: number | string | null | undefined;
  /** "YYYY-MM-DD" — la fecha del documento; en impulsadora, `periodo_desde`. */
  fecha: string | null | undefined;
  /** `tienda_codigo` del directorio; vacío = General. En impulsadora, su id. */
  tienda?: string | null | undefined;
  /** El número de la factura, tal como se guardó. */
  numero?: string | null | undefined;
}

/** Monto a dos decimales como texto, para que 55.64 y 55.640 sean lo mismo. */
export function montoClave(monto: HuellaDeGasto["monto"]): string {
  const n = Number(monto);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** La tienda dentro de la llave. Sin tienda, «General» — que es una más. */
export function tiendaClave(tienda: HuellaDeGasto["tienda"]): string {
  const t = String(tienda ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return t.length === 0 ? "GENERAL" : t;
}

/**
 * El número de factura para COMPARAR, nunca para mostrar: mayúsculas, sin
 * puntuación y SIN los ceros de relleno de cada tramo.
 *
 *   «11-00007766» y «11-000007766» → "11-7766"
 *   «0000063894»                   → "63894"
 */
export function numeroClave(numero: HuellaDeGasto["numero"]): string {
  return String(numero ?? "")
    .toUpperCase()
    .split(/[^0-9A-Z]+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/^0+(?=.)/, ""))
    .join("-");
}

/**
 * 🔴 Dos números distintos NO son la misma factura. Solo se afirma cuando las
 * DOS lo traen: si a una le falta, no contradice nada y decide la llave.
 */
export function numerosSeContradicen(
  a: HuellaDeGasto["numero"],
  b: HuellaDeGasto["numero"],
): boolean {
  const na = numeroClave(a);
  const nb = numeroClave(b);
  return na.length > 0 && nb.length > 0 && na !== nb;
}

/**
 * La llave del freno: proveedor normalizado | monto a dos decimales | fecha |
 * tienda. Vacía si falta proveedor, monto o fecha — sin los tres no se afirma
 * nada. La tienda nunca falta: sin ella, «General».
 */
export function claveDeDuplicado(g: HuellaDeGasto): string {
  const p = normalizarProveedor(g.proveedor);
  const m = montoClave(g.monto);
  const f = String(g.fecha ?? "").slice(0, 10);
  if (p.length === 0 || m.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return "";
  return `${p}|${m}|${f}|${tiendaClave(g.tienda)}`;
}

/**
 * Busca el gasto ya guardado que es EL MISMO que el nuevo. `null` si no hay.
 *
 * Igualdad de la llave completa: proveedor por `mismoProveedor` (igualdad del
 * normalizado, nunca `includes`), monto a dos decimales, fecha exacta y la
 * misma tienda. Dos números de factura distintos lo descartan antes que nada.
 * Un `existentes` con la misma fila que se está editando se filtra por `id`.
 */
export function buscarDuplicado<T extends HuellaDeGasto & { id?: string }>(
  nuevo: HuellaDeGasto & { id?: string },
  existentes: ReadonlyArray<T>,
): T | null {
  const clave = claveDeDuplicado(nuevo);
  if (clave.length === 0) return null;
  for (const e of existentes) {
    if (nuevo.id && e.id && String(nuevo.id) === String(e.id)) continue;
    if (numerosSeContradicen(nuevo.numero, e.numero)) continue;
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
export function mensajeDuplicado(existente: HuellaDeGasto): string {
  const proveedor = String(existente.proveedor ?? "").replace(/\s+/g, " ").trim();
  const monto = montoClave(existente.monto);
  const fecha = String(existente.fecha ?? "").slice(0, 10);
  const tienda = String(existente.tienda ?? "").replace(/\s+/g, " ").trim();
  const donde = tienda.length > 0 ? tienda : TIENDA_GENERAL;
  const numero = String(existente.numero ?? "").trim();
  const cual = numero.length > 0 ? ` (N° ${numero})` : "";
  return `Ya existe un gasto de ${proveedor} por $${monto} del ${fecha} para ${donde}${cual}. No se guarda dos veces.`;
}
