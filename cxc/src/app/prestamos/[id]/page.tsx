"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";

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

const EMPRESAS = [
  "Vistana International", "Fashion Shoes", "Fashion Wear", "Active Shoes",
  "Active Wear", "Joystep", "Confecciones Boston", "Multifashion",
];

function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }

function progressColor(pct: number) {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}
function progressColorText(pct: number) {
  if (pct >= 75) return "text-green-600";
  if (pct >= 25) return "text-amber-600";
  return "text-red-600";
}

export default function PrestamoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Unified movement modal
  const [showMovModal, setShowMovModal] = useState(false);
  const [movStep, setMovStep] = useState<"type" | "form">("type");
  const [mConcepto, setMConcepto] = useState("Préstamo");
  const [mLabel, setMLabel] = useState("");
  const [mFecha, setMFecha] = useState(new Date().toISOString().slice(0, 10));
  const [mMonto, setMMonto] = useState("");
  const [mNotas, setMNotas] = useState("");
  const [savingMov, setSavingMov] = useState(false);

  // Edit employee modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [fNombre, setFNombre] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fDeduccion, setFDeduccion] = useState("");
  const [fNotas, setFNotas] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Edit movement modal
  const [showEditMovModal, setShowEditMovModal] = useState(false);
  const [editMovId, setEditMovId] = useState("");
  const [emFecha, setEmFecha] = useState("");
  const [emConcepto, setEmConcepto] = useState("");
  const [emMonto, setEmMonto] = useState("");
  const [emNotas, setEmNotas] = useState("");
  const [savingEditMov, setSavingEditMov] = useState(false);

  // Pago quincenal confirm
  const [showPagoConfirm, setShowPagoConfirm] = useState(false);

  // Danger zone
  const [dangerOpen, setDangerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");
  const [showForceArchive, setShowForceArchive] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "upload" || r === "secretaria") { router.push("/plantillas"); return; }
    setRole(r); setAuthChecked(true);
  }, [router]);

  const loadEmpleado = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prestamos/empleados/${id}`);
      if (res.ok) setEmpleado(await res.json());
      else router.push("/prestamos");
    } catch { router.push("/prestamos"); }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { if (authChecked) loadEmpleado(); }, [authChecked, loadEmpleado]);

  if (!authChecked || loading || !empleado) return null;

  const isAdmin = role === "admin";
  const isAdminOrDirector = role === "admin" || role === "director";
  const canEdit = role === "admin" || role === "contabilidad";
  const movs = empleado.prestamos_movimientos || [];
  const sortedMovs = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));

  const prestado = movs.filter(m => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const pagado = movs.filter(m => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const saldo = prestado - pagado;
  const pct = prestado > 0 ? (pagado / prestado) * 100 : 0;
  const hasMovs = movs.length > 0;

  // ── Movement type definitions ──
  const movTypes = [
    { key: "pago_quincenal", label: "Pago Quincenal", concepto: "Pago", icon: "💳", color: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400", sign: "−" },
    { key: "prestamo", label: "Préstamo", concepto: "Préstamo", icon: "➕", color: "bg-red-50 border-red-200 text-red-700 hover:border-red-400", sign: "+" },
    { key: "pago_extra", label: "Pago Extra", concepto: "Pago", icon: "💰", color: "bg-green-50 border-green-200 text-green-700 hover:border-green-400", sign: "−" },
    { key: "responsabilidad", label: "Responsabilidad por daño", concepto: "Responsabilidad por daño", icon: "⚠️", color: "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400", sign: "+" },
    { key: "abono_extra", label: "Abono Extra", concepto: "Abono extra", icon: "🔄", color: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400", sign: "−" },
    { key: "pago_resp", label: "Pago de responsabilidad", concepto: "Pago de responsabilidad", icon: "✅", color: "bg-purple-50 border-purple-200 text-purple-700 hover:border-purple-400", sign: "−" },
  ];

  // ── Movement handlers ──
  function openMovModal() {
    setMovStep("type");
    setShowMovModal(true);
  }

  function selectMovType(typeKey: string) {
    const t = movTypes.find(x => x.key === typeKey);
    if (!t) return;
    setMConcepto(t.concepto);
    setMLabel(t.label);
    setMFecha(new Date().toISOString().slice(0, 10));
    if (typeKey === "pago_quincenal" && empleado) {
      setMMonto(String(empleado.deduccion_quincenal || ""));
      setMNotas("Deducción quincenal");
    } else {
      setMMonto("");
      setMNotas("");
    }
    setMovStep("form");
  }

  async function saveMov() {
    if (!mFecha || !mMonto || Number(mMonto) <= 0) { showToast("Completa todos los campos"); return; }
    setSavingMov(true);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_id: id, fecha: mFecha, concepto: mConcepto, monto: Number(mMonto), notas: mNotas }),
      });
      if (res.ok) { showToast("Movimiento registrado"); setShowMovModal(false); loadEmpleado(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSavingMov(false);
  }

  async function deleteMov(movId: string) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    const res = await fetch(`/api/prestamos/movimientos/${movId}`, { method: "DELETE" });
    if (res.ok) { showToast("Movimiento eliminado"); loadEmpleado(); }
    else showToast("Error al eliminar");
  }

  async function approveMov(movId: string) {
    const res = await fetch(`/api/prestamos/movimientos/${movId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "aprobado" }),
    });
    if (res.ok) { showToast("Movimiento aprobado"); loadEmpleado(); }
    else showToast("Error al aprobar");
  }

  // ── Edit movement ──
  function openEditMov(m: Movimiento) {
    setEditMovId(m.id);
    setEmFecha(m.fecha);
    setEmConcepto(m.concepto);
    setEmMonto(String(m.monto));
    setEmNotas(m.notas || "");
    setShowEditMovModal(true);
  }

  async function saveEditMov() {
    if (!emFecha || !emMonto || Number(emMonto) <= 0) { showToast("Completa todos los campos"); return; }
    setSavingEditMov(true);
    try {
      const res = await fetch(`/api/prestamos/movimientos/${editMovId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: emFecha, concepto: emConcepto, monto: Number(emMonto), notas: emNotas || null }),
      });
      if (res.ok) { showToast("Movimiento actualizado"); setShowEditMovModal(false); loadEmpleado(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSavingEditMov(false);
  }

  // ── Pago quincenal automático ──
  function pagoQuincenal() {
    if (!empleado || !empleado.deduccion_quincenal || empleado.deduccion_quincenal <= 0) {
      showToast("Este empleado no tiene deducción quincenal configurada"); return;
    }
    setShowPagoConfirm(true);
  }

  async function confirmarPagoQuincenal() {
    if (!empleado) return;
    setShowPagoConfirm(false);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_id: id,
          fecha: new Date().toISOString().slice(0, 10),
          concepto: "Pago",
          monto: empleado.deduccion_quincenal,
          notas: "Deducción quincenal",
        }),
      });
      if (res.ok) { showToast(`Pago quincenal de $${fmt(empleado.deduccion_quincenal)} registrado`); loadEmpleado(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
  }

  // ── Employee edit ──
  function openEditModal() {
    if (!empleado) return;
    setFNombre(empleado.nombre);
    setFEmpresa(empleado.empresa || "");
    setFDeduccion(String(empleado.deduccion_quincenal));
    setFNotas(empleado.notas || "");
    setShowEditModal(true);
  }

  async function saveEdit() {
    if (!fNombre.trim()) { showToast("Nombre requerido"); return; }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/prestamos/empleados/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: fNombre.trim(), empresa: fEmpresa || null, deduccion_quincenal: Number(fDeduccion) || 0, notas: fNotas || null }),
      });
      if (res.ok) { showToast("Empleado actualizado"); setShowEditModal(false); loadEmpleado(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSavingEdit(false);
  }

  // ── Archive / Reactivate ──
  async function toggleArchive() {
    if (!empleado) return;
    const newState = !empleado.activo;
    const res = await fetch(`/api/prestamos/empleados/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: newState }),
    });
    if (res.ok) { showToast(newState ? "Empleado reactivado" : "Empleado archivado"); loadEmpleado(); }
    else showToast("Error al actualizar");
  }

  // ── Danger zone handlers ──
  async function deleteEmployee() {
    const res = await fetch(`/api/prestamos/empleados/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("Empleado eliminado"); router.push("/prestamos"); }
    else { const err = await res.json(); showToast(err.error || "Error"); }
    setShowDeleteConfirm(false);
  }

  async function clearHistory() {
    for (const m of movs) {
      await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "DELETE" });
    }
    showToast("Historial eliminado");
    setClearInput(""); setShowClearConfirm(false);
    loadEmpleado();
  }

  async function forceArchive() {
    const res = await fetch(`/api/prestamos/empleados/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    if (res.ok) { showToast("Empleado archivado"); loadEmpleado(); }
    else showToast("Error");
    setShowForceArchive(false);
  }

  const conceptoColors: Record<string, string> = {
    "Préstamo": "text-red-600",
    "Pago": "text-green-600",
    "Abono extra": "text-blue-600",
    "Responsabilidad por daño": "text-amber-600",
    "Pago de responsabilidad": "text-purple-600",
  };

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Préstamos"
        breadcrumbs={[
          { label: "Préstamos", onClick: () => router.push("/prestamos") },
          { label: empleado.nombre },
        ]}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{empleado.nombre}</h1>
            <div className="flex items-center gap-2 mt-1">
              {empleado.empresa && <span className="text-sm text-gray-500">{empleado.empresa}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full ${empleado.activo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {empleado.activo ? "Activo" : "Archivado"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={openEditModal} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Editar</button>
            {empleado.activo && saldo === 0 && (
              <button onClick={toggleArchive} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Archivar</button>
            )}
            {!empleado.activo && (
              <button onClick={toggleArchive} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Reactivar</button>
            )}
            <button onClick={() => router.push("/prestamos")} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Volver</button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Prestado</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">${fmt(prestado)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Pagado</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums text-green-600">${fmt(pagado)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Saldo Pendiente</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums text-red-600">${fmt(saldo)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Progreso de pago</span>
            <span className={`text-sm font-medium tabular-nums ${progressColorText(pct)}`}>{pct.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${progressColor(pct)} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button onClick={pagoQuincenal} className="bg-emerald-600 text-white px-5 py-2 rounded-full text-sm hover:bg-emerald-700 transition font-medium">Pago Quincenal · ${fmt(empleado.deduccion_quincenal)}</button>
          <button onClick={openMovModal} className="bg-black text-white px-5 py-2 rounded-full text-sm hover:bg-gray-800 transition">+ Nuevo Movimiento</button>
        </div>

        {/* Movements table */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Historial de Movimientos</h2>
          {sortedMovs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Sin movimientos registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Fecha</th>
                    <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Concepto</th>
                    <th className="text-right py-3 px-3 text-xs uppercase text-gray-400">Monto</th>
                    <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Notas</th>
                    <th className="text-left py-3 px-3 text-xs uppercase text-gray-400">Estado</th>
                    <th className="py-3 px-3 text-xs uppercase text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMovs.map((m, i) => (
                    <tr key={m.id} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                      <td className="py-3 px-3 tabular-nums">{fmtDate(m.fecha)}</td>
                      <td className={`py-3 px-3 font-medium ${conceptoColors[m.concepto] || ""}`}>{m.concepto}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium">${fmt(m.monto)}</td>
                      <td className="py-3 px-3 text-gray-400 text-xs max-w-[200px] truncate" title={m.notas || ""}>{m.notas || "—"}</td>
                      <td className="py-3 px-3">
                        {m.estado === "aprobado" ? (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Aprobado</span>
                        ) : (
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Pendiente aprobación</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          {m.estado === "pendiente_aprobacion" && isAdminOrDirector && (
                            <button onClick={() => approveMov(m.id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700 transition">Aprobar</button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEditMov(m)} className="p-1.5 hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-500" title="Editar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => deleteMov(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
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

        {/* ── Danger Zone (collapsible) ── */}
        {isAdmin && (
          <div className="mt-12">
            <button onClick={() => setDangerOpen(!dangerOpen)} className="flex items-center gap-2 text-xs text-red-400 hover:text-red-600 transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Zona de acciones peligrosas
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${dangerOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {dangerOpen && (
            <div className="border border-red-200 bg-red-50/50 rounded-2xl p-6 mt-2">
            <div className="space-y-3">
              {/* Delete Employee */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-red-700">Eliminar Empleado</div>
                  <div className="text-xs text-red-400">Elimina permanentemente al empleado y todos sus datos</div>
                </div>
                <button
                  onClick={() => { setDeleteInput(""); setShowDeleteConfirm(true); }}
                  disabled={hasMovs}
                  title={hasMovs ? "Debes borrar todos los movimientos primero" : ""}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-full hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Eliminar
                </button>
              </div>

              {/* Clear History */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-red-700">Borrar Todo el Historial</div>
                  <div className="text-xs text-red-400">Elimina todos los movimientos pero mantiene al empleado</div>
                </div>
                <button
                  onClick={() => { setClearInput(""); setShowClearConfirm(true); }}
                  disabled={!hasMovs}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-full hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Borrar Historial
                </button>
              </div>

              {/* Force Archive */}
              {isAdminOrDirector && empleado.activo && saldo > 0 && (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-700">Forzar Archivado</div>
                    <div className="text-xs text-red-400">Archiva aunque tenga saldo pendiente (salida de empresa)</div>
                  </div>
                  <button
                    onClick={() => setShowForceArchive(true)}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-full hover:bg-red-700 transition flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Forzar Archivado
                  </button>
                </div>
              )}
            </div>
          </div>
            )}
          </div>
        )}

        {/* Also show Force Archive for director (outside danger zone) */}
        {role === "director" && !isAdmin && empleado.activo && saldo > 0 && (
          <div className="border border-red-200 bg-red-50/50 rounded-2xl p-6 mt-12">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-red-700">Forzar Archivado</div>
                <div className="text-xs text-red-400">Archiva aunque tenga saldo pendiente (salida de empresa)</div>
              </div>
              <button onClick={() => setShowForceArchive(true)} className="px-4 py-2 bg-red-600 text-white text-sm rounded-full hover:bg-red-700 transition">
                Forzar Archivado
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: New Movement (type selector + form) ── */}
      {showMovModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
            {movStep === "type" ? (<>
              <h2 className="font-medium mb-4">Nuevo Movimiento</h2>
              <div className="grid grid-cols-2 gap-2">
                {movTypes.map((t) => (
                  <button key={t.key} onClick={() => selectMovType(t.key)} className={`border rounded-xl px-3 py-3 text-left transition ${t.color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{t.icon}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </div>
                    <span className="text-[10px] opacity-60">Signo: {t.sign}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <button onClick={() => setShowMovModal(false)} className="w-full py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              </div>
            </>) : (<>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setMovStep("type")} className="text-gray-400 hover:text-black transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <h2 className="font-medium">{mLabel}</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase">Fecha *</label>
                  <input type="date" value={mFecha} onChange={e => setMFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
                  <input type="number" step="0.01" min="0.01" value={mMonto} onChange={e => setMMonto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
                </div>
                {(mConcepto === "Préstamo" || mConcepto === "Responsabilidad por daño") && Number(mMonto) >= 500 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠ Este movimiento requiere aprobación por el monto (≥ $500)
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-400 uppercase">Notas</label>
                  <textarea value={mNotas} onChange={e => setMNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
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

      {/* ── Modal: Edit Employee ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="font-medium mb-4">Editar Empleado</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase">Nombre *</label>
                <input value={fNombre} onChange={e => setFNombre(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
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
                <input type="number" step="0.01" min="0" value={fDeduccion} onChange={e => setFDeduccion(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {savingEdit ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Pago Quincenal Confirm ── */}
      {showPagoConfirm && empleado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-3">Confirmar Pago Quincenal</h2>
            <p className="text-sm text-gray-500">¿Registrar pago quincenal de <strong className="text-black">${fmt(empleado.deduccion_quincenal)}</strong> para <strong className="text-black">{empleado.nombre}</strong>?</p>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowPagoConfirm(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={confirmarPagoQuincenal} className="flex-1 py-2 bg-emerald-600 text-white rounded-full text-sm hover:bg-emerald-700 transition">Confirmar Pago</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Movement ── */}
      {showEditMovModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="font-medium mb-4">Editar Movimiento</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase">Fecha *</label>
                <input type="date" value={emFecha} onChange={e => setEmFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Concepto</label>
                <select value={emConcepto} onChange={e => setEmConcepto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
                  <option value="Préstamo">Préstamo</option>
                  <option value="Pago">Pago</option>
                  <option value="Abono extra">Abono extra</option>
                  <option value="Responsabilidad por daño">Responsabilidad por daño</option>
                  <option value="Pago de responsabilidad">Pago de responsabilidad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
                <input type="number" step="0.01" min="0.01" value={emMonto} onChange={e => setEmMonto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={emNotas} onChange={e => setEmNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowEditMovModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={saveEditMov} disabled={savingEditMov} className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {savingEditMov ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Delete Confirm ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-2 text-red-700">Eliminar Empleado</h2>
            <p className="text-sm text-gray-500 mb-4">Esta acción es irreversible. Escribe el nombre del empleado para confirmar:</p>
            <p className="text-sm font-medium mb-2">{empleado.nombre}</p>
            <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="Escribe el nombre..." className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-red-500 transition" />
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={deleteEmployee} disabled={deleteInput !== empleado.nombre} className="flex-1 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 transition disabled:opacity-40">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Clear History Confirm ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-2 text-red-700">Borrar Todo el Historial</h2>
            <p className="text-sm text-gray-500 mb-4">Esta acción eliminará {movs.length} movimiento{movs.length > 1 ? "s" : ""} de forma irreversible. Escribe CONFIRMAR para continuar:</p>
            <input value={clearInput} onChange={e => setClearInput(e.target.value)} placeholder='Escribe "CONFIRMAR"' className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-red-500 transition" />
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={clearHistory} disabled={clearInput !== "CONFIRMAR"} className="flex-1 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 transition disabled:opacity-40">
                Borrar Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Force Archive ── */}
      {showForceArchive && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-2 text-red-700">Forzar Archivado</h2>
            <p className="text-sm text-gray-500 mb-4">
              Este empleado tiene saldo pendiente de <strong className="text-red-600">${fmt(saldo)}</strong>. ¿Confirmas que deseas archivarlo?
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForceArchive(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={forceArchive} className="flex-1 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 transition">
                Confirmar Archivado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-black text-white px-4 py-2 rounded-lg text-sm z-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
