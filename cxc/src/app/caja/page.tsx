"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";

import { View } from "./components/types";
import { useCajaState } from "./hooks/useCajaState";
import PeriodoList from "./components/PeriodoList";
import PeriodoDetailHeader from "./components/PeriodoDetailHeader";
import PeriodoDetailFooter from "./components/PeriodoDetailFooter";
import ResumenGastos from "./components/ResumenGastos";
import GastoForm from "./components/GastoForm";
import GastoTable from "./components/GastoTable";
import PrintView from "./components/PrintView";

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
    allowedRoles: ["admin", "upload", "secretaria", "director"],
  });
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id") || "";
  const initialView = (searchParams.get("view") as View) || "list";

  const {
    view, setView,
    periodos, loading, current, setCurrent, error,
    categorias, setCategorias, showManageCat, setShowManageCat, newCatName, setNewCatName,
    responsables, setResponsables, showAddResponsable, setShowAddResponsable, newResponsable, setNewResponsable,
    addingGasto, subtotalNum, totalNum,
    editingGastoId, setEditingGastoId, editGasto, setEditGasto,
    formValues, formSetters,
    loadDetail, createPeriodo, closePeriodo, deletePeriodo, aprobarReposicion,
    addGasto, deleteGasto, saveEditGasto, exportExcel,
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
          onClosePeriodo={closePeriodo}
          onDeletePeriodo={deletePeriodo}
        />
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

  // ── DETAIL VIEW ──
  if (view === "detail" && current) {
    const gastos = current.caja_gastos || [];
    const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
    const saldo = current.fondo_inicial - totalGastado;
    const isOpen = current.estado === "abierto";
    const pctUsed = current.fondo_inicial > 0 ? (saldo / current.fondo_inicial) * 100 : 100;

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <PeriodoDetailHeader
          current={current}
          totalGastado={totalGastado}
          saldo={saldo}
          pctUsed={pctUsed}
          onBack={() => { setView("list", undefined); setCurrent(null); }}
        />

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
            responsables={responsables}
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
          />
        )}

        <GastoTable
          gastos={gastos}
          isOpen={isOpen}
          categorias={categorias}
          responsables={responsables}
          editingGastoId={editingGastoId}
          editGasto={editGasto}
          setEditingGastoId={setEditingGastoId}
          setEditGasto={setEditGasto}
          onSaveEdit={saveEditGasto}
          onDeleteGasto={deleteGasto}
        />

        <PeriodoDetailFooter
          current={current}
          totalGastado={totalGastado}
          isOpen={isOpen}
          onPrint={() => setView("print", current.id)}
          onClose={() => closePeriodo(current.id)}
          onAprobarReposicion={aprobarReposicion}
          onExportExcel={exportExcel}
        />
      </div>
    );
  }

  return null;
}
