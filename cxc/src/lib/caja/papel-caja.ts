/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — EL PAPEL QUE SE FIRMA: DE OCHO COLUMNAS A CINCO (20-sep-2026).
 *
 * 🩸 Medido contra producción, sobre los 77 recibos vivos:
 *   · la columna de la NOTA (antes «Descripción») quedó opcional el 20-sep y
 *     hoy no imprimiría ni una: decía «Comida» en 38 de 77, con la categoría al
 *     lado diciendo «Alimentación»;
 *   · el ITBMS lo tienen **9 de 77**, y en el período Nº3 las **26 filas van en
 *     $0.00**, con el Sub-total idéntico al Total — tres columnas para repetir
 *     el mismo número;
 *   · el encabezado decía «Apertura: 2 sept 2026» y la primera fila de la tabla
 *     es del **23 de junio**: 36 de 77 recibos caen fuera de la ventana de su
 *     período, porque el papel llega tarde y se teclea cuando aparece.
 *
 * 🔴 UNA COLUMNA VACÍA NO SE DIBUJA, y el encabezado dice el rango REAL de los
 * recibos, no la fecha de apertura. Si mañana vuelven a tener ITBMS o notas,
 * las columnas vuelven solas: la regla mira los DATOS, no una configuración.
 *
 * Módulo PURO: sin I/O, sin React.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { centavos } from "./dinero";

export type ColumnaPapel =
  | "fecha" | "nota" | "proveedor" | "categoria" | "factura"
  | "subtotal" | "itbms" | "total";

/** Cómo se lee cada columna en el papel. Un solo lugar. */
export const ROTULO_COLUMNA: Record<ColumnaPapel, string> = {
  fecha: "Fecha",
  nota: "Nota",
  proveedor: "Proveedor",
  categoria: "Categoría",
  factura: "N° Factura",
  subtotal: "Sub-total",
  itbms: "ITBMS",
  total: "Total",
};

/** Las columnas de plata van a la derecha; las demás, a la izquierda. */
export const COLUMNAS_DE_PLATA: ColumnaPapel[] = ["subtotal", "itbms", "total"];

export interface GastoDelPapel {
  descripcion?: string | null;
  nombre?: string | null;
  itbms?: number | string | null;
  fecha?: string | null;
}

/** ¿Alguna fila trae nota? (la de antes, `descripcion`, o el `nombre` legacy) */
export function hayNotas(gastos: GastoDelPapel[]): boolean {
  return gastos.some((g) => String(g.descripcion ?? g.nombre ?? "").trim() !== "");
}

/** ¿Alguna fila trae ITBMS? Con todas en cero, Sub-total sería el Total otra vez. */
export function hayItbms(gastos: GastoDelPapel[]): boolean {
  return gastos.some((g) => centavos(g.itbms) !== 0);
}

/** Las columnas que este papel tiene que dibujar, en su orden. */
export function columnasDelPapel(gastos: GastoDelPapel[]): ColumnaPapel[] {
  const columnas: ColumnaPapel[] = ["fecha"];
  if (hayNotas(gastos)) columnas.push("nota");
  columnas.push("proveedor", "categoria", "factura");
  if (hayItbms(gastos)) columnas.push("subtotal", "itbms");
  columnas.push("total");
  return columnas;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La primera y la última fecha de los recibos. `null` si no hay ninguna. */
export function rangoDeRecibos(gastos: GastoDelPapel[]): { desde: string; hasta: string } | null {
  const fechas = gastos
    .map((g) => String(g.fecha ?? ""))
    .filter((f) => ES_FECHA.test(f))
    .sort();
  if (fechas.length === 0) return null;
  return { desde: fechas[0], hasta: fechas[fechas.length - 1] };
}

/** «23 jun 2026». Misma forma que `fmtDate`, sin depender de él. */
function diaLargo(fecha: string): string {
  try {
    return new Date(`${fecha}T12:00:00`)
      .toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" })
      .replace(".", "");
  } catch { return fecha; }
}

/** «23 jun» — sin el año, cuando el rango entero cae en el mismo. */
function diaCorto(fecha: string): string {
  try {
    return new Date(`${fecha}T12:00:00`)
      .toLocaleDateString("es-PA", { day: "numeric", month: "short" })
      .replace(".", "");
  } catch { return fecha; }
}

/**
 * La línea de arriba del papel.
 *
 * 🔴 Dice el rango REAL de los recibos, nunca la apertura del período: 36 de
 * los 77 recibos caen fuera de la ventana de su ciclo, y el papel arrancaba
 * diciendo «Apertura: 2 sept 2026» con una primera fila del 23 de junio.
 */
export function encabezadoDelPapel(
  periodo: { numero?: number | null; estado?: string | null; fecha_cierre?: string | null },
  gastos: GastoDelPapel[],
): string {
  const rango = rangoDeRecibos(gastos);
  const cerrado = String(periodo.estado ?? "") === "cerrado" || !!periodo.fecha_cierre;
  const estado = cerrado
    ? `cerrado${periodo.fecha_cierre ? ` el ${diaLargo(String(periodo.fecha_cierre))}` : ""}`
    : "abierto";
  const cual = `Período Nº ${periodo.numero ?? "—"}, ${estado}`;

  if (!rango) return `Sin recibos · ${cual}`;
  if (rango.desde === rango.hasta) return `Recibos del ${diaLargo(rango.hasta)} · ${cual}`;

  const mismoAnio = rango.desde.slice(0, 4) === rango.hasta.slice(0, 4);
  const desde = mismoAnio ? diaCorto(rango.desde) : diaLargo(rango.desde);
  return `Recibos del ${desde} al ${diaLargo(rango.hasta)} · ${cual}`;
}
