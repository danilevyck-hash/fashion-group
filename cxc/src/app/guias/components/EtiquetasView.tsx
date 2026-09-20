"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — la pestaña (18-sep-2026).
//
// Daniel: elegir una factura, escribir cuántas cajas y que salgan las hojas
// para pegar. La etiqueta se imprime PRIMERO; la guía se hace ese día o tres
// días después, y sola se entera.
//
// 🔴 TRES TOQUES, UN SOLO PANEL (sin pantalla «Nueva»): factura → cajas →
// Imprimir. El destino ya viene puesto con el «de siempre» del cliente; solo se
// toca si cambia.
//
// 🔴 EL MISMO SELECTOR DE SIEMPRE (`ClientePicker`) y la MISMA lista de
// facturas por día (`/api/guias/facturas-cliente`, `agruparPorDia`) que Nueva
// guía: el sistema tiene UN selector de cliente y hay barrido que lo exige.
// **Una factura a la vez** (radio, no casillas).
//
// 🔴 ESTA PESTAÑA NO CUELGA DE `GUIAS_ATAJOS_NUEVOS`: aquel interruptor es la
// salida de emergencia de Nueva guía (revertirla a la de antes), y apagarlo no
// puede esconder una función nueva que Daniel aprobó aparte.
//
// 🔴 EL SERVIDOR MANDA: el anti-duplicado (409) y el bloqueo de lo ya importado
// los decide la ruta. La pantalla usa las MISMAS funciones puras
// (`etiquetaDeLaFactura`, `puedeCorregirse`) para no ofrecer lo que va a ser
// rechazado — pero no es la pantalla la que decide.
//
// 🔴 FALLA ABIERTA: sin la migración corrida, la pestaña se dibuja, dice que
// falta correrla y no se rompe nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { ModalOverlay, Toast } from "@/components/ui";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  DIAS_CON_FACTURA_VISIBLES,
  DIAS_POR_VER_MAS,
  agruparPorDia,
  alternarDia,
  diaAbierto,
  resumenDelDia,
  tituloDelDia,
  type FacturaDelCliente as Factura,
} from "@/lib/guias/atajos-facturas";
import { TEXTO_ACTUALIZANDO, TEXTO_ACTUALIZAR_AHORA } from "@/lib/ui/actualizar-ahora";
import {
  botonesDeDestino,
  destinoParaAutollenar,
  type DefinidosPorCliente,
} from "@/lib/guias/destinos-clientes";
import {
  MAX_CAJAS,
  TEXTO_TRAER_DE_SWITCH,
  avisoDeReimpresion,
  cajasDelJuego,
  cuantasPendientes,
  estaImportada,
  etiquetaDeLaFactura,
  facturasParaEtiquetar,
  filtrarEtiquetas,
  motivoBloqueo,
  nombreArchivoEtiquetas,
  puedeCorregirse,
  rotuloEstado,
  textoEscondidasPorEtiqueta,
  textoImprimir,
  textoYaEtiquetada,
  validarCajas,
  type EtiquetaFila,
  type FiltroEtiquetas,
} from "@/lib/guias/etiquetas";
import { abrirPdfEnPestana } from "@/lib/guias/pdf-en-pestana";

const BOTON_NEGRO =
  "inline-flex items-center justify-center gap-2 bg-black text-white rounded-md px-4 text-sm font-medium " +
  "transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 min-h-[44px]";
const BOTON_BLANCO =
  "inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 rounded-md px-4 text-sm " +
  "transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-40 min-h-[44px]";
const CHIP =
  "inline-flex items-center rounded-full border px-3.5 text-sm transition min-h-[44px] " +
  "md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5";

function fmtMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * 🔴 EL PDF SE ABRE EN PESTAÑA NUEVA, NO SE BAJA (18-sep-2026). Daniel: *«abrir
 * el PDF en pestaña nueva (inline), no descargar. Igual que "Ver PDF" de
 * Catálogos»* — desde ahí es un clic a imprimir y no se llena Descargas.
 *
 * ⚠️ Catálogos abre una URL DEL SERVIDOR; acá el PDF se arma en el navegador
 * (jsPDF entra por `import()` para no cargarlo con la pestaña), así que la
 * dirección sale de `output("bloburl")`. Mismo resultado, otro camino: no se
 * copió mal.
 *
 * 🔴 Y POR ESO LA PESTAÑA SE ABRE **ANTES** DEL `await`, dentro del clic —lo
 * hace `abrirPdfEnPestana`—: Safari bloquea una ventana que nace después de un
 * `await`. Sin pestaña, el archivo se baja como antes.
 */
function pdfDeLaEtiqueta(e: EtiquetaFila, cajas: readonly number[], caja?: number | null) {
  return async () => {
    const { construirPdfEtiquetas, datosDeEtiqueta } = await import("@/lib/guias/pdf-etiquetas");
    const doc = construirPdfEtiquetas(datosDeEtiqueta(e), cajas);
    return {
      url: doc.output("bloburl") as unknown as string,
      descargar: () => doc.save(nombreArchivoEtiquetas(e, caja ?? null)),
    };
  };
}

function imprimir(e: EtiquetaFila, cajas: readonly number[], caja?: number | null) {
  return abrirPdfEnPestana(pdfDeLaEtiqueta(e, cajas, caja));
}

export default function EtiquetasView() {
  const [etiquetas, setEtiquetas] = useState<EtiquetaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<FiltroEtiquetas>("pendientes");
  const [buscar, setBuscar] = useState("");

  const [panel, setPanel] = useState(false);
  // 🔴 REIMPRIMIR LLEVA SU AVISO: cuando se llega acá desde «Corregir bultos»,
  // el modal tiene que DECIR que el papel viejo quedó mal. Por eso es un objeto
  // y no la etiqueta pelada.
  const [reimprimiendo, setReimprimiendo] = useState<{ etiqueta: EtiquetaFila; aviso: string | null } | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<EtiquetaFila | null>(null);
  const [borrando, setBorrando] = useState<EtiquetaFila | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorLista(null);
    try {
      const r = await fetch("/api/guias/etiquetas", { cache: "no-store" });
      const d = (await r.json()) as { etiquetas?: EtiquetaFila[]; sinTabla?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error || "no ok");
      setEtiquetas(Array.isArray(d.etiquetas) ? d.etiquetas : []);
      setSinTabla(d.sinTabla === true);
    } catch {
      setEtiquetas([]);
      setErrorLista("No se pudieron cargar las etiquetas. Intenta de nuevo en unos segundos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const pendientes = cuantasPendientes(etiquetas);
  const visibles = useMemo(
    () => filtrarEtiquetas(etiquetas, filtro, buscar),
    [etiquetas, filtro, buscar],
  );

  async function borrar() {
    if (!borrando) return;
    const r = await fetch(`/api/guias/etiquetas/${borrando.id}`, { method: "DELETE" });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBorrando(null);
    if (!r.ok) { setToast(d.error || "No se pudo borrar"); return; }
    setToast("Etiquetas borradas");
    await cargar();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* 🔴 SIN LA MIGRACIÓN NO SE ROMPE NADA: la pestaña se dibuja y lo dice. */}
      {sinTabla && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Las etiquetas todavía no están encendidas: falta correr la migración{" "}
          <span className="font-mono">20261207120000_guias_etiquetas</span>. Guías sigue funcionando igual.
        </div>
      )}
      {errorLista && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorLista}
        </div>
      )}

      {panel ? (
        <PanelEtiquetar
          etiquetas={etiquetas}
          deshabilitado={sinTabla}
          onCerrar={() => setPanel(false)}
          onListo={async (mensaje) => { setToast(mensaje); await cargar(); }}
          onYaEtiquetada={(e) => setReimprimiendo({ etiqueta: e, aviso: null })}
        />
      ) : (
        <>
          {/* 🔴 LAS DOS PESTAÑAS SE SIENTEN FAMILIA (18-sep-2026). Daniel:
              *«siento que ambos tabs deben tener el mismo layout, que se
              sientan familia»*.

              🩸 Acá vivían las CINCO cosas en una sola fila —buscador, dos
              filtros y el botón negro—, y con el buscador estirado el botón
              principal quedaba al final de la derecha, perdido. Guías, en
              cambio, pone las acciones arriba a la derecha y el buscador en su
              propia fila debajo.

              🔴 QUE ETIQUETAS TOME LA FORMA DE GUÍAS, NO AL REVÉS: Guías lleva
              dos meses en uso y se parece al resto del sistema. Es el MISMO
              acomodo de `GuiasList` —`justify-end` arriba, buscador y chips
              abajo—, así que el botón negro cae en el mismo sitio en las dos.

              ⚠️ El ORDEN de las pestañas NO cambió: Guías sigue primero. El
              orden lo decide lo que más se abre, y hoy son 257 guías contra
              una etiqueta. */}
          <div className="flex items-center justify-end mb-4 flex-wrap gap-4">
            <button type="button" onClick={() => setPanel(true)} className={BOTON_NEGRO} disabled={sinTabla}>
              ＋ Etiquetar una factura
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4">
            <input
              type="text"
              value={buscar}
              onChange={(ev) => setBuscar(ev.target.value)}
              placeholder="Buscar factura o cliente"
              aria-label="Buscar factura o cliente"
              className="flex-1 min-w-[150px] max-w-sm border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={filtro === "pendientes"}
                onClick={() => setFiltro("pendientes")}
                className={`${CHIP} ${filtro === "pendientes" ? "border-gray-900 bg-gray-900 font-medium text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                Pendientes de guía · {pendientes}
              </button>
              <button
                type="button"
                aria-pressed={filtro === "todas"}
                onClick={() => setFiltro("todas")}
                className={`${CHIP} ${filtro === "todas" ? "border-gray-900 bg-gray-900 font-medium text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                Todas · {etiquetas.length}
              </button>
            </div>
          </div>

          {/* ⚠️ La tabla tiene su PROPIO deslizamiento: sin esto empuja la página. */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm" style={{ minWidth: 660 }}>
              <thead>
                <tr className="border-b border-gray-200">
                  {["Factura", "Cliente", "Empresa", "Bultos", "Estado", "Fecha", ""].map((h, i) => (
                    <th
                      key={h || `acc-${i}`}
                      className={`px-3 py-2.5 text-[12px] uppercase tracking-[0.06em] text-gray-400 font-semibold whitespace-nowrap ${h === "Bultos" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const bloqueo = motivoBloqueo(e);
                  return (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">{e.secuencial}</td>
                      <td className="px-3 py-2.5 font-medium">{e.cliente_nombre}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{e.empresa}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.cajas}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] ${
                            estaImportada(e)
                              ? "border-emerald-200 bg-emerald-50 font-medium text-emerald-800"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {rotuloEstado(e)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fechaCorta(e.creado_en)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <OverflowMenu
                          items={[
                            { label: "Reimprimir", onClick: () => setReimprimiendo({ etiqueta: e, aviso: null }) },
                            {
                              label: bloqueo ? "Corregir bultos — bloqueado" : "Corregir bultos",
                              onClick: () => setCorrigiendo(e),
                              disabled: !puedeCorregirse(e),
                            },
                            {
                              label: bloqueo ? "Borrar — bloqueado" : "Borrar",
                              onClick: () => setBorrando(e),
                              destructive: true,
                              disabled: !puedeCorregirse(e),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!cargando && visibles.length === 0 && (
              <p className="px-4 py-7 text-center text-sm text-gray-400">
                {filtro === "pendientes"
                  ? "Nada pendiente. Todo lo etiquetado ya salió en una guía."
                  : "Todavía no se ha etiquetado ninguna factura."}
              </p>
            )}
            {cargando && <p className="px-4 py-7 text-center text-sm text-gray-400">Cargando…</p>}
          </div>
        </>
      )}

      {reimprimiendo && (
        <ModalReimprimir
          etiqueta={reimprimiendo.etiqueta}
          aviso={reimprimiendo.aviso}
          onCerrar={() => setReimprimiendo(null)}
        />
      )}
      {corrigiendo && (
        <ModalCorregir
          etiqueta={corrigiendo}
          onCerrar={() => setCorrigiendo(null)}
          /* 🔴 CORREGIR LOS BULTOS LLEVA DIRECTO A REIMPRIMIR EL JUEGO COMPLETO
             (18-sep-2026). Si alguien corrigió de 14 a 16 cajas, las 14
             etiquetas pegadas dicen «de 14» y las cajas 15 y 16 no existen en
             papel. Antes esto guardaba y cerraba, y nadie se lo decía. */
          onListo={async (actualizada, antes) => {
            setCorrigiendo(null);
            setToast("Bultos corregidos");
            setReimprimiendo({ etiqueta: actualizada, aviso: avisoDeReimpresion(antes, actualizada.cajas) });
            await cargar();
          }}
        />
      )}
      {borrando && (
        <ModalOverlay onBackdropClick={() => setBorrando(null)}>
          <div className="relative w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-6 sm:rounded-lg">
            <h3 className="mb-1 text-base font-semibold">Borrar las etiquetas</h3>
            <p className="mb-1 text-sm text-gray-600">
              Se quitan las {borrando.cajas} etiquetas de la factura {borrando.secuencial}. Esa factura
              se puede volver a etiquetar después.
            </p>
            <p className="mb-4 text-xs text-gray-400">Queda guardado como historial: nada se borra de verdad.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => void borrar()} className={`${BOTON_NEGRO} flex-1 bg-red-600 hover:bg-red-700`}>
                Borrar
              </button>
              <button type="button" onClick={() => setBorrando(null)} className={`${BOTON_BLANCO} flex-1`}>
                Cancelar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      <Toast message={toast} />
    </div>
  );
}

// ─── El panel de etiquetar: tres toques ──────────────────────────────────────

interface PanelProps {
  etiquetas: readonly EtiquetaFila[];
  deshabilitado: boolean;
  onCerrar: () => void;
  onListo: (mensaje: string) => Promise<void> | void;
  onYaEtiquetada: (e: EtiquetaFila) => void;
}

function PanelEtiquetar({ etiquetas, deshabilitado, onCerrar, onListo, onYaEtiquetada }: PanelProps) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinLista, setSinLista] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [diasVisibles, setDiasVisibles] = useState(DIAS_CON_FACTURA_VISIBLES);
  const [diasAlternados, setDiasAlternados] = useState<ReadonlySet<string>>(new Set());
  const [elegidaClave, setElegidaClave] = useState<string | null>(null);
  const [cajas, setCajas] = useState("");
  const [destino, setDestino] = useState("");
  const [destinoTocado, setDestinoTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los destinos del cliente: los definidos en la tabla y los del histórico —
  // la MISMA fuente que usa el formulario de la guía. Best-effort: sin esto, el
  // campo Destino sale vacío y se escribe a mano.
  const [historicos, setHistoricos] = useState<Record<string, string[]>>({});
  const [definidos, setDefinidos] = useState<DefinidosPorCliente>({});
  useEffect(() => {
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { destinos?: Record<string, string[]>; definidos?: DefinidosPorCliente } | null) => {
        if (!d) return;
        if (d.destinos) setHistoricos(d.destinos);
        if (d.definidos) setDefinidos(d.definidos);
      })
      .catch(() => { /* sin botones de destino; se escribe a mano */ });
  }, []);

  const cargarFacturas = useCallback(async (codigo: string) => {
    setCargando(true);
    setSinLista(false);
    try {
      const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("no ok");
      const d = (await r.json()) as { facturas?: Factura[] };
      setFacturas(Array.isArray(d.facturas) ? d.facturas : []);
    } catch {
      setFacturas(null);
      setSinLista(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cliente?.codigo) void cargarFacturas(cliente.codigo);
  }, [cliente?.codigo, cargarFacturas]);

  /** 🔴 «ACTUALIZAR AHORA» reusa la MISMA ruta de siempre: nada de un camino
   *  nuevo a Switch. Trae solo el día de hoy, con su cooldown de 10 min y su
   *  cierre de sesiones en el `finally` del servidor.
   *
   *  🔄 18-sep-2026: el botón decía «Traer de Switch ahora», estrenado ayer.
   *  Daniel: *«¿no prefieres Actualizar ahora?»* — es la palabra que dicen los
   *  otros cinco módulos. Cambió el TEXTO y nada más; la frase de arriba
   *  (`TEXTO_TRAER_DE_SWITCH`) es de Daniel y NO se tocó. Ver
   *  `lib/ui/actualizar-ahora.ts`. */
  async function actualizarAhora() {
    if (!cliente?.codigo || actualizando) return;
    setActualizando(true);
    try {
      await fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
      await cargarFacturas(cliente.codigo);
    } finally {
      setActualizando(false);
    }
  }

  // 🔴 LO YA ETIQUETADO NO SE OFRECE (18-sep-2026). Daniel: *«Reimprimir/
  // corregir solo desde la lista de la pestaña»*. Antes salían con un chip
  // verde y, al darle a Imprimir, el servidor contestaba 409: la pantalla
  // ofrecía un camino que no llevaba a ningún lado. 🔴 Y se DICE cuántas se
  // escondieron: esconder en silencio haría creer que una factura se perdió.
  const { visibles, escondidas } = facturasParaEtiquetar(facturas ?? [], etiquetas);
  const { grupos, diasOcultos } = agruparPorDia(visibles, diasVisibles);
  const diaMasReciente = grupos[0]?.dia ?? null;
  const hoy = hoyPanama();

  // ⚠️ Se busca en lo VISIBLE, no en todo lo que trajo el servidor: una factura
  // que se etiquetó en otra pestaña desaparece de la lista y no puede quedarse
  // elegida por detrás.
  const elegida = useMemo(
    () => visibles.find((f) => claveFactura(f) === elegidaClave) ?? null,
    [visibles, elegidaClave],
  );

  // 🔴 EL ANTI-DUPLICADO, en la pantalla, con la MISMA función pura que usa el
  // servidor para el 409. No crea un segundo juego: dice lo que ya hay.
  const yaEtiquetada =
    elegida && elegida.switch_factura_id != null
      ? etiquetaDeLaFactura(etiquetas, elegida.empresa_key, elegida.switch_factura_id)
      : null;

  const botones = cliente
    ? botonesDeDestino(cliente.codigo, historicos[cliente.codigo] ?? [], definidos)
    : [];

  function elegirCliente(nombre: string, codigo: string) {
    setCliente(codigo ? { nombre, codigo } : null);
    setFacturas(null);
    setElegidaClave(null);
    setCajas("");
    setError(null);
    setDiasVisibles(DIAS_CON_FACTURA_VISIBLES);
    setDiasAlternados(new Set());
    // 🔴 EL DESTINO SE AUTOLLENA con «el de siempre» del cliente — la MISMA
    // regla del formulario de la guía (`destinoParaAutollenar`), ni una
    // segunda definición. Sin «el de siempre», el campo queda vacío.
    setDestinoTocado(false);
    setDestino(
      codigo ? (destinoParaAutollenar(codigo, historicos[codigo] ?? [], definidos) ?? "") : "",
    );
  }

  async function etiquetar() {
    if (!elegida || !cliente || guardando) return;
    const v = validarCajas(cajas);
    if (!v.ok) { setError(v.error); return; }
    if (!destino.trim()) { setError("Escribe el destino del envío"); return; }
    if (elegida.switch_factura_id == null) {
      setError("Esa factura todavía no tiene su número interno. Toca «Actualizar ahora».");
      return;
    }
    setGuardando(true);
    setError(null);
    // 🔴 LA PESTAÑA DEL PDF NACE DENTRO DEL CLIC, ANTES DEL POST. Todas las
    // validaciones de arriba son sincrónicas a propósito: `abrirPdfEnPestana`
    // abre la ventana y RECIÉN ahí espera el guardado y el dibujo del papel. Si
    // el servidor dice que no, la pestaña vacía se cierra sola.
    let creada: EtiquetaFila | null = null;
    try {
      await abrirPdfEnPestana(async () => {
        const r = await fetch("/api/guias/etiquetas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_key: elegida.empresa_key,
            switch_factura_id: elegida.switch_factura_id,
            secuencial: elegida.secuencial,
            fecha_factura: String(elegida.fecha ?? "").slice(0, 10),
            cliente_codigo: cliente.codigo,
            cliente_nombre: cliente.nombre,
            destino: destino.trim(),
            cajas: v.valor,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          etiqueta?: EtiquetaFila;
          yaEtiquetada?: EtiquetaFila;
          error?: string;
        };
        if (r.status === 409) {
          // 🔴 El servidor dijo que ya estaba: no se crea un segundo juego.
          if (d.yaEtiquetada) onYaEtiquetada(d.yaEtiquetada);
          setError(d.error || "Esa factura ya está etiquetada");
          return null;
        }
        if (!r.ok || !d.etiqueta) { setError(d.error || "No se pudo guardar"); return null; }
        creada = d.etiqueta;
        return pdfDeLaEtiqueta(d.etiqueta, cajasDelJuego(d.etiqueta.cajas))();
      });
      const guardada = creada as EtiquetaFila | null;
      if (guardada) {
        await onListo(`Listo · ${guardada.cajas} etiquetas — se abrieron en otra pestaña`);
        onCerrar();
      }
    } catch {
      setError("Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  const cantidad = validarCajas(cajas);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Etiquetar una factura</h2>
        <button type="button" onClick={onCerrar} className="text-sm text-gray-500 transition hover:text-black min-h-[44px]">
          Volver a la lista
        </button>
      </div>

      {/* ── 1 · La factura ── */}
      <div className="rounded-lg border border-gray-200 p-4">
        <Paso n={1} titulo="La factura" ayuda="El mismo buscador de siempre: eliges el cliente y salen sus facturas por día. Una a la vez." />
        <div className="max-w-sm">
          <ClientePicker
            id="etiquetas-cliente"
            value={cliente?.nombre ?? ""}
            codigo={cliente?.codigo ?? ""}
            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
            permitirOtro={false}
            onChange={elegirCliente}
          />
        </div>

        {cliente && (
          <div className="mt-4">
            {cargando && <p className="text-sm text-gray-400">Buscando facturas…</p>}
            {!cargando && sinLista && (
              <p className="text-sm text-amber-700">
                No se pudieron cargar las facturas. Intenta de nuevo en unos segundos.
              </p>
            )}
            {!cargando && facturas && facturas.length === 0 && (
              <p className="text-sm text-gray-500">Este cliente no tiene facturas registradas.</p>
            )}

            {!cargando && facturas && facturas.length > 0 && visibles.length === 0 && (
              <p className="text-sm text-gray-500">
                Todas las facturas de este cliente ya están etiquetadas — míralas en la lista.
              </p>
            )}

            {!cargando && visibles.length > 0 && (
              <div className="space-y-4">
                {grupos.map(({ dia, facturas: fs }) => {
                  const abierto = diaAbierto(dia, diaMasReciente, diasAlternados);
                  return (
                    <div key={dia}>
                      <button
                        type="button"
                        data-dia={dia}
                        aria-expanded={abierto}
                        onClick={() => setDiasAlternados((a) => alternarDia(a, dia))}
                        className="mb-1 flex w-full min-h-[44px] items-center gap-2 text-left lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1"
                      >
                        <svg className={`h-2.5 w-2.5 shrink-0 text-gray-400 transition-transform ${abierto ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M6 4l8 6-8 6V4z" />
                        </svg>
                        <span className="text-xs uppercase tracking-[0.05em] text-gray-400">{tituloDelDia(dia)}</span>
                        <span className="text-xs tabular-nums text-gray-400">
                          {`· ${resumenDelDia(fs.length, 0, true)}`}
                        </span>
                      </button>
                      {abierto && (
                        <ul>
                          {fs.map((f) => {
                            const clave = claveFactura(f);
                            return (
                              <li key={clave}>
                                <label className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-3 py-1.5 text-sm lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1">
                                  <input
                                    type="radio"
                                    name="etiquetas-factura"
                                    checked={elegidaClave === clave}
                                    onChange={() => { setElegidaClave(clave); setError(null); }}
                                    className="h-4 w-4 shrink-0 accent-black"
                                  />
                                  <span className="shrink-0 font-mono tabular-nums">{f.secuencial}</span>
                                  <span className="truncate text-gray-500">{f.empresa}</span>
                                  <span className="ml-auto shrink-0 tabular-nums text-gray-600">{fmtMonto(f.total)}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {diasOcultos > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiasVisibles((v) => v + DIAS_POR_VER_MAS)}
                    className="inline-flex min-h-[44px] items-center text-xs text-gray-400 transition hover:text-black md:[@media(pointer:fine)]:min-h-0"
                  >
                    Ver más días
                  </button>
                )}
              </div>
            )}

            {/* 🔴 LO ESCONDIDO SE CUENTA Y SE DICE DÓNDE ESTÁ. */}
            {!cargando && escondidas > 0 && (
              <p className="mt-2 text-xs text-gray-500">{textoEscondidasPorEtiqueta(escondidas)}</p>
            )}

            {!cargando && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <span>{TEXTO_TRAER_DE_SWITCH}</span>
                <button
                  type="button"
                  onClick={() => void actualizarAhora()}
                  disabled={actualizando}
                  className={`${BOTON_BLANCO} ml-auto min-h-[36px] px-3 text-[13px]`}
                >
                  {actualizando ? TEXTO_ACTUALIZANDO : TEXTO_ACTUALIZAR_AHORA}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔴 LA MISMA FACTURA, OTRA VEZ: no se crea un segundo juego. */}
      {yaEtiquetada && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[15px] font-semibold text-emerald-900">{textoYaEtiquetada(yaEtiquetada)}</p>
          <p className="mt-0.5 text-sm text-emerald-700">
            {fechaCorta(yaEtiquetada.creado_en)} · destino {yaEtiquetada.destino} ·{" "}
            {rotuloEstado(yaEtiquetada).toLowerCase()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onYaEtiquetada(yaEtiquetada)} className={`${BOTON_NEGRO} min-h-[36px] px-3 text-[13px]`}>
              Reimprimir
            </button>
          </div>
        </div>
      )}

      {/* ── 2 · Cuántas cajas y a dónde ── */}
      {!yaEtiquetada && (
        <>
          <div className="mt-3 rounded-lg border border-gray-200 p-4">
            <Paso n={2} titulo="Cuántos bultos" ayuda="Lo único que se escribe." />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CAJAS}
              value={cajas}
              onChange={(e) => { setCajas(e.target.value); setError(null); }}
              aria-label="Cuántos bultos"
              className="w-[130px] rounded-md border border-gray-200 px-3 text-center font-mono text-xl font-semibold outline-none transition focus:border-black min-h-[44px]"
            />

            <div className="mt-4">
              <div className="mb-1.5 text-xs uppercase tracking-[0.05em] text-gray-400">Destino</div>
              <input
                type="text"
                value={destino}
                onChange={(e) => { setDestino(e.target.value); setDestinoTocado(true); }}
                placeholder="A dónde va el envío"
                aria-label="Destino del envío"
                className="w-full max-w-sm rounded-md border border-gray-200 px-3 text-base sm:text-sm outline-none transition focus:border-black min-h-[44px]"
              />
              {botones.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1">
                  {botones.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={destino === d}
                      onClick={() => { setDestino(d); setDestinoTocado(true); }}
                      className={`inline-flex min-h-[44px] items-center rounded-md border px-2.5 text-xs transition md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1 ${
                        destino === d
                          ? "border-gray-900 bg-gray-900 font-medium text-white"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-black"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              {!destinoTocado && destino && (
                <p className="mt-1.5 text-xs text-gray-500">Se llenó solo con el destino de siempre de este cliente.</p>
              )}
            </div>
          </div>

          {/* ── 3 · Imprimir ── */}
          <div className="mt-3 rounded-lg border border-gray-200 p-4">
            <Paso n={3} titulo="Imprimir" ayuda="Hoja carta, 4 etiquetas por hoja, con líneas de corte." />
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void etiquetar()}
                disabled={guardando || deshabilitado || !elegida || !cantidad.ok}
                className={BOTON_NEGRO}
              >
                {guardando ? "Guardando…" : cantidad.ok ? textoImprimir(cantidad.valor) : "Imprimir"}
              </button>
              <button type="button" onClick={onCerrar} className={BOTON_BLANCO}>Cancelar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function claveFactura(f: Factura): string {
  return `${f.empresa_key}-${f.secuencial}`;
}

function Paso({ n, titulo, ayuda }: { n: number; titulo: string; ayuda: string }) {
  return (
    <div className="mb-2.5 flex items-start gap-3">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gray-900 font-mono text-[12px] font-semibold text-white">
        {n}
      </span>
      <div>
        <div className="text-[13.5px] font-semibold">{titulo}</div>
        <div className="mt-0.5 text-[12.5px] text-gray-600">{ayuda}</div>
      </div>
    </div>
  );
}

// ─── Reimprimir: el juego completo o una sola caja ───────────────────────────

function ModalReimprimir({
  etiqueta,
  aviso = null,
  onCerrar,
}: {
  etiqueta: EtiquetaFila;
  /** Por qué se está reimprimiendo (viene de «Corregir bultos»), o nada. */
  aviso?: string | null;
  onCerrar: () => void;
}) {
  // 🔴 ABRE CON EL JUEGO COMPLETO ELEGIDO — que es lo que hace falta después de
  // corregir los bultos, y lo que se pide nueve de cada diez veces.
  const [modo, setModo] = useState<"juego" | "una">("juego");
  const [caja, setCaja] = useState("1");

  const n = Number(caja);
  const cajaValida = Number.isInteger(n) && n >= 1 && n <= etiqueta.cajas;

  async function dale() {
    if (modo === "juego") await imprimir(etiqueta, cajasDelJuego(etiqueta.cajas));
    else if (cajaValida) await imprimir(etiqueta, [n], n);
    onCerrar();
  }

  return (
    <ModalOverlay onBackdropClick={onCerrar}>
      <div className="relative w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-6 sm:rounded-lg">
        <h3 className="mb-1 text-base font-semibold">Reimprimir · {etiqueta.secuencial}</h3>
        <p className="mb-4 text-sm text-gray-600">
          {etiqueta.cliente_nombre} · {etiqueta.empresa} · {etiqueta.cajas} bultos
        </p>

        {aviso && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {aviso}
          </p>
        )}

        <Opcion
          elegida={modo === "juego"}
          onElegir={() => setModo("juego")}
          titulo="El juego completo"
          detalle={`Las ${etiqueta.cajas} etiquetas.`}
        />
        <Opcion
          elegida={modo === "una"}
          onElegir={() => setModo("una")}
          titulo="Un solo bulto"
          detalle="Una hoja, la etiqueta arriba a la izquierda y el resto en blanco."
        >
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-sm text-gray-600">Bulto</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={etiqueta.cajas}
              value={caja}
              onChange={(e) => setCaja(e.target.value)}
              aria-label="Cuál bulto"
              onClick={(e) => e.stopPropagation()}
              className="w-[86px] rounded-md border border-gray-200 px-2 text-center font-mono outline-none transition focus:border-black min-h-[44px]"
            />
            <span className="text-sm text-gray-600">de {etiqueta.cajas}</span>
          </div>
        </Opcion>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => void dale()}
            disabled={modo === "una" && !cajaValida}
            className={`${BOTON_NEGRO} flex-1`}
          >
            Imprimir
          </button>
          <button type="button" onClick={onCerrar} className={`${BOTON_BLANCO} flex-1`}>Cancelar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function Opcion({
  elegida,
  onElegir,
  titulo,
  detalle,
  children,
}: {
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={elegida}
      tabIndex={0}
      onClick={onElegir}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onElegir(); } }}
      className={`mb-2 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
        elegida ? "border-gray-900 bg-gray-50" : "border-gray-200"
      }`}
    >
      <span className={`mt-0.5 h-[17px] w-[17px] shrink-0 rounded-full ${elegida ? "border-[5px] border-gray-900" : "border border-gray-400"}`} />
      <div>
        <div className="text-[13.5px] font-medium">{titulo}</div>
        <div className="mt-0.5 text-[12.5px] text-gray-600">{detalle}</div>
        {children}
      </div>
    </div>
  );
}

// ─── Corregir bultos (solo mientras está pendiente) ──────────────────────────

function ModalCorregir({
  etiqueta,
  onCerrar,
  onListo,
}: {
  etiqueta: EtiquetaFila;
  onCerrar: () => void;
  /**
   * 🔴 Devuelve la etiqueta YA CORREGIDA y cuántas cajas tenía antes: con eso
   * la pantalla abre la reimpresión del juego completo y dice qué cambió.
   */
  onListo: (actualizada: EtiquetaFila, antes: number) => Promise<void> | void;
}) {
  const [cajas, setCajas] = useState(String(etiqueta.cajas));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const v = validarCajas(cajas);
    if (!v.ok) { setError(v.error); return; }
    setGuardando(true);
    try {
      const r = await fetch(`/api/guias/etiquetas/${etiqueta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cajas: v.valor }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; etiqueta?: EtiquetaFila };
      // 🔴 El servidor puede decir que no: importada = bloqueada, aunque la
      // pantalla haya dejado abrir este modal.
      if (!r.ok) { setError(d.error || "No se pudo guardar"); return; }
      // La etiqueta que devuelve el servidor manda; sin ella, la de la pantalla
      // con el número nuevo (nunca se inventa un dato que no volvió).
      await onListo(d.etiqueta ?? { ...etiqueta, cajas: v.valor }, etiqueta.cajas);
    } catch {
      setError("Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onBackdropClick={onCerrar}>
      <div className="relative w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-6 sm:rounded-lg">
        <h3 className="mb-1 text-base font-semibold">Corregir bultos</h3>
        <p className="mb-4 text-sm text-gray-600">
          {etiqueta.secuencial} · {etiqueta.cliente_nombre}. Al guardar se abre la reimpresión del juego completo.
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CAJAS}
          value={cajas}
          onChange={(e) => { setCajas(e.target.value); setError(null); }}
          aria-label="Cuántos bultos"
          className="w-[130px] rounded-md border border-gray-200 px-3 text-center font-mono text-xl font-semibold outline-none transition focus:border-black min-h-[44px]"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={() => void guardar()} disabled={guardando} className={`${BOTON_NEGRO} flex-1`}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={onCerrar} className={`${BOTON_BLANCO} flex-1`}>Cancelar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
