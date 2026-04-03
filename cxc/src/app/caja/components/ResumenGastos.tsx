"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import { CajaGasto } from "./types";

interface Props {
  gastos: CajaGasto[];
}

export default function ResumenGastos({ gastos }: Props) {
  const [showResumen, setShowResumen] = useState(false);

  if (gastos.length === 0) return null;

  // Category bar chart
  const catTotals: Record<string, number> = {};
  for (const g of gastos) {
    const cat = g.categoria || "Varios";
    catTotals[cat] = (catTotals[cat] || 0) + g.total;
  }
  const catTotal = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const chartEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  // Resumen tables
  const catTotalsR: Record<string, number> = {};
  const empTotalsR: Record<string, number> = {};
  for (const g of gastos) {
    const cat = g.categoria || "Varios";
    catTotalsR[cat] = (catTotalsR[cat] || 0) + g.total;
    const emp = g.empresa || "Sin asignar";
    empTotalsR[emp] = (empTotalsR[emp] || 0) + g.total;
  }
  const grandTotal = gastos.reduce((s, g) => s + g.total, 0);
  const catEntries = Object.entries(catTotalsR).sort((a, b) => b[1] - a[1]);
  const empEntries = Object.entries(empTotalsR).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {/* Category bar chart — always visible */}
      <div className="mb-6">
        <div className="space-y-1.5">
          {chartEntries.map(([cat, total]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-32 truncate">{cat}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1">
                <div
                  className="bg-black h-1 rounded-full"
                  style={{
                    width: `${catTotal > 0 ? ((total / catTotal) * 100).toFixed(0) : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 w-14 text-right tabular-nums">
                ${total.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible resumen tables */}
      <div className="mb-6">
        <button
          onClick={() => setShowResumen(!showResumen)}
          className="text-[11px] uppercase tracking-[0.05em] text-gray-400 hover:text-black transition flex items-center gap-1 mb-3"
        >
          <span
            className={`inline-block transition-transform ${showResumen ? "rotate-90" : ""}`}
          >
            ›
          </span>
          Resumen de gastos
        </button>
        {showResumen && (
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2">
                Por categoría
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-3 px-4 font-normal">
                      Categoría
                    </th>
                    <th className="text-right py-3 px-4 font-normal">Monto</th>
                    <th className="text-right py-3 px-4 font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {catEntries.map(([cat, total]) => (
                    <tr
                      key={cat}
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">{cat}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        ${fmt(total)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-400">
                        {grandTotal > 0
                          ? ((total / grandTotal) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2">
                Por empresa
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-3 px-4 font-normal">Empresa</th>
                    <th className="text-right py-3 px-4 font-normal">Monto</th>
                    <th className="text-right py-3 px-4 font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {empEntries.map(([emp, total]) => (
                    <tr
                      key={emp}
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">{emp}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        ${fmt(total)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-400">
                        {grandTotal > 0
                          ? ((total / grandTotal) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
