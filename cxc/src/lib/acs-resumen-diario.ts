// ─────────────────────────────────────────────────────────────────────────────
// Resumen diario ACS para Telegram (cron acs-resumen-diario, 01:45 UTC =
// 20:45 Panamá, tras el sync ACS de 01:30).
//
// SEMÁNTICA = la del módulo Multifashion (validada al centavo contra
// multifashion_overview_serie_v1 el 4-jul-2026):
//   - Fuente: _multifashion_sf_vw (proyección de switch_facturas american_classic
//     con fecha en hora Panamá y subtotal FIRMADO: NC negativas).
//   - RETAIL only (is_wholesale=false) — el módulo compara retail; el mayoreo
//     B2B distorsionaría el pulso diario de la tienda.
//   - Métrica: SUM(subtotal) (neto pre-impuesto, igual que la serie del Overview).
//   - "Hoy vs día comparable": misma fecha −364 días = MISMO DÍA DE LA SEMANA
//     del año pasado (un viernes se compara con viernes — estándar retail).
//   - "Mes vs año pasado": acumulado 1..D vs 1..D del año anterior (mismo día
//     de corte, la convención YoY del módulo).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

const VIEW = "_multifashion_sf_vw";
const PAGE = 1000;

export interface AcsResumenDiario {
  fecha: string;          // día del resumen (hoy Panamá)
  hoy: number;
  hoyPrev: number;        // día comparable (−364d, mismo día de semana)
  fechaComparable: string;
  mes: number;            // acumulado 1..fecha
  mesPrev: number;        // acumulado 1..fecha del año anterior
}

export function hoyPanama(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

export function addDays(fecha: string, days: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** SUM(subtotal) retail en [desde, hasta] (fechas Panamá, inclusive) —
 *  paginado con orden estable para no caer en el cap de 1000 de PostgREST. */
async function sumRetail(desde: string, hasta: string): Promise<number> {
  let sum = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from(VIEW)
      .select("subtotal, n_sistema")
      .eq("is_wholesale", false)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("n_sistema", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${VIEW} [${desde}..${hasta}]: ${error.message}`);
    for (const r of data ?? []) sum += Number(r.subtotal) || 0;
    if (!data || data.length < PAGE) break;
  }
  return Math.round(sum * 100) / 100;
}

export async function calcularResumenDiario(fecha: string): Promise<AcsResumenDiario> {
  const fechaComparable = addDays(fecha, -364);
  const inicioMes = `${fecha.slice(0, 7)}-01`;
  const inicioMesPrev = `${addDays(fecha, -365).slice(0, 4)}-${fecha.slice(5, 7)}-01`;
  const cortePrev = `${addDays(fecha, -365).slice(0, 4)}-${fecha.slice(5)}`; // misma fecha, año −1

  const [hoy, hoyPrev, mes, mesPrev] = await Promise.all([
    sumRetail(fecha, fecha),
    sumRetail(fechaComparable, fechaComparable),
    sumRetail(inicioMes, fecha),
    sumRetail(inicioMesPrev, cortePrev),
  ]);

  return { fecha, hoy, hoyPrev, fechaComparable, mes, mesPrev };
}

// ── Formato del mensaje (formato exacto pedido por Daniel) ───────────────────
//   🏪 ACS vie 4-jul
//   Hoy: $2,186 · +5%
//   Mes: $9,140 · +8.2%

function fmtMonto(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtPct(cur: number, prev: number, decimales: number): string {
  if (prev <= 0) return "s/d año pasado";
  const pct = ((cur - prev) / prev) * 100;
  const val = pct.toFixed(decimales);
  return `${pct >= 0 ? "+" : ""}${val}%`;
}

export function fmtDiaLabel(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("es-PA", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "");
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${wd} ${d.getUTCDate()}-${mes}`;
}

export function buildMensaje(r: AcsResumenDiario): string {
  return [
    `🏪 ACS ${fmtDiaLabel(r.fecha)}`,
    `Hoy: ${fmtMonto(r.hoy)} · ${fmtPct(r.hoy, r.hoyPrev, 0)}`,
    `Mes: ${fmtMonto(r.mes)} · ${fmtPct(r.mes, r.mesPrev, 1)}`,
  ].join("\n");
}
