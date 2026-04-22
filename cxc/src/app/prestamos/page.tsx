"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { EMPRESAS } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal, AnimatedNumber, BottomSheet } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";

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
  const [kpiTooltip, setKpiTooltip] = useState<string | null>(null);

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPendientes, setFilterPendientes] = useState(false);
  const [filterEstadoMov, setFilterEstadoMov] = useState<string>("todos");

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

  // Bottom sheet (mobile detail preview)
  const [sheetEmp, setSheetEmp] = useState<Empleado | null>(null);
  const [savingPagoQ, setSavingPagoQ] = useState(false);

  // Batch approval state
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [confirmBatchApprove, setConfirmBatchApprove] = useState(false);
  const [confirmBatchReject, setConfirmBatchReject] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadEmpleados = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prestamos/empleados?archivados=${showArchived ? "1" : "0"}`);
      if (res.ok) setEmpleados(await res.json());
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
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

  // Movement status counts for filter tabs
  const allMovimientos = allCalcs.flatMap(c => (c.emp.prestamos_movimientos || []));
  const countAprobados = allMovimientos.filter(m => m.estado === "aprobado").length;
  const countRechazados = allMovimientos.filter(m => m.estado === "rechazado").length;

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
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(false);
  }
  function requestDeleteEmp(emp: Empleado) {
    setConfirmDeleteEmp(emp);
  }

  async function doDeleteEmp() {
    if (!confirmDeleteEmp) return;
    const emp = confirmDeleteEmp;
    setConfirmDeleteEmp(null);
    try {
      const res = await fetch(`/api/prestamos/empleados/${emp.id}`, { method: "DELETE" });
      if (res.ok) { showToast("Empleado eliminado"); loadEmpleados(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error al eliminar"); }
    } catch { showToast("Error al eliminar"); }
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
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSavingMov(false);
  }

  const isAdmin = role === "admin";

  // Mobile detection for bottom sheet vs navigation
  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth < 640;
  }

  function handleRowClick(emp: Empleado) {
    if (isMobileViewport()) {
      setSheetEmp(emp);
    } else {
      router.push(`/prestamos/${emp.id}`);
    }
  }

  // Pago quincenal from bottom sheet
  async function handlePagoQuincenal(emp: Empleado) {
    if (!emp.deduccion_quincenal || emp.deduccion_quincenal <= 0) return;
    setSavingPagoQ(true);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_id: emp.id,
          fecha: new Date().toISOString().slice(0, 10),
          concepto: "Pago",
          monto: emp.deduccion_quincenal,
          notas: "Deducción quincenal",
        }),
      });
      if (res.ok) {
        showToast("Pago quincenal registrado");
        setSheetEmp(null);
        loadEmpleados();
      } else {
        const err = await res.json();
        showToast(err.error || "Error al registrar pago");
      }
    } catch { showToast("Sin conexión. Intenta de nuevo."); }
    setSavingPagoQ(false);
  }

  // Computed data for bottom sheet employee
  const sheetCalc = sheetEmp ? calcEmpleado(sheetEmp) : null;
  const sheetMovs = sheetEmp
    ? (sheetEmp.prestamos_movimientos || [])
        .filter(m => m.estado === "aprobado")
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
        .slice(0, 5)
    : [];

  function togglePendingSelect(id: string) {
    setSelectedPending(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doBatchAction(estado: "aprobado" | "rechazado") {
    const ids = Array.from(selectedPending);
    if (ids.length === 0) return;
    setConfirmBatchApprove(false);
    setConfirmBatchReject(false);
    const count = ids.length;
    const label = estado === "aprobado" ? "aprobado" : "rechazado";
    const savedSelected = new Set(selectedPending);

    scheduleAction({
      id: `batch-${estado}-${Date.now()}`,
      message: `${count} movimiento${count !== 1 ? "s" : ""} ${label}${count !== 1 ? "s" : ""}`,
      onOptimistic: () => {
        setSelectedPending(new Set());
      },
      onRevert: () => {
        setSelectedPending(savedSelected);
      },
      execute: async () => {
        setBatchProcessing(true);
        let ok = 0;
        for (const id of ids) {
          try {
            const res = await fetch(`/api/prestamos/movimientos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }) });
            if (res.ok) ok++;
          } catch { /* continue */ }
        }
        showToast(`${ok} movimiento${ok !== 1 ? "s" : ""} ${label}${ok !== 1 ? "s" : ""}`);
        setBatchProcessing(false);
        loadEmpleados();
      },
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Préstamos a Colaboradores" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Total Prestado</div>
              <button onClick={() => setKpiTooltip(kpiTooltip === "prestado" ? null : "prestado")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
            </div>
            <div className="text-lg font-semibold mt-0.5 tabular-nums">$<AnimatedNumber value={totalPrestado} formatter={(n: number) => fmt(n)} /></div>
            {kpiTooltip === "prestado" && <p className="text-xs text-gray-500 mt-1">Suma total de préstamos otorgados a colaboradores</p>}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Saldo Pendiente</div>
              <button onClick={() => setKpiTooltip(kpiTooltip === "saldo" ? null : "saldo")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
            </div>
            <div className="text-lg font-semibold mt-0.5 tabular-nums text-red-600">$<AnimatedNumber value={totalSaldo} formatter={(n: number) => fmt(n)} /></div>
            {kpiTooltip === "saldo" && <p className="text-xs text-gray-500 mt-1">Lo que falta por cobrar de todos los préstamos</p>}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Empleados Activos</div>
              <button onClick={() => setKpiTooltip(kpiTooltip === "empleados" ? null : "empleados")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
            </div>
            <div className="text-lg font-semibold mt-0.5 tabular-nums">{empleadosActivos}</div>
            {kpiTooltip === "empleados" && <p className="text-xs text-gray-500 mt-1">Colaboradores con préstamos en curso</p>}
          </div>
          <div className={`rounded-lg p-3 ${deduccionesCompletas ? "bg-green-50" : "bg-amber-50"}`}>
            <div className="flex items-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Deducciones Quincena</div>
              <button onClick={() => setKpiTooltip(kpiTooltip === "deducciones" ? null : "deducciones")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
            </div>
            <div className={`text-lg font-semibold mt-0.5 tabular-nums ${deduccionesCompletas ? "text-green-600" : "text-amber-600"}`}>
              {deduccionesAplicadas} / {deduccionesTotal}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">{deduccionesAplicadas} deducidos de {deduccionesTotal} empleados</div>
            <div className="text-xs text-gray-400">{quincena.label}</div>
            {kpiTooltip === "deducciones" && <p className="text-xs text-gray-500 mt-1">Cantidad de empleados a los que ya se les aplicó la deducción quincenal vs. el total que tienen deducción configurada</p>}
          </div>
        </div>

        {/* Pending approval banner */}
        {totalPendientes > 0 && (role === "admin" || role === "director") && (
          <button
            onClick={() => setFilterPendientes(!filterPendientes)}
            className="w-full mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left flex items-center justify-between hover:border-amber-400 transition"
          >
            <span className="text-sm text-amber-700">
              Tienes <strong>{totalPendientes}</strong> préstamo{totalPendientes > 1 ? "s" : ""} pendiente{totalPendientes > 1 ? "s" : ""} de aprobación
            </span>
            <span className="text-xs font-medium text-amber-600">{filterPendientes ? "Ver todos los empleados" : "Ver pendientes de aprobar"} →</span>
          </button>
        )}

        {/* Inline approval list when filtering pendientes */}
        {filterPendientes && isAdmin && (() => {
          const pendingMovs = allCalcs.flatMap(c => (c.emp.prestamos_movimientos || []).filter(m => m.estado === "pendiente_aprobacion").map(m => ({ ...m, empNombre: c.emp.nombre })));
          if (pendingMovs.length === 0) return null;
          const allPendingIds = pendingMovs.map(m => m.id);
          const allPendingSelected = allPendingIds.length > 0 && allPendingIds.every(id => selectedPending.has(id));
          return (
            <div className="mb-6 border border-amber-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-amber-50 px-4 py-2">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={allPendingSelected} onChange={() => { if (allPendingSelected) setSelectedPending(new Set()); else setSelectedPending(new Set(allPendingIds)); }} className="accent-black" title="Seleccionar todos" />
                  <span className="text-xs uppercase tracking-wide text-amber-700 font-medium">
                    Movimientos pendientes de aprobacion
                    {selectedPending.size > 0 && <span className="ml-2 normal-case">({selectedPending.size} seleccionado{selectedPending.size !== 1 ? "s" : ""})</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedPending.size > 0 ? (
                    <>
                      <button onClick={() => setConfirmBatchApprove(true)} disabled={batchProcessing} className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-md hover:bg-green-700 transition disabled:opacity-50">
                        {batchProcessing ? "Procesando..." : `Aprobar ${selectedPending.size}`}
                      </button>
                      <button onClick={() => setConfirmBatchReject(true)} disabled={batchProcessing} className="text-xs text-red-500 hover:text-red-700 transition px-3 py-1.5 disabled:opacity-50">
                        Rechazar {selectedPending.size}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setSelectedPending(new Set(allPendingIds)); setConfirmBatchApprove(true); }} className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-md hover:bg-green-700 transition">Aprobar todos</button>
                      <button onClick={() => { setSelectedPending(new Set(allPendingIds)); setConfirmBatchReject(true); }} className="text-xs text-red-500 hover:text-red-700 transition px-3 py-1.5">Rechazar todos</button>
                    </>
                  )}
                </div>
              </div>
              {pendingMovs.map(m => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3 border-t border-amber-100 text-sm border-l-4 border-l-amber-400 bg-amber-50/20">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedPending.has(m.id)} onChange={() => togglePendingSelect(m.id)} className="accent-black" />
                    <span className="text-amber-500 flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    </span>
                    <div>
                      <span className="font-medium">{m.empNombre}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-gray-500">{m.concepto}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="tabular-nums font-semibold">${fmt(m.monto)}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-xs text-gray-400">{fmtDate(m.fecha)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={processingId === m.id} onClick={async () => { setProcessingId(m.id); try { const res = await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "aprobado" }) }); if (res.ok) { showToast("Movimiento aprobado"); loadEmpleados(); } else showToast("Error al aprobar"); } finally { setProcessingId(null); } }} className="text-xs bg-green-600 text-white px-5 py-2.5 rounded-md hover:bg-green-700 transition disabled:opacity-50 font-medium">{processingId === m.id ? "Procesando..." : "Aprobar"}</button>
                    <button disabled={processingId === m.id} onClick={async () => { setProcessingId(m.id); try { const res = await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "rechazado" }) }); if (res.ok) { showToast("Movimiento rechazado"); loadEmpleados(); } else showToast("Error al rechazar"); } finally { setProcessingId(null); } }} className="text-xs text-red-600 border border-red-200 hover:bg-red-50 transition px-5 py-2.5 rounded-md disabled:opacity-50 font-medium">{processingId === m.id ? "..." : "Rechazar"}</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Movement status filter tabs */}
        {(role === "admin" || role === "director") && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-4 max-w-lg overflow-x-auto">
            {[
              { key: "todos", label: "Todos", count: 0, color: "" },
              { key: "pendiente_aprobacion", label: "Pendientes", count: totalPendientes, color: "text-amber-600" },
              { key: "aprobado", label: "Aprobados", count: countAprobados, color: "text-green-600" },
              { key: "rechazado", label: "Rechazados", count: countRechazados, color: "text-red-600" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setFilterEstadoMov(tab.key); if (tab.key === "pendiente_aprobacion") setFilterPendientes(true); else if (filterPendientes && tab.key !== "pendiente_aprobacion") setFilterPendientes(false); }}
                className={`flex items-center gap-1.5 py-2 px-3 text-sm rounded-md transition whitespace-nowrap ${filterEstadoMov === tab.key ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}
              >
                {tab.label}
                {"count" in tab && tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${filterEstadoMov === tab.key ? `${tab.color} bg-white` : "text-gray-400 bg-gray-200"}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Actions + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={openNewEmp} className="border border-gray-200 px-5 py-2.5 sm:py-2 rounded-md text-sm hover:border-gray-400 transition">+ Nuevo Empleado</button>
          <button onClick={openNewMov} className="bg-black text-white px-5 py-2.5 sm:py-2 rounded-md text-sm hover:bg-gray-800 transition">+ Nuevo Préstamo</button>
          <button onClick={() => router.push("/prestamos/reporte")} className="border border-gray-200 px-5 py-2.5 sm:py-2 rounded-md text-sm hover:border-gray-400 transition">Reporte Deducciones</button>
          <button
            disabled={exportingExcel}
            onClick={async () => {
              setExportingExcel(true);
              const now = new Date();
              const q = now.getDate() <= 15 ? "1" : "2";
              const m = String(now.getMonth() + 1);
              const a = String(now.getFullYear());
              try {
                const res = await fetch(`/api/prestamos/export-excel?quincena=${q}&mes=${m}&año=${a}`);
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `prestamos-${q === "1" ? "1ra" : "2da"}-quincena-${MESES[Number(m)]?.toLowerCase()}-${a}.xlsx`;
                  link.click();
                  URL.revokeObjectURL(url);
                } else { showToast("Error al exportar"); }
              } catch { showToast("Error al exportar"); }
              setExportingExcel(false);
            }}
            className="border border-gray-200 px-5 py-2.5 sm:py-2 rounded-md text-sm hover:border-gray-400 transition disabled:opacity-50"
          >{exportingExcel ? "Exportando..." : "Exportar Excel"}</button>

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
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[600px] px-4 sm:px-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Empleado</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal hidden sm:table-cell">Empresa</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Ded. Quincenal</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal hidden sm:table-cell">Total Prestado</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal hidden sm:table-cell">Pagado</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Saldo</th>
                  <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal w-32">Progreso</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal hidden sm:table-cell">Notas</th>
                  <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal hidden sm:table-cell">Deducción</th>
                  <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ emp, prestado, pagado, saldo, pct, pendientes }, i) => {
                  const hasRejected = (emp.prestamos_movimientos || []).some(m => m.estado === "rechazado");
                  return (
                  <tr key={emp.id} onClick={() => handleRowClick(emp)} className={`${pendientes > 0 ? "border-l-4 border-l-amber-400 bg-amber-50/30" : hasRejected ? "border-l-4 border-l-red-300" : i % 2 === 1 ? "bg-gray-50/50" : ""} ${!emp.activo ? "opacity-50" : ""} cursor-pointer hover:bg-gray-50 transition-colors`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {pendientes > 0 ? (
                          <span className="text-amber-500 flex-shrink-0" title="Tiene movimientos pendientes de aprobacion">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          </span>
                        ) : saldo <= 0 && prestado > 0 ? (
                          <span className="text-green-500 flex-shrink-0" title="Prestamo completado">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        ) : null}
                        <span className="font-medium">{emp.nombre}</span>
                      </div>
                      {!emp.activo && <span className="ml-5 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-md">Archivado</span>}
                      {pendientes > 0 && <span className="ml-5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-medium">{pendientes} pendiente{pendientes > 1 ? "s" : ""}</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">{emp.empresa || "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">${fmt(emp.deduccion_quincenal)}</td>
                    <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">${fmt(prestado)}</td>
                    <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">${fmt(pagado)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(saldo)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-md overflow-hidden">
                          <div className={`h-full ${progressColor(pct)} rounded-md transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs max-w-[120px] truncate hidden sm:table-cell" title={emp.notas || ""}>{emp.notas || "—"}</td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      {emp.deduccion_quincenal > 0 ? (
                        hasDeduccionEnQuincena(emp.prestamos_movimientos || [], quincena.start, quincena.end)
                          ? <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md">✓ Deducida</span>
                          : <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">⚠ Pendiente</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEditEmp(emp); }} className="p-2.5 sm:p-1.5 hover:bg-gray-100 rounded-lg transition" title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); requestDeleteEmp(emp); }} className="p-2.5 sm:p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: New/Edit Employee ── */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
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
                <p className="text-[10px] text-gray-400 mt-1">Monto que se deduce cada quincena del salario del colaborador</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" placeholder="Notas opcionales..." />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEmpModal(false)} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveEmp} disabled={saving} className="flex-1 py-2 bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {saving ? "Guardando..." : editingEmp ? "Guardar Cambios" : "Crear Empleado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: New Movement ── */}
      {showMovModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
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
                <button onClick={() => setShowMovModal(false)} className="w-full py-2 border rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
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
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowMovModal(false)} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveMov} disabled={savingMov} className="flex-1 py-2 bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
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

      {/* ── Bottom Sheet: Mobile Employee Preview ── */}
      <BottomSheet open={!!sheetEmp} onClose={() => setSheetEmp(null)}>
        {sheetEmp && sheetCalc && (
          <div>
            {/* Employee name */}
            <h2 className="text-lg font-semibold mb-1">{sheetEmp.nombre}</h2>
            <p className="text-sm text-gray-400 mb-4">{sheetEmp.empresa || "Sin empresa"}</p>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Prestado</div>
                <div className="text-sm font-semibold tabular-nums mt-0.5">${fmt(sheetCalc.prestado)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Pagado</div>
                <div className="text-sm font-semibold tabular-nums mt-0.5 text-green-600">${fmt(sheetCalc.pagado)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Saldo</div>
                <div className="text-sm font-semibold tabular-nums mt-0.5 text-red-600">${fmt(sheetCalc.saldo)}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Progreso</span>
                <span className="text-xs font-medium tabular-nums">{sheetCalc.pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full ${progressColor(sheetCalc.pct)} rounded-full`} style={{ width: `${Math.min(sheetCalc.pct, 100)}%` }} />
              </div>
            </div>

            {/* Recent movements */}
            {sheetMovs.length > 0 && (
              <div className="mb-5">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Últimos movimientos</div>
                <div className="space-y-0 border border-gray-200 rounded-lg overflow-hidden">
                  {sheetMovs.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 last:border-b-0">
                      <div>
                        <span className={`text-sm font-medium ${
                          m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño"
                            ? "text-red-600" : "text-green-600"
                        }`}>{m.concepto}</span>
                        <span className="text-xs text-gray-400 ml-2">{m.fecha}</span>
                      </div>
                      <span className={`text-sm font-medium tabular-nums ${
                        m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño"
                          ? "text-red-600" : "text-green-600"
                      }`}>
                        {m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño" ? "+" : "−"}${fmt(m.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              {sheetEmp.deduccion_quincenal > 0 && sheetCalc.saldo > 0 && (
                <button
                  onClick={() => handlePagoQuincenal(sheetEmp)}
                  disabled={savingPagoQ}
                  className="w-full bg-black text-white py-3 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {savingPagoQ ? "Registrando..." : `Pago Quincenal — $${fmt(sheetEmp.deduccion_quincenal)}`}
                </button>
              )}
              <button
                onClick={() => { setSheetEmp(null); router.push(`/prestamos/${sheetEmp.id}`); }}
                className="w-full border border-gray-200 text-gray-600 py-3 rounded-md text-sm font-medium hover:border-gray-400 active:bg-gray-50 transition-all"
              >
                Ver completo
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmModal
        open={confirmBatchApprove}
        onClose={() => setConfirmBatchApprove(false)}
        onConfirm={() => doBatchAction("aprobado")}
        title="Aprobar movimientos"
        message={`¿Aprobar ${selectedPending.size} movimiento${selectedPending.size !== 1 ? "s" : ""}?`}
        confirmLabel="Aprobar"
      />
      <ConfirmModal
        open={confirmBatchReject}
        onClose={() => setConfirmBatchReject(false)}
        onConfirm={() => doBatchAction("rechazado")}
        title="Rechazar movimientos"
        message={`¿Rechazar ${selectedPending.size} movimiento${selectedPending.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`}
        confirmLabel="Rechazar"
        destructive
      />
      {pendingUndo && <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />}
      <Toast message={toast} />
    </div>
  );
}
