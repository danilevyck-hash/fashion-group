// ─────────────────────────────────────────────────────────────────────────────
// EL DETALLE DEL VENDEDOR, v3 (6-oct-2026, PROPUESTA, apagada). Módulo PURO.
//
// Daniel, sobre el detalle de la v2: no lo convence. Lo que pidió:
//   · Arriba «Edwin · Vistana · Octubre 2026», el total grande y en gris
//     «Comisión de ventas $80.49 · de cobros $0.00». 🩸 Hoy dice «Ventas
//     $80.49», que es la COMISIÓN de ventas y se lee como lo vendido.
//   · Cada factura en dos renglones (cliente / «fecha · factura N°»), con el
//     subtotal y la comisión a la derecha. En el celular nada se desliza de lado
//     ni las columnas van al revés. La nota de crédito lleva su chip.
//   · Cobros igual; sin cobros, UNA línea gris.
//   · Al pie, UNA línea: «0.50% de $16,098 en ventas · 0.50% de $0 en cobros».
//   · Se van «Total ventas + cobros», el Resumen repetido, «Switch no envía el
//     número de recibo» y el rótulo «COMISIÓN TOTAL».
//   · Enviar (principal) y Descargar ▾. En la computadora se abre debajo de la
//     fila y no queda tapado por el encabezado.
//
// 🔴 NINGÚN CÁLCULO CAMBIA: los números son los mismos campos de la RPC
// (`comision_venta`, `comision_cobro`, `ventas_base`, `cobros_base`) y la
// comisión de cada línea sale de `comisionLinea`, como hoy. Aquí solo se
// escribe el texto. Interruptor `COMISIONES_DETALLE_V3_2026_10`; candado
// `__tests__/comisiones/comisiones-detalle-v3.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney } from "@/lib/ventas/format";

/** `false` = el detalle de la v2. Se prende con el «sí» de Daniel. */
export const COMISIONES_DETALLE_V3_2026_10 = false;

/** «Edwin · Vistana · Octubre 2026». */
export function tituloDelDetalle(vendedor: string, empresa: string, periodo: string): string {
  return [vendedor, empresa, periodo].join(" · ");
}

/** «Comisión de ventas $80.49 · de cobros $0.00». */
export function lineaDeComisiones(venta: number, cobro: number): string {
  return `Comisión de ventas ${fmtMoney(venta)} · de cobros ${fmtMoney(cobro)}`;
}

/** «$16,098»: la base, sin centavos (es contexto, no plata que se paga). */
export function baseSinCentavos(n: number): string {
  const v = Math.round(Math.abs(n)).toLocaleString("en-US");
  return n < 0 ? `−$${v}` : `$${v}`;
}

/** «0.50%» a partir de 0.005. */
export function tasaEnPorcentaje(t: number): string {
  return `${(t * 100).toFixed(2)}%`;
}

/** «0.50% de $16,098 en ventas · 0.50% de $0 en cobros». */
export function lineaDelPie(d: { tasa_venta: number; tasa_cobro: number; ventas_base: number; cobros_base: number }): string {
  return `${tasaEnPorcentaje(d.tasa_venta)} de ${baseSinCentavos(d.ventas_base)} en ventas · ${tasaEnPorcentaje(d.tasa_cobro)} de ${baseSinCentavos(d.cobros_base)} en cobros`;
}

/** «Factura N° 16-000123» (el número ya viene corto de `facturaParaMostrar`). */
export function rotuloFactura(numero: string, esNotaDeCredito: boolean): string {
  if (!numero) return "";
  return `${esNotaDeCredito ? "N°" : "Factura N°"} ${numero}`;
}

/** El chip de la nota de crédito. */
export const CHIP_NOTA_DE_CREDITO = "Nota de crédito";

/** Cobros vacíos: una línea gris. */
export const SIN_COBROS = "Sin cobros en el período";
export const SIN_VENTAS = "Sin ventas en el período";
