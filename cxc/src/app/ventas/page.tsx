"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { SkeletonTable, SkeletonKPI, Toast, Modal, EmptyState } from "@/components/ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import XLSX from "xlsx-js-style";

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
    margenDisplay = `${margenBruto.toFixed(1)}% ${arrow}${sign}${diff.toFixed(1)} puntos`;
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
  const { authChecked, role } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin", "director", "contabilidad"] });

  useEffect(() => {
    if (authChecked && role === "secretaria") {
      showToast("Tu rol permite cargar datos pero no ver el dashboard");
      setTimeout(() => router.push("/upload?tab=ventas&from=ventas"), 1500);
    }
  }, [authChecked, role, router]);

  const [año, setAño] = useState(new Date().getFullYear());
  const [vista, setVista] = useState<"mensual" | "quarter">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fg_ventas_vista");
      if (saved === "mensual" || saved === "quarter") return saved;
    }
    return "mensual";
  });
  const [empresaFilter, setEmpresaFilter] = useState<string[]>([]); // empty = all
  const [filterMes, setFilterMes] = useState<number | null>(null); // null = all months
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Persist vista preference
  useEffect(() => {
    try { localStorage.setItem("fg_ventas_vista", vista); } catch { /* */ }
  }, [vista]);

  useEffect(() => {
    fetch("/api/ventas/años").then(r => r.json()).then(setAños).catch(() => {});
  }, []);

  // Clientes always uses last 12 months
  const desdeStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [v2Raw, metasRes] = await Promise.all([
        fetch(`/api/ventas/v2?anio=${año}&desde=${desdeStr}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/ventas/metas?anio=${año}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const v2 = v2Raw as { byEmpresaMes?: VentaRow[]; prevYear?: { empresa: string; mes: number; subtotal: number; utilidad: number }[]; clientesDetalle?: ClienteDetalle[] } | null;
      setVentas(Array.isArray(v2?.byEmpresaMes) ? v2.byEmpresaMes : []);
      setVentasPrev(Array.isArray(v2?.prevYear) ? v2.prevYear.map(r => ({ ...r, costo: 0 })) : []);
      setMetas(Array.isArray(metasRes) ? metasRes : []);
      setClientesData(Array.isArray(v2?.clientesDetalle) ? v2.clientesDetalle : []);
    } catch { showToast("Error al cargar datos de ventas"); }
    setLoading(false);
  }, [año, desdeStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let rows = empresaFilter.length === 0 ? ventas : ventas.filter(r => empresaFilter.includes(r.empresa));
    if (filterMes !== null) rows = rows.filter(r => r.mes === filterMes);
    return rows;
  }, [ventas, empresaFilter, filterMes]);
  const filteredPrev = useMemo(() => {
    let rows = empresaFilter.length === 0 ? ventasPrev : ventasPrev.filter(r => empresaFilter.includes(r.empresa));
    if (filterMes !== null) rows = rows.filter(r => r.mes === filterMes);
    return rows;
  }, [ventasPrev, empresaFilter, filterMes]);
  const filteredMetas = useMemo(() => {
    let rows = empresaFilter.length === 0 ? metas : metas.filter(m => empresaFilter.includes(m.empresa));
    if (filterMes !== null) rows = rows.filter(m => m.mes === filterMes);
    return rows;
  }, [metas, empresaFilter, filterMes]);

  const kpi = useMemo(() => calcKPIs(filtered, filteredPrev, filteredMetas, vista), [filtered, filteredPrev, filteredMetas, vista]);
  const table = useMemo(() => buildTable(filtered, filteredPrev, vista), [filtered, filteredPrev, vista]);

  // Clientes logic — clientesData already filtered by period via API
  const esInterno = (nombre: string) => {
    const n = nombre.toUpperCase().trim();
    return n.includes("BOSTON") || n.includes("MULTI FASHION") || n.includes("MULTIFASHION");
  };

  const clientesFiltered = useMemo(() => {
    let list = clientesData;
    if (empresaFilter.length > 0) list = list.filter(c => c.empresas.some(e => empresaFilter.includes(e.empresa)));
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.cliente.toLowerCase().includes(q));
    }
    // Filter out clients with subtotal <= 0 and internal clients
    list = list.filter(c => c.subtotal > 0 && !esInterno(c.cliente));
    return list.sort((a, b) => b.subtotal - a.subtotal);
  }, [clientesData, empresaFilter, clientSearch]);

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
      else showToast("No se pudieron guardar las metas. Intenta de nuevo.");
    } catch { showToast("Error de conexión. Verifica tu internet e intenta de nuevo."); }
    setSavingMetas(false);
  };

  // Chart data: monthly sales bars
  const chartData = useMemo(() => {
    return MES_NAMES.map((label, i) => {
      const mes = i + 1;
      const ventas = filtered.filter(r => r.mes === mes).reduce((s, r) => s + r.subtotal, 0);
      const prev = filteredPrev.filter(r => r.mes === mes).reduce((s, r) => s + r.subtotal, 0);
      return { name: label, ventas, prev };
    });
  }, [filtered, filteredPrev]);

  const hasData = ventas.length > 0;

  // Excel export
  function exportExcel() {
    const rows: (string | number)[][] = [
      [`FASHION GROUP — Ventas ${año}`],
      [],
      ["Empresa", ...table.periods, "Total", "Margen%"],
    ];
    for (const row of table.tableRows) {
      if (row.total === 0 && empresaFilter.length === 0) continue;
      rows.push([row.empresa, ...row.values, row.total, row.margen / 100]);
    }
    rows.push(["TOTAL", ...table.totalValues, table.grandTotal, table.grandMargen / 100]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 24 }, ...table.periods.map(() => ({ wch: 14 })), { wch: 16 }, { wch: 10 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: table.periods.length + 2 } }];
    const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
    for (let c = 0; c < table.periods.length + 3; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
      if (cell) cell.s = { font: { bold: true } };
    }
    // Apply number formats to data rows (currency + percentage)
    const dataStartRow = 3; // row 0=title, 1=blank, 2=headers
    const lastDataRow = rows.length - 1;
    const numPeriods = table.periods.length;
    const currFmt = { numFmt: '$#,##0.00' };
    const pctFmt = { numFmt: '0.0%' };
    for (let r = dataStartRow; r <= lastDataRow; r++) {
      const isTotal = r === lastDataRow;
      const base = isTotal ? { font: { bold: true } } : {};
      // Currency columns: period values + total (cols 1 .. numPeriods+1)
      for (let c = 1; c <= numPeriods + 1; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { ...base, ...currFmt };
      }
      // Margin % column (last col)
      const mCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 2 })];
      if (mCell) mCell.s = { ...base, ...pctFmt };
      // Bold empresa name in total row
      if (isTotal) {
        const nCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (nCell) nCell.s = { font: { bold: true } };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-${año}-${vista}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authChecked) return null;
  if (role === "secretaria") return null;

  const kpiCards = [
    { key: "ventas", label: "Ventas netas", value: fmtK(kpi.ventasNetas), flag: false, tooltip: "Total vendido en el período (sin impuestos).", valueExtra: undefined as string | null | undefined, trend: null as "up" | "down" | null },
    { key: "vsAnterior", label: `vs. ${año - 1}`, value: kpi.vsAnterior === null ? "—" : `${kpi.vsAnterior >= 0 ? "+" : ""}${kpi.vsAnterior.toFixed(1)}%`, flag: kpi.vsAnterior !== null && kpi.vsAnterior < -20, tooltip: "Comparado con el mismo período del año pasado.", valueExtra: undefined as string | null | undefined, trend: kpi.vsAnterior === null ? null : kpi.vsAnterior >= 0 ? "up" as const : "down" as const },
    { key: "utilidad", label: "Utilidad total", value: fmtK(kpi.totalUtil), valueExtra: kpi.utilVsAnt, flag: false, tooltip: "Ganancia bruta del período.", trend: null as "up" | "down" | null },
    { key: "margen", label: "Margen bruto", value: kpi.margenDisplay, flag: kpi.margenFlag, tooltip: "Porcentaje de ganancia sobre las ventas.", valueExtra: undefined as string | null | undefined, trend: null as "up" | "down" | null },
    { key: "vsMeta", label: "vs. Meta", value: kpi.metaTotal ? `${kpi.vsMeta.toFixed(0)}%` : "N/A", flag: kpi.metaTotal > 0 && kpi.vsMeta < 80, tooltip: "Qué tanto se alcanzó la meta de ventas.", valueExtra: undefined as string | null | undefined, trend: kpi.metaTotal > 0 ? (kpi.vsMeta >= 100 ? "up" as const : kpi.vsMeta < 80 ? "down" as const : null) : null },
  ];

  return (
    <>
      <AppHeader module="Ventas" />
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Dashboard de Ventas</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/upload?tab=ventas&from=ventas")}
              className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all print:hidden">
              Cargar datos
            </button>
            <button onClick={exportExcel}
              className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all print:hidden">
              ↓ Excel
            </button>
            <button onClick={() => window.open(`/ventas/reporte?anio=${año}&empresa=${empresaFilter.join(",") || "all"}&vista=${vista}`, "_blank")}
              className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all print:hidden">
              Imprimir
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div className="flex gap-1 bg-gray-100 rounded-md p-1">
            {(años.length ? años : [año]).map(y => (
              <button key={y} onClick={() => setAño(y)}
                className={`px-3 py-1.5 min-h-[44px] text-xs rounded-md transition ${y === año ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                {y}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-md p-1">
            {(["mensual", "quarter"] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 min-h-[44px] text-xs rounded-md transition capitalize ${v === vista ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                {v === "mensual" ? "Mensual" : "Trimestral"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setEmpresaFilter([])}
              className={`px-3 py-1.5 min-h-[44px] text-xs rounded-md transition ${empresaFilter.length === 0 ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              Todas
            </button>
            {EMPRESAS.map(e => {
              const active = empresaFilter.includes(e);
              return (
                <button key={e} onClick={() => setEmpresaFilter(prev => active ? prev.filter(x => x !== e) : [...prev, e])}
                  className={`px-3 py-1.5 min-h-[44px] text-xs rounded-md transition ${active ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {e.replace("International", "Intl.").replace("Confecciones ", "")}
                </button>
              );
            })}
          </div>
          <select value={filterMes ?? ""} onChange={e => setFilterMes(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-gray-200 rounded-md px-3 py-1.5 min-h-[44px] bg-white">
            <option value="">Todos los meses</option>
            {MES_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          {role === "admin" && (
            <button onClick={openMetas} className="ml-auto text-xs bg-black text-white rounded-md px-4 py-1.5 hover:bg-gray-800 active:scale-[0.97] transition-all">
              Editar metas
            </button>
          )}
        </div>

        {/* KPI Cards */}
        {loading ? <SkeletonKPI count={5} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 tabular-nums">
            {kpiCards.map(k => (
              <div key={k.key} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center mb-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{k.label}</p>
                  <button onClick={() => setKpiTooltip(kpiTooltip === k.key ? null : k.key)} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
                </div>
                <div className="flex items-center gap-1.5">
                  {k.trend && (
                    <span className={`text-lg font-semibold leading-none ${k.trend === "up" ? "text-green-600" : "text-red-500"}`}>
                      {k.trend === "up" ? "▲" : "▼"}
                    </span>
                  )}
                  <p className={`text-xl font-semibold tabular-nums ${k.flag ? "text-red-600" : ""} ${k.trend === "up" ? "text-green-600" : ""} ${k.trend === "down" && !k.flag ? "text-red-500" : ""}`}>{k.value}</p>
                </div>
                {k.valueExtra && <p className={`text-xs font-semibold mt-0.5 ${k.valueExtra.startsWith("+") ? "text-green-600" : k.valueExtra.startsWith("-") ? "text-red-500" : "text-gray-500"}`}>{k.valueExtra}</p>}
                {kpiTooltip === k.key && <p className="text-xs text-gray-500 mt-1">{k.tooltip}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Monthly Bar Chart */}
        {!loading && hasData && filterMes === null && (
          <div className="mb-6 border border-gray-200 rounded-lg p-3 sm:p-4 print:hidden">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Ventas mensuales {año}</p>
            <ResponsiveContainer width="100%" height={typeof window !== "undefined" && window.innerWidth < 640 ? 160 : 220}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{ fontSize: typeof window !== "undefined" && window.innerWidth < 640 ? 11 : 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: typeof window !== "undefined" && window.innerWidth < 640 ? 11 : 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} width={typeof window !== "undefined" && window.innerWidth < 640 ? 35 : 40} />
                <RTooltip formatter={(v) => [`$${fmt(Number(v))}`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="ventas" fill="#1a1a1a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="prev" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-1 text-center">Negro: {año} · Gris: {año - 1}</p>
          </div>
        )}

        {/* Empty state — no data for selected year */}
        {!loading && !hasData && (() => {
          const otherYears = años.filter(y => y !== año);
          const lastYear = otherYears.length > 0 ? Math.max(...otherYears) : null;
          return (
            <div className="flex flex-col items-center py-20 text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200 mb-4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              <p className="text-sm font-medium text-gray-500 mb-1">Sin datos para {año}</p>
              {lastYear ? (
                <>
                  <p className="text-xs text-gray-400 mb-4">El ultimo dato disponible es de {lastYear}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAño(lastYear)}
                      className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]"
                    >
                      Ver {lastYear}
                    </button>
                    <button
                      onClick={() => router.push("/upload?tab=ventas&from=ventas")}
                      className="text-sm border border-gray-200 text-gray-600 px-5 py-2.5 rounded-md font-medium hover:bg-gray-50 transition-all min-h-[44px]"
                    >
                      Cargar datos de {año}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-4">Carga un CSV de ventas para ver el dashboard</p>
                  <button
                    onClick={() => router.push("/upload?tab=ventas&from=ventas")}
                    className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]"
                  >
                    Cargar datos
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* Mobile hint removed — user can freely toggle Mensual/Quarter on any device */}

        {/* Period indicator */}
        {!loading && kpi.monthsWithData.length > 0 && (
          <p className="text-xs text-gray-500 mb-4">
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
          <button onClick={() => setActiveTab("resumen")} className={`flex-1 py-2.5 px-4 min-h-[44px] text-sm rounded-md transition ${activeTab === "resumen" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Resumen</button>
          <button onClick={() => setActiveTab("clientes")} className={`flex-1 py-2.5 px-4 min-h-[44px] text-sm rounded-md transition ${activeTab === "clientes" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Clientes</button>
        </div>

        {/* Resumen Tab */}
        {activeTab === "resumen" && (
          <>
            {loading ? <SkeletonTable rows={9} cols={vista === "quarter" ? 7 : 15} /> : (
              <div className="overflow-x-auto mb-6 border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200 bg-white">
                      <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-white">Empresa</th>
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
                            const drop = v > 0 && prev > 0 && v < prev * 0.9;
                            const grow = v > 0 && prev > 0 && v > prev * 1.1;
                            const cellBg = drop ? "bg-red-50" : grow ? "bg-green-50" : "";
                            return <td key={i} className={`text-right px-2 py-2 tabular-nums text-gray-600 ${cellBg}`}>{v > 0 ? fmtK(v) : "—"}{drop ? " ↓" : ""}</td>;
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
            {/* Client KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Top Cliente</p>
                <p className="text-sm font-semibold">{topClient?.cliente || "—"}</p>
                <p className="text-xs text-gray-500">{topClient ? fmtK(topClient.subtotal) : ""}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Concentración Top 5</p>
                <p className={`text-xl font-semibold ${top5Pct > 60 ? "text-amber-600" : ""}`}>{top5Pct.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">del total de ventas</p>
              </div>
              <div className={`rounded-lg p-3 cursor-pointer transition ${showInactive ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"}`} onClick={() => setShowInactive(!showInactive)}>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Sin compra 60+ días</p>
                <p className={`text-xl font-semibold ${inactiveCount > 0 ? "text-red-600" : ""}`}>{inactiveCount}</p>
                <p className="text-xs text-gray-500">{showInactive ? "Mostrando inactivos" : "Click para filtrar"}</p>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..." className="text-xs border border-gray-200 rounded-full px-4 py-2 w-full max-w-xs" />
            </div>

            {/* Client Table */}
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top clientes por ventas</p>
            <div className="relative overflow-x-auto border border-gray-200 rounded-lg mb-6 -mx-3 sm:mx-0">
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent z-20 sm:hidden" />
              <table className="w-full text-xs min-w-[600px]">
                <thead className="sticky top-0 bg-white z-10"><tr className="border-b border-gray-200 bg-white">
                  <th className="text-left px-3 py-2 min-h-[44px] cursor-pointer" onClick={() => toggleClientSort("ventas")}>Cliente {clientSort === "ventas" ? (clientSortDir === "desc" ? "↓" : "↑") : ""}</th>
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("ventas")}>Ventas {clientSort === "ventas" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("utilidad")}>Utilidad {clientSort === "utilidad" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("margen")}>Margen% {clientSort === "margen" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("pct")}>% Total {clientSort === "pct" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("fecha")}>Última Compra {clientSort === "fecha" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
                </tr></thead>
                <tbody>
                  {displayClients.map(c => {
                    const margen = c.subtotal ? (c.utilidad / c.subtotal * 100) : 0;
                    const pct = totalVentas ? (c.subtotal / totalVentas * 100) : 0;
                    const lastCompra = c.lastFecha ? new Date(c.lastFecha).toLocaleDateString("es-PA", { month: "short", year: "numeric" }).replace(".", "") : "—";
                    const expanded = expandedClient === c.cliente;
                    const isInactive = c.lastFecha && c.lastFecha < sixtyDaysAgo;
                    return [
                      <tr key={c.cliente} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer min-h-[44px]" onClick={() => setExpandedClient(expanded ? null : c.cliente)}>
                        <td className="px-3 py-2.5 text-gray-700 flex items-center gap-1 min-h-[44px]">
                          <span className={`text-gray-300 text-xs transition ${expanded ? "rotate-90" : ""}`}>▶</span>
                          {c.cliente}
                          {isInactive && <span className="text-red-400 text-[10px] ml-1" title="Sin compra 60+ días">▼</span>}
                        </td>
                        <td className="text-right px-3 py-2.5 tabular-nums min-h-[44px]">{fmtK(c.subtotal)}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums min-h-[44px]">{fmtK(c.utilidad)}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums min-h-[44px] ${margen < 15 ? "text-red-600" : ""}`}>{margen.toFixed(1)}%</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-500 min-h-[44px]">{pct.toFixed(1)}%</td>
                        <td className={`text-right px-3 py-2.5 min-h-[44px] ${isInactive ? "text-red-500" : "text-gray-500"}`}>{lastCompra}</td>
                      </tr>,
                      expanded && c.empresas.map(e => (
                        <tr key={`${c.cliente}-${e.empresa}`} className="bg-gray-50/30">
                          <td className="px-3 py-1.5 pl-8 text-gray-500 text-xs">{e.empresa}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-500 text-xs">{fmtK(e.subtotal)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-500 text-xs">{fmtK(e.utilidad)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums text-gray-500 text-xs">{e.subtotal ? ((e.utilidad / e.subtotal) * 100).toFixed(1) : 0}%</td>
                          <td></td>
                          <td className="text-right px-3 py-1.5 text-gray-500 text-xs">{e.lastFecha ? new Date(e.lastFecha).toLocaleDateString("es-PA", { month: "short", year: "numeric" }).replace(".", "") : "—"}</td>
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
            <thead className="sticky top-0 bg-white z-10"><tr className="border-b border-gray-200">
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
          <button onClick={() => setShowMetas(false)} className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all">Cancelar</button>
          <button onClick={saveMetas} disabled={savingMetas}
            className="text-xs bg-black text-white rounded-md px-4 py-2 hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">
            {savingMetas ? "Guardando..." : "Guardar metas"}
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </>
  );
}
