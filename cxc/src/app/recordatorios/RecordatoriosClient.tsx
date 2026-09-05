"use client";

/**
 * RECORDATORIOS — la pantalla. Antes `/cheques`; la dirección cambió el
 * 5-sep-2026 y la `key` del módulo **sigue siendo `cheques`** (está en
 * `role_permissions` y en `fg_users.modulos_override`: renombrarla rompería los
 * permisos de todo el mundo).
 *
 * ── QUÉ ES ESTE ARCHIVO ──────────────────────────────────────────────────────
 *
 * El ORQUESTADOR: estado, llamadas al servidor y qué se dibuja. El dibujo vive
 * en piezas aparte, y no es una manía de orden — el archivo que reemplaza tenía
 * **1.693 líneas** contra un límite de casa de 800:
 *
 *   · `components/LineaNueva.tsx`     → el renglón de escribir
 *   · `components/AgendaLista.tsx`    → la lista única, agrupada por cuándo
 *   · `components/CalendarioMes.tsx`  → el calendario (los dos layouts)
 *   · `components/ChequeModales.tsx`  → detalle, rebotado y «los del día»
 *   · `components/ChequeFormModal.tsx` · `components/RecordatorioFormModal.tsx`
 *
 * Y las DECISIONES (qué se ve, en qué grupo cae, qué encuentra el buscador)
 * viven en módulos puros bajo `lib/recordatorios/`, testeables sin montar React.
 *
 * ── LO QUE CAMBIÓ, EN UNA LISTA ──────────────────────────────────────────────
 *
 * 🔴 **Ninguna pestaña.** Eran ocho. Cuatro de ellas —vencido, vencen hoy,
 *    vencen mañana, vencen esta semana— no eran estados sino CUÁNDO, y ahora son
 *    grupos de la única lista. El porqué está entero en `lib/recordatorios/agenda.ts`.
 * 🔴 **Ningún total sumado.** Las tres tarjetas de arriba se fueron y no se
 *    reemplazaron por nada. Daniel lo eligió así. Los montos por fila se quedan.
 * 🔴 **Lo depositado no está en la lista**, pero se encuentra con la lupa.
 * 🔴 **Sin Excel.** Se retiró el botón y el archivo. Daniel: *«se va»*.
 * 🔴 **Escribir un recordatorio es un renglón**, siempre visible arriba.
 * 🔴 **Un cheque que no se va a cobrar se BORRA** con el botón de siempre. No se
 *    agregó ningún estado tipo «no se cobró» — Daniel: *«no lo quiero marcar»*.
 *
 * Lo que NO cambió: los 19 cheques y sus datos, quién entra al módulo (admin y
 * secretaria), marcar depositado con el botón de siempre, y el calendario.
 */

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import {
  SkeletonTable,
  Toast,
  PullToRefresh,
} from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import ChequeFormModal, { chequeFormVacio, type ChequeFormValues } from "./components/ChequeFormModal";
import RecordatorioFormModal, {
  recordatorioVacio,
  type RecordatorioFormValues,
} from "./components/RecordatorioFormModal";
import LineaNueva, { type RecordatorioRapido } from "./components/LineaNueva";
import AgendaLista from "./components/AgendaLista";
import CalendarioMes from "./components/CalendarioMes";
import { Confirmaciones, DetalleCheque, ModalDelDia, ModalRebote } from "./components/ChequeModales";
import {
  agruparAgenda,
  buscarEnAgenda,
  estadoVisible,
  type ChequeAgenda,
} from "@/lib/recordatorios/agenda";
import { ocurreEn, type Recordatorio } from "@/lib/recordatorios/recordatorio";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { fmt, fmtDate } from "@/lib/format";
import { getCompanyDisplay } from "@/lib/companies";
import { useAuth } from "@/lib/hooks/useAuth";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import { borrarBorrador } from "@/lib/hooks/useDraftAutoSave";
import { useOnline } from "@/lib/OnlineContext";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

export interface ChequesInitialData {
  cheques: Cheque[];
  recordatorios: Recordatorio[];
  /** Se conserva por compatibilidad de la lectura; hoy siempre `false`. */
  faltaMigracionRecordatorios: boolean;
  /** HOY en fecha de Panamá, calculado en el SERVIDOR. Ver `page.tsx`. */
  hoy: string;
  /** Solo los admin eligen a quién le llega un recordatorio. */
  puedeElegirDestino: boolean;
}

export interface Cheque extends ChequeAgenda {
  banco: string;
  notas: string;
  vendedor: string;
  fecha_depositado: string | null;
  created_at: string;
  cliente_codigo?: string | null;
}

export default function RecordatoriosClient({ initialData }: { initialData: ChequesInitialData }) {
  return (
    <Suspense>
      <Pantalla initialData={initialData} />
    </Suspense>
  );
}

function Pantalla({ initialData }: { initialData: ChequesInitialData }) {
  const { authChecked, role } = useAuth({
    moduleKey: "cheques",
    allowedRoles: ["admin", "secretaria"],
  });
  const isOnline = useOnline();
  const hoy = initialData.hoy;

  const [cheques, setCheques] = useState<Cheque[]>(initialData.cheques);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>(initialData.recordatorios);
  const [loading, setLoading] = useState(false);
  usePersistedScroll("recordatorios", !loading && cheques.length > 0);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Lista y Calendario son dos MODOS de ver lo mismo, no una pestaña. El modo
  // vive en la URL (?view=calendario) para sobrevivir un refresh o un back.
  const [viewMode, setViewMode] = useUrlState<"lista" | "calendario">("view", "lista");

  // Formulario de cheque (el de siempre)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<ChequeFormValues>(chequeFormVacio);
  const [saving, setSaving] = useState(false);

  // Formulario de recordatorio (editar: el renglón de arriba solo crea)
  const [showRecForm, setShowRecForm] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [recInitial, setRecInitial] = useState<RecordatorioFormValues>(() => recordatorioVacio(hoy));
  const [savingRec, setSavingRec] = useState(false);
  const [errorRec, setErrorRec] = useState<string | null>(null);
  const [guardandoRapido, setGuardandoRapido] = useState(false);

  // Confirmaciones y detalle
  const [confirmDepositId, setConfirmDepositId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detailCheque, setDetailCheque] = useState<Cheque | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [rebotandoId, setRebotandoId] = useState<string | null>(null);
  const [motivoRebote, setMotivoRebote] = useState("");

  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Cargas ────────────────────────────────────────────────────────────────
  const loadingRef = useRef(false);
  const chequesLenRef = useRef(initialData.cheques.length);
  useEffect(() => {
    chequesLenRef.current = cheques.length;
  }, [cheques]);

  const loadCheques = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/cheques");
      if (res.ok) {
        const d = await res.json();
        setCheques(Array.isArray(d) ? d : []);
      }
    } catch {
      // Sin red: mantener lo que ya está en pantalla y avisar.
      if (chequesLenRef.current > 0) showToast("No se pudo actualizar. Verifica tu conexión.");
      else setError("No se pudieron cargar los cheques. Recarga la página.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const loadRecordatorios = useCallback(async () => {
    try {
      const res = await fetch("/api/recordatorios", { cache: "no-store" });
      if (!res.ok) return; // 403 o error: se conserva lo que ya está en pantalla
      const d = await res.json();
      if (Array.isArray(d?.recordatorios)) setRecordatorios(d.recordatorios);
    } catch {
      // Sin red: queda lo que ya se está viendo. No se vacía la lista — una
      // lista vacía se leería como "no tienes ningún recordatorio".
    }
  }, []);

  // El primer montaje ya trae los datos del SSR (frescos); solo se re-pide en
  // los montajes siguientes.
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    loadCheques();
    loadRecordatorios();
  }, [authChecked, loadCheques, loadRecordatorios]);

  // ESC cierra el modal del día
  useEffect(() => {
    if (!dayModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDayModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayModal]);

  const cerrarRebote = useCallback(() => {
    setRebotandoId(null);
    setMotivoRebote("");
  }, []);
  const { panelRef: rebotePanelRef, backdrop: reboteBackdrop } = useFormModalDismiss(
    !!rebotandoId,
    cerrarRebote,
  );

  // ── La agenda ─────────────────────────────────────────────────────────────
  const grupos = useMemo(
    () => agruparAgenda(cheques, recordatorios, hoy),
    [cheques, recordatorios, hoy],
  );
  const termino = search.trim();
  const resultados = useMemo(
    () => (termino ? buscarEnAgenda(cheques, recordatorios, termino, hoy) : []),
    [cheques, recordatorios, termino, hoy],
  );

  if (!authChecked) return null;

  // ── Cheques: guardar, depositar, rebotar, borrar ──────────────────────────
  function startEdit(id: string) {
    const c = cheques.find((x) => x.id === id);
    if (!c) return;
    setFormInitial({
      cliente: c.cliente,
      empresa: c.empresa,
      numero_cheque: c.numero_cheque,
      monto: String(c.monto),
      fecha_deposito: c.fecha_deposito,
      notas: c.notas || "",
      vendedor: c.vendedor || "",
      cliente_codigo: c.cliente_codigo || "",
    });
    setEditingId(id);
    setError(null);
    setShowForm(true);
  }

  function cerrarForm() {
    setFormInitial(chequeFormVacio());
    setEditingId(null);
    setError(null);
    setShowForm(false);
  }

  async function saveCheque(v: ChequeFormValues) {
    if (
      !v.cliente.trim() ||
      !v.empresa ||
      !v.numero_cheque.trim() ||
      !v.monto ||
      !v.fecha_deposito ||
      !v.vendedor.trim()
    ) {
      setError("Completa todos los campos obligatorios.");
      return;
    }
    if (parseFloat(v.monto) <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      cliente: v.cliente.trim(),
      empresa: v.empresa,
      numero_cheque: v.numero_cheque.trim(),
      monto: parseFloat(v.monto),
      fecha_deposito: v.fecha_deposito,
      notas: v.notas,
      vendedor: v.vendedor.trim(),
      cliente_codigo: v.cliente_codigo || null,
    };
    try {
      const url = editingId ? `/api/cheques/${editingId}` : "/api/cheques";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // El borrador se borra desde acá: el modal (que es quien lo escribe) se
        // desmonta al cerrar, y si no, ofrecería restaurar lo que ya se guardó.
        borrarBorrador("cheque");
        const editaba = editingId;
        cerrarForm();
        loadCheques();
        showToast(editaba ? "Listo, cheque actualizado" : "Listo, cheque guardado");
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.error || "Error al guardar.");
      }
    } catch {
      setError("Error de conexión.");
    }
    setSaving(false);
  }

  function depositar(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    setCheques((prev) =>
      prev.map((c) => (c.id === id ? { ...c, estado: "depositado", fecha_depositado: hoy } : c)),
    );
    setConfirmDepositId(null);
    scheduleAction({
      id: `deposit-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} depositado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "depositado", fecha_depositado: hoy }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo depositar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Sin conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  async function marcarRebotado(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const motivo = motivoRebote || null;
    setCheques((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: "rebotado", motivo_rebote: motivo || undefined } : c,
      ),
    );
    cerrarRebote();
    scheduleAction({
      id: `rebotado-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} marcado como rebotado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "rebotado", motivo_rebote: motivo }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo marcar como rebotado. Intenta de nuevo.");
            return;
          }
          // La nota a CXC es SECUNDARIA: el cheque ya quedó rebotado. Si falla,
          // se avisa pero NO se revierte el rebotado.
          const nombre = cheque.cliente.toUpperCase().trim();
          const linea = `⚠ Cheque rebotado ${hoy}: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivo || "Sin motivo"}`;
          let previo = "";
          try {
            const existingRes = await fetch(`/api/overrides?cartera=${CARTERA_GRUPO}`, {
              cache: "no-store",
            });
            if (existingRes.ok) {
              const all: Array<{ nombre_normalized: string; resultado_contacto?: string | null }> =
                await existingRes.json();
              previo = (all.find((o) => o.nombre_normalized === nombre)?.resultado_contacto || "").trim();
            }
          } catch {
            /* si falla el GET, escribimos solo la línea nueva */
          }
          try {
            const ovRes = await fetch("/api/overrides", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nombre_normalized: nombre,
                resultado_contacto: previo ? `${previo}\n${linea}` : linea,
                cartera: CARTERA_GRUPO,
              }),
            });
            if (!ovRes.ok) showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
          } catch {
            showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
          }
          loadCheques();
        } catch {
          setCheques(snapshot);
          showToast("Error de conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function redepositar(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const notaExtra = `Re-depósito desde rebote (${hoy})`;
    const notas = cheque.notas ? `${cheque.notas}\n${notaExtra}` : notaExtra;
    setCheques((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: "pendiente", motivo_rebote: undefined, notas } : c,
      ),
    );
    scheduleAction({
      id: `redepositar-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} re-depositado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "pendiente", motivo_rebote: null, notas }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo re-depositar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Error de conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function deleteCheque(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    setCheques((prev) => prev.filter((c) => c.id !== id));
    scheduleAction({
      id: `delete-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} eliminado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/cheques/${id}`, { method: "DELETE" });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo eliminar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Sin conexión. Verifica tu internet e intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  // ── Recordatorios ─────────────────────────────────────────────────────────
  async function guardarRapido(v: RecordatorioRapido) {
    setGuardandoRapido(true);
    try {
      const res = await fetch("/api/recordatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: v.fecha,
          texto: v.texto,
          cliente: v.cliente,
          cliente_codigo: v.cliente_codigo || null,
          repeticion: v.repeticion,
          hasta: v.hasta,
          destino: v.destino,
        }),
      });
      if (res.ok) {
        await loadRecordatorios();
        showToast("Listo, te lo recuerdo");
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || "No se pudo guardar. Intenta de nuevo.");
      }
    } catch {
      showToast("Error de conexión.");
    }
    setGuardandoRapido(false);
  }

  function editarRecordatorio(id: string) {
    const r = recordatorios.find((x) => x.id === id);
    if (!r) return;
    setRecInitial({
      fecha: r.fecha,
      texto: r.texto,
      cliente: r.cliente,
      // El vínculo guardado se conserva al abrir: resetearlo a "" habría
      // desvinculado en silencio cualquier recordatorio que se editara.
      cliente_codigo: r.clienteCodigo ?? "",
      repeticion: r.repeticion,
      hasta: r.hasta ?? "",
      destino: r.destino,
    });
    setEditingRecId(id);
    setErrorRec(null);
    setShowRecForm(true);
  }

  async function guardarRecordatorio(v: RecordatorioFormValues) {
    if (!editingRecId) return;
    setSavingRec(true);
    setErrorRec(null);
    try {
      const res = await fetch(`/api/recordatorios/${editingRecId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: v.fecha,
          texto: v.texto,
          cliente: v.cliente,
          cliente_codigo: v.cliente_codigo || null,
          repeticion: v.repeticion,
          hasta: v.hasta || null,
          destino: v.destino,
        }),
      });
      if (res.ok) {
        setShowRecForm(false);
        setEditingRecId(null);
        await loadRecordatorios();
        showToast("Listo, recordatorio actualizado");
      } else {
        const err = await res.json().catch(() => null);
        setErrorRec(err?.error || "No se pudo guardar. Intenta de nuevo.");
      }
    } catch {
      setErrorRec("Error de conexión.");
    }
    setSavingRec(false);
  }

  async function borrarRecordatorio() {
    if (!editingRecId) return;
    setSavingRec(true);
    try {
      const res = await fetch(`/api/recordatorios/${editingRecId}`, { method: "DELETE" });
      if (res.ok) {
        setShowRecForm(false);
        setEditingRecId(null);
        await loadRecordatorios();
        showToast("Recordatorio eliminado");
      } else {
        const err = await res.json().catch(() => null);
        setErrorRec(err?.error || "No se pudo eliminar. Intenta de nuevo.");
      }
    } catch {
      setErrorRec("Error de conexión.");
    }
    setSavingRec(false);
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────
  const chequeDelDia = dayModal ? cheques.filter((c) => c.fecha_deposito === dayModal) : [];
  const recsDelDia = dayModal ? recordatorios.filter((r) => ocurreEn(r, dayModal)) : [];

  return (
    <PullToRefresh
      onRefresh={async () => {
        await Promise.all([loadCheques(), loadRecordatorios()]);
      }}
    >
      <div>
        <AppHeader module="Recordatorios" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {/* Sin título grande: "Recordatorios" ya lo dicen la barra sticky
              (celular) y el breadcrumb (escritorio). Queda sr-only para no
              dejar la página sin encabezado. */}
          <div className="flex items-center justify-end mb-5">
            <h1 className="sr-only">Recordatorios</h1>
            <div className="flex flex-wrap items-center gap-3">
              {/* 🔴 El botón de Excel se retiró el 5-sep-2026 (Daniel: «se va»).
                  Los datos siguen en la base; lo que se fue es la descarga. */}
              <button
                onClick={() => {
                  setFormInitial(chequeFormVacio());
                  setEditingId(null);
                  setShowForm(true);
                }}
                disabled={!isOnline}
                title={!isOnline ? "Sin conexión" : undefined}
                className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Nuevo Cheque
              </button>
            </div>
          </div>

          {/* El renglón de escribir: siempre visible, arriba de todo. */}
          <LineaNueva
            hoy={hoy}
            puedeElegirDestino={initialData.puedeElegirDestino}
            guardando={guardandoRapido}
            isOnline={isOnline}
            onGuardar={guardarRapido}
          />

          {/* Modo (Lista / Calendario) + buscador. NO son pestañas: son dos
              formas de ver lo mismo. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="flex gap-2 bg-gray-100 rounded-full p-0.5 w-fit">
              <button
                onClick={() => setViewMode("lista")}
                className={`min-h-[44px] px-4 text-xs rounded-full transition inline-flex items-center justify-center ${viewMode === "lista" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode("calendario")}
                className={`min-h-[44px] px-4 text-xs rounded-full transition inline-flex items-center justify-center ${viewMode === "calendario" ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}
              >
                Calendario
              </button>
            </div>
            {viewMode === "lista" && (
              <div className="sm:ml-auto w-full sm:w-auto">
                {/* 🔴 La lupa es la ÚNICA puerta a lo depositado: la lista solo
                    muestra lo abierto. Por eso busca sobre TODO. */}
                <input
                  type="search"
                  aria-label="Buscar"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cheque o cliente…"
                  className="text-base sm:text-sm border border-gray-200 rounded-full px-4 min-h-[44px] outline-none focus:border-black transition w-full sm:max-w-xs"
                />
              </div>
            )}
          </div>

          {viewMode === "lista" &&
            (loading ? (
              <SkeletonTable rows={5} cols={4} />
            ) : (
              <AgendaLista
                grupos={grupos}
                buscando={termino.length > 0}
                resultados={resultados}
                termino={termino}
                onAbrirCheque={(id) => setDetailCheque(cheques.find((c) => c.id === id) ?? null)}
                onAbrirRecordatorio={editarRecordatorio}
                onDepositar={setConfirmDepositId}
                onRebotado={setRebotandoId}
                onRedepositar={redepositar}
              />
            ))}

          {viewMode === "calendario" && !loading && (
            <CalendarioMes
              cheques={cheques}
              recordatorios={recordatorios}
              hoy={hoy}
              onDepositar={setConfirmDepositId}
              onRebotado={setRebotandoId}
              onEditarRecordatorio={editarRecordatorio}
              onEditarCheque={(id) => setDetailCheque(cheques.find((c) => c.id === id) ?? null)}
              onVerDia={setDayModal}
            />
          )}

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

          <RecordatorioFormModal
            open={showRecForm}
            editingId={editingRecId}
            initial={recInitial}
            hoy={hoy}
            puedeElegirDestino={initialData.puedeElegirDestino}
            onClose={() => {
              setShowRecForm(false);
              setEditingRecId(null);
              setErrorRec(null);
            }}
            onSave={guardarRecordatorio}
            onDelete={borrarRecordatorio}
            saving={savingRec}
            isOnline={isOnline}
            error={errorRec}
          />

          <ModalRebote
            abierto={!!rebotandoId}
            motivo={motivoRebote}
            panelRef={rebotePanelRef}
            backdrop={reboteBackdrop}
            onMotivo={setMotivoRebote}
            onConfirmar={() => marcarRebotado(rebotandoId!)}
            onCancelar={cerrarRebote}
          />

          <Toast message={error} type="error" />
          <Toast message={toast} />
          {pendingUndo && (
            <UndoToast
              message={pendingUndo.message}
              startedAt={pendingUndo.startedAt}
              onUndo={undoAction}
            />
          )}

          <Confirmaciones
            cheques={cheques}
            depositarId={confirmDepositId}
            eliminarId={confirmDeleteId}
            onCerrarDepositar={() => setConfirmDepositId(null)}
            onCerrarEliminar={() => setConfirmDeleteId(null)}
            onDepositar={(id) => {
              depositar(id);
              setConfirmDepositId(null);
            }}
            onEliminar={(id) => {
              deleteCheque(id);
              setConfirmDeleteId(null);
            }}
          />

          {/* 🔴 Acá vive «Eliminar»: un cheque que no se va a cobrar SE BORRA —
              no se marca. Daniel: *«no lo quiero marcar»*. */}
          <DetalleCheque
            cheque={detailCheque}
            hoy={hoy}
            esAdmin={role === "admin"}
            onCerrar={() => setDetailCheque(null)}
            onEditar={(id) => {
              setDetailCheque(null);
              startEdit(id);
            }}
            onEliminar={(id) => {
              setDetailCheque(null);
              setConfirmDeleteId(id);
            }}
          />

          <ModalDelDia
            fecha={dayModal}
            cheques={chequeDelDia}
            recordatorios={recsDelDia}
            hoy={hoy}
            onCerrar={() => setDayModal(null)}
            onAbrirCheque={(id) => {
              setDayModal(null);
              setDetailCheque(cheques.find((c) => c.id === id) ?? null);
            }}
            onAbrirRecordatorio={(id) => {
              setDayModal(null);
              editarRecordatorio(id);
            }}
          />
        </div>
      </div>
    </PullToRefresh>
  );
}
