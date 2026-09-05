"use client";

import { useCallback, useEffect, useState } from "react";
import { Empleado } from "./types";
import { fmt } from "@/lib/format";
import { CONCEPTO_PAGO, ORIGEN_POR_DEFECTO } from "@/lib/prestamos-conceptos";
import { hoyPanamaYmd } from "@/lib/prestamos-quincena";
import type { CuentaPrestamo } from "@/lib/prestamos-saldo";
import type { Colaborador } from "@/lib/prestamos-lista-server";

interface UseEmpleadoActionsProps {
  empleadoId: string;
  empleado: Empleado;
  onSuccess: () => void;
  onDeleted: () => void;
  showToast: (msg: string) => void;
}

/**
 * 🩸 SE FUERON `toggleArchive` Y `forceArchive`. La bandera `activo` se retiró
 * el 5-sep-2026 (ver `prestamos-lista-server.ts`): nunca significó «trabaja
 * acá». Quien llega a cero sale solo de la lista.
 */
export function useEmpleadoActions({ empleadoId, empleado, onSuccess, onDeleted, showToast }: UseEmpleadoActionsProps) {
  // ── Editar la ficha: las dos cuotas y la persona ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [fCuotaPrestamo, setFCuotaPrestamo] = useState("");
  const [fCuotaDano, setFCuotaDano] = useState("");
  const [fCodigo, setFCodigo] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);

  // 🔴 La lista de personas sale de Asistencia: es lo que hace posible ATAR una
  // ficha desde la pantalla. Hasta el 5-sep-2026 `empleado_codigo` no se podía
  // poner desde ningún lado, y el aviso de la planilla decía que sí.
  const cargarColaboradores = useCallback(async () => {
    try {
      const res = await fetch("/api/prestamos/empleados");
      if (res.ok) {
        const d = await res.json();
        setColaboradores(d.colaboradores ?? []);
      }
    } catch { /* la ficha se sigue pudiendo editar sin la lista */ }
  }, []);

  useEffect(() => { if (showEditModal) void cargarColaboradores(); }, [showEditModal, cargarColaboradores]);

  function openEditModal() {
    setFCuotaPrestamo(String(empleado.deduccion_quincenal ?? 0));
    setFCuotaDano(String(empleado.deduccion_dano ?? 0));
    setFCodigo(empleado.empleado_codigo ?? "");
    setShowEditModal(true);
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        deduccion_quincenal: Number(fCuotaPrestamo) || 0,
        deduccion_dano: Number(fCuotaDano) || 0,
      };
      if (fCodigo && fCodigo !== (empleado.empleado_codigo ?? "")) body.empleado_codigo = fCodigo;
      const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { showToast("Ficha actualizada"); setShowEditModal(false); onSuccess(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSavingEdit(false);
  }

  // ── Pago quincenal ──
  //
  // ⚠️ Escribe la fecha de HOY (Panamá) sin preguntar, a propósito: es el atajo
  // de UN toque. Cuando la fecha importa —contabilidad registra 1-4 días después
  // del pago— se usa «Aplicar quincena», que SÍ la pregunta.
  async function pagoQuincenal(cuota: number, cuenta: CuentaPrestamo | null) {
    if (!cuota || cuota <= 0) { showToast("Esta persona no tiene cuota quincenal"); return; }
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_id: empleadoId,
          fecha: hoyPanamaYmd(),
          concepto: CONCEPTO_PAGO,
          monto: cuota,
          origen_pago: ORIGEN_POR_DEFECTO,
          ...(cuenta ? { cuenta } : {}),
        }),
      });
      if (res.ok) { showToast(`Pago quincenal de $${fmt(cuota)} registrado`); onSuccess(); }
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error"); }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
  }

  // ── Zona de acciones peligrosas ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");
  const [clearProgress, setClearProgress] = useState("");

  async function deleteEmployee() {
    const res = await fetch(`/api/prestamos/empleados/${empleadoId}`, { method: "DELETE" });
    if (res.ok) { showToast("Ficha eliminada"); onDeleted(); }
    else { const err = await res.json().catch(() => null); showToast(err?.error || "Error"); }
    setShowDeleteConfirm(false);
  }

  /**
   * 🩸 «Eliminar Todo el Historial» hacía un `.delete()` REAL de Postgres —el
   * único hard delete del repo, en la tabla de plata, y sin una línea en
   * `activity_logs`—. Ahora el servidor hace soft delete y lo registra.
   */
  async function clearHistory() {
    setClearProgress("Borrando historial...");
    try {
      const res = await fetch("/api/prestamos/movimientos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_id: empleadoId }),
      });
      if (res.ok) showToast("Historial borrado");
      else { const err = await res.json().catch(() => null); showToast(err?.error || "Error al borrar historial"); }
    } catch {
      showToast("Sin conexión. Verifica tu internet e intenta de nuevo.");
    }
    setClearProgress("");
    setClearInput(""); setShowClearConfirm(false);
    onSuccess();
  }

  return {
    showEditModal, setShowEditModal,
    fCuotaPrestamo, setFCuotaPrestamo,
    fCuotaDano, setFCuotaDano,
    fCodigo, setFCodigo,
    colaboradores,
    savingEdit,
    openEditModal, saveEdit,
    pagoQuincenal,
    showDeleteConfirm, setShowDeleteConfirm,
    deleteInput, setDeleteInput,
    showClearConfirm, setShowClearConfirm,
    clearInput, setClearInput,
    clearProgress,
    deleteEmployee, clearHistory,
  };
}
