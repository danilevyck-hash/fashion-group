"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CELULAR › al abrir: UN NÚMERO Y CUATRO RENGLONES (24-sep-2026).
//
// El mes es el número. Debajo, el día por día como barras chicas sin ejes, la
// línea de hábitos que ya existía, y los cuatro renglones que reemplazan a las
// cuatro pestañas. Cada renglón abre su pantalla.
//
// 🔴 NINGÚN NÚMERO SE RECALCULA: `data` y `overview` son los MISMOS que dibujan
// las tarjetas de computadora, unos centímetros más arriba en el mismo árbol.
// Los renglones de Vendedoras, Productos y Clientes leen las MISMAS claves de
// SWR que sus pestañas, así que tocarlos abre una pantalla ya cargada.
//
// ⚠️ Vive dentro de `MultifashionResumenView` a propósito: ahí ya está pedido
// el detalle del mes, y una segunda petición para la misma pantalla sería la
// forma más fácil de que dos números del mismo día no coincidan.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import useSWR from "swr";
import type { Multifashion } from "@/components/ventas/types";
import { variacionPct } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { conteoPorChip } from "@/lib/multifashion/clientes-seguimiento";
import type { ClienteUniverso } from "@/lib/multifashion/clientes-universo";
import { lineaHabitos } from "@/lib/multifashion/resumen-minimo";
import {
  barrasDelMes, lineaDelMes, montoCorto, renglonesDelInicio,
  type ClaveRenglon, type RenglonCelular, type TonoCelular,
} from "@/lib/multifashion/celular";
import type { CortePeriodo, Periodo } from "@/lib/multifashion/periodo";
import type { DetalleMensualResp } from "../MultifashionResumenView";

export const TONO_CLASE: Record<TonoCelular, string> = {
  sube: "text-emerald-700",
  baja: "text-red-600",
  neutro: "text-gray-500",
};

// Hora pico 0-23 → «5–6 pm». Misma regla que el Resumen de computadora.
function horaPicoLabel(h: number): string {
  const end = (h + 1) % 24;
  const hr = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const per = (x: number) => (x < 12 ? "am" : "pm");
  return per(h) === per(end) ? `${hr(h)}–${hr(end)} ${per(h)}` : `${hr(h)} ${per(h)}–${hr(end)} ${per(end)}`;
}

const json = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

interface VendedorasResumen {
  total_vendedoras_periodo: number;
  ventas_total: number;
  tickets_total: number;
}
interface ProductosResumen {
  ranking: { totales: { unidades: number; utilidad: number; margen: number | null } };
}
interface FidelizacionResumen {
  cards: { frecuentes: number };
  clientes: ClienteUniverso[];
}

interface Props {
  data: DetalleMensualResp;
  overview: Multifashion;
  periodo: Periodo;
  corte: CortePeriodo;
  /** Abre uno de los cuatro renglones. */
  onAbrir: (clave: ClaveRenglon) => void;
}

export function InicioCelular({ data, overview, periodo, corte, onAbrir }: Props) {
  const { totales } = data;
  const year = periodo.tipo === "mes" ? periodo.anio : corte.anio;
  const mes = periodo.tipo === "mes" ? periodo.mes : corte.mes;

  // ── El número grande y su línea ───────────────────────────────────────────
  const deltaYoy = data.yoy.tiene_data ? variacionPct(totales.ventas, data.yoy.ventas) : null;
  const cierra = data.is_mes_actual ? totales.proyeccion_cierre : null;
  const linea = lineaDelMes({ periodo, deltaAnioPasado: deltaYoy, cierraEn: cierra });

  // ── Las barras del día por día ────────────────────────────────────────────
  const barras = useMemo(
    () => barrasDelMes({ dias: data.dias, esMesActual: data.is_mes_actual, diaActual: data.dia_actual }),
    [data.dias, data.is_mes_actual, data.dia_actual],
  );

  // ── Los hábitos: la MISMA línea del Resumen de computadora ────────────────
  const patrones = data.patrones;
  const hayVentana = patrones != null && patrones.mesesUsados > 0;
  const habitos = totales.n_tickets > 0
    ? lineaHabitos({
        mejorDow: hayVentana ? patrones!.mejorDow : null,
        horaPico: hayVentana && patrones!.horaPico != null ? horaPicoLabel(patrones!.horaPico) : null,
        mejorDia: data.mejor_dia,
      })
    : null;

  // ── Los cuatro renglones. MISMAS claves de SWR que cada pestaña ───────────
  const { data: vend } = useSWR<VendedorasResumen>(
    `/api/multifashion/vendedoras?year=${year}&periodo=mes&mes=${mes}`,
    json,
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const { data: prod } = useSWR<ProductosResumen>(
    `/api/multifashion/productos?year=${year}&mes=${mes}&periodo=mes`,
    json,
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const { data: fidel } = useSWR<FidelizacionResumen>(
    "multifashion-fidelizacion",
    () => json("/api/multifashion/fidelizacion"),
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const proy = overview.proyeccionCierre;
  const renglones = renglonesDelInicio({
    anioDelPeriodo: year,
    anio: {
      anio: year,
      ventas: overview.retail.ytdVentas,
      cierra: proy.tiene_proyeccion ? (proy.proyeccion ?? null) : null,
      delta: proy.tiene_proyeccion ? variacionPct(proy.proyeccion ?? 0, proy.cierre_prev) : null,
    },
    vendedoras: vend
      ? { cuantas: vend.total_vendedoras_periodo, tiquetes: vend.tickets_total, ventas: vend.ventas_total }
      : null,
    productos: prod
      ? {
          piezas: prod.ranking.totales.unidades,
          deja: prod.ranking.totales.utilidad,
          margen: prod.ranking.totales.margen,
        }
      : null,
    clientes: fidel
      ? { frecuentes: fidel.cards.frecuentes, noVuelven: conteoPorChip(fidel.clientes).no_vuelven }
      : null,
  });

  return (
    <section data-celular="inicio" className="pb-8">
      {/* El mes, como número. */}
      <p data-celular="numero-del-mes" className="text-center text-[52px] font-light leading-none tracking-tight tabular-nums text-gray-950">
        {montoCorto(totales.ventas)}
      </p>
      <p data-celular="linea-del-mes" className="mt-2 text-center text-sm text-gray-600">
        {linea.delta && (
          <span className={cn("font-medium", TONO_CLASE[linea.delta.tono])}>{linea.delta.texto}</span>
        )}
        {linea.delta && linea.contra && " "}
        {linea.contra}
        {(linea.delta || linea.contra) && linea.cierra && " · "}
        {linea.cierra && <span className="text-gray-900">{linea.cierra}</span>}
      </p>

      {/* El día por día, sin ejes. */}
      <div
        data-celular="barras"
        role="img"
        aria-label="Ventas día por día del mes"
        className="mt-5 flex h-[74px] items-end gap-[2px]"
      >
        {barras.map((b) => (
          <span
            key={b.dia}
            className={cn("flex-1 rounded-t-[2px] bg-gray-900", b.futuro && "opacity-20")}
            style={{ height: `${Math.max(3, Math.round(b.alto * 100))}%` }}
          />
        ))}
      </div>
      {habitos && (
        <p data-celular="habitos" className="mt-2 text-sm text-gray-500">{habitos}</p>
      )}

      {/* Los cuatro renglones. */}
      <ul data-celular="renglones" className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {renglones.map((r) => (
          <RenglonFila key={r.clave} renglon={r} onAbrir={() => onAbrir(r.clave)} />
        ))}
      </ul>
    </section>
  );
}

function RenglonFila({ renglon, onAbrir }: { renglon: RenglonCelular; onAbrir: () => void }) {
  return (
    <li className="border-t border-gray-200 first:border-t-0">
      <button
        type="button"
        data-renglon={renglon.clave}
        onClick={onAbrir}
        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-gray-950">{renglon.titulo}</span>
          {renglon.detalle && (
            <span className="mt-0.5 block text-sm text-gray-500 tabular-nums">{renglon.detalle}</span>
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5 text-base tabular-nums text-gray-950">
          {renglon.monto}
          {renglon.delta && (
            <span className={cn("text-sm font-medium", TONO_CLASE[renglon.delta.tono])}>{renglon.delta.texto}</span>
          )}
          <span aria-hidden className="text-gray-400">›</span>
        </span>
      </button>
    </li>
  );
}

/**
 * La pantalla del renglón «Año»: la tarjeta del año y el acumulado que YA
 * existen, tal cual. No se dibuja un año nuevo.
 */
export function AnioCelular({ tarjeta, acumulado }: { tarjeta: ReactNode; acumulado: ReactNode }) {
  return (
    <section data-celular="anio" className="space-y-4 pb-8">
      {tarjeta}
      {acumulado}
    </section>
  );
}
