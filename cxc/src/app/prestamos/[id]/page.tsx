"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, ConfirmModal } from "@/components/ui";
import UndoToast from "@/components/UndoToast";

import { Empleado, getQuincenaRange, hasDeduccionEnQuincena } from "../components/types";
import EmpleadoHeader from "../components/EmpleadoHeader";
import SummaryCards from "../components/SummaryCards";
import MovimientoTable from "../components/MovimientoTable";
import DangerZone from "../components/DangerZone";
import MovimientoModal from "../components/MovimientoModal";
import EditEmpleadoModal from "../components/EditEmpleadoModal";
import EditMovimientoModal from "../components/EditMovimientoModal";
import {
  PagoQuincenalConfirm,
  DeleteEmpleadoConfirm,
  ClearHistoryConfirm,
  ForceArchiveConfirm,
} from "../components/ConfirmModals";
import { useMovimientoForm, useEditMovimiento } from "../components/useMovimientoForm";
import { useEmpleadoActions } from "../components/useEmpleadoActions";

export default function PrestamoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { authChecked, role } = useAuth({ moduleKey: "prestamos", allowedRoles: ["admin", "contabilidad"] });
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

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

  // Hooks are called unconditionally — data is only used after the guard below
  const movs = empleado?.prestamos_movimientos ?? [];

  const movForm = useMovimientoForm({
    empleadoId: id,
    deduccionQuincenal: empleado?.deduccion_quincenal ?? 0,
    onSuccess: loadEmpleado,
    showToast,
  });

  const editMov = useEditMovimiento({ onSuccess: loadEmpleado, showToast });

  const actions = useEmpleadoActions({
    empleadoId: id,
    empleado: empleado ?? ({} as Empleado),
    movs,
    onSuccess: loadEmpleado,
    onDeleted: () => router.push("/prestamos"),
    showToast,
  });

  if (!authChecked || loading || !empleado) return null;

  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "contabilidad";
  const canDelete = role === "admin" || role === "contabilidad";
  const sortedMovs = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  const movToDelete = movForm.confirmDeleteMovId ? movs.find(m => m.id === movForm.confirmDeleteMovId) ?? null : null;

  const PRESTAMO_CONCEPTOS = ["Préstamo", "Responsabilidad por daño"];
  const prestado = movs.filter(m => PRESTAMO_CONCEPTOS.includes(m.concepto) && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const pagado = movs.filter(m => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const saldo = prestado - pagado;
  const pct = prestado > 0 ? (pagado / prestado) * 100 : 0;

  // Estado de la quincena vigente para el chip del header (mismo helper que la lista).
  const quincena = getQuincenaRange();
  const tieneDeduccion = empleado.deduccion_quincenal > 0;
  const deducidaQ = tieneDeduccion && hasDeduccionEnQuincena(movs, quincena.start, quincena.end);
  const quincenaEstado: "deducida" | "pendiente" | null =
    !tieneDeduccion ? null : deducidaQ ? "deducida" : saldo > 0 ? "pendiente" : null;

  // Saldo corriente por movimiento (solo aprobados afectan el balance)
  const saldoByMov = new Map<string, number>();
  const ascAprobados = [...movs]
    .filter(m => m.estado === "aprobado")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  let running = 0;
  for (const m of ascAprobados) {
    if (PRESTAMO_CONCEPTOS.includes(m.concepto)) running += Number(m.monto);
    else running -= Number(m.monto);
    saldoByMov.set(m.id, running);
  }
  if (ascAprobados.length > 0) {
    const last = saldoByMov.get(ascAprobados[ascAprobados.length - 1].id) ?? 0;
    if (Math.abs(last - saldo) > 0.01) {
      console.warn(`[Préstamos] Saldo running ($${last.toFixed(2)}) no coincide con saldo backend ($${saldo.toFixed(2)}) para ${empleado.nombre}`);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Préstamos"
        breadcrumbs={[
          { label: "Préstamos", onClick: () => router.push("/prestamos") },
          { label: empleado.nombre },
        ]}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <EmpleadoHeader
          empleado={empleado}
          saldo={saldo}
          saldado={prestado > 0 && saldo <= 0}
          onEdit={actions.openEditModal}
          onToggleArchive={() => {
            // Archivar pide confirmación; reactivar (no destructivo) va directo.
            if (empleado.activo) setConfirmArchive(true);
            else actions.toggleArchive();
          }}
          onBack={() => router.push("/prestamos")}
        />

        <SummaryCards prestado={prestado} pagado={pagado} saldo={saldo} pct={pct} quincenaEstado={quincenaEstado} />

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={actions.pagoQuincenal}
            disabled={saldo <= 0}
            title={saldo <= 0 ? "Préstamo saldado — no hay saldo por deducir" : undefined}
            className="bg-emerald-600 text-white px-5 py-2 rounded-md text-sm hover:bg-emerald-700 transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Pago Quincenal · ${fmt(empleado.deduccion_quincenal)}
          </button>
          <button onClick={movForm.openMovModal} className="bg-black text-white px-5 py-2 rounded-md text-sm hover:bg-gray-800 transition">
            + Nuevo Movimiento
          </button>
        </div>

        <MovimientoTable
          sortedMovs={sortedMovs}
          saldoByMov={saldoByMov}
          isAdmin={isAdmin}
          canEdit={canEdit}
          canDelete={canDelete}
          onApprove={movForm.approveMov}
          onEdit={editMov.openEditMov}
          onDelete={movForm.requestDeleteMov}
        />

        <DangerZone
          isAdmin={isAdmin}
          activo={empleado.activo}
          saldo={saldo}
          hasMovs={movs.length > 0}
          role={role ?? ""}
          onDeleteEmployee={() => { actions.setDeleteInput(""); actions.setShowDeleteConfirm(true); }}
          onClearHistory={() => { actions.setClearInput(""); actions.setShowClearConfirm(true); }}
          onForceArchive={() => actions.setShowForceArchive(true)}
        />
      </div>

      <MovimientoModal
        show={movForm.showMovModal}
        step={movForm.movStep}
        mLabel={movForm.mLabel}
        mConcepto={movForm.mConcepto}
        mFecha={movForm.mFecha}
        mMonto={movForm.mMonto}
        mNotas={movForm.mNotas}
        saving={movForm.saving}
        onClose={() => movForm.setShowMovModal(false)}
        onSelectType={movForm.selectMovType}
        onBack={() => movForm.setMovStep("type")}
        onChangeFecha={movForm.setMFecha}
        onChangeMonto={movForm.setMMonto}
        onChangeNotas={movForm.setMNotas}
        onSave={movForm.saveMov}
      />

      <EditEmpleadoModal
        show={actions.showEditModal}
        fNombre={actions.fNombre}
        fEmpresa={actions.fEmpresa}
        fDeduccion={actions.fDeduccion}
        fNotas={actions.fNotas}
        saving={actions.savingEdit}
        onClose={() => actions.setShowEditModal(false)}
        onChangeNombre={actions.setFNombre}
        onChangeEmpresa={actions.setFEmpresa}
        onChangeDeduccion={actions.setFDeduccion}
        onChangeNotas={actions.setFNotas}
        onSave={actions.saveEdit}
      />

      <EditMovimientoModal
        show={editMov.showEditMovModal}
        emFecha={editMov.emFecha}
        emConcepto={editMov.emConcepto}
        emMonto={editMov.emMonto}
        emNotas={editMov.emNotas}
        saving={editMov.saving}
        onClose={() => editMov.setShowEditMovModal(false)}
        onChangeFecha={editMov.setEmFecha}
        onChangeConcepto={editMov.setEmConcepto}
        onChangeMonto={editMov.setEmMonto}
        onChangeNotas={editMov.setEmNotas}
        onSave={editMov.saveEditMov}
      />

      <PagoQuincenalConfirm
        show={actions.showPagoConfirm}
        nombreEmpleado={empleado.nombre}
        deduccionQuincenal={empleado.deduccion_quincenal}
        onClose={() => actions.setShowPagoConfirm(false)}
        onConfirm={actions.confirmarPagoQuincenal}
      />

      <DeleteEmpleadoConfirm
        show={actions.showDeleteConfirm}
        nombreEmpleado={empleado.nombre}
        deleteInput={actions.deleteInput}
        onChangeInput={actions.setDeleteInput}
        onClose={() => actions.setShowDeleteConfirm(false)}
        onConfirm={actions.deleteEmployee}
      />

      <ClearHistoryConfirm
        show={actions.showClearConfirm}
        movCount={movs.length}
        clearInput={actions.clearInput}
        clearProgress={actions.clearProgress}
        onChangeInput={actions.setClearInput}
        onClose={() => actions.setShowClearConfirm(false)}
        onConfirm={actions.clearHistory}
      />

      <ForceArchiveConfirm
        show={actions.showForceArchive}
        saldo={saldo}
        onClose={() => actions.setShowForceArchive(false)}
        onConfirm={actions.forceArchive}
      />

      <ConfirmModal
        open={!!movToDelete}
        onClose={() => movForm.setConfirmDeleteMovId(null)}
        onConfirm={movForm.doDeleteMov}
        title="¿Eliminar movimiento?"
        message={movToDelete
          ? `Vas a eliminar el ${movToDelete.concepto.toLowerCase()} de $${fmt(movToDelete.monto)} del ${fmtDate(movToDelete.fecha)} al préstamo de ${empleado.nombre}. Esta acción se registrará en el log de auditoría.`
          : ""}
        confirmLabel="Eliminar"
        destructive
      />

      <ConfirmModal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => { setConfirmArchive(false); actions.toggleArchive(); }}
        title="¿Archivar colaborador?"
        message={`${empleado.nombre} dejará de aparecer en la lista activa de préstamos. Podrás reactivarlo cuando quieras.`}
        confirmLabel="Archivar"
      />

      {movForm.pendingUndoMov && <UndoToast message={movForm.pendingUndoMov.message} startedAt={movForm.pendingUndoMov.startedAt} onUndo={movForm.undoActionMov} />}

      <Toast message={toast} />
    </div>
  );
}
