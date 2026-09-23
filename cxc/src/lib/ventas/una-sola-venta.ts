// ─────────────────────────────────────────────────────────────────────────────
// UNA SOLA VENTA — la misma venta da el MISMO número en las tres pestañas
// (23-sep-2026). Módulo PURO: sin React, sin fetch, sin reloj.
//
// 🩸 LO QUE PASABA. Fashion Wear 2026, la misma pantalla, tres números:
//   · Resumen              $2.411.430,20  (cuadra al centavo con Switch)
//   · Productos            $2.406.204,79  (−$5.225,41)
//   · Clientes › Utilidad  $2.389.954,14  (−$21.476,06)
// Y ninguna pestaña decía por qué. Medido el 23-sep-2026 contra producción
// (`scripts/_medir-ventas-una-sola-venta.mjs`, solo lectura, las 6 del grupo):
//   · Utilidad no contaba las «Transacciones» (contado): el reporte de utilidad
//     de Switch NO las lista. Empresa por empresa el hueco ES el contado, al
//     centavo (vistana 9.132,60 · FW 21.476,07 · FS 27.426,75 · AS 2.435,20 ·
//     AW 3.714,00 · joystep 1.456,23 = 65.640,85; ±0,01 de redondeo en FW y
//     joystep).
//   · Productos no contaba las Notas de Débito (el reporte por artículo no las
//     trae: 0 filas 'ND' en toda la tabla) y, además, le faltan RENGLONES que
//     ese reporte no devuelve aunque la factura los tenga (medido por día: FW
//     −460 el 9-feb, +136 el 19-mar, −30 el 27-abr; FS −720 el 31-mar, −264 el
//     8-sep — un código de artículo que está en `switch_factura_lineas` y no en
//     `switch_articulo_diario` ese día).
//
// 🔴 LA DECISIÓN DE DANIEL, textual: *«Debe de dar igual»*. La referencia es
// el Resumen (`switch_facturas` firmada por tipo). Las otras dos pestañas SUBEN
// hasta igualarlo, y lo que el reporte no trae SE DICE, nunca se inventa.
//
// 🔑 LA DEFINICIÓN ES UNA y vive en `tipos-comprobante.ts`: Factura · Tiquete ·
// Transacción · Nota de Débito SUMAN; Nota de Crédito RESTA. De ahí se GENERA
// el CASE de SQL (`sqlVentaFirmada`) y el candado compara el texto generado
// contra las migraciones que lo usan: no hay una segunda copia que se aparte.
//
// El interruptor `UNA_SOLA_VENTA` (hoy `true`): en `false` las tres pantallas y
// los tres Excel se portan como antes. Nada de lo que se guarda cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { TIPOS_VENTA_SUMAN, TIPO_VENTA_RESTA, signoVenta } from "./tipos-comprobante";
import type { CeldaBase, DeltaCelda, ViewMode } from "./celda";
import { cellPrevValue, deltaCelda } from "./celda";
import { UNA_SOLA_VENTA } from "./una-sola-venta-interruptor";

export { signoVenta };

/** El interruptor vive en su propio archivo (`una-sola-venta-interruptor.ts`)
 *  y de acá se re-exporta: un solo valor para todos los que lo leen. */
export { UNA_SOLA_VENTA };

/** Desde qué año hay historia en `switch_facturas` (oct-2022). Un año sin datos
 *  de una tabla no se rechaza: se contesta vacío y se dice desde cuándo. */
export const PRIMER_ANIO_VENTAS = 2022;

/** El piso de antes del 23-sep-2026, con el interruptor apagado. */
export const PRIMER_ANIO_VENTAS_ANTES = 2024;

/** ¿Este año se acepta en Productos y Utilidad? Con el interruptor en `false`
 *  vuelve el rechazo de 2022 y 2023. */
export function anioValido(year: number): boolean {
  const piso = UNA_SOLA_VENTA ? PRIMER_ANIO_VENTAS : PRIMER_ANIO_VENTAS_ANTES;
  return Number.isInteger(year) && year >= piso && year <= 2100;
}

// ── La definición, dicha en SQL ─────────────────────────────────────────────

/**
 * El CASE que firma un comprobante, GENERADO de la lista de tipos. Es el que
 * llevan `switch_ventas_unificado_vw` (el Resumen) y `utilidad_por_cliente_v3`
 * (Utilidad); el candado compara este texto contra el de las migraciones.
 */
export function sqlVentaFirmada(columna: string, tipoCol = "tipo_comprobante"): string {
  const suman = TIPOS_VENTA_SUMAN.map((t) => `'${t}'`).join(", ");
  return [
    "CASE",
    `WHEN ${tipoCol} IN (${suman}) THEN ${columna}`,
    `WHEN ${tipoCol} = '${TIPO_VENTA_RESTA}' THEN -${columna}`,
    "ELSE 0",
    "END",
  ].join("\n");
}

/** Para comparar SQL sin que el sangrado cuente. */
export function normalizarSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** Los tipos que el reporte de utilidad de Switch NO lista (medido: 0 filas
 *  «Transacción» en `switch_factura_utilidad`; «Tiquete» es su antecesor). Son
 *  los que el respaldo sin la RPC v3 suma desde `switch_facturas`. */
export const TIPOS_SIN_REPORTE_DE_UTILIDAD: readonly string[] = ["Transacción", "Tiquete"];

// ── Fechas ──────────────────────────────────────────────────────────────────

export const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** «2023-02-01» → «febrero 2023». Basura → «». */
export function mesAnioLargo(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return "";
  return `${MESES_LARGOS[mes - 1]} ${m[1]}`;
}

/** Ventana [desde, hasta] de Panamá → instantes UTC para filtrar un timestamp. */
export function ventanaUtcDePanama(desde: string, hasta: string): { ini: string; fin: string } {
  return { ini: `${desde}T05:00:00.000Z`, fin: `${diaSiguiente(hasta)}T05:00:00.000Z` };
}

export function diaSiguiente(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * ¿La tabla arranca DESPUÉS de la ventana pedida? Entonces no es que «no se
 * pudieron cargar»: es que no hay datos de ese período, y la pantalla lo dice.
 */
export function ventanaAntesDeLosDatos(datosDesde: string | null | undefined, hasta: string): boolean {
  if (!datosDesde) return false;
  return datosDesde.slice(0, 10) > hasta.slice(0, 10);
}

/** «Productos de Fashion Wear tiene datos desde febrero 2023». */
export function textoDatosDesde(pestana: string, datosDesde: string, empresa?: string | null): string {
  const de = empresa ? ` de ${empresa}` : "";
  return `${pestana}${de} tiene datos desde ${mesAnioLargo(datosDesde)}`;
}

// ── Productos: el total es el del Resumen, y lo que falta se dice ───────────

/** Una fila de `ventas_dashboard_summary_v2`, en lo mínimo que hace falta. */
export interface FilaResumenMensual {
  empresa: string;
  mes: number;
  total_subtotal: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

/**
 * La venta del Resumen para UNA empresa dentro de una ventana de meses
 * enteros: suma los meses de `anio` cuyo `AAAA-MM` cae entre `desde` y
 * `hasta`. La ventana de Productos SIEMPRE arranca el 1 de un mes y termina
 * hoy o el 31-dic, así que la suma mensual es exactamente lo que el Resumen
 * muestra para ese tramo.
 */
export function sumarResumenEnVentana(
  filas: readonly FilaResumenMensual[],
  empresa: string,
  anio: number,
  desde: string,
  hasta: string,
): number {
  let s = 0;
  for (const f of filas) {
    if (f.empresa !== empresa) continue;
    const ym = `${anio}-${String(f.mes).padStart(2, "0")}`;
    if (ym < desde.slice(0, 7) || ym > hasta.slice(0, 7)) continue;
    s += num(f.total_subtotal);
  }
  return s;
}

/** Los años que toca una ventana (uno, o dos si cruza el 31-dic). */
export function aniosDeVentana(desde: string, hasta: string): number[] {
  const a = Number(desde.slice(0, 4));
  const b = Number(hasta.slice(0, 4));
  const out: number[] = [];
  for (let y = a; y <= b; y++) out.push(y);
  return out;
}

export interface CuadreProductos {
  /** La venta del período según el Resumen (`switch_facturas` firmada). */
  ventaResumen: number;
  /** Lo que suman las descripciones del reporte por artículo. */
  listado: number;
  /** Notas de débito del período: el reporte por artículo no las trae. */
  notasDebito: { monto: number; n: number; costo: number };
  /** Renglones de factura que el reporte por artículo de Switch no devuelve
   *  (= venta del Resumen − listado − notas de débito). Puede ser negativo. */
  sinArticulo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function armarCuadreProductos(args: {
  ventaResumen: number;
  listado: number;
  notasDebito: { monto: number; n: number; costo: number };
}): CuadreProductos {
  const sinArticulo = r2(args.ventaResumen - args.listado - args.notasDebito.monto);
  return {
    ventaResumen: r2(args.ventaResumen),
    listado: r2(args.listado),
    notasDebito: { monto: r2(args.notasDebito.monto), n: args.notasDebito.n, costo: r2(args.notasDebito.costo) },
    sinArticulo,
  };
}

const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ROTULO_NOTAS_DEBITO = "Notas de débito · sin artículo";
export const ROTULO_SIN_ARTICULO = "Renglones que el reporte por artículo de Switch no trae";

/**
 * La línea debajo del total de Productos. `null` cuando el listado ya es el
 * total (nada que explicar).
 */
export function textoCuadreProductos(c: CuadreProductos | null | undefined): string | null {
  if (!c) return null;
  const partes: string[] = [];
  if (Math.abs(c.notasDebito.monto) >= 0.005) {
    const n = c.notasDebito.n;
    partes.push(`${money(c.notasDebito.monto)} de ${n} nota${n === 1 ? "" : "s"} de débito sin artículo`);
  }
  if (Math.abs(c.sinArticulo) >= 0.005) {
    partes.push(`${money(c.sinArticulo)} de renglones que el reporte por artículo de Switch no trae`);
  }
  if (partes.length === 0) return null;
  return `El total es el del Resumen e incluye ${partes.join(" y ")}`;
}

/** Las filas de cierre del Excel de Productos: lo que el listado no trae, para
 *  que el archivo sume su TOTAL. Vacío cuando no hay nada que agregar. */
export function filasDeCierreProductos(c: CuadreProductos | null | undefined): { rotulo: string; venta: number }[] {
  if (!c) return [];
  const out: { rotulo: string; venta: number }[] = [];
  if (Math.abs(c.notasDebito.monto) >= 0.005) out.push({ rotulo: ROTULO_NOTAS_DEBITO, venta: c.notasDebito.monto });
  if (Math.abs(c.sinArticulo) >= 0.005) out.push({ rotulo: ROTULO_SIN_ARTICULO, venta: c.sinArticulo });
  return out;
}

// ── Utilidad: el contado entra, y el cuadre contra el Resumen se dice ───────

export interface FilaUtilidadBase {
  clienteSwitchId: number | null;
  cliente: string;
  empresaKey: string;
  empresa: string;
  nDocs: number;
  ventas: number;
  costo: number;
  utilidad: number;
  margen: number | null;
}

/** Lo que la RPC nueva agrega a cada fila, y lo que el respaldo calcula. */
export interface FilaUtilidadUna extends FilaUtilidadBase {
  /** La parte de `ventas` que el reporte de utilidad SÍ cubre (con costo). */
  ventasConCosto: number;
  /** La parte sin costo por cliente: el contado. `ventas − ventasConCosto`. */
  ventasSinCosto: number;
  /** El código del cliente en Switch (para reconocer el mostrador). */
  codigo?: string | null;
  mostrador?: boolean;
}

export interface ContadoDeCliente {
  empresaKey: string;
  clienteSwitchId: number | null;
  cliente: string | null;
  monto: number;
}

/**
 * RESPALDO mientras la migración de la v3 no corra: a las filas de la v2 (solo
 * lo que el reporte de utilidad trae) se les suma el contado de
 * `switch_facturas`, cliente por cliente. Un cliente que solo compró de contado
 * nace acá, con costo y utilidad en 0 y margen `null`. Puro.
 */
export function agregarContado<T extends FilaUtilidadBase>(
  filas: readonly T[],
  contado: readonly ContadoDeCliente[],
  nombreEmpresa: (key: string) => string,
): (T & FilaUtilidadUna)[] {
  const clave = (e: string, id: number | null, nombre: string) =>
    `${e}|${id != null ? String(id) : `nombre:${nombre.trim().toUpperCase()}`}`;
  const out = new Map<string, T & FilaUtilidadUna>();
  for (const f of filas) {
    out.set(clave(f.empresaKey, f.clienteSwitchId, f.cliente), {
      ...f, ventasConCosto: f.ventas, ventasSinCosto: 0,
    });
  }
  for (const c of contado) {
    const k = clave(c.empresaKey, c.clienteSwitchId, c.cliente ?? "");
    const ya = out.get(k);
    if (ya) {
      out.set(k, { ...ya, ventas: ya.ventas + c.monto, ventasSinCosto: ya.ventasSinCosto + c.monto, nDocs: ya.nDocs + 1 });
      continue;
    }
    out.set(k, {
      clienteSwitchId: c.clienteSwitchId,
      cliente: c.cliente ?? "(Sin nombre)",
      empresaKey: c.empresaKey,
      empresa: nombreEmpresa(c.empresaKey),
      nDocs: 1,
      ventas: c.monto,
      costo: 0,
      utilidad: 0,
      margen: null,
      ventasConCosto: 0,
      ventasSinCosto: c.monto,
    } as T & FilaUtilidadUna);
  }
  return [...out.values()];
}

export interface CuadreUtilidad {
  /** La venta del Resumen para las mismas empresas y el mismo año. */
  ventaResumen: number;
  /** Lo que suma la pantalla. */
  ventaPantalla: number;
  /** `ventaPantalla − ventaResumen`. 0 = cuadra al centavo. */
  diferencia: number;
  /** El contado que entró, sin costo por cliente. */
  sinCosto: number;
}

export function armarCuadreUtilidad(args: { ventaResumen: number; ventaPantalla: number; sinCosto: number }): CuadreUtilidad {
  return {
    ventaResumen: r2(args.ventaResumen),
    ventaPantalla: r2(args.ventaPantalla),
    diferencia: r2(args.ventaPantalla - args.ventaResumen),
    sinCosto: r2(args.sinCosto),
  };
}

/** La línea del cuadre en Utilidad. */
export function textoCuadreUtilidad(c: CuadreUtilidad | null | undefined): string | null {
  if (!c) return null;
  const contado = Math.abs(c.sinCosto) >= 0.005
    ? `incluye ${money(c.sinCosto)} de ventas de contado, que Switch reporta sin costo`
    : null;
  const cuadre = Math.abs(c.diferencia) < 0.005
    ? "el mismo total que el Resumen"
    : `le ${c.diferencia < 0 ? "faltan" : "sobran"} ${money(Math.abs(c.diferencia))} contra el Resumen (redondeo por documento del reporte de utilidad)`;
  return [contado, cuadre].filter(Boolean).join(" · ");
}

// ── Excel de Clientes: el mostrador se marca y el TOTAL dice qué suma ───────

export const MARCA_MOSTRADOR_EXCEL = "mostrador · ventas de contado · fuera del ranking";

export function nombreMostradorExcel(nombre: string | null | undefined): string {
  return `${(nombre ?? "").trim() || "Mostrador"} · ${MARCA_MOSTRADOR_EXCEL}`;
}

/** «TOTAL · 91 clientes, sin el mostrador» / «TOTAL · 91 clientes». */
export function rotuloTotalClientes(nClientes: number, conMostrador: boolean): string {
  const base = `TOTAL · ${nClientes} cliente${nClientes === 1 ? "" : "s"}`;
  return conMostrador ? `${base}, sin el mostrador` : base;
}

// ── La matriz del Resumen: «n/a» se dice con palabras, en las SEIS llamadas ─

/**
 * La base del año anterior contra la que se decidió que NO hay comparación:
 * en margen es la VENTA previa (sin $100 de venta no hay ratio); en ventas y
 * utilidad, el valor previo del modo. Es lo que `textoSinComparativo` necesita
 * para decir «no vendiste» o «casi no vendiste» en vez de «n/a».
 */
export function basePrevia(c: Pick<CeldaBase, "ventasPrev" | "utilidadPrev">, mode: ViewMode): number {
  return mode === "margen" ? c.ventasPrev : cellPrevValue(c, mode);
}

/**
 * El Δ de una celda CON la base previa: es `deltaCelda` con el cuarto
 * argumento puesto. Las seis llamadas de la matriz (cuatro de escritorio, dos
 * de celular) pasan por acá; el panel de detalle ya lo hacía solo.
 * Con el interruptor en `false` la base no viaja y sale la sigla de antes.
 */
export function deltaCeldaDe(
  cell: Pick<CeldaBase, "ventasPrev" | "utilidadPrev">,
  mode: ViewMode,
  delta: number | null,
  na: boolean,
): DeltaCelda | null {
  return deltaCelda(delta, mode, na, UNA_SOLA_VENTA ? basePrevia(cell, mode) : undefined);
}
