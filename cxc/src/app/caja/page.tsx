"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Modal, ConfirmModal } from "@/components/ui";

import { useCajaState } from "./hooks/useCajaState";
import PeriodoList from "./components/PeriodoList";

export default function CajaPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });

  const {
    periodos, loading, error,
    showNewPeriodoModal, setShowNewPeriodoModal, fondoInput, setFondoInput,
    confirmClosePeriodo, setConfirmClosePeriodo,
    confirmDeletePeriodoId, setConfirmDeletePeriodoId,
    createPeriodo, confirmCreatePeriodo,
    requestClosePeriodo, doClosePeriodo,
    requestDeletePeriodo, doDeletePeriodo,
  } = useCajaState();

  if (!authChecked) return null;

  const hasOpenPeriod = periodos.some((p) => p.estado === "abierto");

  async function handleConfirmCreate() {
    const newId = await confirmCreatePeriodo();
    if (newId) router.push(`/caja/${newId}`);
  }

  return (
    <div>
      <AppHeader module="Caja Menuda" />
      <PeriodoList
        periodos={periodos}
        loading={loading}
        error={error}
        hasOpenPeriod={hasOpenPeriod}
        role={role}
        onCreatePeriodo={createPeriodo}
        onLoadDetail={(id) => router.push(`/caja/${id}`)}
        onPrintPeriodo={(id) => router.push(`/caja/${id}/imprimir`)}
        onClosePeriodo={requestClosePeriodo}
        onDeletePeriodo={requestDeletePeriodo}
      />
      <Modal
        open={showNewPeriodoModal}
        onClose={() => setShowNewPeriodoModal(false)}
        title="Nuevo período de caja"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase">Fondo inicial ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={fondoInput}
              onChange={(e) => setFondoInput(e.target.value)}
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition"
              placeholder="200"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowNewPeriodoModal(false)}
              className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 active:bg-gray-100 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmCreate}
              disabled={!fondoInput || parseFloat(fondoInput) <= 0}
              className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              Crear período
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmClosePeriodo}
        onClose={() => setConfirmClosePeriodo(null)}
        onConfirm={doClosePeriodo}
        title="Cerrar período"
        message="¿Cerrar este período? No podrá agregar más gastos."
        confirmLabel="Cerrar período"
        destructive
      />
      <ConfirmModal
        open={!!confirmDeletePeriodoId}
        onClose={() => setConfirmDeletePeriodoId(null)}
        onConfirm={doDeletePeriodo}
        title="Eliminar período"
        message="¿Eliminar este período y todos sus gastos? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
