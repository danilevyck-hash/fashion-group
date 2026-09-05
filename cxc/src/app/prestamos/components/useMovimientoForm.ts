"use client";

import { useState } from "react";
import { Movimiento } from "./types";
import { CONCEPTO_PAGO, ORIGEN_POR_DEFECTO } from "@/lib/prestamos-conceptos";

interface UseMovimientoFormProps {
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

/**
 * 🩸 SE FUE `approveMov()`. Aprobaba un movimiento con un `PUT {estado}` y era
 * inalcanzable desde la interfaz. La aprobación volvió el 5-sep-2026 —pero solo
 * para el TOPE de un sueldo mensual, y por otra puerta: `/api/prestamos/pendientes`,
 * que exige que sea Daniel. Dos puertas a la misma decisión es una de más.
 *
 * 🩸 Y se fue el `UndoToast`: se destructuraba `scheduleUndoMov` y NUNCA se
 * llamaba, así que el «Deshacer» del módulo no se mostró jamás. Son registros
 * financieros y no llevan deshacer (commit 101edb57).
 */
export function useMovimientoForm({ onSuccess, showToast }: UseMovimientoFormProps) {
  const [confirmDeleteMovId, setConfirmDeleteMovId] = useState<string | null>(null);

  /** Devuelve `true` si quedó guardado. */
  async function crear(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast(json?.pendiente ? "Se mandó a aprobación de Daniel" : "Movimiento registrado");
        onSuccess();
        return true;
      }
      showToast(json?.error || "Error al guardar");
      return false;
    } catch {
      showToast("Sin conexión. Verifica tu internet e intenta de nuevo.");
      return false;
    }
  }

  function requestDeleteMov(movId: string) {
    setConfirmDeleteMovId(movId);
  }

  async function doDeleteMov() {
    if (!confirmDeleteMovId) return;
    const movId = confirmDeleteMovId;
    setConfirmDeleteMovId(null);
    try {
      const res = await fetch(`/api/prestamos/movimientos/${movId}`, { method: "DELETE" });
      if (res.ok) { showToast("Movimiento eliminado"); onSuccess(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error al eliminar"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
  }

  return {
    crear,
    confirmDeleteMovId, setConfirmDeleteMovId,
    requestDeleteMov, doDeleteMov,
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
  const [emOrigen, setEmOrigen] = useState<string>(ORIGEN_POR_DEFECTO);
  const [saving, setSaving] = useState(false);

  function openEditMov(m: Movimiento) {
    setEditMovId(m.id); setEmFecha(m.fecha); setEmConcepto(m.concepto);
    setEmMonto(String(m.monto)); setEmNotas(m.notas || "");
    setEmOrigen(m.origen_pago || ORIGEN_POR_DEFECTO);
    setShowEditMovModal(true);
  }

  async function saveEditMov() {
    if (!emFecha || !emMonto || Number(emMonto) <= 0) { showToast("Falta la fecha o el monto"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/prestamos/movimientos/${editMovId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: emFecha,
          monto: Number(emMonto),
          notas: emNotas || null,
          ...(emConcepto === CONCEPTO_PAGO ? { origen_pago: emOrigen } : {}),
        }),
      });
      if (res.ok) { showToast("Movimiento actualizado"); setShowEditMovModal(false); onSuccess(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(false);
  }

  return {
    showEditMovModal, setShowEditMovModal,
    emFecha, setEmFecha,
    emConcepto, setEmConcepto,
    emMonto, setEmMonto,
    emNotas, setEmNotas,
    emOrigen, setEmOrigen,
    saving,
    openEditMov, saveEditMov,
  };
}
