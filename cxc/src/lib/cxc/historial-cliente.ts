// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL DEL CLIENTE — todos sus pagos y todas sus facturas, por mes.
// Módulo PURO (19-nov-2026).
//
// Daniel, textual: «Quiero ver últimos pagos o historial de pago de clientes…
// y de compras también» → «como en cuentas por cobrar pero con más historial».
// «Últimos pagos» muestra 3 fechas; esto abre la lista ENTERA (desde oct-2022).
//
// 🔴 EL FILTRO DE PAGOS ES EL DE SIEMPRE: sin retenciones y sin recibos en cero
// (lo aplica la lectura; aquí solo se agrupa). Un renglón es un DÍA, como en
// «Últimos pagos»: lo que entró ese día y en qué empresas.
//
// 🔴 LAS NOTAS DE CRÉDITO RESTAN (`signoVenta`): el total del mes es neto. El
// monto es el `total` CON ITBMS, el mismo que «Documentos» de CxC y el estado
// de cuenta: un documento no puede valer dos cosas en dos pantallas.
//
// 🔴 BOSTON Y EL GRUPO NO SE MEZCLAN. Este módulo no lee la base: cada ruta
// (`/api/cxc/historial` para las 6 del grupo, `/api/cxc/boston/historial` para
// Boston) acota su empresa en la consulta, y aquí solo se arma la lista.
// ─────────────────────────────────────────────────────────────────────────────

import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { agruparPagosPorFecha, type PagoDeEmpresa, type PagoDelDia } from "./pagos-por-fecha";

/** Interruptor: `false` = la pantalla de antes, sin botones ni rutas. */
export const HISTORIAL_CLIENTE_2026_11 = false;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** `2026-11` → «Noviembre 2026». */
export function rotuloMes(mes: string): string {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${y}`;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export interface Mes<T> {
  /** `YYYY-MM`. */
  mes: string;
  total: number;
  filas: T[];
}

/** Agrupa filas YA ORDENADAS (más reciente primero) por mes, con su total. */
function porMes<T extends { fecha: string }>(filas: T[], monto: (f: T) => number): Mes<T>[] {
  const out: Mes<T>[] = [];
  for (const f of filas) {
    const mes = f.fecha.slice(0, 7);
    let actual = out[out.length - 1];
    if (!actual || actual.mes !== mes) { actual = { mes, total: 0, filas: [] }; out.push(actual); }
    actual.filas.push(f);
    actual.total = centavos(actual.total + monto(f));
  }
  return out;
}

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

// ── PAGOS ────────────────────────────────────────────────────────────────────

/**
 * Los mismos renglones de «Últimos pagos» —un DÍA, lo que entró y en qué
 * empresas— pero TODOS, no solo tres: se reusa `agruparPagosPorFecha` sin tope.
 * Más reciente primero, agrupado por mes.
 */
export function historialDePagos(pagos: PagoDeEmpresa[]): Mes<PagoDelDia>[] {
  return porMes(agruparPagosPorFecha(pagos, Number.POSITIVE_INFINITY), (f) => f.monto);
}

// ── FACTURAS ─────────────────────────────────────────────────────────────────

/** Lo que llega de `switch_facturas`, ya acotado a la empresa correcta. */
export interface FacturaLeida {
  empresa_key: string;
  switch_factura_id: number;
  secuencial: string | null;
  tipo_comprobante: string;
  fecha: string;
  total: number | string | null;
}

export interface FacturaHistorial {
  /** Llave para pedir sus renglones: empresa + tipo + id de Switch (única). */
  id: number;
  empresa: string;
  tipo: string;
  fecha: string;
  /** El número como lo muestra «Documentos» en CxC (`11-000003224`). */
  numero: string;
  /** Con signo: la nota de crédito va en negativo. */
  monto: number;
  esNotaCredito: boolean;
}

/** Facturas, notas de crédito y de débito, más reciente primero, por mes. */
export function historialDeFacturas(facturas: FacturaLeida[]): Mes<FacturaHistorial>[] {
  const filas: FacturaHistorial[] = [];
  for (const f of facturas) {
    const signo = signoVenta(f.tipo_comprobante);
    const fecha = String(f.fecha ?? "").slice(0, 10);
    if (signo === 0 || !fecha) continue;
    filas.push({
      id: f.switch_factura_id,
      empresa: f.empresa_key,
      tipo: f.tipo_comprobante,
      fecha,
      numero: f.secuencial || String(f.switch_factura_id),
      monto: centavos(signo * Math.abs(Number(f.total) || 0)),
      esNotaCredito: signo < 0,
    });
  }
  filas.sort((a, b) => desc(a.fecha, b.fecha) || b.id - a.id);
  return porMes(filas, (f) => f.monto);
}

/** «Nota de Crédito» → «Nota de crédito» (mayúscula solo en la primera palabra). */
export function nombreDelTipo(tipo: string): string {
  return tipo.charAt(0) + tipo.slice(1).toLowerCase();
}

/**
 * ¿Esta empresa tiene renglones de factura en el sistema? `switch_factura_lineas`
 * cubre solo las 6 del grupo: Boston y Multifashion no.
 */
export function tieneRenglones(empresa: string): boolean {
  return (B2B_EMPRESA_KEYS as readonly string[]).includes(empresa);
}

export interface RenglonFactura {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  /** Lo que vale el renglón con su descuento (`subtotal_con_descuento`). */
  subtotal: number;
}
