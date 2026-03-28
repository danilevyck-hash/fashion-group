"use client";

import { useState } from "react";
import { Empleado } from "./types";
import { fmt } from "@/lib/format";

interface UseEmpleadoActionsProps {
  empleadoId: string;
  empleado: Empleado;
  movs: { id: string }[];
  onSuccess: () => void;
  onDeleted: () => void;
  showToast: (msg: string) => void;
}

export function useEmpleadoActions({ empleadoId, empleado, movs, onSuccess, onDeleted, showToast }: UseEmpleadoActionsProps) {
  // ── Edit employee ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [fNombre, setFNombre] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fDeduccion, setFDeduccion] = useState("");
  const [fNotas, setFNotas] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function openEditModal() {
    setFNombre(empleado.nombre); setFEmpresa(empleado.empresa || "");
    setFDeduccion(String(empleado.deduccion_quincenal)); setFNotas(empleado.notas || "");
    setShowEditModal(true);
  }

  async function saveEdit() {
    if (!fNombre.trim()) { showToast("Nombre requerido"); return; }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: fNombre.trim(), empresa: fEmpresa || null, deduccion_quincenal: Number(fDeduccion) || 0, notas: fNotas || null }),
      });
      if (res.ok) { showToast("Empleado actualizado"); setShowEditModal(false); onSuccess(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSavingEdit(false);
  }

  // ── Archive / Reactivate ──
  async function toggleArchive() {
    const newState = !empleado.activo;
    const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: newState }),
    });
    if (res.ok) { showToast(newState ? "Empleado reactivado" : "Empleado archivado"); onSuccess(); }
    else showToast("Error al actualizar");
  }

  // ── Pago quincenal ──
  const [showPagoConfirm, setShowPagoConfirm] = useState(false);

  function pagoQuincenal() {
    if (!empleado.deduccion_quincenal || empleado.deduccion_quincenal <= 0) {
      showToast("Este empleado no tiene deducción quincenal configurada"); return;
    }
    setShowPagoConfirm(true);
  }

  async function confirmarPagoQuincenal() {
    setShowPagoConfirm(false);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_id: empleadoId, fecha: new Date().toISOString().slice(0, 10), concepto: "Pago", monto: empleado.deduccion_quincenal, notas: "Deducción quincenal" }),
      });
      if (res.ok) { showToast(`Pago quincenal de $${fmt(empleado.deduccion_quincenal)} registrado`); onSuccess(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
  }

  // ── Danger zone ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");
  const [showForceArchive, setShowForceArchive] = useState(false);

  async function deleteEmployee() {
    const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, { method: "DELETE" });
    if (res.ok) { showToast("Empleado eliminado"); onDeleted(); }
    else { const err = await res.json(); showToast(err.error || "Error"); }
    setShowDeleteConfirm(false);
  }

  async function clearHistory() {
    for (const m of movs) {
      await fetch(`/api/prestamos/movimientos/${m.id}`, { method: "DELETE" });
    }
    showToast("Historial eliminado");
    setClearInput(""); setShowClearConfirm(false);
    onSuccess();
  }

  async function forceArchive() {
    const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    if (res.ok) { showToast("Empleado archivado"); onSuccess(); }
    else showToast("Error");
    setShowForceArchive(false);
  }

  return {
    // edit employee
    showEditModal, setShowEditModal,
    fNombre, setFNombre,
    fEmpresa, setFEmpresa,
    fDeduccion, setFDeduccion,
    fNotas, setFNotas,
    savingEdit,
    openEditModal, saveEdit,
    // archive
    toggleArchive,
    // pago quincenal
    showPagoConfirm, setShowPagoConfirm,
    pagoQuincenal, confirmarPagoQuincenal,
    // danger zone
    showDeleteConfirm, setShowDeleteConfirm,
    deleteInput, setDeleteInput,
    showClearConfirm, setShowClearConfirm,
    clearInput, setClearInput,
    showForceArchive, setShowForceArchive,
    deleteEmployee, clearHistory, forceArchive,
  };
}
