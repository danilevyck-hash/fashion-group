// ─────────────────────────────────────────────────────────────────────────────
// QUÉ DICE EL REPORTE DE COMISIÓN DE UN VENDEDOR  (módulo PURO, sin dibujar)
//
// Acá viven las DECISIONES del papel: qué columnas lleva cada sección, en qué
// orden, qué totales se muestran y cómo se arma la caja de cierre. Quien DIBUJA
// es `pdf-comision.ts`; separarlos es lo que permite probar el contenido sin
// abrir un PDF.
//
// 🔴 EL NÚMERO DE FACTURA VA LARGO (`11-000003022`), igual que en el Excel.
// En pantalla se muestran los últimos 4 dígitos; en el papel no: este es el
// documento que se concilia contra Switch, y Daniel lo dejó así expresamente
// («no»).
//
// 🔴 LA COLUMNA «TIPO» (FA/NC) SE QUEDA EN EL PAPEL. De la pantalla se retiró
// —la nota de crédito ya va en rojo y en negativo— pero acá se conserva por lo
// mismo que el número largo: se concilia contra Switch.
//
// ⚠️ NINGÚN TOTAL SE RECALCULA. `comision_venta`, `comision_cobro` y
// `comision_total` salen del RPC tal cual; sumar las líneas redondeadas puede
// diferir uno o dos centavos del número que se paga (ver `comisionLinea`).
// Lo único que se calcula acá es la resta de los descuentos ACTIVOS, que es la
// misma cuenta que hace la pantalla.
//
// 🔴 22-SEP-2026 — LOS RENGLONES SON SOLO LO PAGABLE, COMO EN EL EXCEL. Las
// facturas con utilidad ≤ 20 % (aporte $0.00) y los recibos en cero ya no se
// listan: qué va al papel lo decide `renglonesDelPapel` (`papel-pagable.ts`),
// la MISMA función que lee el Excel. Daniel: *«3. b) no salen»*, *«recibo
// $0.00: a) se quita del papel»*. Ningún total cambia: son renglones en $0.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/ventas/format";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import { renglonesDelPapel } from "@/lib/comisiones/papel-pagable";
import {
  comisionLinea,
  tipoDocCorto,
  type ComisionDetalle,
  type ComisionDescuento,
} from "@/lib/ventas/comisionExcel";

/** Un reporte: la comisión de UNA persona en UNA empresa, con sus descuentos. */
export interface HojaReporte {
  data: ComisionDetalle;
  /** TODOS los descuentos del mes; los inactivos no se imprimen. */
  descuentos: ComisionDescuento[];
  /** Nombre CORTO de la empresa (diccionario § 0): «Vistana», no la razón social. */
  empresaNombre: string;
  vendedor: string;
  year: number;
  mes: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Los descuentos que de verdad se restan este mes. */
export function descuentosActivos(descuentos: ComisionDescuento[]): ComisionDescuento[] {
  return (descuentos ?? []).filter((d) => d.activo);
}

/**
 * Lo que se paga: la comisión del RPC menos los descuentos ACTIVOS. Es la misma
 * cuenta de la pantalla — un segundo cálculo es cómo se llega a que el papel y
 * la pantalla digan números distintos.
 */
export function totalAPagarComision(
  data: ComisionDetalle,
  descuentos: ComisionDescuento[],
): number {
  return round2(
    data.comision_total - descuentosActivos(descuentos).reduce((s, d) => s + d.monto, 0),
  );
}

/**
 * La línea de arriba del papel: de quién, de qué empresa y de qué período.
 * El nombre va capitalizado (Daniel, 3-sep-2026: *«si capitiliza reynaldo»*).
 */
export function encabezadoReporte(h: HojaReporte): string {
  return `Comisión — ${nombreVendedorEnPantalla(h.vendedor)} · ${h.empresaNombre} · ${etiquetaPeriodo(h.year, h.mes)}`;
}

// 🔴 6-oct-2026: «Comisión» por línea, como el detalle v3 de pantalla (subtotal y
// comisión a la derecha). Sin renglón «Total»: la base va en la línea del pie y
// la comisión total es el número grande de arriba — repetirlo sería ruido.
export const COLUMNAS_VENTAS = ["Fecha", "Cliente", "Factura", "Tipo", "Subtotal", "Comisión"] as const;
export const COLUMNAS_COBROS = ["Fecha", "Cliente", "Monto", "Comisión"] as const;

/** Un renglón del papel; `negativo` es la nota de crédito, que se pinta en rojo. */
export interface FilaPapel {
  celdas: string[];
  negativo: boolean;
}

/** Las ventas comisionables, en el orden que llegan del RPC (solo lo pagable). */
export function filasVentas(data: ComisionDetalle): FilaPapel[] {
  return renglonesDelPapel(data).ventas.map((v) => ({
    celdas: [
      fmtDate(v.fecha),
      v.cliente,
      // 🔴 LARGO, como en el Excel: el papel se concilia contra Switch.
      v.secuencial,
      tipoDocCorto(v.tipo),
      fmtMoney(v.subtotal),
      fmtMoney(comisionLinea(v.subtotal, data.tasa_venta)),
    ],
    negativo: v.subtotal < 0,
  }));
}

/** Los cobros comisionables (solo lo pagable: un recibo en cero no se lista). */
export function filasCobros(data: ComisionDetalle): FilaPapel[] {
  return renglonesDelPapel(data).cobros.map((c) => ({
    celdas: [fmtDate(c.fecha), c.cliente, fmtMoney(c.monto), fmtMoney(comisionLinea(c.monto, data.tasa_cobro))],
    negativo: c.monto < 0,
  }));
}

/** Una línea de la caja de cierre. `fuerte` = la que se lee de lejos. */
export interface LineaCierre {
  rotulo: string;
  monto: string;
  fuerte: boolean;
}

/**
 * El RESUMEN del papel, el MISMO del Excel: de dónde sale cada comisión —base
 * × tasa = comisión—, los descuentos activos uno por uno y el total.
 *
 * Sin descuentos la última línea dice «Comisión total»; con descuentos dice
 * «Subtotal comisión» arriba y «Total a pagar» abajo — la misma distinción que
 * hace la pantalla, para que no parezca que el descuento ya estaba adentro.
 *
 * 🔴 SOLO SALEN LAS LÍNEAS QUE APLICAN (6-oct-2026). Con la tasa de cobros en
 * 0 % su línea no sale, igual que la sección: era el «Cobros $8,134 × 0.00% =
 * $0» del PDF de Rodrigo. ⚠️ El total sigue cuadrando al centavo porque una
 * sección que no aplica aporta $0 (tasa 0 %), y quien no tiene ninguna no sale
 * en el papel (`entraAlPapel`).
 */
export function lineasDelCierre(
  data: ComisionDetalle,
  descuentos: ComisionDescuento[],
  s: SeccionesDelPapel,
): LineaCierre[] {
  const activos = descuentosActivos(descuentos);
  const pctV = (data.tasa_venta * 100).toFixed(2);
  const pctC = (data.tasa_cobro * 100).toFixed(2);
  const lineas: LineaCierre[] = [];
  if (s.ventas) {
    lineas.push({
      rotulo: `Ventas ${fmtMoney(data.ventas_base)} × ${pctV}%`,
      monto: fmtMoney(data.comision_venta),
      fuerte: false,
    });
  }
  if (s.cobros) {
    lineas.push({
      rotulo: `Cobros ${fmtMoney(data.cobros_base)} × ${pctC}%`,
      monto: fmtMoney(data.comision_cobro),
      fuerte: false,
    });
  }
  if (activos.length === 0) {
    lineas.push({
      rotulo: "Comisión total",
      monto: fmtMoney(data.comision_total),
      fuerte: true,
    });
    return lineas;
  }
  lineas.push({
    rotulo: "Subtotal comisión",
    monto: fmtMoney(data.comision_total),
    fuerte: false,
  });
  for (const d of activos) {
    lineas.push({ rotulo: d.concepto, monto: `−${fmtMoney(d.monto)}`, fuerte: false });
  }
  lineas.push({
    rotulo: "Total a pagar",
    monto: fmtMoney(totalAPagarComision(data, descuentos)),
    fuerte: true,
  });
  return lineas;
}

// 🩸 `totalesDelPapel` («TOTAL VENTAS», «TOTAL COBROS», «TOTAL VENTAS + COBROS»)
// se retiró el 6-oct-2026: el rediseño del papel se lo llevó de los dos papeles
// y el candado `comisiones-papel-sin-seccion` prohíbe que vuelva. El resumen del
// pie es `lineasDelCierre`, el mismo del Excel.

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE NO SE PAGA NO SALE EN EL PAPEL (6-oct-2026).
// Daniel vio el PDF de Rodrigo (Vistana, sep): «Cobros $8,134 × 0.00% = $0», con
// la sección COBROS entera y «TOTAL VENTAS + COBROS $16,268». Regla: si la tasa
// de ventas (o de cobros) es 0 % o la persona está en «No pagable», esa sección
// no sale en el PDF, ni en el Excel, ni en el detalle de pantalla, ni su línea
// del resumen; con las dos fuera, la persona no sale en el papel. Ningún
// número cambia: solo se deja de dibujar lo que vale cero por regla.
// ─────────────────────────────────────────────────────────────────────────────

export { seccionesDelPapel, entraAlPapel, type SeccionesDelPapel } from "@/lib/comisiones/papel-pagable";
import type { SeccionesDelPapel } from "@/lib/comisiones/papel-pagable";

/** «Comisión de ventas $80.49 · de cobros $0.00», solo con lo que aplica. */
export function lineaDeComisionesDelPapel(
  d: { comision_venta: number; comision_cobro: number },
  s: SeccionesDelPapel,
): string {
  if (s.ventas && s.cobros) return `Comisión de ventas ${fmtMoney(d.comision_venta)} · de cobros ${fmtMoney(d.comision_cobro)}`;
  if (s.ventas) return `Comisión de ventas ${fmtMoney(d.comision_venta)}`;
  if (s.cobros) return `Comisión de cobros ${fmtMoney(d.comision_cobro)}`;
  return "";
}

const sinCentavos = (n: number) => {
  const v = Math.round(Math.abs(n)).toLocaleString("en-US");
  return n < 0 ? `−$${v}` : `$${v}`;
};

/** «0.50% de $16,099 en ventas · 0.50% de $0 en cobros», solo con lo que aplica. */
export function lineaDelPieDelPapel(
  d: { tasa_venta: number; tasa_cobro: number; ventas_base: number; cobros_base: number },
  s: SeccionesDelPapel,
): string {
  const partes: string[] = [];
  if (s.ventas) partes.push(`${(d.tasa_venta * 100).toFixed(2)}% de ${sinCentavos(d.ventas_base)} en ventas`);
  if (s.cobros) partes.push(`${(d.tasa_cobro * 100).toFixed(2)}% de ${sinCentavos(d.cobros_base)} en cobros`);
  return partes.join(" · ");
}
