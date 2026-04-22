"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import GuiasList from "./components/GuiasList";
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

  useEffect(() => { if (open) setInput(""); }, [open]);
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
      <div className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Eliminar guía {guiaNumero ? `GT-${String(guiaNumero).padStart(3, "0")}` : ""}</h3>
        <p className="text-sm text-gray-500 mb-4">
          Esta acción no se puede deshacer. Para confirmar, escribe <span className="font-semibold text-black">ELIMINAR</span>
        </p>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe ELIMINAR para confirmar"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 min-h-[44px]"
          >
            Eliminar
          </button>
          <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuiasPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const s = useGuiasState();
  usePersistedScroll("guias", !s.loading && s.guias.length > 0);

  const [guiasReadonly, setGuiasReadonly] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("fg_guias_readonly") === "1") setGuiasReadonly(true);
  }, []);

  useEffect(() => {
    if (authChecked) {
      s.loadGuias();
      if (role === "bodega") s.setShowPending(false);
      const pendientesParam = new URLSearchParams(window.location.search).get("pendientes");
      if (pendientesParam === "1") s.setShowPending(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  if (!authChecked) return null;

  // ── PRINT VIEW ── (mismo patrón anterior)
  if (s.view === "print" && s.printGuia) {
    return (
      <div>
        <div className="print:hidden">
          <AppHeader
            module="Guías de Transporte"
            breadcrumbs={[{ label: `GT-${String(s.printGuia.numero).padStart(3, "0")}` }, { label: "Imprimir" }]}
          />
        </div>
        <GuiaDetail
          guia={s.printGuia}
          onBack={() => { s.loadGuias(); s._setView("list"); }}
        />
      </div>
    );
  }

  // ── LIST VIEW ── (única vista en /guias; crear/editar están en rutas dedicadas)
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
          onNewGuia={() => router.push("/guias/nueva")}
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
          onEdit={(id) => router.push(`/guias/${id}/editar`)}
          onPrint={s.openPrint}
          onDelete={s.requestDeleteGuia}
          onReject={s.rejectGuia}
          readOnly={guiasReadonly}
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
