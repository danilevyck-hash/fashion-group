"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import GuiasList from "./components/GuiasList";
import AtarClienteModal from "./components/AtarClienteModal";
import {
  useClientesDelGrupo,
  useNombresDeClientes,
  type ClienteHit,
} from "@/lib/hooks/useBusquedaClientes";

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
        {/* La instrucción de qué escribir vive en el placeholder del campo:
            decirla dos veces no frenaba a nadie más. Lo que sí frena —que no
            se puede deshacer— se queda. */}
        <p className="text-sm text-gray-500 mb-4">
          Esta acción no se puede deshacer.
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
    allowedRoles: ["admin", "secretaria", "bodega", "vendedor"],
  });

  const s = useGuiasState();
  // `D-XXX` → nombre, para que el chip de cada línea diga de quién se trata.
  // Comparte el caché del selector: si ya se abrió un ClientePicker, no hay red.
  const nombresPorCodigo = useNombresDeClientes(authChecked);
  // El directorio entero, para el "¿quisiste decir…?" de la ventana de atar.
  // Sale del MISMO caché de módulo que el mapa de arriba y que el selector: no
  // agrega ni una lectura.
  const clientesDelGrupo = useClientesDelGrupo(authChecked);
  usePersistedScroll("guias", !s.loading && s.guias.length > 0);

  const [guiasReadonly, setGuiasReadonly] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("fg_guias_readonly") === "1") setGuiasReadonly(true);
  }, []);

  // Los clientes más usados EN GUÍAS, para que atar una línea vieja no obligue
  // a teclear. Se piden una sola vez y solo cuando hay sesión. Si falla, el
  // buscador del selector sigue funcionando igual — por eso no hay error visible.
  const [clientesTop, setClientesTop] = useState<ClienteHit[]>([]);
  useEffect(() => {
    if (!authChecked) return;
    let cancel = false;
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clientes?: ClienteHit[] } | null) => {
        if (!cancel && d && Array.isArray(d.clientes)) setClientesTop(d.clientes);
      })
      .catch(() => { /* sin chips; el buscador sigue funcionando */ });
    return () => { cancel = true; };
  }, [authChecked]);

  useEffect(() => {
    if (authChecked) {
      s.loadGuias();
      if (role === "bodega") s.setShowPending(false);
      const pendientesParam = new URLSearchParams(window.location.search).get("pendientes");
      if (pendientesParam === "1") s.setShowPending(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  if (!authChecked) return null;

  // ── LIST VIEW ── (única vista en /guias; crear/editar/imprimir están en rutas dedicadas)
  return (
    <PullToRefresh onRefresh={s.loadGuias}>
      <div>
        <AppHeader module="Guías de Despacho" />
        {/* 🔴 "Editar" (`onEdit`) lleva a LA PÁGINA DE LA GUÍA, donde se
            corrige y se despacha. Antes iba directo a `/editar` (solo los
            renglones) y el despacho se hacía desplegando el formulario dentro
            de la fila: eran dos caminos para lo mismo y confundían. */}
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
          onEdit={(id) => router.push(`/guias/${id}`)}
          onPrint={(id) => router.push(`/guias/${id}/imprimir`)}
          onDelete={s.requestDeleteGuia}
          onReject={s.rejectGuia}
          onAtarCliente={s.abrirAtarCliente}
          nombresPorCodigo={nombresPorCodigo}
          readOnly={guiasReadonly}
        />
        <AtarClienteModal
          open={!!s.atarItem}
          clienteTexto={s.atarItem?.cliente || ""}
          codigoActual={s.atarItem?.cliente_codigo || ""}
          nombreActual={nombresPorCodigo.get((s.atarItem?.cliente_codigo || "").trim().toUpperCase()) || ""}
          topClientes={clientesTop}
          clientesDelGrupo={clientesDelGrupo}
          guardando={s.atarGuardando}
          error={s.atarError}
          onClose={s.cerrarAtarCliente}
          onGuardar={s.guardarAtarCliente}
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
