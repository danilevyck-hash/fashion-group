"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { SkeletonTable, EmptyState, Toast, StatusBadge, ConfirmModal } from "@/components/ui";
import XLSX from "xlsx-js-style";
import { fmt, fmtDate } from "@/lib/format";
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
  const { authChecked, role } = useAuth({ moduleKey: "cheques", allowedRoles: ["admin","secretaria","director"] });
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showResumen, setShowResumen] = useState(false);
  const [resumenSort, setResumenSort] = useState<"monto" | "count">("monto");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    catch { setError("Error al cargar cheques"); } setLoading(false);
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
    setFCliente(""); setFEmpresa(""); setFBanco(""); setFNumero(""); setFMonto(""); setFFecha(todayStr()); setFNotas(""); setFWhatsapp(""); setEditingId(null); setError(null);
  }

  function startEdit(c: Cheque) {
    setFCliente(c.cliente); setFEmpresa(c.empresa); setFBanco(c.banco); setFNumero(c.numero_cheque);
    setFMonto(String(c.monto)); setFFecha(c.fecha_deposito); setFNotas(c.notas); setFWhatsapp(c.whatsapp || ""); setEditingId(c.id); setShowForm(true);
  }

  async function saveCheque() {
    if (!fCliente || !fEmpresa || !fBanco || !fNumero || !fMonto || !fFecha) { setError("Completa todos los campos obligatorios."); return; }
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
    await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "depositado", fecha_depositado: todayStr() }) });
    loadCheques();
  }

  async function marcarRebotado(id: string) {
    const cheque = cheques.find(c => c.id === id);
    const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "rebotado", motivo_rebote: motivoRebote || null }) });
    if (res.ok && cheque) {
      await fetch("/api/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_normalized: cheque.cliente.toUpperCase().trim(),
          resultado_contacto: `⚠ Cheque rebotado: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivoRebote || "Sin motivo"}`,
        }),
      });
    }
    setRebotandoId(null);
    setMotivoRebote("");
    loadCheques();
  }

  async function deleteCheque(id: string) {
    await fetch(`/api/cheques/${id}`, { method: "DELETE" });
    loadCheques();
    showToast("Cheque eliminado");
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

  const pendientes = cheques.filter((c) => c.estado === "pendiente");
  const depositados = cheques.filter((c) => c.estado === "depositado");
  const vencidos = cheques.filter((c) => c.estado === "vencido");
  const rebotados = cheques.filter((c) => c.estado === "rebotado");
  const totalPendiente = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const proximo = pendientes.length > 0 ? pendientes[0].fecha_deposito : null;

  // Alert banners data
  const vencenHoy = cheques.filter((c) => c.fecha_deposito === today && c.estado !== "depositado" && c.estado !== "rebotado");
  const vencenSemana = cheques.filter((c) => c.fecha_deposito >= today && c.fecha_deposito <= weekFromNow && c.estado !== "depositado" && c.estado !== "rebotado");
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-xl font-light tracking-tight">Cheques Posfechados</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de cheques recibidos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={exportPendientes} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1.5 rounded-full transition">
            ↓ Exportar pendientes
          </button>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
            {showForm ? "Cerrar" : "Nuevo Cheque"}
          </button>
        </div>
      </div>

      {/* Alert banners — CAMBIO 39 */}
      {vencenHoy.length > 0 && (
        <button
          onClick={() => setFilter("vencen_hoy")}
          className="w-full mb-3 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-100 transition text-left"
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {vencenHoy.length} cheque{vencenHoy.length > 1 ? "s" : ""} vence{vencenHoy.length > 1 ? "n" : ""} hoy — ${fmt(totalVencenHoy)} total
        </button>
      )}
      {vencenSemana.length > 0 && filter !== "vencen_hoy" && (
        <button
          onClick={() => setFilter("vencen_semana")}
          className="w-full mb-3 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm font-medium hover:bg-amber-100 transition text-left"
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
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Total a cobrar</div>
              <div className="text-xl font-semibold tabular-nums">${fmt(totalPendiente)}</div>
              <div className="text-xs text-gray-400 mt-0.5">{pendientes.length} cheques</div>
            </div>
            <div className={`rounded-xl p-4 ${vencenSemanaKPI.length > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Vencen esta semana</div>
              <div className={`text-xl font-semibold tabular-nums ${vencenSemanaKPI.length > 0 ? "text-amber-600" : ""}`}>{vencenSemanaKPI.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(vencenSemanaKPI.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Próximo depósito</div>
              <div className="text-xl font-semibold">{proximo ? fmtDate(proximo) : "—"}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Depositados</div>
              <div className="text-xl font-semibold tabular-nums text-green-600">{depositados.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(depositados.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
            </div>
          </div>
        );
      })()}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 rounded-2xl p-6 mb-8 overflow-visible">
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
            <button onClick={saveCheque} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">{saving ? "Guardando..." : "Guardar Cheque"}</button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Filter tabs + search — CAMBIO 40 search by cliente */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
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
      </div>

      {/* Resumen por cliente — CAMBIO 41 */}
      {cheques.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowResumen(!showResumen)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-black transition mb-3"
          >
            <span className={`transition-transform ${showResumen ? "rotate-90" : ""}`}>&#9654;</span>
            Resumen por cliente
          </button>
          {showResumen && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex gap-3 mb-3">
                <button onClick={() => setResumenSort("monto")} className={`text-xs transition ${resumenSort === "monto" ? "font-medium text-black" : "text-gray-400"}`}>Por monto</button>
                <button onClick={() => setResumenSort("count")} className={`text-xs transition ${resumenSort === "count" ? "font-medium text-black" : "text-gray-400"}`}>Por cantidad</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-3 px-4 font-normal">Cliente</th>
                    <th className="text-right py-3 px-4 font-normal">Cant. cheques</th>
                    <th className="text-right py-3 px-4 font-normal">Monto total</th>
                    <th className="text-right py-3 px-4 font-normal">Último cheque</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenClientes.map((r) => (
                    <tr key={r.cliente} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium">{r.cliente}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{r.count}</td>
                      <td className="py-3 px-4 text-right tabular-nums">${fmt(r.total)}</td>
                      <td className="py-3 px-4 text-right text-gray-500">{fmtDate(r.ultimo)}</td>
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => marcarRebotado(rebotandoId)} className="bg-red-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-red-700 transition">Confirmar rebotado</button>
              <button onClick={() => { setRebotandoId(null); setMotivoRebote(""); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hay cheques registrados"
          subtitle="Registra el primer cheque posfechado"
          actionLabel="+ Nuevo Cheque"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[700px] px-4 sm:px-0">
        <table className="w-full text-sm">
          <thead>
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
              const isToday = c.fecha_deposito === today && c.estado === "pendiente";
              const isVencido = c.estado === "vencido";
              const isDep = c.estado === "depositado";
              const isRebotado = c.estado === "rebotado";
              return (
                <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isToday ? "bg-yellow-50 border-l-4 border-l-yellow-400" : isVencido ? "bg-red-50/30" : isRebotado ? "bg-red-50/20" : ""} ${isDep || isVencido ? "text-gray-400" : ""}`}>
                  <td className="py-3 px-4">{fmtDate(c.fecha_deposito)}</td>
                  <td className="py-3 px-4 font-medium">{c.cliente}</td>
                  <td className="py-3 px-4 text-gray-500">{c.empresa}</td>
                  <td className="py-3 px-4 text-gray-500">{c.banco}</td>
                  <td className="py-3 px-4 text-gray-500">{c.numero_cheque}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(c.monto)}</td>
                  <td className="py-3 px-4">
                    <StatusBadge estado={c.estado} />
                  </td>
                  <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                    {(c.estado === "pendiente" || c.estado === "vencido") && (<>
                      <button onClick={() => depositar(c.id)} className="text-sm text-gray-500 hover:text-black transition">Depositar</button>
                      <span className="text-gray-200">·</span>
                      <button onClick={() => setRebotandoId(c.id)} className="text-sm text-gray-500 hover:text-red-600 transition">Rebotado</button>
                      <span className="text-gray-200">·</span>
                    </>)}
                    {c.whatsapp && (<>
                      <button onClick={() => {
                        const msg = `Hola, le escribo de Fashion Group respecto al cheque N° ${c.numero_cheque} por $${fmt(c.monto)} con fecha de depósito ${fmtDate(c.fecha_deposito)}. ${c.estado === "pendiente" ? "Queda pendiente de depósito." : c.estado === "rebotado" ? "El cheque fue rebotado." : ""} Gracias.`;
                        window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
                      }} className="text-sm text-gray-500 hover:text-green-600 transition">WA</button>
                      <span className="text-gray-200">·</span>
                    </>)}
                    <button onClick={() => startEdit(c)} className="text-sm text-gray-500 hover:text-black transition">Editar</button>
                    {role === "admin" && <><span className="text-gray-200">·</span><button onClick={() => setConfirmDeleteId(c.id)} className="text-sm text-gray-300 hover:text-red-500 transition">Eliminar</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </div>
      )}
      <Toast message={error} type="error" />
      <Toast message={toast} />
      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { deleteCheque(confirmDeleteId!); setConfirmDeleteId(null); }}
        title="Eliminar cheque"
        message="¿Seguro que deseas eliminar este cheque? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
      />
    </div>
    </div>
  );
}
