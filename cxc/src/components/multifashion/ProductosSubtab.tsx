"use client";

// Sub-tab "Productos" de Multifashion: lo más vendido.
//
// TRES agrupadores, que son la misma pregunta a tres alturas:
//   · Por categoría — la `descripcion` de Switch ("Women-Bags", "Men-Polos S/S")
//   · Por artículo  — el código suelto, con buscador y filtro por categoría
//                     (para bajar de "Women-Bags vende $62K" a CUÁL cartera)
//   · Por marca     — el diccionario del catálogo (agrupador previo, #420)
//
// ── LO QUE NO SE PUEDE CAMBIAR SIN ROMPER EL INFORME ────────────────────────
//
// 1. EL ORDEN CON EL QUE ABRE ES **UNIDADES**, no monto. Decisión de Daniel
//    ("por unidad pero dejame hacerle sort a las otras opciones"). Las columnas
//    de venta, costo, utilidad y margen se ordenan con un clic, sin volver a
//    pedirle nada al servidor: la lista completa ya está en memoria.
//
// 2. LAS NOTAS DE CRÉDITO YA ESTÁN RESTADAS, y la pantalla lo DICE. Sin esa
//    línea, alguien va a cuadrar el mes contra Switch y no le va a dar — y la
//    diferencia va a ser exactamente el doble de las devoluciones, que es la
//    firma de este error (CLAUDE.md, "Signos contables").
//
// 3. EL MARGEN PUEDE SER "—". Un grupo que quedó en devolución neta no tiene
//    margen: un 0% ahí sería mentira. Al ordenar por margen, los "—" van
//    siempre al final, suba o baje.
//
// ── DECISIONES DE ANCHO (regla de los 3 anchos: 390 / 834 / 1440) ───────────
// Tabla en `lg` para arriba y TARJETAS abajo, igual que Vendedoras. El corte es
// `lg` y no `md` porque lo que manda es el ancho ÚTIL: la barra lateral se lleva
// 224 px, así que un iPad de 834 deja 610 — más angosto que un iPhone acostado.
// Seis columnas con montos no entran ahí sin recortar, y en este módulo ya hubo
// una pantalla que RECORTABA datos sin scroller (Clientes, 288 px inalcanzables
// — CLAUDE.md). La tabla vive dentro de un `overflow-x-auto` propio: si algún
// día no entra, se arrastra — nunca se pierde.
//
// En tarjetas el orden no se puede pedir con un clic en el encabezado (no hay
// encabezado), así que va un selector propio de 44 px: esconder el control
// habría dejado el celular con UN solo orden posible.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Package, Tag, Layers, Info, Search, ArrowUp, ArrowDown } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import {
  ordenarRanking,
  filtrarRanking,
  ORDEN_DEFAULT,
  type RenglonRanking,
  type ColumnaRanking,
  type DireccionOrden,
  type TotalesRanking,
} from "@/lib/multifashion/productos-ranking";

type Vista = "categoria" | "articulo" | "marca";
type Periodo = "mes" | "12m";

interface RenglonMarca {
  marcaId: number | null;
  marca: string;
  unidades: number;
  venta: number;
  pct: number | null;
  articulos: number;
}

interface ProductosResp {
  year: number;
  mes: number;
  periodo: Periodo;
  desde: string;
  hasta: string;
  filasLeidas: number;
  marcaDisponible: boolean;
  totales: { unidades: number; venta: number; articulos: number };
  marcas: RenglonMarca[];
  sinMarca: { articulos: number; venta: number };
  ranking: {
    totales: TotalesRanking;
    categorias: RenglonRanking[];
    codigos: RenglonRanking[];
  };
}

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Cuántos renglones se dibujan de una. Las ~3.900 filas de "Por artículo"
 *  enteras en el DOM cuelgan el iPhone;
 *  el botón de abajo agrega de a tandas y el conteo dice siempre cuántas hay. */
const TANDA = 100;

/** Unidades: la columna es `numeric(14,4)` pero en la práctica son piezas
 *  enteras. Se muestran sin decimales salvo que realmente los tengan. */
function fmtUnidades(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Margen: SIN el "+" que le pone `fmtPct` a los deltas — acá no es una
 *  variación contra nada, es una proporción. `null` → "—" (ver punto 3). */
function fmtMargen(p: number | null): string {
  return p == null ? "—" : `${(p * 100).toFixed(1)}%`;
}

function fmtPctTotal(p: number | null): string {
  return p == null ? "—" : `${(p * 100).toFixed(1)}%`;
}

/** "1 de septiembre de 2025" → "1 sep 2025". Fecha corta y en español simple. */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${Number(d)} ${MES_CORTO[Number(m) - 1]} ${a}`;
}

interface ProductosSubtabProps {
  selectedYear: number;
  mes: number;
  /** El período lo maneja MultifashionView: es lo que decide si el selector de
   *  mes compartido se dibuja o no. Con dos controles de período en pantalla,
   *  uno de los dos siempre está mintiendo. */
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  /** gerente_acs: solo el mes en curso. Acá se DIBUJA menos; el candado real
   *  vive en el servidor (clampPeriodoProductos). */
  ventanaAcotada?: boolean;
}

export function ProductosSubtab({
  selectedYear,
  mes,
  periodo,
  onPeriodoChange,
  ventanaAcotada = false,
}: ProductosSubtabProps) {
  const [vista, setVista] = useState<Vista>("categoria");
  const [orden, setOrden] = useState<{ col: ColumnaRanking; dir: DireccionOrden }>(ORDEN_DEFAULT);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [visibles, setVisibles] = useState(TANDA);

  const url = `/api/multifashion/productos?year=${selectedYear}&mes=${mes}&periodo=${periodo}`;
  const { data: resp, error, isLoading, mutate } = useSWR<ProductosResp>(
    url,
    async (u: string) => {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<ProductosResp>;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const loading = isLoading && !resp;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // El período que se está mirando lo dice el SERVIDOR (`resp.desde`/`resp.hasta`),
  // no el estado local: para `gerente_acs` el servidor acota el pedido, y el
  // rótulo tiene que decir lo que se está viendo de verdad, no lo que se pidió.
  const rotuloPeriodo = resp
    ? resp.periodo === "12m"
      ? `${fmtFecha(resp.desde)} – ${fmtFecha(resp.hasta)}`
      : `${MES_FULL[resp.mes - 1]} ${resp.year}`
    : periodo === "12m"
      ? "últimos 12 meses"
      : `${MES_FULL[mes - 1]} ${selectedYear}`;

  const base = vista === "categoria" ? resp?.ranking.categorias : resp?.ranking.codigos;

  // Filtro + orden, en ese orden y los dos PUROS. El filtro va primero para que
  // el "mostrando N de M" cuente lo que el filtro dejó, no el catálogo entero.
  const filas = useMemo(() => {
    if (!base) return [];
    const filtradas = filtrarRanking(base, {
      texto,
      categoria: vista === "articulo" ? categoria : "",
    });
    return ordenarRanking(filtradas, orden.col, orden.dir);
  }, [base, texto, categoria, vista, orden.col, orden.dir]);

  // Las categorías del desplegable salen del MISMO payload, ordenadas por lo que
  // más se vende (no alfabéticas): las que Daniel va a buscar están arriba.
  const categoriasDisponibles = useMemo(
    () => (resp?.ranking.categorias ?? []).map(c => c.etiqueta),
    [resp],
  );

  const clic = (col: ColumnaRanking) => {
    setOrden(o =>
      o.col === col
        // Segundo clic en la MISMA columna = dar vuelta el orden.
        ? { col, dir: o.dir === "desc" ? "asc" : "desc" }
        // Columna nueva: arranca de mayor a menor (que es lo que se busca en un
        // ranking), salvo el texto, que arranca de la A.
        : { col, dir: col === "etiqueta" ? "asc" : "desc" },
    );
    setVisibles(TANDA);
  };

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setOrden(ORDEN_DEFAULT);
    setTexto("");
    setCategoria("");
    setVisibles(TANDA);
  };

  const cambiarPeriodo = (p: Periodo) => {
    onPeriodoChange(p);
    setVisibles(TANDA);
  };

  const totales = resp?.ranking.totales;

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudieron cargar los productos: {errorMsg}
          <button
            onClick={() => mutate()}
            className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Agrupador. 44 px de alto (regla táctil): es el control que más se toca
          de la pestaña y en este módulo ya hubo píldoras de 26 px (CLAUDE.md).
          `-my-1.5` para que crecer no despegue el filtro del título. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Agrupar por">
        <Pill activo={vista === "categoria"} onClick={() => cambiarVista("categoria")}>
          <Layers className="h-3.5 w-3.5" /> Por categoría
        </Pill>
        <Pill activo={vista === "articulo"} onClick={() => cambiarVista("articulo")}>
          <Package className="h-3.5 w-3.5" /> Por artículo
        </Pill>
        <Pill activo={vista === "marca"} onClick={() => cambiarVista("marca")}>
          <Tag className="h-3.5 w-3.5" /> Por marca
        </Pill>
      </div>

      {/* Período. Se esconde para la ventana acotada — ahí solo existe el mes en
          curso, y una píldora que no se puede elegir es ruido. Esconderla NO es
          el candado: el servidor aplasta `periodo=12m` a "mes" para ese rol. */}
      {!ventanaAcotada && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
          <Pill activo={periodo === "12m"} onClick={() => cambiarPeriodo("12m")}>
            Últimos 12 meses
          </Pill>
          {/* "Un mes" y no "Agosto 2026": al elegirlo aparece arriba el selector
              de mes, que es el que dice CUÁL. Repetir el nombre acá dejaba dos
              rótulos del mismo período, y uno se desactualiza. */}
          <Pill activo={periodo === "mes"} onClick={() => cambiarPeriodo("mes")}>
            Un mes
          </Pill>
        </div>
      )}

      <div className={cn(loading && "opacity-60 transition-opacity")}>
        <h3 className="font-display text-base font-semibold text-gray-950">
          Más vendido · {rotuloPeriodo}
        </h3>
        {totales && (
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{fmtUnidades(totales.unidades)}</span> unidades ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMoney(totales.venta)}</span> de venta ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMoney(totales.utilidad)}</span> de utilidad ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMargen(totales.margen)}</span> de margen
          </p>
        )}
        {/* Se dice de dónde sale el número Y qué se le restó. Las devoluciones
            YA están descontadas; sin la nota, alguien va a sumar el período a
            mano contra Switch y no le va a cuadrar. */}
        <p className="mt-1 text-xs text-gray-400">
          Ventas netas: las devoluciones (notas de crédito) ya están restadas. El margen es la utilidad dividida entre
          la venta.
        </p>
      </div>

      {/* Buscador + filtro por categoría. Solo en "Por artículo": es la vista que
          tiene ~3.900 renglones, y es la pregunta que sigue a la de categoría. */}
      {vista === "articulo" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={texto}
              onChange={e => { setTexto(e.target.value); setVisibles(TANDA); }}
              placeholder="Buscar por código o descripción"
              aria-label="Buscar por código o descripción"
              // 44 px de alto y letra de 16 px en celular: por debajo de 16, iOS
              // hace zoom solo al enfocar y deja la pantalla corrida.
              className="h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 sm:text-sm"
            />
          </div>
          <select
            value={categoria}
            onChange={e => { setCategoria(e.target.value); setVisibles(TANDA); }}
            aria-label="Filtrar por categoría"
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-base text-gray-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 sm:w-64 sm:text-sm"
          >
            <option value="">Todas las categorías</option>
            {categoriasDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {/* El agrupador por marca depende del diccionario del catálogo de Switch.
          Si todavía no está cargado se DICE — la alternativa sería deducir la
          marca del código del proveedor, o sea inventarla. */}
      {vista === "marca" && resp && !resp.marcaDisponible && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Todavía no está cargado el catálogo de marcas de la tienda, así que todo aparece como{" "}
            <strong>Sin marca</strong>. Se llena solo en la próxima actualización diaria.
          </span>
        </div>
      )}
      {vista === "marca" && resp && resp.marcaDisponible && resp.sinMarca.articulos > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-mono tabular-nums">{resp.sinMarca.articulos.toLocaleString("en-US")}</span> artículos
            del período ({fmtMoney(resp.sinMarca.venta)}) todavía no tienen marca en el catálogo de la tienda.
          </span>
        </div>
      )}

      {vista === "marca" ? (
        <VistaMarca renglones={resp?.marcas ?? []} loading={loading} periodo={rotuloPeriodo} />
      ) : (
        <VistaRanking
          vista={vista}
          filas={filas}
          totalSinFiltrar={base?.length ?? 0}
          visibles={visibles}
          onVerMas={() => setVisibles(v => v + TANDA)}
          orden={orden}
          onOrdenar={clic}
          loading={loading}
          hayDatos={Boolean(resp)}
          periodo={rotuloPeriodo}
        />
      )}
    </div>
  );
}

// ── Vista de ranking (categoría / artículo) ─────────────────────────────────

/** Las columnas ordenables, en el orden en que se dibujan. `numero: false` es la
 *  única de texto (se alinea a la izquierda y arranca de la A). */
interface DefCol {
  col: ColumnaRanking;
  titulo: string;
  numero: boolean;
  /** Solo en "Por categoría": el costo no cabe con la descripción al lado. */
  soloCategoria?: boolean;
}

const COLUMNAS: DefCol[] = [
  { col: "etiqueta", titulo: "", numero: false },
  { col: "unidades", titulo: "Unidades", numero: true },
  { col: "venta", titulo: "Venta", numero: true },
  { col: "costo", titulo: "Costo", numero: true, soloCategoria: true },
  { col: "utilidad", titulo: "Utilidad", numero: true },
  { col: "margen", titulo: "Margen", numero: true },
];

function VistaRanking({
  vista,
  filas,
  totalSinFiltrar,
  visibles,
  onVerMas,
  orden,
  onOrdenar,
  loading,
  hayDatos,
  periodo,
}: {
  vista: Vista;
  filas: RenglonRanking[];
  totalSinFiltrar: number;
  visibles: number;
  onVerMas: () => void;
  orden: { col: ColumnaRanking; dir: DireccionOrden };
  onOrdenar: (c: ColumnaRanking) => void;
  loading: boolean;
  hayDatos: boolean;
  periodo: string;
}) {
  const cols = COLUMNAS.filter(c => vista === "categoria" || !c.soloCategoria).map(c =>
    c.col === "etiqueta" ? { ...c, titulo: vista === "categoria" ? "Categoría" : "Artículo" } : c,
  );
  const mostradas = filas.slice(0, visibles);

  if (hayDatos && filas.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-700">
          {totalSinFiltrar === 0
            ? `No hubo ventas en ${periodo}.`
            : "Ningún artículo coincide con la búsqueda."}
        </p>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-3", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Orden en celular/iPad: sin encabezados no hay dónde hacer clic. Columna
          en el desplegable y sentido en su propio botón — meter los dos en un
          solo select da el doble de opciones para la misma decisión. */}
      <div className="flex items-center gap-2 lg:hidden">
        <label htmlFor="orden-productos" className="shrink-0 text-xs text-gray-500">Ordenar por</label>
        <select
          id="orden-productos"
          value={orden.col}
          onChange={e => onOrdenar(e.target.value as ColumnaRanking)}
          className="h-11 flex-1 rounded-md border border-gray-200 bg-white px-3 text-base text-gray-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 sm:text-sm"
        >
          {cols.map(c => (
            <option key={c.col} value={c.col}>{c.titulo}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onOrdenar(orden.col)}
          aria-label={orden.dir === "desc" ? "Cambiar a de menor a mayor" : "Cambiar a de mayor a menor"}
          className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700"
        >
          {orden.dir === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Escritorio */}
      <Card data-vista="tabla" className="hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="w-9 border-b border-gray-200 px-1.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500 xl:px-3">
                  #
                </th>
                {cols.map(c => (
                  <th
                    key={c.col}
                    aria-sort={orden.col === c.col ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "border-b border-gray-200 p-0 text-xs font-medium uppercase tracking-wide text-gray-500",
                      c.numero ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOrdenar(c.col)}
                      className={cn(
                        // Relleno chico por debajo de xl para que las 5-6
                        // columnas ENTREN en un iPad acostado (1024) en vez de
                        // empujar el corte a xl y sacarle la tabla a un
                        // escritorio de 1024-1279 donde sí cabe (CLAUDE.md).
                        //
                        // `min-h-[44px]`: la tabla arranca en 1024, y 1024 NO es
                        // escritorio — es el mismo iPad acostado, con dedo. El
                        // encabezado acá no es un rótulo, es el BOTÓN de ordenar:
                        // medido a 38 px antes de esto.
                        "flex min-h-[44px] w-full items-center gap-1 px-1.5 py-2.5 uppercase transition hover:text-gray-900 xl:px-3",
                        c.numero ? "justify-end" : "justify-start",
                        orden.col === c.col && "text-gray-900",
                      )}
                    >
                      {c.titulo}
                      {orden.col === c.col &&
                        (orden.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mostradas.map((r, i) => (
                <tr key={r.clave}>
                  <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums xl:px-3">
                    {i + 1}
                  </td>
                  <td className="border-b border-gray-200 px-1.5 py-3 text-sm text-gray-950 xl:px-3">
                    <span className="font-medium">{r.etiqueta}</span>
                    {r.detalle && <span className="ml-2 text-xs text-gray-500">{r.detalle}</span>}
                  </td>
                  <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums xl:px-3">
                    {fmtUnidades(r.unidades)}
                  </td>
                  <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums xl:px-3">
                    {fmtMoney(r.venta)}
                  </td>
                  {vista === "categoria" && (
                    <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums xl:px-3">
                      {fmtMoney(r.costo)}
                    </td>
                  )}
                  <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums xl:px-3">
                    {fmtMoney(r.utilidad)}
                  </td>
                  <td className="border-b border-gray-200 px-1.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums xl:px-3">
                    {fmtMargen(r.margen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Celular e iPad. Cada cifra con su rótulo encima: sin encabezado de
          tabla, cuatro números sueltos en una fila no dicen cuál es cuál. */}
      <div data-vista="tarjetas" className="space-y-2 lg:hidden">
        {mostradas.map((r, i) => (
          <Card key={r.clave} className="p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-xs text-gray-400 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-950">{r.etiqueta}</p>
                {r.detalle && <p className="truncate text-xs text-gray-500">{r.detalle}</p>}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                  <Dato rotulo="Unidades" valor={fmtUnidades(r.unidades)} />
                  <Dato rotulo="Venta" valor={fmtMoney(r.venta)} fuerte />
                  <Dato rotulo="Utilidad" valor={fmtMoney(r.utilidad)} />
                  <Dato rotulo="Margen" valor={fmtMargen(r.margen)} />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Cuántas se ven de cuántas hay. Sin este renglón, "las 100 primeras"
          se lee como "esto es todo" y el buscador parece de adorno. */}
      {filas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <p className="text-xs text-gray-500">
            Mostrando{" "}
            <span className="font-mono tabular-nums">{Math.min(visibles, filas.length).toLocaleString("en-US")}</span>{" "}
            de <span className="font-mono tabular-nums">{filas.length.toLocaleString("en-US")}</span>
            {filas.length !== totalSinFiltrar && (
              <> (de {totalSinFiltrar.toLocaleString("en-US")} en total)</>
            )}
          </p>
          {visibles < filas.length && (
            <button
              type="button"
              onClick={onVerMas}
              className="-my-1.5 inline-flex min-h-[44px] items-center rounded-full border border-gray-200 bg-white px-4 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950"
            >
              Ver {Math.min(TANDA, filas.length - visibles)} más
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ rotulo, valor, fuerte = false }: { rotulo: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="min-w-0">
      {/* 12 px es el PISO de letra de la app (#301) y esta pantalla es de
          plata: el rótulo va en `text-xs`, no en un arbitrario más chico. */}
      <p className="text-xs leading-tight text-gray-500">{rotulo}</p>
      <p
        className={cn(
          "truncate font-mono text-xs tabular-nums",
          fuerte ? "font-medium text-gray-950" : "text-gray-700",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

// ── Vista por marca (agrupador previo, #420 — sin cambios de fondo) ─────────

function VistaMarca({
  renglones,
  loading,
  periodo,
}: {
  renglones: RenglonMarca[];
  loading: boolean;
  periodo: string;
}) {
  if (renglones.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-700">No hubo ventas en {periodo}.</p>
      </Card>
    );
  }
  return (
    <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
      <Card data-vista="tabla" className="hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 620 }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="w-10 border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">#</th>
                <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Marca</th>
                <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Unidades</th>
                <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Monto</th>
                <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">% del total</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((m, i) => (
                <tr key={`${m.marcaId ?? "s"}-${m.marca}`}>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
                    <span className="font-medium">{m.marca}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {m.articulos.toLocaleString("en-US")} artículo{m.articulos === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{fmtUnidades(m.unidades)}</td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(m.venta)}</td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{fmtPctTotal(m.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div data-vista="tarjetas" className="space-y-2 lg:hidden">
        {renglones.map((m, i) => (
          <Card key={`${m.marcaId ?? "s"}-${m.marca}`} className="p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-xs text-gray-400 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-950">{m.marca}</p>
                <p className="truncate text-xs text-gray-500">
                  {m.articulos.toLocaleString("en-US")} artículo{m.articulos === 1 ? "" : "s"}
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-gray-600 tabular-nums">{fmtUnidades(m.unidades)} u.</span>
                  <span className="font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(m.venta)}</span>
                  <span className="font-mono text-xs text-gray-500 tabular-nums">{fmtPctTotal(m.pct)}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Pill({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "-my-1.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition",
        activo
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}
