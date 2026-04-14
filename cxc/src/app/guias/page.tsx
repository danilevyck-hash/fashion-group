"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import GuiasList from "./components/GuiasList";
import GuiaForm from "./components/GuiaForm";
import GuiaDetail from "./components/GuiaDetail";

function GuiaDeleteModal({
  open,
  guiaNumero,
  onClose,
  onConfirm,
}: {
  open: boolean;
  guiaNumero: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [input, setInput] = useState("");
  const matches = input.trim().toUpperCase() === "ELIMINAR";

  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) setInput("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Eliminar guia</h3>
        <p className="text-sm text-gray-500 mb-4">
          Esta acción no se puede deshacer. Para confirmar, escribe <span className="font-semibold text-black">ELIMINAR</span>
        </p>
        <input
          type="text"
          inputMode="numeric"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe ELIMINAR para confirmar"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!matches}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 min-h-[44px]"
          >
            Eliminar
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuiasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const s = useGuiasState();
  usePersistedScroll("guias", !s.loading && s.guias.length > 0);

  useEffect(() => {
    if (authChecked) {
      s.loadGuias();
      if (role === "bodega") s.setShowPending(false);
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
        <GuiaDeleteModal
          open={!!s.confirmDeleteId}
          guiaNumero={(() => {
            if (!s.confirmDeleteId) return 0;
            const g = s.guias.find(g => g.id === s.confirmDeleteId);
            return g?.numero ?? 0;
          })()}
          onClose={() => s.setConfirmDeleteId(null)}
          onConfirm={s.confirmDeleteGuia}
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
