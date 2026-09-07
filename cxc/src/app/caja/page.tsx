"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Modal, ConfirmModal } from "@/components/ui";

import { useCajaState } from "./hooks/useCajaState";
import PeriodoList from "./components/PeriodoList";
import CerrarPeriodoModal from "./components/CerrarPeriodoModal";
import "./skin.css";

export default function CajaPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });

  const {
    periodos, loading, error, aviso,
    showNewPeriodoModal, setShowNewPeriodoModal, fondoInput, setFondoInput,
    responsableInput, setResponsableInput, responsablesCatalog,
    confirmClosePeriodo, setConfirmClosePeriodo,
    confirmDeletePeriodoId, setConfirmDeletePeriodoId,
    createPeriodo, confirmCreatePeriodo,
    requestClosePeriodo, doClosePeriodo,
    requestDeletePeriodo, doDeletePeriodo,
  } = useCajaState({ authReady: authChecked });

  if (!authChecked) return null;

  const hasOpenPeriod = periodos.some((p) => p.estado === "abierto");

  // Datos del período que se está por cerrar (para las cuatro líneas del
  // modal). La lista viene ordenada por numero DESC → el siguiente es el
  // primero + 1.
  const periodoACerrar = periodos.find((p) => p.id === confirmClosePeriodo) || null;
  const siguienteNumero = (periodos[0]?.numero || 0) + 1;
  const recibosACerrar = periodoACerrar?.recibos
    ?? (periodoACerrar?.caja_gastos || []).filter((g) => !(g as { deleted?: boolean }).deleted).length;
  // 🔴 Un período con gastos no se elimina (Daniel: «no es normal»). El aviso
  // viejo prometía borrar «este período y todos sus gastos» y era mentira: solo
  // marcaba el período y los recibos quedaban vivos, colgando de un ciclo que
  // ya no se podía abrir. El freno también vive en el servidor.
  const periodoABorrar = periodos.find((p) => p.id === confirmDeletePeriodoId) || null;

  async function handleConfirmCreate() {
    const newId = await confirmCreatePeriodo();
    if (newId) router.push(`/caja/${newId}`);
  }

  return (
    <div>
      <AppHeader module="Caja Menuda" />
      <div className="skin-caja min-h-screen">
        <PeriodoList
          periodos={periodos}
          loading={loading}
          error={error}
          aviso={aviso}
          hasOpenPeriod={hasOpenPeriod}
          role={role}
          onCreatePeriodo={createPeriodo}
          onLoadDetail={(id) => router.push(`/caja/${id}`)}
          onPrintPeriodo={(id) => router.push(`/caja/${id}/imprimir`)}
          onClosePeriodo={requestClosePeriodo}
          onDeletePeriodo={requestDeletePeriodo}
        />
      </div>
      <Modal
        open={showNewPeriodoModal}
        onClose={() => setShowNewPeriodoModal(false)}
        title="Nuevo período de caja"
      >
        <div className="space-y-4">
          <div>
            {/* $200 viene sugerido: es el fondo de los 3 períodos de la
                historia. Se puede cambiar. */}
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
          {/* 🔴 La responsable es del PERÍODO y se elige UNA vez, aquí. Se
              guarda su código de colaborador (Angela = 7), nunca su nombre.
              Con una sola en el catálogo, viene puesta. */}
          <div>
            <label className="text-xs text-gray-400 uppercase" htmlFor="caja-responsable">
              Responsable
            </label>
            <select
              id="caja-responsable"
              value={responsableInput}
              onChange={(e) => setResponsableInput(e.target.value)}
              className="w-full border-b border-gray-200 py-2 min-h-[44px] text-sm outline-none focus:border-black transition bg-white"
            >
              <option value="">Sin responsable</option>
              {responsablesCatalog
                .filter((r) => r.empleado_codigo)
                .map((r) => (
                  <option key={r.id} value={String(r.empleado_codigo)}>{r.nombre}</option>
                ))}
            </select>
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

      {periodoACerrar && (
        <CerrarPeriodoModal
          open={!!confirmClosePeriodo}
          onClose={() => setConfirmClosePeriodo(null)}
          onConfirm={doClosePeriodo}
          fondo={Number(periodoACerrar.fondo_inicial) || 0}
          gastado={Number(periodoACerrar.total_gastado) || 0}
          recibos={recibosACerrar}
          siguienteNumero={siguienteNumero}
        />
      )}
      <ConfirmModal
        open={!!confirmDeletePeriodoId}
        onClose={() => setConfirmDeletePeriodoId(null)}
        onConfirm={doDeletePeriodo}
        title="Eliminar período"
        message={`¿Eliminar el período Nº ${periodoABorrar?.numero ?? ""}? No tiene ningún gasto cargado.`}
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
