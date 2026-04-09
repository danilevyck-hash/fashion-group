"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Modal, ConfirmModal } from "@/components/ui";
import UndoToast from "@/components/UndoToast";

import { View } from "./components/types";
import { useCajaState } from "./hooks/useCajaState";
import PeriodoList from "./components/PeriodoList";
import PeriodoDetailHeader from "./components/PeriodoDetailHeader";
import PeriodoDetailFooter from "./components/PeriodoDetailFooter";
import ResumenGastos from "./components/ResumenGastos";
import GastoForm from "./components/GastoForm";
import GastoTable from "./components/GastoTable";
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
    pendingUndoCaja, undoActionCaja,
  } = useCajaState(urlId, initialView);

  if (!authChecked) return null;

  const hasOpenPeriod = periodos.some((p) => p.estado === "abierto");

  // ── LIST VIEW ──
  if (view === "list") {
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
    );
  }

  // ── PRINT VIEW ──
  if (view === "print" && current) {
    return (
      <PrintView
        current={current}
        onBack={() => setView("detail", current.id)}
      />
    );
  }

  // ── Smart suggestion: period close ──
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

  // ── DETAIL VIEW ──
  if (view === "detail" && current) {
    const gastos = current.caja_gastos || [];
    const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
    const saldo = current.fondo_inicial - totalGastado;
    const isOpen = current.estado === "abierto";
    const pctUsed = current.fondo_inicial > 0 ? (saldo / current.fondo_inicial) * 100 : 100;

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <PeriodoDetailHeader
          current={current}
          totalGastado={totalGastado}
          saldo={saldo}
          pctUsed={pctUsed}
          onBack={() => { setView("list", undefined); setCurrent(null); }}
          onClosePeriodo={isOpen ? () => requestClosePeriodo(current.id) : undefined}
        />

        {cajaSuggestion && <SuggestionCard suggestion={cajaSuggestion} onDismiss={dismissCaja} />}

        <ResumenGastos gastos={gastos} />

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {isOpen && (
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
            totalGastado={totalGastado}
          />
        )}

        <GastoTable
          gastos={gastos}
          isOpen={isOpen}
          categorias={allCategorias}
          responsables={allResponsables}
          editingGastoId={editingGastoId}
          editGasto={editGasto}
          setEditingGastoId={setEditingGastoId}
          setEditGasto={setEditGasto}
          onSaveEdit={saveEditGasto}
          onDeleteGasto={requestDeleteGasto}
        />

        <PeriodoDetailFooter
          current={current}
          totalGastado={totalGastado}
          isOpen={isOpen}
          onPrint={() => setView("print", current.id)}
          onClose={() => requestClosePeriodo(current.id)}
          onAprobarReposicion={aprobarReposicion}
          onExportExcel={exportExcel}
        />
      </div>
    );
  }

  return (
    <>
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
      {pendingUndoCaja && <UndoToast message={pendingUndoCaja.message} startedAt={pendingUndoCaja.startedAt} onUndo={undoActionCaja} />}
    </>
  );
}
