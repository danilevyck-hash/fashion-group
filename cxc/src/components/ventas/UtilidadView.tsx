"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ThOrden, useOrdenTabla } from "@/components/ui/OrdenTabla";
import { SkeletonTable } from "@/components/ui";
import { TiraOrden } from "./ChipOrden";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  alcanceEmpresas,
  fmtMargenPantalla,
  fmtMoneySigned,
  type UtilidadClienteResponse,
  type UtilidadClienteRow,
} from "@/lib/ventas/utilidad-cliente";
// 🔴 UNA SOLA VENTA (23-sep-2026): la venta es la del Resumen (el contado
// incluido), el cuadre se dice, el mostrador se marca y un año sin reporte de
// utilidad dice desde cuándo lo hay.
import { UNA_SOLA_VENTA, textoCuadreUtilidad, textoDatosDesde } from "@/lib/ventas/una-sola-venta";
import { montoDeLaTabla } from "@/lib/ventas/celular";

export type UtilidadSortKey = "ventas" | "utilidad" | "margen";
// 🔴 6-oct-2026: todas las columnas ordenan, con la regla común (`OrdenTabla`).
const COLUMNAS_ORDEN = ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"] as const;
type SortKey = (typeof COLUMNAS_ORDEN)[number];
const TH_ORDEN = "px-3 py-0 font-normal [&>button]:min-h-[44px] [&>button]:min-w-[44px]";

/** Criterios del selector de orden de las tarjetas. Mismas etiquetas que los
 *  encabezados de la tabla — no se abrevió ni se renombró nada. */
const ORDEN_TARJETAS: { key: SortKey; label: string }[] = [
  { key: "ventas", label: "Ventas" },
  { key: "utilidad", label: "Utilidad" },
  { key: "margen", label: "Margen %" },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD POR CLIENTE — desde el 5-sep-2026 es un MODO de Ventas › Clientes,
// no una pestaña propia.
//
// 🔴 ESTE ARCHIVO SE REUSA, NO SE REESCRIBIÓ. La tabla, las tarjetas, el orden
// y el formateo son los mismos de siempre; lo único nuevo es que el BUSCADOR,
// las PÍLDORAS DE EMPRESA y el EXCEL ya no viven acá: los pone Clientes y los
// comparten los tres modos, que es exactamente lo que Daniel pidió («solo
// cambian las columnas»). Tener dos buscadores para las mismas filas era
// buscar al mismo cliente dos veces.
//
// `data` también viaja HACIA ARRIBA (`onData`): el Excel de Clientes baja lo
// que se está viendo, y para eso necesita estas filas. Una segunda consulta
// solo para el archivo sería una segunda respuesta que puede no coincidir.
// ─────────────────────────────────────────────────────────────────────────────

export interface UtilidadViewProps {
  selectedYear: number;
  /** Texto del buscador de Clientes. Controlado desde afuera. */
  search?: string;
  /** Píldora de empresa activa ("todas" o una `empresa_key`). */
  empresaFiltro?: string;
  /** Con qué columna arranca el orden: «Utilidad» o «Margen %», según el modo. */
  ordenInicial?: SortKey;
  /** Le avisa a Clientes qué filas hay, para su Excel y su contador. */
  onData?: (d: UtilidadClienteResponse | null) => void;
  /** Le avisa a Clientes cuántas filas quedan después de buscar y filtrar. */
  onFilas?: (filas: UtilidadClienteRow[]) => void;
}

export function UtilidadView({
  selectedYear,
  search = "",
  empresaFiltro = "todas",
  ordenInicial = "utilidad",
  onData,
  onFilas,
}: UtilidadViewProps) {
  const [data, setData] = useState<UtilidadClienteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // El orden con el que abre lo fija el modo: se recuerda solo en la visita.
  const orden = useOrdenTabla<SortKey>("ventas-utilidad", {
    columnas: COLUMNAS_ORDEN,
    textos: ["cliente", "empresa"],
    inicial: { col: ordenInicial, dir: "desc" },
    recordar: "visita",
  });
  const sort = { key: orden.orden?.col ?? ordenInicial, dir: orden.orden?.dir ?? "desc" };

  // Cambiar de modo (Utilidad ⇄ Margen %) mueve la columna por la que se
  // ordena, no los datos: no hay refetch y la búsqueda no se toca.
  const modoPrevio = useRef(ordenInicial);
  const { poner } = orden;
  useEffect(() => {
    if (modoPrevio.current === ordenInicial) return;
    modoPrevio.current = ordenInicial;
    poner({ col: ordenInicial, dir: "desc" });
  }, [ordenInicial, poner]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas/utilidad-cliente?year=${selectedYear}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UtilidadClienteResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { onData?.(data); }, [data, onData]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    // La píldora de empresa de Clientes filtra ACÁ, en el navegador: la
    // respuesta ya trae las seis y pedirla de nuevo por empresa sería una
    // consulta por toque para quedarse con un subconjunto de lo que ya está.
    if (empresaFiltro !== "todas") r = r.filter((c) => c.empresaKey === empresaFiltro);
    // 🔴 La MISMA búsqueda normalizada que el modo Ventas (`coincideBusqueda`,
    // acentos y espacios incluidos): dos formas de buscar en la misma pantalla
    // devuelven dos listas distintas para lo que se escribió igual.
    if (search.trim()) r = r.filter((c) => coincideBusqueda(search, [c.cliente, c.empresa]));
    // Sin margen (null) va al final siempre.
    return orden.ordenar(r, (c, col) => (col === "cliente" ? c.cliente : col === "empresa" ? c.empresa : c[col]));
  }, [data, search, orden, empresaFiltro]);

  useEffect(() => { onFilas?.(rows); }, [rows, onFilas]);

  // 🔴 SIN «Mostrar más» (5-sep-2026). Daniel: *«no me gusta tener que andar
  // poniendo mas clientes abajo, ni productos, se deben de ver todo en una sola
  // lista»*. Mostraba 25 de 209 — una lista chica que cabe entera con scroll, y
  // entera se puede buscar con ⌘F, que era justo lo que la paginación rompía.
  const visibleRows = rows;
  const negativos = rows.filter((r) => r.utilidad < 0).length;

  // 🔴 «Utilidad tiene datos desde enero 2026» (23-sep-2026): el reporte de
  // utilidad de Switch arranca ahí; un año anterior no es un error ni «sin
  // clientes para este filtro».
  const textoVacio = UNA_SOLA_VENTA && data?.datosDesde
    ? textoDatosDesde("Utilidad", data.datosDesde)
    : "Sin clientes para este filtro.";

  const toggleSort = orden.tocar;

  return (
    <div>
      {/* ⛔ ACÁ VIVÍAN EL BUSCADOR Y EL BOTÓN «Excel» DE ESTA VISTA. Se fueron
          arriba, a Clientes, que los comparte con los tres modos: el mismo
          buscador y el mismo archivo, solo cambian las columnas. Dos buscadores
          para las mismas filas era buscar al mismo cliente dos veces. */}

      {/* Ordenar en tarjetas. En la tabla el orden se cambia desde los
          encabezados; sin tabla hacía falta un control propio o el celular se
          quedaba sin poder ordenar. Mismos 3 criterios y mismo toggle
          asc/desc: tocar el criterio activo lo da vuelta.
          🔴 Es el chip COMPARTIDO (`ChipOrden`): acá era verde y en Productos
          negro, dos colores para el mismo estado en el mismo módulo. */}
      <TiraOrden criterios={ORDEN_TARJETAS} active={sort} onClick={toggleSort} className="mb-4 lg:hidden" />

      {/* Totales + alcance.
          🔴 «6 EMPRESAS» SE DICE EN PANTALLA, NO ADENTRO DE UN ⓘ (5-sep-2026).
          El total decía $5.337.236,50 y punto — un número más chico que el del
          Resumen, sin nada que explicara por qué. La razón es real y no es un
          error: Boston y Multifashion NO llevan utilidad
          (`EMPRESA_SYNC_CAPABILITIES[…].utilidad = false`), así que este total
          nunca puede ser el del grupo. Escondido en la ayuda, el que no la abre
          se queda pensando que faltan dos empresas de plata.

          El número sale del alcance REAL de la consulta (`data.empresas`), no
          de un texto fijo: decía 5 mientras la lista de verdad son las 6 de
          Fashion Group, y así es como joystep se volvió invisible en
          Comisiones. */}

      {data && !loading && negativos > 0 && (
        <p className="mb-3 text-xs text-red-600">
          {negativos} cliente{negativos === 1 ? "" : "s"} con utilidad negativa (devoluciones netas).
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-700">
          No se pudo cargar la utilidad por cliente. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <SkeletonTable rows={8} cols={6} />
        </div>
      )}

      {/* ─── Tarjetas (< lg): iPhone e iPad ───────────────────────────────
          🩸 POR QUÉ NO LA TABLA. Medido con scripts/_ancho-util-ventas.mjs, que
          clona la tabla en una jaula de 1 px para que el navegador la colapse a
          su ancho MÍNIMO real (parte los textos donde puede). Ese mínimo es lo
          que la tabla necesita sí o sí:

            · iPhone 390 → mínimo 413 px contra 356 disponibles. Y eso con sólo
              4 columnas visibles: las tres de plata solas ya se comen el ancho y
              al nombre del cliente no le queda nada.
            · iPad 834 → mínimo 635 px contra 552. Ojo con el ancho ÚTIL: la
              barra lateral se lleva 223 px, así que un iPad de 834 deja 552 —
              MÁS ANGOSTO que un iPhone acostado. Por eso el iPad no se arregla
              solo por ser más grande.

          Nada de relleno que sacar ni encabezado que partir alcanza contra un
          faltante de 83 px. Se va a tarjetas, patrón de PanelCxcMobile /
          ResumenViewMobile.

          NO SE PIERDE NINGÚN DATO: la tarjeta trae los 6 campos de la fila,
          incluidos Empresa y Costo, que en la tabla angosta estaban ocultos por
          `sm:`/`md:table-cell`. En celular hoy se ven MÁS números que antes. */}
      {data && !loading && !error && (
        <div className="space-y-2 lg:hidden">
          {visibleRows.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
              {textoVacio}
            </div>
          )}
          {visibleRows.map((r) => (
            <UtilidadCard key={`card|${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`} r={r} />
          ))}
        </div>
      )}

      {/* ─── Tabla (lg+): el escritorio no se tocó ─────────────────────────
          A 1024 px el útil es 745 y el mínimo de la tabla 635: entra entera.
          De ahí para arriba se queda como estaba. */}
      {data && !loading && !error && (
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
                <ThOrden col="cliente" api={orden} className={TH_ORDEN}>Cliente</ThOrden>
                <ThOrden col="empresa" api={orden} className={TH_ORDEN}>Empresa</ThOrden>
                <ThOrden col="ventas" api={orden} derecha className={TH_ORDEN}>Ventas</ThOrden>
                <ThOrden col="costo" api={orden} derecha className={TH_ORDEN}>Costo</ThOrden>
                <ThOrden col="utilidad" api={orden} derecha className={TH_ORDEN}>Utilidad</ThOrden>
                <ThOrden col="margen" api={orden} derecha className={TH_ORDEN}>Margen %</ThOrden>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">{textoVacio}</td></tr>
              )}
              {visibleRows.map((r) => (
                <UtilidadRow key={`${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 🔴 4-oct-2026 (Daniel: «o bien resumido abajo en una línea»): los
          totales y el alcance bajaron a UNA línea gris al final de la lista. */}
      {data && !loading && (
        <p data-totales-utilidad className="mt-3 flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
          <span>
            Ventas <span className="tabular-nums text-gray-900">{montoDeLaTabla(data.totales.ventas)}</span>
            <span className="mx-2 text-gray-300">·</span>
            Utilidad <span className="tabular-nums text-gray-900">{montoDeLaTabla(data.totales.utilidad)}</span>
            <span className="mx-2 text-gray-300">·</span>
            Margen <span className="tabular-nums text-gray-900">{fmtMargenPantalla(data.totales.margen)}</span>
          </span>
          <span data-alcance-utilidad>
            {alcanceEmpresas(data.empresas)} · Excluye Boston y Multifashion
            {/* 🔴 UNA SOLA VENTA: el cuadre contra el Resumen, dicho. «El mismo
                total que el Resumen», o cuánto falta y por qué. */}
            {UNA_SOLA_VENTA && textoCuadreUtilidad(data.cuadre) && (
              <span data-cuadre-utilidad> · {textoCuadreUtilidad(data.cuadre)}</span>
            )}
          </span>
        </p>
      )}
      {/* ⛔ ACÁ VIVÍA «Mostrar más (184 restantes)». Ver el comentario de
          `visibleRows`: la lista se ve entera. */}
    </div>
  );
}


/** Clave estable de una fila/tarjeta. El verificador la usa para cruzar la
 *  tarjeta del celular contra la fila del escritorio: es un `data-` fijo, NO una
 *  clase de breakpoint, justo para que mover el corte no deje la búsqueda vacía
 *  y el chequeo pasando en falso. */
const filaKey = (r: UtilidadClienteRow) => `${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`;

/** El mostrador (`TCKCTA`), marcado como en el modo Ventas. Acá SUMA en el
 *  total —el Resumen lo suma— así que no dice «fuera del ranking». */
function MarcaMostrador() {
  return (
    <span data-marca-mostrador className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700">
      mostrador · ventas de contado
    </span>
  );
}

function UtilidadRow({ r }: { r: UtilidadClienteRow }) {
  const neg = r.utilidad < 0;
  // Negativo = devolución neta. Se ve claro (rojo) pero NO como error.
  const utilCls = neg ? "text-red-600" : "text-gray-900";
  const margenCls = r.margen == null ? "text-gray-400" : r.margen < 0 ? "text-red-600" : "text-gray-700";
  return (
    <tr data-fila-utilidad={filaKey(r)} className="border-b border-gray-100 hover:bg-gray-50">
      <td data-col="cliente" className="px-3 py-2.5">
        <span className="text-gray-800">{r.cliente}</span>
        {UNA_SOLA_VENTA && r.mostrador && <MarcaMostrador />}
        {neg && (
          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
            dev. neta
          </span>
        )}
      </td>
      <td data-col="empresa" className="px-3 py-2.5 text-gray-500">{nombreCortoEmpresa(r.empresaKey)}</td>
      <td data-col="ventas" className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtMoneySigned(r.ventas)}</td>
      <td data-col="costo" className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmtMoneySigned(r.costo)}</td>
      <td data-col="utilidad" className={`px-3 py-2.5 text-right font-medium tabular-nums ${utilCls}`}>{fmtMoneySigned(r.utilidad)}</td>
      <td data-col="margen" className={`px-3 py-2.5 text-right tabular-nums ${margenCls}`}>{fmtMargenPantalla(r.margen)}</td>
    </tr>
  );
}

/**
 * Tarjeta (< lg) equivalente a UtilidadRow. Trae los SEIS campos de la fila con
 * el mismo formateo — mismos `fmtMoneySigned` / `fmtMargen`, ningún redondeo ni
 * abreviatura propia — para que el número que se lee en el celular sea, carácter
 * por carácter, el mismo que el del escritorio.
 */
function UtilidadCard({ r }: { r: UtilidadClienteRow }) {
  const neg = r.utilidad < 0;
  const utilCls = neg ? "text-red-600" : "text-gray-900";
  const margenCls = r.margen == null ? "text-gray-400" : r.margen < 0 ? "text-red-600" : "text-gray-700";
  return (
    <div data-fila-utilidad={filaKey(r)} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span data-col="cliente" className="text-[15px] font-medium leading-tight text-gray-900">{r.cliente}</span>
        {UNA_SOLA_VENTA && r.mostrador && <MarcaMostrador />}
        {neg && (
          <span
            className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600"
          >
            dev. neta
          </span>
        )}
      </div>
      <div data-col="empresa" className="mt-0.5 text-xs text-gray-500">{nombreCortoEmpresa(r.empresaKey)}</div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Ventas</dt>
          <dd data-col="ventas" className="tabular-nums text-gray-700">{fmtMoneySigned(r.ventas)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Costo</dt>
          <dd data-col="costo" className="tabular-nums text-gray-500">{fmtMoneySigned(r.costo)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Utilidad</dt>
          <dd data-col="utilidad" className={`font-medium tabular-nums ${utilCls}`}>{fmtMoneySigned(r.utilidad)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Margen %</dt>
          <dd data-col="margen" className={`tabular-nums ${margenCls}`}>{fmtMargenPantalla(r.margen)}</dd>
        </div>
      </dl>
    </div>
  );
}
