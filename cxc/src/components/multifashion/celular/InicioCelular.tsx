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

import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import type { Multifashion } from "@/components/ventas/types";
import { variacionPct } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { conteoPorChip } from "@/lib/multifashion/clientes-seguimiento";
import type { ClienteUniverso } from "@/lib/multifashion/clientes-universo";
import { lineaHabitos, mayoreoDelAnio } from "@/lib/multifashion/resumen-minimo";
import {
  MF_DIA_2026_10, barrasDelMes, deltaCorto, lineaDelDia, lineaDelMes, montoCorto, renglonesDelInicio,
  type ClaveRenglon, type RenglonCelular, type TonoCelular,
} from "@/lib/multifashion/celular";
import type { CortePeriodo, Periodo } from "@/lib/multifashion/periodo";
import type { DetalleMensualResp } from "../MultifashionResumenView";
import { filasDelAnio } from "@/lib/multifashion/apple";
import { MULTIFASHION_GRAFICA_2026_10 } from "@/lib/multifashion/grafica-mes";
import { GraficaDelMes } from "../GraficaDelMes";
import { lineaMayoreo } from "@/lib/multifashion/retail-al-frente";

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
  /** Lo que requiere atención (`MULTIFASHION_APPLE_2026_10`), ARRIBA. */
  atencion?: ReactNode;
}

export function InicioCelular({ data, overview, periodo, corte, onAbrir, atencion = null }: Props) {
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

  // 🔴 `MF_DIA_2026_10`: el día tocado (null = el mes). Se toca la franja
  // entera —cada barra mide ~11 px— y se elige por la posición del dedo.
  const [tocado, setTocado] = useState<{ mes: string; dia: number } | null>(null);
  const mesAqui = `${year}-${mes}`;
  // Al cambiar de mes se vuelve al mes: el día tocado era de otro.
  const diaTocado = tocado && tocado.mes === mesAqui ? tocado.dia : null;
  const filaTocada = diaTocado == null ? null : data.dias.find((d) => d.dia === diaTocado) ?? null;
  const tocarBarras = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(barras.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * barras.length)));
    const b = barras[i];
    if (!b || b.futuro) return;
    setTocado(diaTocado === b.dia ? null : { mes: mesAqui, dia: b.dia });
  };

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
      {atencion && <div className="mb-4">{atencion}</div>}
      {/* El mes, como número. */}
      <p data-celular="numero-del-mes" className="text-center text-[52px] font-light leading-none tracking-tight tabular-nums text-gray-950">
        {montoCorto(totales.ventas)}
      </p>
      {filaTocada ? (
        <p data-celular="linea-del-dia" className="mt-2 text-center text-sm font-medium text-gray-950 tabular-nums">
          {lineaDelDia({ anio: year, mes, dia: filaTocada.dia, ventas: filaTocada.ventas, tickets: filaTocada.n_tickets })}
        </p>
      ) : (
      <p data-celular="linea-del-mes" className="mt-2 text-center text-sm text-gray-600">
        {linea.delta && (
          <span className={cn("font-medium", TONO_CLASE[linea.delta.tono])}>{linea.delta.texto}</span>
        )}
        {linea.delta && linea.contra && " "}
        {linea.contra}
        {(linea.delta || linea.contra) && linea.cierra && " · "}
        {linea.cierra && <span className="text-gray-900">{linea.cierra}</span>}
      </p>
      )}

      {/* El día por día, sin ejes. 🔴 `MULTIFASHION_GRAFICA_2026_10`: la gráfica
          nueva, la misma de la computadora. */}
      {MULTIFASHION_GRAFICA_2026_10 ? (
        <div className="mt-5">
          <GraficaDelMes
            dias={data.dias}
            year={year}
            mes={mes}
            esMesActual={data.is_mes_actual}
            diaActual={data.dia_actual}
            feriados={data.feriados ?? null}
          />
        </div>
      ) : (
      <div
        data-celular="barras"
        role={MF_DIA_2026_10 ? "group" : "img"}
        aria-label={MF_DIA_2026_10 ? "Ventas diarias del mes · toca un día" : "Ventas diarias del mes"}
        onClick={MF_DIA_2026_10 ? tocarBarras : undefined}
        className={cn("mt-5 flex h-[74px] items-end gap-[2px]", MF_DIA_2026_10 && "cursor-pointer")}
      >
        {barras.map((b) => (
          <span
            key={b.dia}
            data-dia={b.dia}
            className={cn(
              "flex-1 rounded-t-[2px] bg-gray-900",
              b.futuro && "opacity-20",
              diaTocado != null && !b.futuro && b.dia !== diaTocado && "opacity-30",
            )}
            style={{ height: `${Math.max(3, Math.round(b.alto * 100))}%` }}
          />
        ))}
      </div>
      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 `MULTIFASHION_APPLE_2026_10` — «Año» como el mes: UN número grande y los
// meses en renglones; tocar uno abre ese mes. Mismas cuentas que `TarjetaAnio`
// (proyección contra el cierre del año pasado) y que «Mes a mes».
// ─────────────────────────────────────────────────────────────────────────────
export function AnioGrande({ overview, year }: { overview: Multifashion; year: number }) {
  const proy = overview.proyeccionCierre;
  const delta = deltaCorto(proy.tiene_proyeccion ? variacionPct(proy.proyeccion ?? 0, proy.cierre_prev) : null);
  const margen = overview.total.margen;
  const mayoreo = lineaMayoreo(mayoreoDelAnio(overview.wholesale, overview.retail.ytdVentas));
  return (
    <div data-celular="anio-numero" className="pb-2 text-center">
      <p className="text-[52px] font-light leading-none tracking-tight tabular-nums text-gray-950">
        {montoCorto(overview.retail.ytdVentas)}
      </p>
      <p className="mt-2 text-sm text-gray-600">
        {delta && <span className={cn("font-medium", TONO_CLASE[delta.tono])}>{delta.texto}</span>}
        {delta && ` contra ${year - 1}`}
        {delta && proy.tiene_proyeccion && " · "}
        {proy.tiene_proyeccion && <span className="text-gray-900">proyección {montoCorto(proy.proyeccion ?? 0)}</span>}
      </p>
      {(margen != null || mayoreo) && (
        <p className="mt-1 text-xs text-gray-500 tabular-nums">
          {margen != null && Number.isFinite(margen) && `margen ${Math.round(margen * 100)} %`}
          {margen != null && Number.isFinite(margen) && mayoreo && " · "}
          {mayoreo}
        </p>
      )}
    </div>
  );
}

export function MesesDelAnio({ overview, year, onAbrirMes }: {
  overview: Multifashion;
  year: number;
  onAbrirMes?: (anio: number, mes: number) => void;
}) {
  const filas = filasDelAnio(overview.retail.meses);
  if (filas.length === 0) return null;
  return (
    <ul data-celular="anio-meses" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {filas.map((f) => (
        <li key={f.mes} className="border-t border-gray-200 first:border-t-0">
          <button
            type="button"
            data-mes={f.mes}
            onClick={() => onAbrirMes?.(year, f.mes)}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-gray-50"
          >
            <span className="min-w-0 flex-1 text-base text-gray-950">{f.titulo}</span>
            <span className="flex shrink-0 items-baseline gap-1.5 text-base tabular-nums text-gray-950">
              {f.monto}
              {f.delta && <span className={cn("text-sm font-medium", TONO_CLASE[f.delta.tono])}>{f.delta.texto}</span>}
              <span aria-hidden className="text-gray-400">›</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
