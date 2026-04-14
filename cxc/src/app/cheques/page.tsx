"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { SkeletonTable, EmptyState, Toast, StatusBadge, ConfirmModal, AnimatedNumber, useContextMenu, PullToRefresh, SwipeableRow } from "@/components/ui";
import type { ContextMenuItem, SwipeAction } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import XLSX from "xlsx-js-style";
import { fmt, fmtDate } from "@/lib/format";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";

import { EMPRESAS } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import SuggestionCard from "@/components/SuggestionCard";
import { cacheSet, cacheGet, CACHE_KEYS } from "@/lib/offlineCache";
import { useOnline } from "@/lib/OnlineContext";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";

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


function todayStr() { return new Date().toISOString().slice(0, 10); }

type Filter = "all" | "pendiente" | "depositado" | "vencido" | "rebotado" | "vencen_hoy" | "vencen_manana" | "vencen_semana";
const VALID_FILTERS: Filter[] = ["all", "pendiente", "depositado", "vencido", "rebotado", "vencen_hoy", "vencen_manana", "vencen_semana"];

function ChequeMoreMenu({ cheque, ve, role, onRebotado, onWA, onDelete, onRedepositar }: {
  cheque: Cheque; ve: string; role: string;
  onRebotado: () => void; onWA: () => void; onDelete: () => void; onRedepositar?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido";
  const isRebotado = ve === "rebotado";
  const isDep = ve === "depositado";
  // State machine: only show valid actions
  const hasActions = isPending || (isRebotado && onRedepositar) || (isDep && role === "admin") || role === "admin";
  if (!hasActions) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="text-sm text-gray-400 hover:text-black transition min-h-[44px] px-1">&#x22EF;</button>
      {open && (<>
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg z-20 py-1 min-w-[160px]">
          {isPending && (
            <button onClick={() => { onRebotado(); setOpen(false); }} title="Cheque devuelto por el banco" className="block w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition min-h-[44px]">Marcar como rebotado (devuelto)</button>
          )}
          {isPending && cheque.whatsapp && (
            <button onClick={() => { onWA(); setOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-gray-50 transition min-h-[44px]" title="Enviar recordatorio por WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar WhatsApp
            </button>
          )}
          {isRebotado && onRedepositar && (
            <button onClick={() => { onRedepositar(); setOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-gray-50 transition min-h-[44px]">Re-depositar</button>
          )}
          {role === "admin" && (
            <button onClick={() => { onDelete(); setOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50 transition min-h-[44px]">Eliminar Cheque</button>
          )}
        </div>
      </>)}
    </div>
  );
}

export default function ChequesPageWrapper() {
  return <Suspense><ChequesPage /></Suspense>;
}

function ChequesPage() {
  const { authChecked, role } = useAuth({ moduleKey: "cheques", allowedRoles: ["admin","secretaria","upload","director"] });
  const searchParams = useSearchParams();
  const isOnline = useOnline();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [chequesCached, setChequesCached] = useState(false);
  const [loading, setLoading] = useState(true);
  usePersistedScroll("cheques", !loading && cheques.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    const urlFilter = searchParams.get("filter") as Filter | null;
    return urlFilter && VALID_FILTERS.includes(urlFilter) ? urlFilter : "all";
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "calendario">("lista");
  const [groupedView, setGroupedView] = useState(true);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calPopover, setCalPopover] = useState<string | null>(null);
  const [showResumen, setShowResumen] = useState(false);
  const [resumenSort, setResumenSort] = useState<"monto" | "count">("monto");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedVencidos, setSelectedVencidos] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<{ ids: Set<string>; clearFn: (v: Set<string>) => void } | null>(null);
  const [confirmDepositId, setConfirmDepositId] = useState<string | null>(null);
  const [kpiTooltip, setKpiTooltip] = useState<string | null>(null);

  // Undo actions
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  // Re-depositar loading
  const [redepositandoId, setRedepositandoId] = useState<string | null>(null);

  // Rebotado modal
  const [rebotandoId, setRebotandoId] = useState<string | null>(null);
  const [motivoRebote, setMotivoRebote] = useState("");

  // Directorio autocomplete
  const [dirClientes, setDirClientes] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Form fields
  const [fCliente, setFCliente] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fFecha, setFFecha] = useState(todayStr());
  const [fNotas, setFNotas] = useState("");
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [touchedCheque, setTouchedCheque] = useState<Record<string, boolean>>({});
  function handleChequeBlur(field: string) { setTouchedCheque((prev) => ({ ...prev, [field]: true })); }
  function chequeFieldError(field: string, value: string) { return touchedCheque[field] && !value.trim(); }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  // Draft auto-save for new cheque form
  const chequeDraftData = useMemo(() => ({
    cliente: fCliente, empresa: fEmpresa, numero: fNumero, monto: fMonto, fecha: fFecha,
  }), [fCliente, fEmpresa, fNumero, fMonto, fFecha]);
  const isChequeDraftEmpty = useCallback((d: typeof chequeDraftData) => {
    return !d.cliente && !d.empresa && !d.numero && !d.monto;
  }, []);
  const { draft: chequeDraft, hasDraft: hasChequeDraft, clearDraft: clearChequeDraft, draftTimeAgo: chequeDraftTimeAgo } = useDraftAutoSave("cheque", chequeDraftData, isChequeDraftEmpty);
  function restoreChequeDraft() {
    if (!chequeDraft) return;
    setFCliente(chequeDraft.cliente || "");
    setFEmpresa(chequeDraft.empresa || "");
    setFNumero(chequeDraft.numero || "");
    setFMonto(chequeDraft.monto || "");
    setFFecha(chequeDraft.fecha || todayStr());
    clearChequeDraft();
  }

  const { show: showContextMenu } = useContextMenu();

  function buildChequeContextMenu(c: Cheque, ve: string): ContextMenuItem[] {
    const isPending = ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido";
    const isRebotado = ve === "rebotado";
    const isDep = ve === "depositado";
    return [
      // Pendiente/Vencido: can deposit
      {
        label: "Confirmar deposito",
        shortcut: "D",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 4 12 14.01 9 11.01"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/></svg>,
        onClick: () => setConfirmDepositId(c.id),
        hidden: !isPending,
        dividerAfter: isPending,
      },
      // Pendiente/Vencido: can send WhatsApp (only if has phone)
      {
        label: "WhatsApp",
        shortcut: "W",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
        onClick: () => sendWhatsApp(c),
        hidden: !isPending || !c.whatsapp,
      },
      // Pendiente/Vencido: can mark rebotado
      {
        label: "Marcar como rebotado",
        shortcut: "B",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>,
        onClick: () => setRebotandoId(c.id),
        hidden: !isPending,
      },
      // Rebotado: can re-deposit
      {
        label: "Re-depositar",
        shortcut: "R",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
        onClick: () => redepositar(c.id),
        hidden: !isRebotado,
      },
      // Depositado: admin can delete (only valid action)
      // All states: admin can delete
      {
        label: "Eliminar",
        shortcut: "Del",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
        onClick: () => setConfirmDeleteId(c.id),
        destructive: true,
        hidden: role !== "admin" || (!isDep && !isPending && !isRebotado),
      },
    ];
  }

  const loadingRef = useRef(false);
  const loadCheques = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/cheques");
      if (res.ok) {
        const d = await res.json();
        const arr = Array.isArray(d) ? d : [];
        setCheques(arr);
        setChequesCached(false);
        // Cache last 50 cheques
        cacheSet(CACHE_KEYS.CHEQUES, arr.slice(0, 50));
      }
    } catch {
      // Offline — try cache
      const cached = cacheGet<Cheque[]>(CACHE_KEYS.CHEQUES);
      if (cached) {
        setCheques(cached);
        setChequesCached(true);
        showToast("Mostrando datos guardados. No se pudo actualizar.");
      } else {
        setError("No se pudieron cargar los cheques. Recarga la página.");
      }
    }
    finally { setLoading(false); loadingRef.current = false; }
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

  const today = todayStr();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Derive visual estado: pendiente + fecha < hoy → show as pendiente_vencido (NOT "vencido" — only the cron sets that in DB)
  function visualEstado(c: Cheque): string {
    if (c.estado === "pendiente" && c.fecha_deposito < today) return "pendiente_vencido";
    return c.estado;
  }

  // Urgency border class for color-coded left borders
  function urgencyBorder(c: Cheque, ve: string): string {
    if (ve === "depositado") return "border-l-4 border-l-emerald-400";
    if (ve === "pendiente_vencido" || ve === "vencido") return "border-l-4 border-l-red-700";
    if (ve === "pendiente" && c.fecha_deposito === today) return "border-l-4 border-l-red-500";
    if (ve === "pendiente" && c.fecha_deposito <= weekFromNow) return "border-l-4 border-l-amber-400";
    if (ve === "rebotado") return "border-l-4 border-l-red-700";
    return "";
  }

  // WhatsApp send handler (reusable)
  function sendWhatsApp(c: Cheque) {
    if (!c.whatsapp) { showToast("Este cliente no tiene WhatsApp registrado"); return; }
    let phone = (c.whatsapp || "").replace(/\D/g, "");
    if (!phone.startsWith("507") && phone.length <= 8) { phone = "507" + phone; }
    const msg = `Hola, le recordamos que tiene un cheque #${c.numero_cheque} por $${fmt(c.monto)} con fecha de deposito ${fmtDate(c.fecha_deposito)}.`;
    try { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank"); } catch { showToast("No se pudo abrir WhatsApp"); }
  }

  const pendientes = cheques.filter((c) => visualEstado(c) === "pendiente");
  const depositados = cheques.filter((c) => visualEstado(c) === "depositado");
  const vencidos = cheques.filter((c) => visualEstado(c) === "pendiente_vencido" || visualEstado(c) === "vencido");
  const rebotados = cheques.filter((c) => visualEstado(c) === "rebotado");
  const totalPendiente = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const proximo = pendientes.length > 0 ? pendientes[0].fecha_deposito : null;

  // Alert banners data
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const vencenHoy = cheques.filter((c) => c.fecha_deposito === today && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
  const vencenManana = cheques.filter((c) => c.fecha_deposito === tomorrow && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
  const vencenSemana = cheques.filter((c) => c.fecha_deposito >= today && c.fecha_deposito <= weekFromNow && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
  const totalVencenHoy = vencenHoy.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  // ── Smart suggestion: undeposited cheques ──
  const chequeSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (vencidos.length === 0) return [];
    const totalVencido = vencidos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    return [{
      id: `cheques-vencidos-${vencidos.length}`,
      message: `Tienes ${vencidos.length} cheque${vencidos.length > 1 ? "s" : ""} vencido${vencidos.length > 1 ? "s" : ""} sin depositar por $${fmt(totalVencido)}. ¿Marcarlos como depositados?`,
      actionLabel: "Depositar todos",
      onAction: () => {
        const ids = new Set(vencidos.map(c => c.id));
        setConfirmBatch({ ids, clearFn: setSelectedVencidos });
      },
    }];
  }, [vencidos]);

  const { suggestion: chequeSuggestion, dismiss: dismissCheque } = useSmartSuggestions(chequeSuggestions);

  if (!authChecked) return null;

  function resetForm() {
    setFCliente(""); setFEmpresa(""); setFNumero(""); setFMonto(""); setFFecha(todayStr()); setFNotas(""); setFWhatsapp(""); setEditingId(null); setEditingEstado(null); setError(null); setTouchedCheque({});
  }

  function startEdit(c: Cheque) {
    setFCliente(c.cliente); setFEmpresa(c.empresa); setFNumero(c.numero_cheque);
    setFMonto(String(c.monto)); setFFecha(c.fecha_deposito); setFNotas(c.notas); setFWhatsapp(c.whatsapp || ""); setEditingId(c.id); setEditingEstado(c.estado); setShowForm(true);
  }

  async function saveCheque() {
    if (!fCliente || !fEmpresa || !fNumero || !fMonto || !fFecha) { setError("Completa todos los campos obligatorios."); return; }
    if (parseFloat(fMonto) <= 0) { setError("El monto debe ser mayor a 0."); return; }
    setSaving(true); setError(null);
    const body = { cliente: fCliente, empresa: fEmpresa, numero_cheque: fNumero, monto: parseFloat(fMonto), fecha_deposito: fFecha, notas: fNotas, whatsapp: fWhatsapp };
    try {
      const url = editingId ? `/api/cheques/${editingId}` : "/api/cheques";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { clearChequeDraft(); resetForm(); setShowForm(false); loadCheques(); showToast(editingId ? "Listo, cheque actualizado" : "Listo, cheque guardado"); }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function depositar(id: string) {
    const cheque = cheques.find(c => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const hoy = todayStr();
    setCheques(prev => prev.map(c => c.id === id ? { ...c, estado: "depositado", fecha_depositado: hoy } : c));
    setConfirmDepositId(null);
    scheduleAction({
      id: `deposit-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} depositado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "depositado", fecha_depositado: hoy }) });
          if (!res.ok) { setCheques(snapshot); showToast("No se pudo depositar. Intenta de nuevo."); }
          else { /* deposited successfully */ }
        } catch { setCheques(snapshot); showToast("Sin conexion. Intenta de nuevo."); }
      },
      onRevert: () => setCheques(snapshot),
    });
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
    if (!cheque) return;
    const snapshot = [...cheques];
    const motivo = motivoRebote || null;
    setCheques(prev => prev.map(c => c.id === id ? { ...c, estado: "rebotado", motivo_rebote: motivo || undefined } : c));
    setRebotandoId(null);
    setMotivoRebote("");
    scheduleAction({
      id: `rebotado-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} marcado como rebotado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "rebotado", motivo_rebote: motivo }) });
          if (!res.ok) { setCheques(snapshot); showToast("No se pudo marcar como rebotado. Intenta de nuevo."); return; }
          if (cheque) {
            await fetch("/api/overrides", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nombre_normalized: cheque.cliente.toUpperCase().trim(),
                resultado_contacto: `⚠ Cheque rebotado: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivo || "Sin motivo"}`,
              }),
            }).catch(() => {});
          }
          loadCheques();
        } catch { setCheques(snapshot); showToast("Error de conexion. Intenta de nuevo."); }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  async function redepositar(id: string) {
    const cheque = cheques.find(c => c.id === id);
    if (!cheque) return;
    setRedepositandoId(id);
    const hoy = todayStr();
    const notaExtra = `Re-depósito desde rebote (${hoy})`;
    const notas = cheque.notas ? `${cheque.notas}\n${notaExtra}` : notaExtra;
    try {
      const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "pendiente", motivo_rebote: null, notas }) });
      if (!res.ok) { showToast("No se pudo re-depositar. Intenta de nuevo."); return; }
      showToast("Cheque marcado para re-depósito");
    } catch { showToast("Error de conexión. Intenta de nuevo."); }
    finally { setRedepositandoId(null); }
    loadCheques();
  }

  function deleteCheque(id: string) {
    const cheque = cheques.find(c => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    setCheques(prev => prev.filter(c => c.id !== id));
    scheduleAction({
      id: `delete-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} eliminado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, { method: "DELETE" });
          if (!res.ok) { setCheques(snapshot); showToast("No se pudo eliminar. Intenta de nuevo."); }
        } catch { setCheques(snapshot); showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function exportFilterLabel(): string {
    switch (filter) {
      case "pendiente": return "pendientes";
      case "depositado": return "depositados";
      case "vencido": return "vencidos";
      case "rebotado": return "rebotados";
      case "vencen_hoy": return "vencen hoy";
      case "vencen_manana": return "vencen mañana";
      case "vencen_semana": return "vencen esta semana";
      case "all": default: return "todos";
    }
  }

  function exportCheques() {
    const hoy = todayStr();
    const semana = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let data: Cheque[];
    switch (filter) {
      case "pendiente":
        data = cheques.filter((c) => visualEstado(c) === "pendiente");
        break;
      case "depositado":
        data = cheques.filter((c) => visualEstado(c) === "depositado");
        break;
      case "vencido":
        data = cheques.filter((c) => visualEstado(c) === "pendiente_vencido" || visualEstado(c) === "vencido");
        break;
      case "rebotado":
        data = cheques.filter((c) => visualEstado(c) === "rebotado");
        break;
      case "vencen_hoy":
        data = cheques.filter((c) => c.fecha_deposito === hoy && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
        break;
      case "vencen_manana": {
        const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        data = cheques.filter((c) => c.fecha_deposito === manana && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
        break;
      }
      case "vencen_semana":
        data = cheques.filter((c) => c.fecha_deposito >= hoy && c.fecha_deposito <= semana && visualEstado(c) !== "depositado" && visualEstado(c) !== "rebotado");
        break;
      case "all": default:
        data = cheques;
        break;
    }
    if (data.length === 0) { showToast("No hay cheques para exportar"); return; }
    const label = exportFilterLabel();
    const sheetName = label.charAt(0).toUpperCase() + label.slice(1);

    // Style helpers — matches Caja/Préstamos exports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B: any = { top: { style: "thin", color: { rgb: "D5DBDB" } }, bottom: { style: "thin", color: { rgb: "D5DBDB" } }, left: { style: "thin", color: { rgb: "D5DBDB" } }, right: { style: "thin", color: { rgb: "D5DBDB" } } };
    const ec = XLSX.utils.encode_cell;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws: any = {};
    const heights: number[] = [];
    let r = 0;

    // Title row — merged, bold, 14pt, navy bg
    for (let ci = 0; ci < 6; ci++) {
      ws[ec({ r, c: ci })] = {
        v: ci === 0 ? `FASHION GROUP — Cheques ${sheetName}` : "",
        t: "s",
        s: { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "1B3A5C" } }, alignment: { horizontal: "left", vertical: "center" } },
      };
    }
    heights[r] = 30;
    r++;

    // Spacer
    heights[r] = 6;
    r++;

    // Header row — navy bg, white bold
    const hdrs = ["Cliente", "Nº Cheque", "Monto", "Fecha Depósito", "WhatsApp"];
    hdrs.forEach((h, ci) => {
      ws[ec({ r, c: ci })] = {
        v: h, t: "s",
        s: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "1B3A5C" } }, alignment: { horizontal: ci === 2 ? "right" : "left", vertical: "center" }, border: B },
      };
    });
    heights[r] = 22;
    r++;

    // Data rows — alternating white / light gray
    let totalMonto = 0;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const alt = i % 2 === 1;
      const bg = alt ? "F8F9F9" : "FFFFFF";
      const cellS = (fg = "333333", sz = 10) => ({ font: { sz, color: { rgb: fg }, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left" as const }, border: B });

      ws[ec({ r, c: 0 })] = { v: ch.cliente, t: "s", s: cellS("111111") };
      ws[ec({ r, c: 1 })] = { v: ch.numero_cheque, t: "s", s: cellS("333333", 9) };
      ws[ec({ r, c: 2 })] = { v: ch.monto, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, color: { rgb: "333333" }, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "right" }, border: B } };
      ws[ec({ r, c: 3 })] = { v: fmtDate(ch.fecha_deposito), t: "s", s: cellS("555555", 9) };
      ws[ec({ r, c: 4 })] = { v: ch.whatsapp || "", t: "s", s: cellS("555555", 9) };
      totalMonto += Number(ch.monto) || 0;
      heights[r] = 18;
      r++;
    }

    // Spacer
    heights[r] = 6;
    r++;

    // Totals row
    for (let ci = 0; ci < 5; ci++) {
      const topB = { ...B, top: { style: "medium", color: { rgb: "1B3A5C" } } };
      if (ci === 1) {
        ws[ec({ r, c: ci })] = { v: "TOTAL", t: "s", s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "EBF0F0" } }, alignment: { horizontal: "right" }, border: topB } };
      } else if (ci === 2) {
        ws[ec({ r, c: ci })] = { v: totalMonto, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "EBF0F0" } }, alignment: { horizontal: "right" }, border: topB } };
      } else {
        ws[ec({ r, c: ci })] = { v: "", t: "s", s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "EBF0F0" } }, border: topB } };
      }
    }
    heights[r] = 22;
    r++;

    ws["!ref"] = `A1:E${r}`;
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
    ws["!rows"] = heights.map((h: number) => ({ hpt: h || 16 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cheques-${label.replace(/ /g, "-")}-${todayStr()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Excel listo — revisa tu carpeta de descargas");
  }

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
      case "vencen_manana": return vencenManana;
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
    <PullToRefresh onRefresh={loadCheques}>
    <div>
      <AppHeader module="Cheques Posfechados" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-light tracking-tight">Cheques Posfechados</h1>
          {chequesCached && <p className="text-xs text-amber-600 mt-0.5">(datos cacheados)</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={exportCheques} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-1.5 rounded-md active:bg-gray-100 transition-all">
            ↓ Exportar {exportFilterLabel()}
          </button>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} disabled={!isOnline} title={!isOnline ? "Sin conexion" : undefined} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center mb-1">
                <div className="text-xs uppercase tracking-widest text-gray-500">Total a cobrar</div>
                <button onClick={() => setKpiTooltip(kpiTooltip === "total" ? null : "total")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
              </div>
              <div className="text-xl font-semibold tabular-nums">$<AnimatedNumber value={totalPendiente} formatter={(n: number) => fmt(n)} /></div>
              <div className="text-xs text-gray-400 mt-0.5">{pendientes.length} cheques</div>
              {kpiTooltip === "total" && <p className="text-xs text-gray-500 mt-1">Suma de todos los cheques pendientes de cobro</p>}
            </div>
            <div className={`rounded-lg p-3 border border-gray-200 ${vencenSemanaKPI.length > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="flex items-center mb-1">
                <div className="text-xs uppercase tracking-widest text-gray-500">Vencen esta semana</div>
                <button onClick={() => setKpiTooltip(kpiTooltip === "semana" ? null : "semana")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
              </div>
              <div className={`text-xl font-semibold tabular-nums ${vencenSemanaKPI.length > 0 ? "text-amber-600" : ""}`}>{vencenSemanaKPI.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(vencenSemanaKPI.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
              {kpiTooltip === "semana" && <p className="text-xs text-gray-500 mt-1">Cheques que se pueden depositar esta semana</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center mb-1">
                <div className="text-xs uppercase tracking-widest text-gray-500">Próximo depósito</div>
                <button onClick={() => setKpiTooltip(kpiTooltip === "proximo" ? null : "proximo")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
              </div>
              <div className="text-xl font-semibold">{proximo ? fmtDate(proximo) : "—"}</div>
              {kpiTooltip === "proximo" && <p className="text-xs text-gray-500 mt-1">Fecha del próximo cheque que vence</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center mb-1">
                <div className="text-xs uppercase tracking-widest text-gray-500">Depositados</div>
                <button onClick={() => setKpiTooltip(kpiTooltip === "depositados" ? null : "depositados")} className="text-gray-300 hover:text-gray-500 text-xs ml-1">?</button>
              </div>
              <div className="text-xl font-semibold tabular-nums text-green-600"><AnimatedNumber value={depositados.length} /></div>
              <div className="text-xs text-gray-400 mt-0.5">${fmt(depositados.reduce((s, c) => s + (Number(c.monto) || 0), 0))}</div>
              {kpiTooltip === "depositados" && <p className="text-xs text-gray-500 mt-1">Cheques ya depositados en el banco</p>}
            </div>
          </div>
        );
      })()}

      {chequeSuggestion && <SuggestionCard suggestion={chequeSuggestion} onDismiss={dismissCheque} />}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-8 overflow-visible">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">{editingId ? "Editar Cheque" : "Nuevo Cheque"}</div>
          {hasChequeDraft && !editingId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800">Tienes un borrador guardado de {chequeDraftTimeAgo}. ¿Restaurar?</p>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button onClick={restoreChequeDraft} className="bg-black text-white text-sm px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Restaurar</button>
                <button onClick={clearChequeDraft} className="text-sm text-amber-700 hover:text-amber-900 transition">Descartar</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 overflow-visible">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Cliente <span className="text-red-500">*</span></label>
              <div className="relative">
                <input type="text" value={fCliente} onChange={(e) => { setFCliente(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); handleChequeBlur("cliente"); }} className={`w-full border-b ${chequeFieldError("cliente", fCliente) ? "border-red-400" : "border-gray-200"} py-2 text-sm outline-none bg-transparent focus:border-black transition`} />
                {showSuggestions && fCliente.length >= 2 && (() => {
                  const matches = dirClientes.filter(n => n.toLowerCase().includes(fCliente.toLowerCase())).slice(0, 5);
                  return matches.length > 0 ? (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg z-50 mt-1">
                      {matches.map(n => (
                        <button key={n} onMouseDown={() => { setFCliente(n); setShowSuggestions(false); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition">{n}</button>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              {chequeFieldError("cliente", fCliente) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa <span className="text-red-500">*</span></label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} onBlur={() => handleChequeBlur("empresa")} className={`border-b ${chequeFieldError("empresa", fEmpresa) ? "border-red-400" : "border-gray-200"} py-2 text-sm outline-none bg-transparent focus:border-black transition`}>
                <option value="">Seleccionar...</option>
                {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              {chequeFieldError("empresa", fEmpresa) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Cheque <span className="text-red-500">*</span></label>
              <input type="text" value={fNumero} onChange={(e) => setFNumero(e.target.value)} onBlur={() => handleChequeBlur("numero")} className={`border-b ${chequeFieldError("numero", fNumero) ? "border-red-400" : "border-gray-200"} py-2 text-sm outline-none bg-transparent focus:border-black transition`} />
              {chequeFieldError("numero", fNumero) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Monto <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={fMonto} onChange={(e) => setFMonto(e.target.value)} onBlur={() => handleChequeBlur("monto")} className={`border-b ${chequeFieldError("monto", fMonto) ? "border-red-400" : "border-gray-200"} py-2 text-sm outline-none bg-transparent focus:border-black transition`} />
              {chequeFieldError("monto", fMonto) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha Depósito <span className="text-red-500">*</span></label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} onBlur={() => handleChequeBlur("fecha")} className={`border-b ${chequeFieldError("fecha", fFecha) ? "border-red-400" : "border-gray-200"} py-2 text-sm outline-none bg-transparent focus:border-black transition`} />
              {chequeFieldError("fecha", fFecha) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
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
            <button onClick={saveCheque} disabled={saving || !isOnline} title={!isOnline ? "Sin conexion" : undefined} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed">{!isOnline ? "Sin conexion" : saving ? "Guardando..." : "Guardar Cheque"}</button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-full p-0.5 w-fit">
        <button onClick={() => setViewMode("lista")} className={`py-1.5 px-4 text-xs rounded-full transition ${viewMode === "lista" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Lista</button>
        <button onClick={() => setViewMode("calendario")} className={`py-1.5 px-4 text-xs rounded-full transition ${viewMode === "calendario" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Calendario</button>
        </div>
        {viewMode === "lista" && (
          <button onClick={() => setGroupedView(!groupedView)} className={`text-xs transition ${groupedView ? "text-black font-medium" : "text-gray-400 hover:text-black"}`}>
            {groupedView ? "Lista plana" : "Agrupar por fecha"}
          </button>
        )}
      </div>

      {/* Filter tabs + search — CAMBIO 40 search by cliente */}
      {viewMode === "lista" && <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          {([
            ["all", "Todos", cheques.length, ""],
            ["pendiente", "Pendientes", pendientes.length, "Cheques pendientes de depositar"],
            ["depositado", "Depositados", depositados.length, "Cheques ya depositados en el banco"],
            ["vencido", "Vencidos", vencidos.length, "Pasó la fecha de depósito y no se han depositado"],
            ["rebotado", "Rebotados", rebotados.length, "El banco rechazó el cheque"],
          ] as [Filter, string, number, string][]).map(([key, label, count, tooltip]) => (
            <button key={key} onClick={() => setFilter(key)}
              title={tooltip}
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
            className="text-sm border border-gray-200 rounded-full px-4 py-1.5 outline-none focus:border-black transition w-full max-w-xs"
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
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex gap-3 mb-3">
                <button onClick={() => setResumenSort("monto")} className={`text-xs transition ${resumenSort === "monto" ? "font-medium text-black" : "text-gray-400"}`}>Por monto</button>
                <button onClick={() => setResumenSort("count")} className={`text-xs transition ${resumenSort === "count" ? "font-medium text-black" : "text-gray-400"}`}>Por cantidad</button>
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-500">
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Marcar como Rebotado</div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Motivo (opcional)</label>
            <textarea
              value={motivoRebote}
              onChange={(e) => setMotivoRebote(e.target.value)}
              rows={3}
              placeholder="Fondos insuficientes, firma incorrecta, etc."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-black transition resize-none mt-1 min-h-[48px]"
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
          if (estado === "pendiente_vencido") return "bg-amber-100 text-amber-700";
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
                <button onClick={goPrev} className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">‹</button>
                <h2 className="text-sm font-medium capitalize w-40 text-center">{monthLabel}</h2>
                <button onClick={goNext} className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">›</button>
                <button onClick={goToday} className="text-xs text-gray-400 hover:text-black transition ml-2">Hoy</button>
              </div>
              <span className="text-xs text-gray-400">{monthCheques.length} cheques · ${fmt(totalMonth)}</span>
            </div>

            {/* Desktop grid */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-7 text-center text-xs text-gray-500 uppercase tracking-wider mb-1">
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
                              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg p-3 w-56" onClick={e => e.stopPropagation()}>
                                <div className="text-xs font-medium mb-1">{c.cliente}</div>
                                <div className="text-[11px] text-gray-500 mb-0.5">N° {c.numero_cheque}</div>
                                <div className="text-sm font-semibold mb-2">${fmt(c.monto)}</div>
                                <StatusBadge estado={ve} />
                                {(ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido") && (
                                  <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                                    <button onClick={() => { setConfirmDepositId(c.id); setCalPopover(null); }} className="text-[11px] text-emerald-600 hover:underline">Confirmar depósito</button>
                                    <button onClick={() => { setRebotandoId(c.id); setCalPopover(null); }} title="Cheque devuelto por el banco" className="text-[11px] text-red-500 hover:underline">Rebotado</button>
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
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${pillColor(ve)}`}>{ve === "pendiente_vencido" ? "vencido" : ve}</span>
                              <span className="text-sm truncate">{c.cliente}</span>
                            </div>
                            <span className="text-sm font-medium tabular-nums ml-2">${fmt(c.monto)}</span>
                          </div>
                          {(ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido") && (
                            <div className="flex gap-3 mt-1 ml-1">
                              <button onClick={() => setConfirmDepositId(c.id)} className="text-xs text-emerald-600 hover:underline py-1">Confirmar depósito</button>
                              <button onClick={() => setRebotandoId(c.id)} title="Cheque devuelto por el banco" className="text-xs text-red-500 hover:underline py-1">Rebotado</button>
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
        cheques.length === 0 ? (
          <EmptyState
            title="No hay cheques registrados"
            subtitle="Registra el primer cheque posfechado"
            actionLabel="+ Nuevo Cheque"
            onAction={() => setShowForm(true)}
          />
        ) : (
          <div className="flex flex-col items-center py-16 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200 mb-3">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-sm text-gray-500 mb-1">
              {search
                ? `No encontramos cheques para "${search}"`
                : `No hay cheques ${filter === "pendiente" ? "pendientes" : filter === "depositado" ? "depositados" : filter === "vencido" ? "vencidos" : filter === "rebotado" ? "rebotados" : filter === "vencen_hoy" ? "que vencen hoy" : filter === "vencen_semana" ? "que vencen esta semana" : ""}`
              }
            </p>
            <p className="text-xs text-gray-400 mb-4">{search ? "Revisa el nombre del cliente o numero de cheque" : "Prueba con otro filtro"}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  ["all", "Todos"],
                  ["pendiente", "Pendientes"],
                  ["depositado", "Depositados"],
                  ["vencido", "Vencidos"],
                  ["rebotado", "Rebotados"],
                ] as [Filter, string][]
              )
                .filter(([key]) => key !== filter)
                .map(([key, label]) => {
                  const count = key === "all" ? cheques.length : key === "pendiente" ? pendientes.length : key === "depositado" ? depositados.length : key === "vencido" ? vencidos.length : rebotados.length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => { setFilter(key); setSearch(""); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition"
                    >
                      {label} <span className="text-gray-300 ml-0.5">{count}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )
      ) : (
        <>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-sm text-emerald-700">{selectedIds.size} pendiente{selectedIds.size > 1 ? "s" : ""} seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
            <button onClick={() => setConfirmBatch({ ids: selectedIds, clearFn: setSelectedIds })} disabled={batchProcessing} className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-md hover:bg-emerald-700 transition disabled:opacity-50">
              {batchProcessing ? "Procesando..." : "Marcar depositados"}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        )}
        {selectedVencidos.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-sm text-amber-700">{selectedVencidos.size} vencido{selectedVencidos.size > 1 ? "s" : ""} seleccionado{selectedVencidos.size > 1 ? "s" : ""}</span>
            <button onClick={() => setConfirmBatch({ ids: selectedVencidos, clearFn: setSelectedVencidos })} disabled={batchProcessing} className="text-xs bg-amber-600 text-white px-4 py-1.5 rounded-md hover:bg-amber-700 transition disabled:opacity-50">
              {batchProcessing ? "Procesando..." : "Depositar seleccionados"}
            </button>
            <button onClick={() => setSelectedVencidos(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
        )}
        {/* Mobile card list with swipe-to-deposit */}
        <div className="sm:hidden space-y-1.5">
          {filtered.map((c) => {
            const ve = visualEstado(c);
            const isPending = ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido";
            const isRebotado = ve === "rebotado";
            const depositSwipe: SwipeAction | undefined = isPending ? {
              label: "Depositar",
              color: "bg-emerald-500",
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
              onAction: () => setConfirmDepositId(c.id),
            } : undefined;
            const card = (
              <div className={`px-4 py-3 ${ve === "depositado" ? "opacity-60" : ""}`} onClick={() => startEdit(c)}>
                {/* Row 1: Banco + Monto + WhatsApp */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{c.cliente}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPending && c.whatsapp && (
                      <button
                        onClick={(e) => { e.stopPropagation(); sendWhatsApp(c); }}
                        className="w-[36px] h-[36px] min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-emerald-500 text-white active:scale-[0.95] transition-transform"
                        title="Enviar WhatsApp"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </button>
                    )}
                    <span className="text-sm font-semibold tabular-nums">${fmt(c.monto)}</span>
                  </div>
                </div>
                {/* Row 2: fecha, status */}
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge estado={ve} />
                  <span className="text-xs text-gray-400 ml-auto">{fmtDate(c.fecha_deposito)}</span>
                </div>
                {/* Row 3: Secondary info */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-gray-400">N° {c.numero_cheque}</span>
                  <span className="text-[11px] text-gray-400">· {c.empresa}</span>
                </div>
                {/* State-valid actions with inline guide */}
                {ve === "depositado" && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setRebotandoId(c.id); }} className="text-xs text-gray-500 hover:text-red-600 font-medium py-1 min-h-[44px] flex items-center gap-1.5 transition">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
                      Marcar como rebotado
                    </button>
                    <span className="text-[10px] text-gray-300">Si el banco lo devolvio</span>
                  </div>
                )}
                {isRebotado && (
                  <div className="mt-2 pt-2 border-t border-red-100 bg-red-50/40 -mx-4 px-4 pb-1 rounded-b-lg">
                    <div className="text-[10px] text-red-400 mb-1">Este cheque reboto{c.motivo_rebote ? ` — ${c.motivo_rebote}` : ""}</div>
                    <button onClick={(e) => { e.stopPropagation(); redepositar(c.id); }} disabled={redepositandoId === c.id} className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-md font-medium min-h-[44px] flex items-center gap-1.5 hover:bg-emerald-700 transition disabled:opacity-40">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      {redepositandoId === c.id ? "Re-depositando..." : "Re-depositar cheque"}
                    </button>
                  </div>
                )}
              </div>
            );
            return depositSwipe ? (
              <SwipeableRow key={c.id} rightAction={depositSwipe} className={`border border-gray-200 rounded-lg ${urgencyBorder(c, ve)}`}>
                {card}
              </SwipeableRow>
            ) : (
              <div key={c.id} className={`border border-gray-200 rounded-lg ${urgencyBorder(c, ve)}`}>
                {card}
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="min-w-[700px]">
        {(() => {
          const _gm = filter === "depositado" ? "depositado" as const : "pendiente" as const;
          const _df = filter === "depositado" ? "fecha_depositado" as keyof Cheque : "fecha_deposito" as keyof Cheque;
          const _cg = filter === "all" || filter === "pendiente" || filter === "depositado";
          const _tg = groupedView && _cg ? groupByTimePeriod(filtered, _df, _gm) : null;
          const _th = (<thead className="sticky top-0 bg-white z-10"><tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-500"><th className="text-left py-3 px-4 font-normal">Fecha Depósito</th><th className="text-left py-3 px-4 font-normal">Cliente</th><th className="text-left py-3 px-4 font-normal hidden lg:table-cell">Empresa</th><th className="text-left py-3 px-4 font-normal hidden lg:table-cell">N° Cheque</th><th className="text-right py-3 px-4 font-normal">Monto</th><th className="text-left py-3 px-4 font-normal">Estado</th><th className="text-right py-3 px-4 font-normal"></th></tr></thead>);
          const _rr = (c: Cheque) => {
              const ve = visualEstado(c);
              const isPending = ve === "pendiente" || ve === "pendiente_vencido" || ve === "vencido";
              const isDep = ve === "depositado";
              const isRebotado = ve === "rebotado";
              return (
                <tr key={c.id} className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${urgencyBorder(c, ve)} ${isDep ? "text-gray-400" : isRebotado ? "bg-red-50/20" : ""}`} onContextMenu={(e) => showContextMenu(e, buildChequeContextMenu(c, ve))}>
                  {ve === "pendiente" && (
                    <td className="py-3 pl-2 pr-0 w-8">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-emerald-600 w-3.5 h-3.5" />
                    </td>
                  )}
                  {(ve === "pendiente_vencido" || ve === "vencido") && (
                    <td className="py-3 pl-2 pr-0 w-8">
                      <input type="checkbox" checked={selectedVencidos.has(c.id)} onChange={() => toggleSelectVencido(c.id)} className="accent-amber-600 w-3.5 h-3.5" />
                    </td>
                  )}
                  <td className="py-3 px-4">{fmtDate(c.fecha_deposito)}</td>
                  <td className="py-3 px-4 font-medium">{c.cliente}</td>
                  <td className="py-3 px-4 text-gray-500 hidden lg:table-cell">{c.empresa}</td>
                  <td className="py-3 px-4 text-gray-500 hidden lg:table-cell">{c.numero_cheque}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(c.monto)}</td>
                  <td className="py-3 px-4">
                    <StatusBadge estado={ve} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                    {/* Inline WhatsApp button for pending cheques with phone */}
                    {isPending && c.whatsapp && (
                      <button
                        onClick={() => sendWhatsApp(c)}
                        className="w-8 h-8 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.95] transition-all"
                        title="Enviar WhatsApp"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </button>
                    )}
                    {/* State machine: only show valid primary actions */}
                    {isPending && (
                      <button onClick={() => setConfirmDepositId(c.id)} disabled={!isOnline} title={!isOnline ? "Sin conexion" : undefined} className="text-sm text-gray-500 hover:text-black transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed">Confirmar depósito</button>
                    )}
                    {isDep && (
                      <button onClick={() => setRebotandoId(c.id)} disabled={!isOnline} title="Si el banco devolvio este cheque, marcalo como rebotado" className="text-xs text-gray-400 hover:text-red-500 transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
                        Rebotado
                      </button>
                    )}
                    {isRebotado && (
                      <button onClick={() => redepositar(c.id)} disabled={!isOnline || redepositandoId === c.id} title="Este cheque reboto. Click para re-depositarlo." className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded-md transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        {redepositandoId === c.id ? "Re-depositando..." : "Re-depositar"}
                      </button>
                    )}
                    <button onClick={() => startEdit(c)} disabled={!isOnline} title={!isOnline ? "Sin conexion" : undefined} className="text-sm text-gray-500 hover:text-black transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed">Editar</button>
                    <ChequeMoreMenu
                      cheque={c}
                      ve={ve}
                      role={role}
                      onRebotado={() => setRebotandoId(c.id)}
                      onWA={() => sendWhatsApp(c)}
                      onDelete={() => setConfirmDeleteId(c.id)}
                      onRedepositar={isRebotado ? () => redepositar(c.id) : undefined}
                    />
                    </div>
                  </td>
                </tr>
              );
          };
          return _tg ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {_tg.map((g) => (
                <TimeGroupHeader key={g.key} label={g.label} count={g.items.length} color={g.color} bgColor={g.bgColor}>
                  <table className="w-full text-sm">{_th}<tbody>{g.items.map(_rr)}</tbody></table>
                </TimeGroupHeader>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">{_th}<tbody>{filtered.map(_rr)}</tbody></table>
          );
        })()}
          </div>
        </div>
        </>
      ))}
      <Toast message={error} type="error" />
      <Toast message={toast} />
      {pendingUndo && <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />}
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
    </PullToRefresh>
  );
}
