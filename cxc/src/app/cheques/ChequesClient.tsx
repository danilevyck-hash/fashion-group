"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, Fragment, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import { SkeletonTable, EmptyState, Toast, StatusBadge, ConfirmModal, ConfirmDeleteModal, Modal, AnimatedNumber, useContextMenu, PullToRefresh, SwipeableRow } from "@/components/ui";
import type { ContextMenuItem, SwipeAction } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import ChequeFormModal, { chequeFormVacio, type ChequeFormValues } from "./components/ChequeFormModal";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { fmt, fmtDate } from "@/lib/format";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";

import { getCompanyDisplay } from "@/lib/companies";
import { getVencenSemanaRange } from "@/lib/cheques-dates";
import { useAuth } from "@/lib/hooks/useAuth";
import { borrarBorrador } from "@/lib/hooks/useDraftAutoSave";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import SuggestionCard from "@/components/SuggestionCard";
import { useOnline } from "@/lib/OnlineContext";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

export interface ChequesInitialData {
  cheques: Cheque[];
}

export interface Cheque {
  id: string;
  cliente: string;
  empresa: string;
  banco: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  notas: string;
  vendedor: string;
  estado: string;
  motivo_rebote?: string;
  fecha_depositado: string | null;
  created_at: string;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

/** Color de la píldora del calendario. A nivel de módulo porque lo usan la
 *  píldora (componente propio desde el arreglo del globo) y la lista del día. */
function pillColor(estado: string) {
  if (estado === "pendiente") return "bg-emerald-100 text-emerald-700";
  if (estado === "vencido") return "bg-red-100 text-red-700";
  if (estado === "rebotado") return "bg-red-50 text-red-400";
  return "bg-gray-100 text-gray-500";
}

type Filter = "pendiente" | "depositado" | "vencido" | "rebotado" | "vencen_hoy" | "vencen_manana" | "vencen_semana";
const VALID_FILTERS: Filter[] = ["pendiente", "depositado", "vencido", "rebotado", "vencen_hoy", "vencen_manana", "vencen_semana"];

/**
 * Píldora de un cheque dentro de una casilla del calendario, con su globo de
 * detalle.
 *
 * 🩸 El globo FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Era
 * `absolute top-full` dentro de una casilla de `min-h-[80px]`, y en las últimas
 * semanas del mes eso lo dejaba FUERA DE LA PANTALLA: medido a 1440×900,
 * **138 px por debajo del borde de abajo** — o sea que "Confirmar depósito" y
 * "Rebotado" quedaban donde nadie los podía tocar. Ahora, si abajo no alcanza,
 * se abre hacia arriba. Se extrajo a su propio componente porque cada píldora
 * necesita SU ancla (un `ref` por celda). Ver `DesplegableFlotante`.
 */
function ChequeCalendarioPill({
  cheque, ve, abierto, onAbrir, onCerrar, onDepositar, onRebotado,
}: {
  cheque: Cheque; ve: string; abierto: boolean;
  onAbrir: () => void; onCerrar: () => void;
  onDepositar: () => void; onRebotado: () => void;
}) {
  const pillRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      {/* 🩸 El nombre y el MONTO iban en la misma línea con `truncate`, y en una
          casilla de calendario (7 columnas: ~80 px en un iPad de 834) el monto
          quedaba fuera del recorte: "Jerusalem De… $29,476.28" perdía 121 px a
          834 y 113 a 1440 — el número no se podía leer y encima parecía
          completo. Ahora el monto tiene su propio renglón y siempre entra; lo
          único que se acorta es el nombre, que es el mecanismo del "…" bien
          usado (y el globo de detalle lo muestra entero). */}
      <button ref={pillRef} onClick={onAbrir}
        title={`N° ${cheque.numero_cheque} · $${fmt(cheque.monto)} · ${cheque.cliente}`}
        className={`w-full text-left text-xs px-1.5 py-0.5 rounded ${pillColor(ve)}`}>
        <span className="flex items-center gap-1 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ve === "depositado" ? "bg-gray-400" : ve === "pendiente" ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="truncate">{cheque.cliente}</span>
        </span>
        <span className="block tabular-nums font-medium">${fmt(cheque.monto)}</span>
      </button>
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={pillRef}
        onCerrar={onCerrar}
        marca="cheque-calendario"
        ancho={224}
        className="bg-white border border-gray-200 rounded-lg shadow-lg p-3"
      >
        <div onClick={e => e.stopPropagation()}>
          <div className="text-xs font-medium mb-1">{cheque.cliente}</div>
          <div className="text-xs text-gray-500 mb-0.5">N° {cheque.numero_cheque}</div>
          <div className="text-sm font-semibold mb-2">${fmt(cheque.monto)}</div>
          <StatusBadge estado={ve} />
          {(ve === "pendiente" || ve === "vencido") && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
              <button onClick={onDepositar} className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center">Confirmar depósito</button>
              <button onClick={onRebotado} title="Cheque devuelto por el banco" className="text-xs text-red-500 hover:underline min-h-[44px] inline-flex items-center">Rebotado</button>
            </div>
          )}
        </div>
      </DesplegableFlotante>
    </div>
  );
}

/**
 * Menú ⋯ de la fila de un cheque.
 *
 * 🩸 FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Era `absolute
 * top-full` dentro de un `<td>`, y esa tabla vive en un `overflow-x-auto` y
 * encima tiene `overflow-hidden` propio (por el `rounded-lg`). Medido en el
 * navegador, abriendo el menú de la primera fila:
 *
 *   121 px del menú RECORTADOS por la TABLE, a 834 px y a 1440 px
 *   +206 px de desplazamiento de las columnas a 834 px
 *
 * O sea, de las 2-3 acciones se veía la primera y media. El `alignRight`
 * calculado a mano ya no hace falta: `DesplegableFlotante` acota el panel a la
 * pantalla por los dos lados. Ver ese componente.
 */
function ChequeMoreMenu({ cheque, ve, role, onRebotado, onDelete, onRedepositar }: {
  cheque: Cheque; ve: string; role: string;
  onRebotado: () => void; onDelete: () => void; onRedepositar?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isPending = ve === "pendiente" || ve === "vencido";
  const isRebotado = ve === "rebotado";
  const isDep = ve === "depositado";
  // State machine: only show valid actions. Depositados no se pueden eliminar (data histórica).
  const canDelete = role === "admin" && !isDep;
  const hasActions = isPending || (isRebotado && onRedepositar) || canDelete;

  if (!hasActions) return null;
  return (
    <div className="relative">
      {/* Tenía min-h pero no ANCHO: medía 12×44 y el dedo no le acierta. */}
      <button ref={triggerRef} onClick={() => setOpen(!open)} aria-label="Más acciones" className="inline-flex h-11 w-11 items-center justify-center text-sm text-gray-400 hover:text-black transition">&#x22EF;</button>
      <DesplegableFlotante
        abierto={open}
        anclaRef={triggerRef}
        onCerrar={() => setOpen(false)}
        role="menu"
        marca="cheque-fila"
        ancho={240}
        alinear="derecha"
        className="bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      >
        {isPending && (
          <button role="menuitem" onClick={() => { onRebotado(); setOpen(false); }} title="Cheque devuelto por el banco" className="flex w-full items-center text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition min-h-[44px]">Marcar como rebotado (devuelto)</button>
        )}
        {isRebotado && onRedepositar && (
          <button role="menuitem" onClick={() => { onRedepositar(); setOpen(false); }} className="flex w-full items-center text-left px-3 py-2 text-sm text-emerald-600 hover:bg-gray-50 transition min-h-[44px]">Re-depositar</button>
        )}
        {canDelete && (
          <button role="menuitem" onClick={() => { onDelete(); setOpen(false); }} className="flex w-full items-center text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50 transition min-h-[44px]">Eliminar Cheque</button>
        )}
      </DesplegableFlotante>
    </div>
  );
}

export default function ChequesClient({ initialData }: { initialData: ChequesInitialData }) {
  return <Suspense><ChequesPage initialData={initialData} /></Suspense>;
}

function ChequesPage({ initialData }: { initialData: ChequesInitialData }) {
  const { authChecked, role } = useAuth({ moduleKey: "cheques", allowedRoles: ["admin","secretaria"] });
  const searchParams = useSearchParams();
  const isOnline = useOnline();
  const [cheques, setCheques] = useState<Cheque[]>(initialData.cheques);
  const [loading, setLoading] = useState(false);
  usePersistedScroll("cheques", !loading && cheques.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    const urlFilter = searchParams.get("filter") as Filter | null;
    return urlFilter && VALID_FILTERS.includes(urlFilter) ? urlFilter : "pendiente";
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Vista (lista/calendario) en la URL (?view=calendario) para sobrevivir
  // refresh/back. Preserva el param ?filter existente.
  const [viewMode, setViewMode] = useUrlState<"lista" | "calendario">("view", "lista");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calPopover, setCalPopover] = useState<string | null>(null);
  const [dayChequesModal, setDayChequesModal] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedVencidos, setSelectedVencidos] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<{ ids: Set<string>; clearFn: (v: Set<string>) => void } | null>(null);
  const [confirmDepositId, setConfirmDepositId] = useState<string | null>(null);
  const [detailCheque, setDetailCheque] = useState<Cheque | null>(null);

  // Undo actions
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  // Re-depositar loading

  // Rebotado modal
  const [rebotandoId, setRebotandoId] = useState<string | null>(null);
  const [motivoRebote, setMotivoRebote] = useState("");

  // Valores con los que se abre el formulario. El estado de los campos vive
  // DENTRO de ChequeFormModal: acá solo se dice con qué arranca.
  const [formInitial, setFormInitial] = useState<ChequeFormValues>(chequeFormVacio);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const { show: showContextMenu } = useContextMenu();

  function buildChequeContextMenu(c: Cheque, ve: string): ContextMenuItem[] {
    const isPending = ve === "pendiente" || ve === "vencido";
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
      // Admin puede eliminar pendiente/vencido/rebotado. NO depositado (data histórica).
      {
        label: "Eliminar",
        shortcut: "Del",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
        onClick: () => setConfirmDeleteId(c.id),
        destructive: true,
        hidden: role !== "admin" || isDep || (!isPending && !isRebotado),
      },
    ];
  }

  const loadingRef = useRef(false);
  // Espejo en ref para leer el largo actual dentro del callback (deps vacías)
  // sin recrearlo cuando cambian los cheques.
  const chequesLenRef = useRef(initialData.cheques.length);
  useEffect(() => { chequesLenRef.current = cheques.length; }, [cheques]);
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
      }
    } catch {
      // Sin red: mantener lo que ya está en pantalla y avisar.
      if (chequesLenRef.current > 0) {
        showToast("No se pudo actualizar. Verifica tu conexión.");
      } else {
        setError("No se pudieron cargar los cheques. Recarga la página.");
      }
    }
    finally { setLoading(false); loadingRef.current = false; }
  }, []);

  // Skipear el primer mount cuando ya tenemos initialData del SSR (fresco);
  // solo refetch en mounts subsiguientes.
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    loadCheques();
  }, [authChecked, loadCheques, initialData.cheques]);

  // ESC cierra el modal de "ver todos" los cheques del día
  useEffect(() => {
    if (!dayChequesModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDayChequesModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayChequesModal]);

  const today = todayStr();
  const weekFromNow = getVencenSemanaRange(today).end;

  // Derive visual estado: pendiente + fecha < hoy → "vencido" (calculado runtime;
  // el estado "vencido" ya no existe en DB desde bug #6 audit).
  function visualEstado(c: Cheque): string {
    if (c.estado === "pendiente" && c.fecha_deposito < today) return "vencido";
    return c.estado;
  }

  // Urgency border class for color-coded left borders
  function urgencyBorder(c: Cheque, ve: string): string {
    if (ve === "depositado") return "border-l-4 border-l-emerald-400";
    if (ve === "vencido") return "border-l-4 border-l-red-700";
    if (ve === "pendiente" && c.fecha_deposito === today) return "border-l-4 border-l-red-500";
    if (ve === "pendiente" && c.fecha_deposito <= weekFromNow) return "border-l-4 border-l-amber-400";
    if (ve === "rebotado") return "border-l-4 border-l-red-700";
    return "";
  }


  const pendientes = cheques.filter((c) => visualEstado(c) === "pendiente");
  const depositados = cheques.filter((c) => visualEstado(c) === "depositado");
  const vencidos = cheques.filter((c) => visualEstado(c) === "vencido");
  const rebotados = cheques.filter((c) => visualEstado(c) === "rebotado");
  const totalPendiente = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);

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

  // Modal de rebotado: tiene el motivo escrito a mano, así que usa el cierre de
  // formulario — si ya escribió algo, el clic fuera y el Escape no se lo borran.
  // Cerrar siempre equivale a Cancelar, nunca marca el cheque como rebotado.
  const cerrarRebote = useCallback(() => { setRebotandoId(null); setMotivoRebote(""); }, []);
  const { panelRef: rebotePanelRef, backdrop: reboteBackdrop } = useFormModalDismiss(!!rebotandoId, cerrarRebote);

  if (!authChecked) return null;

  function resetForm() {
    setFormInitial(chequeFormVacio()); setEditingId(null); setEditingEstado(null); setError(null);
  }

  function startEdit(c: Cheque) {
    // El cheque guardado manda: su cliente y su vendedor se muestran tal cual
    // están, aunque el vendedor ya no figure en la lista de hoy.
    setFormInitial({
      cliente: c.cliente,
      empresa: c.empresa,
      numero_cheque: c.numero_cheque,
      monto: String(c.monto),
      fecha_deposito: c.fecha_deposito,
      notas: c.notas || "",
      vendedor: c.vendedor || "",
    });
    setEditingId(c.id); setEditingEstado(c.estado); setError(null); setShowForm(true);
  }

  function cerrarForm() { resetForm(); setShowForm(false); }

  async function saveCheque(v: ChequeFormValues) {
    if (!v.cliente.trim() || !v.empresa || !v.numero_cheque.trim() || !v.monto || !v.fecha_deposito || !v.vendedor.trim()) {
      setError("Completa todos los campos obligatorios."); return;
    }
    if (parseFloat(v.monto) <= 0) { setError("El monto debe ser mayor a 0."); return; }
    setSaving(true); setError(null);
    const body = { cliente: v.cliente.trim(), empresa: v.empresa, numero_cheque: v.numero_cheque.trim(), monto: parseFloat(v.monto), fecha_deposito: v.fecha_deposito, notas: v.notas, vendedor: v.vendedor.trim() };
    try {
      const url = editingId ? `/api/cheques/${editingId}` : "/api/cheques";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        // El borrador se borra desde acá: el modal (que es quien lo escribe) se
        // desmonta al cerrar, y si no, ofrecería restaurar lo que ya se guardó.
        borrarBorrador("cheque");
        const editaba = editingId;
        cerrarForm(); loadCheques();
        showToast(editaba ? "Listo, cheque actualizado" : "Listo, cheque guardado");
      }
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
        } catch { setCheques(snapshot); showToast("Sin conexión. Intenta de nuevo."); }
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
            const nombre = cheque.cliente.toUpperCase().trim();
            const linea = `⚠ Cheque rebotado ${todayStr()}: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivo || "Sin motivo"}`;
            let previo = "";
            try {
              const existingRes = await fetch("/api/overrides", { cache: "no-store" });
              if (existingRes.ok) {
                const all: Array<{ nombre_normalized: string; resultado_contacto?: string | null }> = await existingRes.json();
                previo = (all.find(o => o.nombre_normalized === nombre)?.resultado_contacto || "").trim();
              }
            } catch { /* si falla el GET, escribimos solo la línea nueva */ }
            const resultado_contacto = previo ? `${previo}\n${linea}` : linea;
            // El cheque YA quedó rebotado (PUT arriba OK). Esta nota a CXC es
            // secundaria: si falla, avisamos pero NO revertimos el rebotado.
            try {
              const ovRes = await fetch("/api/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre_normalized: nombre, resultado_contacto }),
              });
              if (!ovRes.ok) showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
            } catch {
              showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
            }
          }
          loadCheques();
        } catch { setCheques(snapshot); showToast("Error de conexion. Intenta de nuevo."); }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function redepositar(id: string) {
    const cheque = cheques.find(c => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const hoy = todayStr();
    const notaExtra = `Re-depósito desde rebote (${hoy})`;
    const notas = cheque.notas ? `${cheque.notas}\n${notaExtra}` : notaExtra;
    setCheques(prev => prev.map(c => c.id === id ? { ...c, estado: "pendiente", motivo_rebote: undefined, notas } : c));
    scheduleAction({
      id: `redepositar-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} re-depositado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "pendiente", motivo_rebote: null, notas }) });
          if (!res.ok) { setCheques(snapshot); showToast("No se pudo re-depositar. Intenta de nuevo."); }
        } catch { setCheques(snapshot); showToast("Error de conexión. Intenta de nuevo."); }
      },
      onRevert: () => setCheques(snapshot),
    });
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
      default: return "todos";
    }
  }

  async function exportCheques() {
    const hoy = todayStr();
    const semana = getVencenSemanaRange(hoy).end;
    let data: Cheque[];
    switch (filter) {
      case "pendiente":
        data = cheques.filter((c) => visualEstado(c) === "pendiente");
        break;
      case "depositado":
        data = cheques.filter((c) => visualEstado(c) === "depositado");
        break;
      case "vencido":
        data = cheques.filter((c) => visualEstado(c) === "vencido");
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
      default:
        data = cheques;
        break;
    }
    if (data.length === 0) { showToast("No hay cheques para exportar"); return; }
    const { exportChequesExcel } = await import("./excel-cheques");
    exportChequesExcel(data, exportFilterLabel());
    showToast("Excel listo — revisa tu carpeta de descargas");
  }

  // Search filter (by numero_cheque or cliente)
  const searchLower = search.toLowerCase().trim();

  // Apply filter then search
  const filteredByTab = (() => {
    switch (filter) {
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

  // Al buscar, cruzamos TODOS los cheques (no solo la pestaña activa) — así un
  // N° o cliente se encuentra esté pendiente, depositado o vencido. Sin término,
  // se respeta la pestaña.
  const filtered = searchLower
    ? cheques.filter((c) =>
        c.numero_cheque.toLowerCase().includes(searchLower) ||
        c.cliente.toLowerCase().includes(searchLower)
      )
    : filteredByTab;
  const searchAcrossTabs = searchLower.length > 0;

  return (
    <PullToRefresh onRefresh={loadCheques}>
    <div>
      <AppHeader module="Cheques" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-light tracking-tight">Cheques</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* min-h-[44px] + inline-flex: medían 35 y 41 px de alto en iPhone,
              por debajo del mínimo táctil de 44. El ancho ya sobraba. */}
          <button onClick={exportCheques} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 min-h-[44px] inline-flex items-center justify-center rounded-md active:bg-gray-100 transition-all">
            ↓ Exportar {exportFilterLabel()}
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }} disabled={!isOnline} title={!isOnline ? "Sin conexión" : undefined} className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            Nuevo Cheque
          </button>
        </div>
      </div>

      {/* Alert banners — CAMBIO 39 */}
      {vencenHoy.length > 0 && (
        <button
          onClick={() => setFilter("vencen_hoy")}
          className="w-full mb-3 flex items-start sm:items-center gap-2 sm:gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 sm:px-4 py-3 text-sm font-medium hover:bg-red-100 transition text-left"
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1.5 sm:mt-0" />
          <span>{vencenHoy.length} cheque{vencenHoy.length > 1 ? "s" : ""} vence{vencenHoy.length > 1 ? "n" : ""} hoy — ${fmt(totalVencenHoy)} total</span>
        </button>
      )}
      {vencenSemana.length > 0 && filter !== "vencen_hoy" && (
        <button
          onClick={() => setFilter("vencen_semana")}
          className="w-full mb-3 flex items-start sm:items-center gap-2 sm:gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 sm:px-4 py-3 text-sm font-medium hover:bg-amber-100 transition text-left"
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-500 mt-1.5 sm:mt-0" />
          <span>{vencenSemana.length} cheque{vencenSemana.length > 1 ? "s" : ""} vence{vencenSemana.length > 1 ? "n" : ""} esta semana</span>
        </button>
      )}

      {/* KPIs — chips compactos de una línea (label + monto + conteo), patrón CXC */}
      {(() => {
        const vencenSemanaKPI = pendientes.filter((c) => c.fecha_deposito >= today && c.fecha_deposito <= weekFromNow);
        const vencenSemanaMonto = vencenSemanaKPI.reduce((s, c) => s + (Number(c.monto) || 0), 0);
        const depositadosMonto = depositados.reduce((s, c) => s + (Number(c.monto) || 0), 0);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8">
            {/* Total a cobrar */}
            <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Total a cobrar</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-semibold tabular-nums">$<AnimatedNumber value={totalPendiente} formatter={(n: number) => fmt(n)} /></span>
                <span className="text-xs text-gray-400 tabular-nums">{pendientes.length} chq</span>
              </span>
            </div>
            {/* Vencen esta semana */}
            <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${vencenSemanaKPI.length > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
              <span className="text-xs uppercase tracking-wide text-gray-500">Vencen esta semana</span>
              <span className="flex items-baseline gap-1.5">
                <span className={`font-mono text-sm font-semibold tabular-nums ${vencenSemanaKPI.length > 0 ? "text-amber-600" : ""}`}>{vencenSemanaKPI.length}</span>
                <span className="text-xs text-gray-400 tabular-nums">${fmt(vencenSemanaMonto)}</span>
              </span>
            </div>
            {/* Depositados */}
            <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Depositados</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-semibold tabular-nums text-green-600">{depositados.length}</span>
                <span className="text-xs text-gray-400 tabular-nums">${fmt(depositadosMonto)}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {chequeSuggestion && <SuggestionCard suggestion={chequeSuggestion} onDismiss={dismissCheque} />}

      {/* Formulario — VENTANA CENTRADA (antes era un panel lateral). */}
      <ChequeFormModal
        open={showForm}
        editingId={editingId}
        initial={formInitial}
        onClose={cerrarForm}
        onSave={saveCheque}
        saving={saving}
        isOnline={isOnline}
        error={error}
      />

      {/* View toggle */}
      <div className="flex items-center gap-4 mb-6">
        {/* Medían 30 px de alto y quedaban a 4 px uno del otro: con el dedo se
            tocaba el equivocado. gap-2 = 8 px de separación y 44 de alto. */}
        <div className="flex gap-2 bg-gray-100 rounded-full p-0.5 w-fit">
        <button onClick={() => setViewMode("lista")} className={`min-h-[44px] px-4 text-xs rounded-full transition inline-flex items-center justify-center ${viewMode === "lista" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Lista</button>
        <button onClick={() => setViewMode("calendario")} className={`min-h-[44px] px-4 text-xs rounded-full transition inline-flex items-center justify-center ${viewMode === "calendario" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}>Calendario</button>
        </div>
      </div>

      {/* Filter tabs + search — CAMBIO 40 search by cliente */}
      {viewMode === "lista" && <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 mb-6">
        <div className="flex gap-3 sm:gap-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {([
            ["pendiente", "Pendientes", pendientes.length, "Cheques pendientes de depositar", true],
            ["depositado", "Depositados", depositados.length, "Cheques ya depositados en el banco", true],
            ["vencido", "Vencidos", vencidos.length, "Pasó la fecha de depósito y no se han depositado", false],
            ["rebotado", "Rebotados", rebotados.length, "El banco rechazó el cheque", false],
          ] as [Filter, string, number, string, boolean][])
            .filter(([, , count, , alwaysShow]) => alwaysShow || count > 0)
            .map(([key, label, count, tooltip]) => (
              // Eran texto suelto de 21 px de alto: los dos filtros principales
              // (Pendientes / Depositados) fallaban el toque en iPhone.
              <button key={key} onClick={() => setFilter(key)}
                title={tooltip}
                className={`text-sm transition flex-shrink-0 whitespace-nowrap min-h-[44px] inline-flex items-center ${filter === key ? "font-medium text-black" : "text-gray-400 hover:text-black"}`}>
                {label} <span className="text-xs text-gray-300 ml-1">{count}</span>
              </button>
            ))}
        </div>
        <div className="sm:ml-auto w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cheque o cliente…"
            // text-base en mobile: con text-sm (14px) Safari hace zoom al
            // enfocar. Alto 35 → 44 para el toque.
            className="text-base sm:text-sm border border-gray-200 rounded-full px-4 min-h-[44px] outline-none focus:border-black transition w-full sm:max-w-xs"
          />
        </div>
      </div>}


      {/* Rebotado modal */}
      {rebotandoId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" {...reboteBackdrop}>
          {/* Sin stopPropagation: el hook del fondo solo cierra si el mousedown Y
              el click cayeron sobre el fondo mismo. */}
          <div ref={rebotePanelRef} className="bg-white rounded-lg p-6 w-full max-w-md border border-gray-200">
            <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">Marcar como Rebotado</div>
            <label className="text-xs uppercase tracking-[0.05em] text-gray-400">Motivo (opcional)</label>
            <textarea
              value={motivoRebote}
              onChange={(e) => setMotivoRebote(e.target.value)}
              rows={3}
              placeholder="Fondos insuficientes, firma incorrecta, etc."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-base sm:text-sm outline-none focus:border-black transition resize-none mt-1 min-h-[48px]"
            />
            <div className="flex items-center gap-3 mt-4">
              {/* Mismo defecto que el pie del panel de Nuevo Cheque: Cancelar
                  era texto suelto de 21 px de alto. */}
              <button onClick={() => marcarRebotado(rebotandoId)} className="bg-red-600 text-white px-5 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-red-700 transition">Confirmar rebotado</button>
              <button onClick={cerrarRebote} className="text-sm text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] px-2 -mx-2 inline-flex items-center justify-center">Cancelar</button>
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

        const cells = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        return (
          <div>
            {/* Nav */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={goPrev} className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">‹</button>
                <h2 className="text-sm font-medium first-letter:uppercase w-40 text-center">{monthLabel}</h2>
                <button onClick={goNext} className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500">›</button>
                {/* Medía 24.5×18 — el target más chico del calendario. -my-1 para
                    que crecer no empuje la fila del mes. */}
                <button onClick={goToday} className="text-xs text-gray-400 hover:text-black transition ml-2 min-h-[44px] min-w-[44px] -my-1 inline-flex items-center justify-center">Hoy</button>
              </div>
              <span className="text-xs text-gray-400">{monthCheques.length} cheques · ${fmt(totalMonth)}</span>
            </div>

            {/* Desktop grid */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-7 text-center text-xs text-gray-500 uppercase tracking-wide mb-1">
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
                      <div className={`text-xs mb-0.5 ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayCheques.slice(0, 3).map(c => {
                          const ve = visualEstado(c);
                          return (
                          <ChequeCalendarioPill
                            key={c.id}
                            cheque={c}
                            ve={ve}
                            abierto={calPopover === c.id}
                            onAbrir={() => setCalPopover(calPopover === c.id ? null : c.id)}
                            onCerrar={() => setCalPopover(null)}
                            onDepositar={() => { setConfirmDepositId(c.id); setCalPopover(null); }}
                            onRebotado={() => { setRebotandoId(c.id); setCalPopover(null); }}
                          />
                          );
                        })}
                        {dayCheques.length > 3 && (
                          <button onClick={() => { setCalPopover(null); setDayChequesModal(dateStr); }} className="text-xs text-gray-500 hover:text-black px-1 w-full text-left transition">
                            +{dayCheques.length - 3} más
                          </button>
                        )}
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
                              <span className={`text-xs px-1.5 py-0.5 rounded ${pillColor(ve)}`}>{ve}</span>
                              <span className="text-sm truncate">{c.cliente}</span>
                            </div>
                            <span className="text-sm font-medium tabular-nums ml-2">${fmt(c.monto)}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 ml-1">N° {c.numero_cheque} · {getCompanyDisplay(c.empresa)}</div>
                          {/* Medían 119×26 y 59×26 — los 2 targets bajo 44 px
                              del calendario en celular. `-my-1.5` para que
                              crecer no estire la fila del día. */}
                          {(ve === "pendiente" || ve === "vencido") && (
                            <div className="flex gap-3 mt-1 ml-1 -my-1.5">
                              <button onClick={() => setConfirmDepositId(c.id)} className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center">Confirmar depósito</button>
                              <button onClick={() => setRebotandoId(c.id)} title="Cheque devuelto por el banco" className="text-xs text-red-500 hover:underline min-h-[44px] inline-flex items-center">Rebotado</button>
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
        <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 px-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pendiente</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Vencido / Rebotado</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Depositado</span>
        </div>
      )}

      {/* Hint: la búsqueda cruza todas las pestañas */}
      {viewMode === "lista" && searchAcrossTabs && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mb-2">Mostrando coincidencias en todos los cheques (pendientes, depositados y vencidos).</p>
      )}

      {/* Table */}
      {viewMode === "lista" && (loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        cheques.length === 0 ? (
          <EmptyState
            title="No hay cheques registrados"
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
                  ["pendiente", "Pendientes"],
                  ["depositado", "Depositados"],
                  ["vencido", "Vencidos"],
                  ["rebotado", "Rebotados"],
                ] as [Filter, string][]
              )
                .filter(([key]) => key !== filter)
                .map(([key, label]) => {
                  const count = key === "pendiente" ? pendientes.length : key === "depositado" ? depositados.length : key === "vencido" ? vencidos.length : rebotados.length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => { setFilter(key); setSearch(""); }}
                      /* Chips del vacío: medían 32 de alto → 44. */
                      className="text-xs px-3 min-h-[44px] inline-flex items-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition"
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
            <button onClick={() => setConfirmBatch({ ids: selectedIds, clearFn: setSelectedIds })} disabled={batchProcessing} className="text-xs bg-black text-white px-4 py-1.5 rounded-md hover:bg-gray-800 transition disabled:opacity-50">
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
        {/* ── Tarjetas (celular, iPad y ventanas angostas) ────────────────────
            🩸 Rota SOLO en el iPad: a 390 px ya eran tarjetas y a 1440 la tabla
            entra, pero el corte estaba en `sm` (640) mientras la barra lateral
            aparece en `md` (768) y se lleva 224 px. A 834 px quedaban 562 útiles
            contra 768 de tabla = 206 px de arrastre, y lo que se iba fuera de la
            pantalla eran ESTADO y el menú de acciones.
            El corte es `xl` (1280), medido: a 1024 la columna "N° Cheque"
            reaparece (`lg:table-cell`) y la tabla pide ~848 px contra 752 útiles
            — con `lg` el problema seguía vivo. A 1280 quedan 1008 px. */}
        <div className="xl:hidden space-y-1.5">
          {filtered.map((c) => {
            const ve = visualEstado(c);
            const isPending = ve === "pendiente" || ve === "vencido";
            const isRebotado = ve === "rebotado";
            const depositSwipe: SwipeAction | undefined = isPending ? {
              label: "Depositar",
              color: "bg-emerald-500",
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
              onAction: () => setConfirmDepositId(c.id),
            } : undefined;
            const card = (
              <div data-cheque-fila={c.id} className={`px-4 py-3 ${ve === "depositado" ? "opacity-60" : ""}`} onClick={() => startEdit(c)}>
                {/* Row 1: Cliente + Monto */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate" data-cheque-campo="cliente">{c.cliente}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold tabular-nums" data-cheque-campo="monto">${fmt(c.monto)}</span>
                    {/* El menú ⋯ es lo que se perdía a 834 px junto con ESTADO.
                        Mismo componente flotante de la tabla — no se rehace. */}
                    <span className="-my-2" onClick={(e) => e.stopPropagation()}>
                      <ChequeMoreMenu
                        cheque={c}
                        ve={ve}
                        role={role}
                        onRebotado={() => setRebotandoId(c.id)}
                        onDelete={() => setConfirmDeleteId(c.id)}
                        onRedepositar={isRebotado ? () => redepositar(c.id) : undefined}
                      />
                    </span>
                  </div>
                </div>
                {/* Row 2: fecha, status */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span data-cheque-campo="estado"><StatusBadge estado={ve} /></span>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-gray-400">{fmtDate(c.fecha_deposito)}</div>
                    {ve === "depositado" && c.fecha_depositado && c.fecha_depositado !== c.fecha_deposito && (
                      <div className={`text-xs ${c.fecha_depositado > c.fecha_deposito ? "text-amber-600" : "text-gray-500"}`}>Depositado: {fmtDate(c.fecha_depositado)}</div>
                    )}
                  </div>
                </div>
                {/* Row 3: Secondary info */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">N° {c.numero_cheque}</span>
                  <span className="text-xs text-gray-400">· {getCompanyDisplay(c.empresa)}</span>
                </div>
                {/* State-valid actions with inline guide */}
                {ve === "depositado" && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setRebotandoId(c.id); }} className="text-xs text-gray-500 hover:text-red-600 font-medium py-1 min-h-[44px] flex items-center gap-1.5 transition">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
                      Marcar como rebotado
                    </button>
                    <span className="text-xs text-gray-300">Si el banco lo devolvió</span>
                  </div>
                )}
                {isRebotado && (
                  <div className="mt-2 pt-2 border-t border-red-100 bg-red-50/40 -mx-4 px-4 pb-1 rounded-b-lg">
                    <div className="text-xs text-red-400 mb-1">Este cheque rebotó{c.motivo_rebote ? ` — ${c.motivo_rebote}` : ""}</div>
                    <button onClick={(e) => { e.stopPropagation(); redepositar(c.id); }} className="text-xs bg-black text-white px-4 py-1.5 rounded-md font-medium min-h-[44px] flex items-center gap-1.5 hover:bg-gray-800 transition">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      Re-depositar cheque
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
        <div className="hidden xl:block overflow-x-auto">
          <div className="min-w-[700px]">
        {(() => {
          const _gm = filter === "depositado" ? "depositado" as const : "pendiente" as const;
          const _df = filter === "depositado" ? "fecha_depositado" as keyof Cheque : "fecha_deposito" as keyof Cheque;
          const _cg = filter === "pendiente" || filter === "depositado";
          const _tg = _cg ? groupByTimePeriod(filtered, _df, _gm) : null;
          const _th = (<thead className="sticky top-0 bg-white z-10"><tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-500"><th className="w-8"></th><th className="text-left py-3 px-4 font-normal">Cliente</th><th className="text-left py-3 px-4 font-normal hidden lg:table-cell">N° Cheque</th><th className="text-right py-3 px-4 font-normal">Monto</th><th className="text-left py-3 px-4 font-normal whitespace-nowrap">Vence</th><th className="text-left py-3 px-4 font-normal whitespace-nowrap">Depositado</th>{filter !== "depositado" && <th className="text-left py-3 px-4 font-normal">Estado</th>}<th className="text-right py-3 px-2 font-normal"></th></tr></thead>);
          const _rr = (c: Cheque) => {
              const ve = visualEstado(c);
              const isPending = ve === "pendiente" || ve === "vencido";
              const isDep = ve === "depositado";
              const isRebotado = ve === "rebotado";
              return (
                <tr key={c.id} data-cheque-fila={c.id} onClick={() => setDetailCheque(c)} className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${urgencyBorder(c, ve)} ${isDep ? "text-gray-400" : isRebotado ? "bg-red-50/20" : ""}`} onContextMenu={(e) => showContextMenu(e, buildChequeContextMenu(c, ve))}>
                  <td className="py-3 pl-2 pr-0 w-8" onClick={(e) => e.stopPropagation()}>
                    {ve === "pendiente" && (
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-emerald-600 w-3.5 h-3.5" />
                    )}
                    {ve === "vencido" && (
                      <input type="checkbox" checked={selectedVencidos.has(c.id)} onChange={() => toggleSelectVencido(c.id)} className="accent-amber-600 w-3.5 h-3.5" />
                    )}
                  </td>
                  <td className="py-3 px-4"><div className="font-medium" data-cheque-campo="cliente">{c.cliente}</div><div className="text-xs text-gray-400">{getCompanyDisplay(c.empresa)}</div></td>
                  <td className="py-3 px-4 text-gray-500 hidden lg:table-cell">{c.numero_cheque}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium" data-cheque-campo="monto">${fmt(c.monto)}</td>
                  <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{fmtDate(c.fecha_deposito)}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {c.fecha_depositado ? (
                      <span className={`tabular-nums ${c.fecha_depositado > c.fecha_deposito ? "text-amber-600" : "text-gray-500"}`}>{fmtDate(c.fecha_depositado)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  {filter !== "depositado" && (
                    <td className="py-3 px-4" data-cheque-campo="estado">
                      <StatusBadge estado={ve} />
                    </td>
                  )}
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                    {/* State machine: only show valid primary actions */}
                    {isPending && (
                      <button onClick={() => setConfirmDepositId(c.id)} disabled={!isOnline} title={!isOnline ? "Sin conexión" : undefined} className="text-sm text-gray-500 hover:text-black transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">Depositar</button>
                    )}
                    {isDep && (
                      <button onClick={() => setRebotandoId(c.id)} disabled={!isOnline} title="Si el banco devolvió este cheque, márcalo como rebotado" className="text-xs text-gray-400 hover:text-red-500 transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
                        Rebotado
                      </button>
                    )}
                    {isRebotado && (
                      <button onClick={() => redepositar(c.id)} disabled={!isOnline} title="Este cheque rebotó. Click para re-depositarlo." className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded-md transition min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        Re-depositar
                      </button>
                    )}
                    <button onClick={() => startEdit(c)} disabled={!isOnline} title={!isOnline ? "Sin conexión" : undefined} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-gray-500 hover:text-black transition disabled:opacity-40 disabled:cursor-not-allowed">Editar</button>
                    <ChequeMoreMenu
                      cheque={c}
                      ve={ve}
                      role={role}
                      onRebotado={() => setRebotandoId(c.id)}
                      onDelete={() => setConfirmDeleteId(c.id)}
                      onRedepositar={isRebotado ? () => redepositar(c.id) : undefined}
                    />
                    </div>
                  </td>
                </tr>
              );
          };
          return _tg ? (
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              {_th}
              <tbody>
                {_tg.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-gray-50/90 border-b border-gray-200">
                      <td colSpan={filter !== "depositado" ? 8 : 7} className="px-4 py-2">
                        <span className={`text-sm font-semibold ${g.color}`}>{"▸ "}{g.label}</span>
                        <span className="text-xs text-gray-400 tabular-nums ml-2">({g.items.length})</span>
                      </td>
                    </tr>
                    {g.items.map(_rr)}
                  </Fragment>
                ))}
              </tbody>
            </table>
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
      {/* Day cheques modal — opened via "+N más" en calendario */}
      {dayChequesModal && (() => {
        const dayItems = cheques.filter(c => c.fecha_deposito === dayChequesModal);
        const close = () => setDayChequesModal(null);
        return (
          <div onClick={close} role="dialog" aria-modal="true" aria-label={`Cheques del ${fmtDate(dayChequesModal)}`} className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg border border-gray-200 w-full max-w-md max-h-[80vh] flex flex-col">
              <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-base font-medium">Cheques del {fmtDate(dayChequesModal)}</h2>
                <button onClick={close} aria-label="Cerrar" className="text-gray-400 hover:text-black transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </header>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {dayItems.map(c => {
                  const ve = visualEstado(c);
                  const isPending = ve === "pendiente" || ve === "vencido";
                  const isRebotado = ve === "rebotado";
                  return (
                    <div key={c.id} className="px-5 py-3">
                      <button onClick={() => { close(); startEdit(c); }} className="w-full text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{c.cliente}</span>
                          <span className="text-sm font-semibold tabular-nums flex-shrink-0">${fmt(c.monto)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <StatusBadge estado={ve} />
                          <span>N° {c.numero_cheque}</span>
                          <span>·</span>
                          <span className="truncate">{getCompanyDisplay(c.empresa)}</span>
                        </div>
                        {ve === "depositado" && c.fecha_depositado && c.fecha_depositado !== c.fecha_deposito && (
                          <div className={`text-xs mt-1 ${c.fecha_depositado > c.fecha_deposito ? "text-amber-600" : "text-gray-500"}`}>Depositado: {fmtDate(c.fecha_depositado)}</div>
                        )}
                      </button>
                      {(isPending || isRebotado) && (
                        <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100">
                          {isPending && (
                            <>
                              <button onClick={() => setConfirmDepositId(c.id)} className="text-xs text-emerald-600 hover:underline">Confirmar depósito</button>
                              <button onClick={() => setRebotandoId(c.id)} className="text-xs text-red-500 hover:underline">Rebotado</button>
                            </>
                          )}
                          {isRebotado && (
                            <button onClick={() => redepositar(c.id)} className="text-xs text-emerald-600 hover:underline">Re-depositar</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
      {/* Confirm deposit */}
      <ConfirmModal
        open={!!confirmDepositId}
        onClose={() => setConfirmDepositId(null)}
        onConfirm={() => { depositar(confirmDepositId!); setConfirmDepositId(null); }}
        title="Depositar cheque"
        message={(() => { const c = cheques.find(x => x.id === confirmDepositId); return c ? `¿Depositar cheque N° ${c.numero_cheque} por $${fmt(c.monto)}?` : ""; })()}
        confirmLabel="Si, depositar"
      />
      <ConfirmDeleteModal
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => { deleteCheque(confirmDeleteId!); setConfirmDeleteId(null); }}
        title="Eliminar cheque"
        description={(() => { const c = cheques.find(x => x.id === confirmDeleteId); return c ? `¿Eliminar el cheque N° ${c.numero_cheque} por $${fmt(c.monto)}? Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer."; })()}
      />
      <ConfirmModal
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={() => { if (confirmBatch) { batchDepositar(confirmBatch.ids, confirmBatch.clearFn); setConfirmBatch(null); } }}
        title="Depositar cheques"
        message={confirmBatch ? `¿Depositar ${confirmBatch.ids.size} cheques por un total de $${fmt(cheques.filter(c => confirmBatch.ids.has(c.id)).reduce((s, c) => s + c.monto, 0))}?` : ""}
        confirmLabel="Si, depositar todos"
      />

      {/* Detalle de solo lectura (click en fila) — separado del botón Editar */}
      <Modal open={!!detailCheque} onClose={() => setDetailCheque(null)} title="Detalle del cheque">
        {detailCheque && (() => {
          const ve = visualEstado(detailCheque);
          const Row = ({ label, value }: { label: string; value: ReactNode }) => (
            <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs uppercase tracking-[0.05em] text-gray-400">{label}</span>
              <span className="text-sm text-gray-900 text-right">{value}</span>
            </div>
          );
          return (
            <div>
              <Row label="Cliente" value={detailCheque.cliente} />
              <Row label="Empresa" value={getCompanyDisplay(detailCheque.empresa)} />
              <Row label="N° Cheque" value={detailCheque.numero_cheque} />
              <Row label="Monto" value={<span className="font-medium tabular-nums">${fmt(detailCheque.monto)}</span>} />
              <Row label="Vence" value={fmtDate(detailCheque.fecha_deposito)} />
              <Row label="Depositado" value={detailCheque.fecha_depositado ? fmtDate(detailCheque.fecha_depositado) : "—"} />
              <Row label="Estado" value={<StatusBadge estado={ve} />} />
              {detailCheque.vendedor && <Row label="Vendedor" value={detailCheque.vendedor} />}
              {detailCheque.notas && <Row label="Notas" value={detailCheque.notas} />}
              {detailCheque.motivo_rebote && <Row label="Motivo rebote" value={detailCheque.motivo_rebote} />}
              <div className="flex gap-3 mt-5">
                <button onClick={() => { const c = detailCheque; setDetailCheque(null); startEdit(c); }} className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition min-h-[44px]">Editar</button>
                <button onClick={() => setDetailCheque(null)} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition min-h-[44px]">Cerrar</button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
    </div>
    </PullToRefresh>
  );
}
