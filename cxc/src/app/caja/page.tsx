"use client";

import { useState, useEffect, useCallback } from "react";

interface CajaPeriodo {
  id: string;
  numero: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  fondo_inicial: number;
  estado: string;
  total_gastado: number;
  caja_gastos?: CajaGasto[];
}

interface CajaGasto {
  id: string;
  periodo_id: string;
  fecha: string;
  nombre: string;
  ruc: string;
  dv: string;
  factura: string;
  subtotal: number;
  itbms: number;
  total: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type View = "list" | "detail" | "print";

export default function CajaPage() {
  const [view, setView] = useState<View>("list");
  const [periodos, setPeriodos] = useState<CajaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CajaPeriodo | null>(null);

  // Add expense form state
  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gNombre, setGNombre] = useState("");
  const [gRuc, setGRuc] = useState("");
  const [gDv, setGDv] = useState("");
  const [gFactura, setGFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState("");
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [addingGasto, setAddingGasto] = useState(false);

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = subtotalNum * (parseFloat(gItbmsPct) / 100);
  const totalNum = subtotalNum + itbmsNum;

  useEffect(() => { loadPeriodos(); }, []);

  const loadPeriodos = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/caja/periodos");
    if (res.ok) setPeriodos(await res.json());
    setLoading(false);
  }, []);

  async function createPeriodo() {
    const res = await fetch("/api/caja/periodos", { method: "POST" });
    if (res.ok) {
      const p = await res.json();
      loadPeriodos();
      await loadDetail(p.id);
    }
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/caja/periodos/${id}`);
    if (res.ok) {
      const data = await res.json();
      const gastos = data.caja_gastos || [];
      data.total_gastado = gastos.reduce((s: number, g: CajaGasto) => s + (g.total || 0), 0);
      setCurrent(data);
      setView("detail");
    }
  }

  async function closePeriodo(id: string) {
    if (!confirm("¿Cerrar este período? No podrá agregar más gastos.")) return;
    await fetch(`/api/caja/periodos/${id}`, { method: "PATCH" });
    await loadDetail(id);
    loadPeriodos();
  }

  async function addGasto() {
    if (!current) return;
    setAddingGasto(true);
    const res = await fetch("/api/caja/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periodo_id: current.id,
        fecha: gFecha,
        nombre: gNombre,
        ruc: gRuc,
        dv: gDv,
        factura: gFactura,
        subtotal: subtotalNum,
        itbms: itbmsNum,
        total: totalNum,
      }),
    });
    if (res.ok) {
      setGNombre(""); setGRuc(""); setGDv(""); setGFactura(""); setGSubtotal(""); setGItbmsPct("0");
      await loadDetail(current.id);
      loadPeriodos();
    }
    setAddingGasto(false);
  }

  async function deleteGasto(gastoId: string) {
    if (!current) return;
    await fetch(`/api/caja/gastos/${gastoId}`, { method: "DELETE" });
    await loadDetail(current.id);
    loadPeriodos();
  }

  const hasOpenPeriod = periodos.some((p) => p.estado === "abierto");

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Caja Menuda</h1>
            <p className="text-sm text-gray-500">Fondo inicial: $200.00</p>
          </div>
          <div className="flex items-center gap-3">
            {!hasOpenPeriod && (
              <button onClick={createPeriodo}
                className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">
                + Nuevo Período
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-12">Cargando...</p>
        ) : periodos.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No hay períodos registrados</p>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">N°</th>
                  <th className="text-left px-4 py-2 font-medium">Apertura</th>
                  <th className="text-left px-4 py-2 font-medium">Cierre</th>
                  <th className="text-left px-4 py-2 font-medium">Estado</th>
                  <th className="text-right px-4 py-2 font-medium">Gastado</th>
                  <th className="text-right px-4 py-2 font-medium">Saldo</th>
                  <th className="text-right px-4 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => {
                  const saldo = p.fondo_inicial - p.total_gastado;
                  return (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium">{p.numero}</td>
                      <td className="px-4 py-2.5">{fmtDate(p.fecha_apertura)}</td>
                      <td className="px-4 py-2.5">{p.fecha_cierre ? fmtDate(p.fecha_cierre) : "—"}</td>
                      <td className="px-4 py-2.5">
                        {p.estado === "abierto" ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Abierto</span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Cerrado</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">${fmt(p.total_gastado)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${saldo < 0 ? "text-red-600" : ""}`}>
                        ${fmt(saldo)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => loadDetail(p.id)} className="text-xs text-blue-600 hover:underline mr-2">Ver</button>
                        <button onClick={() => { loadDetail(p.id).then(() => setView("print")); }}
                          className="text-xs text-gray-500 hover:underline mr-2">Imprimir</button>
                        {p.estado === "abierto" && (
                          <button onClick={() => closePeriodo(p.id)} className="text-xs text-red-500 hover:underline">Cerrar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === "detail" && current) {
    const gastos = current.caja_gastos || [];
    const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
    const totalSubtotal = gastos.reduce((s, g) => s + (g.subtotal || 0), 0);
    const totalItbms = gastos.reduce((s, g) => s + (g.itbms || 0), 0);
    const saldo = current.fondo_inicial - totalGastado;
    const isOpen = current.estado === "abierto";

    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={() => { setView("list"); setCurrent(null); }} className="text-sm text-gray-500 hover:text-black mb-4">
          ← Períodos
        </button>

        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-xl font-bold">Período N° {current.numero}</h1>
          <span className="text-xs text-gray-500">Apertura: {fmtDate(current.fecha_apertura)}</span>
          {isOpen ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Abierto</span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Cerrado — {fmtDate(current.fecha_cierre || "")}</span>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border border-gray-200 rounded px-4 py-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Fondo</div>
            <div className="text-lg font-bold mt-1">${fmt(current.fondo_inicial)}</div>
          </div>
          <div className="border border-gray-200 rounded px-4 py-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Gastado</div>
            <div className="text-lg font-bold mt-1">${fmt(totalGastado)}</div>
          </div>
          <div className={`border rounded px-4 py-3 ${saldo < 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Saldo</div>
            <div className={`text-lg font-bold mt-1 ${saldo < 0 ? "text-red-600" : ""}`}>${fmt(saldo)}</div>
          </div>
        </div>

        {/* Add expense form */}
        {isOpen && (
          <div className="border border-gray-200 rounded p-4 mb-6">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">Agregar Gasto</div>
            <div className="grid grid-cols-9 gap-2 items-end">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Fecha</label>
                <input type="date" value={gFecha} onChange={(e) => setGFecha(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Nombre</label>
                <input type="text" value={gNombre} onChange={(e) => setGNombre(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">RUC</label>
                <input type="text" value={gRuc} onChange={(e) => setGRuc(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">DV</label>
                <input type="text" value={gDv} onChange={(e) => setGDv(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Factura</label>
                <input type="text" value={gFactura} onChange={(e) => setGFactura(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Sub-total</label>
                <input type="number" step="0.01" value={gSubtotal} onChange={(e) => setGSubtotal(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">ITBMS</label>
                <select value={gItbmsPct} onChange={(e) => setGItbmsPct(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Total</label>
                <input type="text" readOnly value={fmt(totalNum)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50" />
              </div>
              <div>
                <button onClick={addGasto} disabled={addingGasto || !gNombre || subtotalNum <= 0}
                  className="w-full bg-black text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 transition disabled:opacity-50">
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expenses table */}
        <div className="border border-gray-200 rounded overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                <th className="text-left px-3 py-2 font-medium">Nombre</th>
                <th className="text-left px-3 py-2 font-medium">RUC</th>
                <th className="text-left px-3 py-2 font-medium">DV</th>
                <th className="text-left px-3 py-2 font-medium">Factura</th>
                <th className="text-right px-3 py-2 font-medium">Sub-total</th>
                <th className="text-right px-3 py-2 font-medium">ITBMS</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                {isOpen && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr><td colSpan={isOpen ? 9 : 8} className="px-4 py-6 text-center text-gray-400 text-sm">Sin gastos registrados</td></tr>
              ) : (
                <>
                  {gastos.map((g) => (
                    <tr key={g.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{fmtDate(g.fecha)}</td>
                      <td className="px-3 py-2">{g.nombre}</td>
                      <td className="px-3 py-2">{g.ruc}</td>
                      <td className="px-3 py-2">{g.dv}</td>
                      <td className="px-3 py-2">{g.factura}</td>
                      <td className="px-3 py-2 text-right">${fmt(g.subtotal)}</td>
                      <td className="px-3 py-2 text-right">${fmt(g.itbms)}</td>
                      <td className="px-3 py-2 text-right font-medium">${fmt(g.total)}</td>
                      {isOpen && (
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => deleteGasto(g.id)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase text-gray-500">Totales</td>
                    <td className="px-3 py-2 text-right">${fmt(totalSubtotal)}</td>
                    <td className="px-3 py-2 text-right">${fmt(totalItbms)}</td>
                    <td className="px-3 py-2 text-right">${fmt(totalGastado)}</td>
                    {isOpen && <td></td>}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setView("print")} className="text-sm border border-gray-300 px-4 py-2 rounded hover:border-black transition">
            Imprimir
          </button>
          {isOpen && (
            <button onClick={() => closePeriodo(current.id)}
              className="text-sm border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 transition">
              Cerrar Período
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── PRINT VIEW ──
  if (view === "print" && current) {
    const gastos = current.caja_gastos || [];
    const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
    const totalSubtotal = gastos.reduce((s, g) => s + (g.subtotal || 0), 0);
    const totalItbms = gastos.reduce((s, g) => s + (g.itbms || 0), 0);
    const saldo = current.fondo_inicial - totalGastado;

    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-3 mb-6 no-print">
          <button onClick={() => setView("detail")} className="text-sm text-gray-500 hover:text-black">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
            🖨 Imprimir
          </button>
        </div>

        <div id="print-document" className="border border-gray-200 rounded p-8" style={{ fontFamily: "-apple-system, sans-serif" }}>
          <h1 className="text-center text-lg font-bold mb-2 uppercase tracking-wide">Reporte de Caja Menuda</h1>
          <p className="text-center text-sm text-gray-600 mb-1">
            Período N° {current.numero} | Apertura: {fmtDate(current.fecha_apertura)}
            {current.fecha_cierre ? ` — Cierre: ${fmtDate(current.fecha_cierre)}` : " — Abierto"}
          </p>
          <p className="text-center text-sm mb-6">Fondo Inicial: ${fmt(current.fondo_inicial)}</p>

          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">Fecha</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">Nombre</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">RUC</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DV</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">Factura</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">Sub-total</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">ITBMS</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td className="border border-gray-300 px-2 py-1">{fmtDate(g.fecha)}</td>
                  <td className="border border-gray-300 px-2 py-1">{g.nombre}</td>
                  <td className="border border-gray-300 px-2 py-1">{g.ruc}</td>
                  <td className="border border-gray-300 px-2 py-1">{g.dv}</td>
                  <td className="border border-gray-300 px-2 py-1">{g.factura}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">${fmt(g.subtotal)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">${fmt(g.itbms)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">${fmt(g.total)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={5} className="border border-gray-300 px-2 py-1.5 text-right uppercase">Totales</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right">${fmt(totalSubtotal)}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right">${fmt(totalItbms)}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right">${fmt(totalGastado)}</td>
              </tr>
            </tbody>
          </table>

          <div className="text-sm font-bold mb-8">
            Saldo Final: <span className={saldo < 0 ? "text-red-600" : ""}>${fmt(saldo)}</span>
          </div>

          <div className="mt-16 text-sm flex justify-between">
            <div>Preparado por: <span className="border-b border-gray-400 inline-block w-56 ml-1">&nbsp;</span></div>
            <div>Aprobado por: <span className="border-b border-gray-400 inline-block w-56 ml-1">&nbsp;</span></div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
