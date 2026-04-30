"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { Reclamo, Contacto } from "./types";
import { ESTADOS, daysSince, calcSub, FACTOR_TOTAL, estadoLabel } from "./constants";
import { EmptyState, StatusBadge, Toast } from "@/components/ui";

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

type BulkAction = "pdf" | "email" | "whatsapp";

export default function EmpresaList({
  activeEmpresa, reclamos, contactos, search, setSearch,
  filterEstado, setFilterEstado, selectionMode, setSelectionMode,
  selectedIds, setSelectedIds, sortCol, setSortCol, sortDir, setSortDir,
  onBack, onNewReclamo, onLoadDetail,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<BulkAction | null>(null);
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

  const allSelectableIds = sortedRecs.filter((r) => r.estado !== "Aplicado" && r.estado !== "Rechazado").map((r) => r.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: string) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const visibleIds = sortedRecs.map((r) => r.id);
  const empresaPath = encodeURIComponent(activeEmpresa);

  function buildBulkBody(ids: string[]) {
    if (ids.length > 0) return { reclamo_ids: ids };
    return { all_with_filter: { tab: filterEstado, search } };
  }

  async function downloadBulkPdf(ids: string[]) {
    if (busy) return;
    if (ids.length === 0 && sortedRecs.length === 0) {
      showToast("No hay reclamos para descargar.");
      return;
    }
    setBusy("pdf");
    try {
      const res = await fetch(`/api/reclamos/proveedor/${empresaPath}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBulkBody(ids)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = activeEmpresa.replace(/[^A-Za-z0-9_-]+/g, "_");
      a.href = url;
      a.download = `Reclamos_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF descargado");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al descargar PDF");
    } finally {
      setBusy(null);
    }
  }

  async function sendBulkEmail(ids: string[], opts?: { silent?: boolean }) {
    if (busy && !opts?.silent) return null;
    if (!c?.correo) {
      if (!opts?.silent) showToast(`No hay correo configurado para ${activeEmpresa}.`);
      return false;
    }
    if (ids.length === 0 && sortedRecs.length === 0) {
      if (!opts?.silent) showToast("No hay reclamos para enviar.");
      return false;
    }
    if (!opts?.silent) setBusy("email");
    try {
      const res = await fetch(`/api/reclamos/proveedor/${empresaPath}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBulkBody(ids)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al enviar correo.");
      }
      if (!opts?.silent) showToast(`Email enviado a ${c.correo}`);
      return true;
    } catch (err) {
      if (!opts?.silent) showToast(err instanceof Error ? err.message : "Error al enviar correo");
      return false;
    } finally {
      if (!opts?.silent) setBusy(null);
    }
  }

  async function sendBulkWhatsApp(ids: string[]) {
    if (busy) return;
    if (!c?.whatsapp) {
      showToast(`No hay WhatsApp configurado para ${activeEmpresa}.`);
      return;
    }
    const targetIds = ids.length > 0 ? ids : visibleIds;
    const sel = reclamos.filter((r) => targetIds.includes(r.id));
    if (!sel.length) {
      showToast("No hay reclamos para enviar.");
      return;
    }
    const grandTotal = sel.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL, 0);
    const nombre = c.nombre_contacto || c.nombre || "equipo";
    const msg = `Hola ${nombre}, te envío ${sel.length} reclamo${sel.length === 1 ? "" : "s"} pendiente${sel.length === 1 ? "" : "s"} con un total de $${fmt(grandTotal)}. Detalle adjunto en email.`;
    const waUrl = `https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;

    setBusy("whatsapp");
    try {
      window.open(waUrl, "_blank");
      const ok = await sendBulkEmail(ids, { silent: true });
      showToast(ok ? "Email enviado y abriendo WhatsApp..." : "WhatsApp abierto. El email no se pudo enviar.");
    } finally {
      setBusy(null);
    }
  }

  const selCount = selectedIds.length;
  const headerDisabled = busy !== null;
  const headerEmptyVisible = sortedRecs.length === 0;

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
          {c && <p className="text-xs text-gray-400 mt-1">Contacto: {(c.nombre_contacto || c.nombre || "equipo")} | {c.correo}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setSelectionMode(true); setSelectedIds([]); }} disabled={selectionMode} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md transition disabled:opacity-40">Seleccionar</button>
          <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo Reclamo</button>
        </div>
      </div>

      {/* Header bulk actions — apply to all visible reclamos */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest text-gray-400 mr-1">Acciones sobre lo visible</span>
        <button
          onClick={() => sendBulkEmail([])}
          disabled={headerDisabled || headerEmptyVisible || !c?.correo}
          title={!c?.correo ? "No hay correo configurado para esta empresa" : `Enviar ${sortedRecs.length} reclamo(s) por email`}
          className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:border-gray-200 flex items-center gap-1"
        >
          {busy === "email" ? "Enviando..." : `Email todos (${sortedRecs.length})`}
        </button>
        <button
          onClick={() => sendBulkWhatsApp([])}
          disabled={headerDisabled || headerEmptyVisible || !c?.whatsapp}
          title={!c?.whatsapp ? "No hay WhatsApp configurado para esta empresa" : `Enviar ${sortedRecs.length} reclamo(s) por WhatsApp + email`}
          className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:border-gray-200 flex items-center gap-1"
        >
          {busy === "whatsapp" ? "Abriendo..." : `WhatsApp todos (${sortedRecs.length})`}
        </button>
        <button
          onClick={() => downloadBulkPdf([])}
          disabled={headerDisabled || headerEmptyVisible}
          title={`Descargar ${sortedRecs.length} reclamo(s) en PDF`}
          className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:border-gray-200 flex items-center gap-1"
        >
          {busy === "pdf" ? "Generando..." : `PDF todos (${sortedRecs.length})`}
        </button>
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
            const isOpen = r.estado !== "Aplicado" && r.estado !== "Rechazado";
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
                      <p className="text-sm font-medium">{r.nro_reclamo}</p>
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
        const openCount = allEmpresaRecs.filter(r => r.estado !== "Aplicado" && r.estado !== "Rechazado").length;
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
                <input type="checkbox" checked={allSelected} onChange={() => allSelected ? setSelectedIds([]) : setSelectedIds(allSelectableIds)} className="accent-black" title="Seleccionar todos" />
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
              const isOpen = r.estado !== "Aplicado" && r.estado !== "Rechazado";
              return (
                <tr key={r.id}
                  onClick={() => selectionMode ? (isOpen && toggleSelect(r.id)) : onLoadDetail(r.id)}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                  {selectionMode && (
                    <td className="py-3">
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} disabled={!isOpen} className="accent-black disabled:opacity-50" />
                    </td>
                  )}
                  <td className="py-3 font-medium text-xs">{r.nro_reclamo}</td>
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

      {/* Floating selection bar — only when in selection mode */}
      {selectionMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100vw-2rem)] max-w-3xl">
          <div className="bg-black text-white rounded-xl shadow-2xl border border-gray-800 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {selCount === 0 ? "Selecciona reclamos para acciones masivas" : `${selCount} reclamo${selCount === 1 ? "" : "s"} seleccionado${selCount === 1 ? "" : "s"}`}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => downloadBulkPdf(selectedIds)}
              disabled={selCount === 0 || busy !== null}
              className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-medium hover:bg-gray-100 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {busy === "pdf" ? "Generando..." : "Descargar PDF"}
            </button>
            <button
              onClick={() => sendBulkEmail(selectedIds)}
              disabled={selCount === 0 || busy !== null || !c?.correo}
              title={!c?.correo ? "No hay correo configurado" : ""}
              className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-medium hover:bg-gray-100 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {busy === "email" ? "Enviando..." : "Enviar por Email"}
            </button>
            <button
              onClick={() => sendBulkWhatsApp(selectedIds)}
              disabled={selCount === 0 || busy !== null || !c?.whatsapp}
              title={!c?.whatsapp ? "No hay WhatsApp configurado" : ""}
              className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-medium hover:bg-gray-100 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {busy === "whatsapp" ? "Abriendo..." : "Enviar por WhatsApp"}
            </button>
            <button
              onClick={() => { setSelectionMode(false); setSelectedIds([]); }}
              className="text-xs text-gray-300 hover:text-white px-2 py-1.5 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} />
      </div>
    </div>
  );
}
