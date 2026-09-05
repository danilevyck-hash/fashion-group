"use client";

import { Empleado } from "./types";

/**
 * 🩸 SE FUERON «ARCHIVAR» Y «REACTIVAR» (5-sep-2026).
 *
 * La bandera `activo` nunca significó «trabaja acá» sino «tiene algo abierto», y
 * el botón además solo se podía tocar con el saldo EXACTAMENTE en 0 — así que
 * `Contabilidad`, que es quien usa el módulo, no podía archivar a nadie con
 * saldo: tenía que pedirle a un admin que abriera la «Zona de acciones
 * peligrosas». Quien llega a cero sale solo de la lista y no hay nada que
 * archivar.
 *
 * En su lugar queda el dato que sí importa: si la persona **trabaja**, que lo
 * dice Asistencia. Quien ya no trabaja aparece marcado y no se le descuenta.
 */
interface Props {
  empleado: Empleado;
  onEdit: () => void;
  onBack: () => void;
}

export default function EmpleadoHeader({ empleado, onEdit, onBack }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-light">{empleado.nombre}</h1>
        <div className="flex items-center gap-2 mt-1">
          {empleado.empresa && <span className="text-sm text-gray-500">{empleado.empresa}</span>}
          {!empleado.trabaja && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Ya no trabaja · no se descuenta
            </span>
          )}
          {!empleado.empleado_codigo && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              Sin persona atada
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={onEdit} className="inline-flex min-h-[44px] items-center justify-center border border-gray-200 px-4 rounded-md text-sm hover:border-gray-400 transition">Editar</button>
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center justify-center border border-gray-200 px-4 rounded-md text-sm hover:border-gray-400 transition">← Colaboradores</button>
      </div>
    </div>
  );
}
