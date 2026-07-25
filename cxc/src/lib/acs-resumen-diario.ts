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
//   - "Año (YTD) vs año pasado": acumulado 1-ene..corte vs 1-ene..MISMA fecha
//     de calendario del año anterior (mismo mes-día de corte en ambos lados).
//
// POR QUÉ EL YTD USA CALENDARIO Y NO −364d (decisión 25-jul-2026):
//   El Día usa −364d porque a escala de UN día el día de la semana lo domina
//   todo (un viernes factura muy distinto a un jueves). En un acumulado de
//   ~200 días esa distorsión se diluye: ambas ventanas ya contienen
//   prácticamente el mismo número de lunes, martes, etc. En cambio −364d SÍ
//   rompería la simetría del acumulado, porque solo desplaza el EXTREMO
//   DERECHO de la ventana: el arranque sigue siendo 1-ene, así que
//   1-ene..(corte−364d) es un día MÁS LARGO que 1-ene..corte (206 vs 205 días
//   al 24-jul-2026) e infla el año pasado. Calendario 1-ene..mismo mes-día
//   mantiene las dos ventanas del mismo largo, es la convención YTD estándar
//   en retail y es la que ya usa la línea de "Mes" (cortePrev). Además es
//   literalmente lo que dice la etiqueta aprobada: "1 ene al 24 jul 2025".
//   El recorte 29-feb → 28-feb de cortePrev aplica igual al YTD.
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
  anio: number;           // YTD: acumulado 1-ene..corte
  anioPrev: number;       // YTD del año anterior: 1-ene..cortePrev (calendario)
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
  inicioAnio: string;      // 1-ene del año de corte (arranque del YTD)
  inicioAnioPrev: string;  // 1-ene del año anterior (arranque del YTD comparable)
}

/** Ventanas same-period ESTRICTAS: 1..D vs 1..D con el MISMO D en ambos lados.
 *  El YTD reusa `cortePrev` como cierre — misma convención de calendario que
 *  el mes (ver cabecera del archivo para el porqué frente a −364d). */
export function ventanasResumen(corte: string): VentanasResumen {
  const prevYear = String(Number(corte.slice(0, 4)) - 1);
  const mmdd = corte.slice(5) === "02-29" ? "02-28" : corte.slice(5);
  return {
    fechaComparable: addDays(corte, -364),
    inicioMes: `${corte.slice(0, 7)}-01`,
    inicioMesPrev: `${prevYear}-${corte.slice(5, 7)}-01`,
    cortePrev: `${prevYear}-${mmdd}`,
    inicioAnio: `${corte.slice(0, 4)}-01-01`,
    inicioAnioPrev: `${prevYear}-01-01`,
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

  const [hoy, hoyPrev, mes, mesPrev, anio, anioPrev] = await Promise.all([
    syncFresco ? sumRetail(corte, corte) : Promise.resolve(0),
    syncFresco ? sumRetail(v.fechaComparable, v.fechaComparable) : Promise.resolve(0),
    sumRetail(v.inicioMes, corte),
    sumRetail(v.inicioMesPrev, v.cortePrev),
    sumRetail(v.inicioAnio, corte),
    sumRetail(v.inicioAnioPrev, v.cortePrev),
  ]);

  return {
    fecha, corte, syncFresco,
    hoy, hoyPrev, fechaComparable: v.fechaComparable,
    mes, mesPrev,
    anio, anioPrev,
  };
}

// ── Formato del mensaje (formato exacto aprobado por Daniel, 25-jul-2026) ────
//   Tabla de dos bloques: el año en curso arriba (monto + variación YoY) y el
//   año pasado abajo (monto + a qué periodo corresponde). Va a Telegram con
//   parse_mode HTML dentro de un <pre> — sin monoespaciado las columnas no
//   cuadran en el móvil. Ver buildMensajeHtml.
//
//   🏪 ACS · viernes 24 jul
//   ━━━━━━━━━━━━━━━━━━
//   Día    $1,761      ▲ +18%
//   Mes    $34,278     ▲ +38.9%
//   Año    $298,582    ▲ +13.4%
//   ━━━━━━━━━━━━━━━━━━
//   Año pasado
//   Día    $1,494      viernes 25 jul 2025
//   Mes    $24,683     1 al 24 de julio 2025
//   Año    $263,407    1 ene al 24 jul 2025
//
//   Sync viejo / no corrió (guardia anti-ruido, corte recortado a D-1): se cae
//   la fila "Día" de ambos bloques y el aviso dice hasta qué día llega el corte
//   (ese dato lo llevaba el viejo label "Mes (al 9-jul)"):
//   🏪 ACS · viernes 24 jul
//   ━━━━━━━━━━━━━━━━━━
//   ⏳ Ventas del día aún sincronizando (al 23-jul)
//   Mes    $32,517     ▲ +36.2%
//   …
//
//   Sin dato del año pasado en una métrica (prev ≤ 0): esa fila muestra
//   "s/d año pasado" en vez de la flecha y NO aparece en el bloque de abajo.
//   Si ninguna métrica tiene comparable, el bloque "Año pasado" se omite entero.

export function fmtMonto(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtPct(cur: number, prev: number, decimales: number): string {
  if (prev <= 0) return "s/d año pasado";
  const pct = ((cur - prev) / prev) * 100;
  const val = pct.toFixed(decimales);
  return `${pct >= 0 ? "+" : ""}${val}%`;
}

/** "▲ +18%" / "▼ -40%" / "= 0%" / "s/d año pasado".
 *
 *  La flecha se decide sobre el porcentaje YA REDONDEADO a `decimales`, no
 *  sobre el crudo: así nunca sale un "▲ +0.0%" (que se lee como subida sin
 *  serlo) ni un "▼ -0%". Empate exacto tras redondear → "=" y "0%" sin signo.
 *  Sin base comparable (prev ≤ 0) no hay variación que mostrar: "s/d año
 *  pasado" — un +∞% no diría nada útil. */
export function fmtVariacion(cur: number, prev: number, decimales: number): string {
  if (prev <= 0) return "s/d año pasado";
  const txt = (((cur - prev) / prev) * 100).toFixed(decimales);
  const redondeado = Number(txt);
  if (redondeado === 0) return `= ${(0).toFixed(decimales)}%`; // cubre "-0" y "0.0"
  return `${redondeado > 0 ? `▲ +${txt}` : `▼ ${txt}`}%`;
}

/** "viernes 25 jul 2025" — el día comparable del año pasado (−364d). Lleva su
 *  día de la semana justamente para que se vea que es el MISMO día de semana. */
export function fmtDiaPrevLargo(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("es-PA", { weekday: "long", timeZone: "UTC" }).format(d);
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${wd} ${d.getUTCDate()} ${mes} ${d.getUTCFullYear()}`;
}

/** "1 al 24 de julio 2025" — ventana same-period del mes, año anterior.
 *  Mismo recorte 29-feb → 28-feb que ventanasResumen.cortePrev. */
export function fmtRangoMesPrevLargo(corte: string): string {
  const d = new Date(`${corte}T12:00:00Z`);
  const dia = corte.slice(5) === "02-29" ? 28 : d.getUTCDate();
  const mes = new Intl.DateTimeFormat("es-PA", { month: "long", timeZone: "UTC" }).format(d);
  const yPrev = Number(corte.slice(0, 4)) - 1;
  return dia === 1 ? `1 de ${mes} ${yPrev}` : `1 al ${dia} de ${mes} ${yPrev}`;
}

/** "1 ene al 24 jul 2025" — ventana YTD del año anterior (cierre = cortePrev). */
export function fmtRangoAnioPrev(corte: string): string {
  const d = new Date(`${corte}T12:00:00Z`);
  const dia = corte.slice(5) === "02-29" ? 28 : d.getUTCDate();
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  const yPrev = Number(corte.slice(0, 4)) - 1;
  return corte.slice(5) === "01-01" ? `1 ene ${yPrev}` : `1 ene al ${dia} ${mes} ${yPrev}`;
}

/** "3-jul" — sin día de semana, para el aviso "⏳ … (al …)". */
export function fmtDiaCorto(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${d.getUTCDate()}-${mes}`;
}

/** "viernes 10 jul" — día de semana completo, para el título. */
export function fmtDiaTitulo(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("es-PA", { weekday: "long", timeZone: "UTC" }).format(d);
  const mes = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${wd} ${d.getUTCDate()} ${mes}`;
}

const SEPARADOR = "━".repeat(18);
const ANCHO_LABEL = 7; // "Día"/"Mes"/"Año" + relleno hasta la columna del monto

interface FilaResumen {
  label: string;
  monto: number;
  /** columna derecha: la variación (bloque de arriba) o el periodo (abajo). */
  resto: string;
}

/** Arma la tabla en TEXTO PLANO. El monoespaciado se lo pone buildMensajeHtml;
 *  aquí solo se rellena a columnas fijas (padEnd) para que al renderizarse en
 *  monoespaciado los montos y las flechas queden alineados. El ancho de la
 *  columna de montos se calcula sobre TODAS las filas de los dos bloques, para
 *  que la tabla completa comparta una sola rejilla. */
export function buildMensaje(r: AcsResumenDiario, prefijo = ""): string {
  const actual: FilaResumen[] = [];
  const pasado: FilaResumen[] = [];

  // Sin sync fresco el día `fecha` está incompleto: se cae la fila "Día" entera
  // (mostrar $0 · -100% sería un falso negativo — es la guardia anti-ruido).
  if (r.syncFresco) {
    actual.push({ label: "Día", monto: r.hoy, resto: fmtVariacion(r.hoy, r.hoyPrev, 0) });
    if (r.hoyPrev > 0) {
      pasado.push({ label: "Día", monto: r.hoyPrev, resto: fmtDiaPrevLargo(r.fechaComparable) });
    }
  }
  actual.push({ label: "Mes", monto: r.mes, resto: fmtVariacion(r.mes, r.mesPrev, 1) });
  actual.push({ label: "Año", monto: r.anio, resto: fmtVariacion(r.anio, r.anioPrev, 1) });
  if (r.mesPrev > 0) {
    pasado.push({ label: "Mes", monto: r.mesPrev, resto: fmtRangoMesPrevLargo(r.corte) });
  }
  if (r.anioPrev > 0) {
    pasado.push({ label: "Año", monto: r.anioPrev, resto: fmtRangoAnioPrev(r.corte) });
  }

  const anchoMonto =
    Math.max(...[...actual, ...pasado].map((f) => fmtMonto(f.monto).length)) + 2;
  const fila = (f: FilaResumen) =>
    `${f.label.padEnd(ANCHO_LABEL)}${fmtMonto(f.monto).padEnd(anchoMonto)}${f.resto}`.trimEnd();

  const lineas = [`${prefijo}🏪 ACS · ${fmtDiaTitulo(r.fecha)}`, SEPARADOR];
  if (!r.syncFresco) {
    // El "(al D)" conserva el dato que llevaba el viejo label "Mes (al 9-jul)":
    // hasta qué día llegan los acumulados cuando el corte se recorta a D-1.
    lineas.push(`⏳ Ventas del día aún sincronizando (al ${fmtDiaCorto(r.corte)})`);
  }
  lineas.push(...actual.map(fila));
  // Sin ninguna métrica comparable el bloque de abajo sobra, y con él su cierre.
  if (pasado.length > 0) lineas.push(SEPARADOR, "Año pasado", ...pasado.map(fila));
  return lineas.join("\n");
}

/** Escapa lo mínimo que exige el parse_mode HTML de Telegram. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** El mensaje tal cual se manda: `<pre>` para que Telegram lo pinte
 *  monoespaciado y las columnas cuadren también en el móvil. Va SIEMPRE con
 *  `sendTelegramAlert(…, "HTML")` — en texto plano se verían las etiquetas. */
export function buildMensajeHtml(r: AcsResumenDiario, prefijo = ""): string {
  return `<pre>${escapeHtml(buildMensaje(r, prefijo))}</pre>`;
}
