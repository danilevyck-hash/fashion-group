"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt, fmtDate } from "@/lib/format";
import { centavos, saldoDelPeriodo, totalGastado } from "@/lib/caja/dinero";

import { useCajaState } from "../hooks/useCajaState";
import PeriodoDetailHeader from "../components/PeriodoDetailHeader";
import GastoTable from "../components/GastoTable";
import DeletedGastosModal from "../components/DeletedGastosModal";
import NuevoGastoDrawer from "../components/NuevoGastoDrawer";
import CerrarPeriodoModal from "../components/CerrarPeriodoModal";
import { useEscapeClose, useBackdropDismiss } from "@/lib/hooks/useModalDismiss";
import { useState, useCallback } from "react";
import "../skin.css";

export default function PeriodoDetailPage() {
  const router = useRouter();
  const params = useParams<{ periodoId: string }>();
  const periodoId = params?.periodoId ?? "";
  const { authChecked, isOwner } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });

  const [showDeletedModal, setShowDeletedModal] = useState(false);

  // Drawer de nuevo gasto inline. El back del navegador lo cierra (pushState al
  // abrir; popstate listener cierra; cerrar explícito hace history.back()).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openGastoDrawer = useCallback(() => {
    window.history.pushState({ cajaGastoDrawer: true }, "");
    setDrawerOpen(true);
  }, []);
  const closeGastoDrawer = useCallback(() => { window.history.back(); }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const onPop = () => setDrawerOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [drawerOpen]);

  const {
    current, error, aviso,
    allCategorias,
    editingGastoId, setEditingGastoId, editGasto, setEditGasto,
    confirmClosePeriodo, setConfirmClosePeriodo,
    loadDetail,
    requestClosePeriodo, doClosePeriodo,
    requestDeleteGasto, saveEditGasto, quickUpdateCategoria, exportExcel,
    pendingDeleteGasto, doDeleteGasto, cancelDeleteGasto,
  } = useCajaState({ authReady: authChecked, onPeriodoDeleted: () => router.push("/caja") });

  useEffect(() => {
    if (authChecked && periodoId) loadDetail(periodoId);
  }, [authChecked, periodoId, loadDetail]);

  // Confirmaciones artesanales de gasto: Escape y clic fuera = Cancelar (nunca
  // confirman). Los hooks van antes de cualquier return condicional.
  useEscapeClose(!!pendingDeleteGasto, cancelDeleteGasto);
  const deleteBackdrop = useBackdropDismiss(pendingDeleteGasto ? cancelDeleteGasto : undefined);

  if (!authChecked) return null;

  if (!current) {
    return (
      <div>
        <AppHeader module="Caja Menuda" breadcrumbs={[{ label: "Cargando..." }]} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const detailGastos = current.caja_gastos || [];
  // 🩸 Redondeado a centavos: sumar los 26 recibos del período Nº2 en coma
  // flotante daba 200.00000000000003 y el saldo salía en rojo con «−$0.00».
  const detailTotalGastado = totalGastado(detailGastos);
  const detailFondoInicial = centavos(current.fondo_inicial);
  const detailSaldo = saldoDelPeriodo(detailFondoInicial, detailGastos);
  const detailIsOpen = current.estado === "abierto";
  const detailPctUsed = detailFondoInicial > 0 ? (detailSaldo / detailFondoInicial) * 100 : 100;

  return (
    <div>
      <AppHeader
        module="Caja Menuda"
        breadcrumbs={[{ label: `Período N°${current.numero}` }]}
      />
      <div className="skin-caja min-h-screen">
        <PeriodoDetailHeader
          current={current}
          totalGastado={detailTotalGastado}
          saldo={detailSaldo}
          pctUsed={detailPctUsed}
          onBack={() => router.push("/caja")}
          onClosePeriodo={detailIsOpen ? () => requestClosePeriodo(current.id) : undefined}
          onPrint={() => router.push(`/caja/${current.id}/imprimir`)}
          onExportExcel={exportExcel}
          deletedCount={(current.deleted_gastos || []).length}
          onViewDeleted={() => setShowDeletedModal(true)}
        />

        <div className="max-w-6xl mx-auto px-5 sm:px-9 pt-6 pb-14">
          {aviso && !error && (
            <p
              className="text-sm mb-4 px-3 py-2 rounded-md"
              style={{
                color: "var(--caja-warning-onSoft)",
                background: "var(--caja-warning-soft)",
                border: "1px solid var(--caja-warning-border)",
              }}
            >
              {aviso}
            </p>
          )}
          {error && (
            <p
              className="text-sm mb-4 px-3 py-2 rounded-md"
              style={{
                color: "var(--caja-danger-onSoft)",
                background: "var(--caja-danger-soft)",
                border: "1px solid var(--caja-danger-border)",
              }}
            >
              {error}
            </p>
          )}

          <GastoTable
            gastos={detailGastos}
            isOpen={!!detailIsOpen}
            categorias={allCategorias}
            editingGastoId={editingGastoId}
            editGasto={editGasto}
            setEditingGastoId={setEditingGastoId}
            setEditGasto={setEditGasto}
            onSaveEdit={saveEditGasto}
            onDeleteGasto={requestDeleteGasto}
            onNuevoGasto={detailIsOpen ? openGastoDrawer : undefined}
            onQuickCategoria={quickUpdateCategoria}
          />
        </div>
      </div>

      {detailIsOpen && (
        <NuevoGastoDrawer
          open={drawerOpen}
          onClose={closeGastoDrawer}
          periodo={{
            id: current.id,
            numero: current.numero,
            fondo_inicial: detailFondoInicial,
            fecha_apertura: current.fecha_apertura,
            fecha_cierre: current.fecha_cierre,
            gastos: detailGastos,
          }}
          totalGastado={detailTotalGastado}
          isOwner={isOwner}
          onSaved={({ keepOpen }) => {
            loadDetail(periodoId);
            if (!keepOpen) closeGastoDrawer();
          }}
        />
      )}

      <DeletedGastosModal
        open={showDeletedModal}
        onClose={() => setShowDeletedModal(false)}
        deletedGastos={current.deleted_gastos || []}
      />

      <CerrarPeriodoModal
        open={!!confirmClosePeriodo}
        onClose={() => setConfirmClosePeriodo(null)}
        onConfirm={doClosePeriodo}
        fondo={detailFondoInicial}
        gastado={detailTotalGastado}
        recibos={detailGastos.length}
        siguienteNumero={current.numero + 1}
      />
      {pendingDeleteGasto && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" {...deleteBackdrop}>
          {/* El cuadro ya no necesita stopPropagation: el hook solo cierra si el
              mousedown Y el click cayeron sobre el fondo mismo. */}
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200">
            <h3 className="text-base font-medium mb-3">¿Eliminar este gasto?</h3>
            <p className="text-sm text-gray-800 mb-2">
              Gasto &ldquo;{pendingDeleteGasto.descripcion?.trim() || "Sin descripción"}&rdquo; · ${fmt(pendingDeleteGasto.total)} · {pendingDeleteGasto.categoria || "Sin categoría"} · {pendingDeleteGasto.proveedor || "Sin proveedor"} · {fmtDate(pendingDeleteGasto.fecha)}
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
    </div>
  );
}
