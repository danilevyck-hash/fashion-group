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
  onDeleteReclamo: (id: string) => void;
}

type BulkAction = "zip";

export default function EmpresaList({
  activeEmpresa, reclamos, contactos, search, setSearch,
  filterEstado, setFilterEstado, selectionMode, setSelectionMode,
  selectedIds, setSelectedIds, sortCol, setSortCol, sortDir, setSortDir,
  onBack, onNewReclamo, onLoadDetail,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
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

  const allSelectableIds = sortedRecs.filter((r) => r.estado !== "Pagado").map((r) => r.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: string) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const empresaPath = encodeURIComponent(activeEmpresa);

  async function downloadBulkZip() {
    if (busy || selectedIds.length === 0) return;
    setBusy("zip");
    try {
      const res = await fetch(`/api/reclamos/proveedor/${empresaPath}/export-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: selectedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el ZIP.");
      }
      const omitidas = Number(res.headers.get("X-Fotos-Omitidas") || "0");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = activeEmpresa.replace(/[^A-Za-z0-9_-]+/g, "_");
      a.href = url;
      a.download = `Reclamos_${safe}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      const sizeMB = blob.size / (1024 * 1024);
      if (sizeMB > 25) {
        showToast(`ZIP de ${sizeMB.toFixed(0)}MB descargado. Es pesado para adjuntar en Outlook — considera seleccionar menos reclamos.`);
      } else if (omitidas > 0) {
        showToast(`ZIP descargado. ${omitidas} foto${omitidas === 1 ? "" : "s"} no se pudo incluir.`);
      } else {
        showToast(`ZIP descargado con ${selectedIds.length} reclamo${selectedIds.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el ZIP");
    } finally {
      setBusy(null);
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
                onClick={downloadBulkZip}
                disabled={busy !== null}
                title="Descargar Excel resumen + fotos comprimidas en un solo ZIP"
                className="text-sm border border-gray-200 px-4 py-2 rounded-md text-gray-500 hover:text-black transition disabled:opacity-50"
              >
                {busy === "zip" ? "Generando ZIP..." : "Descargar ZIP"}
              </button>
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
                {selectionMode ? "Salir" : "Seleccionar"}
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
                onClick={() => selectionMode ? (isOpen && toggleSelect(r.id)) : onLoadDetail(r.id)}
                className="border border-gray-200 rounded-lg p-4 active:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {selectionMode && (
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} disabled={!isOpen} className="accent-black disabled:opacity-50" />
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
            </tr>
          </thead>
          <tbody>
            {sortedRecs.map((r) => {
              const days = daysSince(r.fecha_reclamo);
              const total = calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL;
              const isOpen = r.estado !== "Pagado";
              return (
                <tr key={r.id}
                  onClick={() => selectionMode ? (isOpen && toggleSelect(r.id)) : onLoadDetail(r.id)}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                  {selectionMode && (
                    <td className="py-3">
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} disabled={!isOpen} className="accent-black disabled:opacity-50" />
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
        open={sendOpen}
        empresa={activeEmpresa}
        reclamoIds={selectedIds}
        defaultTo={c?.correo || ""}
        contactoNombre={c?.nombre_contacto || c?.nombre}
        count={selCount}
        onClose={() => setSendOpen(false)}
        onSent={(msg) => { showToast(msg); cancelSelection(); }}
      />
    </div>
  );
}
