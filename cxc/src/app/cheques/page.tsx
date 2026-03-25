"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Cheque {
  id: string;
  cliente: string;
  empresa: string;
  banco: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  notas: string;
  estado: string;
  fecha_depositado: string | null;
  created_at: string;
}

const EMPRESAS = ["Vistana International", "Fashion Shoes", "Fashion Wear", "Active Shoes", "Active Wear", "Joystep", "Multifashion"];
const BANCOS = ["Banistmo", "BAC", "General", "Global", "Multibank", "Otro"];

function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

type Filter = "all" | "pendiente" | "depositado" | "vencido";

export default function ChequesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [fCliente, setFCliente] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fBanco, setFBanco] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fFecha, setFFecha] = useState(todayStr());
  const [fNotas, setFNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r || (r !== "admin" && r !== "director" && r !== "upload")) { router.push("/"); return; }
    setRole(r); setAuthChecked(true);
  }, [router]);

  const loadCheques = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/cheques"); if (res.ok) { const d = await res.json(); setCheques(Array.isArray(d) ? d : []); } }
    catch { setError("Error al cargar cheques"); } setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) loadCheques(); }, [authChecked, loadCheques]);

  if (!authChecked) return null;

  function resetForm() {
    setFCliente(""); setFEmpresa(""); setFBanco(""); setFNumero(""); setFMonto(""); setFFecha(todayStr()); setFNotas(""); setEditingId(null); setError(null);
  }

  function startEdit(c: Cheque) {
    setFCliente(c.cliente); setFEmpresa(c.empresa); setFBanco(c.banco); setFNumero(c.numero_cheque);
    setFMonto(String(c.monto)); setFFecha(c.fecha_deposito); setFNotas(c.notas); setEditingId(c.id); setShowForm(true);
  }

  async function saveCheque() {
    if (!fCliente || !fEmpresa || !fBanco || !fNumero || !fMonto || !fFecha) { setError("Completa todos los campos obligatorios."); return; }
    setSaving(true); setError(null);
    const body = { cliente: fCliente, empresa: fEmpresa, banco: fBanco, numero_cheque: fNumero, monto: parseFloat(fMonto), fecha_deposito: fFecha, notas: fNotas };
    try {
      const url = editingId ? `/api/cheques/${editingId}` : "/api/cheques";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { resetForm(); setShowForm(false); loadCheques(); }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function depositar(id: string) {
    await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "depositado", fecha_depositado: todayStr() }) });
    loadCheques();
  }

  async function deleteCheque(id: string) {
    if (!confirm("¿Eliminar este cheque?")) return;
    await fetch(`/api/cheques/${id}`, { method: "DELETE" });
    loadCheques();
  }

  const today = todayStr();
  const pendientes = cheques.filter((c) => c.estado === "pendiente");
  const depositados = cheques.filter((c) => c.estado === "depositado");
  const vencidos = cheques.filter((c) => c.estado === "vencido");
  const totalPendiente = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const proximo = pendientes.length > 0 ? pendientes[0].fecha_deposito : null;

  const filtered = filter === "all" ? cheques : cheques.filter((c) => c.estado === filter);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cheques Posfechados</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de cheques recibidos</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
            {showForm ? "Cerrar" : "Nuevo Cheque"}
          </button>
          <button onClick={() => router.push("/plantillas")} className="text-sm text-gray-400 hover:text-black transition">Plantillas</button>
          <button onClick={() => router.push("/admin")} className="text-sm text-gray-400 hover:text-black transition">← Panel</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-8 mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Total Pendiente</div>
          <div className="text-2xl font-semibold tabular-nums">${fmt(totalPendiente)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Cheques Pendientes</div>
          <div className="text-2xl font-semibold">{pendientes.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Próximo Depósito</div>
          <div className="text-2xl font-semibold">{proximo ? fmtDate(proximo) : "—"}</div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 rounded-2xl p-6 mb-8">
          <div className="text-sm font-medium mb-4">{editingId ? "Editar Cheque" : "Nuevo Cheque"}</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Cliente *</label>
              <input type="text" value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa *</label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
                <option value="">Seleccionar...</option>
                {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Banco *</label>
              <select value={fBanco} onChange={(e) => setFBanco(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition">
                <option value="">Seleccionar...</option>
                {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Cheque *</label>
              <input type="text" value={fNumero} onChange={(e) => setFNumero(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Monto *</label>
              <input type="number" step="0.01" value={fMonto} onChange={(e) => setFMonto(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha Depósito *</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition" />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Notas</label>
              <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition resize-none" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <div className="flex items-center gap-4 mt-6">
            <button onClick={saveCheque} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">{saving ? "Guardando..." : "Guardar"}</button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-4 mb-6">
        {([["all", "Todos", cheques.length], ["pendiente", "Pendientes", pendientes.length], ["depositado", "Depositados", depositados.length], ["vencido", "Vencidos", vencidos.length]] as [Filter, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`text-sm transition ${filter === key ? "font-medium text-black" : "text-gray-400 hover:text-black"}`}>
            {label} <span className="text-xs text-gray-300 ml-1">{count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div>{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse flex gap-4 py-3 border-b border-gray-100"><div className="h-3 bg-gray-100 rounded w-1/4" /><div className="h-3 bg-gray-100 rounded w-1/6 ml-auto" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm font-medium text-gray-700 mb-1">No hay cheques registrados</p>
          <p className="text-sm text-gray-400 mb-6">Registra el primer cheque posfechado recibido</p>
          <button onClick={() => setShowForm(true)} className="text-sm bg-black text-white px-6 py-2.5 rounded-full hover:bg-gray-800 transition">Registrar cheque</button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
              <th className="text-left pb-3 font-medium">Fecha Depósito</th>
              <th className="text-left pb-3 font-medium">Cliente</th>
              <th className="text-left pb-3 font-medium">Empresa</th>
              <th className="text-left pb-3 font-medium">Banco</th>
              <th className="text-left pb-3 font-medium">N° Cheque</th>
              <th className="text-right pb-3 font-medium">Monto</th>
              <th className="text-left pb-3 font-medium">Estado</th>
              <th className="text-right pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const isToday = c.fecha_deposito === today && c.estado === "pendiente";
              const isVencido = c.estado === "vencido";
              const isDep = c.estado === "depositado";
              return (
                <tr key={c.id} className={`border-b border-gray-100 transition ${isToday ? "bg-yellow-50 border-l-4 border-l-yellow-400" : isVencido ? "bg-red-50/30" : ""} ${isDep || isVencido ? "text-gray-400" : ""}`}>
                  <td className="py-3">{fmtDate(c.fecha_deposito)}</td>
                  <td className="py-3 font-medium">{c.cliente}</td>
                  <td className="py-3 text-gray-500">{c.empresa}</td>
                  <td className="py-3 text-gray-500">{c.banco}</td>
                  <td className="py-3 text-gray-500">{c.numero_cheque}</td>
                  <td className="py-3 text-right tabular-nums font-medium">${fmt(c.monto)}</td>
                  <td className="py-3">
                    {c.estado === "pendiente" && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pendiente</span>}
                    {c.estado === "depositado" && <span className="text-[11px] bg-black text-white px-2 py-0.5 rounded-full">Depositado</span>}
                    {c.estado === "vencido" && <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vencido</span>}
                  </td>
                  <td className="py-3 text-right">
                    {(c.estado === "pendiente" || c.estado === "vencido") && (
                      <button onClick={() => depositar(c.id)} className="text-sm text-gray-400 hover:text-black transition mr-3">Depositar</button>
                    )}
                    <button onClick={() => startEdit(c)} className="text-sm text-gray-400 hover:text-black transition mr-3">Editar</button>
                    {role === "admin" && <button onClick={() => deleteCheque(c.id)} className="text-sm text-gray-300 hover:text-red-500 transition">Eliminar</button>}
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
