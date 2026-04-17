import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

/**
 * Auto-calculate sales targets using CAGR.
 *
 * Formula per empresa:
 *   CAGR = (last_full_year / first_full_year) ^ (1 / n_years) - 1
 *   group_average_CAGR = average of all positive CAGRs
 *   ceiling = 2 × group_average_CAGR
 *   floor = 0%
 *   suggested_rate = clamp(CAGR, floor, ceiling)
 *   meta_for_month = same_month_prior_year × (1 + suggested_rate)
 *
 * If no prior year data: default rate = 5%.
 *
 * Returns: { empresas: [...], groupAvgCAGR, ceiling }
 * Each empresa: { empresa, cagr, suggestedRate, monthlyMetas: number[12], userRate?: number }
 */

export const dynamic = "force-dynamic";

const DEFAULT_RATE = 0.05;
const PAGE = 1000;

interface YearTotal {
  anio: number;
  total: number;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director", "contabilidad"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const anioParam = params.get("anio");
  if (!anioParam) return NextResponse.json({ error: "anio requerido" }, { status: 400 });
  const targetYear = parseInt(anioParam, 10);
  if (isNaN(targetYear)) return NextResponse.json({ error: "anio inválido" }, { status: 400 });

  // Fetch all yearly totals grouped by empresa and year
  // We need empresa, anio, sum(subtotal) for all years
  let allRows: { empresa: string; anio: number; subtotal: number; mes: number }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("ventas_raw")
      .select("empresa, anio, mes, subtotal")
      .order("fecha", { ascending: true })
      .order("n_sistema", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[metas-auto]", error.code, error.message);
      if (error.code === "42P01") return NextResponse.json({ empresas: [], groupAvgCAGR: 0, ceiling: 0 });
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    allRows = allRows.concat((data ?? []) as typeof allRows);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  // Map empresa keys to display names
  const { mapEmpresaName } = await import("@/lib/empresa-mapping");
  allRows = allRows.map(r => ({ ...r, empresa: mapEmpresaName(r.empresa) }));

  // Get existing user overrides from ventas_metas (annual metas per empresa)
  const { data: userMetas } = await supabaseServer
    .from("ventas_metas")
    .select("empresa, meta")
    .eq("anio", targetYear);

  // Build user metas map: empresa → annual meta
  const userAnnualMap = new Map<string, number>();
  for (const m of userMetas ?? []) {
    if ((m.meta ?? 0) > 0) userAnnualMap.set(m.empresa, m.meta);
  }

  // Compute distribution weights from prior year for distributing annual metas
  const { getVentasMensuales } = await import("@/lib/empresa-mapping");
  const prevVentasData = await getVentasMensuales(targetYear - 1);
  const distWeights = new Map<string, number[]>();
  {
    const byEmp = new Map<string, Map<number, number>>();
    for (const r of prevVentasData) {
      if (!byEmp.has(r.empresa)) byEmp.set(r.empresa, new Map());
      byEmp.get(r.empresa)!.set(r.mes, (byEmp.get(r.empresa)!.get(r.mes) ?? 0) + r.ventas_netas);
    }
    for (const [emp, mm] of byEmp) {
      const total = [...mm.values()].reduce((s, v) => s + Math.max(v, 0), 0);
      if (total <= 0) { distWeights.set(emp, Array(12).fill(1/12)); continue; }
      const w: number[] = [];
      for (let m = 1; m <= 12; m++) w.push(Math.max(mm.get(m) ?? 0, 0) / total);
      const s = w.reduce((a, b) => a + b, 0);
      distWeights.set(emp, s > 0 ? w.map(v => v / s) : Array(12).fill(1/12));
    }
  }

  // Convert annual metas to monthly using distribution weights
  const userMetasMap = new Map<string, Map<number, number>>();
  for (const [empresa, annual] of userAnnualMap) {
    const weights = distWeights.get(empresa) ?? Array(12).fill(1/12);
    const monthMap = new Map<number, number>();
    for (let m = 1; m <= 12; m++) {
      monthMap.set(m, Math.round(annual * weights[m - 1] * 100) / 100);
    }
    userMetasMap.set(empresa, monthMap);
  }

  // Group by empresa
  const empresaData = new Map<string, Map<number, Map<number, number>>>();
  // empresa -> year -> month -> subtotal
  for (const r of allRows) {
    if (!empresaData.has(r.empresa)) empresaData.set(r.empresa, new Map());
    const yearMap = empresaData.get(r.empresa)!;
    if (!yearMap.has(r.anio)) yearMap.set(r.anio, new Map());
    const monthMap = yearMap.get(r.anio)!;
    monthMap.set(r.mes, (monthMap.get(r.mes) ?? 0) + (r.subtotal ?? 0));
  }

  // Determine full years (years before targetYear)
  const allYears = new Set<number>();
  for (const yearMap of empresaData.values()) {
    for (const y of yearMap.keys()) allYears.add(y);
  }
  const sortedYears = [...allYears].filter(y => y < targetYear).sort((a, b) => a - b);

  // Calculate yearly totals per empresa (for CAGR)
  const empresaYearTotals = new Map<string, YearTotal[]>();
  for (const [empresa, yearMap] of empresaData) {
    const totals: YearTotal[] = [];
    for (const y of sortedYears) {
      const monthMap = yearMap.get(y);
      if (!monthMap) continue;
      const total = [...monthMap.values()].reduce((s, v) => s + v, 0);
      if (total > 0) totals.push({ anio: y, total });
    }
    if (totals.length > 0) empresaYearTotals.set(empresa, totals);
  }

  // Calculate CAGR per empresa
  const empresaCAGRs = new Map<string, number>();
  for (const [empresa, totals] of empresaYearTotals) {
    if (totals.length < 2) {
      empresaCAGRs.set(empresa, DEFAULT_RATE);
      continue;
    }
    const first = totals[0];
    const last = totals[totals.length - 1];
    const nYears = last.anio - first.anio;
    if (nYears <= 0 || first.total <= 0) {
      empresaCAGRs.set(empresa, DEFAULT_RATE);
      continue;
    }
    const cagr = Math.pow(last.total / first.total, 1 / nYears) - 1;
    empresaCAGRs.set(empresa, cagr);
  }

  // Group average CAGR (only positive ones)
  const positiveCAGRs = [...empresaCAGRs.values()].filter(c => c > 0);
  const groupAvgCAGR = positiveCAGRs.length > 0
    ? positiveCAGRs.reduce((s, c) => s + c, 0) / positiveCAGRs.length
    : DEFAULT_RATE;
  const ceiling = 2 * groupAvgCAGR;

  // Calculate suggested rate per empresa + monthly metas
  const prevYear = targetYear - 1;
  const result = [];

  const allEmpresas = [...new Set([...empresaData.keys()])].sort();

  for (const empresa of allEmpresas) {
    const rawCagr = empresaCAGRs.get(empresa) ?? DEFAULT_RATE;
    const suggestedRate = Math.min(Math.max(rawCagr, 0), ceiling);

    // Check if user has overrides with non-zero values
    const userOverrides = userMetasMap.get(empresa);
    const hasUserOverrides = userOverrides ? [...userOverrides.values()].some(v => v > 0) : false;

    // Monthly metas: based on same month prior year × (1 + rate)
    const prevYearMonths = empresaData.get(empresa)?.get(prevYear);
    const monthlyMetas: number[] = [];
    const monthlyPrevYear: number[] = [];

    for (let m = 1; m <= 12; m++) {
      const prevMonthVal = prevYearMonths?.get(m) ?? 0;
      monthlyPrevYear.push(prevMonthVal);

      if (hasUserOverrides && userOverrides?.has(m)) {
        monthlyMetas.push(userOverrides.get(m) ?? 0);
      } else {
        monthlyMetas.push(prevMonthVal * (1 + suggestedRate));
      }
    }

    result.push({
      empresa,
      cagr: rawCagr,
      suggestedRate,
      monthlyMetas,
      monthlyPrevYear,
      hasUserOverrides,
    });
  }

  return NextResponse.json({
    empresas: result,
    groupAvgCAGR,
    ceiling,
  });
}
