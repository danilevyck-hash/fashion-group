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
 * ── LOS TRES CASOS ──────────────────────────────────────────────────────────
 *   · Corregir una hora que el reloj sí registró.
 *   · AGREGAR una que nunca registró (olvidó marcar). Medido en producción el
 *     13-ago-2026: 97 días-persona con un número impar de marcas y 24 días
 *     hábiles sin ninguna. Es el caso más común, no el raro.
 *   · QUITAR una que el reloj registró de más (18-sep-2026 — ver abajo).
 *
 * ── 🔴 QUITAR UNA MARCACIÓN (18-sep-2026) ───────────────────────────────────
 *
 * La contadora, por WhatsApp el 17-sep-2026, textual:
 *
 *     «el motivo de que no me deja cerrar es porque hay marcaciones de mas y no
 *      me deja eliminar»
 *
 * y Daniel, aclarando de cuáles habla: *«las marcaciones del reloj, no las del
 * app que hicimos»*.
 *
 * 🩸 Esta ventana tenía DOS casos y nada más, y estaba escrito acá mismo. La
 * capacidad de quitar existía desde el 14-sep-2026 —`asistencia_correcciones.quita`—
 * pero solo por la puerta del reloj del TELÉFONO, que la pantalla de ella no
 * puede llamar: **una marca del reloj físico no se podía quitar de ninguna
 * forma**, y el cierre de la quincena se quedaba trabado.
 *
 * 🔴 QUITAR NO BORRA NADA. `asistencia_marcaciones` es append-only y hay
 * barrido estático que lo exige: se escribe ENCIMA una corrección con
 * `quita = true`, con su motivo obligatorio, su firma y su «deshacer». La fila
 * del reloj queda para siempre — es la prueba de a qué hora marcó alguien, y
 * eso define un pago.
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
  /**
   * 🔴 LA TERCERA OPCIÓN, y solo donde tiene sentido: hace falta una marcación
   * DEL RELOJ que todavía no tenga una corrección viva. No se ofrece al agregar
   * (no hay nada que quitar) ni sobre una ya corregida (primero se deshace).
   */
  const sePuedeQuitar = Boolean(marca.marcacionId) && !marca.correccionId;
  const [quitando, setQuitando] = useState(false);
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
  // 🔴 QUITANDO NO SE PIDE HORA: no vale ninguna. Lo único obligatorio sigue
  // siendo el porqué, igual que en las otras dos formas.
  const puedeGuardar = (quitando ? razonOk : horaOk && razonOk) && !guardando;

  async function guardar() {
    // Botón apagado + este guard: el botón puede apagarse por CSS, la regla no.
    if (!razonOk) return toast(quitando ? "Escribe por qué se quita" : "Escribe por qué se corrige", "error");
    if (!quitando && !horaGuardar) return toast("Elige la hora", "error");
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/correcciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcacionId: marca.marcacionId,
          codigo: marca.codigo,
          fecha: marca.fecha,
          // 🔴 Al quitar viaja `hora: null` y `quita: true`. El servidor exige
          // `marcacionId` y la base tiene un CHECK que no deja una corrección a
          // medias: o quita una marcación que existe y no trae hora, o trae hora.
          hora: quitando ? null : horaGuardar,
          ...(quitando ? { quita: true } : {}),
          motivo,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast(quitando ? "Listo, esa marcación ya no cuenta" : "Listo, guardado", "success");
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
              {quitando ? "Quitar esta marcación" : agregando ? "Agregar una marcación" : "Corregir la hora"}
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
              {/* 🔴 LAS DOS COSAS QUE SE LE PUEDEN HACER A UNA MARCACIÓN DEL
                  RELOJ, una al lado de la otra (18-sep-2026). Sin esto solo se
                  podía corregir la hora, y una marca de MÁS no se podía sacar
                  por ningún lado. */}
              {sePuedeQuitar && (
                <div className="flex gap-1.5" role="group" aria-label="Qué hacer con esta marcación">
                  {[
                    { clave: false, texto: "Corregir la hora" },
                    { clave: true, texto: "Quitar esta marcación" },
                  ].map((o) => (
                    <button
                      key={String(o.clave)}
                      type="button"
                      onClick={() => setQuitando(o.clave)}
                      aria-pressed={quitando === o.clave}
                      className={`min-h-[44px] flex-1 rounded-md border px-3 text-[13px] transition active:scale-[0.97] ${
                        quitando === o.clave
                          ? "border-black bg-black text-white"
                          : "border-gray-200 text-gray-600 hover:border-black hover:text-black"
                      }`}
                    >
                      {o.texto}
                    </button>
                  ))}
                </div>
              )}

              {/* 🔴 QUÉ PASA AL QUITARLA, DICHO ANTES DE TOCAR NADA. «Quitada»,
                  nunca «borrada»: la fila del reloj se queda donde está. */}
              {quitando ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  La marcación de las <b className="tabular-nums">{marca.relojHora}</b> deja de contar:
                  el día pasa a tener una marca menos y los minutos se recalculan con las que quedan.
                  <span className="mt-1 block text-[12px] text-amber-800">
                    No se borra nada — la marcación del reloj queda guardada, y esto se puede deshacer.
                  </span>
                </p>
              ) : (
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
              )}

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
              {guardando
                ? (quitando ? "Quitando…" : "Guardando…")
                : (quitando ? "Quitar la marcación" : "Guardar")}
            </button>
          )}
        </div>

        {/* El botón apagado tiene que DECIR qué falta. Un botón gris sin
            explicación se lee como "esta pantalla está rota". */}
        {!marca.correccionId && !puedeGuardar && !guardando && (
          <p className="border-t border-gray-100 px-5 py-2 text-right text-[12px] text-amber-700">
            {/* Quitando no se pide hora: lo único que puede faltar es el porqué. */}
            Falta{quitando ? ": el porqué" : !horaOk && !razonOk ? ": la hora y el porqué" : !horaOk ? ": la hora" : ": el porqué"}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
