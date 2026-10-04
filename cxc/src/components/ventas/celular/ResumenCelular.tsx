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
import { RESUMEN_MES_2026_10, cifrasDelMes, delPeriodo, mesValido, rotuloDelPeriodo } from "@/lib/ventas/resumen-mes";

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
  /** «Actualizado 9:41 ↻» (`FRESCURA_VISIBLE_2026_10`), pegado a «Datos al …». */
  frescura?: React.ReactNode;
  /** 🔴 RESUMEN_MES_2026_10: el mes de la URL (`?mes=`). Vacío o «0» = todo el año. */
  mes?: string;
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
  frescura,
  mes: mesRaw,
}: Props) {
  if (RESUMEN_MES_2026_10) {
    return (
      <ResumenCelularPorPeriodo
        data={data}
        selectedYear={selectedYear}
        isClosedYear={isClosedYear}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenEmpresa={onOpenEmpresa}
        multiMayoreoNota={multiMayoreoNota}
        accion={accion}
        frescura={frescura}
        mes={mesRaw}
      />
    );
  }
  return (
    <ResumenCelularDeSiempre
      data={data}
      selectedYear={selectedYear}
      isClosedYear={isClosedYear}
      viewMode={viewMode}
      setViewMode={setViewMode}
      onOpenEmpresa={onOpenEmpresa}
      multiMayoreoNota={multiMayoreoNota}
      accion={accion}
      frescura={frescura}
    />
  );
}

function ResumenCelularDeSiempre({
  data,
  selectedYear,
  isClosedYear,
  viewMode,
  setViewMode,
  onOpenEmpresa,
  multiMayoreoNota,
  accion,
  frescura,
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
        rotulo: "Proyección",
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
        enLaBarra
        detalleEnLaBarra={conFrescura(data.fecha_corte ? `Datos al ${diaCorto(data.fecha_corte)}` : "", frescura)}
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
        ariaLabel="Indicador"
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

      {/* 4-oct-2026: el «Toca una empresa para ver mes por mes» se fue (Daniel:
          «quítame estos mensajes que no son necesarios»). */}
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

// ── 🔴 RESUMEN_MES_2026_10 · UNA COLUMNA DE PERÍODO (2-oct-2026) ─────────────
// Daniel: «aquí sería bueno ver un mes específico». El período lo elige el
// selector de Comisiones (lo dibuja `VentasShell`); acá la tabla queda en UNA
// columna —Empresa · Ventas · % contra el mismo período de hace un año— y cabe
// en 390 px sin deslizarse de lado. Se fue la columna «Oct en curso»: el mes en
// curso se ve eligiéndolo. Ver `lib/ventas/resumen-mes.ts`.
function ResumenCelularPorPeriodo({
  data,
  selectedYear,
  isClosedYear,
  viewMode,
  setViewMode,
  onOpenEmpresa,
  multiMayoreoNota,
  accion,
  frescura,
  mes: mesRaw,
}: Props) {
  const anioPrevio = selectedYear - 1;
  const mes = mesValido(mesRaw, data.mesActual, !isClosedYear);
  const nombrePeriodo = rotuloDelPeriodo(selectedYear, mes);

  const filas = useMemo(
    () =>
      data.empresas.map((e: EmpresaMonthlySales) => {
        const act = viewMode === "utilidad" ? e.utilidad2026 : e.ventas2026;
        const prev = viewMode === "utilidad" ? e.utilidad2025 : e.ventas2025;
        return {
          id: e.empresa.id,
          nombre: nombreEmpresaEnPantalla(e.empresa.id, e.empresa.nombre),
          valor: delPeriodo(act, mes),
          previo: delPeriodo(prev, mes),
        };
      }),
    [data.empresas, viewMode, mes],
  );
  const total = filas.reduce((s, f) => s + f.valor, 0);
  const totalPrevio = filas.reduce((s, f) => s + f.previo, 0);
  const pctTotal = porcentajeDeLaTabla(variacionPct(total, totalPrevio));

  // Las cifras de arriba siguen al período. «Todo el año» = `data.kpis` tal cual.
  const k = data.kpis;
  const proy = mes === 0 && !isClosedYear && data.proyeccion ? data.proyeccion : null;
  const numeros = useMemo<NumeroDeLaTiraVista[]>(() => {
    const c =
      mes > 0
        ? cifrasDelMes(data.empresas, mes)
        : {
            ventas: k.ventasNetasYTD, ventasPrevio: k.ventas2025YTD,
            utilidad: k.utilidadYTD, utilidadPrevio: k.utilidad2025YTD,
            margen: k.margenYTD, margenPrevio: k.margen2025YTD,
          };
    const dVentas = variacionPct(c.ventas, c.ventasPrevio);
    const dUtilidad = variacionPct(c.utilidad, c.utilidadPrevio);
    const puntos = (c.margen - c.margenPrevio) * 100;
    const salida: NumeroDeLaTiraVista[] = [
      { rotulo: "Ventas", valor: cifraDeLaTira(c.ventas), cambio: cambioDeLaTira(dVentas), signo: dVentas },
      { rotulo: "Utilidad", valor: cifraDeLaTira(c.utilidad), cambio: cambioDeLaTira(dUtilidad), signo: dUtilidad },
      {
        rotulo: "Margen",
        valor: fmtPorcentaje(c.margen),
        cambio: `${puntos >= 0 ? "▲ +" : "▼ −"}${Math.abs(puntos).toFixed(1)}`,
        signo: puntos,
      },
    ];
    if (proy) {
      const delta = proy.totales_grupo.delta_vs_anio_anterior_total ?? null;
      salida.push({
        rotulo: "Proyección",
        valor: cifraDeLaTira(proy.totales_grupo.proyeccion_cierre),
        cambio: delta == null ? null : `${delta >= 0 ? "+" : "−"}${cifraDeLaTira(Math.abs(delta))}`,
        signo: delta,
      });
    }
    return salida;
  }, [k, proy, mes, data.empresas]);

  const th = "py-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-gray-500";
  return (
    <PantallaVentas>
      <TituloVentas
        enLaBarra
        detalleEnLaBarra={conFrescura(data.fecha_corte ? `Datos al ${diaCorto(data.fecha_corte)}` : "", frescura)}
        titulo="Ventas"
        detalle={`${nombrePeriodo}${data.fecha_corte ? ` · al ${diaCorto(data.fecha_corte)}` : ""}`}
        accion={accion}
      />

      <TiraDeCuatro numeros={numeros} />

      <Segmentado opciones={MODO_OPCIONES} activo={viewMode} onChange={setViewMode} ariaLabel="Indicador" />

      <GrupoVentas className="px-0 py-1">
        <table data-tabla-empresas className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col />
            <col className="w-[42%]" />
            <col className="w-[22%]" />
          </colgroup>
          <thead>
            <tr>
              <th className={`px-3 text-left ${th}`}>Empresa</th>
              <th className={`px-1.5 text-right ${th}`}>{viewMode === "utilidad" ? "Utilidad" : "Ventas"}</th>
              <th className={`pl-1 pr-3 text-right ${th}`}>vs {anioPrevio}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const p = porcentajeDeLaTabla(variacionPct(f.valor, f.previo));
              return (
                <tr
                  key={f.id}
                  data-fila-empresa={f.id}
                  onClick={() => onOpenEmpresa(f.id)}
                  className="border-t border-gray-100 active:bg-gray-50"
                >
                  <th scope="row" className="truncate px-3 py-2.5 text-left font-semibold text-gray-900">
                    {f.nombre}
                  </th>
                  <td className="px-1.5 py-2.5 text-right tabular-nums text-gray-900">{montoDeLaTabla(f.valor)}</td>
                  <td className={`whitespace-nowrap pl-1 pr-3 py-2.5 text-right text-[12px] ${colorDelTono(p.tono)}`}>{p.texto}</td>
                </tr>
              );
            })}
            <tr data-total-grupo className="border-t-2 border-gray-900">
              <th scope="row" className="truncate px-3 py-2.5 text-left font-bold text-gray-900">Total grupo</th>
              <td className="px-1.5 py-2.5 text-right font-bold tabular-nums text-gray-900">{montoDeLaTabla(total)}</td>
              <td className={`whitespace-nowrap pl-1 pr-3 py-2.5 text-right text-[12px] font-semibold ${colorDelTono(pctTotal.tono)}`}>
                {pctTotal.texto}
              </td>
            </tr>
          </tbody>
        </table>
      </GrupoVentas>

      {/* La nota de mayoreo es del AÑO (no hay dato por mes): con un mes elegido no sale. */}
      {mes === 0 && multiMayoreoNota && (
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
/** La línea gris con «· Actualizado 9:41 ↻» al final, si la hay. */
function conFrescura(texto: string, frescura: React.ReactNode): React.ReactNode {
  if (!frescura) return texto;
  return <>{texto}{texto && " · "}{frescura}</>;
}

function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = MONTHS[Number(m[2]) - 1] ?? "";
  return `${Number(m[3])} ${mes.toLowerCase()}`;
}
