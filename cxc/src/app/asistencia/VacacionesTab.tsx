"use client";

// VACACIONES.
//
// 🔴 NO SON JUSTIFICACIONES. Una justificación explica por qué alguien FALTÓ;
// unas vacaciones son un derecho que se gana y se gasta, y en esos días no se
// calcula NADA del reloj. Por eso tienen pestaña propia desde el 25-ago-2026.
//
// Una vacación es: persona + desde + hasta + un interruptor. Nada más — sin
// nota, sin motivo, sin horas. Daniel: *"se tiene que sentir simple y facil el
// modulo"*, y eso manda sobre cualquier otra consideración de diseño.
//
// ── 🔴 POR QUÉ NO HAY MODAL, NI PASO 2, NI PANTALLA APARTE ───────────────────
//
// El interruptor va EN LA MISMA FILA donde se cargan las fechas, y las filas de
// la lista se editan en el lugar (se guardan al cambiar, como HorariosTab y
// ConfiguracionTab). Meter una ventana en el medio para un formulario de tres
// campos es la fricción que este módulo viene sacando.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { etiquetaPersona, type PersonaListada } from "@/lib/asistencia/directorio";
import RangoFechas from "@/components/ui/RangoFechas";
import {
  diasDeVacacion,
  efectoDelInterruptor,
  PREGUNTA_YA_COBRADAS,
} from "@/lib/asistencia/vacaciones";
import {
  textoDetalle,
  textoSaldo,
  type SaldoVacaciones,
} from "@/lib/asistencia/saldo-vacaciones";

interface VacacionFila {
  id: string;
  empleado_codigo: string;
  desde: string;
  hasta: string;
  ya_pagadas: boolean;
  registrado_por: string | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function bonito(d: string): string {
  const [a, m, dd] = d.split("-").map(Number);
  return `${dd} ${MESES[m - 1]} ${a}`;
}
/** Panamá es UTC−5 fijo. En UTC pelado, de noche el día salta al siguiente. */
const hoyPanama = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export default function VacacionesTab() {
  const { toast } = useToast();
  const [lista, setLista] = useState<VacacionFila[] | null>(null);
  const [personas, setPersonas] = useState<PersonaListada[]>([]);
  const [puedeCargar, setPuedeCargar] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  // ── EL SALDO ──────────────────────────────────────────────────────────────
  // Llega CALCULADO del servidor: la cuenta vive en `saldo-vacaciones.ts` y la
  // pantalla solo la pinta. Calcularla acá sería una segunda verdad, y el día
  // que las dos se separen nadie sabría cuál es la buena.
  const [saldos, setSaldos] = useState<SaldoVacaciones[]>([]);
  const [avisoSaldo, setAvisoSaldo] = useState<string | null>(null);
  const [avisoSaldoIncompleto, setAvisoSaldoIncompleto] = useState<string | null>(null);
  const [desdeCuandoCuenta, setDesdeCuandoCuenta] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [desde, setDesde] = useState(hoyPanama());
  const [hasta, setHasta] = useState(hoyPanama());
  const [yaPagadas, setYaPagadas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/asistencia/vacaciones", { cache: "no-store" });
    const d = await res.json();
    setLista(d.vacaciones ?? []);
    setPersonas(d.personas ?? []);
    // Sin la tabla corrida, la pantalla NO ofrece cargar y lo dice de entrada —
    // no al fallar el guardado.
    setPuedeCargar(d.puedeCargar !== false);
    setAviso(d.avisoMigracion ?? null);
    setSaldos(d.saldos ?? []);
    setAvisoSaldo(d.avisoSaldo ?? null);
    setAvisoSaldoIncompleto(d.avisoSaldoIncompleto ?? null);
    setDesdeCuandoCuenta(d.desdeCuandoCuenta ?? null);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const nombreDe = (cod: string) =>
    etiquetaPersona(cod, personas.find((p) => p.codigo === cod)?.nombre);

  const conNombre = personas.filter((p) => p.configurado);
  const sinNombre = personas.filter((p) => !p.configurado);

  /** El saldo de la persona que está elegida en el formulario, o `null`. */
  const saldoElegido = codigo ? (saldos.find((s) => s.codigo === codigo) ?? null) : null;

  async function agregar() {
    if (!codigo) return toast("Elige la persona", "error");
    if (hasta < desde) return toast("La fecha final es anterior a la inicial", "error");
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/vacaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, desde, hasta, yaPagadas }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setCodigo("");
      setYaPagadas(false);
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Guarda un cambio de una fila ya cargada. Se dispara al cambiar el control,
   * como el resto del módulo — sin botón «Guardar esta fila».
   *
   * 🔑 La lista se refresca del servidor: el interruptor mueve plata en la
   * Planilla, y pintar solo la celda dejaría la pantalla diciendo una cosa y la
   * planilla pagando otra hasta el próximo refresco.
   */
  async function editar(id: string, cambios: Record<string, unknown>) {
    try {
      const res = await fetch("/api/asistencia/vacaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cambios }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      // Se recarga igual: así la fila vuelve a mostrar lo que de verdad está
      // guardado, en vez de quedarse con el valor que no se pudo escribir.
      await cargar();
    }
  }

  async function quitar(id: string) {
    try {
      const res = await fetch(`/api/asistencia/vacaciones?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo quitar");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo quitar", "error");
    }
  }

  const campo =
    "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";

  return (
    <div className="space-y-5">
      {/* 🔴 EN ÁMBAR, NO EN ROJO: no se rompió nada, falta correr un archivo. */}
      {aviso && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{aviso}</p>
      )}

      {/* ── Cargar una vacación ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Persona</label>
            {/* Los que tienen nombre arriba y alfabéticos; los que todavía no,
                agrupados abajo. Siguen siendo ELEGIBLES: son gente que marca y
                a la que hay que poder darle vacaciones. */}
            <select value={codigo} onChange={(e) => setCodigo(e.target.value)} className={campo}>
              <option value="">Elegir…</option>
              {conNombre.length > 0 && (
                <optgroup label="Personas">
                  {conNombre.map((p) => (
                    <option key={p.codigo} value={p.codigo}>{p.etiqueta}</option>
                  ))}
                </optgroup>
              )}
              {sinNombre.length > 0 && (
                <optgroup label="Falta ponerles nombre en Configuración">
                  {sinNombre.map((p) => (
                    <option key={p.codigo} value={p.codigo}>Código {p.etiqueta}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {/* 🔴 EL SALDO, EN EL MOMENTO EN QUE SE DECIDE. Una línea, debajo
                del nombre: es acá donde alguien se entera de que la persona ya
                no tiene días — no en una tabla al final de la pantalla. Sin
                fecha de ingreso dice qué falta, nunca un cero. */}
            {saldoElegido && (
              <p
                className={`mt-1 text-[12px] ${
                  saldoElegido.falta ? "text-amber-800" : "text-gray-500"
                }`}
              >
                {saldoElegido.falta ? (
                  textoSaldo(saldoElegido)
                ) : (
                  <>
                    Le quedan <b className="tabular-nums">{textoSaldo(saldoElegido)}</b>
                    {textoDetalle(saldoElegido) ? ` · ${textoDetalle(saldoElegido)}` : ""}
                  </>
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <RangoFechas desde={desde} hasta={hasta} label="Días de vacaciones"
              onChange={(d, h) => { setDesde(d); setHasta(h); }} />
          </div>
        </div>

        {/* 🔴 EL INTERRUPTOR VA ACÁ, EN LA MISMA FILA DE LAS FECHAS. No es otra
            pantalla ni un paso 2: es parte de cargar la vacación.

            🩸 PREGUNTA, NO ESTADO. Decía «Ya se le pagó» con «Se le pagan estos
            días» debajo, y juntas se leían contradiciéndose. Ahora la casilla
            pregunta y la línea gris solo aparece si se contesta que sí — que es
            el caso raro y el único que descuenta plata. El texto vive en
            `lib/asistencia/vacaciones.ts`, no acá: se escribe en dos lugares. */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox" checked={yaPagadas} className="h-4 w-4 accent-black"
              onChange={(e) => setYaPagadas(e.target.checked)}
            />
            <span>
              <span className="block text-sm text-gray-900">{PREGUNTA_YA_COBRADAS}</span>
              {efectoDelInterruptor(yaPagadas) && (
                <span className="block text-[12px] text-gray-500">{efectoDelInterruptor(yaPagadas)}</span>
              )}
            </span>
          </label>
          <button type="button" onClick={() => void agregar()} disabled={guardando || !puedeCargar}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </div>

        {desde !== hasta && (
          <p className="mt-2 text-[12px] text-gray-500">
            Cubre <b>del {bonito(desde)} al {bonito(hasta)}</b> —{" "}
            <b>{diasDeVacacion(desde, hasta)} días</b>.
          </p>
        )}
      </div>

      {/* ── Lo cargado ────────────────────────────────────────────────────── */}
      {lista === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {lista?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">Todavía no hay ninguna vacación cargada.</p>
      )}
      {!!lista?.length && (
        <ul className="space-y-2">
          {lista.map((v) => (
            <li key={v.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{nombreDe(v.empleado_codigo)}</p>
                  <p className="text-[13px] text-gray-600">
                    {bonito(v.desde)} → {bonito(v.hasta)} ·{" "}
                    <span className="tabular-nums">{diasDeVacacion(v.desde, v.hasta)}</span> días
                  </p>
                </div>
                <button type="button" onClick={() => void quitar(v.id)}
                  className="min-h-[44px] rounded-md px-2 text-[13px] text-gray-500 transition hover:bg-red-50 hover:text-red-600">
                  Quitar
                </button>
              </div>

              {/* Editar en el lugar: las fechas y el interruptor. Se guarda al
                  cambiar — sin botón, sin ventana. */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <RangoFechas desde={v.desde} hasta={v.hasta} label="Días"
                    onChange={(d, h) => void editar(v.id, { desde: d, hasta: h })} />
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 self-end">
                  <input type="checkbox" checked={v.ya_pagadas} className="h-4 w-4 accent-black"
                    onChange={(e) => void editar(v.id, { yaPagadas: e.target.checked })} />
                  <span>
                    <span className="block text-sm text-gray-900">{PREGUNTA_YA_COBRADAS}</span>
                    {efectoDelInterruptor(v.ya_pagadas) && (
                      <span className="block text-[12px] text-gray-500">{efectoDelInterruptor(v.ya_pagadas)}</span>
                    )}
                  </span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── SALDO POR PERSONA ─────────────────────────────────────────────
          days ganados − tomados − ya pagados. La cuenta entera vive en
          `lib/asistencia/saldo-vacaciones.ts`, con el prorrateo y su ejemplo
          numérico escritos ahí para que se pueda auditar sin leer la función.

          🔴 ACÁ ESTÁN TODOS LOS ACTIVOS, tengan o no fecha de ingreso. Quien no
          la tiene aparece diciendo «Falta la fecha de ingreso» — nunca con un
          cero, y nunca escondido de la lista. */}
      {saldos.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3">
            <h2 className="text-sm font-medium text-gray-900">Saldo por persona</h2>
            {/* Una línea y corta: 30 días al año, y desde cuándo cuenta la
                resta. Lo segundo NO se puede sacar: los días ganados vienen
                desde que la persona entró y las vacaciones solo existen en el
                sistema desde que se creó la pestaña. */}
            <p className="mt-0.5 text-[12px] text-gray-500">
              30 días por cada 11 meses trabajados.{desdeCuandoCuenta ? ` ${desdeCuandoCuenta}` : ""}
            </p>
            {/* 🔴 Un número por persona que no hay que ir a buscar: cuántas ya
                tienen saldo de verdad. Sin esto, la lista de pendientes no
                muestra el avance y se lee como si nada se hubiera hecho. */}
            {saldos.some((x) => !x.falta) && (
              <p className="mt-0.5 text-[12px] text-gray-500">
                {saldos.filter((x) => !x.falta).length} de {saldos.length} ya tienen saldo.
              </p>
            )}
          </div>

          {/* Ámbar, no rojo: no se rompió nada, falta cargar un dato. */}
          {avisoSaldo && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              {avisoSaldo}
            </p>
          )}
          {avisoSaldoIncompleto && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              {avisoSaldoIncompleto}
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {saldos.map((s) => (
              <li
                key={s.codigo}
                data-saldo-codigo={s.codigo}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                {/* Sin `truncate`: el nombre BAJA DE LÍNEA. Cortarlo con
                    puntos suspensivos esconde a quién le falta la fecha, que es
                    justo lo que esta lista viene a decir. Crece hacia abajo. */}
                <span className="min-w-0 break-words text-sm text-gray-900">{s.etiqueta}</span>
                <span data-saldo-valor className="shrink-0 text-right">
                  {s.falta ? (
                    <span className="text-[13px] text-amber-800">{textoSaldo(s)}</span>
                  ) : (
                    <>
                      <span className="text-sm tabular-nums text-gray-900">{textoSaldo(s)}</span>
                      {/* De dónde salió el número, para poder auditarlo sin
                          abrir otra pantalla: «12 al 25 ago 2026 · +8 ganados
                          · tomó 10». */}
                      {textoDetalle(s) && (
                        <span className="ml-2 text-[12px] text-gray-500">{textoDetalle(s)}</span>
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
