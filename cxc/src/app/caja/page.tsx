"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

interface CajaPeriodo {
  id: string;
  numero: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  fondo_inicial: number;
  estado: string;
  total_gastado: number;
  repuesto: boolean;
  repuesto_at: string | null;
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
  categoria: string;
  responsable: string;
}

const CATEGORIAS_DEFAULT = ["Papelería y oficina", "Transporte", "Mantenimiento", "Varios"];

function loadCategorias(): string[] {
  if (typeof window === "undefined") return CATEGORIAS_DEFAULT;
  try {
    const stored = JSON.parse(localStorage.getItem("fg_categorias") || "[]") as string[];
    const deleted = JSON.parse(localStorage.getItem("fg_categorias_deleted") || "[]") as string[];
    const defaults = CATEGORIAS_DEFAULT.filter((c) => !deleted.includes(c));
    return [...defaults, ...stored.filter((s) => s && !defaults.includes(s))];
  } catch { return CATEGORIAS_DEFAULT; }
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
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [periodos, setPeriodos] = useState<CajaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CajaPeriodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [lowBalanceWarning, setLowBalanceWarning] = useState(false);
  const [categorias, setCategorias] = useState(CATEGORIAS_DEFAULT);
  const [showManageCat, setShowManageCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Responsables
  const [responsables, setResponsables] = useState<string[]>([]);
  const [showAddResponsable, setShowAddResponsable] = useState(false);
  const [newResponsable, setNewResponsable] = useState("");

  // Add expense form state
  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gNombre, setGNombre] = useState("");
  const [gRuc, setGRuc] = useState("");
  const [gDv, setGDv] = useState("");
  const [gFactura, setGFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState("");
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [gCategoria, setGCategoria] = useState("Varios");
  const [gResponsable, setGResponsable] = useState("");
  const [addingGasto, setAddingGasto] = useState(false);

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = subtotalNum * (parseFloat(gItbmsPct) / 100);
  const totalNum = subtotalNum + itbmsNum;

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (r) setRole(r);
    setCategorias(loadCategorias());
    loadPeriodos();
    fetch("/api/caja/responsables").then((r) => r.ok ? r.json() : []).then((data) => {
      setResponsables((data || []).map((r: { nombre: string }) => r.nombre));
    }).catch(() => {});
  }, []);

  const loadPeriodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/caja/periodos");
      if (!res.ok) throw new Error();
      setPeriodos(await res.json());
    } catch {
      setError("Error al cargar períodos");
    } finally {
      setLoading(false);
    }
  }, []);

  async function createPeriodo() {
    const input = window.prompt("Fondo inicial del período ($):", "200");
    if (!input) return;
    const fondo = parseFloat(input);
    if (isNaN(fondo) || fondo <= 0) return;
    setError(null);
    try {
      const res = await fetch("/api/caja/periodos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fondo_inicial: fondo }),
      });
      if (!res.ok) throw new Error();
      const p = await res.json();
      loadPeriodos();
      await loadDetail(p.id);
    } catch {
      setError("Error al crear período");
    }
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/caja/periodos/${id}`);
    if (res.ok) {
      const data = await res.json();
      const gastos = data.caja_gastos || [];
      data.total_gastado = gastos.reduce((s: number, g: CajaGasto) => s + (g.total || 0), 0);
      setLowBalanceWarning(data.total_gastado > (data.fondo_inicial || 200) * 0.80);
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

  async function deletePeriodo(id: string) {
    if (!confirm("¿Eliminar este período y todos sus gastos?")) return;
    const res = await fetch(`/api/caja/periodos/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadPeriodos();
      if (current?.id === id) { setCurrent(null); setView("list"); }
    } else {
      setError("Error al eliminar período");
    }
  }

  async function aprobarReposicion(id: string) {
    const res = await fetch(`/api/caja/periodos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repuesto" }),
    });
    if (res.ok) { await loadDetail(id); loadPeriodos(); }
    else setError("Error al aprobar reposición");
  }

  async function addGasto() {
    if (!current) return;
    setAddingGasto(true);
    setError(null);
    try {
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
          categoria: gCategoria,
          responsable: gResponsable,
        }),
      });
      if (!res.ok) throw new Error();
      setGFecha(new Date().toISOString().split("T")[0]);
      setGNombre(""); setGRuc(""); setGDv(""); setGFactura(""); setGSubtotal(""); setGItbmsPct("0");
      setGCategoria("Varios"); setGResponsable("");
      await loadDetail(current.id);
      loadPeriodos();
    } catch {
      setError("Error al agregar gasto");
    } finally {
      setAddingGasto(false);
    }
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
      <div>
        <AppHeader module="Caja Menuda" />
        <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-10">
          <h1 className="text-xl font-semibold tracking-tight">Caja Menuda</h1>
          {!hasOpenPeriod && (
            <button onClick={createPeriodo}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
              Nuevo Período
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <div>{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse flex gap-4 py-3 border-b border-gray-100"><div className="h-3 bg-gray-100 rounded w-1/3" /><div className="h-3 bg-gray-100 rounded w-1/5 ml-auto" /><div className="h-3 bg-gray-100 rounded w-1/5" /><div className="h-3 bg-gray-100 rounded w-1/6" /></div>)}</div>
        ) : periodos.length === 0 ? (
          <p className="text-gray-300 text-sm text-center py-20">No hay períodos registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">N°</th>
                <th className="text-left pb-3 font-medium">Apertura</th>
                <th className="text-left pb-3 font-medium">Cierre</th>
                <th className="text-left pb-3 font-medium">Estado</th>
                <th className="text-right pb-3 font-medium">Fondo</th>
                <th className="text-right pb-3 font-medium">Gastado</th>
                <th className="text-right pb-3 font-medium">Saldo</th>
                <th className="text-right pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => {
                const saldo = p.fondo_inicial - p.total_gastado;
                return (
                  <tr key={p.id} onClick={() => loadDetail(p.id)} className="border-b border-gray-100 hover:bg-gray-50/80 transition cursor-pointer">
                    <td className="py-3.5 font-medium">{p.numero}</td>
                    <td className="py-3.5 text-gray-500">{fmtDate(p.fecha_apertura)}</td>
                    <td className="py-3.5 text-gray-500">{p.fecha_cierre ? fmtDate(p.fecha_cierre) : "—"}</td>
                    <td className="py-3.5">
                      {p.estado === "abierto" ? (
                        <span className="text-[11px] bg-black text-white px-2.5 py-0.5 rounded-full">Abierto</span>
                      ) : (
                        <span className="text-[11px] bg-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full">Cerrado</span>
                      )}
                    </td>
                    <td className="py-3.5 text-right tabular-nums text-gray-400">${fmt(p.fondo_inicial)}</td>
                    <td className="py-3.5 text-right tabular-nums">${fmt(p.total_gastado)}</td>
                    <td className={`py-3.5 text-right tabular-nums font-medium ${saldo < 0 ? "text-red-600" : ""}`}>
                      ${fmt(saldo)}
                    </td>
                    <td className="py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { loadDetail(p.id).then(() => setView("print")); }}
                        className="text-sm text-gray-400 hover:text-black transition mr-3">Imprimir</button>
                      {p.estado === "abierto" && (
                        <button onClick={() => closePeriodo(p.id)} className="text-sm text-gray-400 hover:text-black transition mr-3">Cerrar</button>
                      )}
                      {p.estado === "cerrado" && role === "admin" && (
                        <button onClick={() => deletePeriodo(p.id)} className="text-sm text-gray-300 hover:text-black transition">Eliminar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button onClick={() => { setView("list"); setCurrent(null); }}
          className="text-sm text-gray-400 hover:text-black transition mb-8 block">
          ← Períodos
        </button>

        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Período N° {current.numero}</h1>
          <span className="text-sm text-gray-400">{fmtDate(current.fecha_apertura)}</span>
          {isOpen ? (
            <span className="text-[11px] bg-black text-white px-2.5 py-0.5 rounded-full">Abierto</span>
          ) : (
            <span className="text-[11px] bg-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full">Cerrado — {fmtDate(current.fecha_cierre || "")}</span>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-8 mb-10">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Fondo</div>
            <div className="text-2xl font-semibold tabular-nums">${fmt(current.fondo_inicial)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Gastado</div>
            <div className="text-2xl font-semibold tabular-nums">${fmt(totalGastado)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Saldo</div>
            <div className={`text-2xl font-semibold tabular-nums ${saldo < 0 ? "text-red-600" : ""}`}>${fmt(saldo)}</div>
          </div>
        </div>

        {/* Category chart — always visible */}
        {gastos.length > 0 && (() => {
          const catTotals: Record<string, number> = {};
          for (const g of gastos) { const cat = g.categoria || "Varios"; catTotals[cat] = (catTotals[cat] || 0) + g.total; }
          const catTotal = Object.values(catTotals).reduce((s, v) => s + v, 0);
          const chartEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
          return (
            <div className="mb-6">
              <div className="space-y-1.5">
                {chartEntries.map(([cat, total]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-32 truncate">{cat}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1">
                      <div className="bg-black h-1 rounded-full" style={{ width: `${catTotal > 0 ? ((total / catTotal) * 100).toFixed(0) : 0}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 w-14 text-right tabular-nums">${total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {lowBalanceWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
            <span className="text-amber-500 text-base">⚠️</span>
            <p className="text-sm text-amber-700">
              Saldo bajo — menos del 20% del fondo disponible. Considera solicitar reposición.
            </p>
          </div>
        )}

        {/* Add expense form */}
        {isOpen && (
          <div className="mb-10">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Agregar Gasto</div>
            <div className="grid grid-cols-6 gap-3 items-end mb-3">
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Fecha</label>
                <input type="date" value={gFecha} onChange={(e) => setGFecha(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Nombre</label>
                <input type="text" value={gNombre} onChange={(e) => setGNombre(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">RUC</label>
                <input type="text" value={gRuc} onChange={(e) => setGRuc(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">DV</label>
                <input type="text" value={gDv} onChange={(e) => setGDv(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Factura</label>
                <input type="text" value={gFactura} onChange={(e) => setGFactura(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Categoría</label>
                <select value={gCategoria} onChange={(e) => setGCategoria(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setShowManageCat(!showManageCat)} className="text-[10px] text-gray-300 hover:text-gray-500 mt-1 block">
                  Gestionar categorías
                </button>
                {showManageCat && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs space-y-1">
                    {categorias.map((c) => (
                      <div key={c} className="flex items-center justify-between py-1">
                        <span>{c}</span>
                        <button onClick={() => {
                          const updated = categorias.filter((x) => x !== c);
                          setCategorias(updated);
                          localStorage.setItem("fg_categorias", JSON.stringify(updated.filter((x) => !CATEGORIAS_DEFAULT.includes(x))));
                          if (CATEGORIAS_DEFAULT.includes(c)) {
                            const del = JSON.parse(localStorage.getItem("fg_categorias_deleted") || "[]");
                            localStorage.setItem("fg_categorias_deleted", JSON.stringify([...del, c]));
                          }
                        }} className="text-gray-300 hover:text-red-500 text-xs ml-3">×</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1 mt-1">
                      <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nueva categoría"
                        className="flex-1 border-b border-gray-200 py-0.5 text-xs outline-none" />
                      <button onClick={() => {
                        if (!newCatName.trim() || categorias.includes(newCatName.trim())) return;
                        const updated = [...categorias, newCatName.trim()];
                        setCategorias(updated);
                        localStorage.setItem("fg_categorias", JSON.stringify(updated.filter((x) => !CATEGORIAS_DEFAULT.includes(x))));
                        setNewCatName("");
                      }} className="text-xs text-gray-500 hover:text-black">＋</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-3 items-end">
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">
                  Responsable
                  {!showAddResponsable && (
                    <button onClick={() => setShowAddResponsable(true)} className="text-gray-300 hover:text-gray-500 transition text-xs ml-1">＋</button>
                  )}
                </label>
                {showAddResponsable ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={newResponsable} onChange={(e) => setNewResponsable(e.target.value)} placeholder="Nombre"
                      className="flex-1 border-b border-gray-300 py-1 text-xs outline-none focus:border-black" autoFocus />
                    <button onClick={async () => {
                      if (!newResponsable.trim()) return;
                      await fetch("/api/caja/responsables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: newResponsable.trim() }) });
                      setResponsables([...responsables, newResponsable.trim()]);
                      setGResponsable(newResponsable.trim());
                      setNewResponsable(""); setShowAddResponsable(false);
                    }} className="text-xs text-gray-500 hover:text-black">OK</button>
                    <button onClick={() => { setNewResponsable(""); setShowAddResponsable(false); }} className="text-xs text-gray-300 hover:text-black">×</button>
                  </div>
                ) : (
                  <select value={gResponsable} onChange={(e) => setGResponsable(e.target.value)}
                    className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                    <option value="">—</option>
                    {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Sub-total</label>
                <input type="number" step="0.01" value={gSubtotal} onChange={(e) => setGSubtotal(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">ITBMS</label>
                <select value={gItbmsPct} onChange={(e) => setGItbmsPct(e.target.value)}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Total</label>
                <input type="text" readOnly value={`$${fmt(totalNum)}`}
                  className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent tabular-nums" />
              </div>
              <div className="col-span-2">
                <button onClick={addGasto} disabled={addingGasto || !gNombre || subtotalNum <= 0}
                  className="bg-black text-white px-6 py-1.5 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-40">
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expenses table */}
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Gastos</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">Fecha</th>
                <th className="text-left pb-3 font-medium">Nombre</th>
                <th className="text-left pb-3 font-medium">Categoría</th>
                <th className="text-left pb-3 font-medium">Responsable</th>
                <th className="text-left pb-3 font-medium">Factura</th>
                <th className="text-right pb-3 font-medium">Sub-total</th>
                <th className="text-right pb-3 font-medium">ITBMS</th>
                <th className="text-right pb-3 font-medium">Total</th>
                {isOpen && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr><td colSpan={isOpen ? 9 : 8} className="py-12 text-center text-gray-300 text-sm">Sin gastos registrados</td></tr>
              ) : (
                <>
                  {gastos.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                      <td className="py-3 text-gray-500">{fmtDate(g.fecha)}</td>
                      <td className="py-3">{g.nombre}</td>
                      <td className="py-3 text-gray-500">{g.categoria || "Varios"}</td>
                      <td className="py-3 text-gray-500">{g.responsable || "—"}</td>
                      <td className="py-3 text-gray-500">{g.factura}</td>
                      <td className="py-3 text-right tabular-nums">${fmt(g.subtotal)}</td>
                      <td className="py-3 text-right tabular-nums text-gray-500">${fmt(g.itbms)}</td>
                      <td className="py-3 text-right tabular-nums font-medium">${fmt(g.total)}</td>
                      {isOpen && (
                        <td className="py-3 text-center">
                          <button onClick={() => deleteGasto(g.id)} className="text-gray-300 hover:text-black transition text-sm">×</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t border-gray-300">
                    <td colSpan={5} className="py-3 text-right text-xs uppercase tracking-widest text-gray-400">Totales</td>
                    <td className="py-3 text-right tabular-nums font-medium">${fmt(totalSubtotal)}</td>
                    <td className="py-3 text-right tabular-nums font-medium">${fmt(totalItbms)}</td>
                    <td className="py-3 text-right tabular-nums font-semibold">${fmt(totalGastado)}</td>
                    {isOpen && <td></td>}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Reposicion */}
        {current.estado === "cerrado" && (
          <div className="mt-8 border-t border-gray-100 pt-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reposición de fondos</p>
              <p className="text-sm text-gray-400 mt-0.5">Total a reponer: ${fmt(totalGastado)}</p>
            </div>
            {!current.repuesto ? (
              <button
                onClick={() => aprobarReposicion(current.id)}
                className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
                Aprobar reposición
              </button>
            ) : (
              <span className="text-sm text-green-600 font-medium">
                ✓ Repuesto el {current.repuesto_at ? new Date(current.repuesto_at).toLocaleDateString("es-PA") : ""}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-6 mt-8">
          <button onClick={() => setView("print")}
            className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition">
            Imprimir
          </button>
          {isOpen && (
            <button onClick={() => closePeriodo(current.id)}
              className="text-sm text-gray-400 hover:text-black transition">
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex gap-4 mb-8 no-print">
          <button onClick={() => setView("detail")} className="text-sm text-gray-400 hover:text-black transition">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition">
            Imprimir
          </button>
        </div>

        <div id="print-document" className="border border-gray-200 rounded-lg p-8" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
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
