"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { SkeletonTable, EmptyState, Toast, StatusBadge, ConfirmModal } from "@/components/ui";
import XLSX from "xlsx-js-style";
import { fmt, fmtDate } from "@/lib/format";

function fmtShort(d: string): string {
  if (!d) return "";
  try { return new Date(d + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
import { EMPRESAS } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";

interface Cheque {
  id: string;
  cliente: string;
  empresa: string;
  banco: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  notas: string;
  whatsapp: string;
  estado: string;
  motivo_rebote?: string;
  fecha_depositado: string | null;
  created_at: string;
}

const BANCOS = ["Banistmo", "BAC", "General", "Global", "Multibank", "Otro"];

function todayStr() { return new Date().toISOString().slice(0, 10); }

type Filter = "all" | "pendiente" | "depositado" | "vencido" | "rebotado" | "vencen_hoy" | "vencen_semana";

export default function ChequesPage() {
  const { authChecked, role } = useAuth({ moduleKey: "cheques", allowedRoles: ["admin","secretaria","upload","director"] });
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "calendario">("lista");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calPopover, setCalPopover] = useState<string | null>(null);
  const [showResumen, setShowResumen] = useState(false);
  const [resumenSort, setResumenSort] = useState<"monto" | "count">("monto");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedVencidos, setSelectedVencidos] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<{ ids: Set<string>; clearFn: (v: Set<string>) => void } | null>(null);
  const [depositingId, setDepositingId] = useState<string | null>(null);
  const [confirmDepositId, setConfirmDepositId] = useState<string | null>(null);

  // Rebotado modal
  const [rebotandoId, setRebotandoId] = useState<string | null>(null);
  const [motivoRebote, setMotivoRebote] = useState("");

  // Directorio autocomplete
  const [dirClientes, setDirClientes] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Form fields
  const [fCliente, setFCliente] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fBanco, setFBanco] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fFecha, setFFecha] = useState(todayStr());
  const [fNotas, setFNotas] = useState("");
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const loadCheques = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/cheques"); if (res.ok) { const d = await res.json(); setCheques(Array.isArray(d) ? d : []); } }
    catch { setError("No se pudieron cargar los cheques. Recarga la página."); } setLoading(false);
  }, []);

  useEffect(() => {
    if (authChecked) {
      loadCheques();
      fetch("/api/directorio").then(r => r.ok ? r.json() : []).then(d => setDirClientes((d || []).map((c: { nombre: string }) => c.nombre))).catch(() => {});
    }
  }, [authChecked, loadCheques]);

  // Resumen por cliente
  const resumenClientes = useMemo(() => {
    if (cheques.length === 0) return [];
    const map = new Map<string, { cliente: string; count: number; total: number; ultimo: string }>();
    for (const c of cheques) {
      const existing = map.get(c.cliente);
      if (existing) {
        existing.count++;
        existing.total += Number(c.monto) || 0;
        if (c.fecha_deposito > existing.ultimo) existing.ultimo = c.fecha_deposito;
      } else {
        map.set(c.cliente, { cliente: c.cliente, count: 1, total: Number(c.monto) || 0, ultimo: c.fecha_deposito });
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => resumenSort === "monto" ? b.total - a.total : b.count - a.count);
    return arr;
  }, [cheques, resumenSort]);

  if (!authChecked) return null;

  function resetForm() {
    setFCliente(""); setFEmpresa(""); setFBanco(""); setFNumero(""); setFMonto(""); setFFecha(todayStr()); setFNotas(""); setFWhatsapp(""); setEditingId(null); setEditingEstado(null); setError(null);
  }

  function startEdit(c: Cheque) {
    setFCliente(c.cliente); setFEmpresa(c.empresa); setFBanco(c.banco); setFNumero(c.numero_cheque);
    setFMonto(String(c.monto)); setFFecha(c.fecha_deposito); setFNotas(c.notas); setFWhatsapp(c.whatsapp || ""); setEditingId(c.id); setEditingEstado(c.estado); setShowForm(true);
  }

  async function saveCheque() {
    if (!fCliente || !fEmpresa || !fBanco || !fNumero || !fMonto || !fFecha) { setError("Completa todos los campos obligatorios."); return; }
    if (parseFloat(fMonto) <= 0) { setError("El monto debe ser mayor a 0."); return; }
    setSaving(true); setError(null);
    const body = { cliente: fCliente, empresa: fEmpresa, banco: fBanco, numero_cheque: fNumero, monto: parseFloat(fMonto), fecha_deposito: fFecha, notas: fNotas, whatsapp: fWhatsapp };
    try {
      const url = editingId ? `/api/cheques/${editingId}` : "/api/cheques";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { resetForm(); setShowForm(false); loadCheques(); showToast(editingId ? "Cheque actualizado" : "Cheque guardado"); }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function depositar(id: string) {
    setDepositingId(id);
    try {
      await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "depositado", fecha_depositado: todayStr() }) });
      showToast("Cheque marcado como depositado");
      loadCheques();
    } catch { showToast("No se pudo depositar. Intenta de nuevo."); }
    setDepositingId(null);
  }

  async function batchDepositar(ids: Set<string>, clearFn: (v: Set<string>) => void) {
    if (ids.size === 0) return;
    setBatchProcessing(true);
    let ok = 0, fail = 0;
    for (const cid of ids) {
      try {
        const res = await fetch(`/api/cheques/${cid}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "depositado", fecha_depositado: todayStr() }) });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    clearFn(new Set());
    setBatchProcessing(false);
    showToast(fail === 0 ? `${ok} cheques depositados` : `${ok} depositados, ${fail} fallaron`);
    loadCheques();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function toggleSelectVencido(id: string) {
    setSelectedVencidos(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function marcarRebotado(id: string) {
    const cheque = cheques.find(c => c.id === id);
    try {
      const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "rebotado", motivo_rebote: motivoRebote || null }) });
      if (!res.ok) { showToast("No se pudo marcar como rebotado. Intenta de nuevo."); return; }
      if (cheque) {
        await fetch("/api/overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre_normalized: cheque.cliente.toUpperCase().trim(),
            resultado_contacto: `⚠ Cheque rebotado: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivoRebote || "Sin motivo"}`,
          }),
        }).catch(() => {});
      }
      showToast("Cheque marcado como rebotado");
    } catch { showToast("Error de conexion. Intenta de nuevo."); }
    setRebotandoId(null);
    setMotivoRebote("");
    loadCheques();
  }

  async function redepositar(id: string) {
    const cheque = cheques.find(c => c.id === id);
    if (!cheque) return;
    const hoy = todayStr();
    const notaExtra = `Re-depósito desde rebote (${hoy})`;
    const notas = cheque.notas ? `${cheque.notas}\n${notaExtra}` : notaExtra;
    try {
      const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "pendiente", motivo_rebote: null, notas }) });
      if (!res.ok) { showToast("No se pudo re-depositar. Intenta de nuevo."); return; }
      showToast("Cheque marcado para re-depósito");
    } catch { showToast("Error de conexión. Intenta de nuevo."); }
    loadCheques();
  }

  async function deleteCheque(id: string) {
    try {
      const res = await fetch(`/api/cheques/${id}`, { method: "DELETE" });
      if (res.ok) { loadCheques(); showToast("Cheque eliminado"); }
      else showToast("Error al eliminar cheque");
    } catch { showToast("Error de conexión"); }
  }

  function exportPendientes() {
    const pend = cheques.filter((c) => c.estado === "pendiente" || c.estado === "vencido");
    if (pend.length === 0) return;
    const rows: (string | number)[][] = [
      ["FASHION GROUP — Cheques Pendientes"],
      [],
      ["Cliente", "Banco", "Nº Cheque", "Monto", "Fecha Depósito", "WhatsApp"],
    ];
    for (const c of pend) {
      rows.push([c.cliente, c.banco, c.numero_cheque, c.monto, fmtDate(c.fecha_deposito), c.whatsapp || ""]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    // Bold header row
    for (let c = 0; c < 6; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
      if (cell) cell.s = { font: { bold: true } };
    }
    // Title style
    const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendientes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cheques-pendientes-${todayStr()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const today = todayStr();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Derive visual estado: pendiente + fecha < hoy → show as vencido
  function visualEstado(c: Cheque): string {
    if (c.estado === "pendiente" && c.fecha_deposito < today) return "vencido";
    return c.estado;
  }

  const pendientes = cheques.filter((c) => visualEstado(c) === "pendiente");
  const depositados = cheques.filter((c) => visualEstado(c) === "depositado");
  const vencidos = cheques.filter((c) => visualEstado(c) === "vencido");
  const rebotados = cheques.filter((c) => visualEstado(c) === "rebotado");
  const totalPendiente = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const proximo = pendientes.length > 0 ? pendientes[0].fecha_deposito : null;

  // Alert banners data
  const vencenHoy = cheques.filter((c) => c.fecha_deposito === today && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
  const vencenSemana = cheques.filter((c) => c.fecha_deposito >= today && c.fecha_deposito <= weekFromNow && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
  const totalVencenHoy = vencenHoy.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  // Search filter (by numero_cheque or cliente)
  const searchLower = search.toLowerCase().trim();

  // Apply filter then search
  const filteredByTab = (() => {
    switch (filter) {
      case "all": return cheques;
      case "pendiente": return pendientes;
      case "depositado": return depositados;
      case "vencido": return vencidos;
      case "rebotado": return rebotados;
      case "vencen_hoy": return vencenHoy;
      case "vencen_semana": return vencenSemana;
      default: return cheques;
    }
  })();

  const filtered = searchLower
    ? filteredByTab.filter((c) =>
        c.numero_cheque.toLowerCase().includes(searchLower) ||
        c.cliente.toLowerCase().includes(searchLower)
      )
    : filteredByTab;

  return (
    <div>
      <AppHeader module="Cheques Posfechados" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-light tracking-tight">Cheques Posfechados</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={exportPendientes} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1.5 rounded-full transition">
            ↓ Exportar pendientes
          </button>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition">
            {showForm ? "Cerrar" : "Nuevo Cheque"}
          </button>
        </div>
      </div>

      {/* Alert banners — CAMBIO 39 */}
      {vencenHoy.length > 0 && (
        <button
          onClick={() => setFilter("vencen_hoy")}
          className="w-full mb-3 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm font-medium hover:bg-red-100 transition text-left"
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {vencenHoy.length} cheque{vencenHoy.length > 1 ? "s" : ""} vence{vencenHoy.length > 1 ? "n" : ""} hoy — ${fmt(totalVencenHoy)} total
        </button>
      )}
      {vencenSemana.length > 0 && filter !== "vencen_hoy" && (
        <button
          onClick={() => setFilter("vencen_semana")}
          className="w-full mb-3 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm font-medium hover:bg-amber-100 transition text-left"
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-500" />
          {vencenSemana.length} cheque{vencenSemana.length > 1 ? "s" : ""} vence{vencenSemana.length > 1 ? "n" : ""} esta semana
        </button>
      )}

      {/* KPIs */}
      {(() => {
        const vencenSemanaKPI = pendientes.filter((c) => c.fecha_deposito >= today && c.fecha_deposito <= weekFromNow);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Total a cobrar</div>
              <div className="text-xl font-semibold tabular-nums">${fmt(totalPendiente)}</div>
              <div className="text-xs text-gray-400 mt-0.5">{pendientes.length} cheques</div>
            </div>
            <div className={`rounded-lg p-4 ${vencenSemanaKPI.length > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Vencen esta semana</div>
              <div className={`text-xl font-semibold tabular-nums ${vencenSemanaKPI.length > 0 ? "text-amber-600" : ""}`}>{vencenSemanaKPI.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(vencenSemanaKPI.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Próximo depósito</div>
              <div className="text-xl font-semibold">{proximo ? fmtDate(proximo) : "—"}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Depositados</div>
              <div className="text-xl font-semibold tabular-nums text-green-600">{depositados.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(depositados.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
            </div>
          </div>
        );
      })()}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg p-6 mb-8 overflow-visible">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">{editingId ? "Editar Cheque" : "Nuevo Cheque"}</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 overflow-visible">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Cliente <span className="text-red-500">*</span></label>
              <div className="relative">
                <input type="text" value={fCliente} onChange={(e) => { setFCliente(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
                {showSuggestions && fCliente.length >= 2 && (() => {
                  const matches = dirClientes.filter(n => n.toLowerCase().includes(fCliente.toLowerCase())).slice(0, 5);
                  return matches.length > 0 ? (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1">
                      {matches.map(n => (
                        <button key={n} onMouseDown={() => { setFCliente(n); setShowSuggestions(false); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition">{n}</button>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa <span className="text-red-500">*</span></label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
                <option value="">Seleccionar...</option>
                {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Banco <span className="text-red-500">*</span></label>
              <select value={fBanco} onChange={(e) => setFBanco(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
                <option value="">Seleccionar...</option>
                {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Cheque <span className="text-red-500">*</span></label>
              <input type="text" value={fNumero} onChange={(e) => setFNumero(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Monto <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={fMonto} onChange={(e) => setFMonto(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha Depósito <span className="text-red-500">*</span></label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">WhatsApp</label>
              <input type="text" value={fWhatsapp} onChange={(e) => setFWhatsapp(e.target.value)} placeholder="+507 6000-0000" className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Notas</label>
              <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition resize-none" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <div className="flex items-center gap-4 mt-6">
            <button onClick={saveCheque} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">{saving ? "Guardando..." : "Guardar Cheque"}</button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-full p-0.5 mb-6 w-fit">
        <button onClick={() => setViewMode("lista")} className={`py-1.5 px-4 text-xs rounded-full transition ${viewMode === "lista" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Lista</button>
        <button onClick={() => setViewMode("calendario")} className={`py-1.5 px-4 text-xs rounded-full transition ${viewMode === "calendario" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Calendario</button>
      </div>

      {/* Filter tabs + search — CAMBIO 40 search by cliente */}
      {viewMode === "lista" && <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          {([
            ["all", "Todos", cheques.length],
            ["pendiente", "Pendientes", pendientes.length],
            ["depositado", "Depositados", depositados.length],
            ["vencido", "Vencidos", vencidos.length],
            ["rebotado", "Rebotados", rebotados.length],
          ] as [Filter, string, number][]).map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`text-sm transition ${filter === key ? "font-medium text-black" : "text-gray-400 hover:text-black"}`}>
              {label} <span className="text-xs text-gray-300 ml-1">{count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cheque o cliente..."
            className="text-sm border border-gray-200 rounded-full px-4 py-1.5 outline-none focus:border-black transition w-56"
          />
        </div>
      </div>}

      {/* Resumen por cliente — CAMBIO 41 */}
      {viewMode === "lista" && cheques.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowResumen(!showResumen)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-black transition mb-3"
          >
            <span className={`transition-transform ${showResumen ? "rotate-90" : ""}`}>&#9654;</span>
            Resumen por cliente
          </button>
          {showResumen && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex gap-3 mb-3">
                <button onClick={() => setResumenSort("monto")} className={`text-xs transition ${resumenSort === "monto" ? "font-medium text-black" : "text-gray-400"}`}>Por monto</button>
                <button onClick={() => setResumenSort("count")} className={`text-xs transition ${resumenSort === "count" ? "font-medium text-black" : "text-gray-400"}`}>Por cantidad</button>
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-3 px-4 font-normal">Cliente</th>
                    <th className="text-right py-3 px-4 font-normal">Cant. cheques</th>
                    <th className="text-right py-3 px-4 font-normal">Monto total</th>
                    <th className="text-right py-3 px-4 font-normal">Último cheque</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenClientes.map((r) => (
                    <tr key={r.cliente} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium">{r.cliente}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{r.count}</td>
                      <td className="py-3 px-4 text-right tabular-nums">${fmt(r.total)}</td>
                      <td className="py-3 px-4 text-right text-gray-500">{fmtShort(r.ultimo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rebotado modal */}
      {rebotandoId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setRebotandoId(null); setMotivoRebote(""); }}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Marcar como Rebotado</div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Motivo (opcional)</label>
            <textarea
              value={motivoRebote}
              onChange={(e) => setMotivoRebote(e.target.value)}
              rows={3}
              placeholder="Fondos insuficientes, firma incorrecta, etc."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-black transition resize-none mt-1"
            />
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => marcarRebotado(rebotandoId)} className="bg-red-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition">Confirmar rebotado</button>
              <button onClick={() => { setRebotandoId(null); setMotivoRebote(""); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Calendar view ══ */}
      {viewMode === "calendario" && !loading && (() => {
        const { year, month } = calMonth;
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
        const daysInMonth = lastDay.getDate();
        const monthLabel = firstDay.toLocaleDateString("es-PA", { month: "long", year: "numeric" });
        const todayDate = todayStr();

        // Build day→cheques map for this month
        const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
        const monthCheques = cheques.filter(c => c.fecha_deposito.startsWith(monthPrefix));
        const byDay: Record<number, Cheque[]> = {};
        for (const c of monthCheques) {
          const d = parseInt(c.fecha_deposito.slice(8, 10));
          if (!byDay[d]) byDay[d] = [];
          byDay[d].push(c);
        }
        const totalMonth = monthCheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);

        const goToday = () => { const d = new Date(); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }); };
        const goPrev = () => setCalMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
        const goNext = () => setCalMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 });

        const pillColor = (estado: string) => {
          if (estado === "pendiente") return "bg-emerald-100 text-emerald-700";
          if (estado === "vencido") return "bg-red-100 text-red-700";
          if (estado === "rebotado") return "bg-red-50 text-red-400";
          return "bg-gray-100 text-gray-500";
        };

        const cells = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        return (
          <div>
            {/* Nav */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">‹</button>
                <h2 className="text-sm font-medium capitalize w-40 text-center">{monthLabel}</h2>
                <button onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">›</button>
                <button onClick={goToday} className="text-xs text-gray-400 hover:text-black transition ml-2">Hoy</button>
              </div>
              <span className="text-xs text-gray-400">{monthCheques.length} cheques · ${fmt(totalMonth)}</span>
            </div>

            {/* Desktop grid */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map(d => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 border-t border-l border-gray-200">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} className="border-r border-b border-gray-200 bg-gray-50/50 min-h-[80px]" />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = dateStr === todayDate;
                  const dayCheques = byDay[day] || [];
                  return (
                    <div key={day} className={`border-r border-b border-gray-200 min-h-[80px] p-1 ${isToday ? "bg-blue-50/60" : ""}`}>
                      <div className={`text-[11px] mb-0.5 ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayCheques.slice(0, 3).map(c => {
                          const ve = visualEstado(c);
                          return (
                          <div key={c.id} className="relative">
                            <button onClick={() => setCalPopover(calPopover === c.id ? null : c.id)}
                              className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate ${pillColor(ve)}`}>
                              {c.cliente.length > 12 ? c.cliente.slice(0, 12) + "…" : c.cliente} ${fmt(c.monto)}
                            </button>
                            {calPopover === c.id && (
                              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56" onClick={e => e.stopPropagation()}>
                                <div className="text-xs font-medium mb-1">{c.cliente}</div>
                                <div className="text-[11px] text-gray-500 mb-0.5">{c.banco} · {c.numero_cheque}</div>
                                <div className="text-sm font-semibold mb-2">${fmt(c.monto)}</div>
                                <StatusBadge estado={ve} />
                                {(ve === "pendiente" || ve === "vencido") && (
                                  <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                                    <button onClick={() => { setConfirmDepositId(c.id); setCalPopover(null); }} className="text-[11px] text-emerald-600 hover:underline">Depositar</button>
                                    <button onClick={() => { setRebotandoId(c.id); setCalPopover(null); }} className="text-[11px] text-red-500 hover:underline">Rebotado</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        })}
                        {dayCheques.length > 3 && <div className="text-[9px] text-gray-400 px-1">+{dayCheques.length - 3} más</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile: grouped by day */}
            <div className="sm:hidden space-y-2">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => byDay[d]?.length).map(day => {
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayDate;
                return (
                  <div key={day} className={`rounded-lg border p-3 ${isToday ? "border-blue-200 bg-blue-50/50" : "border-gray-200"}`}>
                    <div className={`text-xs mb-2 ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>{fmtDate(dateStr)}{isToday ? " — Hoy" : ""}</div>
                    <div className="space-y-1.5">
                      {byDay[day].map(c => {
                        const ve = visualEstado(c);
                        return (
                        <div key={c.id}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${pillColor(ve)}`}>{ve}</span>
                              <span className="text-sm truncate">{c.cliente}</span>
                            </div>
                            <span className="text-sm font-medium tabular-nums ml-2">${fmt(c.monto)}</span>
                          </div>
                          {(ve === "pendiente" || ve === "vencido") && (
                            <div className="flex gap-3 mt-1 ml-1">
                              <button onClick={() => setConfirmDepositId(c.id)} className="text-xs text-emerald-600 hover:underline py-1">Depositar</button>
                              <button onClick={() => setRebotandoId(c.id)} className="text-xs text-red-500 hover:underline py-1">Rebotado</button>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {viewMode === "calendario" && !loading && (
        <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-3 px-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pendiente</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Vencido / Rebotado</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Depositado</span>
        </div>
      )}

      {/* Table */}
      {viewMode === "lista" && (loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hay cheques registrados"
          subtitle="Registra el primer cheque posfechado"
          actionLabel="+ Nuevo Cheque"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-sm text-emerald-700">{selectedIds.size} pendiente{selectedIds.size > 1 ? "s" : ""} seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
            <button onClick={() => setConfirmBatch({ ids: selectedIds, clearFn: setSelectedIds })} disabled={batchProcessing} className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-full hover:bg-emerald-700 transition disabled:opacity-50">
              {batchProcessing ? "Procesando..." : "Marcar depositados"}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        )}
        {selectedVencidos.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-sm text-amber-700">{selectedVencidos.size} vencido{selectedVencidos.size > 1 ? "s" : ""} seleccionado{selectedVencidos.size > 1 ? "s" : ""}</span>
            <button onClick={() => setConfirmBatch({ ids: selectedVencidos, clearFn: setSelectedVencidos })} disabled={batchProcessing} className="text-xs bg-amber-600 text-white px-4 py-1.5 rounded-full hover:bg-amber-700 transition disabled:opacity-50">
              {batchProcessing ? "Procesando..." : "Depositar seleccionados"}
            </button>
            <button onClick={() => setSelectedVencidos(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        )}
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[700px] px-4 sm:px-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
              <th className="text-left py-3 px-4 font-normal">Fecha Depósito</th>
              <th className="text-left py-3 px-4 font-normal">Cliente</th>
              <th className="text-left py-3 px-4 font-normal">Empresa</th>
              <th className="text-left py-3 px-4 font-normal">Banco</th>
              <th className="text-left py-3 px-4 font-normal">N° Cheque</th>
              <th className="text-right py-3 px-4 font-normal">Monto</th>
              <th className="text-left py-3 px-4 font-normal">Estado</th>
              <th className="text-right py-3 px-4 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const ve = visualEstado(c);
              const isToday = c.fecha_deposito === today && ve === "pendiente";
              const isVencido = ve === "vencido";
              const isDep = ve === "depositado";
              const isRebotado = ve === "rebotado";
              return (
                <tr key={c.id} className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${isToday ? "bg-yellow-50 border-l-4 border-l-yellow-400" : isVencido ? "bg-red-50/30" : isRebotado ? "bg-red-50/20" : ""} ${isDep || isVencido ? "text-gray-400" : ""}`}>
                  {ve === "pendiente" && (
                    <td className="py-3 pl-2 pr-0 w-8">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-emerald-600 w-3.5 h-3.5" />
                    </td>
                  )}
                  {ve === "vencido" && (
                    <td className="py-3 pl-2 pr-0 w-8">
                      <input type="checkbox" checked={selectedVencidos.has(c.id)} onChange={() => toggleSelectVencido(c.id)} className="accent-amber-600 w-3.5 h-3.5" />
                    </td>
                  )}
                  <td className={`py-3 px-4 ${ve !== "pendiente" ? "" : ""}`}>{fmtShort(c.fecha_deposito)}</td>
                  <td className="py-3 px-4 font-medium">{c.cliente}</td>
                  <td className="py-3 px-4 text-gray-500">{c.empresa}</td>
                  <td className="py-3 px-4 text-gray-500">{c.banco}</td>
                  <td className="py-3 px-4 text-gray-500">{c.numero_cheque}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(c.monto)}</td>
                  <td className="py-3 px-4">
                    <StatusBadge estado={ve} />
                  </td>
                  <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                    {(ve === "pendiente" || ve === "vencido") && (<>
                      <button onClick={() => setConfirmDepositId(c.id)} className="text-sm text-gray-500 hover:text-black transition">Depositar</button>
                      <span className="text-gray-200">·</span>
                      <button onClick={() => setRebotandoId(c.id)} className="text-sm text-gray-500 hover:text-red-600 transition">Rebotado</button>
                      <span className="text-gray-200">·</span>
                    </>)}
                    {isRebotado && (<>
                      <button onClick={() => redepositar(c.id)} className="text-sm text-gray-500 hover:text-emerald-600 transition">Re-depositar</button>
                      <span className="text-gray-200">·</span>
                    </>)}
                    {c.whatsapp && (<>
                      <button onClick={() => {
                        const msg = `Hola, le escribo de Fashion Group respecto al cheque N° ${c.numero_cheque} por $${fmt(c.monto)} con fecha de depósito ${fmtDate(c.fecha_deposito)}. ${ve === "pendiente" ? "Queda pendiente de depósito." : ve === "rebotado" ? "El cheque fue rebotado." : ""} Gracias.`;
                        window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
                      }} className="text-sm text-gray-500 hover:text-green-600 transition">WA</button>
                      <span className="text-gray-200">·</span>
                    </>)}
                    <button onClick={() => startEdit(c)} className="text-sm text-gray-500 hover:text-black transition">Editar</button>
                    {role === "admin" && <><span className="text-gray-200">·</span><button onClick={() => setConfirmDeleteId(c.id)} className="text-sm text-gray-400 hover:text-red-500 transition">Eliminar Cheque</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </div>
        </>
      ))}
      <Toast message={error} type="error" />
      <Toast message={toast} />
      {/* Confirm deposit */}
      <ConfirmModal
        open={!!confirmDepositId}
        onClose={() => setConfirmDepositId(null)}
        onConfirm={() => { depositar(confirmDepositId!); setConfirmDepositId(null); }}
        title="Depositar cheque"
        message={(() => { const c = cheques.find(x => x.id === confirmDepositId); return c ? `¿Depositar cheque N° ${c.numero_cheque} por $${fmt(c.monto)}?` : ""; })()}
        confirmLabel="Si, depositar"
      />
      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { deleteCheque(confirmDeleteId!); setConfirmDeleteId(null); }}
        title="Eliminar cheque"
        message="¿Seguro que deseas eliminar este cheque? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
      />
      <ConfirmModal
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={() => { if (confirmBatch) { batchDepositar(confirmBatch.ids, confirmBatch.clearFn); setConfirmBatch(null); } }}
        title="Depositar cheques"
        message={confirmBatch ? `¿Depositar ${confirmBatch.ids.size} cheques por un total de $${fmt(cheques.filter(c => confirmBatch.ids.has(c.id)).reduce((s, c) => s + c.monto, 0))}?` : ""}
        confirmLabel="Si, depositar todos"
      />
    </div>
    </div>
  );
}
