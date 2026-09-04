"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El diálogo de «Aplicar quincena»: pregunta la FECHA DE PAGO antes de aplicar.
//
// 🩸 El botón viejo aplicaba con la fecha de HOY y por eso nadie lo usó en 90
// días: contabilidad registra 1–4 días después del pago y el movimiento caía
// en la quincena equivocada, así que seguía a mano (6 pasos × 13 personas,
// 15 minutos por quincena — medido el 1-sep-2026). Daniel aprobó que el botón
// pregunte la fecha, proponiendo el 15 y el fin de mes real.
//
// 🔴 Aplicar dos veces no cobra dos veces: el resumen recalcula por la fecha
// ELEGIDA quiénes ya tienen el descuento de esa quincena y lo dice en pantalla
// («3 ya tienen el descuento de esta quincena; se aplicará a 10»). El candado
// autoritativo vive en la RPC; esto es la misma regla, dicha antes de aplicar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  atajosFechaPago,
  esFechaISO,
  hoyPanamaYmd,
  resumenAplicarQuincena,
  type PersonaQuincena,
} from "@/lib/prestamos-quincena";

export default function AplicarQuincenaModal({
  open,
  onClose,
  onAplicar,
  aplicando,
  personas,
  hoy,
}: {
  open: boolean;
  onClose: () => void;
  /** Recibe la fecha de pago elegida (YYYY-MM-DD). */
  onAplicar: (fecha: string) => void;
  aplicando: boolean;
  /** Activos con deducción quincenal > 0 (elegibilidad la decide el resumen). */
  personas: PersonaQuincena[];
  /** Hoy en Panamá (YYYY-MM-DD) — inyectable en tests; por defecto, el reloj. */
  hoy?: string;
}) {
  const hoyYmd = hoy ?? hoyPanamaYmd();
  const atajos = atajosFechaPago(hoyYmd);
  const [fecha, setFecha] = useState(atajos[0]?.fecha ?? hoyYmd);

  // Al abrir, proponer el día de pago más reciente (el que acaba de pasar).
  useEffect(() => {
    if (open) setFecha(atajosFechaPago(hoyYmd)[0]?.fecha ?? hoyYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const fechaValida = esFechaISO(fecha);
  const resumen = fechaValida ? resumenAplicarQuincena(personas, fecha) : null;
  const n = resumen?.elegibles.length ?? 0;

  return (
    <Modal open={open} onClose={aplicando ? () => {} : onClose} title="Aplicar deducción quincenal">
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide">Fecha de pago</label>
        <div className="flex flex-wrap gap-2 mt-1.5 mb-2">
          {atajos.map((a) => (
            <button
              key={a.fecha}
              type="button"
              onClick={() => setFecha(a.fecha)}
              className={`px-3 py-2 rounded-md text-sm border min-h-[40px] transition-all active:scale-[0.97] ${
                fecha === a.fecha
                  ? "border-black bg-black text-white font-medium"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          aria-label="Otra fecha de pago"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm min-h-[44px]"
        />

        {/* Resumen por la fecha elegida — recalcula al cambiarla. */}
        <div className="mt-4 space-y-2 text-sm">
          {resumen && resumen.yaTienen.length > 0 && (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {resumen.yaTienen.length === 1
                ? "1 persona ya tiene el descuento de esta quincena; no se le vuelve a aplicar."
                : `${resumen.yaTienen.length} ya tienen el descuento de esta quincena; no se les vuelve a aplicar.`}
            </p>
          )}
          {resumen && n > 0 && (
            <p className="text-gray-600">
              Se aplicará a <span className="font-medium text-gray-900">{n} persona{n !== 1 ? "s" : ""}</span> por
              un total de <span className="font-medium text-gray-900 tabular-nums">${fmt(resumen.total)}</span>.
              {" "}La última cuota se ajusta al saldo automáticamente.
            </p>
          )}
          {resumen && n === 0 && (
            <p className="text-gray-500">
              No hay a quién aplicar con esta fecha: ya tienen el descuento de esa quincena o su saldo está en $0.
            </p>
          )}
          {!fechaValida && <p className="text-gray-500">Elige una fecha para ver el resumen.</p>}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => fechaValida && onAplicar(fecha)}
            disabled={aplicando || !fechaValida || n === 0}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-black text-white hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 min-h-[44px]"
          >
            {aplicando ? "Aplicando..." : n > 0 ? `Aplicar a las ${n}` : "Aplicar"}
          </button>
          <button
            onClick={onClose}
            disabled={aplicando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
