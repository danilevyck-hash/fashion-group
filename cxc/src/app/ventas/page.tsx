"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { SkeletonTable, SkeletonKPI, Toast, Modal } from "@/components/ui";

const EMPRESAS = ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep", "Confecciones Boston", "Multifashion"];
const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface VentaRow { empresa: string; mes: number; subtotal: number; costo: number; utilidad: number; }
interface MetaRow { empresa: string; año: number; mes: number; meta: number; }
interface ClienteDetalle {
  cliente: string;
  subtotal: number;
  utilidad: number;
  lastFecha: string;
  empresas: { empresa: string; subtotal: number; utilidad: number; lastFecha: string }[];
}

function netas(r: VentaRow) { return r.subtotal; }
function utilidad(r: VentaRow) { return r.utilidad; }
function fmtK(n: number) { if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`; if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`; return `$${fmt(n)}`; }

// ── Helpers ──
function calcKPIs(rows: VentaRow[], prevRows: VentaRow[], metaRows: MetaRow[], vista: "mensual" | "quarter") {
  const ventasNetas = rows.reduce((s, r) => s + netas(r), 0);
  const monthsWithData = [...new Set(rows.map(r => r.mes))];
  const comparablePrev = prevRows.filter(r => monthsWithData.includes(r.mes));
  const prevTotal = comparablePrev.reduce((s, r) => s + netas(r), 0);
  const vsAnterior: number | null = comparablePrev.length > 0 && prevTotal !== 0
    ? ((ventasNetas - prevTotal) / prevTotal) * 100
    : null;
  const totalUtil = rows.reduce((s, r) => s + utilidad(r), 0);
  const margenBruto = ventasNetas ? (totalUtil / ventasNetas) * 100 : 0;

  // Utilidad vs anterior
  const prevUtil = comparablePrev.reduce((s, r) => s + utilidad(r), 0);
  const utilVsAnt: string | null = prevUtil !== 0
    ? `${((totalUtil - prevUtil) / Math.abs(prevUtil) * 100) >= 0 ? "+" : ""}${((totalUtil - prevUtil) / Math.abs(prevUtil) * 100).toFixed(0)}%`
    : null;

  // Margen display with trend
  const prevMargen = prevTotal > 0 ? (prevUtil / prevTotal) * 100 : null;
  let margenDisplay: string;
  let margenFlag: boolean;
  if (prevMargen !== null) {
    const diff = margenBruto - prevMargen;
    const arrow = diff >= 0 ? "↑" : "↓";
    const sign = diff >= 0 ? "+" : "";
    margenDisplay = `${margenBruto.toFixed(1)}% ${arrow}${sign}${diff.toFixed(1)}pp`;
    margenFlag = diff < 0;
  } else {
    margenDisplay = `${margenBruto.toFixed(1)}%`;
    margenFlag = false;
  }

  const metaTotal = metaRows.reduce((s, m) => s + (m.meta || 0), 0);
  const vsMeta = metaTotal ? (ventasNetas / metaTotal) * 100 : 0;

  const hasPrevData = comparablePrev.length > 0;
  return { ventasNetas, vsAnterior, totalUtil, utilVsAnt, margenDisplay, margenFlag, metaTotal, vsMeta, monthsWithData, hasPrevData };
}

function buildTable(rows: VentaRow[], prevRows: VentaRow[], vista: "mensual" | "quarter") {
  const periods = vista === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MES_NAMES;
  const tableRows = EMPRESAS.map(emp => {
    const empRows = rows.filter(r => r.empresa === emp);
    const empPrev = prevRows.filter(r => r.empresa === emp);
    const values = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empRows.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empRows.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + netas(r), 0);
    });
    const prevValues = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empPrev.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empPrev.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + netas(r), 0);
    });
    const total = values.reduce((s, v) => s + v, 0);
    const totalUtil = empRows.reduce((s, r) => s + utilidad(r), 0);
    const margen = total ? (totalUtil / total) * 100 : 0;
    return { empresa: emp, values, prevValues, total, margen };
  });

  const totalValues = periods.map((_, i) => tableRows.reduce((s, r) => s + r.values[i], 0));
  const grandTotal = totalValues.reduce((s, v) => s + v, 0);
  const grandUtil = rows.reduce((s, r) => s + utilidad(r), 0);
  const grandMargen = grandTotal ? (grandUtil / grandTotal) * 100 : 0;

  return { periods, tableRows, totalValues, grandTotal, grandMargen };
}

export default function VentasDashboard() {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin", "director"] });

  useEffect(() => {
    if (authChecked && (role === "secretaria" || role === "upload")) router.push("/ventas/carga");
  }, [authChecked, role, router]);

  const [año, setAño] = useState(new Date().getFullYear());
  const [vista, setVista] = useState<"mensual" | "quarter">("mensual");
  const [empresaFilter, setEmpresaFilter] = useState<string[]>([]); // empty = all
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [ventasPrev, setVentasPrev] = useState<VentaRow[]>([]);
  const [años, setAños] = useState<number[]>([]);
  const [metas, setMetas] = useState<MetaRow[]>([]);
  const [showMetas, setShowMetas] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState<Record<string, number[]>>({});
  const [savingMetas, setSavingMetas] = useState(false);
  const [kpiTooltip, setKpiTooltip] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"resumen" | "clientes">("resumen");
  const [clientesData, setClientesData] = useState<ClienteDetalle[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSort, setClientSort] = useState<"ventas" | "utilidad" | "margen" | "pct" | "fecha">("ventas");
  const [clientSortDir, setClientSortDir] = useState<"desc" | "asc">("desc");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [clientPeriod, setClientPeriod] = useState<"3m" | "6m" | "12m" | "ytd">("12m");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    fetch("/api/ventas/años").then(r => r.json()).then(setAños).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [v2Raw, metasRes] = await Promise.all([
        fetch(`/api/ventas/v2?año=${año}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/ventas/metas?año=${año}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const v2 = v2Raw as { byEmpresaMes?: VentaRow[]; prevYear?: { empresa: string; mes: number; subtotal: number; utilidad: number }[]; clientesDetalle?: ClienteDetalle[] } | null;
      setVentas(Array.isArray(v2?.byEmpresaMes) ? v2.byEmpresaMes : []);
      setVentasPrev(Array.isArray(v2?.prevYear) ? v2.prevYear.map(r => ({ ...r, costo: 0 })) : []);
      setMetas(Array.isArray(metasRes) ? metasRes : []);
      setClientesData(Array.isArray(v2?.clientesDetalle) ? v2.clientesDetalle : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [año]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => empresaFilter.length === 0 ? ventas : ventas.filter(r => empresaFilter.includes(r.empresa)), [ventas, empresaFilter]);
  const filteredPrev = useMemo(() => empresaFilter.length === 0 ? ventasPrev : ventasPrev.filter(r => empresaFilter.includes(r.empresa)), [ventasPrev, empresaFilter]);
  const filteredMetas = useMemo(() => empresaFilter.length === 0 ? metas : metas.filter(m => empresaFilter.includes(m.empresa)), [metas, empresaFilter]);

  const kpi = useMemo(() => calcKPIs(filtered, filteredPrev, filteredMetas, vista), [filtered, filteredPrev, filteredMetas, vista]);
  const table = useMemo(() => buildTable(filtered, filteredPrev, vista), [filtered, filteredPrev, vista]);

  // Clientes period filter
  const clientesPeriodFiltered = useMemo(() => {
    const now = new Date();
    let cutoff: string;
    if (clientPeriod === "ytd") {
      cutoff = `${now.getFullYear()}-01-01`;
    } else {
      const months = clientPeriod === "3m" ? 3 : clientPeriod === "6m" ? 6 : 12;
      const d = new Date(now);
      d.setMonth(d.getMonth() - months);
      cutoff = d.toISOString().slice(0, 10);
    }
    // Filter: only clients with lastFecha >= cutoff
    return clientesData.filter(c => c.lastFecha >= cutoff);
  }, [clientesData, clientPeriod]);

  // Clientes logic
  const clientesFiltered = useMemo(() => {
    let list = clientesPeriodFiltered;
    if (empresaFilter.length > 0) list = list.filter(c => c.empresas.some(e => empresaFilter.includes(e.empresa)));
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.cliente.toLowerCase().includes(q));
    }
    // Filter out clients with subtotal <= 0
    list = list.filter(c => c.subtotal > 0);
    return list;
  }, [clientesPeriodFiltered, empresaFilter, clientSearch]);

  // KPI calculation (before user sort) — sort by subtotal desc for top client
  const clientesForKPI = useMemo(() => {
    return [...clientesFiltered].sort((a, b) => b.subtotal - a.subtotal);
  }, [clientesFiltered]);

  const totalVentas = clientesForKPI.reduce((s, c) => s + c.subtotal, 0);
  const topClient = clientesForKPI[0] || null;
  const top5Pct = totalVentas > 0 ? (clientesForKPI.slice(0, 5).reduce((s, c) => s + c.subtotal, 0) / totalVentas) * 100 : 0;
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const inactiveClients = clientesForKPI.filter(c => c.lastFecha && c.lastFecha < sixtyDaysAgo);
  const inactiveCount = inactiveClients.length;

  // Apply user sort for table display
  const clientesSorted = useMemo(() => {
    const dir = clientSortDir === "desc" ? -1 : 1;
    return [...clientesFiltered].sort((a, b) => {
      switch (clientSort) {
        case "ventas": return (b.subtotal - a.subtotal) * dir;
        case "utilidad": return (b.utilidad - a.utilidad) * dir;
        case "margen": return (((b.subtotal ? b.utilidad / b.subtotal : 0) - (a.subtotal ? a.utilidad / a.subtotal : 0))) * dir;
        case "pct": return (b.subtotal - a.subtotal) * dir;
        case "fecha": return ((b.lastFecha || "").localeCompare(a.lastFecha || "")) * dir;
        default: return 0;
      }
    });
  }, [clientesFiltered, clientSort, clientSortDir]);

  const displayClients = showInactive ? inactiveClients : clientesSorted;

  function toggleClientSort(col: typeof clientSort) {
    if (clientSort === col) setClientSortDir(d => d === "desc" ? "asc" : "desc");
    else { setClientSort(col); setClientSortDir("desc"); }
  }

  // Metas modal
  const openMetas = () => {
    const draft: Record<string, number[]> = {};
    EMPRESAS.forEach(emp => {
      draft[emp] = Array.from({ length: 12 }, (_, i) => {
        const found = metas.find(m => m.empresa === emp && m.mes === i + 1);
        return found?.meta || 0;
      });
    });
    setMetaDraft(draft);
    setShowMetas(true);
  };

  const saveMetas = async () => {
    setSavingMetas(true);
    const payload: { empresa: string; año: number; mes: number; meta: number }[] = [];
    EMPRESAS.forEach(emp => {
      (metaDraft[emp] || []).forEach((val, i) => {
        payload.push({ empresa: emp, año, mes: i + 1, meta: val });
      });
    });
    try {
      const res = await fetch("/api/ventas/metas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { showToast("Metas guardadas"); setShowMetas(false); fetchData(); }
      else showToast("Error al guardar metas");
    } catch { showToast("Error de conexion"); }
    setSavingMetas(false);
  };

  if (!authChecked) return null;

  const kpiCards = [
    { key: "ventas", label: "Ventas netas", value: fmtK(kpi.ventasNetas), flag: false, tooltip: "Total de ventas sin ITBMS. Facturas − NC + ND, usando Subtotal.", valueExtra: undefined as string | null | undefined },
    { key: "vsAnterior", label: "vs. Año Ant.", value: kpi.vsAnterior === null ? "—" : `${kpi.vsAnterior >= 0 ? "+" : ""}${kpi.vsAnterior.toFixed(1)}%`, flag: kpi.vsAnterior !== null && kpi.vsAnterior < -20, tooltip: "Compara los mismos meses con datos vs el año pasado.", valueExtra: undefined as string | null | undefined },
    { key: "utilidad", label: "Utilidad total", value: fmtK(kpi.totalUtil), valueExtra: kpi.utilVsAnt, flag: false, tooltip: "Utilidad bruta total del período en B/. absolutos." },
    { key: "margen", label: "Margen bruto", value: kpi.margenDisplay, flag: kpi.margenFlag, tooltip: "Utilidad / ventas netas. Fusionado con tendencia vs año anterior.", valueExtra: undefined as string | null | undefined },
    { key: "vsMeta", label: "vs. Meta", value: kpi.metaTotal ? `${kpi.vsMeta.toFixed(0)}%` : "N/A", flag: kpi.metaTotal > 0 && kpi.vsMeta < 80, tooltip: "Cumplimiento de la meta definida. N/A si no hay metas.", valueExtra: undefined as string | null | undefined },
  ];

  return (
    <>
      <AppHeader module="Ventas" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Dashboard de Ventas</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/upload?tab=ventas")}
              className="text-xs border border-gray-200 rounded-full px-4 py-2 hover:bg-gray-50 transition print:hidden">
              Cargar datos
            </button>
            <button onClick={() => window.open(`/ventas/reporte?año=${año}&empresa=${empresaFilter.join(",") || "all"}&vista=${vista}`, "_blank")}
              className="text-xs border border-gray-200 rounded-full px-4 py-2 hover:bg-gray-50 transition print:hidden">
              Imprimir
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {(años.length ? años : [año]).map(y => (
              <button key={y} onClick={() => setAño(y)}
                className={`px-3 py-1 text-xs rounded-full transition ${y === año ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                {y}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {(["mensual", "quarter"] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1 text-xs rounded-full transition capitalize ${v === vista ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                {v === "mensual" ? "Mensual" : "Quarter"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setEmpresaFilter([])}
              className={`px-3 py-1 text-xs rounded-full transition ${empresaFilter.length === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              Todas
            </button>
            {EMPRESAS.map(e => {
              const active = empresaFilter.includes(e);
              return (
                <button key={e} onClick={() => setEmpresaFilter(prev => active ? prev.filter(x => x !== e) : [...prev, e])}
                  className={`px-3 py-1 text-xs rounded-full transition ${active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {e.replace("International", "Intl.").replace("Confecciones ", "")}
                </button>
              );
            })}
          </div>
          {role === "admin" && (
            <button onClick={openMetas} className="ml-auto text-xs bg-black text-white rounded-full px-4 py-1.5 hover:bg-gray-800 transition">
              Editar metas
            </button>
          )}
        </div>

        {/* KPI Cards */}
        {loading ? <SkeletonKPI count={5} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {kpiCards.map(k => (
              <div key={k.key} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center mb-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{k.label}</p>
                  <button onClick={() => setKpiTooltip(kpiTooltip === k.key ? null : k.key)} className="text-gray-300 hover:text-gray-500 text-[10px] ml-1">?</button>
                </div>
                <p className={`text-xl font-semibold ${k.flag ? "text-red-600" : ""}`}>{k.value}</p>
                {k.valueExtra && <p className="text-xs text-gray-400">{k.valueExtra}</p>}
                {kpiTooltip === k.key && <p className="text-[10px] text-gray-400 mt-1">{k.tooltip}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Period indicator */}
        {!loading && kpi.monthsWithData.length > 0 && (
          <p className="text-[11px] text-gray-400 mb-4">
            Mostrando {(() => {
              const sorted = [...kpi.monthsWithData].sort((a, b) => a - b);
              const from = MES_NAMES[sorted[0] - 1];
              const to = MES_NAMES[sorted[sorted.length - 1] - 1];
              const range = sorted.length === 1 ? `${from} ${año}` : `${from} – ${to} ${año}`;
              const prev = kpi.hasPrevData
                ? ` · comparando vs ${sorted.length === 1 ? `${from} ${año - 1}` : `${from} – ${to} ${año - 1}`}`
                : " · sin datos comparativos";
              return range + prev;
            })()}
          </p>
        )}

        {/* Tab Bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 max-w-xs print:hidden">
          <button onClick={() => setActiveTab("resumen")} className={`flex-1 py-2 px-4 text-sm rounded-md transition ${activeTab === "resumen" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Resumen</button>
          <button onClick={() => setActiveTab("clientes")} className={`flex-1 py-2 px-4 text-sm rounded-md transition ${activeTab === "clientes" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Clientes</button>
        </div>

        {/* Resumen Tab */}
        {activeTab === "resumen" && (
          <>
            {loading ? <SkeletonTable rows={9} cols={vista === "quarter" ? 7 : 15} /> : (
              <div className="overflow-x-auto mb-6 border border-gray-100 rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50/50">Empresa</th>
                      {table.periods.map(p => <th key={p} className="text-right px-2 py-2 font-medium text-gray-500">{p}</th>)}
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Margen%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.tableRows.map(row => {
                      if (row.total === 0 && empresaFilter.length === 0) return null;
                      return (
                        <tr key={row.empresa} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">{row.empresa}</td>
                          {row.values.map((v, i) => {
                            const prev = row.prevValues[i];
                            const drop = v > 0 && prev > 0 && v < prev * 0.85;
                            return <td key={i} className="text-right px-2 py-2 tabular-nums text-gray-600">{v > 0 ? fmtK(v) : "—"}{drop ? " ↓" : ""}</td>;
                          })}
                          <td className="text-right px-3 py-2 font-medium tabular-nums">{fmtK(row.total)}</td>
                          <td className={`text-right px-3 py-2 tabular-nums ${row.margen < 15 ? "bg-red-50 text-red-600" : "text-gray-600"}`}>
                            {row.total ? `${row.margen.toFixed(1)}%` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-gray-50">TOTAL</td>
                      {table.totalValues.map((v, i) => <td key={i} className="text-right px-2 py-2 tabular-nums">{v ? fmtK(v) : "-"}</td>)}
                      <td className="text-right px-3 py-2 tabular-nums">{fmtK(table.grandTotal)}</td>
                      <td className={`text-right px-3 py-2 tabular-nums ${table.grandMargen < 15 ? "text-red-600" : ""}`}>
                        {table.grandTotal ? `${table.grandMargen.toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Clientes Tab */}
        {activeTab === "clientes" && (
          <>
            {/* Client Period Filter */}
            <div className="flex gap-1.5 mb-4">
              {(["3m", "6m", "12m", "ytd"] as const).map(p => (
                <button key={p} onClick={() => setClientPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-full transition ${clientPeriod === p ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {p === "3m" ? "Últ. 3 meses" : p === "6m" ? "Últ. 6 meses" : p === "12m" ? "Últ. 12 meses" : "Este año"}
                </button>
              ))}
            </div>

            {/* Client KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Top Cliente</p>
                <p className="text-sm font-semibold">{topClient?.cliente || "—"}</p>
                <p className="text-xs text-gray-400">{topClient ? fmtK(topClient.subtotal) : ""}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Concentración Top 5</p>
                <p className={`text-xl font-semibold ${top5Pct > 60 ? "text-amber-600" : ""}`}>{top5Pct.toFixed(0)}%</p>
                <p className="text-xs text-gray-400">del total de ventas</p>
              </div>
              <div className={`rounded-xl p-4 cursor-pointer transition ${showInactive ? "bg-red-50 border border-red-200" : "bg-gray-50"}`} onClick={() => setShowInactive(!showInactive)}>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Sin compra 60+ días</p>
                <p className={`text-xl font-semibold ${inactiveCount > 0 ? "text-red-600" : ""}`}>{inactiveCount}</p>
                <p className="text-xs text-gray-400">{showInactive ? "Mostrando inactivos" : "Click para filtrar"}</p>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..." className="text-xs border border-gray-200 rounded-full px-4 py-2 w-full max-w-xs" />
            </div>

            {/* Client Table */}
            <div className="overflow-x-auto border border-gray-100 rounded-xl mb-6">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("ventas")}>Cliente</th>
                  <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("ventas")}>Ventas</th>
                  <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("utilidad")}>Utilidad</th>
                  <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("margen")}>Margen%</th>
                  <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("pct")}>% Total</th>
                  <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleClientSort("fecha")}>Última Compra</th>
                </tr></thead>
                <tbody>
                  {displayClients.map(c => {
                    const margen = c.subtotal ? (c.utilidad / c.subtotal * 100) : 0;
                    const pct = totalVentas ? (c.subtotal / totalVentas * 100) : 0;
                    const lastCompra = c.lastFecha ? MES_NAMES[new Date(c.lastFecha).getMonth()] + " " + new Date(c.lastFecha).getFullYear() : "—";
                    const expanded = expandedClient === c.cliente;
                    return [
                      <tr key={c.cliente} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandedClient(expanded ? null : c.cliente)}>
                        <td className="px-3 py-2 text-gray-700 flex items-center gap-1">
                          <span className={`text-gray-300 text-[10px] transition ${expanded ? "rotate-90" : ""}`}>▶</span>
                          {c.cliente}
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">{fmtK(c.subtotal)}</td>
                        <td className="text-right px-3 py-2 tabular-nums">{fmtK(c.utilidad)}</td>
                        <td className={`text-right px-3 py-2 tabular-nums ${margen < 15 ? "text-red-600" : ""}`}>{margen.toFixed(1)}%</td>
                        <td className="text-right px-3 py-2 tabular-nums text-gray-500">{pct.toFixed(1)}%</td>
                        <td className="text-right px-3 py-2 text-gray-500">{lastCompra}</td>
                      </tr>,
                      expanded && c.empresas.map(e => (
                        <tr key={`${c.cliente}-${e.empresa}`} className="bg-gray-50/30">
                          <td className="px-3 py-1.5 pl-8 text-gray-400 text-[11px]">{e.empresa}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-400 text-[11px]">{fmtK(e.subtotal)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-400 text-[11px]">{fmtK(e.utilidad)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-400 text-[11px]">{e.subtotal ? ((e.utilidad / e.subtotal) * 100).toFixed(1) : 0}%</td>
                          <td></td>
                          <td className="text-right px-3 py-1.5 text-gray-400 text-[11px]">{e.lastFecha ? MES_NAMES[new Date(e.lastFecha).getMonth()] + " " + new Date(e.lastFecha).getFullYear() : "—"}</td>
                        </tr>
                      )),
                    ];
                  })}
                  {displayClients.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin datos de clientes</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Metas Modal */}
      <Modal open={showMetas} onClose={() => setShowMetas(false)} title={`Metas ${año}`} maxWidth="max-w-4xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left px-2 py-1 font-medium text-gray-500">Empresa</th>
              {MES_NAMES.map(m => <th key={m} className="text-center px-1 py-1 font-medium text-gray-500 w-16">{m}</th>)}
            </tr></thead>
            <tbody>
              {EMPRESAS.map(emp => (
                <tr key={emp} className="border-b border-gray-50">
                  <td className="px-2 py-1 text-gray-700 whitespace-nowrap text-[11px]">{emp}</td>
                  {(metaDraft[emp] || Array(12).fill(0)).map((val, i) => (
                    <td key={i} className="px-1 py-1">
                      <input type="number" value={val || ""} onChange={e => {
                        const next = { ...metaDraft };
                        next[emp] = [...(next[emp] || Array(12).fill(0))];
                        next[emp][i] = parseFloat(e.target.value) || 0;
                        setMetaDraft(next);
                      }} className="w-full text-right text-[11px] border border-gray-200 rounded px-1 py-0.5" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowMetas(false)} className="text-xs border border-gray-200 rounded-full px-4 py-2 hover:bg-gray-50">Cancelar</button>
          <button onClick={saveMetas} disabled={savingMetas}
            className="text-xs bg-black text-white rounded-full px-4 py-2 hover:bg-gray-800 disabled:opacity-50">
            {savingMetas ? "Guardando..." : "Guardar metas"}
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </>
  );
}
