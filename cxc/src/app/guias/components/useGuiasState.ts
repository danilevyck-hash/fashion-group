"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Guia, GuiaItem, View } from "./types";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import {
  DEFAULT_TRANSPORTISTAS,
  DEFAULT_CLIENTES,
  DEFAULT_DIRECCIONES,
  DEFAULT_EMPRESAS,
  loadList,
  saveList,
  emptyItem,
} from "./constants";

export function useGuiasState() {
  const [view, _setView] = useState<View>("list");
  function setView(v: View) {
    _setView(v);
    if (v === "list") window.history.pushState(null, "", "/guias");
  }

  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Accordion expanded row
  const [expandedId, setExpandedId] = usePersistedState<string | null>("guias", "expanded", null);
  const [expandedGuia, setExpandedGuia] = useState<Guia | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // Dynamic lists
  const [transportistas, setTransportistas] = useState<string[]>(DEFAULT_TRANSPORTISTAS);
  const [clientes, setClientes] = useState<string[]>(DEFAULT_CLIENTES);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);
  const [empresas, setEmpresas] = useState<string[]>(DEFAULT_EMPRESAS);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [transportista, setTransportista] = useState(() => {
    try { return localStorage.getItem("fg_last_transportista") || ""; } catch { return ""; }
  });
  const [transportistaOtro, setTransportistaOtro] = useState("");
  const [entregadoPor, setEntregadoPor] = useState(() => {
    try { return localStorage.getItem("fg_last_entregado_por") || ""; } catch { return ""; }
  });
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [nextNumero, setNextNumero] = useState(1);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);

  // Draft auto-save for new guia form
  const guiaDraftData = useMemo(() => ({
    transportista, entregadoPor, items, observaciones,
  }), [transportista, entregadoPor, items, observaciones]);
  const isGuiaDraftEmpty = useCallback((d: typeof guiaDraftData) => {
    return !d.transportista && !d.entregadoPor && !d.observaciones && d.items.every(i => !i.cliente && !i.direccion && !i.facturas && (!i.bultos || i.bultos === 0));
  }, []);
  const { draft: guiaDraft, hasDraft: hasGuiaDraft, clearDraft: clearGuiaDraft, draftTimeAgo: guiaDraftTimeAgo } = useDraftAutoSave("guia", guiaDraftData, isGuiaDraftEmpty);

  function restoreGuiaDraft() {
    if (!guiaDraft) return;
    setTransportista(guiaDraft.transportista || "");
    setEntregadoPor(guiaDraft.entregadoPor || "");
    setObservaciones(guiaDraft.observaciones || "");
    if (guiaDraft.items?.length) setItems(guiaDraft.items);
    clearGuiaDraft();
  }

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

  // Persist signatures to localStorage so they survive browser close
  function setPendingFirma1(v: string | null) {
    _setPendingFirma1(v);
    try { if (expandedId) { if (v) localStorage.setItem(`guia_firma_${expandedId}_transportista`, v); else localStorage.removeItem(`guia_firma_${expandedId}_transportista`); } } catch { /* */ }
  }
  function setPendingFirma2(v: string | null) {
    _setPendingFirma2(v);
    try { if (expandedId) { if (v) localStorage.setItem(`guia_firma_${expandedId}_entregador`, v); else localStorage.removeItem(`guia_firma_${expandedId}_entregador`); } } catch { /* */ }
  }

  // Print state
  const [printGuia, setPrintGuia] = useState<Guia | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setTransportistas(loadList("fg_transportistas", DEFAULT_TRANSPORTISTAS));
    setClientes(loadList("fg_clientes", DEFAULT_CLIENTES));
    setDirecciones(loadList("fg_direcciones", DEFAULT_DIRECCIONES));
    setEmpresas(loadList("fg_empresas", DEFAULT_EMPRESAS));
  }, []);

  function addTransportista(name: string) {
    const updated = [...transportistas, name];
    setTransportistas(updated);
    saveList("fg_transportistas", DEFAULT_TRANSPORTISTAS, updated);
    setTransportista(name);
  }
  function addCliente(name: string) {
    const updated = [...clientes, name];
    setClientes(updated);
    saveList("fg_clientes", DEFAULT_CLIENTES, updated);
  }
  function addDireccion(name: string) {
    const updated = [...direcciones, name];
    setDirecciones(updated);
    saveList("fg_direcciones", DEFAULT_DIRECCIONES, updated);
  }
  function addEmpresa(name: string) {
    const updated = [...empresas, name];
    setEmpresas(updated);
    saveList("fg_empresas", DEFAULT_EMPRESAS, updated);
  }

  const loadGuias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guias");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuias(data);
      setNextNumero(data.length > 0 ? data[0].numero + 1 : 1);
    } catch {
      setError("Error al cargar guías");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Accordion expand/collapse ──

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
        // Pre-fill despacho fields if already dispatched
        setBPlaca(g.placa || "");
        setBReceptor(g.receptor_nombre || "");
        setBCedula(g.cedula || "");
        setBChofer(g.nombre_chofer || "");
        setTipoDespacho(g.tipo_despacho || "externo");
        // Restore saved signatures from localStorage
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

  // ── Delete ──

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

  // ── Print ──

  async function openPrint(id: string) {
    try {
      const res = await fetch(`/api/guias/${id}`);
      if (res.ok) {
        const g = await res.json();
        setPrintGuia(g);
        _setView("print");
        window.history.pushState({ guiaId: id }, "", `/guias?id=${id}`);
      } else {
        showToast("Error al cargar guía");
      }
    } catch {
      showToast("Error al cargar guía");
    }
  }

  // ── Edit ──

  async function startEdit(id: string) {
    try {
      const res = await fetch(`/api/guias/${id}`);
      if (!res.ok) { showToast("Error al cargar guía"); return; }
      const g = await res.json();
      setEditingId(g.id);
      setEditingEstado(g.estado || null);
      setFormNumero(g.numero);
      setFecha(g.fecha);
      if (transportistas.includes(g.transportista)) {
        setTransportista(g.transportista);
        setTransportistaOtro("");
      } else {
        setTransportista("__other__");
        setTransportistaOtro(g.transportista);
      }
      setEntregadoPor(g.entregado_por || "");
      setObservaciones(g.observaciones || "");
      const guiaItems = (g.guia_items || []) as GuiaItem[];
      setItems(
        guiaItems.length > 0
          ? guiaItems.map((item: GuiaItem, i: number) => ({ ...item, orden: i + 1 }))
          : [emptyItem(1)],
      );
      setError(null);
      setValidationErrors(new Set());
      setView("form");
    } catch {
      showToast("Error al cargar guía");
    }
  }

  function resetForm() {
    setEditingId(null);
    setEditingEstado(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setTransportista("");
    setTransportistaOtro("");
    setEntregadoPor("");
    setObservaciones("");
    setItems([emptyItem(1)]);
    setFormNumero(nextNumero);
    setValidationErrors(new Set());
  }

  function addRow() {
    console.log("[guia] agregar-linea antes", { items: items.length });
    setItems([...items, emptyItem(items.length + 1)]);
    console.log("[guia] agregar-linea despues", { items: items.length + 1 });
  }
  function removeRow(idx: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, orden: i + 1 })));
  }
  function updateItem(idx: number, field: keyof GuiaItem, value: string | number) {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function validate(): boolean {
    const errors = new Set<string>();
    const transp = transportista === "__other__" ? transportistaOtro : transportista;
    if (!fecha) errors.add("fecha");
    if (!transp) errors.add("transportista");
    if (!entregadoPor) errors.add("entregadoPor");
    const validItems = items.filter(
      (i) => i.cliente || i.direccion || i.facturas || i.bultos > 0,
    );
    if (validItems.length === 0) errors.add("items-empty");
    items.forEach((item, idx) => {
      const hasData = item.cliente || item.direccion || item.facturas || item.bultos > 0;
      if (!hasData) return;
      if (!item.cliente) errors.add(`item-${idx}-cliente`);
      if (!item.direccion) errors.add(`item-${idx}-direccion`);
      if (!item.empresa) errors.add(`item-${idx}-empresa`);
      if (!item.facturas) {
        errors.add(`item-${idx}-facturas`);
      } else {
        if (item.facturas.includes(",") && !item.facturas.match(/^[^,]+(, [^,]+)*$/)) {
          errors.add(`item-${idx}-facturas-separator`);
        } else if (item.facturas.includes(";")) {
          errors.add(`item-${idx}-facturas-separator`);
        }
        const parts = item.facturas.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.some((p) => p.replace(/\D/g, "").length < 4))
          errors.add(`item-${idx}-facturas-format`);
      }
      if (!item.bultos || item.bultos <= 0) errors.add(`item-${idx}-bultos`);
    });
    setValidationErrors(errors);
    if (errors.size > 0) {
      setError("Completa todos los campos obligatorios antes de guardar.");
      return false;
    }
    return true;
  }

  async function saveGuia(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    console.log(`[guia] saveGuia start (silent=${silent}, editing=${editingId ?? "new"})`);
    if (!validate()) return;
    const transp = transportista === "__other__" ? transportistaOtro : transportista;
    try { localStorage.setItem("fg_last_transportista", transportista); localStorage.setItem("fg_last_entregado_por", entregadoPor); } catch { /* */ }
    const validItems = items.filter(
      (i) => i.cliente || i.direccion || i.facturas || i.bultos > 0,
    );
    setSaving(true);
    const url = editingId ? `/api/guias/${editingId}` : "/api/guias";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        transportista: transp,
        entregado_por: entregadoPor,
        observaciones,
        estado: editingId && editingEstado ? editingEstado : "Pendiente Bodega",
        items: validItems,
      }),
    });
    if (res.ok) {
      setError(null);
      clearGuiaDraft();
      const guia = await res.json();
      if (!editingId && !silent) {
        const totalB = validItems.reduce(
          (s: number, i: { bultos: number }) => s + (i.bultos || 0),
          0,
        );
        fetch("/api/guias/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `Nueva Guía GT-${String(guia.numero).padStart(3, "0")} — Pendiente Bodega`,
            body: `<h2>Guía GT-${String(guia.numero).padStart(3, "0")}</h2><p><strong>Transportista:</strong> ${transp}</p><p><strong>Total bultos:</strong> ${totalB}</p><p>Pendiente de completar en bodega.</p>`,
          }),
        }).catch(() => {});
      }
      // En silent (auto-save durante edición) NO se resetea el form ni se
      // navega al listado — el usuario sigue editando sin interrupciones.
      if (!silent) {
        resetForm();
        loadGuias();
        setView("list");
      }
    } else {
      setError("Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  // ── Despacho (always with signatures) ──

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
      // Clear saved signatures from localStorage
      try { localStorage.removeItem(`guia_firma_${expandedGuia.id}_transportista`); localStorage.removeItem(`guia_firma_${expandedGuia.id}_entregador`); } catch { /* */ }

      // Refresh expanded guia
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
    // view
    view, setView, _setView,
    // list
    guias, loading, error,
    search, setSearch,
    showPending, setShowPending,
    // accordion
    expandedId, expandedGuia, expandedLoading, toggleExpand,
    // dynamic lists
    transportistas, clientes, direcciones, empresas,
    addTransportista, addCliente, addDireccion, addEmpresa,
    // form
    editingId,
    fecha, setFecha,
    transportista, setTransportista,
    transportistaOtro, setTransportistaOtro,
    entregadoPor, setEntregadoPor,
    observaciones, setObservaciones,
    items,
    nextNumero, formNumero,
    saving,
    validationErrors,
    updateItem, addRow, removeRow, resetForm,
    saveGuia,
    // draft
    hasGuiaDraft, guiaDraftTimeAgo, restoreGuiaDraft, clearGuiaDraft,
    // despacho
    tipoDespacho, setTipoDespacho,
    bPlaca, setBPlaca,
    bReceptor, setBReceptor,
    bCedula, setBCedula,
    bChofer, setBChofer,
    bSaving,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
    // print
    printGuia, setPrintGuia, openPrint,
    // toast
    toast, showToast,
    // actions
    loadGuias,
    startEdit,
    confirmDeleteId, setConfirmDeleteId,
    requestDeleteGuia, confirmDeleteGuia,
    confirmarDespacho,
    rejectGuia,
  };
}
