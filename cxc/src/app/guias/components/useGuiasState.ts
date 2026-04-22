"use client";

// Hook del LISTADO de guías. El form vive en /guias/nueva y /guias/[id]/editar
// usando useGuiaFormState (archivo hermano). Este hook ya no maneja estado de
// edición, vista (form/list/print) ni editingId — todo eso se resolvió al
// mover el form a rutas dedicadas.

import { useState, useCallback } from "react";
import type { Guia } from "./types";
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

  // Despacho state
  const [bPlaca, setBPlaca] = useState("");
  const [bReceptor, setBReceptor] = useState("");
  const [bCedula, setBCedula] = useState("");
  const [bChofer, setBChofer] = useState("");
  const [bSaving, setBSaving] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [tipoDespacho, setTipoDespacho] = useState<"externo" | "directo">("externo");
  const [pendingFirma1, _setPendingFirma1] = useState<string | null>(null);
  const [pendingFirma2, _setPendingFirma2] = useState<string | null>(null);

  function setPendingFirma1(v: string | null) {
    _setPendingFirma1(v);
    try { if (expandedId) { if (v) localStorage.setItem(`guia_firma_${expandedId}_transportista`, v); else localStorage.removeItem(`guia_firma_${expandedId}_transportista`); } } catch { /* */ }
  }
  function setPendingFirma2(v: string | null) {
    _setPendingFirma2(v);
    try { if (expandedId) { if (v) localStorage.setItem(`guia_firma_${expandedId}_entregador`, v); else localStorage.removeItem(`guia_firma_${expandedId}_entregador`); } } catch { /* */ }
  }

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
      resetDespachoFields();
      return;
    }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      const res = await fetch(`/api/guias/${id}`);
      if (res.ok) {
        const g = await res.json();
        setExpandedGuia(g);
        setBPlaca(g.placa || "");
        setBReceptor(g.receptor_nombre || "");
        setBCedula(g.cedula || "");
        setBChofer(g.nombre_chofer || "");
        setTipoDespacho(g.tipo_despacho || "externo");
        try {
          const saved1 = localStorage.getItem(`guia_firma_${id}_transportista`);
          const saved2 = localStorage.getItem(`guia_firma_${id}_entregador`);
          if (saved1) _setPendingFirma1(saved1);
          if (saved2) _setPendingFirma2(saved2);
        } catch { /* */ }
      }
    } catch { showToast("Error al cargar detalles"); }
    setExpandedLoading(false);
  }

  function resetDespachoFields() {
    setBPlaca("");
    setBReceptor("");
    setBCedula("");
    setBChofer("");
    setTipoDespacho("externo");
    setPendingFirma1(null);
    setPendingFirma2(null);
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

  async function confirmarDespacho(firma1: string, firma2: string) {
    if (!expandedGuia) return;
    setBSaving(true);

    const payload: Record<string, unknown> = {
      estado: "Completada",
      tipo_despacho: tipoDespacho,
      receptor_nombre: bReceptor,
      cedula: bCedula,
      firma_base64: firma1,
      firma_entregador_base64: firma2,
    };

    if (tipoDespacho === "externo") {
      payload.placa = bPlaca;
    } else {
      payload.nombre_chofer = bChofer;
    }

    const res = await fetch(`/api/guias/${expandedGuia.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      showToast(`Guía GT-${String(expandedGuia.numero).padStart(3, "0")} despachada`);
      try { localStorage.removeItem(`guia_firma_${expandedGuia.id}_transportista`); localStorage.removeItem(`guia_firma_${expandedGuia.id}_entregador`); } catch { /* */ }

      const fullRes = await fetch(`/api/guias/${expandedGuia.id}`);
      if (fullRes.ok) {
        const updated = await fullRes.json();
        setExpandedGuia(updated);
      }
      loadGuias();
    } else {
      const errData = await res.json().catch(() => ({}));
      showToast(errData.error || "Error al guardar");
    }
    setBSaving(false);
  }

  async function rejectGuia(id: string, motivo: string) {
    const res = await fetch(`/api/guias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "Rechazada", observaciones: motivo }),
    });
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
    tipoDespacho, setTipoDespacho,
    bPlaca, setBPlaca,
    bReceptor, setBReceptor,
    bCedula, setBCedula,
    bChofer, setBChofer,
    bSaving,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
    toast, showToast,
    loadGuias,
    confirmDeleteId, setConfirmDeleteId,
    requestDeleteGuia, confirmDeleteGuia,
    confirmarDespacho,
    rejectGuia,
  };
}
