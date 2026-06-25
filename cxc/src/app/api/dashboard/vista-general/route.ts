import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

// Dashboard ejecutivo consolidado (vista de dueño, solo admin). Reusa las fuentes
// existentes — NO recalcula ventas/margen desde cero:
//   - Ventas + Margen: RPC ventas_dashboard_summary (la MISMA fuente híbrida que
//     usa el módulo Ventas: cerrados=rollup_mv + mes en curso vivo, regla Panamá
//     incluida). Solo este RPC (~0.7s warm); NO se llama la proyección de cierre
//     (lenta) que el resumen completo arrastra y que el dashboard no necesita.
//     Las 8 empresas.
//   - CXC: switch_estadocuenta_aging_mv (6 empresas que tienen CXC).
//   - CXP: switch_proveedor_estadocuenta (6 empresas que tienen CXP).
//   - Cheques: cheques pendientes por vencer (7d).
//   - Reclamos: sin pagar antiguos.
// Cada KPI reporta SOLO las empresas que tienen ese módulo (empresasCount), sin
// inventar data de las que no lo tienen.

// Tramos de aging IDÉNTICOS para CXC y CXP, con los MISMOS cortes de días que el
// módulo /admin: Corriente (0-90) / Vigilancia (91-120) / Vencido (≥121 = "+120
// días", estándar del headline de /admin). CXC lee columnas dXX; CXP lee los
// títulos del aging JSON de switch_proveedor_estadocuenta.
const CXC_CORRIENTE_KEYS = ["d0_30", "d31_60", "d61_90"] as const;
const CXC_VIGILANCIA_KEYS = ["d91_120"] as const;
const CXC_VENCIDO_KEYS = ["d121_180", "d181_270", "d271_365", "mas_365"] as const;
const CXP_CORRIENTE_TITLES = new Set(["0-30", "31-60", "61-90"]);
const CXP_VIGILANCIA_TITLES = new Set(["91-120"]);
const CXP_VENCIDO_TITLES = new Set(["121-180", "181-270", "271-365", "Mas de 365"]);
const RECLAMO_ANTIGUO_DIAS = 30;

function num(x: unknown): number {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : 0;
}

interface AgingRow {
  company_key: string; nombre: string | null; codigo: string | null; total: number | null;
  d0_30: number | null; d31_60: number | null; d61_90: number | null;
  d91_120: number | null; d121_180: number | null; d181_270: number | null; d271_365: number | null; mas_365: number | null;
}
interface CxpRow { empresa_key: string; nombre: string | null; saldo_total: number | null; aging: Array<{ saldo: number; title: string }> | null; }
interface ChequeRow { id: string; cliente: string; empresa: string; monto: number; fecha_deposito: string; }
interface ReclamoRow { id: string; nro_reclamo: string | null; empresa: string | null; estado: string | null; fecha_reclamo: string | null; }
// Fila del RPC ventas_dashboard_summary: por empresa × mes (subtotal/utilidad/costo).
interface SummaryRow { empresa: string; mes: number; total_subtotal: number | string | null; total_utilidad: number | string | null; total_costo: number | string | null; }

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const t0 = Date.now();
  const year = new Date().getFullYear();
  const in7d = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const [summaryRes, agingRes, cxpRes, chequesRes, reclamosRes] = await Promise.all([
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: year }),
    supabaseServer.from("switch_estadocuenta_aging_mv")
      .select("company_key,nombre,codigo,total,d0_30,d31_60,d61_90,d91_120,d121_180,d181_270,d271_365,mas_365"),
    // CXP: TODAS las filas (incl. saldos a favor / negativos) para cuadrar con el
    // grupo_saldo del módulo Proveedores. Antes filtraba saldo_total>0 y excluía 2
    // proveedores con saldo a favor → total no cuadraba con el módulo.
    supabaseServer.from("switch_proveedor_estadocuenta")
      .select("empresa_key,nombre,saldo_total,aging"),
    supabaseServer.from("cheques")
      .select("id,cliente,empresa,monto,fecha_deposito")
      .eq("deleted", false).eq("estado", "pendiente").lte("fecha_deposito", in7d)
      .order("fecha_deposito", { ascending: true }),
    supabaseServer.from("reclamos")
      .select("id,nro_reclamo,empresa,estado,fecha_reclamo")
      .eq("deleted", false).neq("estado", "Pagado")
      .order("fecha_reclamo", { ascending: true }),
  ]);

  // ── VENTAS + MARGEN (8 empresas) ──
  // Series mensuales por empresa desde el RPC; el dashboard solo suma el mes en
  // curso (último mes con data) y el anterior. Misma fuente que el módulo Ventas.
  let ventas = null as null | {
    mes: number; mesAnterior: number; deltaPct: number | null; mesNum: number; parcial: boolean;
    empresasCount: number; byEmpresa: { name: string; ventas: number }[];
  };
  let margen = null as null | { pct: number | null; utilidad: number; empresasCount: number };
  if (!summaryRes.error) {
    const rows = (summaryRes.data as SummaryRow[] | null) ?? [];
    // ventas[empresa][mes] y utilidad[empresa][mes]
    const ventasByEmpMes = new Map<string, Map<number, number>>();
    const utilByMes = new Map<number, number>();
    const ventasByMes = new Map<number, number>();
    let mesActual = 0;
    for (const r of rows) {
      const v = num(r.total_subtotal);
      const u = num(r.total_utilidad);
      if (!ventasByEmpMes.has(r.empresa)) ventasByEmpMes.set(r.empresa, new Map());
      ventasByEmpMes.get(r.empresa)!.set(r.mes, v);
      ventasByMes.set(r.mes, (ventasByMes.get(r.mes) ?? 0) + v);
      utilByMes.set(r.mes, (utilByMes.get(r.mes) ?? 0) + u);
      if (v > 0 && r.mes > mesActual) mesActual = r.mes;
    }
    if (mesActual > 0) {
      const mesTotal = ventasByMes.get(mesActual) ?? 0;
      const prevTotal = ventasByMes.get(mesActual - 1) ?? 0;
      const utilMes = utilByMes.get(mesActual) ?? 0;
      const empresaKeys = [...ventasByEmpMes.keys()];
      const byEmpresa = empresaKeys
        .map((k) => ({ name: EMPRESA_KEY_TO_NAME[k] ?? k, ventas: ventasByEmpMes.get(k)!.get(mesActual) ?? 0 }))
        .filter((e) => e.ventas > 0)
        .sort((a, b) => b.ventas - a.ventas);
      // El mes en curso es PARCIAL (aún no termina) → el % vs mes anterior (mes
      // completo) no es comparable; la UI lo marca y no lo pinta como alarma.
      const parcial = mesActual === new Date().getMonth() + 1;
      ventas = {
        mes: mesTotal,
        mesAnterior: prevTotal,
        deltaPct: prevTotal > 0 ? (mesTotal - prevTotal) / prevTotal : null,
        mesNum: mesActual,
        parcial,
        empresasCount: empresaKeys.length,
        byEmpresa,
      };
      margen = { pct: mesTotal > 0 ? utilMes / mesTotal : null, utilidad: utilMes, empresasCount: empresaKeys.length };
    }
  } else {
    console.error("[vista-general] ventas_dashboard_summary:", summaryRes.error.message);
  }

  // ── CXC (empresas con aging) ── tramos alineados a /admin (vencido = ≥121d).
  const agingRows = (agingRes.data as AgingRow[] | null) ?? [];
  const cxcEmpresas = new Set(agingRows.map((r) => r.company_key));
  let cxcTotal = 0, cxcCorriente = 0, cxcVigilancia = 0, cxcVencido = 0;
  const clientesVencidos: { nombre: string; codigo: string | null; empresa: string; saldo: number }[] = [];
  for (const r of agingRows) {
    cxcTotal += num(r.total);
    cxcCorriente += CXC_CORRIENTE_KEYS.reduce((s, k) => s + num(r[k]), 0);
    cxcVigilancia += CXC_VIGILANCIA_KEYS.reduce((s, k) => s + num(r[k]), 0);
    const venc = CXC_VENCIDO_KEYS.reduce((s, k) => s + num(r[k]), 0);
    cxcVencido += venc;
    if (venc > 0) clientesVencidos.push({ nombre: r.nombre || "—", codigo: r.codigo, empresa: EMPRESA_KEY_TO_NAME[r.company_key] ?? r.company_key, saldo: venc });
  }
  clientesVencidos.sort((a, b) => b.saldo - a.saldo);
  const cxc = {
    total: cxcTotal, corriente: cxcCorriente, vigilancia: cxcVigilancia, vencido: cxcVencido,
    empresasCount: cxcEmpresas.size,
    topClientes: clientesVencidos.slice(0, 6),
  };

  // ── CXP (empresas con proveedores) ── mismos tramos que CXC; total incluye
  // saldos a favor (negativos) → cuadra con grupo_saldo del módulo Proveedores.
  const cxpRows = (cxpRes.data as CxpRow[] | null) ?? [];
  const cxpEmpresas = new Set(cxpRows.map((r) => r.empresa_key));
  let cxpTotal = 0, cxpCorriente = 0, cxpVigilancia = 0, cxpVencido = 0;
  for (const r of cxpRows) {
    cxpTotal += num(r.saldo_total);
    for (const b of r.aging ?? []) {
      if (CXP_CORRIENTE_TITLES.has(b.title)) cxpCorriente += num(b.saldo);
      else if (CXP_VIGILANCIA_TITLES.has(b.title)) cxpVigilancia += num(b.saldo);
      else if (CXP_VENCIDO_TITLES.has(b.title)) cxpVencido += num(b.saldo);
    }
  }
  const cxp = {
    total: cxpTotal, corriente: cxpCorriente, vigilancia: cxpVigilancia, vencido: cxpVencido,
    empresasCount: cxpEmpresas.size,
  };

  // ── Cheques por vencer (7d) ──
  const chequeRows = (chequesRes.data as ChequeRow[] | null) ?? [];
  const cheques = {
    proximos7d: chequeRows.slice(0, 8).map((c) => ({
      id: c.id, cliente: c.cliente, empresa: EMPRESA_KEY_TO_NAME[c.empresa] ?? c.empresa,
      monto: num(c.monto), fecha: c.fecha_deposito,
    })),
    total: chequeRows.reduce((s, c) => s + num(c.monto), 0),
    count: chequeRows.length,
  };

  // ── Reclamos sin pagar antiguos ──
  const reclamoRows = (reclamosRes.data as ReclamoRow[] | null) ?? [];
  const hoy = Date.now();
  const reclamosAntiguos = reclamoRows
    .map((r) => {
      const dias = r.fecha_reclamo ? Math.floor((hoy - new Date(r.fecha_reclamo).getTime()) / 86400_000) : 0;
      return { id: r.id, nro: r.nro_reclamo || "—", empresa: r.empresa || "—", estado: r.estado || "—", dias };
    })
    .filter((r) => r.dias >= RECLAMO_ANTIGUO_DIAS)
    .slice(0, 8);
  const reclamos = { antiguos: reclamosAntiguos, total: reclamoRows.length };

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    ms: Date.now() - t0,
    ventas, margen, cxc, cxp, cheques, reclamos,
  });
}
