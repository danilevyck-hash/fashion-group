"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * SUS DÍAS DEL PERÍODO — el resumen, y el enlace a verlos uno por uno.
 *
 * 🔴 LA MISMA RUTA Y EL MISMO MOTOR DE SIEMPRE (`/api/asistencia/reporte`), con
 * `codigo=` para traer SOLO a esta persona. Los números que se ven acá son los
 * mismos que la contadora ve en el Reporte, salidos del mismo cálculo — no hay
 * una segunda cuenta de horas en esta pantalla.
 *
 * 🔑 EL DETALLE DÍA POR DÍA NO SE COPIA ACÁ. La tabla del Reporte tiene once
 * columnas, corrección de marcaciones adentro y su propio candado; duplicarla
 * sería una segunda tabla que mañana dice otra cosa. Se muestra el resumen y se
 * lleva a la de siempre, con la persona buscada y el período puesto.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import RangoFechas from "@/components/ui/RangoFechas";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtMin, type PersonaReporte } from "@/lib/asistencia/reporte";
import Seccion, { Vacio } from "./Seccion";

export default function SeccionAsistencia({ codigo, refresco }: {
  codigo: string; refresco: number;
}) {
  const hoy = hoyPanama();
  // Los últimos 15 días, el MISMO arranque que el Reporte — y el mismo «hoy»
  // de Panamá, nunca el reloj del navegador.
  const [desde, setDesde] = useState(() => hoyPanama(new Date(Date.now() - 14 * 86_400_000)));
  const [hasta, setHasta] = useState(hoy);
  const [persona, setPersona] = useState<PersonaReporte | null>(null);
  const [listo, setListo] = useState(false);

  const leer = useCallback(async () => {
    setListo(false);
    try {
      const url = `/api/asistencia/reporte?desde=${desde}&hasta=${hasta}&codigo=${encodeURIComponent(codigo)}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const lista = (d.personas ?? []) as PersonaReporte[];
      setPersona(lista.find((p) => String(p.codigo) === String(codigo)) ?? null);
    } catch {
      setPersona(null);
    } finally {
      setListo(true);
    }
  }, [codigo, desde, hasta]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  const r = persona?.resumen;

  return (
    <Seccion
      titulo="Asistencia del período"
      resumen={
        listo && persona
          ? `${r?.diasTrabajados ?? 0} día${(r?.diasTrabajados ?? 0) === 1 ? "" : "s"} con marcas`
          : listo ? "No marcó en este período" : "…"
      }
      boton={null}
    >
      <div className="mb-3">
        <RangoFechas desde={desde} hasta={hasta} label="Período"
          onChange={(d, h) => { setDesde(d); setHasta(h); }} />
      </div>

      {listo && !persona && (
        <Vacio texto="Sin marcas del reloj en estos días." />
      )}

      {listo && persona && r && (
        <>
          {/* Cuatro números y nada más: llegar tarde, faltar, horas extra y
              días medidos. Es lo que se pregunta de una persona; el detalle
              está a un toque. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Numero etiqueta="Días trabajados" valor={String(r.diasTrabajados ?? 0)} />
            <Numero etiqueta="Tardanza" valor={fmtMin(Number(r.minutosTarde ?? 0))}
              ojo={Number(r.minutosTarde ?? 0) > 0} />
            <Numero etiqueta="Faltas sin justificar" valor={String(r.ausenciasSinJustificar ?? 0)}
              ojo={Number(r.ausenciasSinJustificar ?? 0) > 0} />
            <Numero etiqueta="Horas extra" valor={fmtMin(Number(r.extraMin ?? 0))} />
          </dl>

          <Link
            href={`/asistencia?tab=asistencia&desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(codigo)}`}
            className="mt-3 inline-flex min-h-[44px] items-center text-sm text-gray-500 transition hover:text-gray-900"
          >
            Ver sus días ›
          </Link>
        </>
      )}
    </Seccion>
  );
}

function Numero({ etiqueta, valor, ojo }: { etiqueta: string; valor: string; ojo?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-gray-400">{etiqueta}</dt>
      <dd className={`text-sm tabular-nums ${ojo ? "text-amber-800" : "text-gray-900"}`}>{valor}</dd>
    </div>
  );
}
