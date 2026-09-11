"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «JUSTIFICAR» DESDE LA FILA DEL DÍA — la ventana (11-sep-2026, mockup aprobado).
 *
 * Versión mínima: abre el MISMO formulario de la ficha del colaborador
 * (`JustificarForm`) con el colaborador y ESE día ya puestos (desde = hasta =
 * la fecha de la fila). Antes, para un permiso había que salir de la pestaña e
 * ir a la ficha. Al guardar, la pestaña se refresca y el día deja de contar
 * como tardanza o ausencia según la regla de siempre — acá no se calcula nada.
 *
 * Mismo patrón de ventana que `CorregirMarcacionModal`: `createPortal` +
 * `inset-0` + `useBodyScrollLock`, sin `autoFocus`.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { diaCortoConSemana } from "@/lib/asistencia/correcciones";
import JustificarForm from "./JustificarForm";

export interface DiaParaJustificar {
  codigo: string;
  persona: string;
  /** YYYY-MM-DD, el día de la fila. */
  fecha: string;
}

export default function JustificarDiaModal({ dia, onCerrar, onGuardado }: {
  dia: DiaParaJustificar;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  useBodyScrollLock(true);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-gray-900">Justificar</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {dia.persona} · {diaCortoConSemana(dia.fecha)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 min-h-[44px] min-w-[44px] text-2xl leading-none text-gray-400 transition hover:text-black"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <JustificarForm
            codigo={dia.codigo}
            desdeInicial={dia.fecha}
            hastaInicial={dia.fecha}
            onGuardado={() => { onGuardado(); onCerrar(); }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
