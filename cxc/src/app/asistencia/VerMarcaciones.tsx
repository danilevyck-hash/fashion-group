"use client";

// Consulta de marcaciones, agrupadas en JORNADAS (día por empleado con horas).
// La regla de agrupación vive en `lib/asistencia/jornadas.ts` — acá solo la
// pantalla.

import { useCallback, useEffect, useState } from "react";
import { horaPanama, type Jornada, type ResumenJornadas } from "@/lib/asistencia/jornadas";

const RELOJES = [
  { key: "", label: "Todos" },
  { key: "RELOJ_FG", label: "Fashion Group" },
  { key: "RELOJ_ACS", label: "Multifashion (ACS)" },
];

/** Hoy en Panamá (UTC−5 fijo), YYYY-MM-DD. */
function hoyPanama(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function haceDias(n: number): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000 - n * 86_400_000).toISOString().slice(0, 10);
}

function fechaLarga(dia: string): string {
  const [a, m, d] = dia.split("-");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

export default function VerMarcaciones() {
  const [desde, setDesde] = useState(haceDias(14));
  const [hasta, setHasta] = useState(hoyPanama());
  const [reloj, setReloj] = useState("");
  const [empleado, setEmpleado] = useState("");
  const [jornadas, setJornadas] = useState<Jornada[] | null>(null);
  const [resumen, setResumen] = useState<ResumenJornadas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (reloj) p.set("dispositivo", reloj);
      if (empleado.trim()) p.set("empleado", empleado.trim());
      const res = await fetch(`/api/asistencia/marcaciones?${p}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setJornadas(data.jornadas ?? []);
      setResumen(data.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setJornadas(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, reloj, empleado]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Reloj</label>
          <select value={reloj} onChange={(e) => setReloj(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm">
            {RELOJES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Empleado</label>
          <input type="text" value={empleado} onChange={(e) => setEmpleado(e.target.value)} placeholder="Nombre o código"
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm" />
        </div>
      </div>

      {resumen && !error && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
          <span><b className="tabular-nums text-gray-900">{resumen.empleados}</b> empleados</span>
          <span><b className="tabular-nums text-gray-900">{resumen.dias}</b> días</span>
          <span><b className="tabular-nums text-gray-900">{resumen.horasTotales}</b> horas</span>
          {resumen.incompletas > 0 && (
            <span className="text-amber-700">
              <b className="tabular-nums">{resumen.incompletas}</b> sin salida
            </span>
          )}
        </div>
      )}

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!cargando && !error && jornadas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay marcaciones en este rango. Si acabas de subir un Excel, revisa que las
          fechas de arriba lo incluyan.
        </p>
      )}

      {!cargando && !error && !!jornadas?.length && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2.5 text-left font-medium">Día</th>
                <th className="px-3 py-2.5 text-left font-medium">Empleado</th>
                <th className="px-3 py-2.5 text-right font-medium">Entrada</th>
                <th className="px-3 py-2.5 text-right font-medium">Salida</th>
                <th className="px-3 py-2.5 text-right font-medium">Horas</th>
                <th className="px-3 py-2.5 text-right font-medium">Marcas</th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map((j, i) => (
                <tr key={`${j.dia}-${j.empleadoCodigo ?? j.empleadoNombre}-${i}`}
                    className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{fechaLarga(j.dia)}</td>
                  <td className="px-3 py-2.5 text-gray-900">
                    {j.empleadoNombre ?? j.empleadoCodigo ?? "—"}
                    {j.empleadoNombre && j.empleadoCodigo && (
                      <span className="ml-1.5 text-xs text-gray-400">{j.empleadoCodigo}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{horaPanama(j.entrada)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                    {j.salida ? horaPanama(j.salida) : <span className="text-amber-700">falta</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">
                    {j.horas ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{j.marcaciones.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Que nadie lea "falta" como un error del sistema. */}
      {!!resumen?.incompletas && (
        <p className="text-xs text-gray-400">
          "Falta" significa que ese día solo hay una marcación: la persona entró y no
          marcó la salida (o al revés). No es un error de carga.
        </p>
      )}
    </div>
  );
}
