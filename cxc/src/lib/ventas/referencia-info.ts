// ─────────────────────────────────────────────────────────────────────────────
// Datos de catálogo (switch_articulo_info) para el tab Referencia — módulo PURO.
//
// 🔴 `costo_api` NUNCA VIAJA AL CLIENTE — y está CONFIRMADO que es el CIF.
// Medido el 10-ago-2026 con 3 códigos donde la ficha de Switch muestra
// FOB ≠ CIF (scripts/_diag-fob-3-codigos.ts): la API devolvió el CIF en los 3.
// Decisión de Daniel: el CIF no se muestra y el FOB JAMÁS se deriva de otro
// costo. `infoParaCliente()` es EL único traductor fila→payload y elige los
// campos UNO POR UNO; hay un test que se pone rojo si `costo_api` aparece en
// el payload. Si Switch expone el FOB algún día, se enciende acá.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila cruda de `switch_articulo_info` (lo que lee el route). */
export interface ArticuloInfoFila {
  empresa_key: string;
  codigo: string;
  descripcion: string | null;
  existencia: number | string | null;
  precio_etiqueta: number | string | null;
  synced_at: string;
  /** Presente en la tabla; JAMÁS se copia al payload. */
  costo_api?: number | string | null;
}

/** Lo que el cliente VE de un artículo del catálogo. Sin costo_api. */
export interface InfoCliente {
  /** Nombre comercial del catálogo (p.ej. "KAHLO PASSCASE"). */
  descripcion: string | null;
  existencia: number | null;
  precioEtiqueta: number | null;
  syncedAt: string;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Traductor fila → payload. Campos UNO POR UNO a propósito — nada de spread,
 *  que es como un `costo_api` se colaría sin que nadie lo escriba. */
export function infoParaCliente(fila: ArticuloInfoFila): InfoCliente {
  return {
    descripcion: fila.descripcion,
    existencia: num(fila.existencia),
    precioEtiqueta: num(fila.precio_etiqueta),
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
