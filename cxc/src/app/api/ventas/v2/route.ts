import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { normalizeName } from "@/lib/normalize";

// ─── Empresa key → display name mapping (ventas_raw uses snake_case keys) ────

const EMPRESA_KEY_TO_NAME: Record<string, string> = {
  vistana: "Vistana International",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  boston: "Confecciones Boston",
  american_classic: "Multifashion",
};

function mapEmpresa<T extends { empresa: string }>(row: T): T {
  return { ...row, empresa: EMPRESA_KEY_TO_NAME[row.empresa] ?? row.empresa };
}

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
  prevSubtotal: number;
  last12mTotal: number;
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
    const key = normalizeName(r.cliente ?? "") || "(Sin nombre)";
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
const CLIENTES_GENERICOS = new Set(["CONTADO", "VENTAS", "(SIN NOMBRE)"]);

function aggregateClientesDetalle(
  filteredRows: VentasRawRow[],
  lastDates: { cliente: string; ultima_fecha: string }[],
  prevRows: VentasRawRow[],
  last12mMap?: Map<string, { total: number; lastDate: string }>,
): ClienteDetalle[] {
  // Build lastFecha map — RPC already returns MAX(fecha) per normalized cliente
  const lastFechaMap = new Map<string, string>();
  for (const r of lastDates) {
    const key = normalizeName(r.cliente ?? "") || "(Sin nombre)";
    if (CLIENTES_INTERNOS.has(key)) continue;
    lastFechaMap.set(key, String(r.ultima_fecha ?? ""));
  }

  // Build prev-year subtotal per client (for inactive KPI calculation)
  const prevSubtotalMap = new Map<string, number>();
  for (const r of prevRows) {
    const key = normalizeName(r.cliente ?? "") || "(Sin nombre)";
    if (CLIENTES_INTERNOS.has(key)) continue;
    prevSubtotalMap.set(key, (prevSubtotalMap.get(key) ?? 0) + (r.subtotal ?? 0));
  }

  // Aggregate subtotal/utilidad from period-filtered rows only
  const map = new Map<string, { subtotal: number; utilidad: number; empresas: Map<string, { subtotal: number; utilidad: number }> }>();
  for (const r of filteredRows) {
    const key = normalizeName(r.cliente ?? "") || "(Sin nombre)";
    if (CLIENTES_INTERNOS.has(key)) continue;
    if (!map.has(key)) map.set(key, { subtotal: 0, utilidad: 0, empresas: new Map() });
    const c = map.get(key)!;
    c.subtotal += r.subtotal ?? 0;
    c.utilidad += r.utilidad ?? 0;
    if (!c.empresas.has(r.empresa)) c.empresas.set(r.empresa, { subtotal: 0, utilidad: 0 });
    const e = c.empresas.get(r.empresa)!;
    e.subtotal += r.subtotal ?? 0;
    e.utilidad += r.utilidad ?? 0;
  }

  // Add clients from lastDates who are NOT in current-year data
  // (they stopped buying — needed for inactive KPI)
  for (const [cliente, lastFecha] of lastFechaMap) {
    if (map.has(cliente)) continue; // already in current year
    if (CLIENTES_GENERICOS.has(cliente)) continue;
    // Add as a zero-sales entry so frontend can see them in inactive list
    map.set(cliente, { subtotal: 0, utilidad: 0, empresas: new Map() });
  }

  return [...map.entries()]
    .map(([cliente, d]) => ({
      cliente,
      subtotal: d.subtotal,
      utilidad: d.utilidad,
      lastFecha: lastFechaMap.get(cliente) || "",
      prevSubtotal: prevSubtotalMap.get(cliente) ?? 0,
      last12mTotal: last12mMap?.get(cliente)?.total ?? 0,
      empresas: [...d.empresas.entries()].map(([empresa, ed]) => ({
        empresa, ...ed, lastFecha: "",
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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director", "contabilidad"]);
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
      .order("fecha", { ascending: true })
      .order("n_sistema", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (filterEmpresa) q = q.eq("empresa", filterEmpresa);
    const { data, error } = await q;
    if (error) { currentErr = error; break; }
    allCurrentRows = allCurrentRows.concat((data ?? []) as VentasRawRow[]);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  const currentRows = allCurrentRows;
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
      .select("empresa, mes, subtotal, utilidad, cliente")
      .eq("anio", año - 1)
      .order("fecha", { ascending: true })
      .order("n_sistema", { ascending: true })
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

  // ── Fetch last 12 months rows for inactive client detection ──────────────
  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  let allLast12Rows: VentasRawRow[] = [];
  let l12Offset = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("ventas_raw")
      .select("empresa, mes, subtotal, utilidad, cliente, tipo, fecha")
      .gte("fecha", twelveMonthsAgo)
      .order("fecha", { ascending: true })
      .order("n_sistema", { ascending: true })
      .range(l12Offset, l12Offset + PAGE - 1);
    if (error) { console.error("[ventas/v2] last12m query error", error.code); break; }
    allLast12Rows = allLast12Rows.concat((data ?? []) as VentasRawRow[]);
    if (!data || data.length < PAGE) break;
    l12Offset += PAGE;
  }
  const last12Rows = allLast12Rows.map(mapEmpresa);

  // Build inactive clients from last 12 months data (NOT from RPC)
  const EMPRESAS_EXCL_INACTIVE = new Set(["Confecciones Boston", "Multifashion"]);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const inactiveMap = new Map<string, { total: number; lastDate: string }>();
  for (const r of last12Rows) {
    if (EMPRESAS_EXCL_INACTIVE.has(r.empresa)) continue;
    const name = normalizeName(r.cliente ?? "") || "(Sin nombre)";
    if (CLIENTES_GENERICOS.has(name)) continue;
    const entry = inactiveMap.get(name) ?? { total: 0, lastDate: "" };
    entry.total += Number(r.subtotal) || 0;
    if ((r.fecha ?? "") > entry.lastDate) entry.lastDate = r.fecha ?? "";
    inactiveMap.set(name, entry);
  }
  // Build lastDates-compatible array from the inactive map (for aggregateClientesDetalle)
  const lastDatesFromRaw = [...inactiveMap.entries()].map(([cliente, d]) => ({
    cliente, ultima_fecha: d.lastDate,
  }));

  // ── Map empresa keys to display names ────────────────────────────────────
  const rows = currentRows.map(mapEmpresa);
  const prev = allPrevRows.map(mapEmpresa);

  // Filter rows for clientesDetalle by optional desde param + exclude internal empresas
  const EMPRESAS_EXCLUIDAS = new Set(["Confecciones Boston", "Multifashion"]);
  const clienteRows = (desdeParam
    ? rows.filter(r => (r.fecha ?? "") >= desdeParam)
    : rows
  ).filter(r => !EMPRESAS_EXCLUIDAS.has(r.empresa));
  const result = {
    byEmpresaMes: aggregateByEmpresaMes(rows),
    topClientes: aggregateTopClientes(rows),
    prevYear: aggregatePrevYear(prev),
    clientesDetalle: aggregateClientesDetalle(clienteRows, lastDatesFromRaw, prev, inactiveMap),
  };
  return NextResponse.json(result);
}
