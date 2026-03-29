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
  fecha: string;
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

interface ClienteDetalle {
  cliente: string;
  subtotal: number;
  utilidad: number;
  lastFecha: string;
  empresas: { empresa: string; subtotal: number; utilidad: number; lastFecha: string }[];
}

interface PrevYearAgg {
  empresa: string;
  mes: number;
  subtotal: number;
  utilidad: number;
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

const CLIENTES_INTERNOS = new Set(["CONFECCIONES BOSTON", "MULTI FASHION HOLDING", "MULTIFASHION", "BOSTON"]);

function aggregateClientesDetalle(
  filteredRows: VentasRawRow[],
  historicalDates: { cliente: string; empresa: string; fecha: string }[],
): ClienteDetalle[] {
  // Build lastFecha map from historical dates (all time, ordered desc, limited)
  const lastFechaMap = new Map<string, string>();
  const lastFechaEmpMap = new Map<string, string>();
  for (const r of historicalDates) {
    const key = (r.cliente ?? "").trim() || "(Sin nombre)";
    if (CLIENTES_INTERNOS.has(key.toUpperCase())) continue;
    const prev = lastFechaMap.get(key) || "";
    if ((r.fecha ?? "") > prev) lastFechaMap.set(key, r.fecha ?? "");
    const empKey = `${key}|${r.empresa}`;
    const prevE = lastFechaEmpMap.get(empKey) || "";
    if ((r.fecha ?? "") > prevE) lastFechaEmpMap.set(empKey, r.fecha ?? "");
  }

  // Aggregate subtotal/utilidad from period-filtered rows only
  const map = new Map<string, { subtotal: number; utilidad: number; empresas: Map<string, { subtotal: number; utilidad: number }> }>();
  for (const r of filteredRows) {
    const key = (r.cliente ?? "").trim() || "(Sin nombre)";
    if (CLIENTES_INTERNOS.has(key.toUpperCase())) continue;
    if (!map.has(key)) map.set(key, { subtotal: 0, utilidad: 0, empresas: new Map() });
    const c = map.get(key)!;
    c.subtotal += r.subtotal ?? 0;
    c.utilidad += r.utilidad ?? 0;
    if (!c.empresas.has(r.empresa)) c.empresas.set(r.empresa, { subtotal: 0, utilidad: 0 });
    const e = c.empresas.get(r.empresa)!;
    e.subtotal += r.subtotal ?? 0;
    e.utilidad += r.utilidad ?? 0;
  }

  return [...map.entries()]
    .map(([cliente, d]) => ({
      cliente,
      subtotal: d.subtotal,
      utilidad: d.utilidad,
      lastFecha: lastFechaMap.get(cliente) || "",
      empresas: [...d.empresas.entries()].map(([empresa, ed]) => ({
        empresa, ...ed,
        lastFecha: lastFechaEmpMap.get(`${cliente}|${empresa}`) || "",
      })).sort((a, b) => b.subtotal - a.subtotal),
    }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

function aggregatePrevYear(rows: VentasRawRow[]): PrevYearAgg[] {
  const map = new Map<string, PrevYearAgg>();

  for (const r of rows) {
    const key = `${r.empresa}|${r.mes}`;
    const existing = map.get(key);
    if (existing) {
      existing.subtotal += r.subtotal ?? 0;
      existing.utilidad += r.utilidad ?? 0;
    } else {
      map.set(key, { empresa: r.empresa, mes: r.mes, subtotal: r.subtotal ?? 0, utilidad: r.utilidad ?? 0 });
    }
  }

  return [...map.values()].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.mes - b.mes);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const añoParam = params.get("anio");
  const empresaParam = params.get("empresa"); // undefined / "" / "all" = all companies
  const desdeParam = params.get("desde"); // optional: ISO date cutoff for clientesDetalle

  if (!añoParam) return NextResponse.json({ error: "año requerido" }, { status: 400 });

  const año = parseInt(añoParam, 10);
  if (isNaN(año)) return NextResponse.json({ error: "año inválido" }, { status: 400 });

  const filterEmpresa = empresaParam && empresaParam !== "all" ? empresaParam : null;

  // ── Fetch current year rows ──────────────────────────────────────────────
  // Supabase default limit is 1000 rows — paginate in chunks of 1000
  let allCurrentRows: VentasRawRow[] = [];
  let currentErr: { code: string; message: string } | null = null;
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let q = supabaseServer
      .from("ventas_raw")
      .select("empresa, mes, subtotal, costo, utilidad, cliente, tipo, fecha")
      .eq("anio", año)
      .range(offset, offset + PAGE - 1);
    if (filterEmpresa) q = q.eq("empresa", filterEmpresa);
    const { data, error } = await q;
    if (error) { currentErr = error; break; }
    allCurrentRows = allCurrentRows.concat((data ?? []) as VentasRawRow[]);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  const currentRows = allCurrentRows;
  console.log(`[ventas/v2] año=${año} filterEmpresa=${filterEmpresa} desde=${desdeParam} currentRows=${currentRows.length} pages=${Math.ceil(offset/PAGE)+1}`);
  if (currentRows.length > 0) {
    const empresas = [...new Set(currentRows.map(r => r.empresa))];
    console.log(`[ventas/v2] empresas found: ${empresas.join(", ")}`);
  }
  if (currentErr) {
    console.error("[ventas/v2] current year query error", currentErr.code, currentErr.message);
    if (currentErr.code === "42P01") return NextResponse.json({ byEmpresaMes: [], topClientes: [], prevYear: [], clientesDetalle: [] });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // ── Fetch previous year rows (subtotal + utilidad for margin comparison) ──
  let allPrevRows: VentasRawRow[] = [];
  let prevOffset = 0;
  while (true) {
    let q = supabaseServer
      .from("ventas_raw")
      .select("empresa, mes, subtotal, utilidad")
      .eq("anio", año - 1)
      .range(prevOffset, prevOffset + PAGE - 1);
    if (filterEmpresa) q = q.eq("empresa", filterEmpresa);
    const { data, error } = await q;
    if (error) {
      console.error("[ventas/v2] prev year query error", error.code, error.message);
      break;
    }
    allPrevRows = allPrevRows.concat((data ?? []) as VentasRawRow[]);
    if (!data || data.length < PAGE) break;
    prevOffset += PAGE;
  }

  console.log(`[ventas/v2] prevRows=${allPrevRows.length}`);

  // ── Fetch historical last-fecha per client (ordered desc, limited) ──────
  const { data: lastDates } = await supabaseServer
    .from("ventas_raw")
    .select("cliente, empresa, fecha")
    .gte("anio", 2022)
    .order("fecha", { ascending: false })
    .limit(10000);
  console.log(`[ventas/v2] lastDates=${(lastDates ?? []).length}`);

  // ── Aggregate ────────────────────────────────────────────────────────────
  const rows = currentRows;
  const prev = allPrevRows;

  // Filter rows for clientesDetalle by optional desde param
  const clienteRows = desdeParam
    ? rows.filter(r => (r.fecha ?? "") >= desdeParam)
    : rows;
  console.log(`[ventas/v2] clienteRows=${clienteRows.length} (desde=${desdeParam})`);

  const result = {
    byEmpresaMes: aggregateByEmpresaMes(rows),
    topClientes: aggregateTopClientes(rows),
    prevYear: aggregatePrevYear(prev),
    clientesDetalle: aggregateClientesDetalle(clienteRows, lastDates ?? []),
  };
  console.log(`[ventas/v2] response: byEmpresaMes=${result.byEmpresaMes.length} topClientes=${result.topClientes.length} prevYear=${result.prevYear.length} clientesDetalle=${result.clientesDetalle.length}`);
  return NextResponse.json(result);
}
