"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { mailtoHref } from "@/lib/contact-links";
import { Reclamo, Contacto } from "./types";
import { ESTADOS, daysSince, calcSub, FACTOR_TOTAL, estadoLabel } from "./constants";
import { EmptyState, StatusBadge, Toast } from "@/components/ui";
import FotoBadge from "./FotoBadge";
import EnviarProveedorModal from "./EnviarProveedorModal";

interface Props {
  role: string;
  activeEmpresa: string;
  reclamos: Reclamo[];
  contactos: Contacto[];
  search: string;
  setSearch: (v: string) => void;
  filterEstado: string;
  setFilterEstado: (v: string) => void;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  sortCol: "fecha" | "dias" | "total" | "estado";
  setSortCol: (v: "fecha" | "dias" | "total" | "estado") => void;
  sortDir: "asc" | "desc";
  setSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  onBack: () => void;
  onNewReclamo: () => void;
  onLoadDetail: (id: string) => void;
  /** Abre el detalle directamente en modo edición. */
  onEditReclamo: (id: string) => void;
  onDeleteReclamo: (id: string) => void;
  /** Borrado en lote de los seleccionados (admin). */
  onDeleteSelected: (ids: string[]) => void;
  /** Recarga los reclamos tras enviar el correo (el envío no cambia el estado). */
  onReload: () => void;
}

type BulkAction = "excel";

// Íconos de acción por fila — discretos, hover. stroke currentColor para heredar color.
const IconMail = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);
const IconPencil = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
);
const IconTrash = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);
const IconDownload = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const IconSpinner = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" /><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);

export default function EmpresaList({
  role, activeEmpresa, reclamos, contactos, search, setSearch,
  filterEstado, setFilterEstado, selectionMode, setSelectionMode,
  selectedIds, setSelectedIds, sortCol, setSortCol, sortDir, setSortDir,
  onBack, onNewReclamo, onLoadDetail, onEditReclamo, onDeleteReclamo, onDeleteSelected, onReload,
}: Props) {
  const isAdmin = role === "admin";
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  // Envío de UN solo reclamo desde el botón de mail de la fila (independiente del
  // envío en lote por selección). Guarda el reclamo objetivo; null = modal cerrado.
  const [mailRec, setMailRec] = useState<Reclamo | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const allEmpresaRecs = reclamos.filter((r) => r.empresa === activeEmpresa);
  const empresaRecs = allEmpresaRecs.filter((r) => {
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.nro_reclamo || "").toLowerCase().includes(q) && !(r.nro_factura || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const c = contactos.find((ct) => ct.empresa === activeEmpresa) || null;

  const sortedRecs = [...empresaRecs].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    if (sortCol === "fecha") { av = a.fecha_reclamo || ""; bv = b.fecha_reclamo || ""; }
    if (sortCol === "dias") { av = daysSince(a.fecha_reclamo); bv = daysSince(b.fecha_reclamo); }
    if (sortCol === "total") { av = calcSub(a.reclamo_items ?? []) * FACTOR_TOTAL; bv = calcSub(b.reclamo_items ?? []) * FACTOR_TOTAL; }
    if (sortCol === "estado") { av = ESTADOS.indexOf(a.estado); bv = ESTADOS.indexOf(b.estado); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Selección para enviar/Excel y borrar → TODOS los reclamos son seleccionables
  // (antes solo "Creado"; se quitó la restricción porque ahora también borra).
  const allSelectableIds = sortedRecs.map((r) => r.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: string) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const empresaPath = encodeURIComponent(activeEmpresa);

  async function downloadBulkExcel() {
    if (busy || selectedIds.length === 0) return;
    setBusy("excel");
    try {
      const res = await fetch(`/api/reclamos/proveedor/${empresaPath}/export-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: selectedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el Excel.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = activeEmpresa.replace(/[^A-Za-z0-9_-]+/g, "_");
      a.href = url;
      a.download = `Reclamos_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Excel descargado con ${selectedIds.length} reclamo${selectedIds.length === 1 ? "" : "s"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el Excel");
    } finally {
      setBusy(null);
    }
  }

  // Descarga directa del Excel de UN reclamo (1 clic, sin abrir el detalle).
  // Reusa el endpoint single [id]/excel → con 1 reclamo el Excel no lleva tab
  // Resumen, solo la hoja del reclamo (con sus links de factura/fotos web).
  async function downloadSingleExcel(r: Reclamo) {
    if (downloadingId) return;
    setDownloadingId(r.id);
    try {
      const res = await fetch(`/api/reclamos/${r.id}/excel`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el Excel.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (r.nro_reclamo || "reclamo").replace(/[^A-Za-z0-9_-]+/g, "_");
      a.href = url;
      a.download = `Reclamo-${safe}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Excel de ${r.nro_reclamo} descargado`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el Excel");
    } finally {
      setDownloadingId(null);
    }
  }

  function cancelSelection() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  const selCount = selectedIds.length;
  const hasSelection = selectionMode && selCount > 0;

  return (
    <div>
      <AppHeader
        module="Reclamos a Proveedores"
        breadcrumbs={[{ label: activeEmpresa }]}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div className="mb-4">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-black transition">← Reclamos</button>
      </div>

      <div className="flex items-end justify-between mb-4 sm:mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light tracking-tight">{activeEmpresa}</h1>
          {c && <p className="text-xs text-gray-400 mt-1">Contacto: {(c.nombre_contacto || c.nombre || "equipo")} | {mailtoHref(c.correo) ? <a href={mailtoHref(c.correo)!} className="text-blue-600 hover:underline">{c.correo}</a> : c.correo}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hasSelection ? (
            <>
              <span className="text-sm text-gray-500">
                {selCount} seleccionado{selCount === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => setSendOpen(true)}
                disabled={busy !== null}
                title="Enviar por correo al proveedor el Excel resumen + fotos"
                className="text-sm bg-black text-white px-5 py-2 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                Enviar al proveedor
              </button>
              <button
                onClick={downloadBulkExcel}
                disabled={busy !== null}
                title="Descargar Excel con links a las facturas y fotos (abren con un clic)"
                className="text-sm border border-gray-200 px-4 py-2 rounded-md text-gray-500 hover:text-black transition disabled:opacity-50"
              >
                {busy === "excel" ? "Generando Excel..." : "Descargar Excel"}
              </button>
              {isAdmin && (
                <button
                  onClick={() => onDeleteSelected(selectedIds)}
                  disabled={busy !== null}
                  title="Eliminar los reclamos seleccionados"
                  className="text-sm border border-red-200 text-red-600 px-4 py-2 rounded-md hover:bg-red-50 active:scale-[0.97] transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {IconTrash}
                  Eliminar seleccionados
                </button>
              )}
              <button
                onClick={cancelSelection}
                disabled={busy !== null}
                className="text-sm border border-gray-200 px-4 py-2 rounded-md text-gray-400 hover:text-black transition disabled:opacity-40"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              {selectionMode && (
                <span className="text-sm text-gray-400">Selecciona reclamos…</span>
              )}
              <button
                onClick={() => { setSelectionMode(!selectionMode); setSelectedIds([]); }}
                className={`text-sm border px-4 py-2 rounded-md transition ${selectionMode ? "border-black text-black bg-gray-50" : "border-gray-200 text-gray-400 hover:text-black"}`}
              >
                {selectionMode ? "Cancelar" : "Seleccionar"}
              </button>
              <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo Reclamo</button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilterEstado("all")} className={`text-xs px-3 py-1 rounded-full transition ${filterEstado === "all" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
          Todos <span className="ml-1 opacity-60">{allEmpresaRecs.length}</span>
        </button>
        {ESTADOS.map((e) => {
          const count = allEmpresaRecs.filter((r) => r.estado === e).length;
          return (
            <button key={e} onClick={() => setFilterEstado(e)} className={`text-xs px-3 py-1 rounded-full transition ${filterEstado === e ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {estadoLabel(e)} <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-6">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="border-b border-gray-200 py-3 sm:py-2 text-base sm:text-sm outline-none w-full max-w-xs" />
      </div>

      {/* Mobile card list — visible on small screens only */}
      {sortedRecs.length > 0 && (
        <div className="sm:hidden space-y-2 mb-4">
          {sortedRecs.map((r) => {
            const days = daysSince(r.fecha_reclamo);
            const total = calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL;
            const isOpen = r.estado !== "Pagado";
            return (
              <div
                key={r.id}
                onClick={() => selectionMode ? toggleSelect(r.id) : onLoadDetail(r.id)}
                className="border border-gray-200 rounded-lg p-4 active:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {selectionMode && (
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-black" />
                    )}
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {r.nro_reclamo}
                        <FotoBadge count={r.reclamo_fotos?.length ?? 0} />
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.nro_factura}</p>
                    </div>
                  </div>
                  <StatusBadge estado={r.estado} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{fmtDate(r.fecha_reclamo)}</span>
                    <span className={`tabular-nums ${days > 60 && isOpen ? "text-red-600 font-medium" : days > 30 && isOpen ? "text-amber-600" : ""}`}>{days}d</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">${fmt(total)}</span>
                </div>
                {!selectionMode && (
                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setMailRec(r)} title="Enviar al proveedor" aria-label="Enviar al proveedor" className="p-2 text-gray-400 hover:text-black rounded-md transition active:bg-gray-100">{IconMail}</button>
                    <button onClick={() => downloadSingleExcel(r)} disabled={downloadingId !== null} title="Descargar Excel" aria-label="Descargar Excel" className="p-2 text-gray-400 hover:text-black rounded-md transition active:bg-gray-100 disabled:opacity-40">{downloadingId === r.id ? IconSpinner : IconDownload}</button>
                    <button onClick={() => onEditReclamo(r.id)} title="Editar" aria-label="Editar" className="p-2 text-gray-400 hover:text-black rounded-md transition active:bg-gray-100">{IconPencil}</button>
                    {isAdmin && (
                      <button onClick={() => onDeleteReclamo(r.id)} title="Eliminar" aria-label="Eliminar" className="p-2 text-gray-400 hover:text-red-600 rounded-md transition active:bg-red-50">{IconTrash}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sortedRecs.length === 0 ? (() => {
        const openCount = allEmpresaRecs.filter(r => r.estado !== "Pagado").length;
        if (allEmpresaRecs.length > 0 && openCount === 0 && filterEstado === "all" && !search) {
          return (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">No hay reclamos abiertos para {activeEmpresa}</p>
              <p className="text-xs text-emerald-600">Todo al dia — {allEmpresaRecs.length} reclamo{allEmpresaRecs.length > 1 ? "s" : ""} resuelto{allEmpresaRecs.length > 1 ? "s" : ""}</p>
            </div>
          );
        }
        if (allEmpresaRecs.length > 0) {
          return (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-sm text-gray-400 mb-1">
                {search ? `No encontramos reclamos para "${search}"` : `No hay reclamos ${filterEstado !== "all" ? estadoLabel(filterEstado).toLowerCase() : ""} para esta empresa`}
              </p>
              <p className="text-xs text-gray-300">{search ? "Intenta con otro termino" : "Prueba con otro filtro"}</p>
            </div>
          );
        }
        return <EmptyState title="Sin reclamos" subtitle="No hay reclamos registrados para esta empresa" />;
      })() : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 hidden sm:block">
          <div className="min-w-[600px] px-4 sm:px-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
              {selectionMode && <th className="pb-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={() => allSelected ? setSelectedIds([]) : setSelectedIds(allSelectableIds)} className="accent-black" title="Seleccionar todos los visibles" />
              </th>}
              <th className="text-left pb-3 font-medium">N° Reclamo</th>
              <th className="text-left pb-3 font-medium">Factura</th>
              <th onClick={() => toggleSort("fecha")} className="text-left pb-3 font-medium cursor-pointer hover:text-black select-none">Fecha {sortCol === "fecha" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("dias")} className="text-right pb-3 font-medium cursor-pointer hover:text-black select-none">Antigüedad {sortCol === "dias" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("estado")} className="text-left pb-3 font-medium cursor-pointer hover:text-black select-none">Estado {sortCol === "estado" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("total")} className="text-right pb-3 font-medium cursor-pointer hover:text-black select-none">Total {sortCol === "total" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              {!selectionMode && <th className="pb-3 text-right font-medium"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {sortedRecs.map((r) => {
              const days = daysSince(r.fecha_reclamo);
              const total = calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL;
              const isOpen = r.estado !== "Pagado";
              return (
                <tr key={r.id}
                  onClick={() => selectionMode ? toggleSelect(r.id) : onLoadDetail(r.id)}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                  {selectionMode && (
                    <td className="py-3">
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-black" />
                    </td>
                  )}
                  <td className="py-3 font-medium text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      {r.nro_reclamo}
                      <FotoBadge count={r.reclamo_fotos?.length ?? 0} />
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{r.nro_factura}</td>
                  <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                  <td className={`py-3 text-right tabular-nums ${days > 60 && isOpen ? "text-red-600 font-medium" : days > 30 && isOpen ? "text-amber-600" : "text-gray-400"}`}>{days}d</td>
                  <td className="py-3"><StatusBadge estado={r.estado} /></td>
                  <td className="py-3 text-right tabular-nums">${fmt(total)}</td>
                  {!selectionMode && (
                    <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => setMailRec(r)} title="Enviar al proveedor" aria-label="Enviar al proveedor" className="p-1.5 text-gray-400 hover:text-black rounded transition">{IconMail}</button>
                        <button onClick={() => downloadSingleExcel(r)} disabled={downloadingId !== null} title="Descargar Excel" aria-label="Descargar Excel" className="p-1.5 text-gray-400 hover:text-black rounded transition disabled:opacity-40">{downloadingId === r.id ? IconSpinner : IconDownload}</button>
                        <button onClick={() => onEditReclamo(r.id)} title="Editar" aria-label="Editar" className="p-1.5 text-gray-400 hover:text-black rounded transition">{IconPencil}</button>
                        {isAdmin && (
                          <button onClick={() => onDeleteReclamo(r.id)} title="Eliminar" aria-label="Eliminar" className="p-1.5 text-gray-400 hover:text-red-600 rounded transition">{IconTrash}</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </div>
      )}

      <Toast message={toast} />
      </div>

      <EnviarProveedorModal
        open={sendOpen || mailRec !== null}
        empresa={activeEmpresa}
        reclamoIds={mailRec ? [mailRec.id] : selectedIds}
        defaultTo={c?.correo || ""}
        contactoNombre={c?.nombre_contacto || c?.nombre}
        count={mailRec ? 1 : selCount}
        defaultSubject={mailRec ? `Reclamo ${mailRec.nro_reclamo} — ${activeEmpresa}` : undefined}
        onClose={() => { setSendOpen(false); setMailRec(null); }}
        onSent={(msg) => {
          showToast(msg);
          if (mailRec) setMailRec(null);
          else cancelSelection();
          onReload();
        }}
      />
    </div>
  );
}
