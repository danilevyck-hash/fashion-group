"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";

const RechartsChart = dynamic(() => import("recharts").then((mod) => {
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod;
  return function Chart({ data, year }: { data: { mes: string; actual: number | null; anterior: number | null }[]; year: number }) {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="actual" name={String(year)} fill="#1B3A5C" radius={[3,3,0,0]} />
          <Bar dataKey="anterior" name={String(year - 1)} fill="#D1D5DB" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };
}), { ssr: false, loading: () => <div className="animate-pulse h-[300px] bg-gray-100 rounded-xl" /> });
const EMPRESAS = ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep", "Confecciones Boston", "Multifashion"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface VentaRecord { id: string; empresa: string; año: number; mes: number; ventas_brutas: number; notas_credito: number; notas_debito: number; costo_total: number; }
interface ClienteRecord { empresa: string; año: number; mes: number; cliente: string; ventas: number; }
interface MetaRecord { empresa: string; año: number; mes: number; meta: number; }

function ventasNetas(r: VentaRecord) { return r.ventas_brutas - r.notas_credito + r.notas_debito; }
function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtD(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtK(n: number) { if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`; if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`; return `$${fmt(n)}`; }

export default function VentasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [ventas, setVentas] = useState<VentaRecord[]>([]);
  const [ventasAnt, setVentasAnt] = useState<VentaRecord[]>([]);
  const [años, setAños] = useState<number[]>([]);
  const [metas, setMetas] = useState<MetaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmpresa, setExpandedEmpresa] = useState<string | null>(null);
  const [expandedMes, setExpandedMes] = useState<number>(new Date().getMonth() + 1);
  const [clientes, setClientes] = useState<ClienteRecord[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [activeTab, setActiveTab] = useState<"manual" | "csv" | "metas">("manual");
  const [toast, setToast] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(true);

  // Form state — manual entry
  const [fEmpresa, setFEmpresa] = useState(EMPRESAS[0]);
  const [fAño, setFAño] = useState(new Date().getFullYear());
  const [fMes, setFMes] = useState(new Date().getMonth() + 1);
  const [fVentas, setFVentas] = useState("");
  const [fNC, setFNC] = useState("0");
  const [fND, setFND] = useState("0");
  const [fCosto, setFCosto] = useState("");
  const [saving, setSaving] = useState(false);

  // CSV upload state
  const [csvEmpresa, setCsvEmpresa] = useState(EMPRESAS[0]);
  const [csvAño, setCsvAño] = useState(new Date().getFullYear());
  const [csvMes, setCsvMes] = useState(Math.max(1, new Date().getMonth()));
  const [csvParsed, setCsvParsed] = useState<{ tipo: string; cliente: string; subtotal: number; costo: number }[] | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  // Metas state
  const [metaEmpresa, setMetaEmpresa] = useState(EMPRESAS[0]);
  const [metaAño, setMetaAño] = useState(new Date().getFullYear());
  const [metaValues, setMetaValues] = useState<number[]>(Array(12).fill(0));
  const [savingMetas, setSavingMetas] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r); setAuthChecked(true);
  }, [router]);

  const isAdmin = role === "admin" || role === "director";

  const loadData = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const [añosRes, ventasRes, ventasAntRes, metasRes] = await Promise.all([
        fetch("/api/ventas/años"),
        fetch(`/api/ventas?año=${year}`),
        fetch(`/api/ventas?año=${year - 1}`),
        fetch(`/api/ventas/metas?año=${year}`),
      ]);
      if (añosRes.ok) { const d = await añosRes.json(); setAños(Array.isArray(d) ? d : []); }
      if (ventasRes.ok) { const d = await ventasRes.json(); setVentas(Array.isArray(d) ? d : []); }
      if (ventasAntRes.ok) { const d = await ventasAntRes.json(); setVentasAnt(Array.isArray(d) ? d : []); }
      if (metasRes.ok) { const d = await metasRes.json(); setMetas(Array.isArray(d) ? d : []); }
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) loadData(selectedYear); }, [authChecked, selectedYear, loadData]);

  // Load top clients when expanding
  useEffect(() => {
    if (!expandedEmpresa || !expandedMes) return;
    setLoadingClientes(true);
    fetch(`/api/ventas/clientes?empresa=${encodeURIComponent(expandedEmpresa)}&año=${selectedYear}&mes=${expandedMes}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setClientes(Array.isArray(d) ? d : []))
      .catch(() => setClientes([]))
      .finally(() => setLoadingClientes(false));
  }, [expandedEmpresa, expandedMes, selectedYear]);

  // Load metas for selected empresa
  useEffect(() => {
    const empMetas = (metas || []).filter((m) => m.empresa === metaEmpresa && m.año === metaAño);
    const vals = Array(12).fill(0);
    empMetas.forEach((m) => { if (m.mes >= 1 && m.mes <= 12) vals[m.mes - 1] = m.meta; });
    setMetaValues(vals);
  }, [metaEmpresa, metaAño, metas]);

  if (!authChecked) return null;

  const currentMonth = new Date().getMonth() + 1;

  // KPI computations (defensive: treat arrays as possibly empty)
  const safeVentas = ventas || [];
  const safeVentasAnt = ventasAnt || [];
  const safeMetas = metas || [];

  const ytdVentas = safeVentas.filter((v) => v.mes <= currentMonth);
  const ytdTotal = ytdVentas.reduce((s, v) => s + ventasNetas(v), 0);
  const ytdAntTotal = safeVentasAnt.filter((v) => v.mes <= currentMonth).reduce((s, v) => s + ventasNetas(v), 0);
  const ytdChange = ytdAntTotal > 0 ? ((ytdTotal - ytdAntTotal) / ytdAntTotal) * 100 : 0;
  const ytdDelta = ytdTotal - ytdAntTotal;

  // Best month
  const monthTotals = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    total: safeVentas.filter((v) => v.mes === i + 1).reduce((s, v) => s + ventasNetas(v), 0),
  })).filter((m) => m.total > 0);
  const bestMonth = monthTotals.length > 0 ? [...monthTotals].sort((a, b) => b.total - a.total)[0] : undefined;

  // Meta YTD
  const metaYTD = safeMetas.filter((m) => m.mes <= currentMonth).reduce((s, m) => s + m.meta, 0);
  const metaPct = metaYTD > 0 ? (ytdTotal / metaYTD) * 100 : 0;

  // Table: company rows sorted by total desc
  const empresaRows = EMPRESAS.map((emp) => {
    const empVentas = safeVentas.filter((v) => v.empresa === emp);
    const months = Array.from({ length: 12 }, (_, i) => {
      const mv = empVentas.filter((v) => v.mes === i + 1);
      return mv.length > 0 ? mv.reduce((s, v) => s + ventasNetas(v), 0) : null;
    });
    const total = empVentas.reduce((s, v) => s + ventasNetas(v), 0);
    const totalBruta = empVentas.reduce((s, v) => s + v.ventas_brutas, 0);
    const totalCosto = empVentas.reduce((s, v) => s + v.costo_total, 0);
    const margen = totalBruta > 0 ? ((totalBruta - totalCosto) / totalBruta) * 100 : 0;
    return { empresa: emp, months, total, margen };
  }).sort((a, b) => b.total - a.total);

  const groupTotal = empresaRows.reduce((s, r) => s + r.total, 0);

  // Chart data
  const chartData = MESES.map((label, i) => {
    const mes = i + 1;
    const actual = safeVentas.filter(v => v.mes === mes).reduce((s, v) => s + ventasNetas(v), 0) || null;
    const anterior = safeVentasAnt.filter(v => v.mes === mes).reduce((s, v) => s + ventasNetas(v), 0) || null;
    return { mes: label, actual, anterior };
  });

  // CSV parser
  function parseCSV(text: string) {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    const rows: { tipo: string; cliente: string; subtotal: number; costo: number }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";");
      if (cols.length < 10) continue;
      const tipo = (cols[1] || "").trim().replace(/\s+/g, " ");
      const tipoNorm = tipo.toLowerCase();
      if (tipoNorm !== "factura" && !tipoNorm.includes("cr") && !tipoNorm.includes("d")) continue;
      if (tipoNorm !== "factura" && !tipoNorm.includes("édito") && !tipoNorm.includes("ebito") && !tipoNorm.includes("edito")) continue;
      const cliente = (cols[6] || "").trim().replace(/\s+/g, " ");
      const costo = parseFloat((cols[7] || "0").replace(/,/g, "")) || 0;
      const subtotal = parseFloat((cols[9] || "0").replace(/,/g, "")) || 0;
      rows.push({ tipo, cliente, subtotal, costo });
    }
    return rows;
  }

  async function saveManual() {
    if (!fVentas) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: fEmpresa, año: fAño, mes: fMes, ventas_brutas: parseFloat(fVentas) || 0, notas_credito: parseFloat(fNC) || 0, notas_debito: parseFloat(fND) || 0, costo_total: parseFloat(fCosto) || 0 }),
      });
      if (res.ok) { showToast("Guardado"); loadData(selectedYear); setFVentas(""); setFCosto(""); }
    } catch { /* */ }
    setSaving(false);
  }

  async function uploadCSV() {
    if (!csvParsed?.length) return;
    setCsvUploading(true);
    try {
      const res = await fetch("/api/ventas/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: csvEmpresa, año: csvAño, mes: csvMes, rows: csvParsed }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.summary?.facturas || 0} facturas procesadas`);
        setCsvParsed(null);
        loadData(selectedYear);
      }
    } catch { /* */ }
    setCsvUploading(false);
  }

  async function saveMetas() {
    setSavingMetas(true);
    const body = metaValues.map((meta, i) => ({ empresa: metaEmpresa, año: metaAño, mes: i + 1, meta })).filter((m) => m.meta > 0);
    try {
      const res = await fetch("/api/ventas/metas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { showToast("Metas guardadas"); loadData(selectedYear); }
    } catch { /* */ }
    setSavingMetas(false);
  }

  const csvSummary = (() => {
    if (!csvParsed) return null;
    const facturas = csvParsed.filter((r) => r.tipo.trim().replace(/\s+/g, " ") === "Factura");
    const ncs = csvParsed.filter((r) => { const t = r.tipo.trim().replace(/\s+/g, " ").toLowerCase(); return t.includes("crédito") || t.includes("credito"); });
    return {
      facturas: facturas.length,
      ncs: ncs.length,
      ventasBrutas: facturas.reduce((s, r) => s + r.subtotal, 0),
      nc: ncs.reduce((s, r) => s + Math.abs(r.subtotal), 0),
    };
  })();

  // Manual form preview
  const manualNetas = (parseFloat(fVentas) || 0) - (parseFloat(fNC) || 0) + (parseFloat(fND) || 0);
  const manualMargen = (parseFloat(fVentas) || 0) > 0 ? (((parseFloat(fVentas) || 0) - (parseFloat(fCosto) || 0)) / (parseFloat(fVentas) || 0)) * 100 : 0;

  return (
    <div>
      <AppHeader module="Ventas" />
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Year selector */}
        <div className="flex items-center gap-2 mb-8">
          {(años.length > 0 ? años : [new Date().getFullYear()]).map((y) => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className={`px-4 py-1.5 text-sm rounded-full transition ${selectedYear === y ? "bg-black text-white font-medium" : "text-gray-400 hover:text-black"}`}>
              {y}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl" />)}</div>
        ) : (<>

          {/* KPIs — admin only */}
          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8">
              <div className="border border-gray-200 rounded-xl px-4 py-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Ventas Netas YTD</div>
                <div className="text-xl font-semibold mt-0.5 tabular-nums">${fmt(ytdTotal)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">acumulado {selectedYear}</div>
              </div>
              <div className="border border-gray-200 rounded-xl px-4 py-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">vs Año Anterior</div>
                {ytdAntTotal > 0 ? (<>
                  <div className={`text-xl font-semibold mt-0.5 tabular-nums ${ytdChange >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {ytdChange >= 0 ? "+" : ""}{ytdChange.toFixed(1)}% {ytdChange >= 0 ? "↑" : "↓"}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${ytdDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>{ytdDelta >= 0 ? "+" : ""}${fmt(ytdDelta)}</div>
                </>) : (
                  <div className="text-sm text-gray-300 mt-1">Sin datos {selectedYear - 1}</div>
                )}
              </div>
              <div className="border border-gray-200 rounded-xl px-4 py-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Mejor Mes</div>
                {bestMonth ? (<>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums">${fmt(bestMonth?.total ?? 0)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{bestMonth?.mes ? MESES_FULL[bestMonth.mes - 1] : ''}</div>
                </>) : <div className="text-sm text-gray-300 mt-1">Sin datos</div>}
              </div>
              <div className="border border-gray-200 rounded-xl px-4 py-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">% vs Meta YTD</div>
                {metaYTD > 0 ? (<>
                  <div className={`text-xl font-semibold mt-0.5 tabular-nums ${metaPct >= 90 ? "text-emerald-700" : metaPct >= 70 ? "text-amber-600" : "text-red-600"}`}>{metaPct.toFixed(0)}%</div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                    <div className={`h-1.5 rounded-full transition-all ${metaPct >= 90 ? "bg-emerald-500" : metaPct >= 70 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${Math.min(metaPct, 100)}%` }} />
                  </div>
                </>) : (
                  <div className="text-[11px] text-gray-300 mt-1">Sin metas</div>
                )}
              </div>
            </div>
          )}

          {/* Chart */}
          {isAdmin && safeVentas.length > 0 && (
            <div className="mb-8">
              <button onClick={() => setShowChart(!showChart)} className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1.5 mb-3">
                <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${showChart ? "rotate-90" : ""}`} fill="currentColor"><path d="M3 1l5 4-5 4V1z"/></svg>
                {showChart ? "Ocultar" : "Ver"} gráfica
              </button>
              {showChart && (
                <div className="border border-gray-100 rounded-2xl p-6">
                  <RechartsChart data={chartData} year={selectedYear} />
                </div>
              )}
            </div>
          )}

          {/* Table — admin only */}
          {isAdmin && (
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-8">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500 sticky left-0 bg-gray-50 z-[1] min-w-[140px]">Empresa</th>
                      {MESES.map((m, i) => (
                        <th key={m} className={`text-right px-2 py-2.5 font-medium text-gray-500 min-w-[70px] ${i + 1 === currentMonth ? "bg-blue-50" : ""}`}>{m}</th>
                      ))}
                      <th className="text-right px-3 py-2.5 font-medium text-gray-700 min-w-[90px]">Total</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-500 min-w-[50px]">%</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-500 min-w-[60px]">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresaRows.map((row) => (<>
                      <tr key={row.empresa} onClick={() => setExpandedEmpresa(expandedEmpresa === row.empresa ? null : row.empresa)}
                        className="border-b border-gray-100 hover:bg-gray-50/70 transition cursor-pointer">
                        <td className="px-3 py-2.5 font-medium text-gray-800 sticky left-0 bg-white z-[1]">
                          <span className="flex items-center gap-1.5">
                            <svg width="8" height="8" viewBox="0 0 10 10" className={`text-gray-400 transition-transform ${expandedEmpresa === row.empresa ? "rotate-90" : ""}`} fill="currentColor"><path d="M3 1l5 4-5 4V1z"/></svg>
                            {row.empresa}
                          </span>
                        </td>
                        {row.months.map((v, i) => (
                          <td key={i} className={`text-right px-2 py-2.5 tabular-nums ${v === null ? "text-gray-200" : "text-gray-700"} ${i + 1 === currentMonth ? "bg-blue-50/50" : ""}`}>
                            {v !== null ? fmtK(v) : "—"}
                          </td>
                        ))}
                        <td className="text-right px-3 py-2.5 tabular-nums font-semibold">${fmt(row.total)}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-400">{groupTotal > 0 ? `${((row.total / groupTotal) * 100).toFixed(0)}%` : "—"}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums ${row.margen > 30 ? "text-emerald-600" : row.margen > 20 ? "text-amber-600" : "text-gray-400"}`}>{row.margen.toFixed(1)}%</td>
                      </tr>
                      {/* Client drill-down */}
                      {expandedEmpresa === row.empresa && (
                        <tr key={`${row.empresa}-detail`}>
                          <td colSpan={16} className="bg-gray-50/80 px-6 py-4 border-b border-gray-200">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-medium text-gray-500">Top clientes —</span>
                              <div className="flex gap-1">
                                {MESES.map((m, i) => {
                                  const hasData = safeVentas.some((v) => v.empresa === row.empresa && v.mes === i + 1);
                                  if (!hasData) return null;
                                  return (
                                    <button key={i} onClick={(e) => { e.stopPropagation(); setExpandedMes(i + 1); }}
                                      className={`px-2 py-0.5 text-[10px] rounded transition ${expandedMes === i + 1 ? "bg-black text-white" : "bg-gray-200 text-gray-500 hover:bg-gray-300"}`}>
                                      {m}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {loadingClientes ? (
                              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-4 bg-gray-200 rounded w-2/3" />)}</div>
                            ) : clientes.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin datos de clientes para este periodo — sube un CSV con desglose por cliente para ver el top</p>
                            ) : (
                              <table className="w-full text-xs max-w-lg">
                                <thead><tr className="border-b border-gray-200 text-gray-400"><th className="text-left py-1 w-8">#</th><th className="text-left py-1">Cliente</th><th className="text-right py-1">Ventas</th><th className="text-right py-1">%</th></tr></thead>
                                <tbody>
                                  {clientes.map((c, i) => {
                                    const empTotal = clientes.reduce((s, x) => s + x.ventas, 0);
                                    return (
                                      <tr key={c.cliente} className="border-b border-gray-100">
                                        <td className="py-1.5 text-gray-300">{i + 1}</td>
                                        <td className="py-1.5 font-medium">{c.cliente}</td>
                                        <td className="py-1.5 text-right tabular-nums">${fmt(c.ventas)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-400">{empTotal > 0 ? `${((c.ventas / empTotal) * 100).toFixed(1)}%` : ""}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>))}
                    {/* TOTAL row */}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-2.5 sticky left-0 bg-gray-50 z-[1]">TOTAL</td>
                      {MESES.map((_, i) => {
                        const total = safeVentas.filter((v) => v.mes === i + 1).reduce((s, v) => s + ventasNetas(v), 0);
                        return <td key={i} className={`text-right px-2 py-2.5 tabular-nums ${i + 1 === currentMonth ? "bg-blue-50/50" : ""}`}>{total > 0 ? fmtK(total) : "—"}</td>;
                      })}
                      <td className="text-right px-3 py-2.5 tabular-nums">${fmt(groupTotal)}</td>
                      <td className="text-right px-3 py-2.5">100%</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{(() => { const tb = safeVentas.reduce((s, v) => s + v.ventas_brutas, 0); const tc = safeVentas.reduce((s, v) => s + v.costo_total, 0); return tb > 0 ? `${((tb - tc) / tb * 100).toFixed(1)}%` : "—"; })()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Entry Section */}
          <div className="border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-sm font-semibold">Cargar Datos</h2>
              <div className="flex gap-1">
                {(["manual", "csv", "metas"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 text-xs rounded-lg transition ${activeTab === tab ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {tab === "manual" ? "Entrada Manual" : tab === "csv" ? "Cargar CSV" : "Metas"}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Entry */}
            {activeTab === "manual" && (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Empresa</label>
                    <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                      {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Año</label>
                    <input type="number" value={fAño} onChange={(e) => setFAño(parseInt(e.target.value) || new Date().getFullYear())} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Mes</label>
                    <select value={fMes} onChange={(e) => setFMes(parseInt(e.target.value))} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                      {MESES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Ventas Brutas</label>
                    <input type="number" step="0.01" value={fVentas} onChange={(e) => setFVentas(e.target.value)} placeholder="0.00" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Notas de Credito</label>
                    <input type="number" step="0.01" value={fNC} onChange={(e) => setFNC(e.target.value)} placeholder="0" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Notas de Debito</label>
                    <input type="number" step="0.01" value={fND} onChange={(e) => setFND(e.target.value)} placeholder="0" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Costo Total</label>
                    <input type="number" step="0.01" value={fCosto} onChange={(e) => setFCosto(e.target.value)} placeholder="0.00" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                </div>
                {fVentas && <p className="text-xs text-gray-400 mb-4">Ventas Netas: ${fmtD(manualNetas)} | Margen: {manualMargen.toFixed(1)}%</p>}
                <button onClick={saveManual} disabled={saving || !fVentas} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            )}

            {/* CSV Upload */}
            {activeTab === "csv" && (
              <div>
                <div className="bg-gray-50 rounded-xl p-4 mb-4 text-xs text-gray-500 leading-relaxed">
                  <p className="font-medium text-gray-700 mb-1">Como exportar desde Switch Soft:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Reportes → Listado de Comprobantes</li>
                    <li>Filtrar por el mes deseado</li>
                    <li>Clic en Descargar (primer boton)</li>
                    <li>El archivo se llama comprobantes_1_XXXXXXX.csv</li>
                  </ol>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Empresa</label>
                    <select value={csvEmpresa} onChange={(e) => setCsvEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                      {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Año</label>
                    <input type="number" value={csvAño} onChange={(e) => setCsvAño(parseInt(e.target.value) || new Date().getFullYear())} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Mes</label>
                    <select value={csvMes} onChange={(e) => setCsvMes(parseInt(e.target.value))} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                      {MESES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Archivo CSV</label>
                    <input type="file" accept=".csv" onChange={async (e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const text = await f.text();
                      setCsvParsed(parseCSV(text));
                    }} className="w-full text-xs py-1.5" />
                  </div>
                </div>
                {csvSummary && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <p className="text-xs text-gray-700 font-medium mb-1">{csvSummary.facturas} facturas | {csvSummary.ncs} notas de credito</p>
                    <p className="text-xs text-gray-500">Ventas Brutas: ${fmtD(csvSummary.ventasBrutas)} | NC: ${fmtD(csvSummary.nc)} | Netas: ${fmtD(csvSummary.ventasBrutas - csvSummary.nc)}</p>
                  </div>
                )}
                <button onClick={uploadCSV} disabled={csvUploading || !csvParsed?.length} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 flex items-center gap-2">
                  {csvUploading && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {csvUploading ? "Procesando..." : "Confirmar y subir"}
                </button>
              </div>
            )}

            {/* Metas */}
            {activeTab === "metas" && (
              <div>
                <div className="grid grid-cols-2 gap-4 mb-4 max-w-sm">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Empresa</label>
                    <select value={metaEmpresa} onChange={(e) => setMetaEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                      {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Año</label>
                    <input type="number" value={metaAño} onChange={(e) => setMetaAño(parseInt(e.target.value) || new Date().getFullYear())} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mb-4">
                  {MESES.map((m, i) => (
                    <div key={i}>
                      <label className="text-[9px] text-gray-400 block mb-0.5 text-center">{m}</label>
                      <input type="number" step="100" value={metaValues[i] || ""} onChange={(e) => { const v = [...metaValues]; v[i] = parseFloat(e.target.value) || 0; setMetaValues(v); }}
                        className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-gray-300" placeholder="0" />
                    </div>
                  ))}
                </div>
                <button onClick={saveMetas} disabled={savingMetas} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
                  {savingMetas ? "Guardando..." : "Guardar Metas"}
                </button>
              </div>
            )}
          </div>

        </>)}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
