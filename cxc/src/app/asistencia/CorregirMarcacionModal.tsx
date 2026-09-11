"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA MARCACIÓN — la ventana.
 *
 * 🔴 LO QUE DIJO EL RELOJ SE DICE ARRIBA, EN UNA LÍNEA, Y NO SE PUEDE BORRAR:
 * «Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02». La corrección va
 * debajo. Esconder la original haría que la ventana pareciera un editor de
 * marcaciones, que es justo lo que NO es.
 *
 * ── 11-sep-2026 — LA HORA SE ELIGE, EL PORQUÉ SE TOCA (mockup aprobado) ─────
 *
 *   · La hora va en `<input type="time" step="1">`: el selector del sistema
 *     (ruedita en el iPhone, flechas en la computadora), en el mismo formato
 *     24 h que el módulo muestra («13:22:02»). Daniel: *«no me gusta texto
 *     libre para escribir la hora, enreda. algo que se sienta más seguro y que
 *     el formato vaya con el módulo»*. Precargada con la hora del reloj; los
 *     segundos son opcionales (`completarSegundos`).
 *   · El porqué sigue OBLIGATORIO y campo libre, con hasta 4 botones de los
 *     motivos más escritos en 90 días (`/api/asistencia/correcciones/motivos`,
 *     regla en `lib/asistencia/motivos-frecuentes.ts`). Tocar uno pone el
 *     texto en el campo; el CAMPO es lo que se guarda.
 *   · Se fue el recuadro «Esto no se borra nunca…»: esa explicación se lee UNA
 *     vez en el «?» de la pestaña. Se fue «Como 8:00 o 17:04…»: con el selector
 *     no hay formato que explicar.
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
import {
  completarSegundos,
  encabezadoCorreccion,
  motivoValido,
  normalizarHora,
  MOTIVO_MAX,
} from "@/lib/asistencia/correcciones";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
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
    // Se siembra con lo que ya hay, CON SEGUNDOS: corregir 13:22:02 casi
    // siempre es moverla un poco, no escribirla desde cero. Vacío cuando se
    // agrega: no hay nada que sugerir y una hora inventada de arranque se
    // guardaría sin querer.
    marca.correccionId ? "" : normalizarHora(marca.relojHora ?? "") ?? "",
  );
  const [motivo, setMotivo] = useState("");
  // Los botones de los motivos más usados. Arrancan vacíos y llegan solos;
  // si la lectura falla, la ventana sirve igual con el campo libre.
  const [frecuentes, setFrecuentes] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (marca.correccionId) return;
    let vivo = true;
    void fetch("/api/asistencia/correcciones/motivos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const lista = Array.isArray(d?.motivos) ? d.motivos.filter((m: unknown) => typeof m === "string") : [];
        setFrecuentes(lista);
      })
      .catch(() => { /* sin botones; el campo libre sigue */ });
    return () => { vivo = false; };
  }, [marca.correccionId]);

  const horaGuardar = completarSegundos(hora, marca.relojHora);
  const horaOk = horaGuardar !== null;
  const razonOk = motivoValido(motivo);
  const puedeGuardar = horaOk && razonOk && !guardando;

  async function guardar() {
    // Botón apagado + este guard: el botón puede apagarse por CSS, la regla no.
    if (!razonOk) return toast("Escribe por qué se corrige", "error");
    if (!horaGuardar) return toast("Elige la hora", "error");
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/correcciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcacionId: marca.marcacionId,
          codigo: marca.codigo,
          fecha: marca.fecha,
          hora: horaGuardar,
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
          <div className="min-w-0">
            <h2 className="text-base font-medium text-gray-900">
              {agregando ? "Agregar una marcación" : "Corregir la hora"}
            </h2>
            {/* 🔴 UNA LÍNEA, con lo que marcó el reloj adentro. No se puede tocar. */}
            <p className="mt-0.5 text-[13px] text-gray-500">
              {encabezadoCorreccion(marca.persona, marca.fecha, marca.relojHora)}
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
                  {agregando ? "Hora que se agrega" : "Hora correcta"}
                </span>
                {/* 🔴 EL SELECTOR DEL SISTEMA, NUNCA TEXTO LIBRE. `step="1"`
                    ofrece los segundos donde el navegador los tiene; donde no
                    (iPhone), `completarSegundos` conserva los del reloj. */}
                <input
                  type="time"
                  step="1"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base tabular-nums outline-none transition focus:border-black sm:text-sm"
                />
              </label>

              {/* 🩸 El rótulo NO envuelve los botones en un <label>: un botón es
                  «labelable», así que el label se ataría al PRIMER botón y no
                  al campo. El campo se rotula por `aria-labelledby`. */}
              <div>
                <span id="corregir-porque" className="block text-[13px] font-medium text-gray-700">
                  Por qué <span className="text-red-600">*</span>
                </span>
                {/* Los más usados, si los hay. Tocar uno ESCRIBE en el campo;
                    se puede seguir editando. Sin historia no se dibuja nada. */}
                {frecuentes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {frecuentes.map((m) => {
                      const activo = motivo === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMotivo(m)}
                          aria-pressed={activo}
                          className={`min-h-[44px] rounded-full border px-3 text-[13px] transition active:scale-[0.97] ${
                            activo
                              ? "border-black bg-black text-white"
                              : "border-gray-200 text-gray-600 hover:border-black hover:text-black"
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                )}
                <textarea
                  aria-labelledby="corregir-porque"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
                  rows={2}
                  placeholder="Escribe el motivo…"
                  className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-black sm:text-sm"
                />
              </div>
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
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>

        {/* El botón apagado tiene que DECIR qué falta. Un botón gris sin
            explicación se lee como "esta pantalla está rota". */}
        {!marca.correccionId && !puedeGuardar && !guardando && (
          <p className="border-t border-gray-100 px-5 py-2 text-right text-[12px] text-amber-700">
            Falta{!horaOk && !razonOk ? ": la hora y el porqué" : !horaOk ? ": la hora" : ": el porqué"}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
