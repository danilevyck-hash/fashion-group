// Server-side data fetchers for the Ventas module.
//
// Conventions:
//   - All money values are USD numbers (not strings, not cents).
//   - Months are 1-indexed in params, 0-indexed in return arrays
//     (mes=4 → arr index 3 = Apr).
//   - Null in a monthly array means "no data yet" (future month).

import { supabaseServer } from "@/lib/supabase-server";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
  EMPRESA_KEY_TO_VENTAS_ID,
  type VentasEmpresaId,
} from "@/lib/empresa-mapping";
import { fmtDate } from "@/lib/format";
import type {
  VentasResumen,
  Clientes,
  Multifashion,
  Empresa,
  EmpresaMonthlySales,
  MonthlySeries,
} from "@/components/ventas/types";

interface DashboardSummaryRow {
  empresa: string;
  mes: number;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  total_facturado: number | string;
  filas: number;
}

const RETAIL_KEYS = new Set(["american_classic"]);

function toNum(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function buildEmpresa(key: string): Empresa {
  const ventasId = EMPRESA_KEY_TO_VENTAS_ID[key] ?? key;
  return {
    id: ventasId as VentasEmpresaId,
    nombre: EMPRESA_KEY_TO_NAME[key] ?? key,
    tipo: RETAIL_KEYS.has(key) ? "retail" : "b2b",
  };
}

/**
 * Resumen tab — KPIs + 8×12 monthly matrix vs prior year.
 *
 * Reusa el RPC ventas_dashboard_summary (year y year-1 en paralelo) y
 * construye el shape VentasResumen mapeando empresa key → ventas_id.
 */
export async function fetchVentasResumen({ year }: { year: number }): Promise<VentasResumen> {
  const [curRes, prevRes, metaRes] = await Promise.all([
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: year }),
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: year - 1 }),
    supabaseServer.rpc("get_app_setting", { p_key: "multifashion_meta_anual_2026" }),
  ]);

  if (curRes.error) throw new Error(`ventas_dashboard_summary(${year}): ${curRes.error.message}`);
  if (prevRes.error) throw new Error(`ventas_dashboard_summary(${year - 1}): ${prevRes.error.message}`);

  const cur = (curRes.data as DashboardSummaryRow[] | null) ?? [];
  const prev = (prevRes.data as DashboardSummaryRow[] | null) ?? [];

  const metaAnualMultifashion = Number(metaRes.data ?? 800000) || 800000;

  // Build lookup: { [key]: number[12] }
  const buildSeries = (rows: DashboardSummaryRow[], field: "total_subtotal" | "total_utilidad" | "total_costo") => {
    const map: Record<string, MonthlySeries> = {};
    for (const k of ALL_EMPRESA_KEYS) map[k] = Array(12).fill(null);
    for (const r of rows) {
      if (!ALL_EMPRESA_KEYS.includes(r.empresa as (typeof ALL_EMPRESA_KEYS)[number])) continue;
      if (r.mes < 1 || r.mes > 12) continue;
      map[r.empresa][r.mes - 1] = toNum(r[field]);
    }
    return map;
  };

  // Series mensuales por empresa para subtotal, utilidad, costo (cur + prev)
  const cur26      = buildSeries(cur,  "total_subtotal");
  const cur26Util  = buildSeries(cur,  "total_utilidad");
  const cur26Costo = buildSeries(cur,  "total_costo");
  const prev25     = buildSeries(prev, "total_subtotal");
  const prev25Util = buildSeries(prev, "total_utilidad");
  const prev25Costo = buildSeries(prev, "total_costo");

  // mesActual: último mes con data en el año en curso (cualquier empresa)
  let mesActual = 0;
  for (const k of ALL_EMPRESA_KEYS) {
    for (let i = 0; i < 12; i++) {
      if (cur26[k][i] != null && i + 1 > mesActual) mesActual = i + 1;
    }
  }

  // Aprox. fila-FILTER WHERE costo > 0 a nivel empresa-mes:
  // si una empresa tuvo costo > 0 en el mes m, ese mes contribuye al margen.
  // Excluye empresa-mes donde sólo hay ajustes contables (notas de débito
  // sin costo asociado), que distorsionarían el ratio.
  const sumFiltered = (
    vals: MonthlySeries,
    costo: MonthlySeries,
    upTo: number = 12
  ): number => {
    let s = 0;
    const limit = Math.min(upTo, vals.length);
    for (let i = 0; i < limit; i++) {
      const c = costo[i];
      if (c != null && c > 0) s += vals[i] ?? 0;
    }
    return s;
  };

  const sumYTD = (a: MonthlySeries) => a.reduce<number>((s, v) => s + (v ?? 0), 0);
  const sumSlice = (a: MonthlySeries, n: number) =>
    a.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

  // Slice para comparar mismo período (Ene..mesActual). Año cerrado ⇒ mesActual=12.
  const upTo = Math.max(mesActual, 1);

  // Empresa-level: margen real (filtered) — current year y prev year
  const empresas: EmpresaMonthlySales[] = ALL_EMPRESA_KEYS.map(key => {
    const ventas       = cur26[key];
    const utilidad     = cur26Util[key];
    const costo        = cur26Costo[key];
    const ventasPrev   = prev25[key];
    const utilidadPrev = prev25Util[key];
    const costoPrev    = prev25Costo[key];
    const filteredVCur  = sumFiltered(ventas,     costo);
    const filteredUCur  = sumFiltered(utilidad,   costo);
    const filteredVPrev = sumFiltered(ventasPrev, costoPrev, upTo);
    const filteredUPrev = sumFiltered(utilidadPrev, costoPrev, upTo);
    const margenPct     = filteredVCur  > 0 ? filteredUCur  / filteredVCur  : 0;
    const margenPctPrev = filteredVPrev > 0 ? filteredUPrev / filteredVPrev : 0;
    return {
      empresa: buildEmpresa(key),
      ventas2026:   ventas,
      ventas2025:   ventasPrev,
      utilidad2026: utilidad,
      utilidad2025: utilidadPrev,
      margenPct,
      margenPctPrev,
    };
  });

  // Totales absolutos — sin filtro (utilidad real incluye ajustes)
  const ventasNetasYTD  = empresas.reduce((s, e) => s + sumYTD(e.ventas2026), 0);
  const ventas2025YTD   = empresas.reduce((s, e) => s + sumSlice(e.ventas2025, upTo), 0);
  const utilidadYTD     = empresas.reduce((s, e) => s + sumYTD(e.utilidad2026), 0);
  const utilidad2025YTD = empresas.reduce((s, e) => s + sumSlice(e.utilidad2025, upTo), 0);

  // Margen del grupo — filtered (excluye empresa-mes con costo=0)
  let totalFilteredUtilCur = 0, totalFilteredVCur = 0;
  let totalFilteredUtilPrev = 0, totalFilteredVPrev = 0;
  for (const k of ALL_EMPRESA_KEYS) {
    totalFilteredUtilCur  += sumFiltered(cur26Util[k],  cur26Costo[k]);
    totalFilteredVCur     += sumFiltered(cur26[k],      cur26Costo[k]);
    totalFilteredUtilPrev += sumFiltered(prev25Util[k], prev25Costo[k], upTo);
    totalFilteredVPrev    += sumFiltered(prev25[k],     prev25Costo[k], upTo);
  }
  const margenYTD     = totalFilteredVCur  > 0 ? totalFilteredUtilCur  / totalFilteredVCur  : 0;
  const margen2025YTD = totalFilteredVPrev > 0 ? totalFilteredUtilPrev / totalFilteredVPrev : 0;

  const multiRow = empresas.find(e => e.empresa.id === "multi");
  const multifashionYTD = multiRow ? sumYTD(multiRow.ventas2026) : 0;

  return {
    year,
    mesActual,
    kpis: {
      ventasNetasYTD,
      ventas2025YTD,
      utilidadYTD,
      utilidad2025YTD,
      margenYTD,
      margen2025YTD,
      multifashionYTD,
      metaAnualMultifashion,
    },
    empresas,
  };
}

interface ClientesEmpresaRow {
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_codigo: string | null;
  empresa: string | null;
  compras_ytd: number | string;
  compras_anio_anterior: number | string;
  delta_vs_2025: number | string | null;
  ultima_compra: string | null;
  whatsapp: string | null;
  /** Sólo presente en clientes_agregado_12m_vw (modo Todas) */
  empresas_count?: number | string | null;
}

/**
 * Clientes tab — clientes activos en últimos 12 meses (rolling).
 *
 * Ramas:
 *   - empresaKey null/'todas': lee de clientes_agregado_12m_vw — agregado
 *     por cliente con window functions, una fila por cliente único, badge
 *     +N visible cuando empresas_count > 1.
 *   - empresaKey específica (vistana, fashion_wear, ...): lee de
 *     clientes_empresa_12m_vw filtrando por empresa — una fila por par
 *     (cliente, empresa). Cada cliente que compra a esta empresa aparece,
 *     incluso si también compra a otras (sin badge en este modo).
 *
 * Orden default: ultima_compra DESC NULLS LAST.
 */
export async function fetchClientes({
  year: _year,
  empresaKey,
}: {
  year: number;
  empresaKey?: string | null;
}): Promise<Clientes> {
  void _year;

  const isTodas = !empresaKey || empresaKey === "todas";

  const query = isTodas
    ? supabaseServer
        .from("clientes_agregado_12m_vw")
        .select("*")
        .order("ultima_compra", { ascending: false, nullsFirst: false })
        .limit(5000)
    : supabaseServer
        .from("clientes_empresa_12m_vw")
        .select("*")
        .eq("empresa", empresaKey)
        .order("ultima_compra", { ascending: false, nullsFirst: false })
        .limit(5000);

  const { data, error } = await query;
  if (error) {
    const view = isTodas ? "clientes_agregado_12m_vw" : `clientes_empresa_12m_vw(${empresaKey})`;
    throw new Error(`${view}: ${error.message}`);
  }

  const rows = ((data as ClientesEmpresaRow[] | null) ?? []).map((r, i) => {
    const ek = r.empresa ?? "";
    return {
      rank: i + 1,
      id: r.cliente_codigo ?? "—",
      nombre: r.cliente_nombre ?? "(Sin nombre)",
      empresa: EMPRESA_KEY_TO_NAME[ek] ?? ek ?? "—",
      empresaKey: ek,
      ytd: toNum(r.compras_ytd),
      delta: r.delta_vs_2025 == null ? 0 : toNum(r.delta_vs_2025),
      ultima: r.ultima_compra ? fmtDate(r.ultima_compra) : "",
      ultimaIso: r.ultima_compra ?? "",
      wa: r.whatsapp ? normalizeWa(r.whatsapp) : "",
      empresas_count: isTodas ? Math.max(1, toNum(r.empresas_count)) : 1,
    };
  });

  return {
    total: rows.length,
    pageSize: rows.length,
    rows,
  };
}

/** "+507 6000-1111" / "60001111" / "507-6000-1111" → "+50760001111" */
function normalizeWa(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("507")) return "+" + digits;
  if (digits.length === 8) return "+507" + digits;
  return "+" + digits;
}

/**
 * Años con data en ventas_raw — alimenta el dropdown del tab Resumen.
 * Devuelve siempre al menos el año actual, ordenado descendente.
 */
export async function fetchAvailableYears(): Promise<number[]> {
  const [minRes, maxRes] = await Promise.all([
    supabaseServer.from("ventas_raw").select("anio").order("anio", { ascending: true }).limit(1),
    supabaseServer.from("ventas_raw").select("anio").order("anio", { ascending: false }).limit(1),
  ]);
  const minYear = (minRes.data?.[0]?.anio as number | undefined) ?? null;
  const maxYear = (maxRes.data?.[0]?.anio as number | undefined) ?? null;
  const years = new Set<number>();
  if (minYear && maxYear) {
    for (let y = minYear; y <= maxYear; y++) years.add(y);
  }
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

/**
 * Multifashion tab — single retail store snapshot.
 * Llama al RPC multifashion_mensual que retorna jsonb con todo el shape listo.
 */
export async function fetchMultifashion({
  year,
  mes,
}: {
  year: number;
  mes: number;
}): Promise<Multifashion> {
  const { data, error } = await supabaseServer.rpc("multifashion_mensual", {
    p_year: year,
    p_mes: mes,
  });
  if (error) throw new Error(`multifashion_mensual: ${error.message}`);

  // El RPC ya devuelve el shape exacto Multifashion (jsonb).
  return data as Multifashion;
}
