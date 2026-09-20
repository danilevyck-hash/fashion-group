"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «JUSTIFICAR A VARIOS» — la ventana (19-sep-2026).
 *
 * 🩸 El día de lluvia del 17-ago-2026 son **13 justificaciones cargadas una por
 * una con la misma nota** — 13 de las 29 de toda la historia del módulo. Cada
 * una pedía abrir la ficha de esa persona, elegir el motivo, escribir la nota y
 * guardar.
 *
 * Daniel eligió seleccionar varias filas en el Reporte y justificarlas de una
 * vez. Esta ventana **no es un formulario nuevo**: monta el MISMO
 * `JustificarForm` de la ficha y de la fila del día, con la lista de códigos
 * puesta. La ruta, la validación y los motivos son los de siempre.
 *
 * 🔴 SE DICE A QUIÉNES, POR NOMBRE, ANTES DE GUARDAR. Justificar mueve plata —
 * un día justificado se paga—, así que nadie puede apretar «Agregar» sin ver la
 * lista de a quiénes le va a caer.
 *
 * Mismo patrón de ventana que `CorregirMarcacionModal`: `createPortal` +
 * `inset-0` + `useBodyScrollLock`, sin `autoFocus`.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { textoDeLaSeleccion } from "@/lib/asistencia/justificar-a-varios";
import JustificarForm from "./JustificarForm";

export interface PersonaSeleccionada {
  codigo: string;
  /** El nombre como se muestra. Nunca el código pelado. */
  etiqueta: string;
  /** La empresa de su ficha: decide qué motivos se ofrecen. */
  empresa: string | null;
}

export default function JustificarVariosModal({
  personas, desdeInicial, hastaInicial, onCerrar, onGuardado,
}: {
  personas: readonly PersonaSeleccionada[];
  /** Con qué día abre. Lo pone el Reporte con el período que se está mirando. */
  desdeInicial: string;
  hastaInicial: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  useBodyScrollLock(true);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado || personas.length === 0) return null;

  const codigos = personas.map((p) => p.codigo);
  const empresas = personas.map((p) => p.empresa);
  const etiquetas = Object.fromEntries(personas.map((p) => [p.codigo, p.etiqueta]));

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
            <h2 className="text-base font-medium text-gray-900">Justificar a varios</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{textoDeLaSeleccion(personas.length)}</p>
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* 🔴 A QUIÉNES, POR NOMBRE. Un lote sin la lista a la vista es una
              justificación a ciegas, y justificar significa que se paga. */}
          <ul className="flex flex-wrap gap-1.5">
            {personas.map((p) => (
              <li key={p.codigo}
                className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[12px] text-gray-700">
                {p.etiqueta}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-gray-500">
            El mismo motivo y los mismos días para todos. Se guarda uno por uno: si alguno no
            entra, se dice cuál.
          </p>
          <JustificarForm
            codigo={codigos[0]}
            codigos={codigos}
            etiquetas={etiquetas}
            empresas={empresas}
            desdeInicial={desdeInicial}
            hastaInicial={hastaInicial}
            onGuardado={() => { onGuardado(); onCerrar(); }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
