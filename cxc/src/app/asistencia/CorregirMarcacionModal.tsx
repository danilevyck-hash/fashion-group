"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA MARCACIÓN — la ventana.
 *
 * 🔴 LO QUE SE VE ACÁ ES LO QUE DIJO EL RELOJ, Y NO SE PUEDE BORRAR. La hora del
 * reloj se muestra siempre, arriba, en gris; la corrección va debajo. Esconder
 * la original haría que la ventana pareciera un editor de marcaciones, que es
 * justo lo que NO es.
 *
 * ── LOS DOS CASOS ───────────────────────────────────────────────────────────
 *   · Corregir una hora que el reloj sí registró.
 *   · AGREGAR una que nunca registró (olvidó marcar). Medido en producción el
 *     13-ago-2026: 97 días-persona con un número impar de marcas y 24 días
 *     hábiles sin ninguna. Es el caso más común, no el raro.
 *
 * Patrón de la casa para iOS: `createPortal` + `inset-0` + `useBodyScrollLock`,
 * y SIN `autoFocus` (en iPhone el teclado salta encima de la ventana antes de
 * que se alcance a leer).
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { motivoValido, normalizarHora, MOTIVO_MAX } from "@/lib/asistencia/correcciones";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function diaBonito(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}
function cuandoBonito(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export interface MarcaParaCorregir {
  /** `null` = no hay marcación: se va a AGREGAR una que el reloj no registró. */
  marcacionId: string | null;
  codigo: string;
  persona: string;
  fecha: string;
  /** Lo que dijo el reloj. `null` cuando se está agregando. */
  relojHora: string | null;
  /** Si esa marca ya tenía una corrección viva, para poder deshacerla. */
  correccionId?: string | null;
  correccionMotivo?: string | null;
  correccionPor?: string | null;
  correccionEn?: string | null;
}

export default function CorregirMarcacionModal({
  marca,
  onCerrar,
  onGuardado,
}: {
  marca: MarcaParaCorregir;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  useBodyScrollLock(true);

  const agregando = marca.marcacionId === null && !marca.correccionId;
  const [hora, setHora] = useState(
    // Se siembra con lo que ya hay: corregir 8:47 casi siempre es moverla un
    // poco, no escribirla desde cero. Vacío cuando se agrega: no hay nada que
    // sugerir y una hora inventada de arranque se guardaría sin querer.
    marca.correccionId ? "" : (marca.relojHora ?? "").slice(0, 5),
  );
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const horaOk = normalizarHora(hora) !== null;
  const razonOk = motivoValido(motivo);
  const puedeGuardar = horaOk && razonOk && !guardando;

  async function guardar() {
    // Botón apagado + este guard: el botón puede apagarse por CSS, la regla no.
    if (!razonOk) return toast("Escribe por qué se corrige", "error");
    if (!horaOk) return toast("La hora no sirve. Escribe algo como 8:00", "error");
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/correcciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcacionId: marca.marcacionId,
          codigo: marca.codigo,
          fecha: marca.fecha,
          hora,
          motivo,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function deshacer() {
    if (!marca.correccionId) return;
    setGuardando(true);
    try {
      const res = await fetch(
        `/api/asistencia/correcciones?id=${encodeURIComponent(marca.correccionId)}`,
        { method: "DELETE" },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo deshacer");
      toast("Listo, se deshizo. Vuelve a valer la hora del reloj.", "success");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo deshacer.", "error");
    } finally {
      setGuardando(false);
    }
  }

  if (!montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => { if (!guardando) onCerrar(); }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">
              {agregando ? "Agregar una marcación" : "Corregir la hora"}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {marca.persona} · {diaBonito(marca.fecha)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { if (!guardando) onCerrar(); }}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 min-h-[44px] min-w-[44px] text-2xl leading-none text-gray-400 transition hover:text-black"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 🔴 LO QUE DIJO EL RELOJ, SIEMPRE A LA VISTA. No se puede tocar. */}
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
            {marca.relojHora ? (
              <>
                <p className="text-xs uppercase tracking-wide text-gray-400">Lo que marcó el reloj</p>
                <p className="mt-0.5 text-lg tabular-nums text-gray-900">{marca.relojHora}</p>
                <p className="mt-1 text-[12px] text-gray-500">
                  Esto no se borra nunca. La corrección va encima y es la que cuenta para el pago.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-gray-400">El reloj no registró nada</p>
                <p className="mt-1 text-[12px] text-gray-500">
                  Se va a agregar una marcación a mano. Va a quedar marcada como agregada,
                  para que se pueda distinguir de las que sí vinieron del reloj.
                </p>
              </>
            )}
          </div>

          {/* Si ya hay una corrección viva, esta ventana es para DESHACERLA. */}
          {marca.correccionId ? (
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
                <p className="text-xs uppercase tracking-wide text-blue-500">Corrección puesta</p>
                <p className="mt-0.5 text-[13px] text-blue-900">
                  <b>{marca.correccionMotivo}</b>
                </p>
                <p className="mt-1 text-[12px] text-blue-700">
                  {marca.correccionPor}
                  {marca.correccionEn ? ` · ${cuandoBonito(marca.correccionEn)}` : ""}
                </p>
              </div>
              <p className="text-[13px] text-gray-600">
                Para poner otra hora, primero deshaz ésta. Al deshacerla vuelve a valer
                {marca.relojHora ? ` la del reloj (${marca.relojHora})` : " el día sin esa marcación"},
                y queda anotado quién la deshizo.
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">
                  {agregando ? "Hora que se agrega" : "Hora corregida"}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  placeholder="8:00"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base tabular-nums outline-none transition focus:border-black sm:text-sm"
                />
                <span className="mt-1 block text-[12px] text-gray-500">
                  Como 8:00 o 17:04. Si hace falta el segundo, 17:04:30.
                </span>
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">
                  Por qué se corrige <span className="text-red-600">*</span>
                </span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
                  rows={2}
                  placeholder="Se le dañó el carro, avisó"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-black sm:text-sm"
                />
              </label>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={() => { if (!guardando) onCerrar(); }}
            className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            Cerrar
          </button>
          {marca.correccionId ? (
            <button
              type="button"
              onClick={deshacer}
              disabled={guardando}
              className="min-h-[44px] rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition hover:border-red-600 active:scale-[0.97] disabled:opacity-40"
            >
              {guardando ? "Deshaciendo…" : "Deshacer la corrección"}
            </button>
          ) : (
            <button
              type="button"
              onClick={guardar}
              disabled={!puedeGuardar}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              {guardando ? "Guardando…" : agregando ? "Agregar marcación" : "Guardar corrección"}
            </button>
          )}
        </div>

        {/* El botón apagado tiene que DECIR qué falta. Un botón gris sin
            explicación se lee como "esta pantalla está rota". */}
        {!marca.correccionId && !puedeGuardar && !guardando && (
          <p className="border-t border-gray-100 px-5 py-2 text-right text-[12px] text-amber-700">
            Falta{!horaOk && !razonOk ? ": la hora y la razón" : !horaOk ? ": la hora" : ": la razón"}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
