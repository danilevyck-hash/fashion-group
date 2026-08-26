"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES — las horas extra que el reloj detectó y todavía nadie autorizó.
 *
 * ── 🔴 EL REQUISITO ES EL NÚMERO DE CLICS, Y MANDA SOBRE TODO LO DEMÁS ───────
 *
 * Daniel, textual: *«que en el usuario de julio y daniel haya un tab para
 * aprobaciones, con un clic se aprueba y ya, maximo 3 clics»*.
 *
 * Medido con el DOM de verdad en `asistencia-aprobaciones-pantalla.test.tsx`:
 *
 *   · una persona          → 2 clics  (pestaña «Aprobaciones» + «Aprobar»)
 *   · la quincena entera   → 3 clics  (pestaña + «Aprobar todas» + «Aprobar»)
 *   · desaprobar           → 2 clics  (pestaña + «Quitar»)
 *
 * De ahí salen las tres decisiones de esta pantalla:
 *
 *  1. LA UNIDAD ES LA PERSONA-Y-PERÍODO, no el día. Día por día, una quincena
 *     de doce días serían doce clics POR PERSONA. Y no se pierde nada del
 *     cálculo: el reparto 1,25 / 1,50 lo sigue haciendo `clasificarDia` día por
 *     día — la aprobación solo decide si esa persona cobra sus extras.
 *  2. EL DETALLE POR DÍA SE VE, PERO NO ES UN PASO. Está detrás del triangulito
 *     de la fila; mirar es opcional y no gasta ninguno de los tres clics.
 *  3. EL PERÍODO YA VIENE PUESTO en la quincena en curso. Si hubiera que
 *     elegirlo, aprobar arrancaría en 3 clics antes de tocar nada.
 *
 * ── 🔴 SE PUEDE DESAPROBAR ──────────────────────────────────────────────────
 *
 * Un clic de más no puede ser irreversible. «Quitar» devuelve la fila a
 * pendiente y la planilla deja de pagar esas horas en el mismo instante. Lo que
 * NO se borra es el registro: la fila guarda quién la tocó por última vez.
 *
 * ── 🔴 SE APRUEBA UN PERMISO, NUNCA UN NÚMERO ───────────────────────────────
 *
 * Los minutos que se ven acá se vuelven a calcular en cada carga con la base de
 * cálculo vigente. Si mañana la salida pasa de las 17:00 a las 16:30 —o el
 * período se corre al 13-27, como lo tiene la contadora—, esta pantalla muestra
 * los números nuevos sola. Lo único que guarda un número es el TESTIGO, y
 * cuando el testigo y lo medido no coinciden la fila lo dice con los dos a la
 * vista. Ver la nota larga de `lib/asistencia/aprobaciones.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import RangoFechas from "./RangoFechas";
import { quincenasHasta } from "@/lib/asistencia/planilla";
import {
  horasBonitas,
  resumenPendientes,
  type FilaAprobacion,
} from "@/lib/asistencia/aprobaciones";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Panamá es UTC−5 fijo. En UTC pelado, de noche el día salta al siguiente. */
function cuandoBonito(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${hh}:${mm}`;
}
const money = (n: number) => `$${n.toFixed(2)}`;

interface Respuesta {
  aprobaciones: FilaAprobacion[] | null;
  puedeAprobar: boolean;
  avisos: { faltaMigracionAprobaciones: string | null };
}

export default function AprobacionesTab() {
  const { toast } = useToast();

  const hoy = useMemo(
    () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10),
    [],
  );
  // El período arranca PUESTO en la quincena en curso: es lo que se aprueba el
  // 95% de las veces, y elegirlo a mano sería un clic antes de empezar.
  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(quincenaEnCurso.hasta);

  const [filas, setFilas] = useState<FilaAprobacion[] | null>(null);
  const [puedeAprobar, setPuedeAprobar] = useState(true);
  const [avisoMigracion, setAvisoMigracion] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [confirmarTodas, setConfirmarTodas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 🔑 SIN `empresa`: se aprueba a la persona, no a la empresa. Filtrar acá
      // obligaría a repetir los tres clics por cada uno de los tres cuadros.
      const p = new URLSearchParams({ desde, hasta, aprobaciones: "1" });
      const res = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
      const j = (await res.json()) as Respuesta & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setFilas(j.aprobaciones ?? []);
      setPuedeAprobar(j.puedeAprobar !== false);
      setAvisoMigracion(j.avisos?.faltaMigracionAprobaciones ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setFilas(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const pendientes = useMemo(() => resumenPendientes(filas ?? []), [filas]);

  /**
   * Aprueba o desaprueba. UNA función para los tres botones: el de la fila, el
   * de «Quitar» y el de «Aprobar todas» mandan lo mismo con distinta lista.
   */
  const marcar = useCallback(
    async (personas: Array<{ codigo: string; minutos: number }>, aprobado: boolean) => {
      if (personas.length === 0) return;
      setGuardando(personas.length === 1 ? personas[0].codigo : "todas");
      try {
        const res = await fetch("/api/asistencia/aprobaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ desde, hasta, aprobado, personas }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) {
          toast(j.aviso ?? "No se pudo guardar", "error");
        } else {
          const cuantas = personas.length;
          toast(
            aprobado
              ? `Listo: ${cuantas === 1 ? "1 persona aprobada" : `${cuantas} personas aprobadas`}`
              : "Listo: quedó sin aprobar",
            "success",
          );
        }
        // Se recarga entero: aprobar cambia el pago, y pintar solo la fila
        // dejaría la pantalla diciendo una cosa y la planilla pagando otra.
        await cargar();
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setGuardando(null);
      }
    },
    [cargar, desde, hasta, toast],
  );

  const aprobarTodas = useCallback(async () => {
    const lista = (filas ?? [])
      .filter((f) => !f.aprobado)
      .map((f) => ({ codigo: f.codigo, minutos: f.minutos }));
    setConfirmarTodas(false);
    await marcar(lista, true);
  }, [filas, marcar]);

  return (
    <div className="space-y-4">
      {/* ── El período ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onChange={(d, h) => { setDesde(d); setHasta(h); }}
        />
        {/* 🔴 «Aprobar todas» AL LADO del período y arriba de la lista: con él,
            una quincena entera son 3 clics contando el de esta pestaña. */}
        {pendientes.personas > 0 && puedeAprobar && (
          <button
            type="button"
            onClick={() => setConfirmarTodas(true)}
            disabled={guardando !== null}
            className="min-h-[44px] rounded-lg bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
          >
            Aprobar todas ({pendientes.personas})
          </button>
        )}
      </div>

      {avisoMigracion && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {avisoMigracion}
        </p>
      )}

      {!puedeAprobar && (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
          No tienes permiso para aprobar horas extra.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}

      {cargando && !filas && (
        <p className="px-1 py-6 text-sm text-gray-500">Cargando…</p>
      )}

      {filas && filas.length === 0 && !cargando && (
        <p className="rounded-lg border border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
          Nadie hizo horas extra en este período.
        </p>
      )}

      {/* ── La lista ────────────────────────────────────────────────────────
          🔑 NO ES UNA TABLA. En 834 (iPad) una tabla de seis columnas se
          aplasta, y en este módulo ya pasó. Cada fila es un bloque que se
          reacomoda solo: en celular el botón cae abajo y en escritorio va a la
          derecha, sin una sola columna que apretar. */}
      {filas && filas.length > 0 && (
        <ul className="space-y-2">
          {filas.map((f) => {
            const abierto = abierta === f.codigo;
            return (
              <li
                key={f.codigo}
                className={`rounded-lg border px-3 py-2.5 ${
                  f.aprobado ? "border-gray-200 bg-white" : "border-amber-200 bg-amber-50/60"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {f.etiqueta}
                      </span>
                      {f.empresaEtiqueta && (
                        <span className="text-[12px] text-gray-400">{f.empresaEtiqueta}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] tabular-nums text-gray-700">
                      <span className="font-medium">{horasBonitas(f.minutos)}</span>
                      {f.monto !== null && <span className="text-gray-500">{money(f.monto)}</span>}
                      {f.dias.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAbierta(abierto ? null : f.codigo)}
                          aria-expanded={abierto}
                          // 🩸 44 px de alto REALES con `-my-2` para que crecer
                          // no separe el enlace de la línea de las horas.
                          // Medido en el navegador: a 28 px el dedo no le
                          // acierta, y es la misma regla que ya pagó la píldora
                          // del calendario de Recordatorios.
                          className="-my-2 min-h-[44px] text-[12px] text-gray-500 underline underline-offset-2 transition hover:text-gray-900"
                        >
                          {abierto ? "ocultar días" : `ver ${f.dias.length} ${f.dias.length === 1 ? "día" : "días"}`}
                        </button>
                      )}
                    </div>

                    {/* 🔴 Quién aprobó y cuándo. Daniel lo pidió explícitamente. */}
                    {f.aprobado && f.por && (
                      <p className="mt-0.5 text-[12px] text-gray-500">
                        Aprobada por {f.por}{f.cuando ? ` · ${cuandoBonito(f.cuando)}` : ""}
                      </p>
                    )}
                    {/* 🔴 El testigo no coincide con lo medido hoy: se dice con
                        los dos números. Puede ser una marcación corregida o un
                        cambio en la base de cálculo. */}
                    {f.cambio && f.minutosVistos !== null && (
                      <p className="mt-0.5 text-[12px] text-amber-800">
                        Cambió desde que se aprobó: se aprobaron {horasBonitas(f.minutosVistos)} y
                        hoy son {horasBonitas(f.minutos)}.
                      </p>
                    )}
                  </div>

                  {puedeAprobar && (
                    <div className="shrink-0">
                      {f.aprobado ? (
                        <button
                          type="button"
                          onClick={() => void marcar([{ codigo: f.codigo, minutos: f.minutos }], false)}
                          disabled={guardando !== null}
                          className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-50 sm:w-auto"
                        >
                          Quitar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void marcar([{ codigo: f.codigo, minutos: f.minutos }], true)}
                          disabled={guardando !== null}
                          className="min-h-[44px] w-full rounded-lg bg-black px-5 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50 sm:w-auto"
                        >
                          Aprobar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* El detalle por día. Mirarlo NO es un paso obligatorio. */}
                {abierto && f.dias.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-gray-200 pt-2">
                    {f.dias.map((d) => (
                      <li
                        key={d.fecha}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] tabular-nums text-gray-600"
                      >
                        <span>{d.etiqueta}</span>
                        <span className="text-gray-400">
                          {d.salida ? `salió ${d.salida}` : "sin salida"}
                        </span>
                        <span className="font-medium text-gray-800">{horasBonitas(d.minutos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmarTodas && (
        <ConfirmarTodas
          personas={pendientes.personas}
          minutos={pendientes.minutos}
          onCancelar={() => setConfirmarTodas(false)}
          onAprobar={() => void aprobarTodas()}
        />
      )}
    </div>
  );
}

/**
 * La confirmación de «Aprobar todas».
 *
 * 🔴 POR QUÉ EXISTE UN PASO MÁS ACÁ Y NO EN LA FILA. Aprobar una persona es un
 * clic y se deshace con otro; aprobar la quincena entera mueve el pago de todo
 * el mundo de una vez, y un toque sin querer en el celular no puede hacer eso a
 * ciegas. La ventana no pregunta «¿estás seguro?» —eso no informa nada—: dice
 * A CUÁNTAS PERSONAS y CUÁNTAS HORAS, que es lo que hace falta para decidir.
 *
 * ⚠️ Y sigue entrando en el presupuesto: pestaña + «Aprobar todas» + «Aprobar»
 * son los 3 clics que pidió Daniel, ni uno más.
 *
 * Patrón de la casa para iOS: `createPortal` + `inset-0` + `useBodyScrollLock`,
 * y SIN `autoFocus`.
 */
function ConfirmarTodas({
  personas,
  minutos,
  onCancelar,
  onAprobar,
}: {
  personas: number;
  minutos: number;
  onCancelar: () => void;
  onAprobar: () => void;
}) {
  useBodyScrollLock(true);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-semibold text-gray-900">Aprobar todas</h2>
        <p className="mt-1 text-sm text-gray-600">
          {personas === 1 ? "1 persona" : `${personas} personas`} · {horasBonitas(minutos)}
        </p>
        <p className="mt-2 text-[13px] text-gray-500">
          Se pagan en la planilla de este período. Se puede quitar después.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onAprobar}
            className="min-h-[44px] flex-1 rounded-lg bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
          >
            Aprobar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
