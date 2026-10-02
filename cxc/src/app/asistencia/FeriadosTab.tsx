"use client";

// Feriados y cierres. Van aparte de las justificaciones y NO persona por
// persona: si el 3 de noviembre hubiera que justificarlo uno a uno,
// aparecerían 32 ausencias.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { Ayuda } from "@/components/shared/Ayuda";
import { ControlSegmentado } from "@/components/ventas/ControlSegmentado";
import { hoyPanama } from "@/lib/fecha-panama";
import { ROTULO_TIPO, TIPOS_FERIADO, type TipoFeriado } from "@/lib/asistencia/feriados";

interface Feriado { fecha: string; nombre: string; tipo?: TipoFeriado }

// 🔴 20a — FECHA CORTA (29-sep-2026, audit visual aprobado por Daniel): «jue 1
// ene», no «jueves 1 de enero». El año ya lo dice el selector de arriba.
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DOW = ["dom","lun","mar","mié","jue","vie","sáb"];
function corta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DOW[dow]} ${d} ${MESES[m - 1]}`;
}

export default function FeriadosTab() {
  const { toast } = useToast();
  const anioActual = new Date(Date.now() - 5 * 3600_000).getUTCFullYear();
  const [anio, setAnio] = useState(String(anioActual));
  const [lista, setLista] = useState<Feriado[] | null>(null);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  // 🔴 30-sep-2026: el tipo se elige al agregar. Arranca en «Feriado»: lo de siempre.
  const [tipo, setTipo] = useState<TipoFeriado>("feriado");
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyPanama();

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/asistencia/feriados?anio=${anio}`, { cache: "no-store" });
    const d = await res.json();
    setLista(d.feriados ?? []);
  }, [anio]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Agregar y cambiar el tipo son el MISMO upsert por fecha.
  async function guardar(f: Feriado): Promise<boolean> {
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/feriados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      await cargar();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      return false;
    } finally { setGuardando(false); }
  }

  async function agregar() {
    if (!fecha) return toast("Elige la fecha", "error");
    if (!nombre.trim()) return toast("Ponle un nombre", "error");
    if (await guardar({ fecha, nombre: nombre.trim(), tipo })) {
      setFecha(""); setNombre(""); setTipo("feriado");
    }
  }

  async function borrar(f: string) {
    try {
      const res = await fetch(`/api/asistencia/feriados?fecha=${f}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar");
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo eliminar", "error"); }
  }

  const campo = "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";

  return (
    <div className="space-y-5">
      {/* Lo que se aprende UNA vez vive en el ⓘ; lo que hay que hacer, en la
          pantalla. El aviso de que estos días no cuentan como ausencia sigue
          alcanzable de un toque, sin ocupar lugar en cada carga. */}
      <div className="-ml-2 -mt-2">
        <Ayuda titulo="Para qué sirven los feriados" etiqueta="Para qué sirven">
          <p>
            Estos días <b>no cuentan como ausencia de nadie</b>. Los feriados de Panamá ya
            están cargados; agrega aquí tus cierres propios (inventario, capacitación).
          </p>
          <p className="mt-2">
            <b>Feriado</b>: se paga, y quien trabaje cobra el recargo de feriado.{" "}
            <b>Día libre</b>: se paga, pero quien no trabajó queda debiendo 8 horas, que se
            pagan solo con horas extra; quien trabajó cobra normal. Multifashion no debe nada.
          </p>
        </Ayuda>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Descripción</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Cierre por inventario" className={campo} />
          </div>
          <button type="button" onClick={() => void agregar()} disabled={guardando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </div>
        <ControlSegmentado
          className="mt-3"
          ariaLabel="Tipo"
          options={TIPOS_FERIADO.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))}
          active={tipo}
          onChange={setTipo}
        />
      </div>

      {/* El año es un FILTRO, no una acción: control segmentado gris, sin
          negro relleno (29-sep-2026). Sigue midiendo 44 px. */}
      <ControlSegmentado
        ancho="contenido"
        ariaLabel="Año"
        options={[anioActual, anioActual + 1].map((a) => ({ value: String(a), label: String(a) }))}
        active={anio}
        onChange={setAnio}
      />

      {lista === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {!!lista?.length && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* 🔴 20a — LO QUE YA PASÓ VA EN GRIS Y SIN «Quitar» (29-sep-2026).
              Quitar un feriado viejo cambiaría cómo se lee una quincena que ya
              se midió; los que vienen se siguen quitando. «Hoy» es el de
              Panamá. Filas de 44 px: la fecha a la izquierda, en su columna. */}
          {lista.map((f) => {
            const paso = f.fecha < hoy;
            const libre = f.tipo === "dia_libre";
            return (
              <div key={f.fecha} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-gray-100 px-3 last:border-0">
                <div className={`flex min-w-0 items-baseline gap-3 text-sm ${paso ? "text-gray-400" : "text-gray-900"}`}>
                  <span className={`w-[5.5rem] shrink-0 tabular-nums ${paso ? "" : "text-gray-500"}`}>{corta(f.fecha)}</span>
                  <span className="truncate">{f.nombre}</span>
                  {libre && (
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-500">Horas por reponer</span>
                  )}
                </div>
                {paso ? (
                  <span className="shrink-0 px-2 text-[13px] text-gray-400">Pasado</span>
                ) : (
                  <div className="flex shrink-0">
                    {/* 🔴 Cambiar el tipo es el MISMO upsert (30-sep-2026). */}
                    <button type="button" disabled={guardando}
                      onClick={() => void guardar({ ...f, tipo: libre ? "feriado" : "dia_libre" })}
                      className="min-h-[44px] rounded-md px-2 text-[13px] text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50">
                      {libre ? "Pasar a feriado" : "Pasar a día libre"}
                    </button>
                    {/* 44 px: el dedo tiene que caer en el «Quitar» que se apuntó. */}
                    <button type="button" onClick={() => void borrar(f.fecha)}
                      className="min-h-[44px] rounded-md px-2 text-[13px] text-gray-500 transition hover:bg-red-50 hover:text-red-600">
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
