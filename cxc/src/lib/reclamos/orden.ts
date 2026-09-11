// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LA PÁGINA DE UNA EMPRESA: qué se ve y en qué orden (10-sep-2026).
//
// Daniel, textual: *«los pipeline tener default los no pagados»* → abre en
// «Por cobrar». Y sobre el orden: *«viejo es factura, no creado»* → la factura
// más vieja primero. Los que no tienen fecha de factura van AL FINAL y la
// pantalla dice «Falta la fecha de la factura».
//
// «En proceso» se retiró de la pantalla (0 usos en 3 meses): el valor se
// conserva en la base y acá cuenta como «por cobrar», que es lo que es.
// ─────────────────────────────────────────────────────────────────────────────

import { esPendiente } from "./pendientes";

export type FiltroEstado = "por-cobrar" | "cobrados";
export const FILTRO_DEFAULT: FiltroEstado = "por-cobrar";
export const FALTA_FECHA_FACTURA = "Falta la fecha de la factura";

export interface Ordenable {
  fecha_factura?: string | null;
  created_at?: string | null;
  estado?: string | null;
}

/** El filtro que viene de la URL, o el default si trae basura. */
export function filtroDesdeUrl(valor: string | null | undefined): FiltroEstado {
  return valor === "cobrados" ? "cobrados" : FILTRO_DEFAULT;
}

export function filtrarPorEstado<T extends Ordenable>(reclamos: readonly T[], filtro: FiltroEstado): T[] {
  return reclamos.filter((r) => (filtro === "cobrados" ? !esPendiente(r) : esPendiente(r)));
}

/**
 * Fecha de factura más VIEJA primero; sin fecha, al final.
 *
 * 🔄 11-sep-2026 — YA NO ES EL ORDEN DE LA PANTALLA. Daniel, textual: *«reclamo
 * debe ir sort el más nuevo arriba para verlo, pero con opción de sort en todas
 * las columnas: más plata, más días, menos días, menos plata»*. El default pasó
 * a ser la factura más RECIENTE arriba (`ORDEN_DEFAULT`) y todas las columnas
 * se ordenan tocando el encabezado (`ordenarReclamos`). Esta función se
 * conserva porque es la mitad vieja del mismo criterio y la usa `ordenarPorFecha`
 * por debajo: el «sin fecha al final» no cambió.
 */
export function ordenarPorFactura<T extends Ordenable>(reclamos: readonly T[]): T[] {
  return [...reclamos].sort((a, b) => {
    const fa = a.fecha_factura || "";
    const fb = b.fecha_factura || "";
    if (fa && fb) return fa.localeCompare(fb);
    if (fa) return -1;
    if (fb) return 1;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EL ORDEN LO ELIGE QUIEN MIRA (11-sep-2026).
//
// Daniel, textual: *«reclamo debe ir sort el más nuevo arriba para verlo, pero
// con opción de sort en todas las columnas: más plata, más días, menos días,
// menos plata»*.
//
// 🔴 ABRE CON LA FACTURA MÁS RECIENTE ARRIBA —que es la que se acaba de
// cargar— y cada encabezado ordena por su columna, con la flecha a la vista. El
// orden viaja en la URL (`?orden=total:desc`, `replace`): se comparte por link
// y no ensucia el Atrás.
//
// ⚠️ LO QUE NO TIENE FECHA DE FACTURA VA AL FINAL SIEMPRE, mire para donde
// mire la flecha: no se puede ordenar por un dato que no existe, y esconderlo
// entre los primeros sería peor. La pantalla ya lo dice en rojo.
// ─────────────────────────────────────────────────────────────────────────────

/** Las columnas que se pueden ordenar (son las que la tabla dibuja). */
export type ColumnaOrden = "numero" | "factura" | "dias" | "reclamado" | "total";

export type SentidoOrden = "asc" | "desc";

export interface Orden {
  columna: ColumnaOrden;
  sentido: SentidoOrden;
}

/** 🔴 La factura más RECIENTE arriba: menos días = más nueva. */
export const ORDEN_DEFAULT: Orden = { columna: "dias", sentido: "asc" };

/**
 * Al tocar un encabezado por PRIMERA vez, qué muestra: lo más grande primero
 * («más plata», «más días», el reclamo más nuevo). Tocarlo de nuevo lo invierte.
 */
const SENTIDO_AL_TOCAR: Record<ColumnaOrden, SentidoOrden> = {
  numero: "desc",
  factura: "desc",
  dias: "desc",
  reclamado: "desc",
  total: "desc",
};

const COLUMNAS: readonly ColumnaOrden[] = ["numero", "factura", "dias", "reclamado", "total"];

/** El orden que viene de la URL, o el default si trae basura. */
export function ordenDesdeUrl(valor: string | null | undefined): Orden {
  const [col, sen] = String(valor ?? "").split(":");
  if (!COLUMNAS.includes(col as ColumnaOrden)) return ORDEN_DEFAULT;
  return {
    columna: col as ColumnaOrden,
    sentido: sen === "asc" || sen === "desc" ? sen : SENTIDO_AL_TOCAR[col as ColumnaOrden],
  };
}

/** Cómo se escribe en la URL. El default NO se escribe: la dirección queda limpia. */
export function ordenAUrl(orden: Orden): string {
  if (orden.columna === ORDEN_DEFAULT.columna && orden.sentido === ORDEN_DEFAULT.sentido) return "";
  return `${orden.columna}:${orden.sentido}`;
}

/** Tocar el encabezado: la misma columna se invierte; otra arranca en su sentido. */
export function alTocarColumna(actual: Orden, columna: ColumnaOrden): Orden {
  if (actual.columna === columna) {
    return { columna, sentido: actual.sentido === "asc" ? "desc" : "asc" };
  }
  return { columna, sentido: SENTIDO_AL_TOCAR[columna] };
}

/** La flecha del encabezado: `↑`, `↓`, o nada si no es la columna ordenada. */
export function flechaDeColumna(orden: Orden, columna: ColumnaOrden): string {
  if (orden.columna !== columna) return "";
  return orden.sentido === "asc" ? "↑" : "↓";
}

export interface Reclamable extends Ordenable {
  nro_reclamo?: string | null;
  nro_factura?: string | null;
  reclamado_en?: string | null;
}

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Ordena la lista visible.
 *
 * `total` entra por parámetro porque se calcula con los impuestos de la empresa
 * (`reclamoTaxes`), que no es asunto de este módulo.
 */
export function ordenarReclamos<T extends Reclamable>(
  reclamos: readonly T[],
  orden: Orden,
  total: (r: T) => number,
): T[] {
  const signo = orden.sentido === "asc" ? 1 : -1;
  return [...reclamos].sort((a, b) => {
    if (orden.columna === "dias") {
      // La columna «Días» es la fecha de la factura vista al revés: más días =
      // más vieja. Sin fecha, al final en los dos sentidos.
      const fa = texto(a.fecha_factura);
      const fb = texto(b.fecha_factura);
      if (!fa && !fb) return texto(b.created_at).localeCompare(texto(a.created_at));
      if (!fa) return 1;
      if (!fb) return -1;
      // `asc` = menos días = fecha más NUEVA arriba.
      return signo * fb.localeCompare(fa);
    }
    if (orden.columna === "total") {
      const d = total(a) - total(b);
      if (d !== 0) return signo * d;
      return texto(b.created_at).localeCompare(texto(a.created_at));
    }
    if (orden.columna === "reclamado") {
      // Lo que nunca se reclamó va al FINAL: es lo que hay que mirar, y en la
      // pantalla ya sale en rojo. Entre los reclamados, por fecha.
      const ra = texto(a.reclamado_en);
      const rb = texto(b.reclamado_en);
      if (!ra && !rb) return texto(b.created_at).localeCompare(texto(a.created_at));
      if (!ra) return 1;
      if (!rb) return -1;
      return signo * ra.localeCompare(rb);
    }
    const campo = orden.columna === "numero" ? "nro_reclamo" : "nro_factura";
    const va = texto(a[campo as keyof T]);
    const vb = texto(b[campo as keyof T]);
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return signo * va.localeCompare(vb, "es", { numeric: true });
  });
}
