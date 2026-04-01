"use client";

import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { ConfirmModal } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import GuiasList from "./components/GuiasList";
import GuiaForm from "./components/GuiaForm";
import GuiaDetail from "./components/GuiaDetail";

export default function GuiasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "upload", "secretaria", "director"],
  });

  const s = useGuiasState();

  useEffect(() => {
    if (authChecked) s.loadGuias();
  }, [authChecked]);

  // Handle browser back/forward
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (id) {
        s.viewGuia(id);
      } else {
        s._setView("list");
        s.setPrintGuia(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get("id");
    if (urlId && authChecked) s.viewGuia(urlId);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authChecked]);

  if (!authChecked) return null;

  // ── LIST VIEW ──
  if (s.view === "list") {
    return (
      <div>
        <AppHeader module="Guías de Transporte" />
        <GuiasList
          guias={s.guias}
          loading={s.loading}
          error={s.error}
          search={s.search}
          setSearch={s.setSearch}
          monthFilter={s.monthFilter}
          setMonthFilter={s.setMonthFilter}
          showPending={s.showPending}
          setShowPending={s.setShowPending}
          role={role}
          onNewGuia={() => {
            s.resetForm();
            s.setView("form");
          }}
          onViewGuia={s.viewGuia}
          onReload={s.loadGuias}
        />
      </div>
    );
  }

  // ── FORM VIEW ──
  if (s.view === "form") {
    return (
      <GuiaForm
        editingId={s.editingId}
        formNumero={s.formNumero}
        fecha={s.fecha}
        setFecha={s.setFecha}
        transportista={s.transportista}
        setTransportista={s.setTransportista}
        transportistaOtro={s.transportistaOtro}
        setTransportistaOtro={s.setTransportistaOtro}
        entregadoPor={s.entregadoPor}
        setEntregadoPor={s.setEntregadoPor}
        observaciones={s.observaciones}
        setObservaciones={s.setObservaciones}
        items={s.items}
        transportistas={s.transportistas}
        clientes={s.clientes}
        direcciones={s.direcciones}
        empresas={s.empresas}
        validationErrors={s.validationErrors}
        error={s.error}
        saving={s.saving}
        onAddTransportista={s.addTransportista}
        onAddCliente={s.addCliente}
        onAddDireccion={s.addDireccion}
        onAddEmpresa={s.addEmpresa}
        onUpdateItem={s.updateItem}
        onAddRow={s.addRow}
        onRemoveRow={s.removeRow}
        onSave={s.saveGuia}
        onCancel={() => {
          s.setView("list");
          s.resetForm();
        }}
      />
    );
  }

  // ── PRINT / DETAIL VIEW ──
  if (s.view === "print" && s.printGuia) {
    return (
      <>
        <GuiaDetail
          guia={s.printGuia}
          role={role}
          bPlaca={s.bPlaca}
          setBPlaca={s.setBPlaca}
          bReceptor={s.bReceptor}
          setBReceptor={s.setBReceptor}
          bCedula={s.bCedula}
          setBCedula={s.setBCedula}
          bSaving={s.bSaving}
          showPostDespacho={s.showPostDespacho}
          setShowPostDespacho={s.setShowPostDespacho}
          toast={s.toast}
          onBack={() => { s.loadGuias(); s.setView("list"); }}
          onEdit={s.startEdit}
          onDelete={s.requestDeleteGuia}
          onConfirmarDespacho={s.confirmarDespacho}
          showToast={s.showToast}
        />
        <ConfirmModal
          open={!!s.confirmDeleteId}
          onClose={() => s.setConfirmDeleteId(null)}
          onConfirm={s.confirmDeleteGuia}
          title="Eliminar guía"
          message="¿Eliminar esta guía? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
        />
      </>
    );
  }

  return null;
}
