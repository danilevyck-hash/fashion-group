"use client";

// Hora de salida y almuerzo POR PERSONA.
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
import { Ayuda } from "@/components/shared/Ayuda";

interface Fila {
  codigo: string;
  /** Del directorio (`asistencia_personas`), no del reloj: el reloj no lo manda. */
  nombre: string | null;
  /** `false` = todavía no tiene ficha; se muestra el código y se avisa. */
  configurado?: boolean;
  salida: string;
  almuerzoMinutos: number;
  guardado: boolean;
  sugerida: string;
  diasMedidos: number;
}

const SALIDAS = ["16:30", "17:00"];
const ALMUERZOS = [30, 60];

export default function HorariosTab() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [sinConfirmar, setSinConfirmar] = useState(0);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/asistencia/horarios", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo cargar");
      setFilas(d.personas ?? []);
      setSinConfirmar(d.sinConfirmar ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setFilas([]);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(f: Fila, cambios: Partial<Fila>) {
    const nuevo = { ...f, ...cambios };
    setFilas((prev) => prev?.map((x) => (x.codigo === f.codigo ? { ...nuevo, guardado: true } : x)) ?? null);
    setGuardando(f.codigo);
    try {
      const res = await fetch("/api/asistencia/horarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: f.codigo, nombre: f.nombre,
          salida: nuevo.salida, almuerzoMinutos: nuevo.almuerzoMinutos,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      setSinConfirmar((n) => (f.guardado ? n : Math.max(0, n - 1)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      void cargar(); // revierte lo optimista
    } finally { setGuardando(null); }
  }

  return (
    <div className="space-y-4">
      {/* 🩸 El PORQUÉ de esta pantalla —el `Turno` del reloj viene mal— se
          aprende una vez y no cambia ninguna decisión al abrirla. Pasa al ⓘ;
          lo que SÍ pide acción («N sin confirmar») se queda abajo, a la vista. */}
      <div className="-ml-2 -mt-2">
        <Ayuda titulo="De dónde sale la hora sugerida" etiqueta="De dónde sale la sugerencia">
          <p>
            Lo que fijes acá manda sobre lo que diga el reloj. Arranca con la hora a la que
            <b> cada quien sale de verdad</b>, medida de sus marcaciones.
          </p>
        </Ayuda>
      </div>

      {sinConfirmar > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{sinConfirmar}</b> sin confirmar. Están usando la sugerencia — tócalas para dejarlas fijas.
        </p>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {filas === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {filas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          Todavía no hay marcaciones. En cuanto el reloj mande las primeras, la gente aparece acá.
        </p>
      )}

      {!!filas?.length && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2.5 text-left font-medium">Persona</th>
              <th className="px-3 py-2.5 text-left font-medium">Sale a las</th>
              <th className="px-3 py-2.5 text-left font-medium">Almuerzo</th>
              <th className="px-3 py-2.5 text-left font-medium"></th>
            </tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.codigo} className="border-b border-gray-100 last:border-0">
                  {/* El nombre primero, el código chico al lado. Sin ficha se
                      muestra el código y se dice qué falta: una celda en blanco
                      es una persona a la que nadie le va a fijar el horario. */}
                  <td className="px-3 py-2">
                    {etiquetaPersona(f.codigo, f.nombre)}
                    {f.nombre ? (
                      <span className="ml-1.5 text-xs text-gray-400">{f.codigo}</span>
                    ) : (
                      <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {SALIDAS.map((s) => (
                        <button key={s} type="button" onClick={() => void guardar(f, { salida: s })}
                          className={`min-h-[44px] rounded-md border px-2.5 text-[13px] tabular-nums transition active:scale-[0.97] ${
                            f.salida === s ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}>{s}</button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {ALMUERZOS.map((a) => (
                        <button key={a} type="button" onClick={() => void guardar(f, { almuerzoMinutos: a })}
                          className={`min-h-[44px] rounded-md border px-2.5 text-[13px] tabular-nums transition active:scale-[0.97] ${
                            f.almuerzoMinutos === a ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}>{a} min</button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {guardando === f.codigo ? <span className="text-gray-400">Guardando…</span>
                      : !f.guardado ? (
                        <span className="text-amber-700">
                          Sugerido · sale {f.sugerida} en {f.diasMedidos} días
                        </span>
                      ) : <span className="text-gray-300">Confirmado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
