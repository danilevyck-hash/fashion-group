"use client";

// ============================================================================
// Cerrar el período de UN proveedor.
//
// 🔑 QUÉ ES CERRAR, en palabras de Daniel: es *"lo que ya le reportaste a ese
// proveedor"*. Se congela lo gastado hasta hoy para ESE proveedor, sale el
// reporte con SOLO su parte, y arranca un período nuevo en cero con el nombre
// que él escriba ("2026", "Temporada 1"…).
//
// 🔴 LOS PROYECTOS NO SE CIERRAN. Lo que se congela es la parte de ese
// proveedor dentro de cada proyecto: un proyecto con Tommy y Reebok, al cerrar
// PVH, conserva su parte de Reebok viva y editable. Por eso el modal enumera
// facturas y muebles, y NO habla de proyectos.
//
// 🩸 EL NOMBRE DEL PERÍODO NUEVO ES OBLIGATORIO Y LO ELIGE DANIEL. No se
// autogenera: el nombre es cómo va a reconocer después ese archivo en la lista
// de períodos cerrados, y un "Período 3" puesto por el sistema no le dice nada
// dentro de un año.
//
// ⚠️ NO SE PUEDE DESHACER, y el modal lo dice antes de que toque el botón.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type { BloqueInicio } from "./InicioMarketing";

interface Props {
  bloque: BloqueInicio;
  periodoId: string;
  onClose: () => void;
  /** Se llama con el período recién cerrado, para bajar su reporte. */
  onCerrado: (periodoId: string, etiqueta: string) => void | Promise<void>;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export default function CerrarPeriodoModal({
  bloque,
  periodoId,
  onClose,
  onCerrado,
}: Props) {
  const { toast } = useToast();
  const [nombreSiguiente, setNombreSiguiente] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hooks SIEMPRE antes del return condicional.
  const cerrar = useCallback(() => onClose(), [onClose]);
  const { panelRef, backdrop } = useFormModalDismiss(mounted, cerrar, !cerrando);

  const nombrePeriodo = bloque.periodoAbierto?.nombre ?? "Período actual";
  const puedeCerrar = nombreSiguiente.trim().length > 0 && !cerrando;

  const confirmar = async () => {
    if (!puedeCerrar) return;
    setCerrando(true);
    try {
      const res = await fetch(`/api/marketing/periodos/${periodoId}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreSiguiente: nombreSiguiente.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo cerrar el período");
      }
      toast(`Período cerrado. ${bloque.nombre} arranca "${nombreSiguiente.trim()}".`, "success");
      await onCerrado(
        periodoId,
        `${bloque.nombre} · ${nombrePeriodo} · ${formatearMonto(bloque.total)}`,
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo cerrar el período",
        "error",
      );
      setCerrando(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-md rounded-lg max-h-[90vh] overflow-y-auto border border-gray-200"
      >
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Cerrar el período de {bloque.nombre}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={cerrando}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">
              Se va a congelar todo lo de {bloque.nombre} en{" "}
              <span className="font-medium text-gray-700">{nombrePeriodo}</span>:
            </div>
            <ul className="mt-2 space-y-1 text-sm text-gray-800">
              {bloque.facturas.count > 0 && (
                <li className="flex items-center justify-between gap-3">
                  <span>{plural(bloque.facturas.count, "factura", "facturas")}</span>
                  <span className="tabular-nums font-medium">
                    {formatearMonto(bloque.facturas.total)}
                  </span>
                </li>
              )}
              {bloque.muebles.count > 0 && (
                <li className="flex items-center justify-between gap-3">
                  <span>
                    {plural(bloque.muebles.count, "entrega de muebles", "entregas de muebles")}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatearMonto(bloque.muebles.total)}
                  </span>
                </li>
              )}
              <li className="flex items-center justify-between gap-3 border-t border-gray-200 pt-1.5 font-semibold">
                <span>Total a reportar</span>
                <span className="tabular-nums">{formatearMonto(bloque.total)}</span>
              </li>
            </ul>
          </div>

          <div>
            <label
              htmlFor="mk-nombre-periodo-nuevo"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ¿Cómo se llama el período que empieza?
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="mk-nombre-periodo-nuevo"
              type="text"
              value={nombreSiguiente}
              onChange={(e) => setNombreSiguiente(e.target.value)}
              placeholder="Ej. 2026, Temporada 1"
              disabled={cerrando}
              /* text-base en móvil: con 14 px Safari hace zoom al enfocar. */
              className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              Los gastos nuevos de {bloque.nombre} van a entrar en ese período.
            </p>
          </div>

          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            Después de cerrarlo no se puede deshacer: lo que quedó adentro ya no
            se puede editar ni sacar.
          </p>
        </div>

        <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={cerrando}
            className="px-3 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm text-gray-600 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!puedeCerrar}
            className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cerrando ? "Cerrando…" : "Cerrar y bajar reporte"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
