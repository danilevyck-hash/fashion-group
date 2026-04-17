"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Modal, ConfirmModal } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";

import { View } from "./components/types";
import { useCajaState } from "./hooks/useCajaState";
import PeriodoList from "./components/PeriodoList";
import PeriodoDetailHeader from "./components/PeriodoDetailHeader";
import PeriodoDetailFooter from "./components/PeriodoDetailFooter";
import ResumenGastos from "./components/ResumenGastos";
import GastoForm from "./components/GastoForm";
import GastoTable from "./components/GastoTable";
import DeletedGastosSection from "./components/DeletedGastosSection";
import PrintView from "./components/PrintView";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import SuggestionCard from "@/components/SuggestionCard";

export default function CajaPageWrapper() {
  return (
    <Suspense>
      <CajaPage />
    </Suspense>
  );
}

function CajaPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id") || "";
  const initialView = (searchParams.get("view") as View) || "list";

  const {
    view, setView,
    periodos, loading, current, setCurrent, error,
    categorias, setCategorias, allCategorias, showManageCat, setShowManageCat, newCatName, setNewCatName,
    showNewPeriodoModal, setShowNewPeriodoModal, fondoInput, setFondoInput,
    responsables, setResponsables, allResponsables, showAddResponsable, setShowAddResponsable, newResponsable, setNewResponsable,
    addingGasto, subtotalNum, totalNum,
    editingGastoId, setEditingGastoId, editGasto, setEditGasto,
    formValues, formSetters,
    confirmClosePeriodo, setConfirmClosePeriodo,
    confirmDeletePeriodoId, setConfirmDeletePeriodoId,
    loadDetail, createPeriodo, confirmCreatePeriodo,
    requestClosePeriodo, doClosePeriodo,
    requestDeletePeriodo, doDeletePeriodo,
    aprobarReposicion,
    addGasto, requestDeleteGasto, saveEditGasto, exportExcel,
    pendingDeleteGasto, doDeleteGasto, cancelDeleteGasto,
    pendingRestoreGasto, requestRestoreGasto, doRestoreGasto, cancelRestoreGasto,
    pendingNegativeBalance, confirmAddGastoNegative, cancelAddGastoNegative,
  } = useCajaState(urlId, initialView);

  // ── Smart suggestion: period close (hooks must be before any conditional return) ──
  const cajaSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (!current || current.estado !== "abierto") return [];
    const apertura = new Date(current.fecha_apertura).getTime();
    const now = Date.now();
    const daysSinceOpen = Math.floor((now - apertura) / (24 * 60 * 60 * 1000));
    if (daysSinceOpen <= 30) return [];
    return [{
      id: `caja-close-${current.id}`,
      message: `Este período lleva ${daysSinceOpen} días abierto. ¿Cerrarlo y crear uno nuevo?`,
      actionLabel: "Cerrar período",
      onAction: () => requestClosePeriodo(current.id),
    }];
  }, [current, requestClosePeriodo]);

  const { suggestion: cajaSuggestion, dismiss: dismissCaja } = useSmartSuggestions(cajaSuggestions);

  if (!authChecked) return null;

  const hasOpenPeriod = periodos.some((p) => p.estado === "abierto");

  const detailGastos = view === "detail" && current ? (current.caja_gastos || []) : [];
  const detailTotalGastado = detailGastos.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const detailFondoInicial = current ? Number(current.fondo_inicial) || 0 : 0;
  const detailSaldo = detailFondoInicial - detailTotalGastado;
  const detailIsOpen = current?.estado === "abierto";
  const detailPctUsed = detailFondoInicial > 0 ? (detailSaldo / detailFondoInicial) * 100 : 100;

  return (
    <>
      {view === "list" && (
        <div>
          <AppHeader module="Caja Menuda" />
          <PeriodoList
            periodos={periodos}
            loading={loading}
            error={error}
            hasOpenPeriod={hasOpenPeriod}
            role={role}
            onCreatePeriodo={createPeriodo}
            onLoadDetail={(id) => loadDetail(id)}
            onPrintPeriodo={(id) => loadDetail(id).then(() => setView("print", id))}
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
                  onClick={confirmCreatePeriodo}
                  disabled={!fondoInput || parseFloat(fondoInput) <= 0}
                  className="flex-1 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  Crear período
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {view === "print" && current && (
        <PrintView
          current={current}
          onBack={() => setView("detail", current.id)}
        />
      )}

      {view === "detail" && current && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <PeriodoDetailHeader
            current={current}
            totalGastado={detailTotalGastado}
            saldo={detailSaldo}
            pctUsed={detailPctUsed}
            onBack={() => { setView("list", undefined); setCurrent(null); }}
            onClosePeriodo={detailIsOpen ? () => requestClosePeriodo(current.id) : undefined}
          />

          {cajaSuggestion && <SuggestionCard suggestion={cajaSuggestion} onDismiss={dismissCaja} />}

          <ResumenGastos gastos={detailGastos} />

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {detailIsOpen && (
            <GastoForm
              values={formValues}
              setters={formSetters}
              addingGasto={addingGasto}
              subtotalNum={subtotalNum}
              totalNum={totalNum}
              categorias={categorias}
              allCategorias={allCategorias}
              responsables={responsables}
              allResponsables={allResponsables}
              showManageCat={showManageCat}
              showAddResponsable={showAddResponsable}
              newCatName={newCatName}
              newResponsable={newResponsable}
              setCategorias={setCategorias}
              setShowManageCat={setShowManageCat}
              setShowAddResponsable={setShowAddResponsable}
              setNewCatName={setNewCatName}
              setNewResponsable={setNewResponsable}
              setResponsables={setResponsables}
              onAddGasto={addGasto}
              fondoInicial={current.fondo_inicial}
              totalGastado={detailTotalGastado}
            />
          )}

          <GastoTable
            gastos={detailGastos}
            isOpen={!!detailIsOpen}
            categorias={allCategorias}
            responsables={allResponsables}
            editingGastoId={editingGastoId}
            editGasto={editGasto}
            setEditingGastoId={setEditingGastoId}
            setEditGasto={setEditGasto}
            onSaveEdit={saveEditGasto}
            onDeleteGasto={requestDeleteGasto}
          />

          <DeletedGastosSection
            deletedGastos={current.deleted_gastos || []}
            isOpen={!!detailIsOpen}
            onRestore={requestRestoreGasto}
          />

          <PeriodoDetailFooter
            current={current}
            totalGastado={detailTotalGastado}
            isOpen={!!detailIsOpen}
            onPrint={() => setView("print", current.id)}
            onClose={() => requestClosePeriodo(current.id)}
            onAprobarReposicion={aprobarReposicion}
            onExportExcel={exportExcel}
          />
        </div>
      )}

      {/* Overlays — siempre montados para que funcionen desde cualquier vista */}
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
      {pendingDeleteGasto && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={cancelDeleteGasto}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3">¿Eliminar este gasto?</h3>
            <p className="text-sm text-gray-800 mb-2">
              Gasto &ldquo;{pendingDeleteGasto.descripcion?.trim() || "Sin descripción"}&rdquo; · ${fmt(pendingDeleteGasto.total)} · {pendingDeleteGasto.categoria || "Sin categoría"} · {pendingDeleteGasto.responsable || "Sin responsable"} · {fmtDate(pendingDeleteGasto.fecha)}
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Podrás restaurarlo desde Gastos eliminados si es un error.
            </p>
            <div className="flex gap-3">
              <button
                onClick={doDeleteGasto}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition-all min-h-[44px]"
              >
                Sí, eliminar
              </button>
              <button
                onClick={cancelDeleteGasto}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingRestoreGasto && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={cancelRestoreGasto}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3">¿Restaurar este gasto?</h3>
            <p className="text-sm text-gray-800 mb-6">
              Gasto &ldquo;{pendingRestoreGasto.descripcion?.trim() || "Sin descripción"}&rdquo; · ${fmt(pendingRestoreGasto.total)} · {pendingRestoreGasto.categoria || "Sin categoría"} · {pendingRestoreGasto.responsable || "Sin responsable"} · {fmtDate(pendingRestoreGasto.fecha)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={doRestoreGasto}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-black text-white hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]"
              >
                Sí, restaurar
              </button>
              <button
                onClick={cancelRestoreGasto}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingNegativeBalance && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={cancelAddGastoNegative}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3">¿Continuar con saldo negativo?</h3>
            <p className="text-sm text-gray-800 mb-2">
              Este gasto deja el fondo en <strong>${fmt(pendingNegativeBalance.saldoFuturo)}</strong> (fondo ${fmt(pendingNegativeBalance.fondo)}, gastos ${fmt(pendingNegativeBalance.gastado)}, nuevo ${fmt(pendingNegativeBalance.nuevo)}).
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Considera solicitar reabastecimiento antes de seguir gastando.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmAddGastoNegative}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition-all min-h-[44px]"
              >
                Sí, guardar igual
              </button>
              <button
                onClick={cancelAddGastoNegative}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
