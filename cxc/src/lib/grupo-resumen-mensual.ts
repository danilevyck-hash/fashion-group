// ─────────────────────────────────────────────────────────────────────────────
// Resumen MENSUAL del grupo para Telegram (cron grupo-resumen-mensual,
// día 3 de cada mes 13:00 UTC = 08:00 Panamá). Reporta el MES ANTERIOR cerrado:
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
// Por qué el DÍA 3: los syncs cubren mes en curso + mes anterior durante los
// días 1-5 UTC (mesesCronDiario, PR #208) y la MV se refresca 06:30 UTC — al
// día 3 a las 13:00 el mes anterior ya está completo y rolleado.
//
// GUARDIA ANTI-RUIDO: si el total del grupo da $0, el mes NO está en la MV
// (refresh caído / sync roto) → se lanza error (logCronError → Telegram
// interno) en vez de mandar un "$0 · -100%" falso. Un mes real nunca es $0.
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

export async function calcularResumenMensual(anio: number, mes: number): Promise<GrupoResumenMensual> {
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
