"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";

interface Stats {
  ventasMes: number; ventasPrev: number;
  reclamosPendientes: number; reclamosViejos: number; reclamosResueltosEsteMes: number;
  cxcTotal: number; cxcVencida: number;
  vencenEstaSemana: number; chequesTotalPendiente: number;
}

export default function ReportExport({ stats, darkMode }: { stats: Stats; darkMode: boolean }) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState("");

  async function generateVentasExcel() {
    setGenerating("ventas"); setOpen(false);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      // Fetch current + prev month from v2-compatible endpoint
      const [curRes, prevRes] = await Promise.all([
        fetch(`/api/ventas/v2?anio=${currentYear}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/ventas/v2?anio=${prevYear}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const hs = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1A1A1A" }, patternType: "solid" as const } };

      // Group by empresa from v2 byEmpresaMes data
      const empresas = new Map<string, { mesActual: number; mesAnterior: number }>();
      for (const row of curRes?.byEmpresaMes || []) {
        if (row.mes !== currentMonth) continue;
        const key = row.empresa || "Otro";
        if (!empresas.has(key)) empresas.set(key, { mesActual: 0, mesAnterior: 0 });
        empresas.get(key)!.mesActual += Number(row.subtotal) || 0;
      }
      for (const row of prevRes?.byEmpresaMes || []) {
        if (row.mes !== prevMonth) continue;
        const key = row.empresa || "Otro";
        if (!empresas.has(key)) empresas.set(key, { mesActual: 0, mesAnterior: 0 });
        empresas.get(key)!.mesAnterior += Number(row.subtotal) || 0;
      }

      const wb = XLSX.utils.book_new();
      // Resumen sheet
      const resumenRows = [
        ["Empresa", "Mes actual", "Mes anterior", "% Cambio"].map(h => ({ v: h, s: hs })),
        ...Array.from(empresas.entries()).map(([name, d]) => {
          const pct = d.mesAnterior > 0 ? ((d.mesActual - d.mesAnterior) / d.mesAnterior * 100) : 0;
          return [name, `$${fmt(d.mesActual)}`, `$${fmt(d.mesAnterior)}`, `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`];
        }),
        [],
        ["TOTAL", `$${fmt(Array.from(empresas.values()).reduce((s, e) => s + e.mesActual, 0))}`, `$${fmt(Array.from(empresas.values()).reduce((s, e) => s + e.mesAnterior, 0))}`, ""],
      ];
      const ws = XLSX.utils.aoa_to_sheet(resumenRows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, "Resumen");

      const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Ventas_Consolidado_${now.toISOString().slice(0, 10)}.xlsx`; a.click();
    } catch { /* */ }
    setGenerating("");
  }

  async function generateCxCExcel() {
    setGenerating("cxc"); setOpen(false);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const res = await fetch("/api/cxc-summary");
      const data = await res.json();
      const rows = data.clients || [];

      const hs = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1A1A1A" }, patternType: "solid" as const } };
      const headers = ["Cliente", "Empresa", "Total", "0-30d", "31-60d", "61-90d", "91-120d", "121d+"].map(h => ({ v: h, s: hs }));

      const dataRows: (string | number)[][] = [];
      for (const client of rows) {
        for (const [companyKey, co] of Object.entries(client.companies || {})) {
          const c = co as { total: number; d0_30: number; d31_60: number; d61_90: number; d91_120: number; d121_180: number; d181_270: number; d271_365: number; mas_365: number };
          if (c.total <= 0) continue;
          const vencido = c.d121_180 + c.d181_270 + c.d271_365 + c.mas_365;
          dataRows.push([client.nombre_normalized || client.nombre, companyKey, c.total, c.d0_30, c.d31_60, c.d61_90, c.d91_120, vencido]);
        }
      }
      dataRows.sort((a, b) => (b[7] as number) - (a[7] as number));

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CxC Consolidado");

      const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `CxC_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
    } catch { /* */ }
    setGenerating("");
  }

  async function generateExecutivePDF() {
    setGenerating("pdf"); setOpen(false);
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF("portrait");
      const now = new Date();
      const dateStr = now.toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });

      // Header
      const { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } = await import("@/lib/pdf-logo");
      doc.setFillColor(26, 26, 26);
      doc.rect(0, 0, 210, 22, "F");
      try {
        doc.addImage(FG_LOGO_BASE64, "JPEG", 8, 3, FG_LOGO_WIDTH + 2, FG_LOGO_HEIGHT + 2);
      } catch { /* skip if logo fails */ }
      const _logoEnd = 8 + FG_LOGO_WIDTH + 2 + 4;
      doc.setFontSize(14); doc.setTextColor(255); doc.setFont("helvetica", "bold");
      doc.text("FASHION GROUP", _logoEnd, 14);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("Reporte Ejecutivo", 196, 10, { align: "right" });
      doc.text(dateStr, 196, 16, { align: "right" });

      let y = 32;

      // KPIs section
      doc.setTextColor(26); doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text("Indicadores Clave", 14, y); y += 8;

      const ventasPct = stats.ventasPrev > 0 ? ((stats.ventasMes - stats.ventasPrev) / stats.ventasPrev * 100) : 0;

      autoTable(doc, {
        startY: y,
        head: [["Indicador", "Valor", "Detalle"]],
        body: [
          ["Ventas del mes", `$${fmt(stats.ventasMes)}`, `${ventasPct >= 0 ? "+" : ""}${ventasPct.toFixed(1)}% vs mes anterior`],
          ["Ventas mes anterior", `$${fmt(stats.ventasPrev)}`, ""],
          ["Cartera total (CxC)", `$${fmt(stats.cxcTotal)}`, `$${fmt(stats.cxcVencida)} vencida (+121d)`],
          ["Reclamos abiertos", String(stats.reclamosPendientes), `${stats.reclamosViejos} con +45 días`],
          ["Reclamos resueltos (mes)", String(stats.reclamosResueltosEsteMes), ""],
          ["Cheques por vencer (semana)", String(stats.vencenEstaSemana), `$${fmt(stats.chequesTotalPendiente)} total pendiente`],
        ],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 40, halign: "right", fontStyle: "bold" }, 2: { cellWidth: 85 } },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 15;

      // Footer
      doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
      doc.text(`Fashion Group Panamá — Generado ${now.toLocaleString("es-PA")}`, 14, 285);

      doc.save(`Reporte_Ejecutivo_${now.toISOString().slice(0, 10)}.pdf`);
    } catch { /* */ }
    setGenerating("");
  }

  return (
    <div className="relative mb-4 flex justify-end">
      <button onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${darkMode ? "text-gray-400 hover:text-gray-200 border border-gray-700" : "text-gray-500 hover:text-black border border-gray-200"}`}>
        {generating ? (
          <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generando...</>
        ) : (
          <>Exportar reportes ↓</>
        )}
      </button>
      {open && (
        <div className={`absolute right-0 top-full mt-1 rounded-lg border z-20 overflow-hidden w-56 ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
          <button onClick={generateVentasExcel} className={`w-full text-left px-4 py-3 text-sm transition ${darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}>
            <span className="font-medium">Ventas consolidado</span>
            <span className="block text-[10px] text-gray-400 mt-0.5">Excel por empresa</span>
          </button>
          <button onClick={generateCxCExcel} className={`w-full text-left px-4 py-3 text-sm border-t transition ${darkMode ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
            <span className="font-medium">CxC consolidado</span>
            <span className="block text-[10px] text-gray-400 mt-0.5">Excel con aging por cliente</span>
          </button>
          <button onClick={generateExecutivePDF} className={`w-full text-left px-4 py-3 text-sm border-t transition ${darkMode ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`}>
            <span className="font-medium">Reporte ejecutivo</span>
            <span className="block text-[10px] text-gray-400 mt-0.5">PDF con KPIs consolidados</span>
          </button>
        </div>
      )}
    </div>
  );
}
