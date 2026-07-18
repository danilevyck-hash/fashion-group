import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  prorratearGrupo,
  estadoSemaforo,
  puntoEquilibrio,
} from "@/lib/vista-general-calc";

export const dynamic = "force-dynamic";

// Dashboard ejecutivo consolidado (vista de dueño, solo admin). Reusa las fuentes
// existentes — NO recalcula ventas/margen desde cero:
//   - Ventas + Margen: RPC ventas_dashboard_summary (la MISMA fuente híbrida que
//     usa el módulo Ventas: cerrados=rollup_mv + mes en curso vivo, regla Panamá
//     incluida). Solo este RPC (~0.7s warm); NO se llama la proyección de cierre
//     (lenta) que el resumen completo arrastra y que el dashboard no necesita.
//     Las 8 empresas.
//   - CXC: switch_estadocuenta_aging (vista base LIVE, la MISMA que /admin — no la
//     MV diaria, para cuadrar al centavo con /admin). 6 empresas. Vencido = ≥91d.
//   - CXP: switch_proveedor_estadocuenta (6 empresas que tienen CXP). Vencido = ≥91d.
//   - Reclamos: sin pagar antiguos.
//   - Gastos / Rentabilidad / Equilibrio / Disponibilidad / Semáforo (v2):
//     empresa_gastos_mensuales + gastos_categorias + bancos_saldos, con
//     ?mes=YYYY-MM seleccionable (default = mes actual Panamá, futuros se
//     ajustan al actual). Los gastos 'grupo' se prorratean por % de ventas del
//     mes (cent-exact, ver src/lib/vista-general-calc.ts).
// Cada KPI reporta SOLO las empresas que tienen ese módulo (empresasCount), sin
// inventar data de las que no lo tienen.

// Tramos de aging IDÉNTICOS para CXC y CXP. Partición LIMPIA en 2 que suma al
// total: Corriente (0-90) + Vencido (≥91 = "+90 días") = Total. La columna
// "91-120" (Vigilancia) es un SUBCONJUNTO de Vencido que se muestra como DETALLE
// (no se suma aparte → no hay doble conteo). CXC lee columnas dXX; CXP lee los
// títulos del aging JSON de switch_proveedor_estadocuenta.
const CXC_CORRIENTE_KEYS = ["d0_30", "d31_60", "d61_90"] as const;
const CXC_VIGILANCIA_KEYS = ["d91_120"] as const; // 91-120, detalle (⊂ vencido)
const CXC_VENCIDO_KEYS = ["d91_120", "d121_180", "d181_270", "d271_365", "mas_365"] as const; // ≥91
const CXP_CORRIENTE_TITLES = new Set(["0-30", "31-60", "61-90"]);
const CXP_VIGILANCIA_TITLES = new Set(["91-120"]); // detalle (⊂ vencido)
const CXP_VENCIDO_TITLES = new Set(["91-120", "121-180", "181-270", "271-365", "Mas de 365"]); // ≥91
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
interface ReclamoRow { id: string; nro_reclamo: string | null; empresa: string | null; estado: string | null; fecha_reclamo: string | null; }
// Fila del RPC ventas_dashboard_summary: por empresa × mes (subtotal/utilidad/costo).
interface SummaryRow { empresa: string; mes: number; total_subtotal: number | string | null; total_utilidad: number | string | null; total_costo: number | string | null; }
// Fila de ventas_rollup_mensual_mv (año anterior, para YoY y fallback de rentabilidad).
interface MvRow { empresa_key: string; mes_num: number; ventas_netas: number | string | null; utilidad: number | string | null; }
interface GastoRow { id: string; empresa_key: string; mes: string; categoria_id: string; monto: number | string | null; }
interface CategoriaRow { id: string; es_fijo: boolean; }
interface BancoRow { empresa_key: string; saldo: number | string | null; fecha_dato: string; }

// ── Helpers de aritmética de meses (bucket "YYYY-MM") ──
function mesKeyStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const t0 = Date.now();

  // ── Mes seleccionado (?mes=YYYY-MM) ──
  // Default = mes actual en hora Panamá. Meses FUTUROS no tienen data → se
  // ajustan (clamp) al mes actual en vez de responder vacío.
  const mesActualPanama = hoyPanama().slice(0, 7);
  const mesParam = req.nextUrl.searchParams.get("mes");
  let mesSelStr = mesActualPanama;
  if (mesParam !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam)) {
      return NextResponse.json(
        { error: "Mes inválido. Usa el formato YYYY-MM." },
        { status: 400 }
      );
    }
    mesSelStr = mesParam > mesActualPanama ? mesActualPanama : mesParam;
  }
  const anioSel = parseInt(mesSelStr.slice(0, 4), 10);
  const mesSelNum = parseInt(mesSelStr.slice(5, 7), 10);

  // Ventana de gastos: 12 meses terminando en el mes seleccionado (cubre el mes
  // pedido + la búsqueda del último mes "completo" para el fallback de
  // rentabilidad). empresa_gastos_mensuales.mes siempre es día 1.
  const winStart = addMonths(anioSel, mesSelNum, -11);
  const gastosDesde = `${mesKeyStr(winStart.y, winStart.m)}-01`;
  const gastosHasta = `${mesSelStr}-01`;

  const [summaryRes, agingRes, cxpRes, reclamosRes, mvPrevRes, gastosRes, categoriasRes, bancosRes] = await Promise.all([
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: anioSel }),
    // CXC: vista base LIVE (igual que el módulo /admin), NO la MV diaria. La MV
    // (switch_estadocuenta_aging_mv) refresca 1×/día (06:30 UTC) y queda atrás de
    // los re-syncs de la reconciliación → divergía con /admin intradía. Leer la
    // misma vista base garantiza Δ=0.00 con /admin siempre.
    supabaseServer.from("switch_estadocuenta_aging")
      .select("company_key,nombre,codigo,total,d0_30,d31_60,d61_90,d91_120,d121_180,d181_270,d271_365,mas_365"),
    // CXP: TODAS las filas (incl. saldos a favor / negativos) para cuadrar con el
    // grupo_saldo del módulo Proveedores. Antes filtraba saldo_total>0 y excluía 2
    // proveedores con saldo a favor → total no cuadraba con el módulo.
    supabaseServer.from("switch_proveedor_estadocuenta")
      .select("empresa_key,nombre,saldo_total,aging"),
    supabaseServer.from("reclamos")
      .select("id,nro_reclamo,empresa,estado,fecha_reclamo")
      .eq("deleted", false).neq("estado", "Pagado")
      .order("fecha_reclamo", { ascending: true }),
    // Año ANTERIOR completo desde la MV: YoY del mes seleccionado + fuente de
    // ventas/utilidad cuando el fallback de rentabilidad cae en anioSel-1.
    supabaseServer.from("ventas_rollup_mensual_mv")
      .select("empresa_key,mes_num,ventas_netas,utilidad")
      .eq("anio", anioSel - 1),
    // Gastos vivos de la ventana de 12 meses (mes seleccionado + fallback).
    supabaseServer.from("empresa_gastos_mensuales")
      .select("id,empresa_key,mes,categoria_id,monto")
      .is("anulado_en", null)
      .gte("mes", gastosDesde)
      .lte("mes", gastosHasta),
    // TODAS las categorías (incl. inactivas: filas viejas pueden referenciar
    // categorías ya desactivadas y su es_fijo sigue contando).
    supabaseServer.from("gastos_categorias").select("id,es_fijo"),
    // Saldos bancarios: orden fecha_dato DESC → el primero por empresa es el
    // más reciente.
    supabaseServer.from("bancos_saldos")
      .select("empresa_key,saldo,fecha_dato")
      .order("fecha_dato", { ascending: false }),
  ]);

  // ── VENTAS + MARGEN del MES SELECCIONADO (8 empresas) ──
  // Misma fuente híbrida que el módulo Ventas (RPC = MV cerrados + mes en curso
  // vivo). YoY contra el mismo mes del año anterior (MV).
  const summaryRows = (summaryRes.data as SummaryRow[] | null) ?? [];
  const mvPrevRows = (mvPrevRes.data as MvRow[] | null) ?? [];
  if (summaryRes.error) console.error("[vista-general] ventas_dashboard_summary:", summaryRes.error.message);
  if (mvPrevRes.error) console.error("[vista-general] ventas_rollup_mensual_mv:", mvPrevRes.error.message);

  // Ventas/utilidad POR EMPRESA de un mes dado: si el mes cae en el año
  // seleccionado se lee del RPC; si cae en el año anterior, de la MV. null si
  // ninguna fuente tiene filas de ese mes (mes sin data → el fallback de
  // rentabilidad lo trata como "no encontrado").
  const ventasDelMes = (y: number, m: number): Map<string, { ventas: number; utilidad: number }> | null => {
    let src: { key: string; v: number; u: number }[] = [];
    if (y === anioSel) {
      src = summaryRows.filter((r) => r.mes === m)
        .map((r) => ({ key: r.empresa, v: num(r.total_subtotal), u: num(r.total_utilidad) }));
    } else if (y === anioSel - 1) {
      src = mvPrevRows.filter((r) => r.mes_num === m)
        .map((r) => ({ key: r.empresa_key, v: num(r.ventas_netas), u: num(r.utilidad) }));
    }
    if (src.length === 0) return null;
    const map = new Map<string, { ventas: number; utilidad: number }>();
    for (const s of src) {
      const cur = map.get(s.key) ?? { ventas: 0, utilidad: 0 };
      cur.ventas += s.v;
      cur.utilidad += s.u;
      map.set(s.key, cur);
    }
    return map;
  };

  const ventasSelMap = ventasDelMes(anioSel, mesSelNum) ?? new Map<string, { ventas: number; utilidad: number }>();
  // Las 8 empresas SIEMPRE (0 si el mes no tiene filas de esa empresa), DESC por ventas.
  const byEmpresa = ALL_EMPRESA_KEYS
    .map((k) => ({
      key: k as string,
      name: EMPRESA_KEY_TO_NAME[k] ?? k,
      ventas: ventasSelMap.get(k)?.ventas ?? 0,
      utilidad: ventasSelMap.get(k)?.utilidad ?? 0,
    }))
    .sort((a, b) => b.ventas - a.ventas);
  const ventasTotal = byEmpresa.reduce((s, e) => s + e.ventas, 0);
  const utilidadTotal = byEmpresa.reduce((s, e) => s + e.utilidad, 0);
  // El mes ACTUAL es PARCIAL (aún no termina) → el YoY no es comparable 1:1;
  // la UI lo marca y no lo pinta como alarma.
  const parcialSel = mesSelStr === mesActualPanama;
  const prevRowsMes = mvPrevRows.filter((r) => r.mes_num === mesSelNum);
  const prevYear = prevRowsMes.length > 0
    ? prevRowsMes.reduce((s, r) => s + num(r.ventas_netas), 0)
    : null;

  let ventas = null as null | {
    total: number; prevYear: number | null; yoyPct: number | null; parcial: boolean;
    empresasCount: number; byEmpresa: { key: string; name: string; ventas: number; utilidad: number }[];
  };
  let margen = null as null | { pct: number | null; utilidad: number };
  if (!summaryRes.error) {
    ventas = {
      total: ventasTotal,
      prevYear,
      yoyPct: prevYear !== null && prevYear > 0 ? (ventasTotal - prevYear) / prevYear : null,
      parcial: parcialSel,
      empresasCount: byEmpresa.length,
      byEmpresa,
    };
    margen = { pct: ventasTotal > 0 ? utilidadTotal / ventasTotal : null, utilidad: utilidadTotal };
  }

  // ── GASTOS del mes seleccionado ──
  const gastoRows = (gastosRes.data as GastoRow[] | null) ?? [];
  const categoriaRows = (categoriasRes.data as CategoriaRow[] | null) ?? [];
  if (gastosRes.error) console.error("[vista-general] empresa_gastos_mensuales:", gastosRes.error.message);
  if (categoriasRes.error) console.error("[vista-general] gastos_categorias:", categoriasRes.error.message);
  const esFijoById = new Map(categoriaRows.map((c) => [c.id, c.es_fijo]));

  // Filas de gastos agrupadas por mes "YYYY-MM" (toda la ventana de 12 meses).
  const gastosPorMes = new Map<string, GastoRow[]>();
  for (const g of gastoRows) {
    const k = (g.mes ?? "").slice(0, 7);
    const arr = gastosPorMes.get(k);
    if (arr) arr.push(g);
    else gastosPorMes.set(k, [g]);
  }

  // Resumen de gastos de un mes: directos por empresa, total 'grupo', total del
  // mes (incl. grupo), fijos (incl. grupo — alimentan el punto de equilibrio) y
  // set de empresas reales con ≥1 gasto cargado.
  const resumenGastosMes = (k: string) => {
    const rows = gastosPorMes.get(k) ?? [];
    const directosPorEmpresa = new Map<string, number>();
    const empresasConGastos = new Set<string>();
    let grupoTotal = 0, totalMes = 0, gastosFijos = 0;
    for (const g of rows) {
      const monto = num(g.monto);
      totalMes += monto;
      if (esFijoById.get(g.categoria_id)) gastosFijos += monto;
      if (g.empresa_key === "grupo") {
        grupoTotal += monto;
      } else {
        directosPorEmpresa.set(g.empresa_key, (directosPorEmpresa.get(g.empresa_key) ?? 0) + monto);
        empresasConGastos.add(g.empresa_key);
      }
    }
    return { directosPorEmpresa, empresasConGastos, grupoTotal, totalMes, gastosFijos };
  };

  const gastosSel = resumenGastosMes(mesSelStr);
  // Prorrateo del gasto 'grupo' por % de ventas del mes seleccionado
  // (cent-exact: las partes suman grupoTotal EXACTO, ver vista-general-calc).
  const prorrateoSel = prorratearGrupo(
    gastosSel.grupoTotal,
    byEmpresa.map((e) => ({ key: e.key, ventas: e.ventas }))
  );
  const gastos = {
    totalMes: gastosSel.totalMes,
    gastosFijos: gastosSel.gastosFijos,
    grupoTotal: gastosSel.grupoTotal,
    empresasConGastos: [...gastosSel.empresasConGastos],
  };

  // ── RENTABILIDAD (utilidad − gastos) con FALLBACK al último mes completo ──
  // Un mes está "completo" cuando las 8 empresas cargaron ≥1 gasto. Si el mes
  // seleccionado no está completo, se retrocede (hasta 11 meses) al último mes
  // completo y se recalcula ESE mes: utilidad del RPC si cae en el año
  // seleccionado, de la MV si cae en el año anterior; si ninguna fuente tiene
  // ese mes se sigue buscando. Sin mes completo con data → null (la UI muestra
  // "sin datos suficientes"). Nota: el prorrateo del gasto 'grupo' no altera el
  // TOTAL del mes (las partes suman grupoTotal exacto), así que para el KPI
  // consolidado basta restar totalMes.
  const mesCompleto = (k: string): boolean => {
    const rows = gastosPorMes.get(k);
    if (!rows) return false;
    const empresas = new Set(rows.filter((g) => g.empresa_key !== "grupo").map((g) => g.empresa_key));
    return ALL_EMPRESA_KEYS.every((e) => empresas.has(e));
  };

  let rentabilidad = null as null | {
    mes: string; monto: number; pct: number | null; parcial: boolean; esMesSeleccionado: boolean;
  };
  for (let back = 0; back < 12; back++) {
    const { y, m } = addMonths(anioSel, mesSelNum, -back);
    const k = mesKeyStr(y, m);
    if (!mesCompleto(k)) continue;
    const vMap = ventasDelMes(y, m);
    if (!vMap) continue; // gastos completos pero sin fuente de ventas → seguir buscando
    const res = resumenGastosMes(k);
    let vTot = 0, uTot = 0;
    for (const v of vMap.values()) {
      vTot += v.ventas;
      uTot += v.utilidad;
    }
    const monto = uTot - res.totalMes;
    rentabilidad = {
      mes: k,
      monto,
      pct: vTot > 0 ? monto / vTot : null,
      parcial: k === mesActualPanama,
      esMesSeleccionado: k === mesSelStr,
    };
    break;
  }

  // ── PUNTO DE EQUILIBRIO (mes seleccionado) ──
  const margenPctSel = margen?.pct ?? null;
  const necesitas = puntoEquilibrio(gastosSel.gastosFijos, margenPctSel);
  const equilibrio = necesitas === null ? null : {
    necesitas,
    real: ventasTotal,
    // La UI capea el display (>100% se muestra como cumplido).
    progresoPct: ventasTotal / necesitas,
    gastosFijos: gastosSel.gastosFijos,
    margenPct: margenPctSel,
  };

  // ── DISPONIBILIDAD (último saldo bancario por empresa) ──
  const bancoRows = (bancosRes.data as BancoRow[] | null) ?? [];
  if (bancosRes.error) console.error("[vista-general] bancos_saldos:", bancosRes.error.message);
  // Filas ya ordenadas fecha_dato DESC → el primer registro visto por empresa
  // es el más reciente.
  const ultimoPorEmpresa = new Map<string, BancoRow>();
  for (const b of bancoRows) {
    if (!ultimoPorEmpresa.has(b.empresa_key)) ultimoPorEmpresa.set(b.empresa_key, b);
  }
  let disponibilidad = null as null | { total: number; fechaMasVieja: string; cuentas: number };
  if (ultimoPorEmpresa.size > 0) {
    let total = 0;
    let fechaMasVieja = "";
    for (const b of ultimoPorEmpresa.values()) {
      total += num(b.saldo);
      if (fechaMasVieja === "" || b.fecha_dato < fechaMasVieja) fechaMasVieja = b.fecha_dato;
    }
    disponibilidad = { total, fechaMasVieja, cuentas: ultimoPorEmpresa.size };
  }

  // ── SEMÁFORO por empresa (mes seleccionado, orden canónico) ──
  // Rentabilidad por empresa SOLO si la empresa cargó gastos ese mes; sin
  // gastos el número saldría inflado → null + estado "sin_gastos".
  const byEmpresaByKey = new Map(byEmpresa.map((e) => [e.key, e]));
  const semaforo = ALL_EMPRESA_KEYS.map((key) => {
    const e = byEmpresaByKey.get(key)!;
    const gastosDirectos = gastosSel.directosPorEmpresa.get(key) ?? 0;
    const prorrateo = prorrateoSel.get(key) ?? 0;
    const rent = gastosSel.empresasConGastos.has(key)
      ? e.utilidad - (gastosDirectos + prorrateo)
      : null;
    return {
      key,
      name: e.name,
      ventas: e.ventas,
      utilidad: e.utilidad,
      gastosDirectos,
      prorrateo,
      rentabilidad: rent,
      pct: rent !== null && e.ventas > 0 ? rent / e.ventas : null,
      estado: estadoSemaforo(rent, e.ventas),
    };
  });

  // ── CXC (empresas con aging) ── vencido = ≥91d ("+90 días"). vigilancia
  // (91-120) es un subconjunto del vencido (se suma aparte, no resta).
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

  // ── CXP (empresas con proveedores) ── mismos tramos que CXC (vencido = ≥91d);
  // total incluye saldos a favor (negativos) → cuadra con grupo_saldo del módulo
  // Proveedores. IFs INDEPENDIENTES (no else-if): vigilancia (91-120) ⊂ vencido,
  // así que el bucket 91-120 cuenta en ambos (detalle + vencido), sin doble conteo
  // en la partición corriente + vencido = total.
  const cxpRows = (cxpRes.data as CxpRow[] | null) ?? [];
  const cxpEmpresas = new Set(cxpRows.map((r) => r.empresa_key));
  let cxpTotal = 0, cxpCorriente = 0, cxpVigilancia = 0, cxpVencido = 0;
  const proveedoresVencidos: { nombre: string; empresa: string; saldo: number }[] = [];
  for (const r of cxpRows) {
    cxpTotal += num(r.saldo_total);
    let vencRow = 0;
    for (const b of r.aging ?? []) {
      if (CXP_CORRIENTE_TITLES.has(b.title)) cxpCorriente += num(b.saldo);
      if (CXP_VIGILANCIA_TITLES.has(b.title)) cxpVigilancia += num(b.saldo);
      if (CXP_VENCIDO_TITLES.has(b.title)) vencRow += num(b.saldo);
    }
    cxpVencido += vencRow;
    if (vencRow > 0) proveedoresVencidos.push({ nombre: r.nombre || "—", empresa: EMPRESA_KEY_TO_NAME[r.empresa_key] ?? r.empresa_key, saldo: vencRow });
  }
  proveedoresVencidos.sort((a, b) => b.saldo - a.saldo);
  const cxp = {
    total: cxpTotal, corriente: cxpCorriente, vigilancia: cxpVigilancia, vencido: cxpVencido,
    empresasCount: cxpEmpresas.size,
    topProveedores: proveedoresVencidos.slice(0, 6),
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
    mes: mesSelStr,
    ventas, margen, gastos, rentabilidad, equilibrio, disponibilidad, semaforo,
    cxc, cxp, reclamos,
  });
}
