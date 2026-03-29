"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { SkeletonTable, SkeletonKPI, Toast, Modal } from "@/components/ui";

const EMPRESAS = ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep", "Confecciones Boston", "Multifashion"];
const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface VentaRow { empresa: string; año: number; mes: number; ventas_brutas: number; notas_credito: number; notas_debito: number; costo_total: number; }
interface MetaRow { empresa: string; año: number; mes: number; meta: number; }
interface ClienteRow { empresa: string; año: number; mes: number; cliente: string; ventas: number; }

function netas(r: VentaRow) { return r.ventas_brutas - r.notas_credito + r.notas_debito; }
function utilidad(r: VentaRow) { return netas(r) - r.costo_total; }
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

  // Tendencia de margen vs same period prev year
  const prevUtil = comparablePrev.reduce((s, r) => s + utilidad(r), 0);
  const prevMargen = prevTotal > 0 ? (prevUtil / prevTotal) * 100 : null;
  let tendenciaMargen: string;
  let tendenciaFlag: boolean;
  if (prevMargen !== null) {
    const diff = margenBruto - prevMargen;
    const arrow = diff >= 0 ? "↑" : "↓";
    const sign = diff >= 0 ? "+" : "";
    tendenciaMargen = `${margenBruto.toFixed(1)}% ${arrow}${sign}${diff.toFixed(1)}pp`;
    tendenciaFlag = diff < 0;
  } else {
    tendenciaMargen = `${margenBruto.toFixed(1)}% —`;
    tendenciaFlag = false;
  }

  const metaTotal = metaRows.reduce((s, m) => s + (m.meta || 0), 0);
  const vsMeta = metaTotal ? (ventasNetas / metaTotal) * 100 : 0;

  return { ventasNetas, vsAnterior, margenBruto, tendenciaMargen, tendenciaFlag, metaTotal, vsMeta, prevTotal: comparablePrev.reduce((s, r) => s + netas(r), 0) };
}

function buildTable(rows: VentaRow[], vista: "mensual" | "quarter") {
  const periods = vista === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MES_NAMES;
  const tableRows = EMPRESAS.map(emp => {
    const empRows = rows.filter(r => r.empresa === emp);
    const values = periods.map((_, i) => {
      const filtered = vista === "quarter"
        ? empRows.filter(r => Math.ceil(r.mes / 3) === i + 1)
        : empRows.filter(r => r.mes === i + 1);
      return filtered.reduce((s, r) => s + netas(r), 0);
    });
    const total = values.reduce((s, v) => s + v, 0);
    const totalUtil = empRows.reduce((s, r) => s + utilidad(r), 0);
    const margen = total ? (totalUtil / total) * 100 : 0;
    return { empresa: emp, values, total, margen };
  });

  // Total row
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
  const [empresa, setEmpresa] = useState("all");
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [ventasPrev, setVentasPrev] = useState<VentaRow[]>([]);
  const [años, setAños] = useState<number[]>([]);
  const [metas, setMetas] = useState<MetaRow[]>([]);
  const [showMetas, setShowMetas] = useState(false);
  const [showClientes, setShowClientes] = useState(false);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState<Record<string, number[]>>({});
  const [savingMetas, setSavingMetas] = useState(false);
  const [kpiTooltip, setKpiTooltip] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Fetch available years
  useEffect(() => {
    fetch("/api/ventas/años").then(r => r.json()).then(setAños).catch(() => {});
  }, []);

  // Fetch ventas + metas
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = empresa !== "all" ? `&empresa=${encodeURIComponent(empresa)}` : "";
      const [curr, prev, metasRes] = await Promise.all([
        fetch(`/api/ventas?año=${año}${qs}`).then(r => r.json()),
        fetch(`/api/ventas?año=${año - 1}${qs}`).then(r => r.json()),
        fetch(`/api/ventas/metas?año=${año}`).then(r => r.json()),
      ]);
      setVentas(Array.isArray(curr) ? curr : []);
      setVentasPrev(Array.isArray(prev) ? prev : []);
      setMetas(Array.isArray(metasRes) ? metasRes : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [año, empresa]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered data
  const filtered = useMemo(() => empresa === "all" ? ventas : ventas.filter(r => r.empresa === empresa), [ventas, empresa]);
  const filteredPrev = useMemo(() => empresa === "all" ? ventasPrev : ventasPrev.filter(r => r.empresa === empresa), [ventasPrev, empresa]);
  const filteredMetas = useMemo(() => empresa === "all" ? metas : metas.filter(m => m.empresa === empresa), [metas, empresa]);

  const kpi = useMemo(() => calcKPIs(filtered, filteredPrev, filteredMetas, vista), [filtered, filteredPrev, filteredMetas, vista]);
  const table = useMemo(() => buildTable(filtered, vista), [filtered, vista]);

  // Top clientes
  const fetchClientes = useCallback(async () => {
    if (clientes.length > 0) { setShowClientes(v => !v); return; }
    setLoadingClientes(true);
    setShowClientes(true);
    try {
      // Fetch for all months of the year for the filtered empresa
      const promises = Array.from({ length: 12 }, (_, i) => {
        const emp = empresa === "all" ? EMPRESAS[0] : empresa;
        return fetch(`/api/ventas/clientes?empresa=${encodeURIComponent(emp)}&año=${año}&mes=${i + 1}`).then(r => r.json());
      });
      const all = (await Promise.all(promises)).flat().filter(Array.isArray) as unknown as ClienteRow[];
      // Aggregate by client
      const byClient: Record<string, { ventas: number }> = {};
      (await Promise.all(promises)).flat().forEach((c: any) => {
        if (!c?.cliente) return;
        byClient[c.cliente] = byClient[c.cliente] || { ventas: 0 };
        byClient[c.cliente].ventas += c.ventas || 0;
      });
      const sorted = Object.entries(byClient).sort((a, b) => b[1].ventas - a[1].ventas).slice(0, 10)
        .map(([cliente, d]) => ({ empresa: empresa === "all" ? "" : empresa, año, mes: 0, cliente, ventas: d.ventas }));
      setClientes(sorted);
    } catch { /* ignore */ }
    setLoadingClientes(false);
  }, [empresa, año, clientes.length]);

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
    { key: "ventas", label: "Ventas netas", value: fmtK(kpi.ventasNetas), flag: false, tooltip: "Total de ventas sin ITBMS. Fórmula: Facturas − NC + ND, usando Subtotal." },
    { key: "vsAnterior", label: "vs. Año Ant.", value: kpi.vsAnterior === null ? "—" : `${kpi.vsAnterior >= 0 ? "+" : ""}${kpi.vsAnterior.toFixed(1)}%`, flag: kpi.vsAnterior !== null && kpi.vsAnterior < -20, tooltip: "Compara los mismos meses con datos vs el año pasado." },
    { key: "margen", label: "Margen bruto", value: `${kpi.margenBruto.toFixed(1)}%`, flag: kpi.margenBruto < 20, tooltip: "Utilidad bruta / ventas netas. Indica rentabilidad por dólar vendido." },
    { key: "tendencia", label: "Tendencia margen", value: kpi.tendenciaMargen, flag: kpi.tendenciaFlag, tooltip: "Compara el margen bruto del período actual vs el mismo período del año anterior. Un margen creciente indica mejor control de costos." },
    { key: "vsMeta", label: "vs. Meta", value: kpi.metaTotal ? `${kpi.vsMeta.toFixed(0)}%` : "N/A", flag: kpi.metaTotal > 0 && kpi.vsMeta < 80, tooltip: "Cumplimiento de meta definida. N/A si no hay metas." },
  ];

  const clienteTotal = clientes.reduce((s, c) => s + c.ventas, 0);
  const top3Pct = clienteTotal > 0 ? (clientes.slice(0, 3).reduce((s, c) => s + c.ventas, 0) / kpi.ventasNetas) * 100 : 0;

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
            <button onClick={() => window.open(`/ventas/reporte?año=${año}&empresa=${empresa}&vista=${vista}`, "_blank")}
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
          <select value={empresa} onChange={e => { setEmpresa(e.target.value); setClientes([]); setShowClientes(false); }}
            className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white">
            <option value="all">Todas las empresas</option>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
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
                {kpiTooltip === k.key && <p className="text-[10px] text-gray-400 mt-1">{k.tooltip}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Data Table */}
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
                {table.tableRows.map((row, ri) => {
                  if (row.total === 0 && empresa === "all") return null;
                  return (
                    <tr key={row.empresa} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">{row.empresa}</td>
                      {row.values.map((v, i) => {
                        const prev = i > 0 ? row.values[i - 1] : 0;
                        const drop = v > 0 && prev > 0 && v < prev * 0.85;
                        return <td key={i} className="text-right px-2 py-2 tabular-nums text-gray-600">{v ? fmtK(v) : "—"}{drop ? " \u2193" : ""}</td>;
                      })}
                      <td className="text-right px-3 py-2 font-medium tabular-nums">{fmtK(row.total)}</td>
                      <td className={`text-right px-3 py-2 tabular-nums ${row.margen < 15 ? "bg-red-50 text-red-600" : "text-gray-600"}`}>
                        {row.total ? `${row.margen.toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
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

        {/* Top Clientes */}
        <div className="mb-6 print:hidden">
          <button onClick={fetchClientes} className="text-xs text-gray-500 hover:text-gray-700 transition flex items-center gap-1">
            Top Clientes {showClientes ? "\u25BC" : "\u25B6"}
          </button>
          {showClientes && (
            <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
              {top3Pct > 60 && (
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-700">
                  Los 3 principales clientes representan {top3Pct.toFixed(0)}% del total - alta concentracion
                </div>
              )}
              {loadingClientes ? <SkeletonTable rows={5} cols={4} /> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Cliente</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Ventas B/.</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">% del Total</th>
                  </tr></thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.cliente} className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-700">{c.cliente}</td>
                        <td className="text-right px-3 py-2 tabular-nums">{fmtK(c.ventas)}</td>
                        <td className="text-right px-3 py-2 tabular-nums text-gray-500">
                          {kpi.ventasNetas ? `${((c.ventas / kpi.ventasNetas) * 100).toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                    {clientes.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">Sin datos de clientes</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
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
