"use client";

// Hook del LISTADO de guías. El form vive en /guias/nueva y /guias/[id]/editar
// usando useGuiaFormState (archivo hermano). Este hook ya no maneja estado de
// edición, vista (form/list/print) ni editingId — todo eso se resolvió al
// mover el form a rutas dedicadas.
//
// 🩸 Y desde el rediseño de ago-2026 tampoco maneja el DESPACHO. Placa,
// receptor, cédula, chofer, N° del transportista y las dos firmas se mudaron a
// `useDespachoGuia`, el hook de `/guias/[id]`. Dejarlos acá habría dejado el
// estado del despacho vivo en una pantalla que ya no despacha — y era ese
// formulario desplegado dentro de la fila lo que confundía.

import { useState, useCallback } from "react";
import type { Guia, GuiaItem } from "./types";
import { usePersistedState } from "@/lib/hooks/usePersistedState";

export function useGuiasState() {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Accordion expanded row
  const [expandedId, setExpandedId] = usePersistedState<string | null>("guias", "expanded", null);
  const [expandedGuia, setExpandedGuia] = useState<Guia | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Atar el cliente de una línea ──────────────────────────────────────────
  // Va por su propio endpoint (`/api/guias/[id]/cliente`) y NO por el PUT: el
  // 98% de las guías están Completadas y el PUT las rechaza. El porqué está en
  // la cabecera de ese route.
  const [atarItem, setAtarItem] = useState<GuiaItem | null>(null);
  const [atarGuardando, setAtarGuardando] = useState(false);
  const [atarError, setAtarError] = useState<string | null>(null);

  const [showPending, setShowPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadGuias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guias");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuias(data);
    } catch {
      setError("Error al cargar guías");
    } finally {
      setLoading(false);
    }
  }, []);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedGuia(null);
      return;
    }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      const res = await fetch(`/api/guias/${id}`);
      if (res.ok) {
        const g = await res.json();
        setExpandedGuia(g);
      }
    } catch { showToast("Error al cargar detalles"); }
    setExpandedLoading(false);
  }

  function requestDeleteGuia(id: string) {
    setConfirmDeleteId(id);
  }

  async function confirmDeleteGuia() {
    if (!confirmDeleteId) return;
    try {
      const res = await fetch(`/api/guias/${confirmDeleteId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Guía eliminada");
      } else {
        showToast("Error al eliminar guía");
      }
    } catch {
      showToast("Error al eliminar guía");
    }
    setConfirmDeleteId(null);
    setExpandedId(null);
    setExpandedGuia(null);
    loadGuias();
  }

  function abrirAtarCliente(item: GuiaItem) {
    setAtarError(null);
    setAtarItem(item);
  }
  function cerrarAtarCliente() {
    setAtarItem(null);
    setAtarError(null);
  }

  /**
   * Guarda (o quita) el código de cliente de UNA línea. `codigo === null`
   * desata.
   *
   * ⚠️ La lista NO se recarga entera: se parcha la línea del acordeón abierto.
   * `loadGuias()` trae las 177 guías con sus ítems y esto se dispara una vez
   * por línea — atar una guía de 4 destinos serían 4 recargas completas.
   */
  async function guardarAtarCliente(codigo: string | null) {
    if (!atarItem?.id || !expandedGuia) return;
    setAtarGuardando(true);
    setAtarError(null);
    try {
      const res = await fetch(`/api/guias/${expandedGuia.id}/cliente`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: atarItem.id, cliente_codigo: codigo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAtarError(data.error || "No se pudo guardar");
        return;
      }
      const nuevo: string | undefined = data.cliente_codigo ?? undefined;
      setExpandedGuia((g) =>
        g
          ? {
              ...g,
              guia_items: (g.guia_items || []).map((it) =>
                it.id === atarItem.id ? { ...it, cliente_codigo: nuevo } : it
              ),
            }
          : g
      );
      // Y en la lista de arriba, para que el resumen no quede desfasado.
      setGuias((prev) =>
        prev.map((g) =>
          g.id === expandedGuia.id
            ? {
                ...g,
                guia_items: (g.guia_items || []).map((it) =>
                  it.id === atarItem.id ? { ...it, cliente_codigo: nuevo } : it
                ),
              }
            : g
        )
      );
      showToast(codigo ? `Cliente atado a ${codigo}` : "Cliente desatado");
      setAtarItem(null);
    } catch {
      setAtarError("Sin conexión. Intenta de nuevo en unos segundos.");
    } finally {
      setAtarGuardando(false);
    }
  }

  async function rejectGuia(id: string, motivo: string) {
    let res: Response;
    try {
      res = await fetch(`/api/guias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "Rechazada", motivo_rechazo: motivo }),
      });
    } catch {
      showToast("Sin conexión. Intenta de nuevo en unos segundos.");
      return;
    }
    if (res.ok) {
      showToast("Guía rechazada");
      if (expandedId === id) {
        const fullRes = await fetch(`/api/guias/${id}`);
        if (fullRes.ok) setExpandedGuia(await fullRes.json());
      }
      loadGuias();
    } else {
      showToast("Error al rechazar");
    }
  }

  return {
    guias, loading, error,
    search, setSearch,
    showPending, setShowPending,
    expandedId, expandedGuia, expandedLoading, toggleExpand,
    toast, showToast,
    loadGuias,
    confirmDeleteId, setConfirmDeleteId,
    requestDeleteGuia, confirmDeleteGuia,
    rejectGuia,
    atarItem, atarGuardando, atarError,
    abrirAtarCliente, cerrarAtarCliente, guardarAtarCliente,
  };
}
