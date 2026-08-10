"use client";

// Feriados y cierres. Van aparte de las justificaciones y NO persona por
// persona: si el 3 de noviembre hubiera que justificarlo uno a uno,
// aparecerían 32 ausencias.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { Ayuda } from "@/components/shared/Ayuda";

interface Feriado { fecha: string; nombre: string }

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOW = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function bonito(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DOW[dow]} ${d} de ${MESES[m - 1]}`;
}

export default function FeriadosTab() {
  const { toast } = useToast();
  const anioActual = new Date(Date.now() - 5 * 3600_000).getUTCFullYear();
  const [anio, setAnio] = useState(String(anioActual));
  const [lista, setLista] = useState<Feriado[] | null>(null);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/asistencia/feriados?anio=${anio}`, { cache: "no-store" });
    const d = await res.json();
    setLista(d.feriados ?? []);
  }, [anio]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function agregar() {
    if (!fecha) return toast("Elige la fecha", "error");
    if (!nombre.trim()) return toast("Ponle un nombre", "error");
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/feriados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, nombre: nombre.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setFecha(""); setNombre("");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally { setGuardando(false); }
  }

  async function borrar(f: string) {
    try {
      const res = await fetch(`/api/asistencia/feriados?fecha=${f}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo borrar");
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo borrar", "error"); }
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
            están cargados; agrega acá tus cierres propios (inventario, capacitación).
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
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Qué es</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Cierre por inventario" className={campo} />
          </div>
          <button type="button" onClick={() => void agregar()} disabled={guardando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[anioActual, anioActual + 1].map((a) => (
          // 44 px, como todo lo táctil de la casa. Medían 38 y pasaron
          // inadvertidos mientras Feriados era su propia pestaña.
          <button key={a} type="button" onClick={() => setAnio(String(a))}
            className={`min-h-[44px] rounded-md border px-3 text-sm transition ${
              anio === String(a) ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}>{a}</button>
        ))}
      </div>

      {lista === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {!!lista?.length && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {lista.map((f) => (
            <div key={f.fecha} className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-0">
              <div className="min-w-0">
                <span className="text-sm text-gray-900">{f.nombre}</span>
                <span className="ml-2 text-[13px] text-gray-500">{bonito(f.fecha)}</span>
              </div>
              {/* 44 px: son 22 feriados en la lista y el dedo tiene que caer en
                  el «Quitar» que se apuntó, no en el del renglón de al lado. */}
              <button type="button" onClick={() => void borrar(f.fecha)}
                className="-my-1 min-h-[44px] shrink-0 rounded-md px-2 text-[13px] text-gray-500 transition hover:bg-red-50 hover:text-red-600">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
