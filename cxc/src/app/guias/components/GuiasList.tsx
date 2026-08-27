"use client";

import { useState } from "react";
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary, destinosSummary } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge, AccordionContent, ScrollableTable } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";
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
const CREATE_ROLES = ["admin", "secretaria", "bodega"];
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
  const [visibleCount, setVisibleCount] = useState(15);
  const [groupedView, setGroupedView] = useState(true);
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
  async function imprimirEsta(g: Guia) {
    if (!tieneRenglones(g)) return;
    const { imprimirGuia } = await import("@/lib/guias/papel-de-la-guia");
    imprimirGuia(g);
  }

  async function compartirEsta(g: Guia) {
    if (!tieneRenglones(g)) return;
    const { compartirGuia } = await import("@/lib/guias/papel-de-la-guia");
    await compartirGuia(g);
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

        {/* Bodega pending banner */}
        {role === "bodega" && (() => {
          const pendingCount = guias.filter((g) => g.estado === "Pendiente Bodega").length;
          if (pendingCount === 0) return null;
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600 mb-6 flex items-center justify-between">
              <span>
                {pendingCount} guía{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de despachar
              </span>
              {/* Enlace de texto dentro del banner: sin padding quedaba en 16 px
                  de alto. Los márgenes negativos evitan que engorde el banner. */}
              <button
                onClick={() => setShowPending(!showPending)}
                className="text-xs font-medium text-gray-500 hover:text-black underline transition inline-flex items-center justify-center min-h-[44px] px-2 -my-2 -mr-2"
              >
                {showPending ? "Ver todas" : "Ver pendientes"}
              </button>
            </div>
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
              {/* Medía 66.9×18: era el peor blanco de la lista. Alto forzado a 44
                  con padding lateral compensado por -mx-2 para no correr la fila. */}
              <button onClick={() => setGroupedView(!groupedView)} className={`text-xs transition whitespace-nowrap inline-flex items-center justify-center min-h-[44px] px-2 -mx-2 ${groupedView ? "text-black font-medium" : "text-gray-400 hover:text-black"}`}>
                {groupedView ? "Lista plana" : "Agrupar por fecha"}
              </button>
            </div>

            <div className="space-y-1">
              {(() => {
                const filtered = filtrarGuias(guias);

                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 py-8 text-center">No hay guías</p>;
                }

                const visible = filtered.slice(0, visibleCount);
                const hasMore = filtered.length > visibleCount;

                const totalBultos = filtered.reduce((s, g) => s + (g.total_bultos || 0), 0);

                const allFilteredIds = filtered.map(g => g.id);
                const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));

                const _gg = groupedView ? groupByTimePeriod(visible, "fecha" as keyof Guia, "guias") : null;
                const _rc = (g: Guia) => {
                      const isExpanded = expandedId === g.id;
                      // Fuente ÚNICA del "ya salió" (incluye la "Rechazada"
                      // heredada, que sigue siendo historia). Escribirlo a mano
                      // acá era una segunda definición del mismo estado.
                      const isDispatched = guiaYaDespachada(g.estado);

                      // Status-based left border color
                      // El borde rojo de "Rechazada" se fue con el rechazo
                      // (14-ago-2026). `isDispatched` ya la trata como historia,
                      // así que una fila heredada se ve despachada, no pendiente
                      // — que es lo que es.
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
                              <span className="font-medium w-16 shrink-0 font-mono text-xs">{fmtGuia(g.numero)}</span>
                              <span className="text-gray-500 w-28 xl:w-36 shrink-0 text-xs">{fmtDate(g.fecha)}</span>
                              {/* 🔴 `flex-[3_1_0]` y `flex-[2_1_0]`, NO `flex-1`
                                  + `w-40`: las dos se reparten TODO el sobrante
                                  en proporción 3:2. Con `min-w-0` truncan en vez
                                  de empujar la fila, y como las dos crecen
                                  juntas, ninguna puede quedar en 0 mientras
                                  sobre un píxel. */}
                              <span className="flex-[3_1_0] min-w-0 truncate">{g.transportista}</span>
                              <span className="text-gray-400 text-xs flex-[2_1_0] min-w-0 truncate">
                                {clientesSummary(g.guia_items || [])}
                              </span>
                              <span className="tabular-nums w-20 xl:w-24 text-right shrink-0">
                                {g.total_bultos} <span className="text-gray-400">bultos</span>
                              </span>
                              {guiaSinNumeroTransp(g) && (
                                <span className="shrink-0"><FaltaNumeroTransp /></span>
                              )}
                              {despachadaIncompleta(g) && (
                                <span className="shrink-0"><SalioIncompleta /></span>
                              )}
                              <span className="w-24 shrink-0">
                                <StatusBadge estado={isDispatched ? "despachada" : "pendiente"} />
                              </span>
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
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {selectionMode && (
                                    <span onClick={(e) => { e.stopPropagation(); toggleSelect(g.id); }} className="shrink-0">
                                      <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} className="accent-black" />
                                    </span>
                                  )}
                                  <span className="font-medium font-mono text-xs shrink-0">{fmtGuia(g.numero)}</span>
                                  <span className="font-medium truncate">{g.transportista}</span>
                                </div>
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="text-gray-500 text-xs">{fmtDate(g.fecha)}</span>
                                <span className="tabular-nums text-xs text-gray-500">{g.total_bultos} bultos</span>
                                <span className="ml-auto">
                                  <StatusBadge estado={isDispatched ? "despachada" : "pendiente"} />
                                </span>
                              </div>
                              {(guiaSinNumeroTransp(g) || despachadaIncompleta(g)) && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {guiaSinNumeroTransp(g) && <FaltaNumeroTransp />}
                                  {despachadaIncompleta(g) && <SalioIncompleta />}
                                </div>
                              )}
                              {/* Cliente + destino visibles sin expandir (bodega ve a quién va) */}
                              {(clientesSummary(g.guia_items || []) || destinosSummary(g.guia_items || [])) && (
                                <div className="mt-1.5 text-xs text-gray-700 truncate">
                                  <span className="font-medium">{clientesSummary(g.guia_items || []) || "Sin cliente"}</span>
                                  {destinosSummary(g.guia_items || []) && (
                                    <span className="text-gray-400"> · {destinosSummary(g.guia_items || [])}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </button>
                          {canDelete && !selectionMode && (
                            <div className="shrink-0 flex items-center pr-1">
                              {/* El rótulo lleva el N° de la guía: hay un «···»
                                  por fila y "Más opciones" a secas no diría de
                                  cuál. */}
                              <OverflowMenu
                                ariaLabel={`Más opciones de la guía ${fmtGuia(g.numero)}`}
                                items={[
                                  { label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true },
                                ]}
                              />
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

                                  {/* Acciones rápidas (header de la card expandida) */}
                                  {/* 🔴 DOS BOTONES, Y LOS DOS NAVEGAN: NINGUNO DESPACHA.
                                      Daniel, textual: *"Dos botones en la fila:
                                      «Editar» y «Despachar», pero que haga
                                      sentido"*.

                                      🩸 Con un solo botón llamado «Despachar»,
                                      corregir un nombre obligaba a tocar
                                      «Despachar» primero y buscar «Editar»
                                      adentro — la queja original, sin resolver.
                                      Ahora cada tarea tiene su puerta: «Editar»
                                      abre la guía CON el formulario abierto
                                      (`?editar=1`) y «Despachar» la abre en el
                                      bloque de despacho.

                                      🔴 LO QUE NO SE AFLOJÓ: la lista NO
                                      despacha. Ni por swipe, ni desplegando el
                                      formulario en la fila (eso se sacó el
                                      10-ago-2026 y sigue afuera). Los dos
                                      botones son `router.push`, nada más.

                                      ⚠️ Una guía YA DESPACHADA no muestra
                                      ninguno de los dos: sigue cerrada a
                                      edición (candado en
                                      `guias-sin-rechazo.test.tsx`). */}
                                  <div className="flex items-center justify-end gap-2 pt-3 flex-wrap">
                                    {/* 🔴 «EDITAR» TAMBIÉN EN UNA GUÍA YA DESPACHADA
                                        (Daniel, punto 9: *"se entra igual que a
                                        cualquier otra"*).

                                        🩸 Hasta hoy la fila de una Completada no
                                        tenía ningún botón para ENTRAR: `/guias/[id]`
                                        de una despachada solo se abría escribiendo la
                                        URL a mano. Y ahí adentro viven el N° del
                                        transportista y el aviso de la guía que salió
                                        sin él — el chip ámbar marcaba guías que nadie
                                        podía destildar desde la pantalla.

                                        ⚠️ Entrar no es poder tocar todo: en una guía
                                        firmada el formulario abre TRES cosas (N° del
                                        transportista, cliente y facturas) y muestra el
                                        resto como texto. La regla vive en
                                        `campos-editables.ts` y la aplica también el
                                        servidor. El candado del PUT no se tocó. */}
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => onEditar(expandedGuia.id)}
                                        className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-700 hover:text-black transition px-3.5 rounded-md border border-gray-200 hover:bg-gray-100 min-h-[44px]"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 20h9" />
                                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                                        </svg>
                                        Editar
                                      </button>
                                    )}
                                    {/* «Despachar» solo donde hay algo que despachar:
                                        "Pendiente Bodega". "Confirmada" es un estado
                                        legacy que ya salió sin firmar y ahí editar es
                                        lo único que tiene sentido. */}
                                    {canEdit && !isDispatched && expandedGuia.estado === "Pendiente Bodega" && (
                                      <button
                                        type="button"
                                        onClick={() => onDespachar(expandedGuia.id)}
                                        className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-700 hover:text-black transition px-3.5 rounded-md border border-gray-200 hover:bg-gray-100 min-h-[44px]"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="1" y="3" width="15" height="13" />
                                          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                          <circle cx="5.5" cy="18.5" r="2.5" />
                                          <circle cx="18.5" cy="18.5" r="2.5" />
                                        </svg>
                                        Despachar
                                      </button>
                                    )}
                                    {/* 🔴 DOS BOTONES, Y CADA UNO HACE LO SUYO DE UNA.
                                        Daniel, puntos 10 y 11: *"Imprimir → un botón
                                        que imprime directo"* · *"Compartir → otro
                                        botón que manda el PDF"*.

                                        🩸 Había UNO solo, y no hacía ninguna de las
                                        dos cosas: abría una PESTAÑA con la vista
                                        previa, y adentro había que buscar «Imprimir» o
                                        «Compartir». Dos toques y un cambio de pantalla
                                        para cada tarea.

                                        🔑 El documento es el MISMO para las dos y es
                                        el de siempre (`construirPdfGuia`). No hay dos
                                        papeles.

                                        ⚠️ El módulo se pide al ABRIR el acordeón, no
                                        al tocar el botón: en iOS la hoja de compartir
                                        y el visor tienen que abrirse DENTRO del toque,
                                        y una descarga de red en el medio hace que el
                                        navegador deje de contarlo como gesto. */}
                                    <button
                                      type="button"
                                      onClick={() => { void imprimirEsta(expandedGuia); }}
                                      /* Medía 85.5×36 — el min-h-[36px] anterior se quedaba corto. */
                                      className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-700 hover:text-black transition px-3 rounded hover:bg-gray-100 min-h-[44px]"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 6 2 18 2 18 9" />
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <rect x="6" y="14" width="12" height="8" />
                                      </svg>
                                      Imprimir
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { void compartirEsta(expandedGuia); }}
                                      className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-700 hover:text-black transition px-3 rounded hover:bg-gray-100 min-h-[44px]"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 16V4" />
                                        <path d="m8 8 4-4 4 4" />
                                        <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                                      </svg>
                                      Compartir
                                    </button>
                                    {/* 🔴 ACÁ VIVÍA EL «···» CON SU ÚNICO ÍTEM, y
                                        por eso borrar costaba TRES toques:
                                        abrir la guía, abrir el menú, elegir.
                                        Subió a la FILA (27-ago-2026) y son
                                        DOS. No se dejó una copia acá: el menú
                                        de la fila está a la vista mientras la
                                        guía está abierta, y dos puertas para
                                        lo mismo es lo que este módulo viene
                                        podando desde el 25-ago. */}
                                  </div>
                                  {/* Items table */}
                                  <ScrollableTable minWidth={600} className="mt-4">
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
                                            <td className="py-1.5 px-2">
                                              {/* El chip ya dice el nombre: repetirlo arriba es
                                                  el ruido que se vino a sacar. Sin chip con
                                                  nombre, el texto escrito es lo único que hay. */}
                                              {!nombreDelChip(item) && <span className="block">{item.cliente}</span>}
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
                                                      className="inline-flex items-center min-h-[44px] pr-3 text-xs text-emerald-700 hover:text-emerald-900 transition max-w-full"
                                                    >
                                                      <ChipCliente codigo={item.cliente_codigo} nombres={nombresPorCodigo} interactivo />
                                                    </button>
                                                  ) : (
                                                    <span className="inline-flex items-center text-xs text-emerald-700 max-w-full">
                                                      <ChipCliente codigo={item.cliente_codigo} nombres={nombresPorCodigo} />
                                                    </span>
                                                  )
                                                ) : puedeAtarCliente && item.id ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => onAtarCliente?.(item)}
                                                    className="inline-flex items-center min-h-[44px] pr-3 text-xs text-gray-400 hover:text-black underline underline-offset-2 transition"
                                                  >
                                                    Atar cliente
                                                  </button>
                                                ) : (
                                                  <span className="text-xs text-gray-300">sin atar</span>
                                                )}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.direccion}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.empresa}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.facturas}</td>
                                            <td className="py-1.5 px-2 text-center tabular-nums">{item.bultos}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </ScrollableTable>

                                  {/* Observaciones */}
                                  {expandedGuia.observaciones && (
                                    <p className="text-xs text-gray-500 mt-3 italic">{expandedGuia.observaciones}</p>
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
                                          <span className="font-medium">{expandedGuia.cedula || "—"}</span>
                                        </div>
                                      </div>
                                      {/* Signatures */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                        {expandedGuia.firma_base64 && (
                                          <div>
                                            <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                                              {esEntregaDirecta(expandedGuia) ? "Firma del chofer" : "Firma del transportista"}
                                            </span>
                                            <img src={expandedGuia.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                        {expandedGuia.firma_entregador_base64 && (
                                          <div>
                                            <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                                              {esEntregaDirecta(expandedGuia) ? "Firma del cliente" : "Firma del entregador"}
                                            </span>
                                            <img src={expandedGuia.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                      </div>
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
                    {_gg ? (
                      <div className="space-y-0">
                        {_gg.map((group) => (
                          <TimeGroupHeader key={group.key} label={group.label} count={group.items.length} color={group.color} bgColor={group.bgColor}>
                            <div className="space-y-1 p-1">{group.items.map(_rc)}</div>
                          </TimeGroupHeader>
                        ))}
                      </div>
                    ) : (
                      visible.map(_rc)
                    )}

                    {/* Ver más */}
                    {hasMore && (
                      <button onClick={() => setVisibleCount(c => c + 15)}
                        className="w-full py-4 text-base font-medium text-gray-700 hover:text-black hover:bg-gray-50 transition border-2 border-gray-300 rounded-lg mt-3 flex items-center justify-center gap-2">
                        <span>Ver más ({filtered.length - visibleCount} restantes)</span>
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
