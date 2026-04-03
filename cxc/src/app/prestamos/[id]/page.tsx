"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, ConfirmModal } from "@/components/ui";

import { Empleado } from "../components/types";
import EmpleadoHeader from "../components/EmpleadoHeader";
import SummaryCards from "../components/SummaryCards";
import DeduccionesHistorial from "../components/DeduccionesHistorial";
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
  const isAdminOrDirector = role === "admin" || role === "director";
  const canEdit = role === "admin" || role === "contabilidad";
  const sortedMovs = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));

  const prestado = movs.filter(m => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const pagado = movs.filter(m => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
  const saldo = prestado - pagado;
  const pct = prestado > 0 ? (pagado / prestado) * 100 : 0;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Préstamos"
        breadcrumbs={[
          { label: "Préstamos", onClick: () => router.push("/prestamos") },
          { label: empleado.nombre },
        ]}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <EmpleadoHeader
          empleado={empleado}
          saldo={saldo}
          onEdit={actions.openEditModal}
          onToggleArchive={actions.toggleArchive}
          onBack={() => router.push("/prestamos")}
        />

        <SummaryCards prestado={prestado} pagado={pagado} saldo={saldo} pct={pct} />

        <DeduccionesHistorial movs={movs} deduccionQuincenal={empleado.deduccion_quincenal} />

        <div className="flex flex-wrap gap-3 mb-6">
          <button onClick={actions.pagoQuincenal} className="bg-emerald-600 text-white px-5 py-2 rounded-md text-sm hover:bg-emerald-700 transition font-medium">
            Pago Quincenal · ${fmt(empleado.deduccion_quincenal)}
          </button>
          <button onClick={movForm.openMovModal} className="bg-black text-white px-5 py-2 rounded-md text-sm hover:bg-gray-800 transition">
            + Nuevo Movimiento
          </button>
        </div>

        <MovimientoTable
          sortedMovs={sortedMovs}
          isAdmin={isAdmin}
          isAdminOrDirector={isAdminOrDirector}
          canEdit={canEdit}
          onApprove={movForm.approveMov}
          onEdit={editMov.openEditMov}
          onDelete={movForm.requestDeleteMov}
        />

        <DangerZone
          isAdmin={isAdmin}
          isAdminOrDirector={isAdminOrDirector}
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
        open={!!movForm.confirmDeleteMovId}
        onClose={() => movForm.setConfirmDeleteMovId(null)}
        onConfirm={movForm.doDeleteMov}
        title="Eliminar movimiento"
        message="¿Eliminar este movimiento? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
      />

      <Toast message={toast} />
    </div>
  );
}
