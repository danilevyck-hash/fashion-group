"use client";

// Hook del FORM de guía (crear o editar). Extraído de useGuiasState para
// soportar rutas dedicadas /guias/nueva y /guias/[id]/editar.
// El hook del listado (useGuiasState) ya no maneja estado de form.
//
// Sprint 2 (2026-05-26): el campo libre `transportista` se reemplazó por
// (modoEntrega, transportistaId). El catálogo se lee de /api/transportistas
// (tabla canónica con 6 registros activos seedeados en Sprint 1).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import type { GuiaItem, ModoEntrega, Transportista } from "./types";
import {
  DEFAULT_CLIENTES,
  DEFAULT_DIRECCIONES,
  DEFAULT_EMPRESAS,
  loadList,
  saveList,
  emptyItem,
} from "./constants";

interface Options {
  editingId?: string | null; // null = creación
}

export function useGuiaFormState({ editingId = null }: Options = {}) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Catálogo canónico de transportistas (vive en DB, no localStorage).
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [clientes, setClientes] = useState<string[]>(DEFAULT_CLIENTES);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);
  const [empresas, setEmpresas] = useState<string[]>(DEFAULT_EMPRESAS);

  // Form state
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  // Fecha default = HOY en hora LOCAL. toISOString() es UTC y en Panamá (UTC-5)
  // de noche devolvía el día siguiente; construimos la fecha local a mano.
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [modoEntrega, setModoEntrega] = useState<ModoEntrega>(() => {
    try { return (localStorage.getItem("fg_last_modo_entrega") as ModoEntrega) || "transportista"; } catch { return "transportista"; }
  });
  const [transportistaId, setTransportistaId] = useState<string | null>(() => {
    try { return localStorage.getItem("fg_last_transportista_id") || null; } catch { return null; }
  });
  const [entregadoPor, setEntregadoPor] = useState(() => {
    try { return localStorage.getItem("fg_last_entregado_por") || ""; } catch { return ""; }
  });
  const [observaciones, setObservaciones] = useState("");
  // N° de guía del transportista (nivel guía). Opcional al crear; obligatorio
  // al despachar cuando el modo es transportista externo (validado en despacho).
  const [numeroGuiaTransp, setNumeroGuiaTransp] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(editingId === null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Cargar listas dinámicas + catálogo de transportistas
  useEffect(() => {
    setClientes(loadList("fg_clientes", DEFAULT_CLIENTES));
    setDirecciones(loadList("fg_direcciones", DEFAULT_DIRECCIONES));
    setEmpresas(loadList("fg_empresas", DEFAULT_EMPRESAS));
    fetch("/api/transportistas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Transportista[]) => setTransportistas(data || []))
      .catch(() => { /* el form muestra el modo "Entrega directa" como fallback */ });
  }, []);

  // Si es edición: cargar la guía una sola vez
  useEffect(() => {
    if (!editingId) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/guias/${editingId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo cargar la guía");
        const g = await res.json();
        if (cancelado) return;
        setEditingEstado(g.estado || null);
        setFormNumero(g.numero);
        setFecha(g.fecha);
        // Sprint 2: modo + FK directos del backend
        if (g.modo_entrega === "transportista" || g.modo_entrega === "entrega_directa") {
          setModoEntrega(g.modo_entrega);
        } else {
          setModoEntrega(g.transportista_id ? "transportista" : "entrega_directa");
        }
        setTransportistaId(g.transportista_id || null);
        setEntregadoPor(g.entregado_por || "");
        setObservaciones(g.observaciones || "");
        setNumeroGuiaTransp(g.numero_guia_transp || "");
        const guiaItems = (g.guia_items || []) as GuiaItem[];
        setItems(
          guiaItems.length > 0
            ? guiaItems.map((item, i) => ({ ...item, orden: i + 1 }))
            : [emptyItem(1)],
        );
        setLoaded(true);
      } catch {
        if (!cancelado) {
          showToast("Error al cargar guía");
          router.push("/guias");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [editingId, router, showToast]);

  // Siguiente número para creación
  useEffect(() => {
    if (editingId) return;
    fetch("/api/guias")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ numero: number }>) => {
        setFormNumero(data.length > 0 ? data[0].numero + 1 : 1);
      })
      .catch(() => {});
  }, [editingId]);

  // Draft auto-save (incluye modo + FK)
  const guiaDraftData = useMemo(() => ({
    modoEntrega, transportistaId, entregadoPor, items, observaciones,
  }), [modoEntrega, transportistaId, entregadoPor, items, observaciones]);
  const isGuiaDraftEmpty = useCallback((d: typeof guiaDraftData) => {
    return !d.transportistaId && !d.entregadoPor && !d.observaciones && d.items.every(i => !i.cliente && !i.direccion && !i.facturas && (!i.bultos || i.bultos === 0));
  }, []);
  // Auto-save del borrador + restaurar (banner en /guias/nueva, patrón cheques).
  // Antes el borrador se guardaba pero el banner de restaurar estaba eliminado
  // → trabajo perdido si se cerraba la pestaña en una guía nueva.
  const { draft: guiaDraft, hasDraft: hasGuiaDraft, clearDraft: clearGuiaDraft, draftTimeAgo: guiaDraftTimeAgo } =
    useDraftAutoSave("guia", guiaDraftData, isGuiaDraftEmpty);
  function restoreGuiaDraft() {
    if (!guiaDraft) return;
    setModoEntrega(guiaDraft.modoEntrega || "transportista");
    setTransportistaId(guiaDraft.transportistaId || "");
    setEntregadoPor(guiaDraft.entregadoPor || "");
    setObservaciones(guiaDraft.observaciones || "");
    if (guiaDraft.items?.length) setItems(guiaDraft.items);
    clearGuiaDraft();
  }

  // Adders de listas dinámicas (transportistas ya no se agregan desde el form
  // — son catálogo controlado por admin)
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

  // Items
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
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Actualiza varios campos de una fila de forma ATÓMICA (functional update),
  // para casos como el typeahead de cliente que setea cliente + cliente_codigo
  // en un solo evento sin que la segunda escritura pise a la primera.
  function updateItemFields(idx: number, partial: Partial<GuiaItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...partial } : item)));
  }

  function validate(): boolean {
    const errors = new Set<string>();
    if (!fecha) errors.add("fecha");
    if (modoEntrega === "transportista" && !transportistaId) errors.add("transportista");
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
    try {
      localStorage.setItem("fg_last_modo_entrega", modoEntrega);
      if (transportistaId) localStorage.setItem("fg_last_transportista_id", transportistaId);
      localStorage.setItem("fg_last_entregado_por", entregadoPor);
    } catch { /* */ }
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
        modo_entrega: modoEntrega,
        transportista_id: modoEntrega === "transportista" ? transportistaId : null,
        entregado_por: entregadoPor,
        observaciones,
        numero_guia_transp: numeroGuiaTransp.trim() || null,
        estado: editingId && editingEstado ? editingEstado : "Pendiente Bodega",
        items: validItems,
      }),
    });
    if (res.ok) {
      setError(null);
      clearGuiaDraft();
      // Aviso de creación eliminado (antes mandaba email interno a info@).
      // El único aviso de guías ahora es el de DESPACHO (Telegram), en
      // /api/guias/[id] al pasar a estado "Completada".
      // En silent (auto-save) NO navega ni resetea — preserva contexto.
      if (!silent) {
        router.push("/guias");
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      setError(errData.error || "Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  return {
    // meta
    editingId,
    loaded,
    error,
    validationErrors,
    toast,
    showToast,
    // listas
    transportistas, clientes, direcciones, empresas,
    addCliente, addDireccion, addEmpresa,
    // form
    formNumero,
    fecha, setFecha,
    modoEntrega, setModoEntrega,
    transportistaId, setTransportistaId,
    entregadoPor, setEntregadoPor,
    observaciones, setObservaciones,
    numeroGuiaTransp, setNumeroGuiaTransp,
    items,
    saving,
    updateItem, updateItemFields, addRow, removeRow,
    saveGuia,
    // draft: banner de restaurar en /guias/nueva + limpieza al guardar
    hasGuiaDraft, guiaDraftTimeAgo, restoreGuiaDraft, clearGuiaDraft,
  };
}
