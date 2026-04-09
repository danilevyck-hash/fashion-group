"use client";

import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { ConfirmModal, Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import GuiasList from "./components/GuiasList";
import GuiaForm from "./components/GuiaForm";
import GuiaDetail from "./components/GuiaDetail";

export default function GuiasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "director"],
  });

  const s = useGuiasState();
  usePersistedScroll("guias", !s.loading && s.guias.length > 0);

  useEffect(() => {
    if (authChecked) {
      s.loadGuias();
      if (role === "bodega") s.setShowPending(true);
      // Support ?pendientes=1 from search quick actions
      const pendientesParam = new URLSearchParams(window.location.search).get("pendientes");
      if (pendientesParam === "1") s.setShowPending(true);
    }
  }, [authChecked]);

  // Handle browser back/forward
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (id) {
        s.openPrint(id);
      } else {
        s._setView("list");
        s.setPrintGuia(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get("id");
    if (urlId && authChecked) s.openPrint(urlId);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authChecked]);

  if (!authChecked) return null;

  // ── LIST VIEW ──
  if (s.view === "list") {
    return (
      <PullToRefresh onRefresh={s.loadGuias}>
      <div>
        <AppHeader module="Guías de Transporte" />
        <GuiasList
          guias={s.guias}
          loading={s.loading}
          error={s.error}
          search={s.search}
          setSearch={s.setSearch}
          showPending={s.showPending}
          setShowPending={s.setShowPending}
          role={role}
          onNewGuia={() => { s.resetForm(); s.setView("form"); }}
          expandedId={s.expandedId}
          expandedGuia={s.expandedGuia}
          expandedLoading={s.expandedLoading}
          onToggleExpand={s.toggleExpand}
          tipoDespacho={s.tipoDespacho}
          setTipoDespacho={s.setTipoDespacho}
          bPlaca={s.bPlaca}
          setBPlaca={s.setBPlaca}
          bReceptor={s.bReceptor}
          setBReceptor={s.setBReceptor}
          bCedula={s.bCedula}
          setBCedula={s.setBCedula}
          bChofer={s.bChofer}
          setBChofer={s.setBChofer}
          bSaving={s.bSaving}
          onConfirmarDespacho={s.confirmarDespacho}
          showToast={s.showToast}
          pendingFirma1={s.pendingFirma1}
          pendingFirma2={s.pendingFirma2}
          onFirma1Change={s.setPendingFirma1}
          onFirma2Change={s.setPendingFirma2}
          onEdit={s.startEdit}
          onPrint={s.openPrint}
          onDelete={s.requestDeleteGuia}
          onReject={s.rejectGuia}
        />
        <ConfirmModal
          open={!!s.confirmDeleteId}
          onClose={() => s.setConfirmDeleteId(null)}
          onConfirm={s.confirmDeleteGuia}
          title="Eliminar guía"
          message="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
        />
        <Toast message={s.toast} />
      </div>
      </PullToRefresh>
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
        onCancel={() => { s.setView("list"); s.resetForm(); }}
        hasDraft={s.hasGuiaDraft}
        draftTimeAgo={s.guiaDraftTimeAgo}
        onRestoreDraft={s.restoreGuiaDraft}
        onDiscardDraft={s.clearGuiaDraft}
      />
    );
  }

  // ── PRINT VIEW ──
  if (s.view === "print" && s.printGuia) {
    return (
      <GuiaDetail
        guia={s.printGuia}
        onBack={() => { s.loadGuias(); s.setView("list"); }}
      />
    );
  }

  return null;
}
