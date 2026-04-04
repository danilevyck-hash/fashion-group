"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CajaPeriodo, CajaGasto, View, CATEGORIAS_DEFAULT } from "../components/types";
import { GastoFormValues, GastoFormSetters } from "../components/GastoForm";

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function useCajaState(urlId: string, initialView: View) {
  const [view, _setView] = useState<View>(initialView);

  function setView(v: View, id?: string) {
    _setView(v);
    if (v === "list") {
      window.history.pushState(null, "", "/caja");
    } else if (id) {
      window.history.pushState(null, "", `/caja?view=${v}&id=${id}`);
    }
  }

  const [periodos, setPeriodos] = useState<CajaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CajaPeriodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categorias, setCategorias] = useState(CATEGORIAS_DEFAULT);
  const [showManageCat, setShowManageCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [confirmClosePeriodo, setConfirmClosePeriodo] = useState<string | null>(null);
  const [confirmDeletePeriodoId, setConfirmDeletePeriodoId] = useState<string | null>(null);
  const [confirmDeleteGastoId, setConfirmDeleteGastoId] = useState<string | null>(null);
  const [showNewPeriodoModal, setShowNewPeriodoModal] = useState(false);
  const [fondoInput, setFondoInput] = useState("200");
  const [responsables, setResponsables] = useState<string[]>([]);
  const [showAddResponsable, setShowAddResponsable] = useState(false);
  const [newResponsable, setNewResponsable] = useState("");

  // Add expense form state
  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gDescripcion, setGDescripcion] = useState("");
  const [gProveedor, setGProveedor] = useState("");
  const [gNroFactura, setGNroFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState("");
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [gCategoria, setGCategoria] = useState("Transporte");
  const [gCategoriaOtro, setGCategoriaOtro] = useState("");
  const [gResponsable, setGResponsable] = useState("");
  const [gEmpresa, setGEmpresa] = useState("");
  const [gEmpresaOtro, setGEmpresaOtro] = useState("");
  const [addingGasto, setAddingGasto] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);
  const [editGasto, setEditGasto] = useState<Partial<CajaGasto>>({});

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 100) / 100;
  const totalNum = Math.round((subtotalNum + itbmsNum) * 100) / 100;

  const formValues: GastoFormValues = {
    gFecha, gDescripcion, gProveedor, gNroFactura,
    gSubtotal, gItbmsPct, gCategoria, gCategoriaOtro,
    gResponsable, gEmpresa, gEmpresaOtro,
  };
  const formSetters: GastoFormSetters = {
    setGFecha, setGDescripcion, setGProveedor, setGNroFactura,
    setGSubtotal, setGItbmsPct, setGCategoria, setGCategoriaOtro,
    setGResponsable, setGEmpresa, setGEmpresaOtro,
  };

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
    const merged = new Set([...responsables, ...fromGastos]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "es"));
  }, [responsables, current]);

  const loadPeriodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/caja/periodos");
      if (!res.ok) throw new Error();
      setPeriodos(await res.json());
    } catch {
      setError("Error al cargar períodos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/caja/categorias")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: string[] | null) => {
        if (data && data.length > 0) setCategorias(data);
      })
      .catch(() => { console.error('Failed to load categorias'); });
    loadPeriodos();
    fetch("/api/caja/responsables")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const names = (data || []).map((r: { nombre: string }) => r.nombre);
        if (names.length > 0) {
          setResponsables(names);
          localStorage.setItem("fg_responsables", JSON.stringify(names));
        } else {
          try { const cached = JSON.parse(localStorage.getItem("fg_responsables") || "[]"); if (cached.length > 0) setResponsables(cached); } catch { console.error('Failed to parse cached responsables'); }
        }
      })
      .catch(() => {
        console.error('Failed to load responsables');
        try { const cached = JSON.parse(localStorage.getItem("fg_responsables") || "[]"); if (cached.length > 0) setResponsables(cached); } catch { console.error('Failed to parse cached responsables'); }
      });
  }, []);

  async function loadDetail(id: string) {
    const res = await fetch(`/api/caja/periodos/${id}`);
    if (res.ok) {
      const data = await res.json();
      const gastos = data.caja_gastos || [];
      data.total_gastado = gastos.reduce((s: number, g: CajaGasto) => s + (g.total || 0), 0);
      setCurrent(data);
      setView("detail", id);
    }
  }

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const v = (params.get("view") as View) || "list";
      const id = params.get("id") || "";
      _setView(v);
      if (id && v !== "list") {
        loadDetail(id);
      } else {
        setCurrent(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (urlId && (initialView === "detail" || initialView === "print")) {
      loadDetail(urlId).then(() => { if (initialView === "print") _setView("print"); });
    }
  }, [urlId]);

  function createPeriodo() {
    setFondoInput("200");
    setShowNewPeriodoModal(true);
  }

  async function confirmCreatePeriodo() {
    const fondo = parseFloat(fondoInput);
    if (isNaN(fondo) || fondo <= 0) return;
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
      await loadDetail(p.id);
    } catch {
      setError("Error al crear período");
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
      await fetch(`/api/caja/periodos/${id}`, { method: "PATCH" });
      await loadDetail(id);
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
      if (current?.id === id) { setCurrent(null); setView("list", undefined); }
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

  async function addGasto() {
    if (!current) return;
    setAddingGasto(true);
    setError(null);
    try {
      const resolvedCategoria = normalizeStr(gCategoria === "Otro" ? gCategoriaOtro.trim() || "Otro" : gCategoria);
      const resolvedEmpresa = gEmpresa === "Otro / General" ? gEmpresaOtro.trim() || "Otro / General" : gEmpresa;
      const resolvedResponsable = normalizeStr(gResponsable);
      const res = await fetch("/api/caja/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_id: current.id, fecha: gFecha, descripcion: gDescripcion,
          proveedor: gProveedor, nro_factura: gNroFactura, responsable: resolvedResponsable,
          categoria: resolvedCategoria, empresa: resolvedEmpresa,
          subtotal: subtotalNum, itbms: itbmsNum, total: totalNum,
        }),
      });
      if (!res.ok) throw new Error();
      setGFecha(new Date().toISOString().split("T")[0]);
      setGDescripcion(""); setGProveedor(""); setGNroFactura(""); setGSubtotal(""); setGItbmsPct("0");
      setGCategoria("Transporte"); setGCategoriaOtro(""); setGResponsable(""); setGEmpresa(""); setGEmpresaOtro("");
      await loadDetail(current.id);
      loadPeriodos();
    } catch {
      setError("Error al agregar gasto");
    } finally {
      setAddingGasto(false);
    }
  }

  function requestDeleteGasto(gastoId: string) {
    setConfirmDeleteGastoId(gastoId);
  }

  async function doDeleteGasto() {
    if (!current || !confirmDeleteGastoId) return;
    const gastoId = confirmDeleteGastoId;
    setConfirmDeleteGastoId(null);
    await fetch(`/api/caja/gastos/${gastoId}`, { method: "DELETE" });
    await loadDetail(current.id);
    loadPeriodos();
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
    await fetch(`/api/caja/gastos/${editingGastoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedEdit),
    });
    setEditingGastoId(null); setEditGasto({});
    await loadDetail(current.id); loadPeriodos();
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
    view, setView, _setView,
    periodos, loading, current, setCurrent, error,
    categorias, setCategorias, allCategorias, showManageCat, setShowManageCat, newCatName, setNewCatName,
    showNewPeriodoModal, setShowNewPeriodoModal, fondoInput, setFondoInput,
    responsables, setResponsables, allResponsables, showAddResponsable, setShowAddResponsable, newResponsable, setNewResponsable,
    addingGasto, subtotalNum, totalNum,
    editingGastoId, setEditingGastoId, editGasto, setEditGasto,
    formValues, formSetters,
    confirmClosePeriodo, setConfirmClosePeriodo,
    confirmDeletePeriodoId, setConfirmDeletePeriodoId,
    confirmDeleteGastoId, setConfirmDeleteGastoId,
    loadDetail, createPeriodo, confirmCreatePeriodo,
    requestClosePeriodo, doClosePeriodo,
    requestDeletePeriodo, doDeletePeriodo,
    aprobarReposicion,
    addGasto, requestDeleteGasto, doDeleteGasto, saveEditGasto, exportExcel,
  };
}
