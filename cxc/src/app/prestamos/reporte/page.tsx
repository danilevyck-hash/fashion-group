"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";

interface Movimiento {
  id: string;
  concepto: string;
  monto: number;
  estado: string;
}
interface Empleado {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  activo: boolean;
  prestamos_movimientos: Movimiento[];
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ReportePage() {
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "prestamos", allowedRoles: ["admin","contabilidad"] });
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const now = new Date();
  const [quincena, setQuincena] = useState(now.getDate() <= 15 ? "1" : "2");
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [año, setAño] = useState(String(now.getFullYear()));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestamos/reporte");
      if (res.ok) setEmpleados(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) loadData(); }, [authChecked, loadData]);

  if (!authChecked) return null;

  // Filter employees with pending balance
  const filtered = empleados.filter(emp => {
    const movs = emp.prestamos_movimientos || [];
    const prestado = movs.filter(m => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
    const pagado = movs.filter(m => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
    return prestado - pagado > 0;
  });

  const totalDeducciones = filtered.reduce((s, e) => s + Number(e.deduccion_quincenal), 0);
  const periodoLabel = `${quincena === "1" ? "1ra" : "2da"} Quincena de ${MESES[Number(mes)]} ${año}`;

  async function exportExcel() {
    setExporting(true);
    try {
      const res = await fetch(`/api/prestamos/export-excel?quincena=${quincena}&mes=${mes}&año=${año}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte-deducciones-${quincena === "1" ? "1ra" : "2da"}-quincena-${MESES[Number(mes)]?.toLowerCase()}-${año}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* */ }
    setExporting(false);
  }

  function exportPDF() {
    if (filtered.length === 0) return;
    const rows = filtered.map((emp, i) =>
      `<tr class="${i % 2 === 1 ? "alt" : ""}"><td>${emp.nombre}</td><td>${emp.empresa || "—"}</td><td class="right">$${fmt(emp.deduccion_quincenal)}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Deducciones</title><style>
      @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; }
      .header { background: #1b3a5c; color: white; padding: 16px 24px; text-align: center; margin-bottom: 8px; }
      .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
      .header p { font-size: 11px; opacity: 0.85; }
      .period { text-align: center; color: #666; font-size: 12px; margin: 12px 0 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1b3a5c; color: white; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: 600; }
      td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
      tr.alt { background: #f8f9f9; }
      .right { text-align: right; }
      .total-row { font-weight: 700; border-top: 2px solid #1b3a5c; }
      .footer { color: #999; font-size: 9px; margin-top: 24px; padding-top: 8px; border-top: 1px solid #eee; }
    </style></head><body>
    <div class="header"><h1>FASHION GROUP</h1><p>Reporte de Deducciones Quincenales</p></div>
    <div class="period">${periodoLabel}</div>
    <table><thead><tr><th>Empleado</th><th>Empresa</th><th class="right">Deducción Quincenal</th></tr></thead>
    <tbody>${rows}
    <tr class="total-row"><td colspan="2">Total</td><td class="right">$${fmt(totalDeducciones)}</td></tr>
    </tbody></table>
    <div class="footer">Generado el ${new Date().toLocaleDateString("es-HN")} — ${filtered.length} empleados</div>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Préstamos"
        breadcrumbs={[
          { label: "Préstamos", onClick: () => router.push("/prestamos") },
          { label: "Reporte de Deducciones" },
        ]}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-6">Reporte de Deducciones Quincenales</h1>

        {/* Period selector */}
        <div className="flex flex-wrap items-end gap-4 mb-8 bg-gray-50 rounded-xl p-4">
          <div>
            <label className="text-xs text-gray-400 uppercase block mb-1">Quincena</label>
            <select value={quincena} onChange={e => setQuincena(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
              <option value="1">1ra (1-15)</option>
              <option value="2">2da (16-fin)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase block mb-1">Mes</label>
            <select value={mes} onChange={e => setMes(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase block mb-1">Año</label>
            <select value={año} onChange={e => setAño(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <button onClick={exportExcel} disabled={exporting || filtered.length === 0} className="bg-black text-white px-5 py-2 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button onClick={exportPDF} disabled={exporting || filtered.length === 0} className="border border-gray-200 px-5 py-2 rounded-full text-sm hover:border-gray-400 transition disabled:opacity-50">
            Exportar PDF
          </button>
        </div>

        <div className="text-sm text-gray-500 mb-4">{periodoLabel}</div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No hay empleados con saldo pendiente</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Empleado</th>
                  <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Empresa</th>
                  <th className="text-right py-3 px-3 text-xs uppercase text-gray-400">Deducción Quincenal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, i) => (
                  <tr key={emp.id} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                    <td className="py-3 px-3">{emp.nombre}</td>
                    <td className="py-3 px-3 text-gray-500">{emp.empresa || "—"}</td>
                    <td className="py-3 px-3 text-right tabular-nums font-medium">${fmt(emp.deduccion_quincenal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={2} className="py-3 px-3 font-medium">Total</td>
                  <td className="py-3 px-3 text-right tabular-nums font-semibold">${fmt(totalDeducciones)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-8">
          <button onClick={() => router.push("/prestamos")} className="border border-gray-200 px-5 py-2 rounded-full text-sm hover:border-gray-400 transition">← Volver a Préstamos</button>
        </div>
      </div>
    </div>
  );
}
