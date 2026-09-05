"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, ConfirmModal } from "@/components/ui";
import { PRESTAMOS_ADMIN_ROLES, PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import {
  calcularSaldoPrestamo,
  cuentaMasVieja,
  pendienteDeAprobacion,
  ESTADO_PENDIENTE,
} from "@/lib/prestamos-saldo";
import { CONCEPTO_PAGO, ORIGEN_POR_DEFECTO, etiquetaConcepto } from "@/lib/prestamos-conceptos";
import { getQuincenaRangePanama, hoyPanamaYmd } from "@/lib/prestamos-quincena";

import { Empleado } from "../components/types";
import EmpleadoHeader from "../components/EmpleadoHeader";
import SummaryCards from "../components/SummaryCards";
import MovimientoTable from "../components/MovimientoTable";
import DangerZone from "../components/DangerZone";
import NuevoMovimientoModal from "../components/NuevoMovimientoModal";
import EditEmpleadoModal from "../components/EditEmpleadoModal";
import EditMovimientoModal from "../components/EditMovimientoModal";
import { DeleteEmpleadoConfirm, ClearHistoryConfirm } from "../components/ConfirmModals";
import { useMovimientoForm, useEditMovimiento } from "../components/useMovimientoForm";
import { useEmpleadoActions } from "../components/useEmpleadoActions";

export default function PrestamoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { authChecked, role } = useAuth({ moduleKey: "prestamos", allowedRoles: [...PRESTAMOS_ROLES] });
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showNuevoMov, setShowNuevoMov] = useState(false);

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

  const movs = useMemo(() => empleado?.prestamos_movimientos ?? [], [empleado]);

  const movForm = useMovimientoForm({ onSuccess: loadEmpleado, showToast });
  const editMov = useEditMovimiento({ onSuccess: loadEmpleado, showToast });
  const actions = useEmpleadoActions({
    empleadoId: id,
    empleado: empleado ?? ({} as Empleado),
    onSuccess: loadEmpleado,
    onDeleted: () => router.push("/prestamos"),
    showToast,
  });

  // 🔴 LA CUENTA SALE DE `calcularSaldoPrestamo` Y DE NINGÚN OTRO LADO.
  // 🩸 Acá vivía una copia inline con arrays literales y un `console.warn` que
  // decía, textual: «Saldo running ($X) no coincide con saldo backend ($Y)».
  // Era la advertencia que `prestamos-saldo.ts` existe para evitar, escrita en
  // el único archivo que no lo usaba.
  const s = useMemo(() => calcularSaldoPrestamo(movs), [movs]);
  const pend = useMemo(() => pendienteDeAprobacion(movs), [movs]);

  if (!authChecked || loading || !empleado) return null;

  const canEdit = PRESTAMOS_ROLES.includes(role ?? "");
  const canDelete = PRESTAMOS_ROLES.includes(role ?? "");
  const isAdmin = PRESTAMOS_ADMIN_ROLES.includes(role ?? "");
  const hoy = hoyPanamaYmd();

  const sortedMovs = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  const movToDelete = movForm.confirmDeleteMovId ? movs.find(m => m.id === movForm.confirmDeleteMovId) ?? null : null;

  // Saldo corriente por movimiento — solo los APROBADOS mueven el saldo, así que
  // lo que espera queda fuera de la columna (y lo dice: «No suma»).
  const saldoByMov = new Map<string, number>();
  const ascAprobados = [...movs]
    .filter(m => m.estado === "aprobado")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  let running = 0;
  for (const m of ascAprobados) {
    running += calcularSaldoPrestamo([m]).saldo;
    saldoByMov.set(m.id, running);
  }

  const cuota = Number(empleado.deduccion_quincenal ?? 0) + Number(empleado.deduccion_dano ?? 0);
  const q = getQuincenaRangePanama();
  const deducidaQ = movs.some(
    (m) => m.estado === "aprobado" && m.concepto === CONCEPTO_PAGO
      && (!m.origen_pago || m.origen_pago === ORIGEN_POR_DEFECTO)
      && m.fecha >= q.start && m.fecha <= q.end,
  );
  const quincenaEstado: "deducida" | "pendiente" | null =
    cuota <= 0 || !empleado.trabaja ? null : deducidaQ ? "deducida" : s.saldo > 0 ? "pendiente" : null;

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
          onEdit={actions.openEditModal}
          onBack={() => router.push("/prestamos")}
        />

        <SummaryCards
          saldoPrestamo={s.cuentas.prestamo.saldo}
          saldoDano={s.cuentas.dano.saldo}
          cuotaPrestamo={Number(empleado.deduccion_quincenal ?? 0)}
          cuotaDano={Number(empleado.deduccion_dano ?? 0)}
          prestado={s.prestado}
          pagado={s.pagado}
          saldo={s.saldo}
          pct={s.pct}
          pendiente={pend.total}
          quincenaEstado={quincenaEstado}
        />

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => actions.pagoQuincenal(cuota, cuentaMasVieja(s))}
            disabled={s.saldo <= 0 || cuota <= 0}
            title={s.saldo <= 0 ? "No debe nada — no hay saldo por deducir" : cuota <= 0 ? "Esta persona no tiene cuota quincenal" : undefined}
            className="inline-flex min-h-[44px] items-center justify-center bg-emerald-600 text-white px-5 rounded-md text-sm hover:bg-emerald-700 transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Pago Quincenal · ${fmt(cuota)}
          </button>
          <button onClick={() => setShowNuevoMov(true)} className="inline-flex min-h-[44px] items-center justify-center bg-black text-white px-5 rounded-md text-sm hover:bg-gray-800 transition">
            + Nuevo Movimiento
          </button>
        </div>

        <MovimientoTable
          sortedMovs={sortedMovs}
          saldoByMov={saldoByMov}
          hoy={hoy}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={editMov.openEditMov}
          onDelete={movForm.requestDeleteMov}
        />

        <DangerZone
          isAdmin={isAdmin}
          hasMovs={movs.length > 0}
          onDeleteEmployee={() => { actions.setDeleteInput(""); actions.setShowDeleteConfirm(true); }}
          onClearHistory={() => { actions.setClearInput(""); actions.setShowClearConfirm(true); }}
        />
      </div>

      {showNuevoMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNuevoMov(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <NuevoMovimientoModal
              nombre={empleado.nombre}
              empleadoId={id}
              saldoPrestamo={s.cuentas.prestamo.saldo}
              saldoDano={s.cuentas.dano.saldo}
              cuentaMasVieja={cuentaMasVieja(s)}
              salarioMensual={empleado.salario_mensual}
              hoy={hoy}
              onCancelar={() => setShowNuevoMov(false)}
              onGuardar={async (payload) => {
                const ok = await movForm.crear(payload);
                if (ok) setShowNuevoMov(false);
              }}
            />
          </div>
        </div>
      )}

      <EditEmpleadoModal
        show={actions.showEditModal}
        fCuotaPrestamo={actions.fCuotaPrestamo}
        fCuotaDano={actions.fCuotaDano}
        fCodigo={actions.fCodigo}
        colaboradores={actions.colaboradores}
        saving={actions.savingEdit}
        onClose={() => actions.setShowEditModal(false)}
        onChangeCuotaPrestamo={actions.setFCuotaPrestamo}
        onChangeCuotaDano={actions.setFCuotaDano}
        onChangeCodigo={actions.setFCodigo}
        onSave={actions.saveEdit}
      />

      <EditMovimientoModal
        show={editMov.showEditMovModal}
        emFecha={editMov.emFecha}
        emConcepto={editMov.emConcepto}
        emMonto={editMov.emMonto}
        emNotas={editMov.emNotas}
        emOrigen={editMov.emOrigen}
        hoy={hoy}
        saving={editMov.saving}
        onClose={() => editMov.setShowEditMovModal(false)}
        onChangeFecha={editMov.setEmFecha}
        onChangeMonto={editMov.setEmMonto}
        onChangeNotas={editMov.setEmNotas}
        onChangeOrigen={editMov.setEmOrigen}
        onSave={editMov.saveEditMov}
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

      <ConfirmModal
        open={!!movToDelete}
        onClose={() => movForm.setConfirmDeleteMovId(null)}
        onConfirm={movForm.doDeleteMov}
        title="¿Eliminar movimiento?"
        message={movToDelete
          ? `Vas a eliminar ${etiquetaConcepto(movToDelete.concepto).toLowerCase()} de $${fmt(movToDelete.monto)} del ${fmtDate(movToDelete.fecha)}${movToDelete.estado === ESTADO_PENDIENTE ? " (todavía esperaba aprobación)" : ""} de la cuenta de ${empleado.nombre}. Queda registrado en el log de auditoría.`
          : ""}
        confirmLabel="Eliminar"
        destructive
      />

      <Toast message={toast} />
    </div>
  );
}
