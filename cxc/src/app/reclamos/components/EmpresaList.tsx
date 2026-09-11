"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { mailtoHref } from "@/lib/contact-links";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Reclamo, Contacto } from "./types";
import { calcSub, reclamoTaxes, esPendiente, empresaKeyDeReclamo } from "./constants";
import { matchReclamo, matchHint } from "./search";
import { EmptyState, Toast } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import FotoBadge from "./FotoBadge";
import EnviarProveedorModal from "./EnviarProveedorModal";
import { facturasEnPantalla } from "@/lib/reclamos/facturas";
import { diasDesde } from "@/lib/reclamos/dias";
import { textoReclamado, estaReclamado } from "@/lib/reclamos/reclamado";
import {
  FALTA_FECHA_FACTURA,
  alTocarColumna,
  filtroDesdeUrl,
  filtrarPorEstado,
  flechaDeColumna,
  ordenAUrl,
  ordenDesdeUrl,
  ordenarReclamos,
  type ColumnaOrden,
  type FiltroEstado,
  type Orden,
} from "@/lib/reclamos/orden";

interface Props {
  role: string;
  activeEmpresa: string;
  reclamos: Reclamo[];
  contactos: Contacto[];
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onBack: () => void;
  onNewReclamo: () => void;
  onLoadDetail: (id: string) => void;
  /** Abre el detalle directamente en modo edición. */
  onEditReclamo: (id: string) => void;
  onDeleteReclamo: (id: string) => void;
  /** Borrado en lote de los seleccionados (admin). */
  onDeleteSelected: (ids: string[]) => void;
  /** Recarga los reclamos tras mandar el correo o descargar (para ver «Reclamado»). */
  onReload: () => void;
}

type Descarga = "excel" | "pdf";

const IconTrash = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * UN ENCABEZADO QUE ORDENA.
 *
 * La flecha sale de `flechaDeColumna`: SOLO la columna ordenada la lleva — una
 * flecha en las cinco no dice nada.
 *
 * ⚠️ Vive FUERA del componente de la página a propósito: definido adentro sería
 * un tipo de componente NUEVO en cada render, y React desmontaría y volvería a
 * montar los cinco encabezados cada vez que alguien toca uno.
 */
function Encabezado({
  columna,
  children,
  orden,
  onOrdenar,
  alineacion = "left",
  className = "",
}: {
  columna: ColumnaOrden;
  children: React.ReactNode;
  orden: Orden;
  onOrdenar: (c: ColumnaOrden) => void;
  alineacion?: "left" | "right";
  className?: string;
}) {
  const flecha = flechaDeColumna(orden, columna);
  const activa = orden.columna === columna;
  return (
    <th className={`pb-3 font-medium ${alineacion === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        aria-label={`Ordenar por ${String(children)}`}
        aria-sort={activa ? (orden.sentido === "asc" ? "ascending" : "descending") : "none"}
        className={`inline-flex items-center gap-1 uppercase tracking-widest transition hover:text-black ${activa ? "text-black" : ""}`}
      >
        {children}
        <span aria-hidden className="text-gray-400">{flecha}</span>
      </button>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA PÁGINA DE UNA EMPRESA (rediseño del 10-sep-2026, mockup aprobado).
//
// Abre en «Por cobrar N · $» (Daniel: *«los pipeline tener default los no
// pagados»*) con «Cobrados N» al lado; «En proceso» se fue de la pantalla
// (0 usos en 3 meses; el valor de la base cuenta como por cobrar). Orden: la
// FACTURA más vieja primero (*«viejo es factura, no creado»*); los que no
// tienen fecha van al final y lo dicen.
//
// Columnas: N° · Factura(s) · Días · Reclamado («Reclamado 17 jul 2026» o «Sin
// reclamar» en rojo) · Total · acciones. Tocar la fila abre el reclamo; en la
// fila quedan a la vista solo «Correo» y «Descargar», y el «···» lleva el
// papel, editar y borrar (el patrón de Guías). La fecha de creación se ve
// adentro, no en la tabla.
//
// 🔴 EL ARCHIVO Y EL CORREO SIN SELECCIÓN LLEVAN LO QUE SE ESTÁ MIRANDO, que
// por default es lo POR COBRAR: mandar un reclamo ya pagado es cobrarle dos
// veces al proveedor (medido: $5.306,62 en 5 reclamos, 24-ago-2026). Por eso
// «Correo» no se ofrece sobre los cobrados.
//
// Filtro y búsqueda viven en la URL (`useUrlState`, replace): se comparten por
// link y no ensucian el Atrás.
// ─────────────────────────────────────────────────────────────────────────────
export default function EmpresaList({
  role, activeEmpresa, reclamos, contactos,
  selectionMode, setSelectionMode, selectedIds, setSelectedIds,
  onBack, onNewReclamo, onLoadDetail, onEditReclamo, onDeleteReclamo, onDeleteSelected, onReload,
}: Props) {
  const isAdmin = role === "admin";
  const hoy = hoyPanama();
  const [filtroUrl, setFiltroUrl] = useUrlState("estado", "");
  const filtro: FiltroEstado = filtroDesdeUrl(filtroUrl);
  const [search, setSearch] = useUrlState("q", "");
  // 🔴 EL ORDEN LO ELIGE QUIEN MIRA (11-sep-2026). Daniel: *«reclamo debe ir
  // sort el más nuevo arriba para verlo, pero con opción de sort en todas las
  // columnas: más plata, más días, menos días, menos plata»*. Vive en la URL
  // (`replace`, mismo nivel): se comparte por link y no ensucia el Atrás.
  const [ordenUrl, setOrdenUrl] = useUrlState("orden", "");
  const orden = ordenDesdeUrl(ordenUrl);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<Descarga | null>(null);
  const [filaBusy, setFilaBusy] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [mailRec, setMailRec] = useState<Reclamo | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const allEmpresaRecs = reclamos.filter((r) => r.empresa === activeEmpresa);
  const porCobrar = filtrarPorEstado(allEmpresaRecs, "por-cobrar");
  const cobrados = filtrarPorEstado(allEmpresaRecs, "cobrados");
  const montoPorCobrar = porCobrar.reduce((s, r) => s + reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total, 0);
  const totalDe = (r: Reclamo) => reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total;
  const visibles = ordenarReclamos(
    filtrarPorEstado(allEmpresaRecs, filtro).filter((r) => !search || matchReclamo(r, search) !== null),
    orden,
    totalDe,
  );
  const ordenarPor = (columna: ColumnaOrden) => setOrdenUrl(ordenAUrl(alTocarColumna(orden, columna)));
  const c = contactos.find((ct) => ct.empresa === activeEmpresa) || null;
  const key = empresaKeyDeReclamo(activeEmpresa);
  const nombreCorto = key ? nombreCortoEmpresa(key) : activeEmpresa;
  const empresaPath = encodeURIComponent(activeEmpresa);

  const allSelected = visibles.length > 0 && visibles.every((r) => selectedIds.includes(r.id));
  const toggleSelect = (id: string) => setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const selCount = selectedIds.length;
  const hasSelection = selectionMode && selCount > 0;
  /** Lo que viaja en el archivo o el correo: la selección, o lo que se está mirando. */
  const idsObjetivo = hasSelection ? selectedIds : visibles.map((r) => r.id);
  const sufijo = filtro === "cobrados" ? "cobrados" : "pendientes";

  async function descargarLote(tipo: Descarga) {
    if (busy || idsObjetivo.length === 0) return;
    setBusy(tipo);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${empresaPath}/${tipo === "excel" ? "export-zip" : "export-pdf"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reclamo_ids: idsObjetivo }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error || "No se pudo armar el archivo. Intenta de nuevo."); }
      descargar(await res.blob(), `Reclamos-${sufijo}-${nombreCorto}-${hoy}.${tipo === "excel" ? "xlsx" : "pdf"}`);
      showToast(`${tipo === "excel" ? "Excel" : "PDF"} descargado — ${idsObjetivo.length} reclamo${idsObjetivo.length === 1 ? "" : "s"}`);
      onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo armar el archivo. Intenta de nuevo.");
    } finally { setBusy(null); }
  }

  // Descarga de UN reclamo desde la fila. El Excel es lo que se le manda al
  // proveedor; el PDF (el papel) va en el «···».
  async function descargarUno(r: Reclamo, tipo: Descarga) {
    if (filaBusy) return;
    setFilaBusy(r.id);
    try {
      const res = tipo === "excel"
        ? await fetch(`/api/reclamos/${r.id}/excel`)
        : await fetch(`/api/reclamos/proveedor/${empresaPath}/export-pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reclamo_ids: [r.id] }) });
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error || "No se pudo armar el archivo. Intenta de nuevo."); }
      const safe = (r.nro_reclamo || "reclamo").replace(/[^A-Za-z0-9_-]+/g, "_");
      descargar(await res.blob(), `Reclamo-${safe}.${tipo === "excel" ? "xlsx" : "pdf"}`);
      showToast(`${tipo === "excel" ? "Excel" : "PDF"} de ${r.nro_reclamo} descargado`);
      onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo armar el archivo. Intenta de nuevo.");
    } finally { setFilaBusy(null); }
  }

  function cancelSelection() { setSelectionMode(false); setSelectedIds([]); }

  const pill = "inline-flex min-h-[44px] items-center justify-center text-xs px-3 rounded-full transition";
  const accion = "inline-flex min-h-[44px] items-center justify-center text-xs font-medium border border-gray-200 rounded-md px-3 text-gray-600 hover:text-black hover:border-gray-400 transition disabled:opacity-40";

  function celdaDias(r: Reclamo) {
    const d = diasDesde(r.fecha_factura, hoy);
    if (d === null) return <span className="text-xs text-red-600">{FALTA_FECHA_FACTURA}</span>;
    return <span className="tabular-nums">{d}</span>;
  }
  function celdaReclamado(r: Reclamo) {
    if (!esPendiente(r)) return <span className="text-gray-400">Cobrado</span>;
    const sin = !estaReclamado(r);
    return <span className={sin ? "text-red-600 font-medium" : "text-gray-500"}>{textoReclamado(r)}</span>;
  }
  const acciones = (r: Reclamo) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {/* 🔴 «CORREO» NO SE OFRECE SOBRE UN RECLAMO YA COBRADO (11-sep-2026).
          🩸 La invariante de arriba lo dice desde el 10-sep —mandar un reclamo
          pagado es cobrarle dos veces al proveedor, medido: $5.306,62 en 5
          reclamos— y el botón de LOTE sí tenía el candado (`filtro ===
          "por-cobrar"`) y el detalle también; la FILA no. Desde el chip
          «Cobrados» cualquier fila abría el modal con «Adjuntamos 1 reclamo
          pendiente…» y lo mandaba. El servidor ahora también lo rechaza. */}
      {esPendiente(r) && (
        <button type="button" onClick={() => setMailRec(r)} className={accion} aria-label={`Mandar por correo el reclamo ${r.nro_reclamo}`}>Correo</button>
      )}
      <button type="button" onClick={() => descargarUno(r, "excel")} disabled={filaBusy !== null} className={accion} aria-label={`Descargar el Excel del reclamo ${r.nro_reclamo}`}>{filaBusy === r.id ? "…" : "Descargar"}</button>
      <OverflowMenu
        ariaLabel={`Más opciones del reclamo ${r.nro_reclamo}`}
        items={[
          { label: "Descargar el PDF", onClick: () => { void descargarUno(r, "pdf"); } },
          { label: "Editar", onClick: () => onEditReclamo(r.id) },
          ...(isAdmin ? [{ label: "Eliminar", onClick: () => onDeleteReclamo(r.id), destructive: true }] : []),
        ]}
      />
    </div>
  );

  return (
    <div>
      <AppHeader module="Reclamos" breadcrumbs={[{ label: nombreCorto }]} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div className="mb-4">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center text-sm text-gray-400 hover:text-black transition">← Reclamos</button>
      </div>

      <div className="flex items-end justify-between mb-4 sm:mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light tracking-tight">{nombreCorto}</h1>
          {c && <p className="text-sm text-gray-500 mt-1">{c.nombre_contacto || c.nombre || "Contacto"} · {mailtoHref(c.correo) ? <a href={mailtoHref(c.correo)!} className="text-blue-600 hover:underline">{c.correo}</a> : c.correo}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectionMode && <span className="text-sm text-gray-500">{selCount > 0 ? `${selCount} seleccionado${selCount === 1 ? "" : "s"}` : "Selecciona reclamos…"}</span>}
          {/* Correo y descargas: sobre la selección, o sobre lo que se está mirando. */}
          {filtro === "por-cobrar" && idsObjetivo.length > 0 && (
            <button onClick={() => setSendOpen(true)} disabled={busy !== null} className={accion} aria-label="Mandar por correo al proveedor">Correo</button>
          )}
          {idsObjetivo.length > 0 && (
            <>
              <button onClick={() => descargarLote("excel")} disabled={busy !== null} className={accion}>{busy === "excel" ? "Armando el Excel…" : "Descargar Excel"}</button>
              <button onClick={() => descargarLote("pdf")} disabled={busy !== null} className={accion}>{busy === "pdf" ? "Armando el PDF…" : "Descargar PDF"}</button>
            </>
          )}
          {hasSelection && isAdmin && (
            <button onClick={() => onDeleteSelected(selectedIds)} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-1.5 text-xs border border-red-200 text-red-600 px-3 rounded-md hover:bg-red-50 transition disabled:opacity-50">{IconTrash} Eliminar seleccionados</button>
          )}
          <button
            onClick={() => (selectionMode ? cancelSelection() : (setSelectionMode(true), setSelectedIds([])))}
            className={`inline-flex min-h-[44px] items-center justify-center text-sm border px-4 rounded-md transition ${selectionMode ? "border-black text-black bg-gray-50" : "border-gray-200 text-gray-400 hover:text-black"}`}
          >
            {selectionMode ? "Cancelar" : "Seleccionar"}
          </button>
          {!selectionMode && (
            <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo Reclamo</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setFiltroUrl("")} aria-pressed={filtro === "por-cobrar"} className={`${pill} ${filtro === "por-cobrar" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
          Por cobrar <span className="ml-1 opacity-70 tabular-nums">{porCobrar.length} · ${fmt(montoPorCobrar)}</span>
        </button>
        <button onClick={() => setFiltroUrl("cobrados")} aria-pressed={filtro === "cobrados"} className={`${pill} ${filtro === "cobrados" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
          Cobrados <span className="ml-1 opacity-70 tabular-nums">{cobrados.length}</span>
        </button>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por N° reclamo, factura o estilo…" aria-label="Buscar" className="min-h-[44px] border-b border-gray-200 text-base sm:text-sm outline-none w-full sm:w-64 sm:ml-2" />
      </div>

      {visibles.length === 0 ? (() => {
        if (search) return <div className="py-12 text-center text-sm text-gray-400">No encontramos reclamos para &quot;{search}&quot;</div>;
        if (allEmpresaRecs.length === 0) return <EmptyState title="Todavía sin reclamos" />;
        if (filtro === "por-cobrar") return (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">Nada por cobrar a {nombreCorto}</p>
            <p className="text-sm text-emerald-600">{cobrados.length} reclamo{cobrados.length === 1 ? "" : "s"} cobrado{cobrados.length === 1 ? "" : "s"}</p>
          </div>
        );
        return <div className="py-12 text-center text-sm text-gray-400">Todavía no se cobró ninguno</div>;
      })() : (
        <>
          {/* Celular e iPad vertical (por debajo de lg): una tarjeta por reclamo. */}
          <div className="lg:hidden space-y-2 mb-4" data-vista="tarjetas">
            {selectionMode && (
              <button onClick={() => (allSelected ? setSelectedIds([]) : setSelectedIds(visibles.map((r) => r.id)))} className="text-sm text-gray-500 hover:text-black min-h-[44px] px-2 -mx-2">{allSelected ? "Quitar la selección" : `Seleccionar los ${visibles.length}`}</button>
            )}
            {visibles.map((r) => {
              const total = totalDe(r);
              const d = diasDesde(r.fecha_factura, hoy);
              return (
                <div key={r.id} onClick={() => (selectionMode ? toggleSelect(r.id) : onLoadDetail(r.id))} className="border border-gray-200 rounded-lg p-4 active:bg-gray-50 transition cursor-pointer">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {selectionMode && <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-black mt-1" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">{r.nro_reclamo}<FotoBadge count={r.reclamo_fotos?.length ?? 0} /></p>
                        <p className="text-sm text-gray-500 tabular-nums break-words">{facturasEnPantalla(r.nro_factura) || "—"}</p>
                        {search && matchHint(r, matchReclamo(r, search)) && <p className="text-xs text-gray-400 mt-0.5">{matchHint(r, matchReclamo(r, search))}</p>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">${fmt(total)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-500">{d === null ? <span className="text-red-600">{FALTA_FECHA_FACTURA}</span> : `${d} día${d === 1 ? "" : "s"}`}</span>
                    {celdaReclamado(r)}
                  </div>
                  {!selectionMode && <div className="mt-3 pt-3 border-t border-gray-100">{acciones(r)}</div>}
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto -mx-4 lg:mx-0 hidden lg:block" data-vista="tabla">
            <div className="min-w-[600px] px-4 sm:px-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                    {selectionMode && <th className="pb-3 w-8"><input type="checkbox" checked={allSelected} onChange={() => (allSelected ? setSelectedIds([]) : setSelectedIds(visibles.map((r) => r.id)))} className="accent-black" title="Seleccionar todos los visibles" /></th>}
                    <Encabezado columna="numero" orden={orden} onOrdenar={ordenarPor}>N° Reclamo</Encabezado>
                    <Encabezado columna="factura" orden={orden} onOrdenar={ordenarPor}>Factura(s)</Encabezado>
                    <Encabezado columna="dias" alineacion="right" orden={orden} onOrdenar={ordenarPor}>Días</Encabezado>
                    <Encabezado columna="reclamado" className="pl-4" orden={orden} onOrdenar={ordenarPor}>Reclamado</Encabezado>
                    <Encabezado columna="total" alineacion="right" orden={orden} onOrdenar={ordenarPor}>Total</Encabezado>
                    {!selectionMode && <th className="pb-3 text-right font-medium"><span className="sr-only">Acciones</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => {
                    const total = totalDe(r);
                    return (
                      <tr key={r.id} onClick={() => (selectionMode ? toggleSelect(r.id) : onLoadDetail(r.id))} className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                        {selectionMode && <td className="py-3"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-black" /></td>}
                        <td className="py-3 font-medium">
                          <span className="inline-flex items-center gap-1.5">{r.nro_reclamo}<FotoBadge count={r.reclamo_fotos?.length ?? 0} /></span>
                          {search && matchHint(r, matchReclamo(r, search)) && <span className="block font-normal text-xs text-gray-400 mt-0.5">{matchHint(r, matchReclamo(r, search))}</span>}
                        </td>
                        <td className="py-3 text-gray-500 tabular-nums">{facturasEnPantalla(r.nro_factura) || "—"}</td>
                        <td className="py-3 text-right text-gray-600">{celdaDias(r)}</td>
                        <td className="py-3 pl-4">{celdaReclamado(r)}</td>
                        <td className="py-3 text-right tabular-nums">${fmt(total)}</td>
                        {!selectionMode && <td className="py-2 text-right">{acciones(r)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Toast message={toast} />
      </div>

      <EnviarProveedorModal
        open={sendOpen || mailRec !== null}
        empresa={activeEmpresa}
        reclamoIds={mailRec ? [mailRec.id] : idsObjetivo}
        defaultTo={c?.correo || ""}
        contactoNombre={c?.nombre_contacto || c?.nombre}
        count={mailRec ? 1 : idsObjetivo.length}
        defaultSubject={mailRec ? `Reclamo ${mailRec.nro_reclamo} — ${activeEmpresa}` : undefined}
        onClose={() => { setSendOpen(false); setMailRec(null); }}
        onSent={(msg) => { showToast(msg); if (mailRec) setMailRec(null); else cancelSelection(); onReload(); }}
      />
    </div>
  );
}
