"use client";

// ============================================================================
// VENTAS › RESUMEN EN EL CELULAR — la «1b» y la «2a» (25-sep-2026).
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 a 390 px:
//   · el primer número llegaba a **y=296** (el 35 % del pantallazo) con
//     **6 cosas tocables** antes;
//   · **$7.069.116,31 se decía DOS veces** —en la tarjeta VENTAS (y=295) y en
//     la fila «TOTAL GRUPO» (y=1.231)—: los únicos dos montos repetidos de los
//     21 que se veían;
//   · las nueve filas medían **65, 78 y 112 px** —tres altos en una lista—
//     porque «SEP EN CURSO $185,760 +4%» bajaba a dos líneas y Multifashion
//     llevaba encima «incluye $28.365,90 de mayoreo · 5 facturas»;
//   · «Actualizar ahora» y «Descargar en Excel» estaban al aire, para **3
//     descargas en 7 días** y **2 usos del botón de actualizar en 90 días**.
//
// 🔴 NINGÚN NÚMERO CAMBIA. Las cifras salen de `data.kpis` y de
// `data.empresas`, exactamente las mismas que dibuja la matriz de la
// computadora. Acá no hay una sola división nueva: lo único que se decide es
// cuántos dígitos se enseñan, y el EXACTO con centavos vive al pie, en «Total
// grupo», donde siempre estuvo.
// ============================================================================

import { useMemo, useState } from "react";
import type { VentasResumen, EmpresaMonthlySales } from "../types";
import { MONTHS, fmtMoney, fmtPorcentaje } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import {
  cambioDeLaTira,
  cifraDeLaTira,
  montoDeLaTabla,
  porcentajeDeLaTabla,
} from "@/lib/ventas/celular";
import {
  ESTILO_COLCHON_DERECHA,
  GrupoVentas,
  PantallaVentas,
  RotuloVentas,
  Segmentado,
  TiraDeCuatro,
  TituloVentas,
  colorDelTono,
  type NumeroDeLaTiraVista,
} from "./PiezasVentas";
import { MODO_OPCIONES, nombreEmpresaEnPantalla, type ViewMode } from "../ResumenView";

interface Props {
  data: VentasResumen;
  selectedYear: number;
  isClosedYear: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  /** Abre el panel mes × año de una empresa (lo dibuja `ResumenView`). */
  onOpenEmpresa: (id: string) => void;
  /** Nota de mayoreo de Multifashion, ya redactada por `buildNotaMayoreo`. */
  multiMayoreoNota?: string | null;
  /** El «···» de arriba: «Descargar» y «Actualizar ahora». */
  accion?: React.ReactNode;
}

function suma(serie: (number | null)[]): number {
  return serie.reduce<number>((s, v) => s + (v ?? 0), 0);
}

interface FilaEmpresa {
  id: string;
  nombre: string;
  anio: number;
  anioPrevio: number;
  mes: number | null;
  mesPrevio: number | null;
}

export function ResumenCelular({
  data,
  selectedYear,
  isClosedYear,
  viewMode,
  setViewMode,
  onOpenEmpresa,
  multiMayoreoNota,
  accion,
}: Props) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const anioPrevio = selectedYear - 1;
  // 🔴 El mes en curso es el que dice el servidor; en un año cerrado no hay.
  const idxMes = isClosedYear || data.mesActual === 0 ? -1 : data.mesActual - 1;
  const rotuloMes = idxMes >= 0 ? `${MONTHS[idxMes]} en curso` : null;

  const filas = useMemo<FilaEmpresa[]>(
    () =>
      data.empresas.map((e: EmpresaMonthlySales) => {
        const act = viewMode === "utilidad" ? e.utilidad2026 : e.ventas2026;
        const prev = viewMode === "utilidad" ? e.utilidad2025 : e.ventas2025;
        return {
          id: e.empresa.id,
          nombre: nombreEmpresaEnPantalla(e.empresa.id, e.empresa.nombre),
          anio: suma(act),
          anioPrevio: suma(prev),
          mes: idxMes >= 0 ? (act[idxMes] ?? 0) : null,
          mesPrevio: idxMes >= 0 ? (prev[idxMes] ?? null) : null,
        };
      }),
    [data.empresas, viewMode, idxMes],
  );

  const totalAnio = filas.reduce((s, f) => s + f.anio, 0);
  const totalAnioPrevio = filas.reduce((s, f) => s + f.anioPrevio, 0);
  const totalMes = idxMes >= 0 ? filas.reduce((s, f) => s + (f.mes ?? 0), 0) : null;
  const totalMesPrevio = idxMes >= 0 ? filas.reduce((s, f) => s + (f.mesPrevio ?? 0), 0) : null;

  // ── 1b · los cuatro números en una línea ───────────────────────────────────
  const k = data.kpis;
  const proy = !isClosedYear && data.proyeccion ? data.proyeccion : null;
  const numeros = useMemo<NumeroDeLaTiraVista[]>(() => {
    const dVentas = variacionPct(k.ventasNetasYTD, k.ventas2025YTD);
    const dUtilidad = variacionPct(k.utilidadYTD, k.utilidad2025YTD);
    const puntos = (k.margenYTD - k.margen2025YTD) * 100;
    const salida: NumeroDeLaTiraVista[] = [
      { rotulo: "Ventas", valor: cifraDeLaTira(k.ventasNetasYTD), cambio: cambioDeLaTira(dVentas), signo: dVentas },
      { rotulo: "Utilidad", valor: cifraDeLaTira(k.utilidadYTD), cambio: cambioDeLaTira(dUtilidad), signo: dUtilidad },
      {
        rotulo: "Margen",
        valor: fmtPorcentaje(k.margenYTD),
        // Los PUNTOS conservan su decimal: son una diferencia, no un %.
        cambio: `${puntos >= 0 ? "▲ +" : "▼ −"}${Math.abs(puntos).toFixed(1)}`,
        signo: puntos,
      },
    ];
    if (proy) {
      const delta = proy.totales_grupo.delta_vs_anio_anterior_total ?? null;
      salida.push({
        rotulo: "Cierra",
        // 🔴 El cierre va REDONDEADO a propósito: es una estimación, y darle
        // centavos a un número estimado lo hace parecer medido.
        valor: cifraDeLaTira(proy.totales_grupo.proyeccion_cierre),
        cambio: delta == null ? null : `${delta >= 0 ? "+" : "−"}${cifraDeLaTira(Math.abs(delta))}`,
        signo: delta,
      });
    }
    return salida;
  }, [k, proy]);

  const pctAnio = porcentajeDeLaTabla(variacionPct(totalAnio, totalAnioPrevio));
  const pctMes =
    totalMes != null ? porcentajeDeLaTabla(variacionPct(totalMes, totalMesPrevio)) : null;

  return (
    <PantallaVentas>
      <TituloVentas
        titulo="Ventas"
        detalle={`Año ${selectedYear}${data.fecha_corte ? ` · al ${diaCorto(data.fecha_corte)}` : ""}`}
        accion={accion}
      />

      {/* 1b */}
      <TiraDeCuatro numeros={numeros} />

      <Segmentado
        opciones={MODO_OPCIONES}
        activo={viewMode}
        onChange={setViewMode}
        ariaLabel="Qué mostrar"
      />

      {/* ── 2a · LA TABLA COMPACTA ────────────────────────────────────────────
          Nueve filas de UN SOLO ALTO. Se desliza de lado si el teléfono es
          angosto y el nombre de la empresa se queda fijo a la izquierda. */}
      <GrupoVentas className="px-0 py-1">
        <div data-tabla-empresas className="overflow-x-auto">
          <table className="w-full min-w-[330px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] bg-white px-2.5 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-wide text-gray-500">
                  Empresa
                </th>
                <th className="whitespace-nowrap px-1.5 py-1.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-gray-500">
                  Año {selectedYear}
                </th>
                <th className="px-1 py-1.5" />
                {rotuloMes && (
                  <>
                    <th className="whitespace-nowrap px-1.5 py-1.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-gray-500">
                      {rotuloMes}
                    </th>
                    <th className="px-1 py-1.5" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const pa = porcentajeDeLaTabla(variacionPct(f.anio, f.anioPrevio));
                const pm = f.mes != null ? porcentajeDeLaTabla(variacionPct(f.mes, f.mesPrevio)) : null;
                return (
                  <tr
                    key={f.id}
                    data-fila-empresa={f.id}
                    onClick={() => {
                      setAbierta(abierta === f.id ? null : f.id);
                      onOpenEmpresa(f.id);
                    }}
                    className="border-t border-gray-100 active:bg-gray-50"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] max-w-[112px] truncate bg-white px-2.5 py-2.5 text-left text-[13px] font-semibold text-gray-900"
                    >
                      {f.nombre}
                    </th>
                    <td className="whitespace-nowrap px-1.5 py-2.5 text-right tabular-nums text-gray-900">
                      {montoDeLaTabla(f.anio)}
                    </td>
                    <td className={`whitespace-nowrap px-1 py-2.5 text-right ${colorDelTono(pa.tono)}`}>
                      {pa.texto}
                    </td>
                    {rotuloMes && (
                      <>
                        <td className="whitespace-nowrap px-1.5 py-2.5 text-right tabular-nums text-gray-700">
                          {montoDeLaTabla(f.mes)}
                        </td>
                        <td className={`whitespace-nowrap px-1 py-2.5 text-right ${colorDelTono(pm?.tono ?? "fl")}`}>
                          {pm?.texto ?? ""}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {/* 🔴 EL TOTAL DEL GRUPO, UNA SOLA VEZ Y CON CENTAVOS. */}
              <tr data-total-grupo className="border-t-2 border-gray-900">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-white px-2.5 py-2.5 text-left text-[13px] font-bold text-gray-900"
                >
                  Total grupo
                </th>
                <td className="whitespace-nowrap px-1.5 py-2.5 text-right font-bold tabular-nums text-gray-900">
                  {fmtMoney(totalAnio)}
                </td>
                <td className={`whitespace-nowrap px-1 py-2.5 text-right font-semibold ${colorDelTono(pctAnio.tono)}`}>
                  {pctAnio.texto}
                </td>
                {rotuloMes && (
                  <>
                    <td className="whitespace-nowrap px-1.5 py-2.5 text-right font-bold tabular-nums text-gray-900">
                      {montoDeLaTabla(totalMes)}
                    </td>
                    <td className={`whitespace-nowrap px-1 py-2.5 text-right font-semibold ${colorDelTono(pctMes?.tono ?? "fl")}`}>
                      {pctMes?.texto ?? ""}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </GrupoVentas>

      {/* 🔴 EL COLCHÓN DE LA DERECHA: el botón flotante vive en esa esquina y
          esta línea es la última de la pantalla. La medida sale de
          `barra-celular.ts`, no de un número escrito acá. */}
      <p
        data-pie-resumen
        className="px-6 pt-2 text-[12.5px] text-gray-500"
        style={ESTILO_COLCHON_DERECHA}
      >
        Toca una empresa para ver mes por mes.
      </p>

      {/* 🔴 EL «INCLUYE MAYOREO» BAJA A DONDE ESTÁ SU DESGLOSE. En la lista
          hacía que la fila de Multifashion midiera 112 px y cuatro líneas. */}
      {multiMayoreoNota && (
        <>
          <RotuloVentas>Multifashion</RotuloVentas>
          <p className="px-6 text-[13px] text-gray-600" style={ESTILO_COLCHON_DERECHA}>
            {multiMayoreoNota}
          </p>
        </>
      )}
    </PantallaVentas>
  );
}

/** «24 sep» — el día del corte, corto. */
function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = MONTHS[Number(m[2]) - 1] ?? "";
  return `${Number(m[3])} ${mes.toLowerCase()}`;
}
