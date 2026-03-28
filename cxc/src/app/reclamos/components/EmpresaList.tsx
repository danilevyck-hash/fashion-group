"use client";

import { fmt, fmtDate } from "@/lib/format";
import { Reclamo, Contacto } from "./types";
import { ESTADOS, EC, daysSince, calcSub, buildReclamosPdfHtml, openPdfWindow } from "./constants";
import { EmptyState } from "@/components/ui";

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

export default function EmpresaList({
  role, activeEmpresa, reclamos, contactos, search, setSearch,
  filterEstado, setFilterEstado, selectionMode, setSelectionMode,
  selectedIds, setSelectedIds, sortCol, setSortCol, sortDir, setSortDir,
  onBack, onNewReclamo, onLoadDetail, onDeleteReclamo,
}: Props) {
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
    if (sortCol === "total") { av = calcSub(a.reclamo_items ?? []) * 1.177; bv = calcSub(b.reclamo_items ?? []) * 1.177; }
    if (sortCol === "estado") { av = ESTADOS.indexOf(a.estado); bv = ESTADOS.indexOf(b.estado); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const allSelectableIds = sortedRecs.filter((r) => r.estado !== "Resuelto con NC" && r.estado !== "Rechazado").map((r) => r.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: string) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  async function downloadSelectedExcel() {
    if (!selectedIds.length) return;
    const res = await fetch("/api/reclamos/export-excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds }) });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Reclamos-${activeEmpresa}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    }
  }

  function downloadSelectedPdf() {
    if (!selectedIds.length) return;
    const sel = reclamos.filter((r) => selectedIds.includes(r.id));
    if (!sel.length) return;
    openPdfWindow(buildReclamosPdfHtml(sel, activeEmpresa));
  }

  function sendBulkWA(ids: string[]) {
    if (!c?.whatsapp) { alert("No hay contacto con WhatsApp para esta empresa."); return; }
    const sel = reclamos.filter((r) => ids.includes(r.id));
    if (!sel.length) { alert("No hay reclamos para enviar."); return; }
    const nombre = c.nombre_contacto || c.nombre || "equipo";
    const lines = sel.map((r) => {
      const factura = (r.nro_factura || "").length > 30 ? (r.nro_factura || "").slice(0, 27) + "..." : (r.nro_factura || "");
      const total = calcSub(r.reclamo_items ?? []) * 1.177;
      return `📋 ${r.nro_reclamo} | Factura: ${factura} | $${fmt(total)} | ${r.estado}`;
    }).join("\n");
    const grandTotal = sel.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * 1.177, 0);
    const msg = `Hola ${nombre}, te escribimos de parte de Fashion Group.\n\nTe enviamos el resumen de reclamos pendientes de ${activeEmpresa}:\n\n${lines}\n\nTotal a acreditar: $${fmt(grandTotal)}\n\nPor favor confirmar recepción y estado de cada reclamo.\nGracias.`;
    window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function sendSingleWA(r: Reclamo) {
    if (!c?.whatsapp) { alert("No hay contacto con WhatsApp para esta empresa."); return; }
    const nombre = c.nombre_contacto || c.nombre || "equipo";
    const factura = (r.nro_factura || "").length > 30 ? (r.nro_factura || "").slice(0, 27) + "..." : (r.nro_factura || "");
    const total = calcSub(r.reclamo_items ?? []) * 1.177;
    const msg = `Hola ${nombre}, te escribimos de parte de Fashion Group.\n\nReclamo pendiente de ${activeEmpresa}:\n\n📋 ${r.nro_reclamo} | Factura: ${factura} | $${fmt(total)} | ${r.estado}\n\nPor favor confirmar recepción y estado.\nGracias.`;
    window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-black transition mb-2 block">← Empresas</button>
          <h1 className="text-xl font-light tracking-tight">{activeEmpresa}</h1>
          {c && <p className="text-xs text-gray-400 mt-1">Contacto: {(c.nombre_contacto || c.nombre || "equipo")} | {c.correo}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selectionMode ? (
            <>
              <span className="text-sm text-gray-400">{selectedIds.length} seleccionados</span>
              <button onClick={() => allSelected ? setSelectedIds([]) : setSelectedIds(allSelectableIds)} className="text-sm text-gray-400 hover:text-black transition">
                {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
              {selectedIds.length > 0 && <>
                <button onClick={downloadSelectedPdf} className="text-sm text-gray-400 hover:text-black transition border border-gray-200 px-4 py-2 rounded-full">↓ PDF</button>
                <button onClick={downloadSelectedExcel} className="text-sm text-gray-400 hover:text-black transition border border-gray-200 px-4 py-2 rounded-full">↓ Excel</button>
                <button onClick={() => sendBulkWA(selectedIds)} className="text-sm bg-black text-white px-5 py-2 rounded-full hover:bg-gray-800 transition">WhatsApp</button>
              </>}
              <button onClick={() => { setSelectionMode(false); setSelectedIds([]); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </>
          ) : (
            <>
              <button onClick={() => { setSelectionMode(true); setSelectedIds([]); }} className="text-sm text-gray-400 hover:text-black transition">Seleccionar</button>
              <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">Nuevo Reclamo</button>
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
              {e} <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-6">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="border-b border-gray-200 py-2 text-sm outline-none w-full max-w-xs" />
      </div>

      {sortedRecs.length === 0 ? <EmptyState title="Sin reclamos" subtitle="No hay reclamos registrados para esta empresa" /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
              {selectionMode && <th className="pb-3 w-8"></th>}
              <th className="text-left pb-3 font-medium">N° Reclamo</th>
              <th className="text-left pb-3 font-medium">Factura</th>
              <th onClick={() => toggleSort("fecha")} className="text-left pb-3 font-medium cursor-pointer hover:text-black select-none">Fecha {sortCol === "fecha" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("dias")} className="text-right pb-3 font-medium cursor-pointer hover:text-black select-none">Antigüedad {sortCol === "dias" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("estado")} className="text-left pb-3 font-medium cursor-pointer hover:text-black select-none">Estado {sortCol === "estado" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("total")} className="text-right pb-3 font-medium cursor-pointer hover:text-black select-none">Total {sortCol === "total" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th className="text-right pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRecs.map((r) => {
              const days = daysSince(r.fecha_reclamo);
              const total = calcSub(r.reclamo_items ?? []) * 1.177;
              const isOpen = r.estado !== "Resuelto con NC" && r.estado !== "Rechazado";
              return (
                <tr key={r.id}
                  onClick={() => selectionMode ? (isOpen && toggleSelect(r.id)) : onLoadDetail(r.id)}
                  className="border-b border-gray-100 hover:bg-gray-50/80 transition cursor-pointer">
                  {selectionMode && (
                    <td className="py-3">
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} disabled={!isOpen} className="accent-black disabled:opacity-30" />
                    </td>
                  )}
                  <td className="py-3 font-medium text-xs">{r.nro_reclamo}</td>
                  <td className="py-3 text-gray-500">{r.nro_factura}</td>
                  <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                  <td className={`py-3 text-right tabular-nums ${days > 60 && isOpen ? "text-red-600 font-medium" : days > 30 && isOpen ? "text-amber-600" : "text-gray-400"}`}>{days}d</td>
                  <td className="py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span></td>
                  <td className="py-3 text-right tabular-nums">${fmt(total)}</td>
                  <td className="py-3 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {isOpen && !selectionMode && (
                      <button onClick={() => sendSingleWA(r)} className="text-green-500 hover:text-green-700 transition" title="Enviar por WhatsApp">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </button>
                    )}
                    {role === "admin" && !selectionMode && (
                      <button onClick={() => onDeleteReclamo(r.id)} className="text-sm text-gray-300 hover:text-red-500 transition">Eliminar</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
