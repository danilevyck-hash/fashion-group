/**
 * «Últimos pagos» — el TEXTO del bloque, compartido por las tres superficies
 * que lo dibujan (CXC escritorio, CXC celular y la cartera de Boston).
 *
 * ⚠️ Aquí NO hay consultas. Cada cartera trae sus pagos por su propia ruta
 * (`/api/cxc/ultimos-pagos` el grupo, `/api/cxc/boston/ultimos-pagos` Boston)
 * y no comparten ni una función de lectura: lo único común es cómo se escribe
 * una línea y cuántas líneas son. Meter una consulta en este archivo sería
 * abrir la puerta que el candado de Boston cierra.
 *
 * Daniel (3-sep-2026): *"no me interesa saber qué factura pagó, solo ver sus
 * últimos 3 pagos y fecha en CXC"*. Fecha y monto, nada más.
 */
import { fmt, fmtDate } from "@/lib/format";

export interface PagoReciente {
  /** YYYY-MM-DD, el día del recibo en Switch. */
  fecha: string;
  monto: number;
}

/** Cuántos pagos se muestran por empresa. Lo pidió Daniel: tres. */
export const PAGOS_POR_EMPRESA = 3;

export const TITULO_ULTIMOS_PAGOS = "Últimos pagos";
export const SIN_PAGOS = "Sin pagos registrados";
export const CARGANDO_PAGOS = "Cargando pagos…";
export const ERROR_PAGOS = "No se pudieron cargar los pagos.";

/** `12 ago 2026 · $1,250.00` — la misma forma en pantalla, en las tres carteras. */
export function lineaPago(p: PagoReciente): string {
  return `${fmtDate(p.fecha)} · $${fmt(p.monto)}`;
}
