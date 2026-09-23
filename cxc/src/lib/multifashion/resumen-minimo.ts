// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION › RESUMEN MÍNIMO — las cuentas de la pestaña, PURAS (23-sep-2026).
//
// Lo que el mockup aprobado dibuja y de dónde sale cada cosa:
//   · «658 tiquetes · $48.38 promedio» y «▲ +25.0% vs sep 2025 · ▼ −22.0% vs
//     agosto» → `comparativosDelMes`, un solo redondeo (`fmtDeltaRetail`).
//   · «Cierra en … por temporada, con 22 días» → `proyeccionMesPorTemporada`:
//     LA MISMA CUENTA DE LA META (`metas-avance.ts`): lo vendido hasta el corte
//     dividido por la porción de temporada que ya pasó, medida con el mismo mes
//     del año pasado. 🩸 Se va la regla de tres por días (medida en la
//     auditoría: −41 % el día 5 de diciembre) y `proyeccion_mensual_retail_v1`
//     deja de pedirse.
//   · «+ $24,807.00 de mayoreo (1 factura) · entró $72,182.17» → el mayoreo del
//     mes y del año salen del overview que YA viaja (`wholesale.meses`,
//     `wholesale.ytdVentas`): las dos consultas del mayoreo de la ruta del
//     detalle se retiran.
//   · «sáb 12 y lun 21 en $0 y no son feriado — ¿la tienda abrió?» →
//     `diasSinVenta`: día hábil (lunes a sábado, Multifashion abre los sábados)
//     ya pasado, en $0 y que no está en `asistencia_feriados`. Sin la lista de
//     feriados NO se avisa (falla cerrada): un aviso falso en Carnaval vale
//     menos que ninguno.
//   · «Sáb es el día fuerte ($2,770) · hora pico 5–6 pm · mejor día del mes:
//     19 sep, $4,064» → `lineaHabitos`, UNA línea; el «peor día» se fue.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoneyCompact } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import { FRACCION_MINIMA_PARA_PROYECTAR } from "./metas-avance";
import { fmtDeltaRetail, type MayoreoDelPeriodo } from "./retail-al-frente";

const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// ─── El mayoreo, del overview que ya viaja ──────────────────────────────────

interface MesMayoreo { ventas: number | string | null; tickets: number | string | null }

/** El mayoreo del MES (calendario) desde `overview.wholesale.meses[mes-1]`. */
export function mayoreoDelMes(
  meses: readonly MesMayoreo[] | null | undefined,
  mes: number,
  retail: number,
): MayoreoDelPeriodo | null {
  const m = meses?.[mes - 1];
  if (!m) return null;
  return { monto: Number(m.ventas) || 0, facturas: Number(m.tickets) || 0, retail };
}

/** El mayoreo del AÑO (hasta el mes pedido) desde `overview.wholesale`. */
export function mayoreoDelAnio(
  wholesale: { ytdVentas: number | string | null; ytdTickets: number | string | null } | null | undefined,
  retail: number,
): MayoreoDelPeriodo | null {
  if (!wholesale) return null;
  return { monto: Number(wholesale.ytdVentas) || 0, facturas: Number(wholesale.ytdTickets) || 0, retail };
}

// ─── Los comparativos del mes, en una línea ─────────────────────────────────

export interface EntradaComparativos {
  ventas: number;
  yoy: { ventas: number; tiene_data: boolean };
  mesAnterior: { ventas: number; tiene_data: boolean };
  year: number;
  mes: number;
}

/** «▲ +25.0% vs sep 2025 · ▼ −22.0% vs agosto». Sin base, «n/a vs …». */
export function comparativosDelMes(e: EntradaComparativos): { yoy: string; mom: string; texto: string } {
  const dYoy = e.yoy.tiene_data ? variacionPct(e.ventas, e.yoy.ventas) : null;
  const dMom = e.mesAnterior.tiene_data ? variacionPct(e.ventas, e.mesAnterior.ventas) : null;
  const mesPrev = e.mes === 1 ? 12 : e.mes - 1;
  const yoy = `${fmtDeltaRetail(dYoy)} vs ${MES_CORTO[e.mes - 1]} ${e.year - 1}`;
  const mom = `${fmtDeltaRetail(dMom)} vs ${MES_LARGO[mesPrev - 1]}`;
  return { yoy, mom, texto: `${yoy} · ${mom}` };
}

// ─── «Cierra en», por temporada ─────────────────────────────────────────────

export interface EntradaProyeccionMes {
  /** Lo vendido del 1 al último día completo del mes. */
  ventasAlCorte: number;
  /** El mismo mes del año pasado, hasta el MISMO día (`yoy.ventas`). */
  prevMismosDias: number;
  /** El mismo mes del año pasado, COMPLETO. */
  prevMesCompleto: number;
  /** Sobre cuántos días está hecha (`dia_actual`). */
  diaCorte: number;
}

export interface ProyeccionMes {
  proyeccion: number;
  dias: number;
  /** Qué porción de la temporada del mes ya pasó (0..1). */
  fraccionTemporada: number;
}

/**
 * proyección = vendido ÷ (temporada transcurrida ÷ temporada total), con el
 * mismo mes del año pasado como forma de la temporada. Es la cuenta de la meta.
 *
 * `null` = no se proyecta: sin base del año pasado, sin días medidos, o cuando
 * pasó menos del 5 % de la temporada (el mismo piso que la meta).
 */
export function proyeccionMesPorTemporada(e: EntradaProyeccionMes): ProyeccionMes | null {
  const vendido = Number(e.ventasAlCorte) || 0;
  const prevDias = Number(e.prevMismosDias) || 0;
  const prevMes = Number(e.prevMesCompleto) || 0;
  const dias = Math.max(0, Math.trunc(Number(e.diaCorte) || 0));
  if (dias <= 0 || prevDias <= 0 || prevMes <= 0) return null;
  const fraccion = prevDias / prevMes;
  if (fraccion < FRACCION_MINIMA_PARA_PROYECTAR || fraccion > 1) return null;
  const proyeccion = Math.round((vendido / fraccion) * 100) / 100;
  return { proyeccion, dias, fraccionTemporada: fraccion };
}

// ─── «¿La tienda abrió?» ────────────────────────────────────────────────────

export interface EntradaDiasSinVenta {
  dias: readonly { dia: number; ventas: number; n_tickets?: number }[];
  isMesActual: boolean;
  /** El último día COMPLETO del mes en curso (`dia_actual`). */
  diaActual: number;
  year: number;
  mes: number;
  /** `YYYY-MM-DD` de `asistencia_feriados`; `null` = no se pudo leer → sin aviso. */
  feriados: readonly string[] | null;
}

/** Día hábil de la tienda: lunes a sábado. El domingo no cuenta. */
export function esDiaHabilTienda(year: number, mes: number, dia: number): boolean {
  return new Date(Date.UTC(year, mes - 1, dia)).getUTCDay() !== 0;
}

/**
 * Los días hábiles ya pasados, en $0 y sin ningún tiquete, que no son feriado.
 * Un día con tiquetes que netea $0 (compra y devolución) NO es un día cerrado.
 */
export function diasSinVenta(e: EntradaDiasSinVenta): { dias: number[]; texto: string | null } {
  if (e.feriados == null) return { dias: [], texto: null };
  const tope = e.isMesActual ? Math.max(0, Math.trunc(e.diaActual)) : Infinity;
  const feriados = new Set(e.feriados.map((f) => String(f).slice(0, 10)));
  const dias = e.dias
    .filter((d) => d.dia <= tope)
    .filter((d) => Math.abs(Number(d.ventas) || 0) < 0.005 && (Number(d.n_tickets) || 0) === 0)
    .filter((d) => esDiaHabilTienda(e.year, e.mes, d.dia))
    .filter((d) => !feriados.has(`${e.year}-${String(e.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`))
    .map((d) => d.dia)
    .sort((a, b) => a - b);
  if (dias.length === 0) return { dias, texto: null };
  const nombre = (d: number) => `${DIA_CORTO[new Date(Date.UTC(e.year, e.mes - 1, d)).getUTCDay()]} ${d}`;
  const lista = dias.length === 1
    ? nombre(dias[0])
    : `${dias.slice(0, -1).map(nombre).join(", ")} y ${nombre(dias[dias.length - 1])}`;
  const verbo = dias.length === 1 ? "no es feriado" : "no son feriado";
  return { dias, texto: `${lista} en $0 y ${verbo} — ¿la tienda abrió?` };
}

// ─── Los hábitos, en una línea ──────────────────────────────────────────────

export interface EntradaHabitos {
  mejorDow: { dow_label: string; ventas_promedio: number } | null;
  horaPico: string | null;
  mejorDia: { fecha: string; ventas: number } | null;
}

/** «Sáb es el día fuerte ($2,770) · hora pico 5–6 pm · mejor día del mes: 19 sep, $4,064». */
export function lineaHabitos(e: EntradaHabitos): string | null {
  const partes: string[] = [];
  if (e.mejorDow && e.mejorDow.ventas_promedio > 0) {
    partes.push(`${e.mejorDow.dow_label} es el día fuerte (${fmtMoneyCompact(e.mejorDow.ventas_promedio)})`);
  }
  if (e.horaPico) partes.push(`hora pico ${e.horaPico}`);
  if (e.mejorDia) {
    const [, m, d] = e.mejorDia.fecha.slice(0, 10).split("-").map(Number);
    partes.push(`mejor día del mes: ${d} ${MES_CORTO[m - 1]}, ${fmtMoneyCompact(e.mejorDia.ventas)}`);
  }
  return partes.length ? partes.join(" · ") : null;
}
