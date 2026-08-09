// ─────────────────────────────────────────────────────────────────────────────
// Temporadas de compra — módulo PURO y FUENTE ÚNICA.
//
// Definidas por Daniel, sin solaparse (un test lo fija):
//   Tommy/Calvin:  PS ene–mar · SP abr–jun · PF jul–sep · FA oct–dic
//   Reebok:        SS ene–jun · FW jul–dic   (FW, no FA)
//
// Los meses de cada temporada viven SOLO acá: mañana se pueden configurar por
// código sin tocar la lógica de ventanas ni la UI. Las fechas se comparan como
// strings YYYY-MM en hora Panamá (UTC-5 fijo) — rangos, nunca EXTRACT.
// ─────────────────────────────────────────────────────────────────────────────

import { diffMeses } from "./referencia";

export interface TemporadaDef {
  /** Código corto que Daniel ve en las listas de compra: PS, SP, PF, FA, SS, FW. */
  codigo: string;
  familia: "Tommy/Calvin" | "Reebok";
  /** Etiqueta simple en español. */
  nombre: string;
  /** Meses calendario 1..12, consecutivos. */
  meses: number[];
}

export const TEMPORADAS: readonly TemporadaDef[] = [
  { codigo: "PS", familia: "Tommy/Calvin", nombre: "PS · ene–mar", meses: [1, 2, 3] },
  { codigo: "SP", familia: "Tommy/Calvin", nombre: "SP · abr–jun", meses: [4, 5, 6] },
  { codigo: "PF", familia: "Tommy/Calvin", nombre: "PF · jul–sep", meses: [7, 8, 9] },
  { codigo: "FA", familia: "Tommy/Calvin", nombre: "FA · oct–dic", meses: [10, 11, 12] },
  { codigo: "SS", familia: "Reebok", nombre: "SS · ene–jun", meses: [1, 2, 3, 4, 5, 6] },
  { codigo: "FW", familia: "Reebok", nombre: "FW · jul–dic", meses: [7, 8, 9, 10, 11, 12] },
] as const;

export function temporadaPorCodigo(codigo: string): TemporadaDef | null {
  return TEMPORADAS.find((t) => t.codigo === codigo) ?? null;
}

export interface VentanaTemporada {
  /** Ej. "SP26" — el nombre con el que Daniel compra. */
  etiqueta: string;
  anio: number;
  /** Primer mes de la ventana, YYYY-MM. */
  desde: string;
  /** Último mes de la ventana, YYYY-MM (inclusive). */
  hasta: string;
}

const MM = (n: number) => String(n).padStart(2, "0");

/**
 * Las 2 ventanas más recientes YA OCURRIDAS (terminadas por completo) de una
 * temporada. Quien compra SP27 hoy (ago-2026) ve SP26 y SP25 — la temporada
 * pasada es lo que mejor predice la que viene, y una a medio correr mentiría.
 *
 * `hoyMes` = mes actual en hora Panamá (YYYY-MM).
 */
export function ventanasTemporada(codigoTemporada: string, hoyMes: string): VentanaTemporada[] {
  const t = temporadaPorCodigo(codigoTemporada);
  if (!t) return [];
  const anioActual = Number(hoyMes.slice(0, 4));
  const out: VentanaTemporada[] = [];
  // La ventana del año `y` terminó si su último mes quedó ANTES del mes actual.
  for (let y = anioActual; y >= anioActual - 3 && out.length < 2; y -= 1) {
    const hasta = `${y}-${MM(t.meses[t.meses.length - 1])}`;
    if (hasta >= hoyMes) continue; // en curso o futura — no ocurrió entera
    out.push({
      etiqueta: `${t.codigo}${String(y).slice(-2)}`,
      anio: y,
      desde: `${y}-${MM(t.meses[0])}`,
      hasta,
    });
  }
  return out;
}

/** Suma de una serie mensual dentro de una ventana de temporada (rango sobre
 *  YYYY-MM, inclusive en ambos extremos — son meses enteros). */
export function statsEnVentana(
  serie: { mes: string; unidades: number; venta: number }[],
  ventana: VentanaTemporada,
): { unidades: number; venta: number } {
  let unidades = 0;
  let venta = 0;
  for (const p of serie) {
    if (p.mes >= ventana.desde && p.mes <= ventana.hasta) {
      unidades += p.unidades;
      venta += p.venta;
    }
  }
  return { unidades, venta };
}

/** Cuántos meses dura la temporada (para leer "u/mes" comparable). */
export function largoVentanaMeses(v: VentanaTemporada): number {
  return diffMeses(v.hasta, v.desde) + 1;
}
