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
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/ventas/format";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import {
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

export const COLUMNAS_VENTAS = ["Fecha", "Cliente", "Factura", "Tipo", "Subtotal"] as const;
export const COLUMNAS_COBROS = ["Fecha", "Cliente", "Monto"] as const;

/** Un renglón del papel; `negativo` es la nota de crédito, que se pinta en rojo. */
export interface FilaPapel {
  celdas: string[];
  negativo: boolean;
}

/** Las ventas comisionables, en el orden que llegan del RPC. */
export function filasVentas(data: ComisionDetalle): FilaPapel[] {
  return (data.ventas ?? []).map((v) => ({
    celdas: [
      fmtDate(v.fecha),
      v.cliente,
      // 🔴 LARGO, como en el Excel: el papel se concilia contra Switch.
      v.secuencial,
      tipoDocCorto(v.tipo),
      fmtMoney(v.subtotal),
    ],
    negativo: v.subtotal < 0,
  }));
}

/** Los cobros comisionables. */
export function filasCobros(data: ComisionDetalle): FilaPapel[] {
  return (data.cobros ?? []).map((c) => ({
    celdas: [fmtDate(c.fecha), c.cliente, fmtMoney(c.monto)],
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
 * La caja de cierre, igual que en la pantalla: de dónde sale cada comisión, los
 * descuentos activos uno por uno y el total.
 *
 * Sin descuentos la última línea dice «Comisión total»; con descuentos dice
 * «Subtotal comisión» arriba y «Total a pagar» abajo — la misma distinción que
 * hace la pantalla, para que no parezca que el descuento ya estaba adentro.
 */
export function lineasDelCierre(
  data: ComisionDetalle,
  descuentos: ComisionDescuento[],
): LineaCierre[] {
  const activos = descuentosActivos(descuentos);
  const pctV = (data.tasa_venta * 100).toFixed(2);
  const pctC = (data.tasa_cobro * 100).toFixed(2);
  const lineas: LineaCierre[] = [
    {
      rotulo: `Ventas ${fmtMoney(data.ventas_base)} × ${pctV}%`,
      monto: fmtMoney(data.comision_venta),
      fuerte: false,
    },
    {
      rotulo: `Cobros ${fmtMoney(data.cobros_base)} × ${pctC}%`,
      monto: fmtMoney(data.comision_cobro),
      fuerte: false,
    },
  ];
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

/** Los tres totales que van entre las tablas y el cierre. */
export function totalesDelPapel(data: ComisionDetalle): LineaCierre[] {
  return [
    { rotulo: "TOTAL VENTAS", monto: fmtMoney(data.ventas_base), fuerte: true },
    { rotulo: "TOTAL COBROS", monto: fmtMoney(data.cobros_base), fuerte: true },
    {
      rotulo: "TOTAL VENTAS + COBROS",
      monto: fmtMoney(round2(data.ventas_base + data.cobros_base)),
      fuerte: true,
    },
  ];
}
