// ─────────────────────────────────────────────────────────────────────────────
// Resumen diario ACS para Telegram (cron acs-resumen-diario, 01:00 UTC =
// 20:00 Panamá = 8pm, tras el sync ACS de cierre de 00:15 UTC = 19:15 Panamá).
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
//     de corte en AMBOS lados, la convención YoY del módulo).
//
// GUARDIA ANTI-RUIDO (incidente 5-jul-2026): los crons de Vercel Hobby tienen
// jitter — el sync de cierre (00:15) puede correr tarde o no correr. Si el
// resumen lee antes de que el sync de cierre haya escrito el día, "Hoy" da
// $0 · -100% falso y el mes compara 1..D-1 contra 1..D (asimétrico). Antes de
// calcular se verifica en switch_sync_log que hubo un sync de facturas ACS
// exitoso DESPUÉS del cierre de tienda (fecha+1 00:00 UTC = 19:00 Panamá =
// cierre 7pm; el sync de 00:15 UTC lo satisface con ~45 min de margen antes del
// resumen de 01:00). Si no lo hubo, el
// mensaje omite la línea de "Hoy" y reporta el mes al último día completo
// (1..D-1 vs 1..D-1, simétrico). Un $0 real con sync fresco (tienda cerrada,
// domingo/feriado) se manda normal.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";

export { hoyPanama };

const VIEW = "_multifashion_sf_vw";
const PAGE = 1000;

export interface AcsResumenDiario {
  fecha: string;          // día del resumen (hoy Panamá) — el que se anuncia
  corte: string;          // último día COMPLETO incluido (= fecha si sync fresco)
  syncFresco: boolean;    // ¿el sync de cierre (00:15 UTC) ya corrió para `fecha`?
  hoy: number;            // solo significativo si syncFresco
  hoyPrev: number;        // día comparable (−364d, mismo día de semana)
  fechaComparable: string;
  mes: number;            // acumulado 1..corte
  mesPrev: number;        // acumulado 1..corte del año anterior (mismo D)
}

export function addDays(fecha: string, days: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// ── Ventanas del comparativo (puras, testeables) ─────────────────────────────

export interface VentanasResumen {
  fechaComparable: string; // corte − 364 días (mismo día de la semana, año pasado)
  inicioMes: string;       // día 1 del mes de corte
  inicioMesPrev: string;   // día 1 del mismo mes, año anterior
  cortePrev: string;       // misma fecha de corte, año anterior (29-feb → 28-feb)
}

/** Ventanas same-period ESTRICTAS: 1..D vs 1..D con el MISMO D en ambos lados. */
export function ventanasResumen(corte: string): VentanasResumen {
  const prevYear = String(Number(corte.slice(0, 4)) - 1);
  const mmdd = corte.slice(5) === "02-29" ? "02-28" : corte.slice(5);
  return {
    fechaComparable: addDays(corte, -364),
    inicioMes: `${corte.slice(0, 7)}-01`,
    inicioMesPrev: `${prevYear}-${corte.slice(5, 7)}-01`,
    cortePrev: `${prevYear}-${mmdd}`,
  };
}

/** Momento UTC del cierre de tienda del día `fecha`: fecha+1 a las 00:00 UTC =
 *  19:00 Panamá (7pm) del propio `fecha`. La tienda cierra 7pm sin más
 *  movimiento; el sync de cierre (00:15 UTC) arranca después de este instante y
 *  captura el día completo. La guardia exige un sync `success` con
 *  started_at >= este momento. */
export function cierreUtcDe(fecha: string): string {
  return `${addDays(fecha, 1)}T00:00:00.000Z`;
}

/** ¿Hubo un sync de facturas ACS exitoso que arrancó DESPUÉS del cierre de
 *  tienda de `fecha` y cuyo rango cubre `fecha`? Fail-open: si la consulta
 *  falla se asume fresco (comportamiento previo del cron). */
export async function ventasAcsSyncFresco(fecha: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("id")
    .eq("empresa_key", "american_classic")
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .gte("started_at", cierreUtcDe(fecha))
    .lte("range_from", fecha)
    .gte("range_to", fecha)
    .limit(1);
  if (error) {
    console.error(`[acs-resumen] no pude verificar frescura del sync (${error.message}); asumo fresco`);
    return true;
  }
  return (data?.length ?? 0) > 0;
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

export async function calcularResumenDiario(
  fecha: string,
  syncFresco = true,
): Promise<AcsResumenDiario> {
  // Sin sync fresco el día `fecha` está incompleto en la DB: se recorta el
  // corte al último día completo para que el mes compare 1..D-1 vs 1..D-1.
  const corte = syncFresco ? fecha : addDays(fecha, -1);
  const v = ventanasResumen(corte);

  const [hoy, hoyPrev, mes, mesPrev] = await Promise.all([
    syncFresco ? sumRetail(corte, corte) : Promise.resolve(0),
    syncFresco ? sumRetail(v.fechaComparable, v.fechaComparable) : Promise.resolve(0),
    sumRetail(v.inicioMes, corte),
    sumRetail(v.inicioMesPrev, v.cortePrev),
  ]);

  return { fecha, corte, syncFresco, hoy, hoyPrev, fechaComparable: v.fechaComparable, mes, mesPrev };
}

// ── Formato del mensaje (formato exacto pedido por Daniel) ───────────────────
//   Sync fresco:                      Sync viejo / no corrió:
//   🏪 ACS vie 4-jul                  🏪 ACS vie 4-jul
//   Hoy: $2,186 · +5%                 ⏳ Ventas del día aún sincronizando
//   Mes: $9,140 · +8.2%               Mes (al 3-jul): $5,298 · +39.1%

export function fmtMonto(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtPct(cur: number, prev: number, decimales: number): string {
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

/** "3-jul" — sin día de semana, para el label "Mes (al …)". */
export function fmtDiaCorto(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${d.getUTCDate()}-${mes}`;
}

export function buildMensaje(r: AcsResumenDiario): string {
  if (!r.syncFresco) {
    return [
      `🏪 ACS ${fmtDiaLabel(r.fecha)}`,
      `⏳ Ventas del día aún sincronizando`,
      `Mes (al ${fmtDiaCorto(r.corte)}): ${fmtMonto(r.mes)} · ${fmtPct(r.mes, r.mesPrev, 1)}`,
    ].join("\n");
  }
  return [
    `🏪 ACS ${fmtDiaLabel(r.fecha)}`,
    `Hoy: ${fmtMonto(r.hoy)} · ${fmtPct(r.hoy, r.hoyPrev, 0)}`,
    `Mes: ${fmtMonto(r.mes)} · ${fmtPct(r.mes, r.mesPrev, 1)}`,
  ].join("\n");
}
