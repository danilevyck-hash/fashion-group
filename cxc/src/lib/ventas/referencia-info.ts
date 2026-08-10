// ─────────────────────────────────────────────────────────────────────────────
// Datos de catálogo (switch_articulo_info) para el tab Referencia — módulo PURO.
//
// 🔴 COSTOS — decisión FINAL de Daniel (10-ago-2026), después de medirlo:
//   · El `costo` de la API de Switch ES EL CIF — demostrado 3/3 con códigos
//     donde la ficha muestra FOB ≠ CIF (scripts/_diag-fob-3-codigos.ts:
//     API 3.19/10.01/39.60 = CIF; FOB era 2.90/9.10/36.00). La doc v1.0 lo
//     deja sin etiquetar; nuestra medición es la fuente.
//   · `costo_api` SE MUESTRA COMO "Costo CIF" — dato REAL, sin etiqueta de
//     estimado. En el payload viaja como `costoCif`: el nombre ES el contrato
//     (jamás como FOB a secas). Candado en articulo-info.test.ts.
//   · El FOB solo existe DERIVADO Y ETIQUETADO: FOB est. = CIF ÷ (1 + %imp).
//     DIVISIÓN de vuelta, nunca CIF × (1 − %): 3.19 ÷ 1.1 = 2.90 (el caso
//     real QD3636001) mientras 3.19 × 0.9 = 2.871 — Daniel mismo cazó la
//     diferencia. Test que la fija.
//   · Margen sobre el FOB estimado, etiquetado "margen s/FOB est." en
//     pantalla Y en el Excel.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * % de importación para estimar el FOB desde el CIF. Configurable por Daniel
 * a futuro — ⚠️ PENDIENTE DE UI: hoy no hay pantalla de config del módulo
 * Ventas, así que vive como constante nombrada acá (fuente única). Cambiarlo
 * es tocar UN número.
 */
export const PCT_IMPORTACION_DEFAULT = 0.1;

/** FOB estimado = CIF ÷ (1 + % importación). SIEMPRE división de vuelta —
 *  multiplicar por (1 − %) NO es la inversa y da otro número. */
export function fobEstimado(
  cif: number | null,
  pctImportacion: number = PCT_IMPORTACION_DEFAULT,
): number | null {
  if (cif == null || !Number.isFinite(cif) || cif <= 0) return null;
  if (!Number.isFinite(pctImportacion) || pctImportacion < 0) return null;
  return cif / (1 + pctImportacion);
}

/** Margen sobre el FOB estimado: (precio − FOB est.) ÷ precio. El precio que
 *  se le pasa es el REAL de ventas cuando existe; si no, el de etiqueta. */
export function margenSobreFob(precio: number | null, fobEst: number | null): number | null {
  if (precio == null || fobEst == null || !(precio > 0)) return null;
  return (precio - fobEst) / precio;
}

/** Fila cruda de `switch_articulo_info` (lo que lee el route). */
export interface ArticuloInfoFila {
  empresa_key: string;
  codigo: string;
  descripcion: string | null;
  existencia: number | string | null;
  precio_etiqueta: number | string | null;
  /** El costo de la API = CIF (medido 3/3). Al cliente viaja como `costoCif`. */
  costo_api?: number | string | null;
  synced_at: string;
}

/** Lo que el cliente VE de un artículo del catálogo. */
export interface InfoCliente {
  /** Nombre comercial del catálogo (p.ej. "KAHLO PASSCASE"). */
  descripcion: string | null;
  existencia: number | null;
  precioEtiqueta: number | null;
  /** Costo CIF REAL (el `costo` de la API, identificado 3/3). El FOB NO viaja:
   *  se deriva en la vista con fobEstimado() y SIEMPRE etiquetado "est.". */
  costoCif: number | null;
  syncedAt: string;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Traductor fila → payload. Campos UNO POR UNO a propósito — nada de spread.
 *  `costo_api` sale ÚNICAMENTE bajo el nombre `costoCif`: presentarlo como FOB
 *  (o pelado como "costo") es el error que el candado caza. */
export function infoParaCliente(fila: ArticuloInfoFila): InfoCliente {
  return {
    descripcion: fila.descripcion,
    existencia: num(fila.existencia),
    precioEtiqueta: num(fila.precio_etiqueta),
    costoCif: num(fila.costo_api),
    syncedAt: fila.synced_at,
  };
}

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Frescura en hora PANAMÁ (UTC-5 fijo, sin horario de verano):
 * "9-ago, 3:10 pm". Es la etiqueta de "existencia al …" — el dato de catálogo
 * SIEMPRE se muestra con su edad, porque sin cron puede tener días.
 */
export function fmtFrescura(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = d.getUTCDate();
  const mes = MESES_CORTO[d.getUTCMonth()];
  const h24 = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h24 >= 12 ? "pm" : "am";
  const h = h24 % 12 || 12;
  return `${dia}-${mes}, ${h}:${min} ${ampm}`;
}
