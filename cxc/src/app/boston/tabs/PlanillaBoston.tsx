"use client";

// LA PLANILLA DE CONFECCIONES BOSTON — las 21 personas, sin la plata.
//
// 🔑 NO SE REIMPLEMENTÓ NADA. Esta pestaña llama a `/api/asistencia/planilla`,
// la MISMA ruta y el MISMO motor que la contadora cotejó al centavo contra su
// Excel. Una segunda aritmética de sueldos al lado de la buena tiene un solo
// modo de fallo, y es que dos pantallas paguen distinto.
//
// 🔴 EL RECORTE VA EN EL SERVIDOR. La ruta reconoce a `gerente_boston` y le
// contesta SIN el bloque de dinero (`sinSueldos: true`) mientras
// `VE_SUELDOS_DE_BOSTON` esté en `false` — esconder la columna acá dejaría el
// sueldo viajando en el JSON. Y la EMPRESA tampoco se manda desde acá: la
// fuerza el servidor a Boston, así que un `?empresa=vistana` no sirve de nada.

import { useCallback, useEffect, useMemo, useState } from "react";
import { hoyPanama } from "@/lib/fecha-panama";
import { quincenasHasta } from "@/lib/asistencia/planilla";
import { fmtMin } from "@/lib/asistencia/reporte";
import { fmtDate } from "@/lib/format";
import type { LineaSinDinero } from "@/lib/boston/planilla-sin-dinero";

interface Respuesta {
  empresaEtiqueta: string | null;
  lineas: LineaSinDinero[];
  /** `true` cuando el servidor recortó la plata. Si un día Daniel abre los
   *  sueldos, viene `undefined` y la pantalla deja de decir que faltan. */
  sinSueldos?: boolean;
  avisos?: { periodoAbierto?: { texto?: string } | null; avisoSinFicha?: string | null };
}

interface Horas {
  extraDiurnoMin: number;
  extraNocturnoMin: number;
  tardanzaMin: number;
  ausenciaMin: number;
}

export default function PlanillaBoston() {
  const hoy = useMemo(() => hoyPanama(), []);
  const quincena = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincena.desde);
  const [hasta, setHasta] = useState(quincena.hasta);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 🔴 SIN `empresa`: la pone el servidor. Mandarla desde el navegador
      // sugeriría que se puede cambiar, y no se puede.
      const p = new URLSearchParams({ desde, hasta });
      const res = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setData(j as Respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const lineas = data?.lineas ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label className="text-xs text-gray-500">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="block min-h-[44px] px-3 rounded-xl border border-gray-200 bg-white text-base"
          />
        </label>
        <label className="text-xs text-gray-500">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="block min-h-[44px] px-3 rounded-xl border border-gray-200 bg-white text-base"
          />
        </label>
      </div>

      {data?.avisos?.periodoAbierto?.texto && (
        <p className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          {data.avisos.periodoAbierto.texto}
        </p>
      )}
      {data?.avisos?.avisoSinFicha && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {data.avisos.avisoSinFicha}
        </p>
      )}

      {error && <p className="text-sm text-red-600 py-8">{error}</p>}
      {cargando && !data && <p className="text-sm text-gray-500 py-8">Cargando…</p>}

      {!error && data && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {lineas.length} {lineas.length === 1 ? "persona" : "personas"} · {fmtDate(desde)} al{" "}
            {fmtDate(hasta)}
          </p>

          {/* Corte en `lg` por el ancho ÚTIL, igual que la pestaña CXC. */}
          <div data-vista="tarjetas" className="lg:hidden space-y-2">
            {lineas.map((l) => {
              const h = l.horas as Horas;
              return (
                <div key={l.codigo} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">{l.etiqueta}</span>
                    <span className="text-xs text-gray-400 shrink-0">{l.codigo}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
                    <span className="text-gray-600">
                      Extra {fmtMin(h.extraDiurnoMin + h.extraNocturnoMin)} min
                    </span>
                    <span className={h.tardanzaMin ? "text-amber-600" : "text-gray-400"}>
                      Tarde {fmtMin(h.tardanzaMin)} min
                    </span>
                    <span className={h.ausenciaMin ? "text-red-600" : "text-gray-400"}>
                      Ausencia {fmtMin(h.ausenciaMin)} min
                    </span>
                  </div>
                  {l.faltaConfigurar.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">{l.faltaConfigurar.join(" · ")}</p>
                  )}
                  {l.decidirAMano && <p className="mt-1 text-xs text-gray-500">{l.decidirAMano}</p>}
                </div>
              );
            })}
          </div>

          <div
            data-vista="tabla"
            className="hidden lg:block rounded-xl border border-gray-200 bg-white overflow-x-auto"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="text-left font-normal px-4 py-3">Persona</th>
                  <th className="text-right font-normal px-3">Extra 1,25</th>
                  <th className="text-right font-normal px-3">Extra 1,50</th>
                  <th className="text-right font-normal px-3">Tarde</th>
                  <th className="text-right font-normal px-4">Ausencia</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const h = l.horas as Horas;
                  return (
                    <tr key={l.codigo} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{l.etiqueta}</span>
                        {l.faltaConfigurar.length > 0 && (
                          <span className="block text-xs text-amber-700">
                            {l.faltaConfigurar.join(" · ")}
                          </span>
                        )}
                        {l.decidirAMano && (
                          <span className="block text-xs text-gray-500">{l.decidirAMano}</span>
                        )}
                      </td>
                      <td className="px-3 text-right tabular-nums">{fmtMin(h.extraDiurnoMin)}</td>
                      <td className="px-3 text-right tabular-nums">{fmtMin(h.extraNocturnoMin)}</td>
                      <td className={`px-3 text-right tabular-nums ${h.tardanzaMin ? "text-amber-600" : "text-gray-300"}`}>
                        {fmtMin(h.tardanzaMin)}
                      </td>
                      <td className={`px-4 text-right tabular-nums ${h.ausenciaMin ? "text-red-600" : "text-gray-300"}`}>
                        {fmtMin(h.ausenciaMin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.sinSueldos && (
            <p className="text-xs text-gray-500 pt-3">
              Acá se ven las horas, las tardanzas y las ausencias. Los sueldos los lleva
              contabilidad.
            </p>
          )}
        </>
      )}
    </div>
  );
}
