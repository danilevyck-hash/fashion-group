import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VentasRawRow {
  empresa: string;
  mes: number;
  subtotal: number;
  costo: number;
  utilidad: number;
  cliente: string;
  tipo: string;
}

interface EmpresaMesAgg {
  empresa: string;
  mes: number;
  subtotal: number;
  costo: number;
  utilidad: number;
}

interface ClienteAgg {
  cliente: string;
  subtotal: number;
  utilidad: number;
}

interface PrevYearAgg {
  empresa: string;
  mes: number;
  subtotal: number;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function aggregateByEmpresaMes(rows: VentasRawRow[]): EmpresaMesAgg[] {
  const map = new Map<string, EmpresaMesAgg>();

  for (const r of rows) {
    const key = `${r.empresa}|${r.mes}`;
    const existing = map.get(key);
    if (existing) {
      existing.subtotal += r.subtotal ?? 0;
      existing.costo += r.costo ?? 0;
      existing.utilidad += r.utilidad ?? 0;
    } else {
      map.set(key, {
        empresa: r.empresa,
        mes: r.mes,
        subtotal: r.subtotal ?? 0,
        costo: r.costo ?? 0,
        utilidad: r.utilidad ?? 0,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.mes - b.mes);
}

function aggregateTopClientes(rows: VentasRawRow[], topN = 10): ClienteAgg[] {
  const map = new Map<string, ClienteAgg>();

  for (const r of rows) {
    // Only count Facturas for top clients
    if ((r.tipo ?? "").trim() !== "Factura") continue;
    const key = (r.cliente ?? "").trim() || "(Sin nombre)";
    const existing = map.get(key);
    if (existing) {
      existing.subtotal += r.subtotal ?? 0;
      existing.utilidad += r.utilidad ?? 0;
    } else {
      map.set(key, { cliente: key, subtotal: r.subtotal ?? 0, utilidad: r.utilidad ?? 0 });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.subtotal - a.subtotal)
    .slice(0, topN);
}

function aggregatePrevYear(rows: VentasRawRow[]): PrevYearAgg[] {
  const map = new Map<string, PrevYearAgg>();

  for (const r of rows) {
    const key = `${r.empresa}|${r.mes}`;
    const existing = map.get(key);
    if (existing) {
      existing.subtotal += r.subtotal ?? 0;
    } else {
      map.set(key, { empresa: r.empresa, mes: r.mes, subtotal: r.subtotal ?? 0 });
    }
  }

  return [...map.values()].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.mes - b.mes);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const añoParam = params.get("año");
  const empresaParam = params.get("empresa"); // undefined / "" / "all" = all companies

  if (!añoParam) return NextResponse.json({ error: "año requerido" }, { status: 400 });

  const año = parseInt(añoParam, 10);
  if (isNaN(año)) return NextResponse.json({ error: "año inválido" }, { status: 400 });

  const filterEmpresa = empresaParam && empresaParam !== "all" ? empresaParam : null;

  // ── Fetch current year rows ──────────────────────────────────────────────
  let qCurrent = supabaseServer
    .from("ventas_raw")
    .select("empresa, mes, subtotal, costo, utilidad, cliente, tipo")
    .eq("anio", año);

  if (filterEmpresa) qCurrent = qCurrent.eq("empresa", filterEmpresa);

  const { data: currentRows, error: currentErr } = await qCurrent;
  if (currentErr) {
    console.error("[ventas/v2] current year query error", currentErr);
    return NextResponse.json({ error: currentErr.message }, { status: 500 });
  }

  // ── Fetch previous year rows (subtotal only, for comparison) ─────────────
  let qPrev = supabaseServer
    .from("ventas_raw")
    .select("empresa, mes, subtotal")
    .eq("anio", año - 1);

  if (filterEmpresa) qPrev = qPrev.eq("empresa", filterEmpresa);

  const { data: prevRows, error: prevErr } = await qPrev;
  if (prevErr) {
    console.error("[ventas/v2] prev year query error", prevErr);
    return NextResponse.json({ error: prevErr.message }, { status: 500 });
  }

  // ── Aggregate ────────────────────────────────────────────────────────────
  const rows = (currentRows ?? []) as VentasRawRow[];
  const prev = (prevRows ?? []) as VentasRawRow[];

  return NextResponse.json({
    byEmpresaMes: aggregateByEmpresaMes(rows),
    topClientes: aggregateTopClientes(rows),
    prevYear: aggregatePrevYear(prev),
  });
}
