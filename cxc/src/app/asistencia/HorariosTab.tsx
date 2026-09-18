"use client";

// Horario POR PERSONA: los días que trabaja, la entrada y la salida cuando
// marca en el reloj, y las de cuando marca por el teléfono. El almuerzo es fijo
// y se muestra como dato.
//
// 🔴 LOS DÍAS Y LOS DOS HORARIOS SON CONFIGURABLES (18-sep-2026). Daniel,
// textual: *"todo eso de horario que sea configurable por si hay cambios en un
// futuro"*, *"multifashion sus dias laborales es de lunes a sabado"*, *"Ana ·
// Cindy · Yeisibeth su horario es de 9-18 cuando estan afuera"*. Hasta hoy la
// pantalla ofrecía DOS botones de salida (16:30 · 17:00) y nada más: la entrada
// de las 10:00 de Multifashion no se podía ni ver. La regla vive en
// `lib/asistencia/horario-configurable.ts`; sin la migración corrida, el
// servidor lo dice y acá solo se ven la entrada y la salida.
//
// 🔴 EL ALMUERZO DEJÓ DE SER UNA OPCIÓN (13-ago-2026). Daniel, textual: *"todos
// 30 minutos de almuerzo (puedes quitar la opcion de elegir tiempo de almuerzo,
// siempre es fijo 30 mins)"*. El valor lo escribe el PUT mire lo que mire el
// cuerpo del pedido — esconder el control sin cerrar la ruta habría sido
// cosmético.
//
// 🩸 No es una pantalla de configuración cualquiera: el `Turno` de iVMS está mal
// en 12 de 31 personas (medido contra los 3 archivos reales). Ángela García
// figura "8 a 4:30" y sale 17:04 casi todos los días; con ese dato le salían
// 584 minutos de horas extra en 11 días, que en realidad es salir a su hora.
//
// Por eso arranca con la salida SUGERIDA por sus marcaciones reales —no por la
// etiqueta— y se marca claro quién falta confirmar.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { etiquetaPersona } from "@/lib/asistencia/directorio";
import { textoAlmuerzo } from "@/lib/asistencia/config";
import {
  DIAS_ELEGIBLES,
  DIAS_SEMANA_CORTO,
  NOTA_DOMINGO,
  NOTA_TELEFONO_VACIO,
  ROTULO_DIAS,
  ROTULO_RELOJ,
  ROTULO_TELEFONO,
} from "@/lib/asistencia/horario-configurable";
import { Ayuda } from "@/components/shared/Ayuda";

interface Fila {
  codigo: string;
  /** Del directorio (`asistencia_personas`), no del reloj: el reloj no lo manda. */
  nombre: string | null;
  /** `false` = todavía no tiene ficha; se muestra el código y se avisa. */
  configurado?: boolean;
  entrada: string;
  salida: string;
  /** Lo GUARDADO. Se muestra, no se elige: la pantalla no puede cambiarlo. */
  almuerzoMinutos: number;
  /** Los días que trabaja (1 = lunes … 6 = sábado): los suyos o los de su empresa. */
  diasLaborables: number[];
  /** El horario de cuando marca por el teléfono. `null` = el mismo de arriba. */
  entradaAfuera: string | null;
  salidaAfuera: string | null;
  guardado: boolean;
  sugerida: string;
  diasMedidos: number;
}

/** Lo que viaja al servidor. El almuerzo NO: lo pone él. */
function cuerpoDe(f: Fila, configurable: boolean) {
  return configurable
    ? {
        codigo: f.codigo, nombre: f.nombre, entrada: f.entrada, salida: f.salida,
        diasLaborables: f.diasLaborables, entradaAfuera: f.entradaAfuera, salidaAfuera: f.salidaAfuera,
      }
    : { codigo: f.codigo, nombre: f.nombre, entrada: f.entrada, salida: f.salida };
}

const HORA = "min-h-[44px] w-[6.5rem] rounded-md border border-gray-200 px-2 text-[14px] tabular-nums text-gray-800 focus:border-black focus:outline-none";

export default function HorariosTab() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [sinConfirmar, setSinConfirmar] = useState(0);
  /** El aviso del servidor cuando los días y el teléfono todavía no se pueden guardar. */
  const [faltaMigracion, setFaltaMigracion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configurable = !faltaMigracion;

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/asistencia/horarios", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo cargar");
      setFilas(
        (d.personas ?? []).map((p: Partial<Fila>) => ({
          ...p,
          diasLaborables: Array.isArray(p.diasLaborables) ? p.diasLaborables : [1, 2, 3, 4, 5],
          entradaAfuera: p.entradaAfuera ?? null,
          salidaAfuera: p.salidaAfuera ?? null,
        })) as Fila[],
      );
      setSinConfirmar(d.sinConfirmar ?? 0);
      setFaltaMigracion(d.faltaMigracion ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setFilas([]);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Guarda EN CUANTO se cambia algo. Sin botón: se guarda solo. */
  async function guardar(f: Fila, cambios: Partial<Fila>) {
    const nuevo = { ...f, ...cambios };
    setFilas((prev) => prev?.map((x) => (x.codigo === f.codigo ? { ...nuevo, guardado: true } : x)) ?? null);
    setGuardando(f.codigo);
    try {
      const res = await fetch("/api/asistencia/horarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoDe(nuevo, configurable)),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      if (d.faltaMigracion) toast(d.faltaMigracion, "error");
      setSinConfirmar((n) => (f.guardado ? n : Math.max(0, n - 1)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      void cargar(); // revierte lo optimista
    } finally { setGuardando(null); }
  }

  /** Un día se prende o se apaga. Nunca se queda sin ninguno: el último no se apaga. */
  function alternarDia(f: Fila, dia: number) {
    const tiene = f.diasLaborables.includes(dia);
    if (tiene && f.diasLaborables.length === 1) {
      toast("Tiene que trabajar al menos un día.", "error");
      return;
    }
    const dias = tiene
      ? f.diasLaborables.filter((d) => d !== dia)
      : [...f.diasLaborables, dia].sort((a, b) => a - b);
    void guardar(f, { diasLaborables: dias });
  }

  /** Una hora tecleada; se guarda al salir del campo si cambió. */
  function hora(f: Fila, campo: "entrada" | "salida" | "entradaAfuera" | "salidaAfuera", opcional = false) {
    return (
      <input
        type="time"
        aria-label={`${campo} de ${etiquetaPersona(f.codigo, f.nombre)}`}
        className={HORA}
        value={f[campo] ?? ""}
        placeholder={opcional ? (campo === "entradaAfuera" ? f.entrada : f.salida) : undefined}
        onChange={(e) => {
          const v = e.target.value;
          setFilas((prev) => prev?.map((x) => (x.codigo === f.codigo ? { ...x, [campo]: opcional && !v ? null : v } : x)) ?? null);
        }}
        onBlur={(e) => {
          const v = e.target.value;
          const valor = opcional && !v ? null : v;
          if (valor === f[campo]) return;
          if (!opcional && !v) return; // la entrada y la salida no se borran
          void guardar(f, { [campo]: valor } as Partial<Fila>);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 🩸 El PORQUÉ de esta pantalla —el `Turno` del reloj viene mal— se
          aprende una vez y no cambia ninguna decisión al abrirla. Pasa al ⓘ;
          lo que SÍ pide acción («N sin confirmar») se queda abajo, a la vista. */}
      <div className="-ml-2 -mt-2">
        <Ayuda titulo="De dónde sale la hora sugerida" etiqueta="De dónde sale la sugerencia">
          <p>
            Lo que fijes aquí manda sobre lo que diga el reloj. Arranca con la hora a la que
            <b> cada quien sale de verdad</b>, medida de sus marcaciones.
          </p>
          <p className="mt-1.5">
            El <b>almuerzo es de {textoAlmuerzo()}</b> y no se elige.
          </p>
          <p className="mt-1.5">
            <b>{ROTULO_DIAS}</b>: un día marcado sin marcación es una ausencia. {NOTA_DOMINGO}
          </p>
          <p className="mt-1.5">
            <b>{ROTULO_TELEFONO}</b>: se usa cuando la <b>primera marca del día</b> vino del
            teléfono; {NOTA_TELEFONO_VACIO}.
          </p>
        </Ayuda>
      </div>

      {sinConfirmar > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{sinConfirmar}</b> sin confirmar. Están usando la sugerencia — tócalas para dejarlas fijas.
        </p>
      )}
      {faltaMigracion && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{faltaMigracion}</p>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {filas === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {filas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          Todavía no hay marcaciones. En cuanto el reloj mande las primeras, la gente aparece aquí.
        </p>
      )}

      {!!filas?.length && (
        <div className="rounded-lg border border-gray-200 bg-white">
          {/* Encabezados solo en escritorio; en celular cada dato lleva su rótulo. */}
          <div className="hidden border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] lg:gap-x-4 lg:px-3 lg:py-2.5">
            <div>Colaborador</div>
            {configurable && <div>{ROTULO_DIAS}</div>}
            <div>{ROTULO_RELOJ}</div>
            {configurable && <div>{ROTULO_TELEFONO}</div>}
            <div>Almuerzo</div>
            <div></div>
          </div>
          {filas.map((f) => (
            <div
              key={f.codigo}
              className="border-b border-gray-100 px-3 py-3 last:border-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] lg:items-center lg:gap-x-4 lg:py-2"
            >
              {/* El nombre primero, el código chico al lado. Sin ficha se
                  muestra el código y se dice qué falta: una celda en blanco
                  es una persona a la que nadie le va a fijar el horario. */}
              <div className="text-sm">
                {etiquetaPersona(f.codigo, f.nombre)}
                {f.nombre ? (
                  <span className="ml-1.5 text-xs text-gray-400">{f.codigo}</span>
                ) : (
                  <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>
                )}
              </div>

              {configurable && (
                <div className="mt-2 lg:mt-0">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 lg:hidden">{ROTULO_DIAS}</div>
                  <div className="mt-1 flex gap-1 lg:mt-0">
                    {DIAS_ELEGIBLES.map((d) => {
                      const on = f.diasLaborables.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => alternarDia(f, d)}
                          className={`min-h-[44px] min-w-[44px] rounded-md border px-2 text-[13px] transition active:scale-[0.97] ${
                            on ? "border-black bg-black text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"
                          }`}
                        >
                          {DIAS_SEMANA_CORTO[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-2 lg:mt-0">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 lg:hidden">{ROTULO_RELOJ}</div>
                <div className="mt-1 flex items-center gap-1.5 lg:mt-0">
                  {hora(f, "entrada")}
                  <span className="text-gray-400">→</span>
                  {hora(f, "salida")}
                </div>
              </div>

              {configurable && (
                <div className="mt-2 lg:mt-0">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 lg:hidden">{ROTULO_TELEFONO}</div>
                  <div className="mt-1 flex items-center gap-1.5 lg:mt-0">
                    {hora(f, "entradaAfuera", true)}
                    <span className="text-gray-400">→</span>
                    {hora(f, "salidaAfuera", true)}
                    {f.entradaAfuera === null && f.salidaAfuera === null && (
                      <span className="text-[12px] text-gray-400">{NOTA_TELEFONO_VACIO}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Dato, no control: el almuerzo lo decide la empresa. */}
              <div className="mt-2 text-[13px] tabular-nums text-gray-500 lg:mt-0">
                <span className="lg:hidden">Almuerzo: </span>{f.almuerzoMinutos} minutos
              </div>

              <div className="mt-1 text-[12px] lg:mt-0">
                {guardando === f.codigo ? <span className="text-gray-400">Guardando…</span>
                  : !f.guardado ? (
                    <span className="text-amber-700">
                      Sugerido · sale {f.sugerida} en {f.diasMedidos} días
                    </span>
                  ) : <span className="text-gray-300">Confirmado</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
