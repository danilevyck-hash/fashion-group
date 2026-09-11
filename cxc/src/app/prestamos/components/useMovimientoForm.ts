"use client";

import { useState } from "react";
import { Movimiento } from "./types";
import { CONCEPTO_PAGO, ORIGEN_POR_DEFECTO } from "@/lib/prestamos-conceptos";
import { CONCEPTO_TERCEROS } from "@/lib/prestamos-conceptos";

/** Cómo se dice: éxito, error, o un AVISO que se registra igual (el tope). */
export type TipoAvisoMovimiento = "success" | "error" | "warning";

interface UseMovimientoFormProps {
  onSuccess: () => void;
  /**
   * 🔴 EL TIPO VIAJA CON EL MENSAJE (11-sep-2026). 🩸 La pestaña de Planilla
   * clasificaba por el TEXTO (`startsWith("Error")`), y el aviso «Este préstamo
   * pasa el tope de un sueldo…» salía como éxito verde y se iba a los 3 s.
   * Quien no lo lea (la página del préstamo) sigue recibiendo solo el mensaje.
   */
  showToast: (msg: string, tipo?: TipoAvisoMovimiento) => void;
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
/** Escribe la cuota en la ficha. `true` si no había nada que escribir o si se escribió. */
async function guardarCuota(empleadoId: string, concepto: string, cuota: unknown): Promise<boolean> {
  if (typeof cuota !== "number" || !Number.isFinite(cuota) || !empleadoId) return true;
  const campo = concepto === CONCEPTO_TERCEROS ? "deduccion_terceros" : "deduccion_quincenal";
  try {
    const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: cuota }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useMovimientoForm({ onSuccess, showToast }: UseMovimientoFormProps) {
  const [confirmDeleteMovId, setConfirmDeleteMovId] = useState<string | null>(null);

  /**
   * Devuelve `true` si quedó guardado.
   *
   * 🔴 `cuota` NO es parte del movimiento: es de la FICHA (`deduccion_quincenal`
   * o `deduccion_terceros`, según el concepto). Viene en el payload cuando el
   * formulario la preguntó (11-sep-2026) y se escribe en una SEGUNDA llamada,
   * después del movimiento: si la segunda falla, el préstamo ya quedó y se
   * dice que la cuota no.
   */
  async function crear(payload: Record<string, unknown>): Promise<boolean> {
    const { cuota, ...movimiento } = payload;
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movimiento),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        const cuotaOk = await guardarCuota(String(movimiento.empleado_id ?? ""), String(movimiento.concepto ?? ""), cuota);
        // Sobre el tope se registra igual, y el aviso lo dice — en ÁMBAR y
        // por 8 s: es lo único que frena desde que se quitó la aprobación.
        const sobreTope = Boolean(json?.sobreTope) || typeof json?.avisoTope === "string";
        showToast(
          (json?.avisoTope ?? "Movimiento registrado")
          + (cuotaOk ? "" : " La cuota no se pudo guardar: cámbiala en Editar."),
          sobreTope || !cuotaOk ? "warning" : "success",
        );
        onSuccess();
        return true;
      }
      showToast(json?.error || "Error al guardar", "error");
      return false;
    } catch {
      showToast("Sin conexión. Verifica tu internet e intenta de nuevo.", "error");
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
      if (res.ok) { showToast("Movimiento eliminado", "success"); onSuccess(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error al eliminar", "error"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo.", "error"); }
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
