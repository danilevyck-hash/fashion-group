import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";
import { getVentasMensuales, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

const ALL_EMPRESAS = [...new Set(Object.values(EMPRESA_KEY_TO_NAME))];

/**
 * Compute monthly distribution weights from prior year ventas_raw data.
 * weight_m = ventas_mes_m / ventas_total per empresa.
 * Edge cases: partial data → missing months get avg weight; no data → 1/12.
 */
async function computeDistribucion(priorYear: number): Promise<Record<string, number[]>> {
  const ventasData = await getVentasMensuales(priorYear);

  const byEmpresa = new Map<string, Map<number, number>>();
  for (const row of ventasData) {
    if (!byEmpresa.has(row.empresa)) byEmpresa.set(row.empresa, new Map());
    const mm = byEmpresa.get(row.empresa)!;
    mm.set(row.mes, (mm.get(row.mes) ?? 0) + row.ventas_netas);
  }

  const result: Record<string, number[]> = {};

  for (const empresa of ALL_EMPRESAS) {
    const monthMap = byEmpresa.get(empresa);

    if (!monthMap || monthMap.size === 0) {
      result[empresa] = Array(12).fill(1 / 12);
      continue;
    }

    const total = [...monthMap.values()].reduce((s, v) => s + Math.max(v, 0), 0);
    if (total <= 0) {
      result[empresa] = Array(12).fill(1 / 12);
      continue;
    }

    // Weights for months with data
    const raw: (number | null)[] = [];
    let sumW = 0;
    let countWith = 0;
    for (let m = 1; m <= 12; m++) {
      const val = monthMap.get(m);
      if (val !== undefined && val > 0) {
        const w = val / total;
        raw.push(w);
        sumW += w;
        countWith++;
      } else {
        raw.push(null);
      }
    }

    const countWithout = 12 - countWith;
    if (countWithout > 0 && countWithout < 12) {
      // Fill missing months with equal share of remaining weight
      const fillW = (1 - sumW) / countWithout;
      result[empresa] = raw.map(w => w ?? Math.max(fillW, 0));
    } else {
      result[empresa] = raw.map(w => w ?? 1 / 12);
    }

    // Normalize to sum=1
    const s = result[empresa].reduce((a, b) => a + b, 0);
    if (s > 0) result[empresa] = result[empresa].map(w => w / s);
  }

  return result;
}

// ─── GET: Return metas + distribution ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director", "contabilidad"]);
  if (authError) return authError;

  const anio = req.nextUrl.searchParams.get("anio");
  if (!anio) return NextResponse.json({ error: "anio requerido" }, { status: 400 });
  const year = parseInt(anio, 10);

  // Fetch saved metas (one row per empresa per year — meta = annual target)
  const { data: savedMetas, error } = await supabaseServer
    .from("ventas_metas")
    .select("empresa, meta")
    .eq("anio", year);

  if (error && error.code !== "42P01") {
    console.error("[ventas/metas GET]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Compute distribution weights from prior year
  const distribucion = await computeDistribucion(year - 1);

  // Build map of saved metas
  const savedMap = new Map<string, number>();
  for (const row of savedMetas ?? []) {
    savedMap.set(row.empresa, Number(row.meta) || 0);
  }

  // Build response
  const metas = ALL_EMPRESAS.map(empresa => ({
    empresa,
    meta_anual: savedMap.get(empresa) ?? 0,
    distribucion: distribucion[empresa] ?? Array(12).fill(1 / 12),
  }));

  return NextResponse.json({ metas });
}

// ─── POST: Upsert annual metas ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const session = getSession(req);
  const body = await req.json();
  const metasInput: { empresa: string; anio: number; meta: number }[] = body.metas;

  if (!Array.isArray(metasInput) || metasInput.length === 0) {
    return NextResponse.json({ error: "Sin datos" }, { status: 400 });
  }

  // Validación: meta > 0, año razonable (>= 2020 y <= currentYear + 5)
  const currentYear = new Date().getFullYear();
  for (const m of metasInput) {
    if (typeof m.meta !== "number" || m.meta <= 0) {
      return NextResponse.json(
        { error: `Meta inválida para ${m.empresa}: debe ser > 0` },
        { status: 400 }
      );
    }
    if (typeof m.anio !== "number" || m.anio < 2020 || m.anio > currentYear + 5) {
      return NextResponse.json(
        { error: `Año inválido: ${m.anio} (rango 2020 .. ${currentYear + 5})` },
        { status: 400 }
      );
    }
  }

  // Capturar valores previos para audit log (antes/después por empresa+año)
  const empresasUnicas = [...new Set(metasInput.map(m => m.empresa))];
  const aniosUnicos = [...new Set(metasInput.map(m => m.anio))];
  const { data: previos } = await supabaseServer
    .from("ventas_metas")
    .select("empresa, anio, meta")
    .in("empresa", empresasUnicas)
    .in("anio", aniosUnicos);
  const previosMap = new Map<string, number>();
  for (const p of previos ?? []) {
    previosMap.set(`${p.empresa}|${p.anio}`, Number(p.meta) || 0);
  }

  // Upsert one row per empresa per year (annual meta)
  const records = metasInput.map(m => ({
    empresa: m.empresa,
    anio: m.anio,
    meta: m.meta,
  }));

  const { error } = await supabaseServer
    .from("ventas_metas")
    .upsert(records, { onConflict: "empresa,anio" });

  if (error) {
    console.error("[ventas/metas POST]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log: una entrada por meta cambiada con antes/después
  const cambios = metasInput.map(m => {
    const prev = previosMap.get(`${m.empresa}|${m.anio}`) ?? null;
    return {
      empresa: m.empresa,
      anio: m.anio,
      meta_anterior: prev,
      meta_nueva: m.meta,
      diff: prev != null ? m.meta - prev : null,
    };
  });
  await logActivity(
    session?.role || "unknown",
    "metas_upsert",
    "ventas_metas",
    { cambios },
    session?.userName
  );

  return NextResponse.json({ ok: true, cambios: cambios.length });
}

// ─── DELETE: Remove meta override for (empresa, anio) ────────────────────────
// Elimina el override manual. Con auto-aplicado de sugeridas (RPC
// ventas_proyeccion_cierre_v4) eliminar la fila NO deja la empresa sin
// baseline — el sistema vuelve a usar la meta sugerida automática. Por
// eso ya no bloqueamos cuando hay ventas registradas.
// Se mantiene el audit log para trazabilidad.

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const session = getSession(req);
  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa");
  const anioParam = sp.get("anio");
  const anio = anioParam ? parseInt(anioParam, 10) : null;

  if (!empresa || anio == null || !Number.isFinite(anio)) {
    return NextResponse.json({ error: "empresa y anio requeridos" }, { status: 400 });
  }

  // Capturar valor previo para audit
  const { data: prev } = await supabaseServer
    .from("ventas_metas")
    .select("meta")
    .eq("empresa", empresa)
    .eq("anio", anio)
    .maybeSingle();
  const metaPrev = prev ? Number(prev.meta) || 0 : null;

  const { error } = await supabaseServer
    .from("ventas_metas")
    .delete()
    .eq("empresa", empresa)
    .eq("anio", anio);

  if (error) {
    console.error("[ventas/metas DELETE]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    session?.role || "unknown",
    "metas_delete",
    "ventas_metas",
    { empresa, anio, meta_anterior: metaPrev },
    session?.userName
  );

  return NextResponse.json({ ok: true });
}
