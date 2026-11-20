// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL DEL CLIENTE — todos sus pagos y todas sus compras, por mes.
// Módulo PURO (19-nov-2026).
//
// Daniel, textual: «Quiero ver últimos pagos o historial de pago de clientes…
// y de compras también» → «como en cuentas por cobrar pero con más historial».
// «Últimos pagos» muestra 3 fechas; esto abre la lista ENTERA (desde oct-2022).
//
// 🔴 EL FILTRO DE PAGOS ES EL DE SIEMPRE: sin retenciones —una retención no es
// un pago— y sin recibos en cero (lo aplica la lectura). Un renglón es un DÍA,
// como en «Últimos pagos».
//
// 🔴 CENTAVOS (Daniel, 19-nov-2026): un documento o un recibo de menos de $1 no
// se lista ni forma compra (`MINIMO_DEL_HISTORIAL`). Los montos se muestran sin
// centavos en la pantalla; aquí se guardan exactos.
//
// 🔴 NADA SE MEZCLA: compra = Factura, Tiquete o Transacción; devolución = nota
// de crédito, aparte; la nota de débito NO entra (es un cargo, no una compra).
//
// 🔴 UNA COMPRA = las facturas de UNA empresa dentro de 7 días desde la primera
// (Daniel, 19-nov-2026). La nota de crédito es una «Devolución» APARTE: no se
// resta de ninguna compra ni del total del mes, que suma solo compras. Los
// montos son el `total` CON ITBMS, como «Documentos» de CxC y el estado de cuenta.
//
// 🔴 Este módulo no lee la base: la ruta (`/api/cxc/historial`) valida la
// empresa (una de las 6 del grupo) y aquí solo se arma la lista.
// ─────────────────────────────────────────────────────────────────────────────

import { signoVenta, TIPO_VENTA_NOTA_DEBITO } from "@/lib/ventas/tipos-comprobante";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import { agruparPagosPorFecha, type PagoDeEmpresa, type PagoDelDia } from "./pagos-por-fecha";

/** Interruptor, PRENDIDO el 19-nov-2026 (Daniel: «Sí»). `false` = la pantalla de
 *  antes: «Últ. pago» y «Últ. compra» sin tocar y la ruta contesta 404. */
export const HISTORIAL_CLIENTE_2026_11 = true;

/** Ajuste PRENDIDO el 19-nov-2026 (Daniel: «Aprobado»): se toca la
 *  FILA entera de la empresa y abre una hoja con «Compras · Pagos»; los pagos van
 *  con el formato de las compras (mes como sección, un renglón por pago).
 *  `false` = lo publicado: «Últ. pago ›» y «Últ. compra ›» en azul. */
export const HISTORIAL_CLIENTE_FILA_2026_11 = true;

/** Propuesta del 19-nov-2026, APAGADA hasta el «sí» de Daniel: en la ficha del
 *  cliente (`/clientes/[codigo]`) cada fila de «Detalle por empresa» se toca y
 *  abre la MISMA hoja «Compras · Pagos» (`HojaDeLaEmpresa`), también con saldo 0
 *  —hoy un cliente sin saldo no tiene ningún camino al historial—. Solo las 6
 *  del grupo; la ruta sigue validando empresa y rol. `false` = filas quietas. */
export const HISTORIAL_EN_FICHA_2026_11 = false;

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

/** Menos de $1 (en valor absoluto) no es una compra, una devolución ni un pago. */
export const MINIMO_DEL_HISTORIAL = 1;
const cuenta = (n: number) => Math.abs(n) >= MINIMO_DEL_HISTORIAL;

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
  const validos = pagos.filter((p) => cuenta(Number(p.monto) || 0));
  return porMes(agruparPagosPorFecha(validos, Number.POSITIVE_INFINITY), (f) => f.monto);
}

// ── COMPRAS ──────────────────────────────────────────────────────────────────

/** Lo que llega de `switch_facturas`, ya acotado a la empresa correcta. */
export interface FacturaLeida {
  empresa_key: string;
  switch_factura_id: number;
  secuencial: string | null;
  tipo_comprobante: string;
  fecha: string;
  total: number | string | null;
}

/** Días de la ventana de una COMPRA, contados desde su PRIMERA factura:
 *  día 0 a día 7 es la misma compra; el día 8 abre otra. Daniel, 19-nov-2026. */
export const DIAS_DE_UNA_COMPRA = 7;

/** Varias facturas del mismo cliente, en la MISMA empresa, dentro de la ventana. */
export interface Compra {
  clase: "compra";
  empresa: string;
  /** La fecha de su PRIMERA factura (la que decide el mes). */
  fecha: string;
  /** La suma de sus facturas, con ITBMS. */
  monto: number;
  /** Los números cortos (`11-000003087` → `3087`), en orden de fecha. */
  facturas: string[];
}

/** Una nota de crédito: va APARTE, nunca se resta de una compra. */
export interface Devolucion {
  clase: "devolucion";
  empresa: string;
  fecha: string;
  /** Negativo. */
  monto: number;
  numero: string;
}

export type FilaDeCompras = Compra | Devolucion;

export interface MesDeCompras {
  /** `YYYY-MM`. */
  mes: string;
  /** Solo las compras: las devoluciones no lo tocan. */
  total: number;
  /** Suma de las devoluciones del mes (negativa), o 0 si no hubo. */
  devoluciones: number;
  filas: FilaDeCompras[];
}

const diaNumero = (fecha: string) => Math.round(Date.parse(`${fecha}T00:00:00Z`) / 86400000);
const numeroCorto = (f: FacturaLeida) => facturaParaMostrar(f.secuencial) || String(f.switch_factura_id);

/**
 * Las facturas del cliente como COMPRAS, más reciente primero y por mes.
 *
 * Una compra junta las facturas de UNA empresa que caen dentro de
 * `DIAS_DE_UNA_COMPRA` días desde la primera de la compra (ventana FIJA, no
 * corrida). Nunca junta empresas. La nota de crédito es una «Devolución»
 * aparte; la nota de débito no entra; lo de menos de $1 tampoco.
 */
export function historialDeCompras(documentos: FacturaLeida[]): MesDeCompras[] {
  const filas: FilaDeCompras[] = [];
  const porEmpresa = new Map<string, FacturaLeida[]>();
  for (const d of documentos) {
    const signo = signoVenta(d.tipo_comprobante);
    const fecha = String(d.fecha ?? "").slice(0, 10);
    if (signo === 0 || !fecha || d.tipo_comprobante === TIPO_VENTA_NOTA_DEBITO) continue;
    if (!cuenta(Number(d.total) || 0)) continue;
    if (signo < 0) {
      filas.push({ clase: "devolucion", empresa: d.empresa_key, fecha, numero: numeroCorto(d), monto: -centavos(Math.abs(Number(d.total) || 0)) });
      continue;
    }
    const lista = porEmpresa.get(d.empresa_key) ?? [];
    lista.push({ ...d, fecha });
    porEmpresa.set(d.empresa_key, lista);
  }
  for (const [empresa, lista] of porEmpresa) {
    const ordenadas = [...lista].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.switch_factura_id - b.switch_factura_id));
    let actual: Compra | null = null;
    let inicio = 0;
    for (const f of ordenadas) {
      const dia = diaNumero(f.fecha);
      if (!actual || dia - inicio > DIAS_DE_UNA_COMPRA) {
        actual = { clase: "compra", empresa, fecha: f.fecha, monto: 0, facturas: [] };
        inicio = dia;
        filas.push(actual);
      }
      actual.monto = centavos(actual.monto + Math.abs(Number(f.total) || 0));
      actual.facturas.push(numeroCorto(f));
    }
  }
  filas.sort((a, b) => desc(a.fecha, b.fecha) || (a.clase === b.clase ? (a.empresa < b.empresa ? -1 : 1) : a.clase === "compra" ? -1 : 1));

  const meses: MesDeCompras[] = [];
  for (const f of filas) {
    const mes = f.fecha.slice(0, 7);
    let m = meses[meses.length - 1];
    if (!m || m.mes !== mes) { m = { mes, total: 0, devoluciones: 0, filas: [] }; meses.push(m); }
    m.filas.push(f);
    if (f.clase === "compra") m.total = centavos(m.total + f.monto);
    else m.devoluciones = centavos(m.devoluciones + f.monto);
  }
  return meses;
}
