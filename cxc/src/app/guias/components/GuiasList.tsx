"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary, destinosSummary } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge, AccordionContent, ScrollableTable } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";
import ResumenEnvio from "./ResumenEnvio";
import FirmasPlegadas from "./FirmasPlegadas";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  guiaSinNumeroTransp,
  guiaYaDespachada,
  numerosTranspDeLaGuia,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";
import { coincideGuiaConBusqueda } from "@/lib/guias/buscar-guia";
import { despachadaIncompleta, textoFaltantesDespachada } from "@/lib/guias/faltantes-despacho";
import { tieneRenglones } from "@/lib/guias/tiene-renglones";
import { facturasParaMostrar } from "@/lib/guias/numero-factura";
import { observacionesVisibles } from "@/lib/guias/observaciones";
import { partirGuiasPorVentana } from "@/lib/guias/ventana-lista";
import { separarPendientes, resumenPendientes } from "@/lib/guias/pendientes-arriba";
import { cedulaParaMostrar } from "@/lib/guias/cedula";
// ⚠️ `png-guia` NO arrastra jsPDF (el generador del PDF sigue detrás del
// `await import` de `papel-de-la-guia`), así que esto se puede importar
// directo sin engordar la carga inicial de la lista.
import { precargarFirmasGuia } from "@/lib/guias/png-guia";

/**
 * 🔴 LA GUÍA QUE SALIÓ SIN EL N° DEL TRANSPORTISTA, DICHO EN LA LISTA.
 *
 * El número dejó de bloquear el despacho (Daniel: *"a veces el transportista lo
 * da, a veces no"*). Que no bloquee no puede significar que se pierda de vista:
 * acá es donde alguien las encuentra después.
 */
function FaltaNumeroTransp() {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-xs whitespace-nowrap">
      Falta N° transportista
    </span>
  );
}

/**
 * 🔴 LA GUÍA QUE SALIÓ SIN PLACA, SIN QUIÉN RECIBIÓ O SIN CÉDULA.
 *
 * Daniel, punto 13: *"Las 68 sin placa y 65 sin recibido → marcadas para
 * completarlas"*. De las 207 despachadas, 190 (92%) tienen algún dato en
 * blanco: se cerraron cuando nada bloqueaba. El bloqueo se puso el 10-ago-2026
 * y desde entonces son 0 de 15.
 *
 * ⚠️ **MARCA, NO ABRE.** Esos tres campos NO están entre las tres cosas que se
 * pueden corregir en una guía firmada (N° del transportista · cliente ·
 * facturas) y siguen cerrados. Esto es para poder ENCONTRARLAS.
 */
function SalioIncompleta() {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-xs whitespace-nowrap">
      Salió incompleta
    </span>
  );
}

interface GuiasListProps {
  guias: Guia[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  showPending: boolean;
  setShowPending: (v: boolean) => void;
  role: string | null;
  onNewGuia: () => void;
  // Accordion
  expandedId: string | null;
  expandedGuia: Guia | null;
  expandedLoading: boolean;
  onToggleExpand: (id: string) => void;
  // Actions
  /** «Editar»: abrir la guía CON el formulario abierto. */
  onEditar: (id: string) => void;
  /** «Despachar»: abrir la guía en el bloque de despacho. NO despacha acá. */
  onDespachar: (id: string) => void;
  onDelete: (id: string) => void;
  /** Abrir la ventana de "¿a qué cliente fue esta línea?". Sin esto, el enlace
   *  no se ofrece (rol de solo lectura). */
  onAtarCliente?: (item: GuiaItem) => void;
  /** `D-XXX` → cómo se llama, para que el chip diga un NOMBRE y no un código.
   *  Si viene vacío (directorio no leído), el chip muestra solo el código. */
  nombresPorCodigo?: ReadonlyMap<string, string>;
  readOnly?: boolean;
}

/**
 * El chip de una línea ya atada: **el NOMBRE adelante, el código al lado**.
 *
 * 🩸 Antes decía solo `D-108`, y Daniel lo dijo con todas las letras: así
 * *"el personal no va a saber"* de qué cliente se trata. El orden importa —
 * lo que se lee es el nombre; el código queda de apoyo, chico, porque es lo
 * que identifica sin ambigüedad y lo que se corrige si está mal.
 *
 * El nombre sale de `nombreParaMostrar` (vía el mapa del directorio), el MISMO
 * que usa la lista del selector. Si el directorio no cargó, el chip queda
 * exactamente como estaba: el código solo. Nunca inventa un nombre.
 *
 * ⚠️ La jerarquía va por COLOR y tipografía, no por tamaño: el código sale en
 * mono y en un verde más tenue, pero NO más chico. En guías nada baja de 12 px
 * (candado `iphone-targets-guias`), y esta celda es de las que se leen a un
 * brazo de distancia en la bodega.
 *
 * ⚠️ NO SE TRUNCA. Esconder el nombre para que entre sería deshacer justo lo
 * que se vino a arreglar. El peor caso real, medido sobre los 148 clientes
 * D-XXX vivos, es de 47 caracteres ("Sistema Nacional De Proteccion Civil
 * (Sinaproc)"), así que el nombre BAJA DE LÍNEA y el chip crece hacia abajo,
 * que es lo único que la tabla puede regalar sin ensancharse.
 */
function ChipCliente({
  codigo,
  nombres,
  interactivo = false,
}: {
  codigo: string;
  nombres?: ReadonlyMap<string, string>;
  interactivo?: boolean;
}) {
  const nombre = nombres?.get(codigo.trim().toUpperCase()) ?? "";
  return (
    <span
      className={`inline-flex items-start gap-1.5 rounded px-1.5 py-1 min-w-0 text-left transition bg-emerald-50${
        interactivo ? " hover:bg-emerald-100" : ""
      }`}
      title={nombre ? `${nombre} (${codigo})` : codigo}
    >
      <span aria-hidden className="mt-[0.3rem] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="min-w-0">
        {nombre ? (
          <>
            <span className="text-emerald-900 break-words">{nombre}</span>
            <span className="ml-1.5 font-mono text-emerald-600">{codigo}</span>
          </>
        ) : (
          <span className="font-mono text-emerald-800">{codigo}</span>
        )}
      </span>
    </span>
  );
}

const DESPACHO_ROLES = ["admin", "secretaria", "bodega"];
// Exportada: la página de la lista la usa para decidir a quién le dispara el
// refresco de facturas de hoy (quien no puede crear guías no lo necesita).
export const CREATE_ROLES = ["admin", "secretaria", "bodega"];
const DELETE_ROLES = ["admin", "secretaria"];

export default function GuiasList({
  guias, loading, error, search, setSearch,
  showPending, setShowPending, role,
  onNewGuia,
  expandedId, expandedGuia, expandedLoading, onToggleExpand,
  onEditar, onDespachar, onDelete, onAtarCliente,
  nombresPorCodigo,
  readOnly,
}: GuiasListProps) {
  // Atar el cliente lo pueden hacer los mismos que despachan. NO depende del
  // estado de la guía: una guía Completada sigue estando cerrada a edición y
  // esto no la edita — ver `api/guias/[id]/cliente/route.ts`.
  const puedeAtarCliente = Boolean(onAtarCliente) && !readOnly && DESPACHO_ROLES.includes(role || "");

  /**
   * El nombre que va a dibujar el chip de esta línea, o `""` si no va a dibujar
   * ninguno. Es la MISMA cuenta que hace `ChipCliente`, y tiene que serlo: es lo
   * que decide si el texto escrito a mano se muestra o sobra.
   *
   * Devuelve vacío en los dos casos en que el chip NO alcanza para leer la
   * línea: sin código (nada que atar todavía) y con el directorio no leído (el
   * chip degrada al `D-XXX` pelado). Ahí el texto escrito vuelve a salir, que es
   * lo único que dice de quién se trata.
   */
  /**
   * 🔴 LO QUE SE VE FILTRADO Y LO QUE SE EXPORTA SON LA MISMA LISTA.
   *
   * 🩸 Esta regla estaba escrita TRES veces —la lista, el Excel y el
   * "seleccionar todas"— y las tres no decían lo mismo: la lista matcheaba
   * también el número y el N° del transportista, las otras dos no. Exportar
   * "lo filtrado" exportaba otra cosa que la que estaba en pantalla.
   *
   * El "coincide" vive en `@/lib/guias/buscar-guia`; acá solo se le suma el
   * filtro de "solo pendientes", que es de esta pantalla.
   */
  function filtrarGuias(lista: Guia[]): Guia[] {
    return lista
      .filter((g) => coincideGuiaConBusqueda(g, search, nombresPorCodigo))
      .filter((g) => !showPending || g.estado === "Pendiente Bodega");
  }

  function nombreDelChip(item: GuiaItem): string {
    // ⚠️ `|| ""` y no `?? ""`: hay un candado que busca la PRIMERA aparición de
    // `item.cliente_codigo ?` para leer la celda del chip, y un `??` acá se la
    // llevaría a este helper.
    const cod = (item.cliente_codigo || "").trim().toUpperCase();
    if (!cod) return "";
    return nombresPorCodigo?.get(cod) ?? "";
  }
  /**
   * LA CELDA «CLIENTE» DE UN RENGLÓN — **UNA SOLA VEZ EN EL ARCHIVO**
   * (5-sep-2026).
   *
   * 🔴 La dibujan las DOS pantallas: la tabla de escritorio y la ficha del
   * teléfono. Estaba escrita adentro del `<td>`, y la ficha nueva habría sido
   * una segunda copia — con dos chips distintos el día que alguien tocara uno.
   * Es una función, no un componente anidado: así no remonta en cada render.
   *
   * Lo que dice y en qué orden NO cambió ni una coma; solo se mudó de lugar.
   *
   * ⚠️ `ficha` = el teléfono. Lo ÚNICO que cambia es el TAMAÑO de la letra: en
   * la tabla el nombre hereda los 12 px del `<table>`, y en la ficha sube a 14,
   * que es el piso de la casa para un dato. Las clases van escritas COMPLETAS
   * en esta línea a propósito: Tailwind escanea texto y un `text-${n}` no
   * generaría ninguna de las dos.
   */
  function celdaCliente(item: GuiaItem, ficha = false) {
    const claseTexto = ficha ? "text-sm" : "text-xs";
    return (
      <>
    {/* El chip ya dice el nombre: repetirlo arriba es
        el ruido que se vino a sacar. Sin chip con
        nombre, el texto escrito es lo único que hay. */}
    {!nombreDelChip(item) && (
      <span className={`block break-words ${claseTexto} ${ficha ? "font-medium" : ""}`}>{item.cliente}</span>
    )}
    {/* Esta línea SIEMPRE mide 44 px, esté atada o no,
        para que las filas no queden desparejas según el
        estado de cada una. */}
    <span className="flex items-center min-h-[44px]">
      {/* 🩸 El código YA PUESTO también se toca. Si el
          chip fuera solo texto, una línea atada al
          cliente equivocado no se podría corregir nunca
          desde la pantalla — y las 5 de D-200 (GT-124,
          GT-136, GT-183) se arreglaron justamente así,
          el 26-ago-2026. */}
      {item.cliente_codigo ? (
        puedeAtarCliente && item.id ? (
          <button
            type="button"
            onClick={() => onAtarCliente?.(item)}
            title={`Cambiar o quitar el cliente (${item.cliente_codigo})`}
            className={`inline-flex items-center min-h-[44px] pr-3 ${claseTexto} text-emerald-700 hover:text-emerald-900 transition max-w-full`}
          >
            <ChipCliente codigo={item.cliente_codigo} nombres={nombresPorCodigo} interactivo />
          </button>
        ) : (
          <span className={`inline-flex items-center ${claseTexto} text-emerald-700 max-w-full`}>
            <ChipCliente codigo={item.cliente_codigo} nombres={nombresPorCodigo} />
          </span>
        )
      ) : puedeAtarCliente && item.id ? (
        <button
          type="button"
          onClick={() => onAtarCliente?.(item)}
          className={`inline-flex items-center min-h-[44px] pr-3 ${claseTexto} text-gray-400 hover:text-black underline underline-offset-2 transition`}
        >
          Atar cliente
        </button>
      ) : (
        <span className={`${claseTexto} text-gray-300`}>sin atar</span>
      )}
    </span>

      </>
    );
  }

  /** Las que esperan algo, y desde cuándo. `null` cuando no hay ninguna. */
  const { pendientes: guiasPendientes } = separarPendientes(guias, (g) => !guiaYaDespachada(g.estado));
  const avisoPendientes = resumenPendientes(guiasPendientes, new Date());

  /** «Ver guías más viejas» — arranca cerrado, con el último mes a la vista. */
  const [verViejas, setVerViejas] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [imprimiendo, setImprimiendo] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * 🔴 UN SOLO PDF CON TODAS LAS SELECCIONADAS.
   *
   * 🩸 Antes abría **una pestaña por guía** y adentro de cada una había que
   * apretar Imprimir: el navegador bloquea todas menos la primera, así que se
   * seleccionaban 8 guías esperando 8 papeles y salía UNA pestaña. Ahora baja
   * un documento con las 8, una por página, listo para la impresora.
   *
   * ⚠️ Las guías van en el orden en que se ven en la lista, no en el orden en
   * que se fueron tocando: `Set` conserva el orden de inserción, y un papel
   * salteado es imposible de encontrar en una pila de ocho.
   */
  async function printSelected() {
    if (selectedIds.size === 0 || imprimiendo) return;
    setImprimiendo(true);
    try {
      const seleccionadas = guias.filter((g) => selectedIds.has(g.id));
      // El detalle de los envíos NO viaja en el listado: se pide guía por guía,
      // igual que hace la pantalla de imprimir. Sin esto el papel saldría sin
      // renglones.
      const completas = await Promise.all(
        seleccionadas.map(async (g) => {
          try {
            const r = await fetch(`/api/guias/${g.id}`, { cache: "no-store" });
            return r.ok ? ((await r.json()) as Guia) : g;
          } catch {
            return g;
          }
        }),
      );
      const { construirPdfGuias, nombreArchivoGuias } = await import("@/lib/guias/pdf-guia");
      construirPdfGuias(completas).save(nombreArchivoGuias(completas));
    } finally {
      setImprimiendo(false);
    }
  }

  /**
   * Abrir el acordeón **y pedir el módulo del papel**.
   *
   * 🩸 En iOS, la hoja de compartir y el visor de PDF solo se abren DENTRO del
   * gesto del toque. Si el módulo se bajara al apretar «Compartir», el `await`
   * de red haría que el navegador dejara de contarlo como gesto y la hoja no
   * se abriría — y con un `catch` silencioso, sin decir por qué. Pedirlo acá lo
   * deja en memoria antes de que el botón exista en pantalla.
   */
  function abrirFila(id: string) {
    void import("@/lib/guias/papel-de-la-guia");
    onToggleExpand(id);
  }

  /**
   * 🔑 Las firmas de la guía abierta, decodificadas ANTES del clic. Desde el
   * 5-sep-2026 «Compartir» manda una IMAGEN cuando la guía tiene hasta 6
   * renglones, y dibujarla es síncrono a propósito: en iOS un `await` en el
   * medio le quita el gesto a la hoja de compartir.
   */
  useEffect(() => {
    if (!expandedGuia) return;
    precargarFirmasGuia(expandedGuia);
  }, [expandedGuia]);

  /**
   * 🔴 EL PAPEL DE **UNA** GUÍA: imprimir o compartir, de un toque.
   *
   * ⚠️ La guía que llega acá es la EXPANDIDA (`/api/guias/[id]`), que sí trae
   * sus renglones. El listado no los trae completos, y un papel sin envíos es
   * peor que no imprimir — por eso se pregunta antes.
   *
   * ⚠️ El `await import` resuelve de memoria: el módulo se pide al abrir el
   * acordeón. Si tuviera que bajarlo acá, en iOS el navegador dejaría de
   * considerar esto parte del toque y bloquearía la hoja de compartir.
   */
  /**
   * 🔴 LA GUÍA COMPLETA, CON SUS FIRMAS — el papel no se imprime a medias.
   *
   * 🩸 Desde el 5-sep-2026 «Imprimir» y «Compartir» viven en la FILA, sin
   * desplegar la guía. Pero la fila viene de `GET /api/guias`, que **deja las
   * firmas afuera a propósito**: medidas hoy, las 156 guías firmadas suman
   * **7,3 MB** de base64 (≈47 kB por guía) y mandarlas en cada carga de la
   * lista multiplicaría el peso por decenas. Usar la guía de la lista tal cual
   * habría impreso el papel SIN LAS FIRMAS, que es justo lo que ese papel
   * respalda.
   *
   * Así que la fila pide la guía completa a `/api/guias/[id]` — una sola vez
   * por guía, memorizada. Una guía que ya tiene el campo (la expandida, o una
   * ya pedida) no se vuelve a pedir.
   *
   * ⚠️ Y por eso existe `prepararPapel`: en iOS la hoja de compartir y el visor
   * de PDF tienen que abrirse DENTRO del gesto del toque, y un `await` de red en
   * el medio se lo lleva. La petición arranca en el `pointerdown` —al apoyar el
   * dedo— así que para cuando el `click` llega, casi siempre está resuelta. Si
   * no llegó a tiempo no se imprime nada malo: se cae al camino de siempre
   * (descarga en vez de hoja de compartir).
   */
  const guiasCompletas = useRef(new Map<string, Promise<Guia>>());

  function pedirCompleta(g: Guia): Promise<Guia> {
    if ("firma_base64" in g) return Promise.resolve(g);
    const cache = guiasCompletas.current;
    const ya = cache.get(g.id);
    if (ya) return ya;
    const p = fetch(`/api/guias/${g.id}`)
      .then((r) => (r.ok ? r.json() : g))
      // Si la lectura falla, se imprime lo que hay: un papel sin firma es peor
      // que ningún papel, pero quedarse sin hacer nada y sin decirlo es peor aún
      // — el toast del error lo dice la pantalla que llama.
      .catch(() => g);
    cache.set(g.id, p);
    return p;
  }

  /** Arranca la lectura al APOYAR el dedo, no al soltarlo. Ver arriba. */
  function prepararPapel(g: Guia) {
    void import("@/lib/guias/papel-de-la-guia");
    void pedirCompleta(g);
  }

  async function imprimirEsta(g: Guia) {
    const completa = await pedirCompleta(g);
    if (!tieneRenglones(completa)) return;
    const { imprimirGuia } = await import("@/lib/guias/papel-de-la-guia");
    imprimirGuia(completa);
  }

  async function compartirEsta(g: Guia) {
    const completa = await pedirCompleta(g);
    if (!tieneRenglones(completa)) return;
    const { compartirGuia } = await import("@/lib/guias/papel-de-la-guia");
    await compartirGuia(completa);
  }

  async function exportSelectedExcel() {
    if (selectedIds.size === 0) return;
    const { exportGuiasExcel } = await import("./excel-guias");
    const selected = guias.filter(g => selectedIds.has(g.id));
    exportGuiasExcel(selected);
  }
  const canCreate = !readOnly && role && CREATE_ROLES.includes(role);
  const canDelete = !readOnly && role && DELETE_ROLES.includes(role);
  const canEdit = !readOnly && role && ["admin", "secretaria", "bodega"].includes(role);

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Sin título grande: "Guías de Despacho" ya lo dicen la barra sticky
            (celular) y el breadcrumb (escritorio). Queda sr-only para no dejar
            la página sin encabezado, y la fila pasa a `justify-end` para que
            los botones no se corran a la izquierda al quedar solos. */}
        <div className="flex items-center justify-end mb-6 flex-wrap gap-4">
          <h1 className="sr-only">Guías de Despacho</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {selectionMode ? (
              <>
                <span className="text-sm text-gray-400">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}</span>
                {selectedIds.size > 0 && (
                  <>
                    {/* py-2 daba 36 px de alto: por debajo del mínimo táctil de 44. */}
                    <button onClick={() => { void printSelected(); }} disabled={imprimiendo} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 rounded-md active:bg-gray-100 transition-all inline-flex items-center justify-center min-h-[44px] disabled:opacity-50">{imprimiendo ? "Preparando…" : "Imprimir todas"}</button>
                    <button onClick={exportSelectedExcel} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 rounded-md active:bg-gray-100 transition-all inline-flex items-center justify-center min-h-[44px]">&darr; Excel</button>
                  </>
                )}
                {/* Botón de solo texto: los márgenes negativos compensan el padding
                    que necesita para llegar a 44 px, así no se corre de la fila. */}
                <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center justify-center min-h-[44px] px-2 -mx-2">Cancelar</button>
              </>
            ) : (
              <>
                {guias.length > 0 && (
                  <>
                    {/* Medía 111.9×39 en iPhone: py-2 no alcanza los 44 px de alto. */}
                    <button onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 rounded-md transition inline-flex items-center justify-center min-h-[44px]">Seleccionar</button>
                    <button
                      onClick={async () => {
                        const { exportGuiasExcel } = await import("./excel-guias");
                        // 🔴 EL MISMO FILTRO QUE LA PANTALLA. Acá vivía una
                        // copia MÁS POBRE (solo transportista, facturas y
                        // cliente): el Excel de "lo filtrado" exportaba otra
                        // cosa que la que se estaba viendo.
                        const filtered = filtrarGuias(guias);
                        exportGuiasExcel(filtered);
                      }}
                      className="text-sm border border-gray-200 text-gray-600 px-4 py-3 rounded-md font-medium hover:border-gray-400 hover:text-black transition"
                    >
                      &darr; Excel
                    </button>
                  </>
                )}
                {canCreate && (
                  <button
                    onClick={onNewGuia}
                    className="text-sm bg-black text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
                  >
                    Nueva Guía
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 🔴 ARRIBA, SOLO LO QUE ESPERA ALGO (5-sep-2026).
            🩸 Este banner decía «N guías pendientes de despachar» y **solo lo
            veía bodega** (`role === "bodega"`), justo el rol que ya aterriza en
            Guías. Angela y andrea, que crean el 99% de las guías, nunca lo
            vieron. Ahora lo ve todo el que abre la lista, dice hace cuánto
            espera la más vieja y LLEVA a esa guía.
            🔴 Si no hay ninguna, la línea no existe: nada de un cero grande. */}
        {(() => {
          if (!avisoPendientes) return null;
          return (
            <button
              type="button"
              onClick={() => abrirFila(avisoPendientes.guiaId)}
              className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 mb-6 flex items-center justify-between gap-3 text-left hover:bg-amber-100 transition min-h-[44px]"
            >
              <span className="font-medium">{avisoPendientes.texto}</span>
              <span aria-hidden className="text-amber-700 shrink-0">›</span>
            </button>
          );
        })()}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : guias.length === 0 ? (
          <EmptyState
            title="No hay guías registradas"
            actionLabel={canCreate ? "+ Nueva Guía" : undefined}
            onAction={canCreate ? onNewGuia : undefined}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4 flex-wrap">
              {selectionMode && (
                // El label es el área de toque real del checkbox (12 px de lado).
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer shrink-0 min-h-[44px] pr-2">
                  <input type="checkbox" checked={(() => { const ids = filtrarGuias(guias).map(g => g.id); return ids.length > 0 && ids.every(id => selectedIds.has(id)); })()} onChange={() => { const ids = filtrarGuias(guias).map(g => g.id); const allSel = ids.length > 0 && ids.every(id => selectedIds.has(id)); if (allSel) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(ids)); } }} className="accent-black" />
                  Todas
                </label>
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por transportista, cliente, factura o N° de guía…"
                className="border border-gray-200 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:border-black w-full max-w-sm transition"
              />
              {/* 🔴 ACÁ VIVÍA «LISTA PLANA / AGRUPAR POR FECHA», Y SE RETIRÓ
                  (5-sep-2026). Daniel, textual: *«el chip por fecha y todos
                  quítalo. Siempre ordenado por fecha»*.

                  🩸 Era UN botón cuyo texto alternaba entre las dos opciones, o
                  sea que nombraba el DESTINO y no dónde estabas: agrupado decía
                  «Lista plana». Y en el teléfono, un texto suelto de 12 px sobre
                  la lista se lee como un encabezado, no como algo que se toca.
                  La primera versión del cambio lo convirtió en un control de dos
                  opciones; Daniel decidió que sobra el control entero.

                  ⚠️ Lo agrupado por fecha NO cambió ni una línea: los mismos
                  `TimeGroupHeader` con el mismo `groupByTimePeriod`. Lo único que
                  se fue es la manera de apagarlo, que ya no existe. */}
            </div>

            <div className="space-y-1">
              {(() => {
                const filtered = filtrarGuias(guias);

                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 py-8 text-center">No hay guías</p>;
                }

                // 🔴 LA LISTA ABRE CON EL ÚLTIMO MES (5-sep-2026). Medido:
                // 46 guías de las 222. Antes traía 15 con un «Ver más» que
                // había que tocar 14 veces para llegar a la primera.
                const { recientes, viejas } = partirGuiasPorVentana(filtered, new Date());
                // 🔴 Y LO QUE ESPERA ALGO VA ARRIBA, fuera de los grupos de
                // fecha: una pendiente del 1-sep no puede quedar enterrada
                // entre 221 despachadas.
                const { pendientes, resto } = separarPendientes(recientes, (g) => !guiaYaDespachada(g.estado));
                const visible = verViejas ? [...resto, ...viejas] : resto;
                const hasMore = !verViejas && viejas.length > 0;

                const totalBultos = filtered.reduce((s, g) => s + (g.total_bultos || 0), 0);

                const allFilteredIds = filtered.map(g => g.id);
                const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));

                // 🔴 SIEMPRE agrupado por fecha: ya no hay forma de apagarlo.
                const _gg = groupByTimePeriod(visible, "fecha" as keyof Guia, "guias");
                const _rc = (g: Guia) => {
                      const isExpanded = expandedId === g.id;
                      // Fuente ÚNICA del "ya salió". Escribirlo a mano acá era
                      // una segunda definición del mismo estado.
                      // ⚠️ Nota 5-sep-2026: «Rechazada» salió de esa función
                      // (Daniel: *«quitarlo»*, 0 de 242 guías en toda la
                      // historia). Ya no hay estado heredado que contemplar.
                      const isDispatched = guiaYaDespachada(g.estado);

                      // Status-based left border color
                      // El borde rojo de "Rechazada" se fue con el rechazo
                      // (14-ago-2026) y el estado entero el 5-sep-2026.
                      const statusBorderClass = isDispatched
                        ? "border-l-4 border-l-emerald-400"
                        : (g.estado === "Confirmada" || g.estado === "Despachada")
                          ? "border-l-4 border-l-blue-400"
                          : "border-l-4 border-l-amber-400";

                      const cardContent = (
                        <div className={`border rounded-lg transition-all ${statusBorderClass} ${isExpanded ? "border-gray-300" : "border-gray-200 hover:border-gray-200"}`}>
                          {/* Row header — desktop: inline row, mobile: stacked card */}
                          {/* 🔴 EL «···» VIVE EN LA FILA, SIN ABRIR LA GUÍA (27-ago-2026).
                              Daniel pidió *"darle acceso a secretaria de poder
                              eliminar guias"*, y el permiso ya lo tenía: el
                              `DELETE` de la ruta acepta admin y secretaria desde
                              siempre. Lo que faltaba era ENCONTRAR el botón:
                              «Eliminar guía» vivía dentro del «···» de la guía
                              EXPANDIDA, o sea que había que abrir la guía
                              primero. Tres toques para algo que nadie hallaba.

                              🔑 SE MOVIÓ, NO SE DUPLICÓ. El «···» de adentro se
                              retiró en el mismo cambio: era el único ítem que
                              tenía, y dejarlo en los dos lados sería otra vez
                              «cada cambio deja su puerta», que es justo lo que
                              este módulo vino podando. Al abrir la guía la fila
                              NO desaparece, así que desde la guía abierta el
                              menú sigue estando a la vista, en la misma pantalla.

                              🔴 NO SE SACÓ «ELIMINAR» A LA FILA COMO BOTÓN
                              SUELTO. La fila ya tiene Editar · Despachar ·
                              Imprimir · Compartir, y en un celular un botón de
                              borrar al lado de «Imprimir» es un toque
                              equivocado esperando pasar sobre un documento
                              firmado. Queda detrás del menú, y detrás de la
                              ventana que exige escribir ELIMINAR.

                              ⚠️ Solo se dibuja para quien puede borrar
                              (`canDelete` = admin · secretaria, y nunca en
                              `readOnly`): a bodega y a vendedor no les aparece
                              ni el «···». Y no aparece en modo selección, que
                              tiene su propia barra de acciones. */}
                          <div className="flex items-stretch">
                          <button
                            onClick={() => selectionMode ? toggleSelect(g.id) : abrirFila(g.id)}
                            className="flex-1 min-w-0 text-left text-sm min-h-[44px]"
                          >
                            {/* ── Fila de escritorio (lg+) ─────────────────
                                🔴 EL CORTE PASÓ DE `md:` (768) A `lg:` (1024)
                                — 26-ago-2026.

                                🩸 A 834 px (iPad vertical, «el ancho que nadie
                                mira») esta fila dibujaba el TRANSPORTISTA EN
                                0 px y el resumen de clientes en 5: «Edwin» y
                                «Entrega directa» se veían como una sola letra.
                                Medido en las 15 filas de la primera pantalla,
                                las 15 rotas.

                                🔑 LA CAUSA, la misma que `FormulasConfig`
                                (#639): columnas de ANCHO FIJO que suman más
                                que el hueco disponible, y la única elástica
                                era `flex-1` = `flex:1 1 0%`. Con base 0 su
                                tamaño sale del espacio SOBRANTE; cuando no
                                sobra nada no se queda corta, se va a CERO. Y
                                el `truncate` (que es `overflow-hidden`) le
                                saca el piso de `min-width:auto` que la habría
                                salvado. La aritmética a 834: 224 px de barra
                                lateral + 48 de padding dejan 562, y las
                                columnas fijas ya pedían 704.

                                Con 6 columnas y hasta 250 px de chips ámbar,
                                a 834 NO ENTRA de ninguna forma: ahí manda la
                                TARJETA, que muestra lo mismo y más (suma el
                                destino) sin aplastar nada. Es la misma
                                decisión que ya tomó el formulario cuando el
                                iPad vertical caía del lado de la tabla.

                                ⚠️ Y de 1024 para arriba las dos columnas de
                                texto dejaron de tener ancho fijo: reparten el
                                sobrante 3:2, así que ninguna puede volver a
                                valer 0 y el nombre largo del cliente entra
                                donde antes se cortaba a los 160 px. */}
                            <div className="hidden lg:flex items-center gap-3 xl:gap-4 px-4 py-3">
                              {selectionMode && (
                                <span onClick={(e) => { e.stopPropagation(); toggleSelect(g.id); }} className="shrink-0">
                                  <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} className="accent-black" />
                                </span>
                              )}
                              {/* 🔴 EL ORDEN ES EL DE LO QUE SE LEE (5-sep-2026).
                                  🩸 Iba `Guía · Fecha · Transportista · Cliente ·
                                  Bultos · Estado`: lo más grande y en negrita era
                                  el TRANSPORTISTA, que tiene **7 etiquetas
                                  posibles** (6 del catálogo + «Entrega directa»), y el CLIENTE —lo único que distingue
                                  una guía de otra, **49 valores**— era la línea
                                  gris de al lado. Estaba al revés.

                                  Ahora: `Guía · Cliente · Destino · Bultos ·
                                  Transportista`. La FECHA se fue (la lista va
                                  siempre agrupada por fecha y el encabezado del
                                  día ya la dice) y el ESTADO también: 221 de 222
                                  decían lo mismo, y el color se reserva para lo
                                  que espera algo. */}
                              <span className="font-medium w-16 shrink-0 font-mono text-xs">{fmtGuia(g.numero)}</span>
                              {/* 🔴 `flex-[3_1_0]` y `flex-[2_1_0]`, NO `flex-1`
                                  + `w-40`: las dos se reparten TODO el sobrante
                                  en proporción 3:2. Con `min-w-0` truncan en vez
                                  de empujar la fila, y como las dos crecen
                                  juntas, ninguna puede quedar en 0 mientras
                                  sobre un píxel. */}
                              <span className="flex-[3_1_0] min-w-0 truncate font-medium">
                                {clientesSummary(g.guia_items || []) || "Sin cliente"}
                              </span>
                              <span className="text-gray-400 text-xs flex-[2_1_0] min-w-0 truncate">
                                {destinosSummary(g.guia_items || [])}
                              </span>
                              <span className="tabular-nums w-20 xl:w-24 text-right shrink-0">
                                {g.total_bultos} <span className="text-gray-400">bultos</span>
                              </span>
                              <span className="text-gray-500 w-28 xl:w-36 shrink-0 text-xs truncate">{g.transportista}</span>
                              {guiaSinNumeroTransp(g) && (
                                <span className="shrink-0"><FaltaNumeroTransp /></span>
                              )}
                              {despachadaIncompleta(g) && (
                                <span className="shrink-0"><SalioIncompleta /></span>
                              )}
                              {/* 🔴 SOLO SE PINTA LO QUE ESPERA. El chip verde
                                  «despachada» salía en 221 de 222 filas: un color
                                  que sale siempre deja de avisar. */}
                              {!isDispatched && (
                                <span className="shrink-0">
                                  <StatusBadge estado="pendiente" />
                                </span>
                              )}
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* ── Tarjeta (< lg): celular Y iPad vertical ────
                                Dice TODO lo que dice la fila y además el
                                destino, apilado, sin ninguna columna fija que
                                aplaste a la de al lado. Desde el 26-ago-2026
                                también manda a 834 px — ver la nota de arriba.
                                ⚠️ El nombre del cliente sigue saliendo UNA
                                sola vez (#638): acá abajo y en ningún otro
                                lado de la tarjeta. */}
                            <div className="lg:hidden px-4 py-3">
                              {/* 🔴 EL CLIENTE ARRIBA, EN NEGRITA (5-sep-2026).
                                  Antes lo grande era el TRANSPORTISTA —7 etiquetas— y el cliente —49 códigos— era la última línea
                                  chica. El estado verde se fue: salía en 221 de
                                  222 tarjetas. */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {selectionMode && (
                                    <span onClick={(e) => { e.stopPropagation(); toggleSelect(g.id); }} className="shrink-0">
                                      <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} className="accent-black" />
                                    </span>
                                  )}
                                  <span className="font-medium truncate">
                                    {clientesSummary(g.guia_items || []) || "Sin cliente"}
                                  </span>
                                </div>
                                {!isDispatched && (
                                  <span className="shrink-0"><StatusBadge estado="pendiente" /></span>
                                )}
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                              {/* `destino · N bultos · transportista`, en gris. */}
                              <div className="mt-1 text-xs text-gray-500 truncate">
                                {[destinosSummary(g.guia_items || []), `${g.total_bultos} bultos`, g.transportista]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                              {/* El número y la fecha, chicos: sirven para nombrar
                                  la guía, no para elegirla. */}
                              <div className="mt-1 text-xs text-gray-400 font-mono">
                                {fmtGuia(g.numero)} · {fmtDate(g.fecha)}
                              </div>
                              {(guiaSinNumeroTransp(g) || despachadaIncompleta(g)) && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {guiaSinNumeroTransp(g) && <FaltaNumeroTransp />}
                                  {despachadaIncompleta(g) && <SalioIncompleta />}
                                </div>
                              )}
                            </div>
                          </button>
                          {/* 🔴 LO QUE SE HACE TODOS LOS DÍAS, EN LA FILA
                              (5-sep-2026). Daniel: *«"Compartir" e "Imprimir" en
                              la tarjeta, sin desplegarla»*. Es lo que se hace al
                              terminar cada guía y estaba a DOS toques.

                              🔑 SE MOVIERON, NO SE DUPLICARON: los dos salieron
                              del acordeón en el mismo cambio. Y al revés,
                              «Editar» y «Eliminar guía» se fueron al «···» —
                              hasta hoy ese menú tenía UNA sola opción y encima
                              solo lo veía quien puede borrar, así que bodega no
                              tenía menú ninguno. */}
                          {!selectionMode && (
                            <div className="shrink-0 flex items-center gap-0.5 pr-1">
                              {/* «Despachar» solo donde hay algo que despachar, y
                                  a la vista: es UNA guía de 222. NO despacha acá
                                  — navega, como siempre. */}
                              {canEdit && !isDispatched && g.estado === "Pendiente Bodega" && (
                                <button
                                  type="button"
                                  onClick={() => onDespachar(g.id)}
                                  className="inline-flex items-center justify-center text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 transition px-3 rounded-md min-h-[44px]"
                                >
                                  Despachar
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Imprimir la guía ${fmtGuia(g.numero)}`}
                                title="Imprimir"
                                onPointerDown={() => prepararPapel(g)}
                                onClick={() => { void imprimirEsta(g); }}
                                className="inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition rounded-md min-h-[44px] min-w-[44px]"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 6 2 18 2 18 9" />
                                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                  <rect x="6" y="14" width="12" height="8" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                aria-label={`Compartir la guía ${fmtGuia(g.numero)}`}
                                title="Compartir"
                                onPointerDown={() => prepararPapel(g)}
                                onClick={() => { void compartirEsta(g); }}
                                className="inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition rounded-md min-h-[44px] min-w-[44px]"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 16V4" />
                                  <path d="m8 8 4-4 4 4" />
                                  <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                                </svg>
                              </button>
                              {/* El rótulo lleva el N° de la guía: hay un «···»
                                  por fila y "Más opciones" a secas no diría de
                                  cuál. */}
                              {(canEdit || canDelete) && (
                                <OverflowMenu
                                  ariaLabel={`Más opciones de la guía ${fmtGuia(g.numero)}`}
                                  items={[
                                    ...(canEdit ? [{ label: "Editar", onClick: () => onEditar(g.id) }] : []),
                                    ...(canDelete ? [{ label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true }] : []),
                                  ]}
                                />
                              )}
                            </div>
                          )}
                          </div>

                          {/* Expanded content */}
                          <AccordionContent open={isExpanded}>
                            <div className="px-4 pb-5 border-t border-gray-200">
                              {expandedLoading ? (
                                <div className="py-6 flex justify-center"><svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : expandedGuia ? (
                                <>
                                  {/* 🔴 ACÁ VIVÍA EL TERCERO DE LOS TRES TEXTOS QUE
                                      SE CONTRADECÍAN: *"Solo se puede cambiar el
                                      cliente"*. La guía decía *"lo único que se
                                      puede cambiar es el N° del transportista"* y
                                      el renglón decía *"es lo único que se puede
                                      cambiar de una guía ya despachada"*. Tres
                                      frases, tres respuestas distintas, y desde el
                                      punto 4 las tres son FALSAS: se corrigen el N°
                                      del transportista, el cliente Y las facturas.
                                      Los tres se fueron (Daniel, punto 14). */}

                                  {/* 🔴 LO QUE FALTÓ AL DESPACHAR, DICHO CON NOMBRE.
                                      El chip de la fila dice "Salió incompleta"; acá
                                      adentro se dice QUÉ falta, que es lo que
                                      alguien necesita para ir a buscarlo. Marca, no
                                      abre: placa, quién recibió y cédula siguen
                                      cerradas. */}
                                  {textoFaltantesDespachada(expandedGuia) && (
                                    <p className="text-xs text-amber-800 pt-3">
                                      {textoFaltantesDespachada(expandedGuia)}.
                                    </p>
                                  )}

                                  {/* 🔴 ACÁ VIVÍAN «EDITAR · DESPACHAR · IMPRIMIR ·
                                      COMPARTIR», Y SE FUERON A LA FILA
                                      (5-sep-2026). Daniel: *«"Compartir" e
                                      "Imprimir" en la tarjeta, sin desplegarla»*
                                      y *«"Editar" y "Eliminar guía" pasan al
                                      "···"»*. «Despachar» también está en la
                                      fila, y solo en la que espera.

                                      🔑 SE MOVIERON, NO SE DUPLICARON: dejarlos
                                      en los dos lados sería otra vez «cada
                                      cambio deja su puerta», que es lo que este
                                      módulo viene podando desde el 25-ago. La
                                      fila NO desaparece al abrir la guía, así
                                      que desde acá adentro los cuatro siguen a
                                      la vista, arriba.

                                      ⚠️ LO QUE NO SE AFLOJÓ: la lista NO
                                      despacha. Los botones son `router.push`,
                                      igual que antes. */}
                                  {/* ── LOS RENGLONES, DOS PANTALLAS ────────────────
                                      🩸 Esta tabla pide 600 px dentro de un iPhone
                                      de 390: **210 px de arrastre lateral** para
                                      llegar a los bultos, y medido sobre las 222
                                      guías vivas (5-sep-2026) **127 (el 57%) tienen UN
                                      solo renglón** y 172 (el 77%) tres o menos. Arrastrar
                                      una tabla para leer una línea.

                                      🔴 En pantalla ancha la tabla SE QUEDA (de
                                      `lg:` para arriba sobran los 600 px y las
                                      columnas alineadas se leen de un vistazo). En
                                      el teléfono manda la ficha de abajo, que es el
                                      MISMO formato de `ListaEnvios` — el que bodega
                                      ya ve al despachar. */}
                                  <ScrollableTable minWidth={600} className="mt-4 hidden lg:block">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-white z-10">
                                        <tr className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-200">
                                          <th className="text-left py-2 px-2 font-normal">#</th>
                                          <th className="text-left py-2 px-2 font-normal">Cliente</th>
                                          <th className="text-left py-2 px-2 font-normal">Direccion</th>
                                          <th className="text-left py-2 px-2 font-normal">Empresa</th>
                                          <th className="text-left py-2 px-2 font-normal">Facturas</th>
                                          <th className="text-center py-2 px-2 font-normal">Bultos</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(expandedGuia.guia_items || []).map((item, idx) => (
                                          <tr key={item.id || idx} className="border-b border-gray-50">
                                            <td className="py-1.5 px-2 text-gray-300">{idx + 1}</td>
                                            {/* El cliente y su código van APILADOS, no en dos
                                                columnas: la tabla ya mide 600 px y en un iPhone
                                                de 390 una columna más sería más arrastre.

                                                🔴 EL NOMBRE SE DICE UNA SOLA VEZ (26-ago-2026).
                                                Daniel, textual: *"porque me salen dos veces
                                                nombres de clientes, es ruido"*. Acá se pintaba el
                                                texto escrito a mano Y el chip del cliente atado,
                                                que dice el mismo nombre con su código al lado.

                                                🩸 Se midió antes de podar, porque la hipótesis
                                                razonable era que los dos textos avisaran de un
                                                desacuerdo (escribiste una cosa, ataste otra).
                                                Sobre las 423 líneas atadas de producción
                                                (26-ago-2026): 197 coinciden letra por letra y 226
                                                difieren — pero **ninguna de las 226 es otro
                                                cliente**. Son la MISMA tienda escrita distinto:
                                                168 son una variante que contiene a la otra
                                                ("City Mall" vs "City Mall David", el "S.A." de
                                                más, un espacio); de las 58 restantes, 27 son el
                                                alias de display de D-108, 21 "Sporting Shoes N4"
                                                vs "N 4", 8 "Jerusalem Panama" vs "De Panama" y 2
                                                más de puntuación.

                                                O sea: mostrar los dos cuando difieren seguiría
                                                dibujando DOS nombres en el 53% de los renglones
                                                — no resuelve nada de lo que Daniel señaló. Y
                                                decidir "son parecidos, muestro uno" pide un
                                                pareo difuso, que en este módulo está prohibido
                                                a propósito (ver `reglas-city-mall.ts`: "NADA por
                                                parecido, ni por distancia de edición").

                                                Así que manda el chip: NOMBRE + CÓDIGO, que es la
                                                prueba de que la línea está amarrada a Switch. El
                                                texto escrito NO se pierde — sigue en la base
                                                intacto, lo imprime el papel (`PrintDocument`), lo
                                                muestra la ficha de la guía (`ListaEnvios`) y lo
                                                dice el modal de atar ("En la guía dice"). Y acá
                                                mismo vuelve a salir en cuanto NO hay chip que lo
                                                reemplace: línea sin atar, o directorio no leído.

                                                ✅ Las 5 que SÍ eran otro cliente —"City Mall"
                                                escrito contra "El Machetazo-Calidonia" atado, un
                                                código que el sync de Switch reusó— las corrigió
                                                Daniel el 26-ago-2026: GT-124, GT-136 y GT-183
                                                pasaron a D-25 Paso Canoas y D-24 David. Así se
                                                arregla un desacuerdo: tocando el chip, NO
                                                escondiéndolo detrás de un segundo texto. */}
                                            <td className="py-1.5 px-2">{celdaCliente(item)}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.direccion}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.empresa}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{facturasParaMostrar(item.facturas)}</td>
                                            <td className="py-1.5 px-2 text-center tabular-nums">{item.bultos}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </ScrollableTable>

                                  {/* La MISMA ficha que `ListaEnvios`: nombre arriba,
                                      `destino · empresa · factura` en gris debajo y los
                                      bultos a la derecha. Sin `#`: con uno o tres
                                      renglones apilados, numerarlos es ruido. */}
                                  <ul className="lg:hidden divide-y divide-gray-100 mt-4">
                                    {(expandedGuia.guia_items || []).map((item, idx) => (
                                      <li key={item.id || idx} className="py-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <ResumenEnvio item={item}>{celdaCliente(item, true)}</ResumenEnvio>
                                          <span className="text-sm tabular-nums shrink-0">{item.bultos || 0} bultos</span>
                                        </div>
                                      </li>
                                    ))}
                                    {(expandedGuia.guia_items || []).length === 0 && (
                                      <li className="py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>
                                    )}
                                  </ul>

                                  {/* Observaciones */}
                                  {/* Sin la línea del cierre en bloque del
                                      3-ago-2026 (54 guías): se muestra lo que
                                      la persona escribió. La base no se toca —
                                      ver `lib/guias/observaciones.ts`. */}
                                  {observacionesVisibles(expandedGuia.observaciones) && (
                                    <p className="text-xs text-gray-500 mt-3 italic">{observacionesVisibles(expandedGuia.observaciones)}</p>
                                  )}

                                  {/* Dispatched: read-only despacho data */}
                                  {isDispatched && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div>
                                          <span className="text-gray-400 block">Tipo</span>
                                          <span className="font-medium">{ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(expandedGuia)]}</span>
                                        </div>
                                        {/* Sin placa en entrega directa, y un "0" no es una placa. */}
                                        {!esEntregaDirecta(expandedGuia) && sinCeroPelado(expandedGuia.placa) && (
                                          <div>
                                            <span className="text-gray-400 block">Placa</span>
                                            <span className="font-medium">{sinCeroPelado(expandedGuia.placa)}</span>
                                          </div>
                                        )}
                                        {/* 🩸 EL N° SALE DE LOS RENGLONES, NO DE LA CABECERA.
                                            Desde el 18-ago-2026 el número se puede anotar
                                            TARDE, y eso escribe UNA columna de UNA línea sin
                                            tocar `guia_transporte`. Leyendo la cabecera, acá
                                            decía "—" con el número ya cargado — el mismo
                                            defecto que el 25-ago se arregló en el Excel y en
                                            el buscador, y que acá quedó vivo. Misma fuente
                                            única que ellos: `numerosTranspDeLaGuia`, que ya
                                            aplica la herencia de las guías viejas y trata el
                                            "0" pelado como vacío. Con varios distintos los
                                            lista TODOS: elegir uno sería elegir por el que
                                            lee. */}
                                        {!esEntregaDirecta(expandedGuia) && (
                                          <div>
                                            <span className="text-gray-400 block">N° guía transp.</span>
                                            <span className="font-medium">{numerosTranspDeLaGuia(expandedGuia).join(", ") || "—"}</span>
                                          </div>
                                        )}
                                        {expandedGuia.nombre_chofer && (
                                          <div>
                                            <span className="text-gray-400 block">Chofer</span>
                                            <span className="font-medium">{expandedGuia.nombre_chofer}</span>
                                          </div>
                                        )}
                                        <div>
                                          <span className="text-gray-400 block">Receptor</span>
                                          <span className="font-medium">{expandedGuia.receptor_nombre || "—"}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Cedula</span>
                                          <span className="font-medium">{cedulaParaMostrar(expandedGuia.cedula) || "—"}</span>
                                        </div>
                                      </div>
                                      {/* 🩸 ACÁ SE DIBUJABAN LOS DOS CUADROS DE FIRMA A
                                          TAMAÑO COMPLETO: en un iPhone caen apilados y se
                                          llevan media pantalla para decir lo que casi
                                          siempre es lo mismo (156 de las 221 despachadas
                                          tienen las dos). Ahora es una línea con «Ver
                                          firmas»; si falta una, lo DICE.
                                          🔴 Al FIRMAR no cambió nada — ver `FirmasPlegadas`. */}
                                      <FirmasPlegadas guia={expandedGuia} directa={esEntregaDirecta(expandedGuia)} />
                                    </div>
                                  )}

                                </>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </div>
                      );

                      return <div key={g.id}>{cardContent}</div>;
                };

                return (
                  <>
                    {/* 🔴 LO PENDIENTE, ARRIBA Y FUERA DE LOS GRUPOS. Es UNA
                        guía de 222 y es la única con algo que hacer. */}
                    {pendientes.length > 0 && (
                      <div className="space-y-1 mb-3">{pendientes.map(_rc)}</div>
                    )}
                    {/* Sin la lista plana ya no hay una segunda rama: se dibujan
                        los grupos y nada más. */}
                    <div className="space-y-0">
                      {_gg.map((group) => (
                        <TimeGroupHeader key={group.key} label={group.label} count={group.items.length} color={group.color} bgColor={group.bgColor}>
                          <div className="space-y-1 p-1">{group.items.map(_rc)}</div>
                        </TimeGroupHeader>
                      ))}
                    </div>

                    {/* El resto de la historia, a un toque. No se deja de
                        pedir: se deja de dibujar. */}
                    {hasMore && (
                      <button onClick={() => setVerViejas(true)}
                        className="w-full py-4 text-base font-medium text-gray-700 hover:text-black hover:bg-gray-50 transition border-2 border-gray-300 rounded-lg mt-3 flex items-center justify-center gap-2">
                        <span>Ver guías más viejas ({viejas.length})</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}

                    {/* Totals */}
                    <div className="flex items-center justify-between px-4 py-3 text-sm border-t border-gray-200 mt-2">
                      <span className="text-gray-400 text-xs uppercase tracking-wide">
                        {filtered.length} guía{filtered.length !== 1 ? "s" : ""}
                      </span>
                      <span className="tabular-nums font-medium">{totalBultos} bultos</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
