"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { fmt, fmtDate } from "@/lib/format";

const EMPRESAS = ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep", "Confecciones Boston", "Multifashion"];
const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface VentaRow { empresa: string; mes: number; ventas_brutas: number; costo: number; utilidad: number; }
interface ClienteDetalle {
  cliente: string;
  subtotal: number;
  utilidad: number;
  ultima_compra?: string;
}

function ReportePage() {
  const params = useSearchParams();
  const año = Number(params.get("anio")) || new Date().getFullYear();
  const empresaFilter = params.get("empresa") || "all";
  const vista = (params.get("vista") as "mensual" | "quarter") || "mensual";

  const [data, setData] = useState<VentaRow[]>([]);
  const [prevData, setPrevData] = useState<VentaRow[]>([]);
  const [metas, setMetas] = useState<{ empresa: string; mes: number; meta: number }[]>([]);
  const [clientesDetalle, setClientesDetalle] = useState<ClienteDetalle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/ventas?anio=${año}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas?anio=${año - 1}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas/metas?anio=${año}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas/v2?anio=${año}`).then(r => r.ok ? r.json() : null),
    ]).then(([d, p, m, v2]: [VentaRow[], VentaRow[], { empresa: string; mes: number; meta: number }[], { clientesDetalle?: ClienteDetalle[] } | null]) => {
      setData(d || []);
      setPrevData(p || []);
      setMetas(m || []);
      setClientesDetalle(v2?.clientesDetalle || []);
      setLoading(false);
    });
  }, [año]);

  const filtered = useMemo(() => empresaFilter === "all" ? data : data.filter(r => r.empresa === empresaFilter), [data, empresaFilter]);
  const filteredPrev = useMemo(() => empresaFilter === "all" ? prevData : prevData.filter(r => r.empresa === empresaFilter), [prevData, empresaFilter]);

  // KPI calculations
  const ventasNetas = filtered.reduce((s, r) => s + (r.ventas_brutas || 0), 0);
  const monthsWithData = [...new Set(filtered.map(r => r.mes))];
  const comparablePrev = filteredPrev.filter(r => monthsWithData.includes(r.mes));
  const prevTotal = comparablePrev.reduce((s, r) => s + (r.ventas_brutas || 0), 0);
  const vsAnterior: number | null = comparablePrev.length > 0 && prevTotal !== 0
    ? ((ventasNetas - prevTotal) / prevTotal) * 100
    : null;
  const totalUtilidad = filtered.reduce((s, r) => s + (r.utilidad || 0), 0);
  const margen = ventasNetas > 0 ? (totalUtilidad / ventasNetas) * 100 : 0;

  const prevUtilidad = comparablePrev.reduce((s, r) => s + (r.utilidad || 0), 0);
  const prevMargen = prevTotal > 0 ? (prevUtilidad / prevTotal) * 100 : null;
  const margenDelta: number | null = prevMargen !== null ? margen - prevMargen : null;

  const metaTotal = metas
    .filter(m => empresaFilter === "all" || m.empresa === empresaFilter)
    .reduce((s, m) => s + (m.meta || 0), 0);
  const vsMeta = metaTotal > 0 ? (ventasNetas / metaTotal) * 100 : 0;

  const empresas = empresaFilter === "all" ? EMPRESAS : [empresaFilter];

  // Top 10 clients from v2 clientesDetalle
  const top10Clients = useMemo(() => {
    return [...clientesDetalle]
      .sort((a, b) => b.subtotal - a.subtotal)
      .slice(0, 10);
  }, [clientesDetalle]);

  if (loading) return <div className="p-12 flex justify-center"><svg className="animate-spin h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

  return (
    <div className="print-report max-w-[900px] mx-auto p-6">
      {/* Print button */}
      <button
        onClick={() => window.print()}
        className="print:hidden mb-4 px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
      >
        Imprimir reporte
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold">Fashion Group — Reporte de Ventas</h1>
          <p className="text-sm text-gray-500">
            {empresaFilter === "all" ? "Todas las empresas" : empresaFilter} — {año}
          </p>
        </div>
        <div className="text-xs text-gray-500 text-right">
          Generado: {new Date().toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")}<br />
          Vista: {vista === "mensual" ? "Mensual" : "Trimestral"}
        </div>
      </div>

      {/* KPIs — order: Ventas Netas | vs Año Anterior | Utilidad Total | Margen Bruto | vs Meta */}
      <div className="grid grid-cols-5 gap-3 mb-6 text-center">
        {/* 1. Ventas Netas */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs uppercase text-gray-500">Ventas Netas</div>
          <div className="text-base font-semibold">${fmt(ventasNetas)}</div>
        </div>

        {/* 2. vs {año - 1} */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs uppercase text-gray-500">vs {año - 1}</div>
          <div className={`text-base font-semibold ${vsAnterior !== null && vsAnterior < -20 ? "text-red-600" : vsAnterior !== null && vsAnterior >= 0 ? "text-green-600" : ""}`}>
            {vsAnterior === null ? "—" : `${vsAnterior > 0 ? "+" : ""}${vsAnterior.toFixed(1)}%`}
          </div>
          {vsAnterior !== null && (
            <div className="text-xs text-gray-500 mt-0.5">{fmt(prevTotal)} ant.</div>
          )}
        </div>

        {/* 3. Utilidad Total */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs uppercase text-gray-500">Utilidad Total</div>
          <div className={`text-base font-semibold ${totalUtilidad < 0 ? "text-red-600" : ""}`}>
            B/. {fmt(totalUtilidad)}
          </div>
        </div>

        {/* 4. Margen Bruto */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs uppercase text-gray-500">Margen Bruto</div>
          <div className={`text-base font-semibold ${margen < 20 ? "text-red-600" : ""}`}>
            {margen.toFixed(1)}%
          </div>
          {margenDelta !== null && (
            <div className={`text-xs mt-0.5 ${margenDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
              {margenDelta > 0 ? "▲" : "▼"} {Math.abs(margenDelta).toFixed(1)} puntos vs ant.
            </div>
          )}
        </div>

        {/* 5. vs Meta */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs uppercase text-gray-500">vs Meta</div>
          <div className={`text-base font-semibold ${vsMeta < 80 && metaTotal > 0 ? "text-red-600" : vsMeta >= 100 && metaTotal > 0 ? "text-green-600" : ""}`}>
            {metaTotal > 0 ? `${vsMeta.toFixed(1)}%` : "—"}
          </div>
          {metaTotal > 0 && (
            <div className="text-xs text-gray-500 mt-0.5">Meta: {fmt(metaTotal)}</div>
          )}
        </div>
      </div>

      {/* Empresa Table */}
      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="text-left py-2 font-semibold">Empresa</th>
            {vista === "mensual"
              ? MES_NAMES.map(m => <th key={m} className="text-right py-2 font-semibold">{m}</th>)
              : ["Q1", "Q2", "Q3", "Q4"].map(q => <th key={q} className="text-right py-2 font-semibold">{q}</th>)
            }
            <th className="text-right py-2 font-semibold">Total</th>
            <th className="text-right py-2 font-semibold">Utilidad B/.</th>
            <th className="text-right py-2 font-semibold">Margen %</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map(emp => {
            const rows = filtered.filter(r => r.empresa === emp);
            const periods = vista === "mensual"
              ? Array.from({ length: 12 }, (_, i) => {
                  const m = rows.filter(r => r.mes === i + 1);
                  return { v: m.reduce((s, r) => s + (r.ventas_brutas || 0), 0), u: m.reduce((s, r) => s + (r.utilidad || 0), 0) };
                })
              : Array.from({ length: 4 }, (_, i) => {
                  const qMonths = [i * 3 + 1, i * 3 + 2, i * 3 + 3];
                  const m = rows.filter(r => qMonths.includes(r.mes));
                  return { v: m.reduce((s, r) => s + (r.ventas_brutas || 0), 0), u: m.reduce((s, r) => s + (r.utilidad || 0), 0) };
                });
            const total = periods.reduce((s, p) => s + p.v, 0);
            const utilTotal = periods.reduce((s, p) => s + p.u, 0);
            const mg = total > 0 ? (utilTotal / total) * 100 : 0;
            return (
              <tr key={emp} className="border-b border-gray-200">
                <td className="py-1.5 font-medium">{emp}</td>
                {periods.map((p, i) => (
                  <td key={i} className={`text-right py-1.5 tabular-nums ${p.v === 0 ? "text-gray-300" : ""}`}>
                    {p.v > 0 ? fmt(p.v) : "—"}
                  </td>
                ))}
                <td className="text-right py-1.5 font-semibold tabular-nums">{fmt(total)}</td>
                <td className="text-right py-1.5 tabular-nums">{fmt(utilTotal)}</td>
                <td className={`text-right py-1.5 tabular-nums ${mg < 15 ? "text-red-600" : ""}`}>
                  {mg > 0 ? mg.toFixed(1) + "%" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Top 10 Clientes */}
      {top10Clients.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Top 10 Clientes del Período</h3>
          <table className="w-full text-xs border-collapse mb-8">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1.5 font-semibold">Cliente</th>
                <th className="text-right py-1.5 font-semibold">Ventas B/.</th>
                <th className="text-right py-1.5 font-semibold">Utilidad B/.</th>
                <th className="text-right py-1.5 font-semibold">Margen %</th>
                <th className="text-right py-1.5 font-semibold">% del Total</th>
                <th className="text-right py-1.5 font-semibold">Última Compra</th>
              </tr>
            </thead>
            <tbody>
              {top10Clients.map(c => {
                const mg = c.subtotal > 0 ? (c.utilidad / c.subtotal) * 100 : 0;
                const pct = ventasNetas > 0 ? (c.subtotal / ventasNetas) * 100 : 0;
                const ultima = c.ultima_compra
                  ? fmtDate(c.ultima_compra)
                  : "—";
                return (
                  <tr key={c.cliente} className="border-b border-gray-200">
                    <td className="py-1.5">{c.cliente}</td>
                    <td className="text-right py-1.5 tabular-nums">{fmt(c.subtotal)}</td>
                    <td className="text-right py-1.5 tabular-nums">{fmt(c.utilidad)}</td>
                    <td className={`text-right py-1.5 tabular-nums ${mg < 15 ? "text-red-600" : ""}`}>
                      {mg > 0 ? mg.toFixed(1) + "%" : "—"}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">{pct.toFixed(1)}%</td>
                    <td className="text-right py-1.5 text-gray-500">{ultima}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center border-t border-gray-200 pt-3">
        Generado por fashiongr.com — uso interno confidencial
      </div>

      <style jsx>{`
        @media print {
          /* Layout */
          .print-report { max-width: 100%; padding: 0; margin: 0 1.5cm; font-size: 11px; }
          @page { margin: 1.5cm; size: A4 landscape; }

          /* Hide everything outside the report */
          body > *:not(.print-report),
          nav, header, aside, footer,
          [role="navigation"], [role="banner"],
          button, a[role="button"],
          .no-print { display: none !important; }

          /* When the report is nested inside a layout, hide sibling layout nodes */
          body * { visibility: hidden; }
          .print-report, .print-report * { visibility: visible; }
          .print-report { position: absolute; top: 0; left: 0; right: 0; }

          /* Ensure table borders survive print */
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; }
          thead tr { border-bottom: 1px solid #d1d5db; }

          /* Color adjustments for print */
          .text-red-600 { color: #dc2626 !important; }
          .text-green-600 { color: #16a34a !important; }
        }
      `}</style>
    </div>
  );
}

export default function ReportePageWrapper() {
  return <Suspense><ReportePage /></Suspense>;
}
