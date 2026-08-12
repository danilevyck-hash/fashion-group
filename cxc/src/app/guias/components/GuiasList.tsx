"use client";

import { useState } from "react";
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary, destinosSummary } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge, AccordionContent, ScrollableTable } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";

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
  onEdit: (id: string) => void;
  onPrint: (id: string) => void;
  onDelete: (id: string) => void;
  onReject: (id: string, motivo: string) => void;
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
const REJECT_ROLES = ["admin", "secretaria"];

export default function GuiasList({
  guias, loading, error, search, setSearch,
  showPending, setShowPending, role,
  onNewGuia,
  expandedId, expandedGuia, expandedLoading, onToggleExpand,
  onEdit, onPrint, onDelete, onReject, onAtarCliente,
  nombresPorCodigo,
  readOnly,
}: GuiasListProps) {
  // Atar el cliente lo pueden hacer los mismos que despachan. NO depende del
  // estado de la guía: una guía Completada sigue estando cerrada a edición y
  // esto no la edita — ver `api/guias/[id]/cliente/route.ts`.
  const puedeAtarCliente = Boolean(onAtarCliente) && !readOnly && DESPACHO_ROLES.includes(role || "");
  const [visibleCount, setVisibleCount] = useState(15);
  const [groupedView, setGroupedView] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function printSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Open each in a new tab for printing
    ids.forEach(id => window.open(`/guias/${id}/imprimir`, '_blank'));
  }

  async function exportSelectedExcel() {
    if (selectedIds.size === 0) return;
    const { exportGuiasExcel } = await import("./excel-guias");
    const selected = guias.filter(g => selectedIds.has(g.id));
    exportGuiasExcel(selected, `${selected.length} guías seleccionadas`);
  }
  const canCreate = !readOnly && role && CREATE_ROLES.includes(role);
  const canDelete = !readOnly && role && DELETE_ROLES.includes(role);
  const canEdit = !readOnly && role && ["admin", "secretaria", "bodega"].includes(role);
  const canReject = !readOnly && role && REJECT_ROLES.includes(role);

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
                    <button onClick={printSelected} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 rounded-md active:bg-gray-100 transition-all inline-flex items-center justify-center min-h-[44px]">Imprimir todas</button>
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
                        const filtered = guias
                          .filter((g) => {
                            if (!search) return true;
                            const q = search.toLowerCase();
                            return (
                              (g.transportista || "").toLowerCase().includes(q) ||
                              (g.guia_items || []).some(
                                (item: GuiaItem) =>
                                  (item.facturas || "").toLowerCase().includes(q) ||
                                  (item.cliente || "").toLowerCase().includes(q),
                              )
                            );
                          })
                          .filter((g) => !showPending || g.estado === "Pendiente Bodega");
                        const subtitle = search
                          ? `Filtrado: "${search}"`
                          : showPending
                            ? "Pendientes de bodega"
                            : "Todas las gu\u00edas";
                        exportGuiasExcel(filtered, subtitle);
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
                  <input type="checkbox" checked={(() => { const ids = guias.filter(g => { if (!search) return true; const q = search.toLowerCase(); return (g.transportista || "").toLowerCase().includes(q) || (g.guia_items || []).some((item: GuiaItem) => (item.facturas || "").toLowerCase().includes(q) || (item.cliente || "").toLowerCase().includes(q)); }).filter(g => !showPending || g.estado === "Pendiente Bodega").map(g => g.id); return ids.length > 0 && ids.every(id => selectedIds.has(id)); })()} onChange={() => { const ids = guias.filter(g => { if (!search) return true; const q = search.toLowerCase(); return (g.transportista || "").toLowerCase().includes(q) || (g.guia_items || []).some((item: GuiaItem) => (item.facturas || "").toLowerCase().includes(q) || (item.cliente || "").toLowerCase().includes(q)); }).filter(g => !showPending || g.estado === "Pendiente Bodega").map(g => g.id); const allSel = ids.length > 0 && ids.every(id => selectedIds.has(id)); if (allSel) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(ids)); } }} className="accent-black" />
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
                const filtered = guias
                  .filter((g) => {
                    if (!search) return true;
                    const q = search.toLowerCase();
                    return (
                      // Número interno: matchea "45", "045" y "GT-045".
                      String(g.numero).includes(q) ||
                      `gt-${String(g.numero).padStart(3, "0")}`.includes(q) ||
                      (g.transportista || "").toLowerCase().includes(q) ||
                      (g.numero_guia_transp || "").toLowerCase().includes(q) ||
                      (g.guia_items || []).some(
                        (item: GuiaItem) =>
                          (item.facturas || "").toLowerCase().includes(q) ||
                          (item.cliente || "").toLowerCase().includes(q),
                      )
                    );
                  })
                  .filter((g) => !showPending || g.estado === "Pendiente Bodega");

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
                      const isDispatched = g.estado === "Completada" || g.estado === "Rechazada";

                      // Status-based left border color
                      const statusBorderClass = g.estado === "Completada"
                        ? "border-l-4 border-l-emerald-400"
                        : g.estado === "Rechazada"
                          ? "border-l-4 border-l-red-400"
                          : (g.estado === "Confirmada" || g.estado === "Despachada")
                            ? "border-l-4 border-l-blue-400"
                            : "border-l-4 border-l-amber-400";

                      const cardContent = (
                        <div className={`border rounded-lg transition-all ${statusBorderClass} ${isExpanded ? "border-gray-300" : "border-gray-200 hover:border-gray-200"}`}>
                          {/* Row header — desktop: inline row, mobile: stacked card */}
                          <button
                            onClick={() => selectionMode ? toggleSelect(g.id) : onToggleExpand(g.id)}
                            className="w-full text-left text-sm min-h-[44px]"
                          >
                            {/* Desktop layout (md+) */}
                            <div className="hidden md:flex items-center gap-4 px-4 py-3">
                              {selectionMode && (
                                <span onClick={(e) => { e.stopPropagation(); toggleSelect(g.id); }} className="shrink-0">
                                  <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} className="accent-black" />
                                </span>
                              )}
                              <span className="font-medium w-16 shrink-0 font-mono text-xs">{fmtGuia(g.numero)}</span>
                              <span className="text-gray-500 w-36 shrink-0 text-xs">{fmtDate(g.fecha)}</span>
                              <span className="flex-1 truncate">{g.transportista}</span>
                              <span className="text-gray-400 text-xs w-40 truncate">
                                {clientesSummary(g.guia_items || [])}
                              </span>
                              <span className="tabular-nums w-24 text-right shrink-0">
                                {g.total_bultos} <span className="text-gray-400">bultos</span>
                              </span>
                              <span className="w-24 shrink-0">
                                <StatusBadge estado={g.estado === "Rechazada" ? "rechazada" : isDispatched ? "despachada" : "pendiente"} />
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* Mobile layout (< md): stacked card with key info visible */}
                            <div className="md:hidden px-4 py-3">
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
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-gray-500 text-xs">{fmtDate(g.fecha)}</span>
                                <span className="tabular-nums text-xs text-gray-500">{g.total_bultos} bultos</span>
                                <span className="ml-auto">
                                  <StatusBadge estado={g.estado === "Rechazada" ? "rechazada" : isDispatched ? "despachada" : "pendiente"} />
                                </span>
                              </div>
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

                          {/* Expanded content */}
                          <AccordionContent open={isExpanded}>
                            <div className="px-4 pb-5 border-t border-gray-200">
                              {expandedLoading ? (
                                <div className="py-6 flex justify-center"><svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : expandedGuia ? (
                                <>
                                  {/* 🩸 QUÉ SE PUEDE TOCAR, DICHO EN LA CABECERA.
                                      Una guía Completada está cerrada: bultos, facturas,
                                      placa y firmas no se editan más (el candado del PUT
                                      sigue intacto). Pero el chip del cliente SÍ se toca, y
                                      eso, sin explicación, se lee como si el despacho entero
                                      fuera editable. Va acá arriba y UNA vez por guía — no
                                      por línea, que lo repetiría cinco veces. */}
                                  {isDispatched && puedeAtarCliente && (
                                    <p className="text-xs text-gray-500 pt-3">
                                      Solo se puede cambiar el cliente
                                    </p>
                                  )}

                                  {/* Acciones rápidas (header de la card expandida) */}
                                  {/* 🔴 UN SOLO BOTÓN para entrar a la guía.
                                      Acá vivía TAMBIÉN el formulario de despacho
                                      entero, desplegado más abajo en esta misma
                                      tarjeta: dos caminos para lo mismo. Daniel,
                                      textual: *"solo quiero una y en boton de
                                      editar para entrar a la guia y terminarla"*.
                                      "Editar" lleva a `/guias/[id]`, y ahí se
                                      corrige y se despacha. No agregar un botón
                                      "Despachar" al lado: eso es exactamente lo
                                      que se vino a sacar. */}
                                  <div className="flex items-center justify-end gap-3 pt-3">
                                    {canEdit && !isDispatched && (
                                      <button
                                        type="button"
                                        onClick={() => onEdit(expandedGuia.id)}
                                        className="inline-flex items-center justify-center gap-1.5 text-xs text-gray-700 hover:text-black transition px-3.5 rounded-md border border-gray-200 hover:bg-gray-100 min-h-[44px]"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 20h9" />
                                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                                        </svg>
                                        Editar
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => window.open(`/guias/${expandedGuia.id}/imprimir`, '_blank')}
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
                                    {(() => {
                                      const canRejectThis =
                                        canReject && isDispatched && expandedGuia.estado !== "Rechazada";
                                      const menuItems = [
                                        ...(canRejectThis
                                          ? [{ label: "Rechazar/Devolver", onClick: () => setRejectingId(expandedGuia.id) }]
                                          : []),
                                        ...(canDelete
                                          ? [{ label: "Eliminar guía", onClick: () => onDelete(expandedGuia.id), destructive: true }]
                                          : []),
                                      ];
                                      return menuItems.length > 0 ? <OverflowMenu items={menuItems} /> : null;
                                    })()}
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
                                                de 390 una columna más sería más arrastre. */}
                                            <td className="py-1.5 px-2">
                                              <span className="block">{item.cliente}</span>
                                              {/* La segunda línea SIEMPRE mide 44 px, esté atada
                                                  o no, para que las filas no queden desparejas
                                                  según el estado de cada una. */}
                                              <span className="flex items-center min-h-[44px]">
                                                {/* 🩸 El código YA PUESTO también se toca. Si el
                                                    chip fuera solo texto, una línea atada al
                                                    cliente equivocado no se podría corregir nunca
                                                    desde la pantalla — y hay una así en producción
                                                    (GT-183, atada a `111380`, que es de Boston). */}
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

                                  {/* Motivo de rechazo */}
                                  {expandedGuia.estado === "Rechazada" && expandedGuia.motivo_rechazo && (
                                    <div className="mt-3 rounded-md bg-red-50 border border-red-100 px-3 py-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-red-500">Motivo de rechazo</p>
                                      <p className="text-xs text-red-700 mt-0.5">{expandedGuia.motivo_rechazo}</p>
                                    </div>
                                  )}

                                  {/* Dispatched: read-only despacho data */}
                                  {isDispatched && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div>
                                          <span className="text-gray-400 block">Tipo</span>
                                          <span className="font-medium">{expandedGuia.tipo_despacho === "directo" ? "Entrega directa" : "Transportista externo"}</span>
                                        </div>
                                        {expandedGuia.placa && (
                                          <div>
                                            <span className="text-gray-400 block">Placa</span>
                                            <span className="font-medium">{expandedGuia.placa}</span>
                                          </div>
                                        )}
                                        {expandedGuia.tipo_despacho !== "directo" && (
                                          <div>
                                            <span className="text-gray-400 block">N° guía transp.</span>
                                            <span className="font-medium">{expandedGuia.numero_guia_transp || "—"}</span>
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
                                              {expandedGuia.tipo_despacho === "directo" ? "Firma del chofer" : "Firma del transportista"}
                                            </span>
                                            <img src={expandedGuia.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                        {expandedGuia.firma_entregador_base64 && (
                                          <div>
                                            <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                                              {expandedGuia.tipo_despacho === "directo" ? "Firma del cliente" : "Firma del entregador"}
                                            </span>
                                            <img src={expandedGuia.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Rechazar (solo en despachadas no-rechazadas) — queda abajo porque
                                      requiere flujo con input de motivo */}
                                  {/* Input de motivo de rechazo — se dispara desde "Rechazar/Devolver"
                                      en el menú "···". */}
                                  {canReject && isDispatched && expandedGuia.estado !== "Rechazada" && rejectingId === expandedGuia.id && (
                                    <div className="mt-6 pt-4 border-t border-gray-200">
                                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                        {/* text-base en móvil: con text-xs (12px) Safari hace zoom al enfocar. */}
                                        <input type="text" value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} placeholder="Motivo de rechazo..." className="border-b border-gray-200 py-2 text-base md:text-xs outline-none w-full max-w-[200px] min-h-[44px]" autoFocus />
                                        <button type="button" onClick={() => { if (rejectMotivo.trim()) { onReject(expandedGuia.id, rejectMotivo.trim()); setRejectingId(null); setRejectMotivo(""); } }} disabled={!rejectMotivo.trim()} className="text-xs text-red-600 hover:text-red-800 transition disabled:opacity-40 inline-flex items-center justify-center min-h-[44px] px-2 shrink-0">Confirmar</button>
                                        <button type="button" onClick={() => { setRejectingId(null); setRejectMotivo(""); }} className="text-xs text-gray-400 hover:text-black transition inline-flex items-center justify-center min-h-[44px] px-2 shrink-0">Cancelar</button>
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
