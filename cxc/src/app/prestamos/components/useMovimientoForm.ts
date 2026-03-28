"use client";

import { useState } from "react";
import { Movimiento, MOV_TYPES } from "./types";

interface UseMovimientoFormProps {
  empleadoId: string;
  deduccionQuincenal: number;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export function useMovimientoForm({ empleadoId, deduccionQuincenal, onSuccess, showToast }: UseMovimientoFormProps) {
  const [showMovModal, setShowMovModal] = useState(false);
  const [movStep, setMovStep] = useState<"type" | "form">("type");
  const [mConcepto, setMConcepto] = useState("Préstamo");
  const [mLabel, setMLabel] = useState("");
  const [mFecha, setMFecha] = useState(new Date().toISOString().slice(0, 10));
  const [mMonto, setMMonto] = useState("");
  const [mNotas, setMNotas] = useState("");
  const [saving, setSaving] = useState(false);

  function openMovModal() { setMovStep("type"); setShowMovModal(true); }

  function selectMovType(typeKey: string) {
    const t = MOV_TYPES.find(x => x.key === typeKey);
    if (!t) return;
    setMConcepto(t.concepto);
    setMLabel(t.label);
    setMFecha(new Date().toISOString().slice(0, 10));
    if (typeKey === "pago_quincenal") {
      setMMonto(String(deduccionQuincenal || ""));
      setMNotas("Deducción quincenal");
    } else {
      setMMonto(""); setMNotas("");
    }
    setMovStep("form");
  }

  async function saveMov() {
    if (!mFecha || !mMonto || Number(mMonto) <= 0) { showToast("Completa todos los campos"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_id: empleadoId, fecha: mFecha, concepto: mConcepto, monto: Number(mMonto), notas: mNotas }),
      });
      if (res.ok) { showToast("Movimiento registrado"); setShowMovModal(false); onSuccess(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSaving(false);
  }

  async function deleteMov(movId: string) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    const res = await fetch(`/api/prestamos/movimientos/${movId}`, { method: "DELETE" });
    if (res.ok) { showToast("Movimiento eliminado"); onSuccess(); }
    else showToast("Error al eliminar");
  }

  async function approveMov(movId: string) {
    const res = await fetch(`/api/prestamos/movimientos/${movId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "aprobado" }),
    });
    if (res.ok) { showToast("Movimiento aprobado"); onSuccess(); }
    else showToast("Error al aprobar");
  }

  return {
    showMovModal, setShowMovModal,
    movStep, setMovStep,
    mConcepto, mLabel, mFecha, setMFecha,
    mMonto, setMMonto,
    mNotas, setMNotas,
    saving,
    openMovModal, selectMovType, saveMov, deleteMov, approveMov,
  };
}

interface UseEditMovimientoProps {
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export function useEditMovimiento({ onSuccess, showToast }: UseEditMovimientoProps) {
  const [showEditMovModal, setShowEditMovModal] = useState(false);
  const [editMovId, setEditMovId] = useState("");
  const [emFecha, setEmFecha] = useState("");
  const [emConcepto, setEmConcepto] = useState("");
  const [emMonto, setEmMonto] = useState("");
  const [emNotas, setEmNotas] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditMov(m: Movimiento) {
    setEditMovId(m.id); setEmFecha(m.fecha); setEmConcepto(m.concepto);
    setEmMonto(String(m.monto)); setEmNotas(m.notas || "");
    setShowEditMovModal(true);
  }

  async function saveEditMov() {
    if (!emFecha || !emMonto || Number(emMonto) <= 0) { showToast("Completa todos los campos"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/prestamos/movimientos/${editMovId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: emFecha, concepto: emConcepto, monto: Number(emMonto), notas: emNotas || null }),
      });
      if (res.ok) { showToast("Movimiento actualizado"); setShowEditMovModal(false); onSuccess(); }
      else { const err = await res.json(); showToast(err.error || "Error"); }
    } catch { showToast("Error de conexión"); }
    setSaving(false);
  }

  return {
    showEditMovModal, setShowEditMovModal,
    emFecha, setEmFecha,
    emConcepto, setEmConcepto,
    emMonto, setEmMonto,
    emNotas, setEmNotas,
    saving,
    openEditMov, saveEditMov,
  };
}
