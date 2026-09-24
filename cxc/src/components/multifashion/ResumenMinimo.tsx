"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › RESUMEN MÍNIMO (23-sep-2026, mockup aprobado) — 11 → 6.
//
// Detrás de `RETAIL_AL_FRENTE`. Lo que queda, en este orden:
//   1. VENTAS DEL MES — retail, con los tiquetes y el promedio ADENTRO («658
//      tiquetes · $48.38 promedio») y los dos comparativos en una línea, con UN
//      solo redondeo (`fmtDeltaRetail`). 🩸 La tarjeta TICKETS suelta se fue:
//      el promedio era ventas ÷ tiquetes y el conteo ya estaba en HOY.
//   2. CIERRA EN — por TEMPORADA, la MISMA cuenta de la meta (ver
//      `resumen-minimo.ts`); dice sobre cuántos días está hecha.
//   3. AÑO — retail, «▲ +15.7% vs 2025» (retail contra retail; era +8 % por
//      leer 2025 de la tabla vieja), «cierra en $X · margen 33%» y, chiquita,
//      la línea del mayoreo: «+ $28,365.90 de mayoreo (5 facturas) · entró
//      $418,486.51». Solo cuando lo hubo. Igual en la tarjeta del mes.
//   4. El gráfico día por día (Mes/Año), con «¿la tienda abrió?» en la
//      leyenda cuando un día hábil quedó en $0 y no es feriado.
//   5. Los hábitos en UNA línea (día fuerte · hora pico · mejor día del mes).
//      🩸 «Peor día» se fue: un día flojo no decide nada.
//   6. «Ver mes a mes ▾», plegado: la tabla de 13 filas es el gráfico en modo
//      «Año» dibujado con números; sigue entera, pero cerrada.
//
// 🔴 NINGÚN NÚMERO RETAIL CAMBIA: son los mismos `data` y `overview` de
// siempre. Lo único que cambia de valor son los % que estaban MAL por la tabla
// vieja (año, abril) — y eso lo arregla la RPC, no esta pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Multifashion } from "@/components/ventas/types";
import { fmtMoney } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { fmtDeltaRetail, lineaMayoreo, tonoDeltaRetail } from "@/lib/multifashion/retail-al-frente";
import {
  comparativosDelMes, lineaHabitos, mayoreoDelAnio, mayoreoDelMes,
} from "@/lib/multifashion/resumen-minimo";
import type { DetalleMensualResp } from "./MultifashionResumenView";

const TONO: Record<ReturnType<typeof tonoDeltaRetail>, string> = {
  sube: "text-emerald-700",
  baja: "text-red-700",
  neutro: "text-gray-500",
};

function fmtMargen(margen: number | null): string {
  return typeof margen === "number" && Number.isFinite(margen) ? `${(margen * 100).toFixed(0)}%` : "—";
}

// Hora pico 0-23 → «5–6 pm».
function horaPicoLabel(h: number): string {
  const end = (h + 1) % 24;
  const hr = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const per = (x: number) => (x < 12 ? "am" : "pm");
  return per(h) === per(end) ? `${hr(h)}–${hr(end)} ${per(h)}` : `${hr(h)} ${per(h)}–${hr(end)} ${per(end)}`;
}

interface Props {
  data: DetalleMensualResp;
  overview: Multifashion;
  year: number;
  mes: number;
  isClosedYear: boolean;
  /** El gráfico Mes/Año de siempre, ya armado por quien tiene la serie. */
  grafico: ReactNode;
  /** La tabla «Mes a mes» de siempre, que aquí vive PLEGADA. */
  mesAMes: ReactNode;
}

export function ResumenMinimo({ data, overview, year, mes, isClosedYear, grafico, mesAMes }: Props) {
  const [mesAMesAbierto, setMesAMesAbierto] = useState(false);
  const { totales, is_mes_actual } = data;

  // ── Tarjeta 1: el mes ──────────────────────────────────────────────────────
  const comparativos = comparativosDelMes({
    ventas: totales.ventas, yoy: data.yoy, mesAnterior: data.mes_anterior, year, mes,
  });
  const dYoy = data.yoy.tiene_data ? variacionPct(totales.ventas, data.yoy.ventas) : null;
  const dMom = data.mes_anterior.tiene_data ? variacionPct(totales.ventas, data.mes_anterior.ventas) : null;
  const notaMes = lineaMayoreo(mayoreoDelMes(overview.wholesale.meses, mes, totales.ventas));

  // ── Tarjeta 2: cierra en (mes en curso) · margen tienda (mes cerrado) ──────
  const hayProyeccion = is_mes_actual && totales.proyeccion_cierre != null;
  const dias = totales.proyeccion_dias ?? null;
  const hayMargen = typeof totales.margen === "number" && Number.isFinite(totales.margen);

  // ── Los hábitos, en una línea ─────────────────────────────────────────────
  const patrones = data.patrones;
  const hayVentana = patrones != null && patrones.mesesUsados > 0;
  const habitos = totales.n_tickets > 0
    ? lineaHabitos({
        mejorDow: hayVentana ? patrones!.mejorDow : null,
        horaPico: hayVentana && patrones!.horaPico != null ? horaPicoLabel(patrones!.horaPico) : null,
        mejorDia: data.mejor_dia,
      })
    : null;

  return (
    <div className="space-y-5" data-pestana="resumen-minimo">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 1 · Ventas del mes */}
        <Card data-elemento="ventas-del-mes" className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Ventas del mes</p>
          <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
            {fmtMoney(totales.ventas)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums">{totales.n_tickets.toLocaleString()}</span> tiquetes ·{" "}
            <span className="font-mono tabular-nums">${totales.ticket_promedio.toFixed(2)}</span> promedio
          </p>
          <p className="mt-2 border-t border-gray-100 pt-2 text-xs">
            <span className={cn("font-mono font-medium tabular-nums", TONO[tonoDeltaRetail(dYoy)])}>{comparativos.yoy}</span>
            <span className="text-gray-400"> · </span>
            <span className={cn("font-mono font-medium tabular-nums", TONO[tonoDeltaRetail(dMom)])}>{comparativos.mom}</span>
          </p>
          {notaMes && <p data-linea-mayoreo className="mt-1.5 text-xs text-gray-400">{notaMes}</p>}
        </Card>

        {/* 2 · Cierra en (por temporada) / Margen tienda del mes cerrado */}
        <Card data-elemento="cierra-en" className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {hayProyeccion ? "Cierra en" : "Margen tienda"}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
            {hayProyeccion
              ? fmtMoney(totales.proyeccion_cierre as number)
              : hayMargen ? fmtMargen(totales.margen) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {hayProyeccion
              ? (dias != null && dias > 0 ? `por temporada, con ${dias} ${dias === 1 ? "día" : "días"}` : "por temporada")
              : is_mes_actual
                ? "todavía es muy pronto para proyectar"
                : hayMargen ? "del mes, tienda completa" : "sin costo disponible"}
          </p>
        </Card>

        {/* 3 · El año, retail contra retail */}
        <TarjetaAnio overview={overview} year={year} isClosedYear={isClosedYear} />
      </div>

      {/* 4 · El gráfico */}
      <div data-elemento="grafico">{grafico}</div>

      {/* 5 · Los hábitos, una línea · 6 · «Ver mes a mes», plegado */}
      <div data-elemento="habitos" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{habitos ?? ""}</span>
        <button
          type="button"
          data-elemento="ver-mes-a-mes"
          onClick={() => setMesAMesAbierto((v) => !v)}
          aria-expanded={mesAMesAbierto}
          className="inline-flex min-h-[44px] items-center gap-1 font-medium text-gray-700 hover:text-gray-950"
        >
          Ver mes a mes <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", mesAMesAbierto && "rotate-180")} />
        </button>
      </div>
      {mesAMesAbierto && <div data-plegado="mes-a-mes">{mesAMes}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DEL AÑO — retail contra retail.
//
// Se extrajo el 24-sep-2026 para que el celular pueda dibujar LA MISMA tarjeta
// en la pantalla del renglón «Año» (`AnioCelular`). Ni una clase ni un número
// cambiaron: es el mismo JSX que estaba acá adentro.
// ─────────────────────────────────────────────────────────────────────────────
export function TarjetaAnio({
  overview, year, isClosedYear,
}: {
  overview: Multifashion;
  year: number;
  isClosedYear: boolean;
}) {
  const proy = overview.proyeccionCierre;
  const deltaAnio = proy.tiene_proyeccion ? variacionPct(proy.proyeccion ?? 0, proy.cierre_prev) : null;
  const notaAnio = lineaMayoreo(mayoreoDelAnio(overview.wholesale, overview.retail.ytdVentas));
  const acumulado = overview.serieActual.dias.length
    ? overview.serieActual.dias[overview.serieActual.dias.length - 1].acumulado
    : 0;

  return (
      <Card data-elemento="anio" className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Año {year} · retail</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
            {fmtMoney(overview.retail.ytdVentas)}
          </span>
          {deltaAnio != null && (
            <span className={cn("font-mono text-sm font-medium tabular-nums", TONO[tonoDeltaRetail(deltaAnio)])}>
              {fmtDeltaRetail(deltaAnio)} vs {year - 1}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {proy.tiene_proyeccion ? (
            <>cierra en <span className="font-mono tabular-nums text-gray-700">{fmtMoney(proy.proyeccion ?? 0)}</span></>
          ) : (
            <>acumulado <span className="font-mono tabular-nums text-gray-700">{fmtMoney(acumulado)}</span>{isClosedYear ? ` de ${year}` : ""}</>
          )}
          {" · "}margen <span className="font-mono tabular-nums text-gray-700">{fmtMargen(overview.total.margen)}</span>
        </p>
        {notaAnio && <p data-linea-mayoreo className="mt-1.5 text-xs text-gray-400">{notaAnio}</p>}
      </Card>
  );
}
