"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { EMPRESAS } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal } from "@/components/ui";

// ── Types ──
interface Movimiento {
  id: string;
  empleado_id: string;
  fecha: string;
  concepto: string;
  monto: number;
  notas: string;
  estado: string;
  created_at: string;
}
interface Empleado {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  prestamos_movimientos: Movimiento[];
}

// ── Helpers ──
function calcEmpleado(emp: Empleado) {
  const movs = emp.prestamos_movimientos || [];
  const prestado = movs.filter(m => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const pagado = movs.filter(m => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const saldo = prestado - pagado;
  const pct = prestado > 0 ? (pagado / prestado) * 100 : 0;
  const pendientes = movs.filter(m => m.estado === "pendiente_aprobacion").length;
  return { prestado, pagado, saldo, pct, pendientes };
}

function progressColor(pct: number) {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function getQuincenaRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (now.getDate() <= 15) {
    return { start: new Date(y, m, 1), end: new Date(y, m, 15), label: `1 al 15 de ${MESES[m + 1]} ${y}` };
  } else {
    return { start: new Date(y, m, 16), end: new Date(y, m + 1, 0), label: `16 al ${new Date(y, m + 1, 0).getDate()} de ${MESES[m + 1]} ${y}` };
  }
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function hasDeduccionEnQuincena(movs: Movimiento[], qStart: Date, qEnd: Date): boolean {
  const tolerance = 3 * 86400000; // 3 days in ms
  return movs.some(m => {
    if (m.estado !== "aprobado") return false;
    if (m.concepto !== "Pago" && m.concepto !== "Abono extra") return false;
    const fecha = new Date(m.fecha + "T12:00:00");
    return fecha.getTime() >= qStart.getTime() - tolerance && fecha.getTime() <= qEnd.getTime() + tolerance;
  });
}

export default function PrestamosPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "prestamos", allowedRoles: ["admin","contabilidad"] });
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPendientes, setFilterPendientes] = useState(false);

  // Confirm delete employee
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<Empleado | null>(null);

  // Modal: new/edit employee
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Empleado | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fDeduccion, setFDeduccion] = useState("");
  const [fNotas, setFNotas] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal: new movement
  const [showMovModal, setShowMovModal] = useState(false);
  const [mEmpleadoId, setMEmpleadoId] = useState("");
  const [mFecha, setMFecha] = useState(new Date().toISOString().slice(0, 10));
  const [mConcepto, setMConcepto] = useState("Préstamo");
  const [mMonto, setMMonto] = useState("");
  const [mNotas, setMNotas] = useState("");
  const [savingMov, setSavingMov] = useState(false);
  const [movStep, setMovStep] = useState("form");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadEmpleados = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prestamos/empleados?archivados=${showArchived ? "1" : "0"}`);
      if (res.ok) setEmpleados(await res.json());
    } catch { showToast("Error de conexión"); }
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { if (authChecked) loadEmpleados(); }, [authChecked, loadEmpleados]);

  if (!authChecked) return null;

  // ── Computed ──
  const allCalcs = empleados.map(e => ({ emp: e, ...calcEmpleado(e) }));
  const totalPrestado = allCalcs.reduce((s, c) => s + c.prestado, 0);
  const totalSaldo = allCalcs.filter(c => c.emp.activo).reduce((s, c) => s + c.saldo, 0);
  const empleadosActivos = empleados.filter(e => e.activo).length;
  const totalPendientes = allCalcs.reduce((s, c) => s + c.pendientes, 0);

  const quincena = getQuincenaRange();
  const empleadosConDeduccion = allCalcs.filter(c => c.emp.activo && c.emp.deduccion_quincenal > 0);
  const empleadosDeducidos = empleadosConDeduccion.filter(c => hasDeduccionEnQuincena(c.emp.prestamos_movimientos || [], quincena.start, quincena.end));
  const deduccionesAplicadas = empleadosDeducidos.length;
  const deduccionesTotal = empleadosConDeduccion.length;
  const deduccionesCompletas = deduccionesTotal > 0 && deduccionesAplicadas === deduccionesTotal;

  // Filtered
  const filtered = allCalcs.filter(c => {
    if (filterEmpresa !== "all" && c.emp.empresa !== filterEmpresa) return false;
    if (search && !c.emp.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPendientes && c.pendientes === 0) return false;
    return true;
  });

  // ── Employee modal handlers ──
  function openNewEmp() {
    setEditingEmp(null); setFNombre(""); setFEmpresa(""); setFDeduccion(""); setFNotas("");
    setShowEmpModal(true);
  }
  function openEditEmp(emp: Empleado) {
    setEditingEmp(emp);
    setFNombre(emp.nombre);
    setFEmpresa(emp.empresa || "");
    setFDeduccion(String(emp.deduccion_quincenal));
    setFNotas(emp.notas || "");
    setShowEmpModal(true);
  }
  async function saveEmp() {
    if (!fNombre.trim()) { showToast("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const body = { nombre: fNombre.trim(), empresa: fEmpresa || null, deduccion_quincenal: Number(fDeduccion) || 0, notas: fNotas || null };
      const url = editingEmp ? `/api/prestamos/empleados/${editingEmp.id}` : "/api/prestamos/empleados";
      const method = editingEmp ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        showToast(editingEmp ? "Empleado actualizado" : "Empleado creado");
        setShowEmpModal(false); loadEmpleados();
      } else {
        const err = await res.json(); showToast(err.error || "Error al guardar");
      }
    } catch { showToast("Error de conexión"); }
    setSaving(false);
  }
  function requestDeleteEmp(emp: Empleado) {
    setConfirmDeleteEmp(emp);
  }

  async function doDeleteEmp() {
    if (!confirmDeleteEmp) return;
    const emp = confirmDeleteEmp;
    setConfirmDeleteEmp(null);
    const res = await fetch(`/api/prestamos/empleados/${emp.id}`, { method: "DELETE" });
    if (res.ok) { showToast("Empleado eliminado"); loadEmpleados(); }
    else { const err = await res.json(); showToast(err.error || "Error al eliminar"); }
  }

  // ── Movement modal handlers ──
  function openNewMov() {
    setMEmpleadoId(""); setMFecha(new Date().toISOString().slice(0, 10));
    setMConcepto("Préstamo"); setMMonto(""); setMNotas("");
    setMovStep("employee");
    setShowMovModal(true);
  }
  async function saveMov() {
    if (!mEmpleadoId || !mFecha || !mConcepto || !mMonto || Number(mMonto) <= 0) {
      showToast("Completa todos los campos con un monto válido"); return;
    }
    setSavingMov(true);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_id: mEmpleadoId, fecha: mFecha, concepto: mConcepto, monto: Number(mMonto), notas: mNotas }),
      });
      if (res.ok) {
        showToast("Movimiento registrado");
        setShowMovModal(false); loadEmpleados();
      } else {
        const err = await res.json(); showToast(err.error || "Error al guardar");
      }
    } catch { showToast("Error de conexión"); }
    setSavingMov(false);
  }

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Préstamos a Colaboradores" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Prestado</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">${fmt(totalPrestado)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Saldo Pendiente Total</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums text-red-600">${fmt(totalSaldo)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Empleados Activos</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">{empleadosActivos}</div>
          </div>
          <div className={`rounded-xl p-4 ${deduccionesCompletas ? "bg-green-50" : "bg-amber-50"}`}>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Deducciones Quincena</div>
            <div className={`text-2xl font-semibold mt-1 tabular-nums ${deduccionesCompletas ? "text-green-600" : "text-amber-600"}`}>
              {deduccionesAplicadas} / {deduccionesTotal}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">Quincena del {quincena.label}</div>
          </div>
        </div>

        {/* Pending approval banner */}
        {totalPendientes > 0 && (role === "admin" || role === "director") && (
          <button
            onClick={() => setFilterPendientes(!filterPendientes)}
            className="w-full mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left flex items-center justify-between hover:border-amber-400 transition"
          >
            <span className="text-sm text-amber-700">
              Tienes <strong>{totalPendientes}</strong> préstamo{totalPendientes > 1 ? "s" : ""} pendiente{totalPendientes > 1 ? "s" : ""} de aprobación
            </span>
            <span className="text-xs text-amber-500">{filterPendientes ? "Mostrar todos" : "Filtrar"} →</span>
          </button>
        )}

        {/* Actions + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={openNewEmp} className="bg-black text-white px-5 py-2 rounded-full text-sm hover:bg-gray-800 transition">+ Nuevo Empleado</button>
          <button onClick={openNewMov} className="bg-black text-white px-5 py-2 rounded-full text-sm hover:bg-gray-800 transition">+ Nuevo Préstamo</button>
          <button onClick={() => router.push("/prestamos/reporte")} className="border border-gray-200 px-5 py-2 rounded-full text-sm hover:border-gray-400 transition">Reporte Deducciones</button>

          <div className="flex-1" />

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empleado..."
            className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition w-40"
          />
          <select
            value={filterEmpresa}
            onChange={e => setFilterEmpresa(e.target.value)}
            className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition"
          >
            <option value="all">Todas las empresas</option>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-black" />
            Ver archivados
          </label>
        </div>

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No se encontraron empleados" subtitle="Registra el primer empleado para gestionar préstamos" actionLabel="+ Nuevo Empleado" onAction={openNewEmp} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Empleado</th>
                  <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Empresa</th>
                  <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Ded. Quincenal</th>
                  <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Total Prestado</th>
                  <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Pagado</th>
                  <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Saldo</th>
                  <th className="py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal w-32">Progreso</th>
                  <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Notas</th>
                  <th className="py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Deducción</th>
                  <th className="py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ emp, prestado, pagado, saldo, pct, pendientes }, i) => (
                  <tr key={emp.id} onClick={() => router.push(`/prestamos/${emp.id}`)} className={`${i % 2 === 1 ? "bg-gray-50/50" : ""} ${!emp.activo ? "opacity-50" : ""} cursor-pointer hover:bg-gray-50 transition-colors`}>
                    <td className="py-3 px-4">
                      <span className="font-medium">{emp.nombre}</span>
                      {!emp.activo && <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Archivado</span>}
                      {pendientes > 0 && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{pendientes} pendiente{pendientes > 1 ? "s" : ""}</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-500">{emp.empresa || "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">${fmt(emp.deduccion_quincenal)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">${fmt(prestado)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">${fmt(pagado)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(saldo)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full ${progressColor(pct)} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs max-w-[120px] truncate" title={emp.notas || ""}>{emp.notas || "—"}</td>
                    <td className="py-3 px-4">
                      {emp.deduccion_quincenal > 0 ? (
                        hasDeduccionEnQuincena(emp.prestamos_movimientos || [], quincena.start, quincena.end)
                          ? <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">✓ Deducida</span>
                          : <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">⚠ Pendiente</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEditEmp(emp); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); requestDeleteEmp(emp); }} className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: New/Edit Employee ── */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="font-medium mb-4">{editingEmp ? "Editar Empleado" : "Nuevo Empleado"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase">Nombre *</label>
                <input value={fNombre} onChange={e => setFNombre(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Empresa</label>
                <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
                  <option value="">Sin asignar</option>
                  {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Deducción Quincenal ($)</label>
                <input type="number" step="0.01" min="0" value={fDeduccion} onChange={e => setFDeduccion(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" placeholder="Notas opcionales..." />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowEmpModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveEmp} disabled={saving} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {saving ? "Guardando..." : editingEmp ? "Guardar Cambios" : "Crear Empleado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: New Movement ── */}
      {showMovModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            {movStep === "employee" && !mEmpleadoId ? (<>
              <h2 className="font-medium mb-4">Seleccionar Empleado</h2>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {empleados.filter(e => e.activo).map(emp => {
                  const c = calcEmpleado(emp);
                  return (
                    <button key={emp.id} onClick={() => { setMEmpleadoId(emp.id); setMovStep("form"); }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{emp.nombre}</div>
                        <div className="text-xs text-gray-400">{emp.empresa || "Sin empresa"}</div>
                      </div>
                      <div className="text-xs text-gray-500 tabular-nums">Saldo: ${fmt(c.saldo)}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                <button onClick={() => setShowMovModal(false)} className="w-full py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              </div>
            </>) : (<>
            <h2 className="font-medium mb-4">Nuevo Movimiento</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase">Empleado *</label>
                <select value={mEmpleadoId} onChange={e => setMEmpleadoId(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
                  <option value="">Seleccionar...</option>
                  {empleados.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Fecha *</label>
                <input type="date" value={mFecha} onChange={e => setMFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Concepto *</label>
                <select value={mConcepto} onChange={e => setMConcepto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
                  <option value="Préstamo">Préstamo</option>
                  <option value="Pago">Pago</option>
                  <option value="Abono extra">Abono extra</option>
                  <option value="Responsabilidad por daño">Responsabilidad por daño</option>
                  <option value="Pago de responsabilidad">Pago de responsabilidad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
                <input type="number" step="0.01" min="0.01" value={mMonto} onChange={e => setMMonto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
              </div>
              {(mConcepto === "Préstamo" || mConcepto === "Responsabilidad por daño") && Number(mMonto) >= 500 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  ⚠ Este préstamo requiere aprobación por el monto (≥ $500)
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={mNotas} onChange={e => setMNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" placeholder="Notas opcionales..." />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowMovModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveMov} disabled={savingMov} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {savingMov ? "Guardando..." : "Registrar"}
              </button>
            </div>
            </>)}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDeleteEmp}
        onClose={() => setConfirmDeleteEmp(null)}
        onConfirm={doDeleteEmp}
        title="Eliminar empleado"
        message={`¿Eliminar a ${confirmDeleteEmp?.nombre}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />

      <Toast message={toast} />
    </div>
  );
}
