"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { CajaPeriodo, CajaGasto, CajaResponsable } from "../components/types";

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// ── Claves SWR del módulo Caja (caché en memoria entre navegaciones, vía
// SWRProvider). Mismas opciones que el piloto CXC (#115): dedupe 60s +
// revalidateOnFocus por-hook. Clave null hasta authReady → preserva el gate de
// sesión (no se pega a /api/caja/* antes de confirmar rol). ──
const SWR_OPTS = { dedupingInterval: 60_000, revalidateOnFocus: true } as const;
const KEY_PERIODOS = "caja-periodos";
const KEY_CATEGORIAS = "caja-categorias";
const KEY_RESPONSABLES = "caja-responsables";
const keyPeriodo = (id: string) => ["caja-periodo", id] as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  return res.json();
}

async function fetchPeriodoDetail(id: string): Promise<CajaPeriodo> {
  const data = await fetchJson<CajaPeriodo>(`/api/caja/periodos/${id}?include_deleted=1`);
  const gastos = data.caja_gastos || [];
  data.total_gastado = gastos.reduce((s: number, g: CajaGasto) => s + (g.total || 0), 0);
  return data;
}

interface UseCajaOptions {
  /** Cuando es false, las claves SWR son null → no dispara fetch (gate de sesión). */
  authReady?: boolean;
  onPeriodoDeleted?: (id: string) => void;
}

export function useCajaState(opts?: UseCajaOptions) {
  const authReady = opts?.authReady ?? true;
  const { mutate: globalMutate } = useSWRConfig();

  const [pendingDeleteGasto, setPendingDeleteGasto] = useState<CajaGasto | null>(null);
  const [pendingRestoreGasto, setPendingRestoreGasto] = useState<CajaGasto | null>(null);

  // Errores de MUTACIÓN (escritura). Los errores de LECTURA salen de SWR y se
  // combinan abajo en `error`.
  const [error, setError] = useState<string | null>(null);
  const [confirmClosePeriodo, setConfirmClosePeriodo] = useState<string | null>(null);
  const [confirmDeletePeriodoId, setConfirmDeletePeriodoId] = useState<string | null>(null);
  const [showNewPeriodoModal, setShowNewPeriodoModal] = useState(false);
  const [fondoInput, setFondoInput] = useState("200");

  // Cuál período está abierto en la vista de detalle. Lo setea loadDetail(id) →
  // cambia la clave SWR del detalle y dispara su fetch.
  const [detailId, setDetailId] = useState<string | null>(null);

  // Inline-edit state (still lives here because GastoTable edits in place)
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);
  const [editGasto, setEditGasto] = useState<Partial<CajaGasto>>({});

  // ── Lecturas vía SWR (reemplazan loadPeriodos + el useEffect de catálogos +
  // loadDetail). Claves null hasta authReady. ──
  const { data: periodosData, error: periodosError, isLoading: periodosLoading, mutate: mutatePeriodos } =
    useSWR<CajaPeriodo[]>(authReady ? KEY_PERIODOS : null, () => fetchJson<CajaPeriodo[]>("/api/caja/periodos"), SWR_OPTS);
  const { data: categoriasData, error: categoriasError } =
    useSWR<string[]>(authReady ? KEY_CATEGORIAS : null, () => fetchJson<string[]>("/api/caja/categorias"), SWR_OPTS);
  const { data: responsablesData, error: responsablesError } =
    useSWR<CajaResponsable[]>(authReady ? KEY_RESPONSABLES : null, () => fetchJson<CajaResponsable[]>("/api/caja/responsables"), SWR_OPTS);
  const { data: detailData, mutate: mutateDetail } =
    useSWR<CajaPeriodo>(authReady && detailId ? keyPeriodo(detailId) : null, ([, id]: readonly [string, string]) => fetchPeriodoDetail(id), SWR_OPTS);

  const periodos = useMemo(() => (Array.isArray(periodosData) ? periodosData : []), [periodosData]);
  const categorias = useMemo(() => (Array.isArray(categoriasData) ? categoriasData : []), [categoriasData]);
  const responsablesCatalog = useMemo(() => (Array.isArray(responsablesData) ? responsablesData : []), [responsablesData]);
  const current = detailData ?? null;

  // Solo "cargando" cuando aún no hay nada que mostrar (primer arranque). Al
  // volver al módulo, la caché SWR ya tiene los períodos → sin spinner.
  const loading = periodosLoading && !periodosData;

  // Errores de lectura → mismos mensajes que el fetch-on-mount original.
  const loadError = periodosError
    ? "Error al cargar períodos"
    : categoriasError
      ? "No se pudieron cargar las categorías. Recarga la página."
      : responsablesError
        ? "No se pudieron cargar los responsables. Recarga la página."
        : null;

  // Merge distinct categories/responsables from loaded gastos with managed lists
  const allCategorias = useMemo(() => {
    const gastos = current?.caja_gastos || [];
    const fromGastos = gastos.map((g) => normalizeStr(g.categoria || "")).filter(Boolean);
    const merged = new Set([...categorias, ...fromGastos]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "es"));
  }, [categorias, current]);

  const allResponsables = useMemo(() => {
    const gastos = current?.caja_gastos || [];
    const fromGastos = gastos.map((g) => normalizeStr(g.responsable || "")).filter(Boolean);
    const fromCatalog = responsablesCatalog.map((r) => r.nombre);
    const merged = new Set([...fromCatalog, ...fromGastos]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "es"));
  }, [responsablesCatalog, current]);

  const loadPeriodos = useCallback(async () => { await mutatePeriodos(); }, [mutatePeriodos]);

  // loadDetail(id): fija el período de detalle (cambia la clave SWR → fetch en
  // clave nueva) y revalida esa clave. globalMutate por-clave es estable, así no
  // hay churn de identidad en el useEffect del page consumidor.
  const loadDetail = useCallback(async (id: string) => {
    setDetailId(id);
    await globalMutate(keyPeriodo(id));
  }, [globalMutate]);

  // setCurrent: conservado por estabilidad de interfaz. null → limpia el detalle;
  // un período → siembra optimista la caché del detalle sin revalidar.
  const setCurrent = useCallback((p: CajaPeriodo | null) => {
    if (!p) { setDetailId(null); return; }
    setDetailId(p.id);
    void globalMutate(keyPeriodo(p.id), p, { revalidate: false });
  }, [globalMutate]);

  function createPeriodo() {
    setFondoInput("200");
    setShowNewPeriodoModal(true);
  }

  async function confirmCreatePeriodo(): Promise<string | null> {
    const fondo = parseFloat(fondoInput);
    if (isNaN(fondo) || fondo <= 0) return null;
    setShowNewPeriodoModal(false);
    setError(null);
    try {
      const res = await fetch("/api/caja/periodos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fondo_inicial: fondo }),
      });
      if (!res.ok) throw new Error();
      const p = await res.json();
      loadPeriodos();
      return p.id as string;
    } catch {
      setError("Error al crear período");
      return null;
    }
  }

  function requestClosePeriodo(id: string) {
    setConfirmClosePeriodo(id);
  }

  async function doClosePeriodo() {
    if (!confirmClosePeriodo) return;
    const id = confirmClosePeriodo;
    setConfirmClosePeriodo(null);
    try {
      const res = await fetch(`/api/caja/periodos/${id}`, { method: "PATCH" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const backendMsg = payload && typeof payload.error === "string" ? payload.error : null;
        setError(backendMsg || "Error al cerrar periodo");
        return;
      }
      if (current?.id === id) await loadDetail(id);
      loadPeriodos();
    } catch {
      setError("Error al cerrar periodo");
    }
  }

  function requestDeletePeriodo(id: string) {
    setConfirmDeletePeriodoId(id);
  }

  async function doDeletePeriodo() {
    if (!confirmDeletePeriodoId) return;
    const id = confirmDeletePeriodoId;
    setConfirmDeletePeriodoId(null);
    const res = await fetch(`/api/caja/periodos/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadPeriodos();
      if (current?.id === id) setCurrent(null);
      opts?.onPeriodoDeleted?.(id);
    } else {
      setError("Error al eliminar período");
    }
  }

  async function aprobarReposicion(id: string) {
    const res = await fetch(`/api/caja/periodos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repuesto" }),
    });
    if (res.ok) { await loadDetail(id); loadPeriodos(); }
    else setError("Error al aprobar reposición");
  }

  function requestDeleteGasto(gastoId: string) {
    if (!current) return;
    const gasto = (current.caja_gastos || []).find((g: CajaGasto) => g.id === gastoId);
    if (!gasto) return;
    setPendingDeleteGasto(gasto);
  }

  function cancelDeleteGasto() {
    setPendingDeleteGasto(null);
  }

  async function doDeleteGasto() {
    if (!current || !pendingDeleteGasto) return;
    const gastoId = pendingDeleteGasto.id;
    const periodoId = current.id;
    setPendingDeleteGasto(null);
    try {
      const res = await fetch(`/api/caja/gastos/${gastoId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const backendMsg = payload && typeof payload.error === "string" ? payload.error : null;
        setError(backendMsg || "Error al eliminar gasto");
        return;
      }
      await loadDetail(periodoId);
      loadPeriodos();
    } catch {
      setError("Error al eliminar gasto");
    }
  }

  function requestRestoreGasto(gasto: CajaGasto) {
    setPendingRestoreGasto(gasto);
  }

  function cancelRestoreGasto() {
    setPendingRestoreGasto(null);
  }

  async function doRestoreGasto() {
    if (!current || !pendingRestoreGasto) return;
    const gastoId = pendingRestoreGasto.id;
    const periodoId = current.id;
    setPendingRestoreGasto(null);
    try {
      const res = await fetch(`/api/caja/gastos/${gastoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const backendMsg = payload && typeof payload.error === "string" ? payload.error : null;
        setError(backendMsg || "Error al restaurar gasto");
        return;
      }
      await loadDetail(periodoId);
      loadPeriodos();
    } catch {
      setError("Error al restaurar gasto");
    }
  }

  async function saveEditGasto() {
    if (!current || !editingGastoId) return;
    const sub = parseFloat(String(editGasto.subtotal)) || 0;
    const tax = Math.round((parseFloat(String(editGasto.itbms)) || 0) * 100) / 100;
    const total = Math.round((sub + tax) * 100) / 100;
    const normalizedEdit = {
      ...editGasto,
      subtotal: sub, itbms: tax, total,
      categoria: normalizeStr(editGasto.categoria || ""),
      responsable: normalizeStr(editGasto.responsable || ""),
    };
    try {
      const res = await fetch(`/api/caja/gastos/${editingGastoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedEdit),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const backendMsg = payload && typeof payload.error === "string" ? payload.error : null;
        setError(backendMsg || "Error al guardar cambios");
        return;
      }
      setEditingGastoId(null); setEditGasto({});
      await loadDetail(current.id); loadPeriodos();
    } catch {
      setError("Error al guardar cambios");
    }
  }

  // Cambio rápido de SOLO la categoría desde el chip inline (PATCH parcial).
  async function quickUpdateCategoria(gastoId: string, categoria: string) {
    if (!current) return;
    try {
      const res = await fetch(`/api/caja/gastos/${gastoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: normalizeStr(categoria) || "Varios" }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError((payload && typeof payload.error === "string" ? payload.error : null) || "Error al cambiar categoría");
        return;
      }
      await loadDetail(current.id); loadPeriodos();
    } catch {
      setError("Error al cambiar categoría");
    }
  }

  async function exportExcel() {
    if (!current) return;
    const res = await fetch("/api/caja/export-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodo_id: current.id }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CajaMenuda-Periodo${current.numero}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return {
    periodos, loading, current, setCurrent,
    // Mutación tiene prioridad; si no, error de lectura (SWR).
    error: error ?? loadError,
    allCategorias,
    showNewPeriodoModal, setShowNewPeriodoModal, fondoInput, setFondoInput,
    allResponsables,
    editingGastoId, setEditingGastoId, editGasto, setEditGasto,
    confirmClosePeriodo, setConfirmClosePeriodo,
    confirmDeletePeriodoId, setConfirmDeletePeriodoId,
    loadDetail, createPeriodo, confirmCreatePeriodo,
    requestClosePeriodo, doClosePeriodo,
    requestDeletePeriodo, doDeletePeriodo,
    aprobarReposicion,
    requestDeleteGasto, saveEditGasto, quickUpdateCategoria, exportExcel,
    pendingDeleteGasto, doDeleteGasto, cancelDeleteGasto,
    pendingRestoreGasto, requestRestoreGasto, doRestoreGasto, cancelRestoreGasto,
  };
}
