"use client";

// El período de Ventas › Productos con PRODUCTOS_FILTROS_2026_10:
// ‹ Oct 2026 › · Rango — el MISMO selector simple de Multifashion
// (CALENDARIO_SIMPLE_2026_10: panel de meses + «Rango» al lado, sin futuro).
// Vive en la URL (`?prPeriodo=`) y abre en el mes en curso de Panamá.

import { useMemo } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hoyPanama } from "@/lib/fecha-panama";
import { PeriodoSelect } from "@/components/multifashion/PeriodoSelect";
import RangoFechas from "@/components/ui/RangoFechas";
import {
  mesDelPeriodo,
  mesVecino,
  opcionesPeriodo,
  periodoAUrl,
  periodoDesdeUrl,
  VALOR_RANGO,
  type Periodo,
} from "@/lib/multifashion/periodo";

/** Primer año con datos de artículos en Ventas (2022 y 2023 se sirven). */
const PRIMER_ANIO = 2023;

/** Las dos fechas de un período, sin pasar de hoy. */
export function ventanaDelPeriodo(p: Periodo, hoy: string): { desde: string; hasta: string } {
  const tope = (f: string) => (f < hoy ? f : hoy);
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (p.tipo === "rango") return { desde: p.desde, hasta: tope(p.hasta) };
  if (p.tipo === "anio") return { desde: `${p.anio}-01-01`, hasta: tope(`${p.anio}-12-31`) };
  if (p.tipo === "mes") {
    const fin = new Date(Date.UTC(p.anio, p.mes, 0)).toISOString().slice(0, 10);
    return { desde: `${p.anio}-${p2(p.mes)}-01`, hasta: tope(fin) };
  }
  const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  return { desde: new Date(Date.UTC(a, m - p.n, 1)).toISOString().slice(0, 10), hasta: hoy };
}

export function usePeriodoProductos(disabled: boolean) {
  const hoy = hoyPanama();
  const corte = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  const [raw, setRaw] = useUrlState("prPeriodo", "");
  const periodo: Periodo = periodoDesdeUrl(raw) ?? { tipo: "mes", ...corte };
  const opciones = useMemo(() => {
    const anios: number[] = [];
    for (let a = corte.anio; a >= PRIMER_ANIO; a--) anios.push(a);
    return opcionesPeriodo({ tab: "vendedoras", anios, corte }).filter(o => o.valor !== VALOR_RANGO);
  }, [corte.anio, corte.mes]); // eslint-disable-line react-hooks/exhaustive-deps
  const { desde, hasta } = ventanaDelPeriodo(periodo, hoy);

  const mesDelRango: Periodo | null = periodo.tipo === "rango" ? { tipo: "mes", ...mesDelPeriodo(periodo, corte) } : null;
  const botonRango = (
    <RangoFechas
      enBarra
      sinFuturo
      desde={periodo.tipo === "rango" ? periodo.desde : ""}
      hasta={periodo.tipo === "rango" ? periodo.hasta : ""}
      vacio={periodo.tipo !== "rango"}
      label={null}
      diasDeAsistencia={false}
      onChange={(d, h) => setRaw(periodoAUrl({ tipo: "rango", desde: d, hasta: h }))}
      onQuitar={() => mesDelRango && setRaw(periodoAUrl(mesDelRango))}
    />
  );
  const selector = (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" data-selector-periodo-productos>
      {mesDelRango ? botonRango : (
        <>
          <PeriodoSelect
            valor={periodoAUrl(periodo)}
            opciones={opciones}
            onChange={setRaw}
            disabled={disabled}
            anterior={mesVecino(periodo, -1, opciones)}
            siguiente={mesVecino(periodo, 1, opciones)}
            compacto
          />
          {botonRango}
        </>
      )}
    </div>
  );
  return { desde, hasta, selector };
}
