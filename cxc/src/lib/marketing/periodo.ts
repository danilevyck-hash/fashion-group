// ============================================================================
// Marketing — período trabajado (rango desde/hasta) de un pago de impulsadora
// ============================================================================
// Client-safe: SOLO aritmética de strings "YYYY-MM-DD". Cero `new Date()` y
// cero `toISOString()` — Panamá es UTC−5 fijo y `toISOString()` corre el día
// (un 15 a las 20:00 de Panamá es el 16 en UTC). Comparar strings ISO es
// cronológico por definición, así que no hace falta ningún objeto Date.
//
// Modelo:
//   - Pagos NUEVOS traen periodo_desde/periodo_hasta (rango real trabajado).
//   - Pagos VIEJOS (mensuales) traen solo impulsadora_mes → su período efectivo
//     es el MES COMPLETO de ese mes. Nunca se migran: se derivan al leer.
//   - impulsadora_mes se sigue guardando siempre (= mes de periodo_desde) para
//     que los reportes por año y el orden del ZIP no cambien.
// ============================================================================

import { MESES_ES, etiquetaMes } from "./meses";

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export interface Periodo {
  /** "YYYY-MM-DD" inclusive */
  desde: string;
  /** "YYYY-MM-DD" inclusive */
  hasta: string;
}

/** true si el string es una fecha ISO "YYYY-MM-DD" con día real del mes. */
export function esFechaISO(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= diasDelMes(a, m);
}

/** Días que tiene un mes (mes 1-12). Regla gregoriana completa, sin Date. */
export function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) {
    const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
    return bisiesto ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 30;
}

/** "YYYY-MM-01" del mes al que pertenece una fecha ISO. */
export function mesDeFecha(fechaISO: string): string {
  return `${fechaISO.slice(0, 7)}-01`;
}

/** Primer y último día de un mes dado como "YYYY-MM" o "YYYY-MM-DD". */
export function mesCompleto(mes: string): Periodo {
  const ym = mes.slice(0, 7);
  const [a, m] = ym.split("-").map(Number);
  return { desde: `${ym}-01`, hasta: `${ym}-${String(diasDelMes(a, m)).padStart(2, "0")}` };
}

/** Del 1 al 15 del mes. */
export function primeraQuincena(mes: string): Periodo {
  const ym = mes.slice(0, 7);
  return { desde: `${ym}-01`, hasta: `${ym}-15` };
}

/** Del 16 al último día del mes. */
export function segundaQuincena(mes: string): Periodo {
  const ym = mes.slice(0, 7);
  const [a, m] = ym.split("-").map(Number);
  return { desde: `${ym}-16`, hasta: `${ym}-${String(diasDelMes(a, m)).padStart(2, "0")}` };
}

/**
 * Valida un rango. Devuelve el mensaje de error en español simple, o null si
 * está bien. Un solo día (desde = hasta) es válido.
 */
export function validarPeriodo(desde: unknown, hasta: unknown): string | null {
  if (!esFechaISO(desde) || !esFechaISO(hasta)) {
    return "Poné las dos fechas del período trabajado.";
  }
  if (hasta < desde) {
    return "La fecha final no puede ser anterior a la inicial.";
  }
  return null;
}

/**
 * Período efectivo de una factura de impulsadora.
 * - Con periodo_desde/hasta → ese rango.
 * - Sin él (pago viejo mensual) → el mes completo de impulsadora_mes.
 * - Sin nada → null.
 */
export function periodoEfectivo(f: {
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  impulsadora_mes?: string | null;
}): Periodo | null {
  const d = f.periodo_desde ? String(f.periodo_desde).slice(0, 10) : "";
  const h = f.periodo_hasta ? String(f.periodo_hasta).slice(0, 10) : "";
  if (esFechaISO(d) && esFechaISO(h) && h >= d) return { desde: d, hasta: h };
  const mes = f.impulsadora_mes ? String(f.impulsadora_mes).slice(0, 10) : "";
  if (/^\d{4}-\d{2}/.test(mes)) return mesCompleto(mes);
  return null;
}

/** true si los dos rangos comparten al menos un día. */
export function seSolapan(a: Periodo, b: Periodo): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/** true si el rango cubre un mes calendario completo. */
export function esMesCompleto(p: Periodo): boolean {
  if (p.desde.slice(0, 7) !== p.hasta.slice(0, 7)) return false;
  const m = mesCompleto(p.desde);
  return p.desde === m.desde && p.hasta === m.hasta;
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

const dia = (f: string) => String(Number(f.slice(8, 10)));
const mesLargo = (f: string) => MESES_ES[Number(f.slice(5, 7)) - 1] ?? f.slice(5, 7);
const mesCorto = (f: string) => MESES_CORTOS[Number(f.slice(5, 7)) - 1] ?? f.slice(5, 7);
const anio = (f: string) => f.slice(0, 4);

/**
 * Etiqueta larga, para el concepto del gasto.
 * Mes completo → "Julio 2026" (IDÉNTICO al texto que ya usaban los pagos
 * mensuales, así los conceptos viejos y nuevos no se desalinean).
 */
export function etiquetaPeriodo(p: Periodo): string {
  if (esMesCompleto(p)) return etiquetaMes(p.desde);
  if (p.desde === p.hasta) return `${dia(p.desde)} de ${mesLargo(p.desde)} ${anio(p.desde)}`;
  if (p.desde.slice(0, 7) === p.hasta.slice(0, 7)) {
    return `${dia(p.desde)}–${dia(p.hasta)} de ${mesLargo(p.desde)} ${anio(p.desde)}`;
  }
  if (anio(p.desde) === anio(p.hasta)) {
    return `${dia(p.desde)} ${mesLargo(p.desde)} – ${dia(p.hasta)} ${mesLargo(p.hasta)} ${anio(p.hasta)}`;
  }
  return `${dia(p.desde)} ${mesLargo(p.desde)} ${anio(p.desde)} – ${dia(p.hasta)} ${mesLargo(p.hasta)} ${anio(p.hasta)}`;
}

/** Etiqueta compacta para tarjetas y Excel: "1–15 jul 2026", "jul 2026". */
export function etiquetaPeriodoCorta(p: Periodo): string {
  if (esMesCompleto(p)) return `${mesCorto(p.desde)} ${anio(p.desde)}`;
  if (p.desde === p.hasta) return `${dia(p.desde)} ${mesCorto(p.desde)} ${anio(p.desde)}`;
  if (p.desde.slice(0, 7) === p.hasta.slice(0, 7)) {
    return `${dia(p.desde)}–${dia(p.hasta)} ${mesCorto(p.desde)} ${anio(p.desde)}`;
  }
  if (anio(p.desde) === anio(p.hasta)) {
    return `${dia(p.desde)} ${mesCorto(p.desde)} – ${dia(p.hasta)} ${mesCorto(p.hasta)} ${anio(p.hasta)}`;
  }
  return `${dia(p.desde)} ${mesCorto(p.desde)} ${anio(p.desde)} – ${dia(p.hasta)} ${mesCorto(p.hasta)} ${anio(p.hasta)}`;
}

// ── Estado de un mes frente a los pagos registrados ──────────────────────────

export type EstadoMes = "pagado" | "parcial" | "pendiente";

export interface CoberturaMes {
  /** "YYYY-MM-01" */
  mes: string;
  estado: EstadoMes;
  /** Días del mes SIN pagar, compactados: "16–31" o "1–5, 20–31". "" si está pagado. */
  faltan: string;
}

/** Agrupa números de día consecutivos en rangos legibles: [16..31] → "16–31". */
function compactarDias(dias: ReadonlyArray<number>): string {
  const partes: string[] = [];
  let i = 0;
  while (i < dias.length) {
    let j = i;
    while (j + 1 < dias.length && dias[j + 1] === dias[j] + 1) j++;
    partes.push(dias[i] === dias[j] ? String(dias[i]) : `${dias[i]}–${dias[j]}`);
    i = j + 1;
  }
  return partes.join(", ");
}

/**
 * Cobertura de un mes según los períodos ya pagados. Con quincenas un mes
 * puede quedar a medias: la tarjeta tiene que decirlo, no mentir "pagado".
 */
export function coberturaDelMes(
  mesISO: string,
  periodos: ReadonlyArray<Periodo>,
): CoberturaMes {
  const mes = mesDeFecha(mesISO);
  const rango = mesCompleto(mes);
  const total = Number(rango.hasta.slice(8, 10));
  const cubierto = new Array<boolean>(total + 1).fill(false);

  for (const p of periodos) {
    if (!seSolapan(p, rango)) continue;
    const ini = p.desde > rango.desde ? p.desde : rango.desde;
    const fin = p.hasta < rango.hasta ? p.hasta : rango.hasta;
    for (let d = Number(ini.slice(8, 10)); d <= Number(fin.slice(8, 10)); d++) {
      cubierto[d] = true;
    }
  }

  const faltantes: number[] = [];
  for (let d = 1; d <= total; d++) if (!cubierto[d]) faltantes.push(d);

  if (faltantes.length === 0) return { mes, estado: "pagado", faltan: "" };
  if (faltantes.length === total) return { mes, estado: "pendiente", faltan: "" };
  return { mes, estado: "parcial", faltan: compactarDias(faltantes) };
}
