"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CELULAR › VENDEDORAS — una fila por vendedora, y la meta como UN renglón
// (24-sep-2026).
//
// 🩸 Medido el 24-sep en un iPhone: era la pestaña más cargada del módulo —
// **48 bloques de texto** en la primera pantalla y los montos en 16 px, con
// cuatro datos por vendedora antes de saber quién iba primero. Acá cada
// vendedora es UNA fila: el nombre, una línea gris con tienda · redes y los
// tiquetes, y a la derecha el monto con su cambio. La comisión y el tiquete
// promedio salen al TOCAR el nombre.
//
// 🔴 NINGÚN NÚMERO CAMBIA: son las filas que ya trae `multifashion_vendedoras`
// y la meta que ya trae `/api/multifashion/metas`, con el MISMO umbral de color
// (±5 %) que la tabla de computadora. Acá no se calcula nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import type { VendedoraDetalle } from "@/components/ventas/types";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { desgloseCanales } from "@/lib/multifashion/canales";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";
import {
  deltaCorto, detalleVendedora, lineaVendedora, montoCorto, renglonMeta, subtituloVendedoras,
} from "@/lib/multifashion/celular";
import { TONO_CLASE } from "./InicioCelular";

interface RespuestaMetas {
  metas: MetaConAvance[];
}

interface Props {
  vendedoras: readonly VendedoraDetalle[];
  ventasTotal: number;
  tiquetesTotal: number;
  /** «vs agosto 2026» — lo arma `vendedoras-rotulo.ts`. */
  rotuloDelta: string | null;
  anio: number;
  parcial: boolean;
  /** El renglón de la meta abre la tarjeta de metas de siempre. */
  metaAbierta: boolean;
  onAbrirMeta: () => void;
  /** `false` en la pestaña espejo de Comisiones: ahí no hay metas. */
  conMetas: boolean;
}

export function VendedorasCelular({
  vendedoras, ventasTotal, tiquetesTotal, rotuloDelta, anio, parcial, metaAbierta, onAbrirMeta, conMetas,
}: Props) {
  const [abierta, setAbierta] = useState<string | null>(null);

  // La MISMA clave que `MetasSubtab`: SWR la comparte y no hay una segunda
  // petición. Sin metas instaladas, `metas` viene vacío y no se dibuja nada.
  const { data: metas } = useSWR<RespuestaMetas>(
    conMetas ? "multifashion-metas" : null,
    async () => {
      const r = await fetch("/api/multifashion/metas", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as RespuestaMetas;
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
  );
  const meta = (metas?.metas ?? []).find((m) => m.avance.estado !== "cerrada") ?? null;

  return (
    <section data-celular="vendedoras" className="pb-4">
      <p data-celular="vendedoras-subtitulo" className="text-sm text-gray-500 tabular-nums">
        {subtituloVendedoras({ ventas: ventasTotal, tiquetes: tiquetesTotal, rotuloDelta, anio, parcial })}
      </p>

      <ul data-celular="vendedoras-lista" className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {vendedoras.map((v) => {
          const delta = deltaCorto(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
          const desglose = desgloseCanales(v.ventas, v.por_canal, v.nombre);
          const estaAbierta = abierta === v.nombre;
          return (
            <li key={v.nombre} className="border-t border-gray-200 first:border-t-0">
              <button
                type="button"
                data-vendedora={v.nombre}
                aria-expanded={estaAbierta}
                onClick={() => setAbierta(estaAbierta ? null : v.nombre)}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-gray-950">
                    {nombreEnPantalla(v.nombre)}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500 tabular-nums">
                    {lineaVendedora({
                      desglose,
                      tiquetes: v.tickets,
                      ticketPromedio: v.ticket_promedio,
                      gerente: v.manager,
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base tabular-nums text-gray-950">
                    {montoCorto(v.ventas)}
                  </span>
                  {delta && (
                    <span className={cn("block text-sm font-medium tabular-nums", TONO_CLASE[delta.tono])}>
                      {delta.texto}
                    </span>
                  )}
                </span>
              </button>
              {estaAbierta && (
                <p data-celular="vendedora-detalle" className="px-4 pb-3 text-sm text-gray-600 tabular-nums">
                  {detalleVendedora({ comision: v.comision, ticketPromedio: v.ticket_promedio })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {conMetas && meta && (
        <>
          <p className="mt-6 px-1 text-sm uppercase tracking-wide text-gray-400">Meta · {meta.nombre}</p>
          <ul className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <li>
              <button
                type="button"
                data-celular="meta-renglon"
                aria-expanded={metaAbierta}
                onClick={onAbrirMeta}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50"
              >
                <RenglonDeLaMeta meta={meta} />
              </button>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

function RenglonDeLaMeta({ meta }: { meta: MetaConAvance }) {
  const a = meta.avance;
  const r = renglonMeta({
    vendido: a.vendido,
    objetivo: a.objetivo,
    proyeccion: a.proyeccion,
    pctVendido: a.pctVendido,
    cerrada: a.estado === "cerrada",
  });
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium tabular-nums text-gray-950">{r.titulo}</span>
        {r.detalle && <span className="mt-0.5 block text-sm text-gray-500 tabular-nums">{r.detalle}</span>}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5 text-base tabular-nums text-gray-950">
        {r.pct}
        <span aria-hidden className="text-gray-400">›</span>
      </span>
    </>
  );
}
