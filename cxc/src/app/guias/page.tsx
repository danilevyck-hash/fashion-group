"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import dynamic from "next/dynamic";
import GuiasList, { CREATE_ROLES } from "./components/GuiasList";
import AtarClienteModal from "./components/AtarClienteModal";
import { refrescarFacturasDelDia } from "./components/refrescarFacturasHoy";
import { GUIAS_ATAJOS_NUEVOS } from "@/lib/guias/atajos-facturas";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";

// LAZY, como los modos de Comisiones: bodega abre /guias todo el día desde el
// celular y la configuración es de admin/secretaria — su JS solo se descarga
// al tocar la pestaña. (Medido: importarla de arriba subía la carga inicial
// de /guias de 196 a 202 kB.)
const GuiasConfiguracionView = dynamic(() => import("./components/GuiasConfiguracionView"), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>,
});
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

  // ── La pestaña «Configuración» (4-sep-2026): los destinos definidos ──
  // La ven y la editan admin Y secretaria — Daniel: «configuraciones también
  // deja a secretaria». Bodega y vendedor no ven ni la pestaña (y la ruta les
  // contesta 403). Cuelga de GUIAS_ATAJOS_NUEVOS como todo lo nuevo de Guías:
  // apagado, la pestaña no existe y la pantalla es la de siempre.
  // ⚠️ Tab del MISMO nivel → `replace` sobre window.location, no
  // useSearchParams: ese hook obliga a envolver la página en <Suspense> (la
  // misma razón por la que `pendientes` ya se lee así abajo).
  const [vista, setVista] = useState<"guias" | "config">("guias");
  const hayConfig =
    GUIAS_ATAJOS_NUEVOS && !!role && (CONFIG_GUIAS_ROLES as readonly string[]).includes(role);
  useEffect(() => {
    if (!authChecked) return;
    const v = new URLSearchParams(window.location.search).get("vista");
    if (v === "config") setVista("config");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);
  function cambiarVista(v: "guias" | "config") {
    setVista(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "config") params.set("vista", "config");
    else params.delete("vista");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }
  const enConfig = hayConfig && vista === "config";

  // Al TOCAR Guías se dispara, en segundo plano, la lectura corta de las
  // facturas de HOY para el panel «Facturas del cliente». Daniel, textual
  // (4-sep-2026): «¿por qué no se puede hacer al apretar guías? Prefiero eso.»
  // — antes vivía solo en /guias/nueva. Fail-open, acelerada a 10 min
  // (sessionStorage) + cooldown de 10 min del server + lock del sync;
  // `logoutAllSwitchSessions()` va en el `finally` del route. NO dispara para
  // quien no puede crear guías (vendedor) ni en modo solo lectura: para ellos
  // el dato no se usa. Detrás de GUIAS_ATAJOS_NUEVOS (lo mira la función).
  // 🔴 La lista SIGUE sin despachar ni editar guías: este POST no escribe
  // sobre /api/guias/** — el candado de guias-eliminar-en-la-fila cambió de
  // dirección para exigir exactamente eso.
  useEffect(() => {
    if (!authChecked || !role || !CREATE_ROLES.includes(role)) return;
    let readonly = false;
    try {
      readonly = sessionStorage.getItem("fg_guias_readonly") === "1";
    } catch { /* sin sessionStorage no hay modo lectura que respetar */ }
    if (!readonly) refrescarFacturasDelDia();
  }, [authChecked, role]);

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
        {/* La fila de pestañas solo existe para quien puede configurar
            (admin y secretaria): para bodega y vendedor la pantalla es
            exactamente la de siempre, sin una fila extra. */}
        {hayConfig && (
          <div className="max-w-3xl mx-auto px-4 pt-3">
            <div className="flex items-center gap-1 border-b border-gray-200">
              {([
                ["guias", "Guías"],
                ["config", "Configuración"],
              ] as ["guias" | "config", string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => cambiarVista(v)}
                  aria-current={vista === v ? "page" : undefined}
                  className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-2.5 text-sm transition active:scale-[0.97] ${
                    vista === v
                      ? "border-gray-900 font-medium text-gray-900"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {enConfig ? (
          <GuiasConfiguracionView />
        ) : (
        <>
        {/* 🔴 LOS DOS BOTONES DE LA FILA NAVEGAN — ninguno despacha ni guarda.
            «Editar» abre la guía con el formulario ya abierto (`?editar=1`, el
            mismo query por el que entra el camino viejo `/guias/[id]/editar`) y
            «Despachar» la abre en el bloque de despacho. El formulario de
            despacho NO vuelve a la fila: eso se sacó el 10-ago-2026. */}
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
          onEditar={(id) => router.push(`/guias/${id}?editar=1`)}
          onDespachar={(id) => router.push(`/guias/${id}`)}
          onDelete={s.requestDeleteGuia}
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
        </>
        )}
      </div>
    </PullToRefresh>
  );
}
