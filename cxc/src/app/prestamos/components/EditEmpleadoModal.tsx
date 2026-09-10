"use client";

import { useEffect } from "react";
import type { Colaborador } from "@/lib/prestamos-lista-server";

/**
 * LA FICHA: las dos cuotas y —esto es lo nuevo— **la persona**.
 *
 * 🩸 `empleado_codigo` NO SE PODÍA PONER DESDE NINGÚN LADO hasta el 5-sep-2026,
 * y mientras tanto el aviso ámbar de la planilla decía, textual: *«Se atan en
 * Préstamos, eligiendo la persona de la ficha»*. Esa acción no existía. Las dos
 * fichas creadas el 2 y el 4 de septiembre nacieron sin código: **$400 de deuda
 * viva que la planilla no podía descontar**, y la única salida era otra
 * migración.
 *
 * 🔴 Se elige de una LISTA de Asistencia, nunca se teclea: lo que viaja es el
 * código. Nada se ata por parecido.
 *
 * ⚠️ El NOMBRE y la EMPRESA ya no se editan acá: salen de Asistencia. Daniel:
 * *«deberías de usar el nombre de asistencia para que todo tenga coherencia»*.
 */
interface Props {
  show: boolean;
  fCuotaPrestamo: string;
  fCuotaTerceros: string;
  fCodigo: string;
  colaboradores: readonly Colaborador[];
  saving: boolean;
  onClose: () => void;
  onChangeCuotaPrestamo: (v: string) => void;
  onChangeCuotaTerceros: (v: string) => void;
  onChangeCodigo: (v: string) => void;
  onSave: () => void;
}

export default function EditEmpleadoModal({
  show, fCuotaPrestamo, fCuotaTerceros, fCodigo, colaboradores, saving,
  onClose, onChangeCuotaPrestamo, onChangeCuotaTerceros, onChangeCodigo, onSave,
}: Props) {
  useEffect(() => {
    if (!show) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-4">Editar ficha</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase">Persona (de Asistencia)</label>
            <select
              value={fCodigo}
              onChange={e => onChangeCodigo(e.target.value)}
              className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent"
            >
              <option value="">Sin atar</option>
              {colaboradores.map(c => (
                <option key={c.codigo} value={c.codigo}>{c.nombre} — {c.empresaNombre ?? "Sin empresa"}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              El nombre y la empresa salen de aquí. Sin persona atada, la planilla no le descuenta la cuota.
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Cuota de préstamo ($ por quincena)</label>
            <input type="number" step="0.01" min="0" value={fCuotaPrestamo} onChange={e => onChangeCuotaPrestamo(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            {/* 🩸 ACÁ ESTABA «Cuota de daño», y se fue el 10-sep-2026. La
                contadora: *«los daños de mercancía debe permanecer en blanco y
                que nos permita colocar quincenalmente la cantidad a
                descontar»* — el daño ya no propone cuota, así que un campo para
                configurarla prometía algo que no pasa. La columna se conserva
                con su valor; no la lee nadie. */}
            <label className="text-xs text-gray-400 uppercase">Cuota de terceros ($ por quincena)</label>
            <input type="number" step="0.01" min="0" value={fCuotaTerceros} onChange={e => onChangeCuotaTerceros(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            <p className="mt-1 text-xs text-gray-500">
              Se descuenta solo al cerrar la quincena, hasta pagarlo.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Son dos cuentas separadas. La planilla propone la suma de las dos en una sola casilla.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 inline-flex min-h-[44px] items-center justify-center border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="flex-1 inline-flex min-h-[44px] items-center justify-center bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
