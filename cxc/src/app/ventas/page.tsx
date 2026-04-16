"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { SkeletonTable, SkeletonKPI, Toast, Modal } from "@/components/ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import XLSX from "xlsx-js-style";

// ── Constants ──────────────────────────────────────────────────────────────────

const EMPRESAS = [
  "Vistana International", "Fashion Wear", "Fashion Shoes",
  "Active Shoes", "Active Wear", "Joystep",
  "Confecciones Boston", "Multifashion",
];
const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// ── Types ──────────────────────────────────────────────────────────────────────

interface VentaRow {
  empresa: string;
  mes: number;
  subtotal: number;
  costo: number;
  utilidad: number;
}
interface PrevYearRow {
  empresa: string;
  mes: number;
  subtotal: number;
  utilidad: number;
}
interface MetaAutoEmpresa {
  empresa: string;
  cagr: number;
  suggestedRate: number;
  monthlyMetas: number[];
  monthlyPrevYear: number[];
  hasUserOverrides: boolean;
}
interface MetaAutoResponse {
  empresas: MetaAutoEmpresa[];
  groupAvgCAGR: number;
  ceiling: number;
}
interface ClienteDetalle {
  cliente: string;
  subtotal: number;
  utilidad: number;
  lastFecha: string;
  empresas: { empresa: string; subtotal: number; utilidad: number; lastFecha: string }[];
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${fmt(n)}`;
}

/** Show "—" in gray for zero values */
function fmtCell(n: number): { text: string; isZero: boolean } {
  if (!n || n === 0) return { text: "—", isZero: true };
  return { text: fmtK(n), isZero: false };
}

function periodLabel(months: number[], year: number): string {
  if (months.length === 0) return String(year);
  const sorted = [...months].sort((a, b) => a - b);
  const from = MES_NAMES[sorted[0] - 1];
  const to = MES_NAMES[sorted[sorted.length - 1] - 1];
  return sorted.length === 1 ? `${from} ${year}` : `${from}–${to} ${year}`;
}

// ── KPIs ───────────────────────────────────────────────────────────────────────

function calcKPIs(
  rows: VentaRow[],
  prevRows: PrevYearRow[],
  metasAuto: MetaAutoEmpresa[],
  maxMonth: number,
) {
  // Only include months 1..maxMonth for equivalent comparison
  const currentFiltered = rows.filter(r => r.mes <= maxMonth);
  const prevFiltered = prevRows.filter(r => r.mes <= maxMonth);

  const ventasNetas = currentFiltered.reduce((s, r) => s + r.subtotal, 0);
  const prevTotal = prevFiltered.reduce((s, r) => s + r.subtotal, 0);

  const vsAnterior: number | null =
    prevFiltered.length > 0 && prevTotal !== 0
      ? ((ventasNetas - prevTotal) / prevTotal) * 100
      : null;

  const totalUtil = currentFiltered.reduce((s, r) => s + r.utilidad, 0);
  const prevUtil = prevFiltered.reduce((s, r) => s + r.utilidad, 0);
  const margenBruto = ventasNetas ? (totalUtil / ventasNetas) * 100 : 0;
  const prevMargen = prevTotal > 0 ? (prevUtil / prevTotal) * 100 : null;

  // Meta = sum of monthly metas for months 1..maxMonth
  const metaTotal = metasAuto.reduce((s, e) => {
    for (let m = 0; m < maxMonth; m++) s += e.monthlyMetas[m] ?? 0;
    return s;
  }, 0);
  const vsMeta = metaTotal > 0 ? (ventasNetas / metaTotal) * 100 : 0;

  return {
    ventasNetas,
    vsAnterior,
    totalUtil,
    prevUtil,
    margenBruto,
    prevMargen,
    metaTotal,
    vsMeta,
    hasPrevData: prevFiltered.length > 0,
  };
}

// ── Table builder ──────────────────────────────────────────────────────────────

interface TableRow {
  empresa: string;
  values: number[];         // 12 months or 4 quarters
  utilValues: number[];     // utilidad per period
  prevValues: number[];
  prevUtilValues: number[];
  total: number;
  totalUtil: number;
  margen: number;
  prevTotal: number;
  prevTotalUtil: number;
  metaTotal: number;
}

function buildTable(
  rows: VentaRow[],
  prevRows: PrevYearRow[],
  metasAuto: MetaAutoEmpresa[],
  vista: "mensual" | "quarter",
  maxMonth: number,
) {
  const periods = vista === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MES_NAMES;
  const metaMap = new Map(metasAuto.map(e => [e.empresa, e]));

  const tableRows: TableRow[] = EMPRESAS.map(emp => {
    const empRows = rows.filter(r => r.empresa === emp);
    const empPrev = prevRows.filter(r => r.empresa === emp);
    const empMeta = metaMap.get(emp);

    const values = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empRows.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empRows.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + r.subtotal, 0);
    });

    const utilValues = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empRows.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empRows.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + r.utilidad, 0);
    });

    const prevValues = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empPrev.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empPrev.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + r.subtotal, 0);
    });

    const prevUtilValues = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empPrev.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empPrev.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + r.utilidad, 0);
    });

    const total = values.reduce((s, v) => s + v, 0);
    const totalUtil = utilValues.reduce((s, v) => s + v, 0);
    const margen = total ? (totalUtil / total) * 100 : 0;
    const prevTotal = empPrev.filter(r => r.mes <= maxMonth).reduce((s, r) => s + r.subtotal, 0);
    const prevTotalUtil = empPrev.filter(r => r.mes <= maxMonth).reduce((s, r) => s + r.utilidad, 0);

    // Meta total for equivalent period
    let metaTotal = 0;
    if (empMeta) {
      for (let m = 0; m < maxMonth; m++) metaTotal += empMeta.monthlyMetas[m] ?? 0;
    }

    return { empresa: emp, values, utilValues, prevValues, prevUtilValues, total, totalUtil, margen, prevTotal, prevTotalUtil, metaTotal };
  });

  const totalValues = periods.map((_, i) => tableRows.reduce((s, r) => s + r.values[i], 0));
  const totalUtilValues = periods.map((_, i) => tableRows.reduce((s, r) => s + r.utilValues[i], 0));
  const grandTotal = totalValues.reduce((s, v) => s + v, 0);
  const grandUtil = totalUtilValues.reduce((s, v) => s + v, 0);
  const grandMargen = grandTotal ? (grandUtil / grandTotal) * 100 : 0;
  const grandPrevTotal = tableRows.reduce((s, r) => s + r.prevTotal, 0);
  const grandMetaTotal = tableRows.reduce((s, r) => s + r.metaTotal, 0);

  return { periods, tableRows, totalValues, totalUtilValues, grandTotal, grandUtil, grandMargen, grandPrevTotal, grandMetaTotal };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VentasDashboard() {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "ventas", allowedRoles: ["admin", "director", "contabilidad"] });

  useEffect(() => {
    if (authChecked && role === "secretaria") {
      showToast("Tu rol permite cargar datos pero no ver el dashboard");
      setTimeout(() => router.push("/upload?tab=ventas&from=ventas"), 1500);
    }
  }, [authChecked, role, router]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [año, setAño] = useState(new Date().getFullYear());
  const [vista, setVista] = useState<"mensual" | "quarter">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fg_ventas_vista");
      if (saved === "mensual" || saved === "quarter") return saved;
    }
    return "mensual";
  });
  const [empresaFilter, setEmpresaFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [ventasPrev, setVentasPrev] = useState<PrevYearRow[]>([]);
  const [años, setAños] = useState<number[]>([]);
  const [metasAuto, setMetasAuto] = useState<MetaAutoEmpresa[]>([]);
  const [metasAutoMeta, setMetasAutoMeta] = useState<{ groupAvgCAGR: number; ceiling: number }>({ groupAvgCAGR: 0, ceiling: 0 });
  const [showMetas, setShowMetas] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savingMetas, setSavingMetas] = useState(false);
  const [activeTab, setActiveTab] = useState<"resumen" | "clientes">("resumen");
  const [resumenMode, setResumenMode] = useState<"ventas" | "utilidad">("ventas");
  const [clientesData, setClientesData] = useState<ClienteDetalle[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSort, setClientSort] = useState<"ventas" | "utilidad" | "margen" | "pct" | "fecha">("ventas");
  const [clientSortDir, setClientSortDir] = useState<"desc" | "asc">("desc");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Metas modal draft: custom rate per empresa (null = use suggested)
  const [metaRateDraft, setMetaRateDraft] = useState<Record<string, string>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Persist vista preference
  useEffect(() => {
    try { localStorage.setItem("fg_ventas_vista", vista); } catch { /* */ }
  }, [vista]);

  useEffect(() => {
    fetch("/api/ventas/a%C3%B1os").then(r => {
      if (!r.ok) throw new Error("años API " + r.status);
      return r.json();
    }).then(data => {
      if (Array.isArray(data) && data.length > 0) setAños(data);
    }).catch(() => {
      // Fallback: generate range from current year back 4 years
      const cy = new Date().getFullYear();
      setAños([cy, cy-1, cy-2, cy-3, cy-4]);
    });
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
      const [v2Raw, metasAutoRes] = await Promise.all([
        fetch(`/api/ventas/v2?anio=${año}&desde=${desdeStr}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/ventas/metas-auto?anio=${año}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const v2 = v2Raw as {
        byEmpresaMes?: VentaRow[];
        prevYear?: PrevYearRow[];
        clientesDetalle?: ClienteDetalle[];
      } | null;
      setVentas(Array.isArray(v2?.byEmpresaMes) ? v2.byEmpresaMes : []);
      setVentasPrev(Array.isArray(v2?.prevYear) ? v2.prevYear.map(r => ({ ...r, utilidad: r.utilidad ?? 0 })) : []);
      setClientesData(Array.isArray(v2?.clientesDetalle) ? v2.clientesDetalle : []);

      const autoRes = metasAutoRes as MetaAutoResponse | null;
      setMetasAuto(autoRes?.empresas ?? []);
      setMetasAutoMeta({
        groupAvgCAGR: autoRes?.groupAvgCAGR ?? 0,
        ceiling: autoRes?.ceiling ?? 0,
      });
    } catch { showToast("Error al cargar datos de ventas"); }
    setLoading(false);
  }, [año, desdeStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (empresaFilter === "all") return ventas;
    return ventas.filter(r => r.empresa === empresaFilter);
  }, [ventas, empresaFilter]);

  const filteredPrev = useMemo(() => {
    if (empresaFilter === "all") return ventasPrev;
    return ventasPrev.filter(r => r.empresa === empresaFilter);
  }, [ventasPrev, empresaFilter]);

  const filteredMetasAuto = useMemo(() => {
    if (empresaFilter === "all") return metasAuto;
    return metasAuto.filter(e => e.empresa === empresaFilter);
  }, [metasAuto, empresaFilter]);

  // maxMonthWithData: highest month that has data in the selected year
  const maxMonth = useMemo(() => {
    if (filtered.length === 0) return 0;
    return Math.max(...filtered.map(r => r.mes));
  }, [filtered]);

  const monthsWithData = useMemo(() => {
    const set = new Set(filtered.map(r => r.mes));
    return [...set].sort((a, b) => a - b);
  }, [filtered]);

  const kpi = useMemo(
    () => calcKPIs(filtered, filteredPrev, filteredMetasAuto, maxMonth),
    [filtered, filteredPrev, filteredMetasAuto, maxMonth],
  );

  const table = useMemo(
    () => buildTable(filtered, filteredPrev, filteredMetasAuto, vista, maxMonth),
    [filtered, filteredPrev, filteredMetasAuto, vista, maxMonth],
  );

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    return MES_NAMES.map((label, i) => {
      const mes = i + 1;
      const v = filtered.filter(r => r.mes === mes).reduce((s, r) => s + r.subtotal, 0);
      const prev = filteredPrev.filter(r => r.mes === mes).reduce((s, r) => s + r.subtotal, 0);
      return { name: label, ventas: v, prev };
    });
  }, [filtered, filteredPrev]);

  // ── Clientes logic ─────────────────────────────────────────────────────────

  const esInterno = (nombre: string) => {
    const n = nombre.toUpperCase().trim();
    return n.includes("BOSTON") || n.includes("MULTI FASHION") || n.includes("MULTIFASHION");
  };

  const clientesFiltered = useMemo(() => {
    let list = clientesData;
    if (empresaFilter !== "all") list = list.filter(c => c.empresas.some(e => e.empresa === empresaFilter));
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.cliente.toLowerCase().includes(q));
    }
    list = list.filter(c => c.subtotal > 0 && !esInterno(c.cliente));
    return list.sort((a, b) => b.subtotal - a.subtotal);
  }, [clientesData, empresaFilter, clientSearch]);

  const clientesForKPI = useMemo(() => [...clientesFiltered].sort((a, b) => b.subtotal - a.subtotal), [clientesFiltered]);
  const totalVentas = clientesForKPI.reduce((s, c) => s + c.subtotal, 0);
  const topClient = clientesForKPI[0] || null;
  const top5Pct = totalVentas > 0 ? (clientesForKPI.slice(0, 5).reduce((s, c) => s + c.subtotal, 0) / totalVentas) * 100 : 0;
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const inactiveClients = clientesForKPI.filter(c => c.lastFecha && c.lastFecha < sixtyDaysAgo);
  const inactiveCount = inactiveClients.length;

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

  // ── Metas modal ────────────────────────────────────────────────────────────

  const openMetas = () => {
    const draft: Record<string, string> = {};
    for (const emp of metasAuto) {
      // If user has overrides, show blank (meaning "using custom metas")
      // Otherwise show empty to use suggested rate
      draft[emp.empresa] = "";
    }
    setMetaRateDraft(draft);
    setShowMetas(true);
  };

  const saveMetas = async () => {
    setSavingMetas(true);
    // Build monthly metas payload from rate adjustments
    const payload: { empresa: string; año: number; mes: number; meta: number }[] = [];

    for (const emp of metasAuto) {
      const customRateStr = metaRateDraft[emp.empresa];
      const customRate = customRateStr !== "" && customRateStr !== undefined ? parseFloat(customRateStr) / 100 : null;
      const rate = customRate !== null && !isNaN(customRate) ? customRate : emp.suggestedRate;

      for (let m = 0; m < 12; m++) {
        const prevMonthVal = emp.monthlyPrevYear[m] ?? 0;
        const meta = prevMonthVal * (1 + rate);
        payload.push({ empresa: emp.empresa, año, mes: m + 1, meta });
      }
    }

    try {
      const res = await fetch("/api/ventas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Metas guardadas");
        setShowMetas(false);
        fetchData();
      } else {
        showToast("No se pudieron guardar las metas. Intenta de nuevo.");
      }
    } catch {
      showToast("Error de conexión. Verifica tu internet e intenta de nuevo.");
    }
    setSavingMetas(false);
  };

  // ── Excel export ───────────────────────────────────────────────────────────

  function exportExcel() {
    const rows: (string | number)[][] = [
      [`FASHION GROUP — Ventas ${año}`],
      [],
      ["Empresa", ...table.periods, "Total", "Margen%"],
    ];
    for (const row of table.tableRows) {
      if (row.total === 0 && empresaFilter === "all") continue;
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
    const dataStartRow = 3;
    const lastDataRow = rows.length - 1;
    const numPeriods = table.periods.length;
    const currFmt = { numFmt: "$#,##0.00" };
    const pctFmt = { numFmt: "0.0%" };
    for (let r = dataStartRow; r <= lastDataRow; r++) {
      const isTotal = r === lastDataRow;
      const base = isTotal ? { font: { bold: true } } : {};
      for (let c = 1; c <= numPeriods + 1; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { ...base, ...currFmt };
      }
      const mCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 2 })];
      if (mCell) mCell.s = { ...base, ...pctFmt };
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

  // ── Render guards ──────────────────────────────────────────────────────────

  if (!authChecked) return null;
  if (role === "secretaria") return null;

  const hasData = ventas.length > 0;
  const isAdmin = role === "admin";
  const pLabel = periodLabel(monthsWithData, año);

  // ── KPI Cards ──────────────────────────────────────────────────────────────

  const margenPts = kpi.prevMargen !== null ? kpi.margenBruto - kpi.prevMargen : null;
  const kpiCards = [
    {
      key: "ventas",
      label: "Ventas Netas",
      subtitle: pLabel,
      value: fmtK(kpi.ventasNetas),
      flag: false,
      trend: null as "up" | "down" | null,
    },
    {
      key: "vsAnterior",
      label: `vs ${año - 1}`,
      subtitle: `mismo período`,
      value: kpi.vsAnterior === null ? "—" : `${kpi.vsAnterior >= 0 ? "▲+" : "▼"}${kpi.vsAnterior.toFixed(1)}%`,
      flag: kpi.vsAnterior !== null && kpi.vsAnterior < -20,
      trend: kpi.vsAnterior === null ? null : kpi.vsAnterior >= 0 ? ("up" as const) : ("down" as const),
    },
    {
      key: "utilidad",
      label: "Utilidad",
      subtitle: pLabel,
      value: fmtK(kpi.totalUtil),
      flag: false,
      trend: null as "up" | "down" | null,
    },
    {
      key: "margen",
      label: "Margen Bruto",
      subtitle: margenPts !== null
        ? `${margenPts >= 0 ? "▲+" : "▼"}${margenPts.toFixed(1)} pts vs ${año - 1}`
        : "sin comparación",
      value: `${kpi.margenBruto.toFixed(1)}%`,
      flag: margenPts !== null && margenPts < 0,
      trend: margenPts !== null ? (margenPts >= 0 ? ("up" as const) : ("down" as const)) : null,
    },
    {
      key: "vsMeta",
      label: "vs Meta",
      subtitle: kpi.metaTotal > 0 ? `meta: ${fmtK(kpi.metaTotal)}` : "sin metas",
      value: kpi.metaTotal > 0 ? `${kpi.vsMeta.toFixed(0)}%` : "N/A",
      flag: kpi.metaTotal > 0 && kpi.vsMeta < 80,
      trend: kpi.metaTotal > 0 ? (kpi.vsMeta >= 100 ? ("up" as const) : kpi.vsMeta < 80 ? ("down" as const) : null) : null,
    },
  ];

  // ── YoY and vs Meta columns for the table ──────────────────────────────────

  function yoyBadge(current: number, prev: number) {
    if (!prev || !current) return { text: "—", color: "text-gray-400" };
    const pct = ((current - prev) / prev) * 100;
    if (pct >= 0) return { text: `▲+${pct.toFixed(0)}%`, color: "text-green-600 bg-green-50" };
    return { text: `▼${pct.toFixed(0)}%`, color: "text-red-600 bg-red-50" };
  }

  function metaBadge(current: number, meta: number) {
    if (!meta) return { text: "—", color: "text-gray-400" };
    const pct = (current / meta) * 100;
    if (pct >= 100) return { text: `${pct.toFixed(0)}%`, color: "text-green-700 bg-green-50" };
    if (pct >= 80) return { text: `${pct.toFixed(0)}%`, color: "text-amber-700 bg-amber-50" };
    return { text: `${pct.toFixed(0)}%`, color: "text-red-700 bg-red-50" };
  }

  return (
    <>
      <AppHeader module="Ventas" />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Dashboard de Ventas</h1>
          <div className="flex items-center gap-2 print:hidden">
            {isAdmin && (
              <>
                <button onClick={exportExcel}
                  className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all">
                  ↓ Excel
                </button>
                <button onClick={openMetas}
                  className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all">
                  ⚙ Metas
                </button>
              </>
            )}
            <button onClick={() => window.open(`/ventas/reporte?anio=${año}&empresa=${empresaFilter}&vista=${vista}`, "_blank")}
              className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all">
              Imprimir
            </button>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          {/* Year selector */}
          <select
            value={año}
            onChange={e => setAño(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-md px-3 py-2 min-h-[44px] bg-white font-medium"
          >
            {(años.length ? años : [año]).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Company dropdown */}
          <select
            value={empresaFilter}
            onChange={e => setEmpresaFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-3 py-2 min-h-[44px] bg-white"
          >
            <option value="all">Todas las empresas</option>
            {EMPRESAS.map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>

          {/* Mensual/Trimestral toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-md p-1">
            {(["mensual", "quarter"] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 min-h-[36px] text-xs rounded-md transition ${v === vista ? "bg-white shadow font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                {v === "mensual" ? "Mensual" : "Trimestral"}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────── */}
        {loading ? <SkeletonKPI count={5} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 tabular-nums">
            {kpiCards.map(k => (
              <div key={k.key} className={`rounded-lg p-3 border ${k.flag ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-gray-50"}`}>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">{k.label}</p>
                <div className="flex items-center gap-1">
                  <p className={`text-xl font-semibold tabular-nums ${
                    k.trend === "up" ? "text-green-600" : k.trend === "down" ? "text-red-600" : ""
                  }`}>
                    {k.value}
                  </p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{k.subtitle}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Period indicator ──────────────────────────────────────── */}
        {!loading && monthsWithData.length > 0 && (
          <p className="text-xs text-gray-500 mb-4">
            Mostrando {pLabel}
            {kpi.hasPrevData
              ? ` · comparando vs ${periodLabel(monthsWithData, año - 1)}`
              : " · sin datos comparativos"}
          </p>
        )}

        {/* ── Chart ─────────────────────────────────────────────────── */}
        {!loading && hasData && (
          <div className="mb-6 border border-gray-200 rounded-lg p-3 sm:p-4 print:hidden">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Ventas mensuales {año}</p>
            <ResponsiveContainer width="100%" height={typeof window !== "undefined" && window.innerWidth < 640 ? 160 : 220}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={40} />
                <RTooltip formatter={(v) => [`$${fmt(Number(v))}`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="ventas" fill="#1a1a1a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="prev" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-1 text-center">Negro: {año} · Gris: {año - 1}</p>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
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
                    <button onClick={() => setAño(lastYear)}
                      className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]">
                      Ver {lastYear}
                    </button>
                    <button onClick={() => router.push("/upload?tab=ventas&from=ventas")}
                      className="text-sm border border-gray-200 text-gray-600 px-5 py-2.5 rounded-md font-medium hover:bg-gray-50 transition-all min-h-[44px]">
                      Cargar datos de {año}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-4">Carga un CSV de ventas para ver el dashboard</p>
                  <button onClick={() => router.push("/upload?tab=ventas&from=ventas")}
                    className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]">
                    Cargar datos
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* ── Tab Bar ───────────────────────────────────────────────── */}
        {hasData && !loading && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 max-w-xs print:hidden">
            <button onClick={() => setActiveTab("resumen")}
              className={`flex-1 py-2.5 px-4 min-h-[44px] text-sm rounded-md transition ${activeTab === "resumen" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>
              Resumen
            </button>
            <button onClick={() => setActiveTab("clientes")}
              className={`flex-1 py-2.5 px-4 min-h-[44px] text-sm rounded-md transition ${activeTab === "clientes" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>
              Clientes
            </button>
          </div>
        )}

        {/* ── Resumen Tab ───────────────────────────────────────────── */}
        {activeTab === "resumen" && hasData && (
          <>
            {/* Ventas/Utilidad toggle */}
            <div className="flex items-center justify-between mb-3 print:hidden">
              <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                <button
                  onClick={() => setResumenMode("ventas")}
                  className={`px-3 py-1 text-xs rounded-md transition ${resumenMode === "ventas" ? "bg-white shadow font-medium" : "text-gray-500"}`}
                >
                  Ventas
                </button>
                <button
                  onClick={() => setResumenMode("utilidad")}
                  className={`px-3 py-1 text-xs rounded-md transition ${resumenMode === "utilidad" ? "bg-white shadow font-medium" : "text-gray-500"}`}
                >
                  Utilidad
                </button>
              </div>
            </div>

            {loading ? <SkeletonTable rows={9} cols={vista === "quarter" ? 7 : 15} /> : (
              <div className="overflow-x-auto mb-6 border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200 bg-white">
                      <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-white z-20 min-w-[140px]">Empresa</th>
                      {table.periods.map(p => (
                        <th key={p} className="text-right px-2 py-2 font-medium text-gray-500 whitespace-nowrap">{p}</th>
                      ))}
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Margen%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">vs {año - 1}</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">vs Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.tableRows.map(row => {
                      if (row.total === 0 && empresaFilter === "all") return null;
                      const displayValues = resumenMode === "ventas" ? row.values : row.utilValues;
                      const prevDisplayValues = resumenMode === "ventas" ? row.prevValues : row.prevUtilValues;
                      const displayTotal = resumenMode === "ventas" ? row.total : row.totalUtil;
                      const yoy = yoyBadge(row.total, row.prevTotal);
                      const meta = metaBadge(row.total, row.metaTotal);

                      return (
                        <tr key={row.empresa} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap z-10">{row.empresa}</td>
                          {displayValues.map((v, i) => {
                            const prev = prevDisplayValues[i];
                            const cell = fmtCell(v);
                            const drop = v > 0 && prev > 0 && v < prev * 0.9;
                            const grow = v > 0 && prev > 0 && v > prev * 1.1;
                            const cellBg = drop ? "bg-red-50" : grow ? "bg-green-50" : "";
                            return (
                              <td key={i} className={`text-right px-2 py-2 tabular-nums ${cell.isZero ? "text-gray-300" : "text-gray-600"} ${cellBg}`}>
                                {cell.text}
                              </td>
                            );
                          })}
                          <td className="text-right px-3 py-2 font-medium tabular-nums">
                            {fmtCell(displayTotal).isZero
                              ? <span className="text-gray-300">—</span>
                              : fmtK(displayTotal)}
                          </td>
                          <td className={`text-right px-3 py-2 tabular-nums ${row.margen < 15 ? "text-red-600 bg-red-50" : "text-gray-600"}`}>
                            {row.total ? `${row.margen.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-right px-3 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${yoy.color}`}>
                              {yoy.text}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${meta.color}`}>
                              {meta.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Total row */}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-gray-50 z-10">TOTAL</td>
                      {(resumenMode === "ventas" ? table.totalValues : table.totalUtilValues).map((v, i) => {
                        const cell = fmtCell(v);
                        return (
                          <td key={i} className={`text-right px-2 py-2 tabular-nums ${cell.isZero ? "text-gray-300" : ""}`}>
                            {cell.isZero ? "—" : fmtK(v)}
                          </td>
                        );
                      })}
                      <td className="text-right px-3 py-2 tabular-nums">
                        {fmtK(resumenMode === "ventas" ? table.grandTotal : table.grandUtil)}
                      </td>
                      <td className={`text-right px-3 py-2 tabular-nums ${table.grandMargen < 15 ? "text-red-600" : ""}`}>
                        {table.grandTotal ? `${table.grandMargen.toFixed(1)}%` : "—"}
                      </td>
                      <td className="text-right px-3 py-2">
                        {(() => {
                          const yoy = yoyBadge(table.grandTotal, table.grandPrevTotal);
                          return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${yoy.color}`}>{yoy.text}</span>;
                        })()}
                      </td>
                      <td className="text-right px-3 py-2">
                        {(() => {
                          const meta = metaBadge(table.grandTotal, table.grandMetaTotal);
                          return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${meta.color}`}>{meta.text}</span>;
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Clientes Tab ──────────────────────────────────────────── */}
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
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Concentracion Top 5</p>
                <p className={`text-xl font-semibold ${top5Pct > 60 ? "text-amber-600" : ""}`}>{top5Pct.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">del total de ventas</p>
              </div>
              <div className={`rounded-lg p-3 cursor-pointer transition ${showInactive ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"}`}
                onClick={() => setShowInactive(!showInactive)}>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Sin compra 60+ dias</p>
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
                  <th className="text-right px-3 py-2 min-h-[44px] cursor-pointer whitespace-nowrap" onClick={() => toggleClientSort("fecha")}>Ultima Compra {clientSort === "fecha" ? (clientSortDir === "desc" ? "↓" : "↑") : "↕"}</th>
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
                          {isInactive && <span className="text-red-400 text-[10px] ml-1" title="Sin compra 60+ dias">▼</span>}
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

      {/* ── Metas Modal ───────────────────────────────────────────────── */}
      <Modal open={showMetas} onClose={() => setShowMetas(false)} title={`Metas ${año} — Tasas de crecimiento`} maxWidth="max-w-3xl">
        <div className="mb-4">
          <p className="text-xs text-gray-500">
            Las metas se calculan automaticamente usando el CAGR historico de cada empresa.
            Puedes ajustar la tasa manualmente. Dejar vacio usa la tasa sugerida.
          </p>
          <div className="flex gap-4 mt-2 text-[11px] text-gray-400">
            <span>CAGR promedio del grupo: <strong className="text-gray-600">{(metasAutoMeta.groupAvgCAGR * 100).toFixed(1)}%</strong></span>
            <span>Techo: <strong className="text-gray-600">{(metasAutoMeta.ceiling * 100).toFixed(1)}%</strong></span>
            <span>Piso: <strong className="text-gray-600">0%</strong></span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left px-2 py-2 font-medium text-gray-500">Empresa</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500">CAGR</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500">Tasa sugerida</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500 w-28">Tu ajuste (%)</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500">Meta anual</th>
              </tr>
            </thead>
            <tbody>
              {metasAuto.map(emp => {
                const customRateStr = metaRateDraft[emp.empresa] ?? "";
                const customRate = customRateStr !== "" ? parseFloat(customRateStr) / 100 : null;
                const effectiveRate = customRate !== null && !isNaN(customRate) ? customRate : emp.suggestedRate;
                const annualMeta = emp.monthlyPrevYear.reduce((s, v) => s + v * (1 + effectiveRate), 0);
                const cagrLabel = emp.cagr === 0.05 && emp.monthlyPrevYear.every(v => v === 0)
                  ? "default"
                  : emp.cagr > metasAutoMeta.ceiling
                    ? "techo"
                    : emp.cagr < 0
                      ? "piso"
                      : "";

                return (
                  <tr key={emp.empresa} className="border-b border-gray-50">
                    <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{emp.empresa}</td>
                    <td className="text-right px-2 py-2 tabular-nums text-gray-600">
                      {(emp.cagr * 100).toFixed(1)}%
                      {cagrLabel && <span className="text-[10px] text-gray-400 ml-1">({cagrLabel})</span>}
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums font-medium">
                      {(emp.suggestedRate * 100).toFixed(1)}%
                    </td>
                    <td className="text-right px-2 py-2">
                      <input
                        type="number"
                        step="0.1"
                        placeholder={(emp.suggestedRate * 100).toFixed(1)}
                        value={customRateStr}
                        onChange={e => setMetaRateDraft(prev => ({ ...prev, [emp.empresa]: e.target.value }))}
                        className="w-full text-right text-xs border border-gray-200 rounded px-2 py-1"
                      />
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums text-gray-600">
                      {fmtK(annualMeta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowMetas(false)}
            className="text-xs border border-gray-200 rounded-md px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-all">
            Cancelar
          </button>
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
