// ─────────────────────────────────────────────────────────────────────────────
// Resumen MENSUAL del grupo para Telegram (cron grupo-resumen-mensual,
// día 1 de cada mes 13:00 UTC = 08:00 Panamá). Reporta el MES ANTERIOR cerrado:
// total grupo + una línea por empresa (las 8), cada una con % vs el mismo mes
// del año pasado.
//
// SEMÁNTICA = la del tab Resumen de /ventas (paridad POR CONSTRUCCIÓN):
//   - Fuente: RPC ventas_dashboard_summary(p_anio) — la MISMA que alimenta el
//     heatmap empresa×mes del módulo. Meses cerrados salen de
//     ventas_rollup_mensual_mv (rollup de switch_facturas, bucket hora-Panamá).
//   - Métrica: total_subtotal (ventas netas pre-impuesto, NC negativas) — la
//     celda exacta que Daniel ve en /ventas.
//   - Comparativo: mes completo vs mes completo del año anterior (ambos
//     cerrados; el recorte same-period solo aplica al mes EN CURSO, que este
//     resumen nunca reporta).
//
// 🩸 POR QUÉ ERA EL DÍA 3 Y POR QUÉ YA NO (4-sep-2026). Aquí decía «los syncs
// cubren mes en curso + mes anterior durante los días 1-5 UTC
// (mesesCronDiario)» — y ese margen ES DE OTRO SYNC: `mesesCronDiario` vive en
// sync-utilidad.ts y existe para cerrar el hueco del último día de la
// UTILIDAD. Las VENTAS no tardan nada: el sync de facturas de las 23:00 UTC
// (6 p.m. Panamá) y el de las 00:15 UTC cierran el mes esa misma noche.
// Medido sobre los últimos 4 meses cerrados: la última factura de julio entró
// el 31-jul 19:15 UTC y la de agosto el 31-ago 19:15 UTC — CERO facturas de
// esos meses entraron después (marzo y abril salen «tarde» solo por un
// backfill del 29-may, no es el caso normal). Y el rollup se refresca en
// refresh-clientes-views (07:35 UTC) y en cada switch-reconciliacion
// (10/14/18 UTC). Daniel: «sí, lo quiero lo antes posible» → día 1, 13:00 UTC
// (08:00 Panamá), la primera hora con el refresh de las 07:35 ya corrido.
//
// DOS GUARDIAS antes de mandar (adelantar dos días quitó colchón):
//   1. El sync de facturas tiene que haber corrido con status='success' para
//      las 8 empresas DESPUÉS del cierre del mes (switch_sync_log). ⚠️ La
//      señal es la CORRIDA del sync, no la fecha de la última factura: medido,
//      Fashion Wear no facturó después del 28-ago y Active Wear del 27-ago
//      estando perfectamente sanas — eso es negocio, no avería.
//   2. Si el total del grupo da $0, el mes NO está en la MV (refresh caído /
//      sync roto). Un mes real nunca es $0.
// Cualquiera de las dos LANZA ERROR (logCronError → Telegram interno) en vez
// de mandar un número corto; la recuperación de switch-reconciliacion (días
// 1-2) lo reintenta en sus pasadas de 14:00 y 18:00 UTC y al día siguiente.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMonto, fmtPct } from "@/lib/acs-resumen-diario";

// Labels cortos para el mensaje (formato pedido por Daniel: "Vistana: $X · +X%").
const EMPRESA_LABEL: Record<string, string> = {
  vistana: "Vistana",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  confecciones_boston: "Boston",
  american_classic: "Multifashion",
};

export interface GrupoEmpresaMes {
  key: string;
  label: string;
  monto: number;     // total_subtotal del mes reportado
  montoPrev: number; // mismo mes, año anterior
}

export interface GrupoResumenMensual {
  anio: number;
  mes: number; // 1-12 — el mes REPORTADO (anterior al de la corrida)
  total: number;
  totalPrev: number;
  empresas: GrupoEmpresaMes[]; // las 8, en orden canónico
}

/** Mes anterior al de `hoy` (YYYY-MM-DD Panamá) → { anio, mes 1-12 }. */
export function mesAnterior(hoy: string): { anio: number; mes: number } {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

interface SummaryRow {
  empresa: string;
  mes: number;
  total_subtotal: number | string | null;
}

/** total_subtotal por empresa para (anio, mes) vía ventas_dashboard_summary. */
async function ventasDelMes(anio: number, mes: number): Promise<Record<string, number>> {
  const { data, error } = await supabaseServer.rpc("ventas_dashboard_summary", { p_anio: anio });
  if (error) throw new Error(`ventas_dashboard_summary(${anio}): ${error.message}`);
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as SummaryRow[]) {
    if (r.mes !== mes) continue;
    map[r.empresa] = Math.round((Number(r.total_subtotal) || 0) * 100) / 100;
  }
  return map;
}

/** El instante en que TERMINÓ (anio, mes) en Panamá: medianoche del día 1 del
 *  mes siguiente, UTC−5 fijo. */
export function finDeMesPanamaIso(anio: number, mes: number): string {
  const sig = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return new Date(
    `${sig.anio}-${String(sig.mes).padStart(2, "0")}-01T00:00:00-05:00`,
  ).toISOString();
}

/**
 * 🔴 GUARDIA DEL CIERRE (4-sep-2026): qué empresas NO tienen una corrida de
 * `switch-sync tipo/facturas` con status='success' terminada DESPUÉS de que
 * cerró el mes. Con la lista NO vacía, el resumen no sale: mandar un total al
 * que le falta una empresa es mandar un número corto que nadie va a
 * corregir.
 *
 * ⚠️ La señal es la CORRIDA del sync (switch_sync_log), nunca la fecha de la
 * última factura: una empresa puede pasar días sin facturar estando sana
 * (Fashion Wear no facturó después del 28-ago-2026, Active Wear del 27-ago).
 */
export async function empresasSinSyncDeCierre(anio: number, mes: number): Promise<string[]> {
  const fin = finDeMesPanamaIso(anio, mes);
  const faltantes: string[] = [];
  await Promise.all(
    ALL_EMPRESA_KEYS.map(async (key) => {
      const { data, error } = await supabaseServer
        .from("switch_sync_log")
        .select("id")
        .eq("empresa_key", key)
        .eq("sync_type", "facturas")
        .eq("status", "success")
        .gte("finished_at", fin)
        .limit(1);
      if (error) throw new Error(`switch_sync_log(${key}): ${error.message}`);
      if (!data || data.length === 0) faltantes.push(key);
    }),
  );
  return faltantes.sort();
}

export async function calcularResumenMensual(anio: number, mes: number): Promise<GrupoResumenMensual> {
  // Guardia 1: sin el cierre sincronizado de las 8, no hay nada que reportar.
  // Se lanza error (no un mensaje a medias): cae en logCronError y lo
  // reintentan las pasadas de la reconciliación.
  const sinCierre = await empresasSinSyncDeCierre(anio, mes);
  if (sinCierre.length > 0) {
    throw new Error(
      `el sync de facturas no corrió con éxito después del cierre de ${fmtMesLabel(anio, mes)} para: ${sinCierre.join(", ")} — el resumen no sale con un mes a medias`,
    );
  }

  const [cur, prev] = await Promise.all([
    ventasDelMes(anio, mes),
    ventasDelMes(anio - 1, mes),
  ]);

  const empresas: GrupoEmpresaMes[] = ALL_EMPRESA_KEYS.map((key) => ({
    key,
    label: EMPRESA_LABEL[key] ?? key,
    monto: cur[key] ?? 0,
    montoPrev: prev[key] ?? 0,
  }));

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    anio,
    mes,
    total: round2(empresas.reduce((s, e) => s + e.monto, 0)),
    totalPrev: round2(empresas.reduce((s, e) => s + e.montoPrev, 0)),
    empresas,
  };
}

// ── Formato del mensaje ──────────────────────────────────────────────────────
//   📊 Grupo · junio 2026
//   Total: $1,021,483 · +8.3% vs jun-2025
//   Vistana: $212,110 · +12.1%
//   (…las 8)

/** "junio 2026" — mes largo en español. */
export function fmtMesLabel(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, 15));
  const nombre = new Intl.DateTimeFormat("es-PA", { month: "long", timeZone: "UTC" }).format(d);
  return `${nombre} ${anio}`;
}

/** "jun-2025" — mes corto para el label del comparativo. */
export function fmtMesCorto(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, 15));
  const nombre = new Intl.DateTimeFormat("es-PA", { month: "short", timeZone: "UTC" })
    .format(d)
    .replace(".", "");
  return `${nombre}-${anio}`;
}

export function buildMensajeMensual(r: GrupoResumenMensual): string {
  const pctTotal = fmtPct(r.total, r.totalPrev, 1);
  const totalLinea = pctTotal.startsWith("s/d")
    ? `Total: ${fmtMonto(r.total)} · ${pctTotal}`
    : `Total: ${fmtMonto(r.total)} · ${pctTotal} vs ${fmtMesCorto(r.anio - 1, r.mes)}`;
  return [
    `📊 Grupo · ${fmtMesLabel(r.anio, r.mes)}`,
    totalLinea,
    ...r.empresas.map((e) => `${e.label}: ${fmtMonto(e.monto)} · ${fmtPct(e.monto, e.montoPrev, 1)}`),
  ].join("\n");
}
