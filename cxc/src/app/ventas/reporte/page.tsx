"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { fmt } from "@/lib/format";

const EMPRESAS = ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep", "Confecciones Boston", "Multifashion"];
const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface VentaRow { empresa: string; mes: number; ventas_brutas: number; costo: number; utilidad: number; }

function ReportePage() {
  const params = useSearchParams();
  const año = Number(params.get("año")) || new Date().getFullYear();
  const empresaFilter = params.get("empresa") || "all";
  const vista = (params.get("vista") as "mensual" | "quarter") || "mensual";

  const [data, setData] = useState<VentaRow[]>([]);
  const [prevData, setPrevData] = useState<VentaRow[]>([]);
  const [metas, setMetas] = useState<{ empresa: string; mes: number; meta: number }[]>([]);
  const [clientes, setClientes] = useState<{ cliente: string; subtotal: number; utilidad: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/ventas?año=${año}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas?año=${año - 1}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas/metas?año=${año}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ventas/clientes?año=${año}`).then(r => r.ok ? r.json() : []),
    ]).then(([d, p, m, c]) => {
      setData(d || []); setPrevData(p || []); setMetas(m || []); setClientes(c || []);
      setLoading(false);
      setTimeout(() => window.print(), 500);
    });
  }, [año]);

  const filtered = useMemo(() => empresaFilter === "all" ? data : data.filter(r => r.empresa === empresaFilter), [data, empresaFilter]);
  const filteredPrev = useMemo(() => empresaFilter === "all" ? prevData : prevData.filter(r => r.empresa === empresaFilter), [prevData, empresaFilter]);

  const ventasNetas = filtered.reduce((s, r) => s + (r.ventas_brutas || 0), 0);
  const monthsWithData = [...new Set(filtered.map(r => r.mes))];
  const comparablePrev = filteredPrev.filter(r => monthsWithData.includes(r.mes));
  const prevTotal = comparablePrev.reduce((s, r) => s + (r.ventas_brutas || 0), 0);
  const vsAnterior: number | null = comparablePrev.length > 0 && prevTotal !== 0
    ? ((ventasNetas - prevTotal) / prevTotal) * 100
    : null;
  const totalUtilidad = filtered.reduce((s, r) => s + (r.utilidad || 0), 0);
  const margen = ventasNetas > 0 ? (totalUtilidad / ventasNetas) * 100 : 0;
  const metaTotal = metas.filter(m => empresaFilter === "all" || m.empresa === empresaFilter).reduce((s, m) => s + (m.meta || 0), 0);
  const vsMeta = metaTotal > 0 ? (ventasNetas / metaTotal) * 100 : 0;

  const empresas = empresaFilter === "all" ? EMPRESAS : [empresaFilter];

  const topClientes = useMemo(() => {
    const c = empresaFilter === "all" ? clientes : clientes.filter(r => true); // clientes already filtered by year
    return [...c].sort((a, b) => b.subtotal - a.subtotal).slice(0, 5);
  }, [clientes, empresaFilter]);

  if (loading) return <div className="p-12 text-center text-gray-400">Cargando reporte...</div>;

  return (
    <div className="print-report max-w-[900px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold">Fashion Group — Reporte de Ventas</h1>
          <p className="text-sm text-gray-500">
            {empresaFilter === "all" ? "Todas las empresas" : empresaFilter} — {año}
          </p>
        </div>
        <div className="text-xs text-gray-400 text-right">
          Generado: {new Date().toLocaleDateString("es-PA")}<br />
          Vista: {vista === "mensual" ? "Mensual" : "Trimestral"}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-6 text-center">
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-[9px] uppercase text-gray-400">Ventas Netas</div>
          <div className="text-base font-semibold">${fmt(ventasNetas)}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-[9px] uppercase text-gray-400">vs Año Ant.</div>
          <div className={`text-base font-semibold ${vsAnterior !== null && vsAnterior < -20 ? "text-red-600" : ""}`}>{vsAnterior === null ? "—" : `${vsAnterior > 0 ? "+" : ""}${vsAnterior.toFixed(1)}%`}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-[9px] uppercase text-gray-400">Margen Bruto</div>
          <div className={`text-base font-semibold ${margen < 20 ? "text-red-600" : ""}`}>{margen.toFixed(1)}%</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-[9px] uppercase text-gray-400">Utilidad Bruta</div>
          <div className="text-base font-semibold">${fmt(totalUtilidad)}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-[9px] uppercase text-gray-400">vs Meta</div>
          <div className={`text-base font-semibold ${vsMeta < 80 && metaTotal > 0 ? "text-red-600" : ""}`}>{metaTotal > 0 ? `${vsMeta.toFixed(1)}%` : "—"}</div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-[11px] border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-gray-300">
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
              <tr key={emp} className="border-b border-gray-100">
                <td className="py-1.5 font-medium">{emp}</td>
                {periods.map((p, i) => <td key={i} className={`text-right py-1.5 tabular-nums ${p.v === 0 ? "text-gray-300" : ""}`}>{p.v > 0 ? fmt(p.v) : "—"}</td>)}
                <td className="text-right py-1.5 font-semibold tabular-nums">{fmt(total)}</td>
                <td className="text-right py-1.5 tabular-nums">{fmt(utilTotal)}</td>
                <td className={`text-right py-1.5 tabular-nums ${mg < 15 ? "text-red-600" : ""}`}>{mg > 0 ? mg.toFixed(1) + "%" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Top Clientes */}
      {topClientes.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Top 5 Clientes</h3>
          <table className="w-full text-[11px] border-collapse mb-8">
            <thead><tr className="border-b border-gray-300">
              <th className="text-left py-1.5 font-semibold">Cliente</th>
              <th className="text-right py-1.5 font-semibold">Ventas B/.</th>
              <th className="text-right py-1.5 font-semibold">% del Total</th>
            </tr></thead>
            <tbody>
              {topClientes.map(c => (
                <tr key={c.cliente} className="border-b border-gray-100">
                  <td className="py-1.5">{c.cliente}</td>
                  <td className="text-right py-1.5 tabular-nums">{fmt(c.subtotal)}</td>
                  <td className="text-right py-1.5 tabular-nums">{ventasNetas > 0 ? ((c.subtotal / ventasNetas) * 100).toFixed(1) + "%" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Footer */}
      <div className="text-[9px] text-gray-400 text-center border-t border-gray-200 pt-3">
        Generado por fashiongr.com — uso interno confidencial
      </div>

      <style jsx>{`
        @media print {
          .print-report { max-width: 100%; padding: 0; margin: 0 1.5cm; font-size: 11px; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}

export default function ReportePageWrapper() {
  return <Suspense><ReportePage /></Suspense>;
}
