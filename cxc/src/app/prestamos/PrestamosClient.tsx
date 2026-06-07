"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { EMPRESAS } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmModal, AnimatedNumber, BottomSheet } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
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
export interface Empleado {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  prestamos_movimientos: Movimiento[];
}

export interface PrestamosInitialData {
  empleados: Empleado[];
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

export default function PrestamosClient({ initialData }: { initialData: PrestamosInitialData }) {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "prestamos", allowedRoles: ["admin","contabilidad"] });
  const [empleados, setEmpleados] = useState<Empleado[]>(initialData.empleados);
  const [loading, setLoading] = useState(false);
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

  // Bottom sheet (mobile detail preview)
  const [sheetEmp, setSheetEmp] = useState<Empleado | null>(null);
  const [savingPagoQ, setSavingPagoQ] = useState(false);
  const [confirmPagoQ, setConfirmPagoQ] = useState<Empleado | null>(null);

  // Batch approval state
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [confirmBatchApprove, setConfirmBatchApprove] = useState(false);
  const [confirmBatchReject, setConfirmBatchReject] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  // Aplicar quincena masiva (bulk): confirmación con resumen previo + toast de
  // resultado (NO UndoToast — son registros financieros). La RPC es la fuente
  // autoritativa; estos cómputos client-side solo arman el resumen del modal.
  const [confirmAplicarQ, setConfirmAplicarQ] = useState(false);
  const [aplicandoQ, setAplicandoQ] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadEmpleados = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prestamos/empleados?archivados=${showArchived ? "1" : "0"}`);
      if (res.ok) setEmpleados(await res.json());
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setLoading(false);
  }, [showArchived]);

  // Skipear primer mount (initialData ya pobló empleados via SSR).
  // Refetch en mounts subsiguientes o cuando showArchived cambia.
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    loadEmpleados();
  }, [authChecked, loadEmpleados]);

  if (!authChecked) return null;

  // ── Computed ──
  const allCalcs = empleados.map(e => ({ emp: e, ...calcEmpleado(e) }));
  const totalSaldo = allCalcs.filter(c => c.emp.activo).reduce((s, c) => s + c.saldo, 0);
  const totalPendientes = allCalcs.reduce((s, c) => s + c.pendientes, 0);

  const quincena = getQuincenaRange();
  const empleadosConDeduccion = allCalcs.filter(c => c.emp.activo && c.emp.deduccion_quincenal > 0);
  const empleadosDeducidos = empleadosConDeduccion.filter(c => hasDeduccionEnQuincena(c.emp.prestamos_movimientos || [], quincena.start, quincena.end));
  const deduccionesAplicadas = empleadosDeducidos.length;
  const deduccionesTotal = empleadosConDeduccion.length;
  const deduccionesCompletas = deduccionesTotal > 0 && deduccionesAplicadas === deduccionesTotal;

  // Elegibles para la quincena masiva: con deducción, saldo>0 y aún no deducidos.
  const quincenaElegibles = empleadosConDeduccion.filter(
    c => c.saldo > 0 && !hasDeduccionEnQuincena(c.emp.prestamos_movimientos || [], quincena.start, quincena.end),
  );
  const quincenaPendientesN = quincenaElegibles.length;
  const quincenaTotalEstimado = quincenaElegibles.reduce((s, c) => s + Math.min(c.emp.deduccion_quincenal, c.saldo), 0);

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

  async function aplicarQuincena() {
    setAplicandoQ(true);
    try {
      const res = await fetch("/api/prestamos/aplicar-quincena", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        const ok = json.count_aplicados ?? 0;
        const om = json.count_omitidos ?? 0;
        const total = json.total ?? 0;
        showToast(
          `Aplicada${ok !== 1 ? "s" : ""} ${ok} deducción${ok !== 1 ? "es" : ""} ($${fmt(total)})` +
          (om ? ` · ${om} omitida${om !== 1 ? "s" : ""}` : ""),
        );
        loadEmpleados();
      } else {
        showToast(json.error || "Error al aplicar la quincena");
      }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setAplicandoQ(false);
    setConfirmAplicarQ(false);
  }

  async function descargarHistorial() {
    setExportingExcel(true);
    try {
      const qs = filterEmpresa && filterEmpresa !== "all" ? `?empresa=${encodeURIComponent(filterEmpresa)}` : "";
      const res = await fetch(`/api/prestamos/export-excel${qs}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const today = new Date();
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
        const slug = filterEmpresa && filterEmpresa !== "all" ? filterEmpresa.toLowerCase().replace(/\s+/g, "_") : "todos";
        link.download = `historial_prestamos_${slug}_${ymd}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      } else { showToast("Error al descargar"); }
    } catch { showToast("Error al descargar"); }
    setExportingExcel(false);
  }

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
        {/* Resumen: 2 chips + acción de quincena masiva (confirmación con resumen) */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Saldo pendiente total</div>
            <div className={`text-lg font-semibold tabular-nums ${totalSaldo > 0 ? "text-red-600" : "text-gray-400"}`}>$<AnimatedNumber value={totalSaldo} formatter={(n: number) => fmt(n)} /></div>
          </div>
          <div className={`rounded-lg border px-3.5 py-2 ${deduccionesCompletas ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Quincena · {quincena.label}</div>
            <div className={`text-lg font-semibold tabular-nums ${deduccionesCompletas ? "text-green-600" : "text-amber-600"}`}>{deduccionesAplicadas} / {deduccionesTotal}</div>
          </div>
          {quincenaPendientesN > 0 && (
            <button
              onClick={() => setConfirmAplicarQ(true)}
              className="sm:ml-auto bg-emerald-600 text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-emerald-700 active:scale-[0.97] transition"
            >
              Aplicar quincena ({quincenaPendientesN})
            </button>
          )}
        </div>

        {/* Pending approval banner */}
        {totalPendientes > 0 && (role === "admin") && (
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
                  <div className="flex items-center gap-3">
                    <button disabled={processingId === m.id} onClick={async () => { setProcessingId(m.id); try { const res = await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "aprobado" }) }); if (res.ok) { showToast("Movimiento aprobado"); loadEmpleados(); } else showToast("Error al aprobar"); } finally { setProcessingId(null); } }} className="text-xs bg-green-600 text-white px-5 min-h-[44px] rounded-md hover:bg-green-700 transition disabled:opacity-50 font-medium">{processingId === m.id ? "Procesando..." : "Aprobar"}</button>
                    <button disabled={processingId === m.id} onClick={async () => { setProcessingId(m.id); try { const res = await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "rechazado" }) }); if (res.ok) { showToast("Movimiento rechazado"); loadEmpleados(); } else showToast("Error al rechazar"); } finally { setProcessingId(null); } }} className="text-xs text-red-600 border border-red-200 hover:bg-red-50 transition px-5 min-h-[44px] rounded-md disabled:opacity-50 font-medium">{processingId === m.id ? "..." : "Rechazar"}</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Actions + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={openNewMov} className="bg-black text-white px-5 py-2.5 sm:py-2 rounded-md text-sm hover:bg-gray-800 transition">+ Nuevo préstamo</button>
          <OverflowMenu
            align="left"
            items={[
              { label: "Nuevo empleado", onClick: openNewEmp },
              { label: exportingExcel ? "Descargando…" : "Descargar historial", onClick: descargarHistorial, disabled: exportingExcel },
            ]}
          />

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

        {/* Lista de empleados — fila de 4 elementos: nombre/empresa · progreso · chip quincena · SALDO */}
        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No se encontraron empleados" subtitle="Registra el primer empleado para gestionar préstamos" actionLabel="+ Nuevo empleado" onAction={openNewEmp} />
        ) : (
          <ul className="space-y-2">
            {filtered.map(({ emp, prestado, saldo, pct, pendientes }) => {
              const saldado = saldo <= 0 && prestado > 0;
              const deducida = emp.deduccion_quincenal > 0 && hasDeduccionEnQuincena(emp.prestamos_movimientos || [], quincena.start, quincena.end);
              const pendienteDed = emp.deduccion_quincenal > 0 && !deducida && saldo > 0;
              return (
                <li
                  key={emp.id}
                  onClick={() => handleRowClick(emp)}
                  className={`flex items-center gap-3 sm:gap-4 rounded-lg border p-3 sm:px-4 cursor-pointer hover:bg-gray-50 active:bg-gray-50 transition-colors ${pendientes > 0 ? "border-l-4 border-l-amber-400" : "border-gray-200"} ${!emp.activo ? "opacity-50" : ""}`}
                >
                  {/* 1 · Nombre + empresa */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{emp.nombre}</span>
                      {pendientes > 0 && <span className="shrink-0 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-medium">{pendientes} pend.</span>}
                      {saldado && <span className="shrink-0 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md font-medium">Saldado</span>}
                      {!emp.activo && <span className="shrink-0 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-md">Archivado</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{emp.empresa || "Sin empresa"}</div>
                  </div>

                  {/* 2 · Progreso (fino) — desktop */}
                  <div className="hidden sm:flex items-center gap-2 w-36 shrink-0">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${progressColor(pct)} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
                  </div>

                  {/* 3 · Chip quincena */}
                  <div className="shrink-0 text-center sm:w-24">
                    {emp.deduccion_quincenal <= 0 ? null
                      : deducida ? <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">✓ Deducida</span>
                      : pendienteDed ? <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">⚠ Pendiente</span>
                      : null}
                  </div>

                  {/* 4 · SALDO héroe */}
                  <div className="shrink-0 text-right min-w-[72px]">
                    <div className={`text-base sm:text-lg font-semibold tabular-nums ${saldo > 0 ? "text-gray-900" : saldo < 0 ? "text-blue-600" : "text-gray-400"}`}>${fmt(Math.abs(saldo))}</div>
                    {saldo < 0 && <div className="text-[10px] text-blue-500 -mt-0.5">a favor</div>}
                  </div>

                  {/* Acciones */}
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <OverflowMenu
                      items={[
                        { label: "Editar", onClick: () => openEditEmp(emp) },
                        ...(isAdmin ? [{ label: "Eliminar", onClick: () => requestDeleteEmp(emp), destructive: true }] : []),
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
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

      <ConfirmModal
        open={!!confirmPagoQ}
        onClose={() => setConfirmPagoQ(null)}
        onConfirm={() => { const emp = confirmPagoQ; setConfirmPagoQ(null); if (emp) handlePagoQuincenal(emp); }}
        title="Registrar pago quincenal"
        message={`¿Registrar el pago quincenal de $${fmt(confirmPagoQ?.deduccion_quincenal || 0)} para ${confirmPagoQ?.nombre}? Se descuenta del saldo del préstamo.`}
        confirmLabel="Registrar pago"
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
                  onClick={() => setConfirmPagoQ(sheetEmp)}
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
      <ConfirmModal
        open={confirmAplicarQ}
        onClose={() => setConfirmAplicarQ(false)}
        onConfirm={aplicarQuincena}
        title="Aplicar deducción quincenal"
        message={`Vas a registrar la deducción quincenal a ${quincenaPendientesN} empleado${quincenaPendientesN !== 1 ? "s" : ""} por un total de $${fmt(quincenaTotalEstimado)}. Los que ya tienen deducción esta quincena o saldo en $0 se omiten. La última cuota se ajusta al saldo automáticamente.`}
        confirmLabel={aplicandoQ ? "Aplicando..." : "Aplicar a todos"}
      />

      {pendingUndo && <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />}
      <Toast message={toast} />
    </div>
  );
}
