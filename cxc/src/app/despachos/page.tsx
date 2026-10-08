"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { BarraDeControles, ProveedorBarraCelular, useBarraCelular } from "@/components/celular/BarraDeControles";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, PullToRefresh } from "@/components/ui";
import { useGuiasState } from "./components/useGuiasState";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import dynamic from "next/dynamic";
import GuiasList from "./components/GuiasList";
import AtarClienteModal from "./components/AtarClienteModal";
import { GUIAS_ATAJOS_NUEVOS } from "@/lib/guias/atajos-facturas";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";
import { puedeEtiquetar } from "@/lib/guias/etiquetas";
import { ComisionesPeriodo } from "@/components/comisiones/ComisionesPeriodo";
import { GUIAS_LISTA_APPLE_2026_10, aniosConGuias, type PeriodoGuias } from "@/lib/guias/lista-apple-2026-10";
import { mesEnCurso } from "@/lib/comisiones/mes-inicial";
import { hoyPanama } from "@/lib/fecha-panama";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { puedeMarcarPedidos, puedeRecibirPedidos, puedeVerPedidosBodega } from "@/lib/guias/pedidos-bodega";
import { PEDIDOS_FLUJO_SIMPLE_2026_10 } from "@/lib/guias/pedidos-flujo-simple";

// LAZY, como los modos de Comisiones: bodega abre /guias todo el día desde el
// celular y la configuración es de admin/secretaria — su JS solo se descarga
// al tocar la pestaña. (Medido: importarla de arriba subía la carga inicial
// de /guias de 196 a 202 kB.)
const GuiasConfiguracionView = dynamic(() => import("./components/GuiasConfiguracionView"), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>,
});
// La pestaña «Etiquetas» (18-sep-2026), LAZY por la misma razón: arrastra jsPDF
// al imprimir y bodega abre /guias todo el día desde el celular.
const EtiquetasView = dynamic(() => import("./components/EtiquetasView"), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>,
});
// La pestaña «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`), LAZY igual.
const PedidosView = dynamic(() => import("./components/PedidosView"), {
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
  // 🔴 LA BARRA DEL CELULAR (2-oct-2026, `BARRA_CELULAR_2026_10`). Apagada o en
  // la computadora, la lista queda como estaba.
  const barra = useBarraCelular();
  // `D-XXX` → nombre, para que el chip de cada línea diga de quién se trata.
  // Comparte el caché del selector: si ya se abrió un ClientePicker, no hay red.
  const nombresPorCodigo = useNombresDeClientes(authChecked);
  // El directorio entero, para el "¿quisiste decir…?" de la ventana de atar.
  // Sale del MISMO caché de módulo que el mapa de arriba y que el selector: no
  // agrega ni una lectura.
  const clientesDelGrupo = useClientesDelGrupo(authChecked);
  usePersistedScroll("guias", !s.loading && s.guias.length > 0);
  // 🔴 GUIAS_LISTA_APPLE_2026_10: el período de la lista, el MISMO selector de
  // Ventas y Comisiones. Abre en el mes en curso y se recuerda al volver del detalle.
  const [periodo, setPeriodo] = usePersistedState<PeriodoGuias>("guias", "periodo", mesEnCurso(hoyPanama()));
  const anios = aniosConGuias(s.guias.map((g) => g.fecha), mesEnCurso(hoyPanama()).year);
  const selectorPeriodo = (
    <ComisionesPeriodo
      className={barra ? "w-full [&>button]:h-9 [&>button]:min-h-0 [&>button]:w-full [&>button]:text-[13px]" : undefined}
      panelDelAnchoDelBoton={barra}
      year={periodo.year}
      mes={periodo.mes}
      availableYears={anios}
      onChange={(year, mes) => setPeriodo({ year, mes })}
    />
  );

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
  // ── La pestaña «Etiquetas» (18-sep-2026): las etiquetas de las cajas ──
  // 🔴 NO cuelga de `GUIAS_ATAJOS_NUEVOS`: aquel interruptor es la salida de
  // emergencia de Nueva guía (volver a la pantalla de antes), y apagarlo no
  // puede esconder una función nueva que Daniel aprobó aparte. La ven los
  // MISMOS tres que escriben una guía (admin · secretaria · bodega,
  // `ETIQUETAS_ROLES` derivado de `GUIAS_WRITE_ROLES`); el vendedor no.
  type Vista = "pedidos" | "guias" | "config" | "etiquetas";
  const [vista, setVista] = useState<Vista>("guias");
  // 🔴 «Pedidos» es la PRIMERA pestaña y el módulo ABRE AHÍ para todos los
  // que la ven (Daniel, 7-oct-2026: «el módulo Despachos debe abrir en
  // Pedidos»). `?vista=guias` y `?pendientes=1` siguen abriendo la lista de
  // guías. Con el interruptor apagado no existe.
  const hayPedidos = puedeVerPedidosBodega(role);
  const hayConfig =
    GUIAS_ATAJOS_NUEVOS && !!role && (CONFIG_GUIAS_ROLES as readonly string[]).includes(role);
  const hayEtiquetas = puedeEtiquetar(role);
  useEffect(() => {
    if (!authChecked) return;
    const v = new URLSearchParams(window.location.search).get("vista");
    if (v === "config" || v === "etiquetas") setVista(v);
    else if (hayPedidos && v !== "guias" && !hayFiltroPendientes()) setVista("pedidos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);
  /** `?pendientes=1` (⌘K › «Ir a guías pendientes») es un enlace a la lista de guías. */
  function hayFiltroPendientes() {
    return new URLSearchParams(window.location.search).get("pendientes") === "1";
  }
  function cambiarVista(v: Vista) {
    setVista(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "guias" && !hayPedidos) params.delete("vista");
    else params.set("vista", v);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }
  const enConfig = hayConfig && vista === "config";
  const enEtiquetas = hayEtiquetas && vista === "etiquetas";
  const enPedidos = hayPedidos && vista === "pedidos";
  /** Las pestañas que de verdad existen para este rol. Con una sola, no se dibuja la fila. */
  const pestanas: Array<[Vista, string]> = [
    ...(hayPedidos ? ([["pedidos", "Pedidos"]] as Array<[Vista, string]>) : []),
    ["guias", "Guías de despacho"],
    // 🔴 «Bultos» (era «Etiquetas», 7-oct-2026): es el nombre del glosario de
    // `docs/nombres-erp.md` para esta pantalla (se escriben los bultos y
    // salen las hojas); la `key` de la pestaña («etiquetas») no cambia.
    // 🔴 Y vuelve a «Etiquetas» con el flujo simplificado (7-oct-2026, mismo
    // día): Daniel, al rediseñar Pedidos, pidió «que diga etiqueta, no
    // bultos». Detrás de `PEDIDOS_FLUJO_SIMPLE_2026_10`; apagado, el nombre
    // de hoy no cambia. Pendiente actualizar `docs/nombres-erp.md` el día que
    // esto se prenda.
    ...(hayEtiquetas ? ([["etiquetas", PEDIDOS_FLUJO_SIMPLE_2026_10 ? "Etiquetas" : "Bultos"]] as Array<[Vista, string]>) : []),
    ...(hayConfig ? ([["config", "Configuración"]] as Array<[Vista, string]>) : []),
  ];

  // 🔴 7-oct-2026 (Daniel aprobó): ENTRAR a Despachos NO llama a Switch.
  // Switch da UN token por usuario y cada login saca a Daniel de su panel
  // (medido 3-sep, docs/estado-actual.md). Antes aquí se disparaba
  // `POST /api/guias/facturas-hoy` al montar. Ahora la pantalla muestra lo
  // último sincronizado (`LineaDeFrescura`) y las facturas de hoy llegan por
  // los crons de switch-sync o con el botón «Actualizar» (cooldown 10 min del
  // server). Candado: src/__tests__/components/despachos-sin-switch-al-entrar.test.tsx

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
        <AppHeader module="Despachos" tituloEnLaPantalla={barra} />
        <ProveedorBarraCelular activo={barra} activa={vista}>
        {barra && (
          <BarraDeControles
            titulo="Despachos"
            pestanas={pestanas.map(([value, label]) => ({ value, label }))}
            activa={vista}
            onPestana={(v) => cambiarVista(v as Vista)}
            periodo={GUIAS_LISTA_APPLE_2026_10 && vista === "guias" ? selectorPeriodo : undefined}
          />
        )}
        {/* La fila de pestañas solo existe para quien puede configurar
            (admin y secretaria): para bodega y vendedor la pantalla es
            exactamente la de siempre, sin una fila extra. */}
        {!barra && pestanas.length > 1 && (
          <div className="max-w-3xl mx-auto px-4 pt-3">
            <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
              {pestanas.map(([v, label]) => (
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
        {enPedidos ? (
          <PedidosView
            puedeMarcar={puedeMarcarPedidos(role)}
            // 🔴 «Recibido» (o «Verificado» con bultos) lo marca la secretaria
            // y admin, nunca bodega.
            puedeRecibir={puedeRecibirPedidos(role)}
          />
        ) : enConfig ? (
          <GuiasConfiguracionView />
        ) : enEtiquetas ? (
          <EtiquetasView />
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
          onEditar={(id) => router.push(`/despachos/${id}?editar=1`)}
          onDespachar={(id) => router.push(`/despachos/${id}`)}
          onDelete={s.requestDeleteGuia}
          onAtarCliente={s.abrirAtarCliente}
          nombresPorCodigo={nombresPorCodigo}
          readOnly={guiasReadonly}
          periodo={GUIAS_LISTA_APPLE_2026_10 ? periodo : undefined}
          selectorPeriodo={GUIAS_LISTA_APPLE_2026_10 && !barra ? selectorPeriodo : undefined}
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
        </ProveedorBarraCelular>
      </div>
    </PullToRefresh>
  );
}
