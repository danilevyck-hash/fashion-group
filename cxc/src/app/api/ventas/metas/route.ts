import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { getVentasMensuales, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const ALL_EMPRESAS = Object.values(EMPRESA_KEY_TO_NAME);

/**
 * Compute monthly distribution weights from 2025 ventas_raw data.
 * For each empresa: weight_m = ventas_mes_m / ventas_total
 * Edge cases:
 *  - Partial data (e.g., only Jul-Dec): missing months get avg weight of months with data
 *  - No data: uniform 1/12
 */
function computeDistribucion(
  ventasData: { empresa: string; mes: number; ventas_netas: number }[]
): Record<string, number[]> {
  const byEmpresa = new Map<string, Map<number, number>>();

  for (const row of ventasData) {
    if (!byEmpresa.has(row.empresa)) byEmpresa.set(row.empresa, new Map());
    const monthMap = byEmpresa.get(row.empresa)!;
    monthMap.set(row.mes, (monthMap.get(row.mes) ?? 0) + row.ventas_netas);
  }

  const result: Record<string, number[]> = {};

  for (const empresa of ALL_EMPRESAS) {
    const monthMap = byEmpresa.get(empresa);

    if (!monthMap || monthMap.size === 0) {
      // No data: uniform distribution
      result[empresa] = Array(12).fill(1 / 12);
      continue;
    }

    const total = [...monthMap.values()].reduce((s, v) => s + v, 0);
    if (total <= 0) {
      result[empresa] = Array(12).fill(1 / 12);
      continue;
    }

    // Compute weights for months with data
    const weights: (number | null)[] = [];
    const monthsWithData: number[] = [];
    let sumWeightsWithData = 0;

    for (let m = 1; m <= 12; m++) {
      const val = monthMap.get(m);
      if (val !== undefined && val > 0) {
        const w = val / total;
        weights.push(w);
        sumWeightsWithData += w;
        monthsWithData.push(m);
      } else {
        weights.push(null);
      }
    }

    // Handle partial data: months without data get avg weight of remaining
    const monthsWithoutData = 12 - monthsWithData.length;
    if (monthsWithoutData > 0 && monthsWithoutData < 12) {
      const remainingWeight = 1 - sumWeightsWithData;
      const avgMissing = remainingWeight / monthsWithoutData;

      // Adjust: redistribute so total = 1
      // Each missing month gets avgMissing
      // But we need to normalize so all 12 sum to 1
      const fillWeight = avgMissing > 0 ? avgMissing : 0;
      const totalAfterFill = sumWeightsWithData + fillWeight * monthsWithoutData;

      result[empresa] = weights.map(w => {
        if (w === null) return fillWeight / totalAfterFill;
        return w / totalAfterFill;
      });
    } else {
      // All 12 months have data
      result[empresa] = weights.map(w => w ?? 0);
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director", "contabilidad"]);
  if (authError) return authError;

  const anio = req.nextUrl.searchParams.get("anio");
  if (!anio) return NextResponse.json({ error: "anio requerido" }, { status: 400 });
  const year = parseInt(anio, 10);
  if (isNaN(year)) return NextResponse.json({ error: "anio inválido" }, { status: 400 });

  // Fetch saved metas (per month) from ventas_metas
  const { data: savedMetas, error } = await supabaseServer
    .from("ventas_metas")
    .select("empresa, mes, meta")
    .eq("anio", year)
    .order("empresa", { ascending: true })
    .order("mes", { ascending: true });

  if (error && error.code !== "42P01") {
    console.error("[ventas/metas GET]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Compute distribution weights from 2025 data
  const ventasData2025 = await getVentasMensuales(2025);
  const distribucion = computeDistribucion(ventasData2025);

  // Aggregate saved metas into annual totals per empresa
  const metasByEmpresa = new Map<string, number>();
  for (const row of savedMetas ?? []) {
    metasByEmpresa.set(row.empresa, (metasByEmpresa.get(row.empresa) ?? 0) + (row.meta ?? 0));
  }

  // Build response: one entry per empresa
  const metas = ALL_EMPRESAS.map(empresa => ({
    empresa,
    meta_anual: metasByEmpresa.get(empresa) ?? 0,
    distribucion: distribucion[empresa] ?? Array(12).fill(1 / 12),
  }));

  return NextResponse.json({ metas });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const body = await req.json();
  const metasInput: { empresa: string; anio: number; meta: number }[] = body.metas;

  if (!Array.isArray(metasInput) || metasInput.length === 0) {
    return NextResponse.json({ error: "Sin datos" }, { status: 400 });
  }

  // For each empresa+anio, distribute the annual meta into 12 months using 2025 weights
  const ventasData2025 = await getVentasMensuales(2025);
  const distribucion = computeDistribucion(ventasData2025);

  const records: { empresa: string; anio: number; mes: number; meta: number }[] = [];

  for (const m of metasInput) {
    if (!m.empresa || !m.anio) {
      return NextResponse.json({ error: "empresa y anio son requeridos" }, { status: 400 });
    }

    const weights = distribucion[m.empresa] ?? Array(12).fill(1 / 12);

    for (let mes = 1; mes <= 12; mes++) {
      records.push({
        empresa: m.empresa,
        anio: m.anio,
        mes,
        meta: Math.round(m.meta * weights[mes - 1] * 100) / 100,
      });
    }
  }

  const { error } = await supabaseServer
    .from("ventas_metas")
    .upsert(records, { onConflict: "empresa,anio,mes" });

  if (error) {
    console.error("[ventas/metas POST]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const empresa = params.get("empresa");
  const anio = params.get("anio");

  if (!empresa || !anio) {
    return NextResponse.json({ error: "empresa y anio son requeridos" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("ventas_metas")
    .delete()
    .eq("empresa", empresa)
    .eq("anio", parseInt(anio, 10));

  if (error) {
    console.error("[ventas/metas DELETE]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
