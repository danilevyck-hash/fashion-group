"use client";

import { useState, useEffect, useCallback } from "react";
import type { Guia, GuiaItem, View } from "./types";
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

  // Dynamic lists
  const [transportistas, setTransportistas] = useState<string[]>(DEFAULT_TRANSPORTISTAS);
  const [clientes, setClientes] = useState<string[]>(DEFAULT_CLIENTES);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);
  const [empresas, setEmpresas] = useState<string[]>(DEFAULT_EMPRESAS);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [transportista, setTransportista] = useState("");
  const [transportistaOtro, setTransportistaOtro] = useState("");
  const [entregadoPor, setEntregadoPor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [nextNumero, setNextNumero] = useState(1);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);

  // Month filter
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthFilter, setMonthFilter] = useState(currentMonth);

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Detail / print state
  const [printGuia, setPrintGuia] = useState<Guia | null>(null);
  const [bPlaca, setBPlaca] = useState("");
  const [bReceptor, setBReceptor] = useState("");
  const [bCedula, setBCedula] = useState("");
  const [bSaving, setBSaving] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showPostDespacho, setShowPostDespacho] = useState(false);

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

  function requestDeleteGuia(id: string) {
    setConfirmDeleteId(id);
  }

  async function confirmDeleteGuia() {
    if (!confirmDeleteId) return;
    await fetch(`/api/guias/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    loadGuias();
    setView("list");
  }

  async function viewGuia(id: string) {
    const res = await fetch(`/api/guias/${id}`);
    if (res.ok) {
      const g = await res.json();
      setPrintGuia(g);
      setBPlaca(g.placa || "");
      setBReceptor(g.receptor_nombre || "");
      setBCedula(g.cedula || "");
      setShowPostDespacho(false);
      _setView("print");
      window.history.pushState({ guiaId: id }, "", `/guias?id=${id}`);
    }
  }

  async function startEdit(id: string) {
    const res = await fetch(`/api/guias/${id}`);
    if (!res.ok) return;
    const g = await res.json();
    setEditingId(g.id);
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
  }

  function resetForm() {
    setEditingId(null);
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
    setItems([...items, emptyItem(items.length + 1)]);
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

  async function saveGuia() {
    if (!validate()) return;
    const transp = transportista === "__other__" ? transportistaOtro : transportista;
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
        estado: "Pendiente Bodega",
        items: validItems,
      }),
    });
    if (res.ok) {
      setError(null);
      const guia = await res.json();
      if (!editingId) {
        const totalB = validItems.reduce(
          (s: number, i: { bultos: number }) => s + (i.bultos || 0),
          0,
        );
        fetch("/api/guias/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `📦 Nueva Guía #${guia.numero} — Pendiente Bodega`,
            body: `<h2>Guía #${guia.numero}</h2><p><strong>Transportista:</strong> ${transp}</p><p><strong>Total bultos:</strong> ${totalB}</p><p>Pendiente de completar en bodega.</p>`,
          }),
        }).catch(() => {});
      }
      resetForm();
      loadGuias();
      setView("list");
    } else {
      setError("Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  async function confirmarDespacho(
    placa: string,
    receptor: string,
    cedula: string,
    firma_base64: string,
    firma_entregador_base64: string,
  ) {
    if (!printGuia) return;
    setBSaving(true);
    const res = await fetch(`/api/guias/${printGuia.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa,
        receptor_nombre: receptor,
        cedula,
        firma_base64,
        firma_entregador_base64,
        estado: "Completada",
      }),
    });
    if (res.ok) {
      const bultos = (printGuia.guia_items || []).reduce((s, i) => s + (i.bultos || 0), 0);
      fetch("/api/guias/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `✅ Guía #${printGuia.numero} completada — Lista para imprimir`,
          body: `<h2>Guía #${printGuia.numero}</h2><p><strong>Transportista:</strong> ${printGuia.transportista}</p><p><strong>Placa:</strong> ${placa}</p><p><strong>Receptor:</strong> ${receptor}</p><p><strong>Total bultos:</strong> ${bultos}</p>`,
        }),
      }).catch(() => {});
      const fullRes = await fetch(`/api/guias/${printGuia.id}`);
      if (fullRes.ok) {
        const updated = await fullRes.json();
        setPrintGuia(updated);
        setBPlaca(updated.placa || "");
        setBReceptor(updated.receptor_nombre || "");
        setBCedula(updated.cedula || "");
      }
      loadGuias();
      setShowPostDespacho(true);
    } else {
      const errData = await res.json().catch(() => ({}));
      showToast(errData.error || "Error al guardar");
    }
    setBSaving(false);
  }

  return {
    // view
    view, setView, _setView,
    // list
    guias, loading, error,
    search, setSearch,
    monthFilter, setMonthFilter,
    showPending, setShowPending,
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
    // detail
    printGuia, setPrintGuia,
    bPlaca, setBPlaca,
    bReceptor, setBReceptor,
    bCedula, setBCedula,
    bSaving,
    showPostDespacho, setShowPostDespacho,
    toast,
    showToast,
    // actions
    loadGuias,
    viewGuia,
    startEdit,
    confirmDeleteId, setConfirmDeleteId,
    requestDeleteGuia, confirmDeleteGuia,
    confirmarDespacho,
  };
}
