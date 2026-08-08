"use client";

// Sub-tab "Productos" de Multifashion: lo más vendido.
//
// ── QUÉ RESPONDE ESTA PANTALLA, Y EN QUÉ ORDEN ──────────────────────────────
//
// Daniel, textual: *"no me encanta, piensa como un CEO quisiera ver de manera
// simple rapida y minimalista y arreglalo asi"*. Los números estaban bien; el
// problema era que llegaban como PLANILLA — 600 filas × 6 columnas de cifras—,
// y una planilla no es una respuesta: hay que leerla entera para sacar una.
//
// El orden de arriba hacia abajo es el orden en que un dueño PREGUNTA, no el
// orden en que estaban las columnas:
//
//   0. **Marcas** — cuánto vende y cuánto margen deja cada una de las cinco, y
//      el FILTRO de toda la pantalla. Daniel: *"y si quiero ver mis articulos top
//      sellers? o descripciones top seller?"* — el agrupador lo obligaba a bajar
//      nivel por nivel. Un toque en "Tommy" y las cuatro respuestas de abajo (y
//      la tabla, y la comparación contra el año pasado) son de Tommy. UN toque,
//      no cuatro. Ojo: lo que Switch llama "marca" son 32 valores que en realidad
//      son marca + departamento (`TH MENSWEAR`); el mapa a las 5 marcas reales es
//      explícito y vive en `src/lib/multifashion/marcas-grupo.ts`.
//   1. **Cómo vamos** — unidades, venta y utilidad del período, cada una con
//      cuánto cambió contra el mismo período del año pasado. El cambio es lo
//      primero que se mira y antes NO EXISTÍA en esta pantalla.
//   2. **Qué se vende más** y **qué deja más plata**, en dos listas separadas.
//      Son dos preguntas distintas y antes competían en la misma fila de la
//      tabla; separarlas hace visible cuando la respuesta NO es la misma.
//   3. **Qué se vende mucho y deja poco** — la conclusión de negocio que los
//      datos ya permitían y que nadie estaba mostrando.
//   4. **Qué movió la aguja** contra el año pasado, en dólares.
//   5. El detalle completo, detrás de "Ver todo". Sigue entero: la tabla, el
//      buscador, el filtro por categoría, el orden por columna y el paginado.
//
// ── LO QUE NO SE PUEDE CAMBIAR SIN ROMPER EL INFORME ────────────────────────
//
// 1. EL ORDEN CON EL QUE ABRE LA TABLA ES **UNIDADES**, no monto. Decisión de
//    Daniel ("por unidad pero dejame hacerle sort a las otras opciones"). Las
//    columnas de venta, costo, utilidad y margen se ordenan con un clic, sin
//    volver a pedirle nada al servidor: la lista completa ya está en memoria.
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
// 4. LAS DESCRIPCIONES SE MUESTRAN TAL CUAL VIENEN DE SWITCH. No se normalizan
//    ni se agrupan por parecido: sería inventar estructura de negocio.
//
// 5. LA COMPARACIÓN ES CONTRA EL MISMO PERÍODO DEL AÑO PASADO, MEDIDO. Y si el
//    mes todavía no cerró, contra los MISMOS DÍAS — la pantalla lo dice con las
//    dos fechas. Comparar 7 días contra un mes entero mostraría una caída del
//    78% que no ocurrió.
//
// ── DECISIONES DE DISEÑO ────────────────────────────────────────────────────
// Se trabaja DENTRO del sistema que ya existe (no se inventa uno): tarjetas
// `rounded-lg` con borde y sin sombra, acento teal, Playfair (`font-display`)
// en los títulos y Geist Mono (`font-mono tabular-nums`) en TODA cifra. Lo
// único que se agrega es jerarquía:
//   · **Escala**: la cifra del pulso a 24 px contra los 13-14 px del resto. Es
//     lo que hace que los tres números se lean en el primer vistazo.
//   · **Color con significado, no decorativo**: teal = plata, gris = piezas
//     (son unidades distintas y no deben verse igual), verde/rojo SOLO para la
//     dirección del cambio, ámbar SOLO para la advertencia de margen. El acento
//     y los colores semánticos no se mezclan.
//   · **La barra compara contra el líder de SU lista, no contra el total**: con
//     570 categorías, medir contra el total deja cinco hilos de 1 px que no
//     comparan nada. El % del total va como número al lado.
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
// Por la misma razón las dos listas del punto 2 van una debajo de otra hasta
// `lg`: a 610 px de ancho útil, dos columnas dejarían ~295 px por lista y un
// monto de 5 cifras con centavos pide 92 px sin contar la etiqueta ni la barra.
//
// En tarjetas el orden no se puede pedir con un clic en el encabezado (no hay
// encabezado), así que va un selector propio de 44 px: esconder el control
// habría dejado el celular con UN solo orden posible.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import {
  Package, Tag, Layers, Info, Search, ArrowUp, ArrowDown, ChevronDown, AlertTriangle,
} from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtVariacionPct } from "@/lib/variacion";
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
import {
  variacion,
  topPor,
  margenFlojo,
  movimientos,
  type RenglonComparativo,
  type TopFila,
  type Variacion,
} from "@/lib/multifashion/productos-resumen";
import type { GrupoMarcaId } from "@/lib/multifashion/marcas-grupo";
import {
  indexarPorGrupo,
  mapaDetalles,
  rehidratar,
  rehidratarComparativo,
  type PorMarca,
  type PorMarcaComparativo,
  type TotalesMarca,
} from "@/lib/multifashion/productos-marca";

type Vista = "categoria" | "articulo" | "marca";
type Periodo = "mes" | "12m";

interface RenglonMarca {
  marcaId: number | null;
  marca: string;
  unidades: number;
  venta: number;
  pct: number | null;
  articulos: number;
  /** A qué MARCA REAL pertenece este departamento de Switch. */
  grupo: GrupoMarcaId;
}

interface Comparativo {
  desde: string;
  hasta: string;
  /** El período actual no cerró: la comparación se recortó a los mismos días. */
  parcial: boolean;
  totales: TotalesRanking;
  categorias: RenglonComparativo[];
  codigos: RenglonComparativo[];
  /** El mismo comparativo repartido por marca. `null` = sin diccionario. */
  porMarca: PorMarcaComparativo | null;
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
  /** El período repartido en las 5 marcas reales (+ "Otros"). `null` = no hay
   *  diccionario de marcas y la pantalla se dibuja sin filtro, como antes. */
  porMarca: PorMarca | null;
  ranking: {
    totales: TotalesRanking;
    categorias: RenglonRanking[];
    codigos: RenglonRanking[];
  };
  comparativo: Comparativo | null;
}

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Cuántos renglones se dibujan de una. Las ~3.900 filas de "Por artículo"
 *  enteras en el DOM cuelgan el iPhone;
 *  el botón de abajo agrega de a tandas y el conteo dice siempre cuántas hay. */
const TANDA = 100;

/** Cuántos van en cada lista de arriba. Cinco es lo que se lee de un vistazo:
 *  con diez ya hay que recorrer, y recorrer es lo que hacía la tabla. */
const TOP_VISIBLE = 5;

/** La alerta de margen mira los 10 más vendidos y muestra hasta 3. Diez porque
 *  es el pelotón que de verdad mueve el período; tres porque una lista larga de
 *  advertencias deja de ser una advertencia. */
const ALERTA_ENTRE = 10;
const ALERTA_MAX = 3;

/** Cuántos grupos se muestran de cada lado en "qué movió la aguja". */
const MOVIMIENTOS_N = 3;

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

/** Monto con signo. El menos es el signo tipográfico (−), no un guion. */
function fmtMontoConSigno(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;
}

function fmtUnidadesConSigno(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtUnidades(Math.abs(n))}`;
}

/** "1 de septiembre de 2025" → "1 sep 2025". Fecha corta y en español simple. */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${Number(d)} ${MES_CORTO[Number(m) - 1]} ${a}`;
}

/** El tono del cambio. Gris cuando no hay con qué comparar: un "—" en verde
 *  diría que algo mejoró. */
function tonoVariacion(n: number | null): string {
  if (n == null) return "text-gray-500";
  if (n > 0) return "text-emerald-700";
  if (n < 0) return "text-rose-700";
  return "text-gray-500";
}

function flechaVariacion(n: number | null): string {
  if (n == null || n === 0) return "";
  return n > 0 ? "▲" : "▼";
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
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  /** `null` = todas las marcas, que es como abre la pantalla. */
  const [marca, setMarca] = useState<GrupoMarcaId | null>(null);

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

  // ── EL FILTRO DE MARCA ────────────────────────────────────────────────────
  // Todo lo de abajo —el pulso, las dos listas, la alerta de margen, lo que más
  // cambió y la tabla— sale de `base` / `baseComparativa` / `totales`. Filtrar
  // por marca es cambiar ESAS TRES COSAS, y nada más: si cada bloque se filtrara
  // por su cuenta, el día que uno se olvidara la pantalla mostraría el pulso de
  // Tommy con la tabla de todas las marcas y nadie lo notaría.
  //
  // Los números NO se recalculan acá: el servidor ya agregó cada marca con la
  // MISMA función que el total (ver productos-marca.ts). `rehidratar` solo rearma
  // `utilidad` y `margen` con las mismas cuentas, para no mandar dos veces lo
  // que se deriva.
  const grupos = resp?.porMarca?.grupos ?? [];
  const conFiltro = grupos.length > 1;
  // Una marca elegida que este período no vendió nada no existe en `grupos`:
  // se vuelve a "Todas" sola, en vez de dejar la pantalla vacía sin decir por qué.
  const marcaSel = conFiltro && marca && grupos.some(g => g.id === marca) ? marca : null;

  const indices = useMemo(() => {
    const pm = resp?.porMarca;
    const pmc = resp?.comparativo?.porMarca ?? null;
    return {
      categorias: indexarPorGrupo(pm?.categorias ?? []),
      codigos: indexarPorGrupo(pm?.codigos ?? []),
      compCategorias: indexarPorGrupo(pmc?.categorias ?? []),
      compCodigos: indexarPorGrupo(pmc?.codigos ?? []),
      // Las descripciones de los artículos ya viajaron enteras una vez; se reusan
      // en vez de repetirlas dentro de cada marca (es el texto más pesado del
      // payload). Un código pertenece a UNA marca, así que la descripción es la
      // misma que ya tenía en la lista completa.
      detalles: mapaDetalles(resp?.ranking.codigos ?? []),
    };
  }, [resp]);

  const delGrupo = useMemo(() => {
    if (!resp || !marcaSel) return null;
    return {
      categorias: rehidratar(indices.categorias.get(marcaSel) ?? []),
      codigos: rehidratar(indices.codigos.get(marcaSel) ?? [], indices.detalles),
      compCategorias: rehidratarComparativo(indices.compCategorias.get(marcaSel) ?? []),
      compCodigos: rehidratarComparativo(indices.compCodigos.get(marcaSel) ?? []),
    };
  }, [resp, marcaSel, indices]);

  const categorias = delGrupo ? delGrupo.categorias : resp?.ranking.categorias;
  const codigos = delGrupo ? delGrupo.codigos : resp?.ranking.codigos;
  const base = vista === "categoria" ? categorias : codigos;
  const baseComparativa = delGrupo
    ? vista === "categoria"
      ? delGrupo.compCategorias
      : delGrupo.compCodigos
    : vista === "categoria"
      ? resp?.comparativo?.categorias
      : resp?.comparativo?.codigos;

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

  // Los totales del pulso son los de la marca elegida, calculados en el servidor
  // con la misma función que los de "Todas" — no una resta de la pantalla.
  const totales = marcaSel
    ? grupos.find(g => g.id === marcaSel)?.totales
    : resp?.ranking.totales;
  const totalesAnterior = marcaSel
    ? (resp?.comparativo?.porMarca?.grupos.find(g => g.id === marcaSel)?.totales ?? null)
    : (resp?.comparativo?.totales ?? null);
  const nombreMarca = marcaSel ? (grupos.find(g => g.id === marcaSel)?.nombre ?? null) : null;

  // ── Las cuatro respuestas de arriba. Se calculan sobre la lista COMPLETA del
  //    agrupador (sin el buscador ni el filtro de la tabla): son el resumen del
  //    período, no del filtro que alguien dejó puesto abajo.
  const topUnidades = useMemo(
    () => (base && totales ? topPor(base, "unidades", TOP_VISIBLE, totales.unidades) : []),
    [base, totales],
  );
  const topUtilidad = useMemo(
    () => (base && totales ? topPor(base, "utilidad", TOP_VISIBLE, totales.utilidad) : []),
    [base, totales],
  );
  const flojos = useMemo(
    () =>
      base && totales
        ? margenFlojo(base, totales.margen, { entreLosPrimeros: ALERTA_ENTRE, maximo: ALERTA_MAX })
        : [],
    [base, totales],
  );
  const cambios = useMemo(
    () => (base && baseComparativa ? movimientos(base, baseComparativa, MOVIMIENTOS_N) : null),
    [base, baseComparativa],
  );

  // Las categorías del desplegable salen del MISMO payload, ordenadas por lo que
  // más se vende (no alfabéticas): las que Daniel va a buscar están arriba. Con
  // una marca elegida son SUS categorías — ofrecer una que no tiene sería un
  // filtro que deja la tabla vacía sin explicar por qué.
  const categoriasDisponibles = useMemo(
    () => (categorias ?? []).map(c => c.etiqueta),
    [categorias],
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
    setDetalleAbierto(false);
  };

  const cambiarPeriodo = (p: Periodo) => {
    onPeriodoChange(p);
    setVisibles(TANDA);
  };

  /** Un toque cambia de marca. El agrupador y el orden se CONSERVAN —quien está
   *  mirando artículos por utilidad quiere seguir viéndolos así en la otra
   *  marca—, pero el buscador y el filtro de categoría se limpian: son textos de
   *  la marca anterior y dejarían la tabla vacía sin decir por qué. */
  const cambiarMarca = (g: GrupoMarcaId | null) => {
    setMarca(g);
    setTexto("");
    setCategoria("");
    setVisibles(TANDA);
  };

  const sustantivo = vista === "categoria" ? "categorías" : "artículos";

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

      {/* Período. Va PRIMERO porque enmarca todo lo de abajo: los tres números
          del pulso dependen de él y no del agrupador. Se esconde para la ventana
          acotada — ahí solo existe el mes en curso, y una píldora que no se puede
          elegir es ruido. Esconderla NO es el candado: el servidor aplasta
          `periodo=12m` a "mes" para ese rol. */}
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

      {/* MARCA. Va arriba de todo lo demás porque filtra todo lo demás — el
          mismo lugar y la misma lógica que el período. Y no es solo un control:
          muestra la venta y el MARGEN de cada marca, que es el hallazgo que el
          filtro existe para dejar a la vista (Karl Lagerfeld y Reebok venden
          $78.496 al año con 23,4% y 18,2% de margen contra el 37,8% de Tommy).
          Esconderlo dentro de un selector habría sido tapar justo eso. */}
      {conFiltro && (
        <SelectorMarcas
          grupos={grupos}
          totalPeriodo={resp?.ranking.totales.venta ?? 0}
          totalUnidades={resp?.ranking.totales.unidades ?? 0}
          margenGeneral={resp?.ranking.totales.margen ?? null}
          seleccion={marcaSel}
          onSeleccion={cambiarMarca}
          loading={loading}
        />
      )}

      <div className={cn("space-y-3", loading && "opacity-60 transition-opacity")}>
        <h3 className="font-display text-base font-semibold text-gray-950">
          Más vendido · {nombreMarca ? `${nombreMarca} · ` : ""}{rotuloPeriodo}
        </h3>

        {totales && (
          <Pulso
            totales={totales}
            comparativo={resp?.comparativo ?? null}
            totalesAnterior={totalesAnterior}
          />
        )}

        {/* Se dice de dónde sale el número Y qué se le restó. Las devoluciones
            YA están descontadas; sin la nota, alguien va a sumar el período a
            mano contra Switch y no le va a cuadrar. */}
        <p className="text-xs text-gray-400">
          Ventas netas: las devoluciones (notas de crédito) ya están restadas. El margen es la utilidad dividida entre
          la venta.
        </p>
      </div>

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
        {/* "Por departamento" y ya no "Por marca": lo que Switch guarda en su
            campo `marca` son 32 valores del tipo `TH MENSWEAR`, o sea marca +
            departamento pegados. Con el filtro de marca arriba, llamarle "marca"
            a las dos cosas dejaba un control mintiendo. */}
        <Pill activo={vista === "marca"} onClick={() => cambiarVista("marca")}>
          <Tag className="h-3.5 w-3.5" /> Por departamento
        </Pill>
      </div>

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
        <VistaMarca
          renglones={(resp?.marcas ?? []).filter(m => !marcaSel || m.grupo === marcaSel)}
          loading={loading}
          periodo={rotuloPeriodo}
        />
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60 pointer-events-none transition-opacity")}>
          {resp && base && base.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-gray-700">No hubo ventas en {rotuloPeriodo}.</p>
            </Card>
          ) : (
            <>
              {/* Las dos preguntas separadas: volumen y plata. Una debajo de la
                  otra hasta `lg` — ver las decisiones de ancho del encabezado. */}
              <div className="grid gap-3 lg:grid-cols-2">
                <ListaTop
                  titulo="Lo que más se vende"
                  ayuda={`Por piezas. Suman el ${fmtPctTotal(sumaPct(topUnidades))} de las unidades del período.`}
                  filas={topUnidades}
                  unidad="piezas"
                  vista={vista}
                />
                <ListaTop
                  titulo="Lo que más plata deja"
                  ayuda={`Por utilidad. Suman el ${fmtPctTotal(sumaPct(topUtilidad))} de la utilidad del período.`}
                  filas={topUtilidad}
                  unidad="plata"
                  vista={vista}
                />
              </div>

              <MargenFlojo filas={flojos} margenGeneral={totales?.margen ?? null} sustantivo={sustantivo} />

              {cambios && resp?.comparativo && (
                <Movimientos cambios={cambios} comparativo={resp.comparativo} sustantivo={sustantivo} />
              )}

              {/* El detalle completo, cerrado. Sigue estando todo: buscador,
                  filtro, orden por columna y paginado. */}
              <Card className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setDetalleAbierto(v => !v)}
                  aria-expanded={detalleAbierto}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-950">
                    Ver todo
                    <span className="ml-2 font-normal text-gray-500">
                      {(base?.length ?? 0).toLocaleString("en-US")} {sustantivo}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-gray-500 transition-transform",
                      detalleAbierto && "rotate-180",
                    )}
                  />
                </button>

                {detalleAbierto && (
                  <div className="space-y-3 border-t border-gray-200 bg-gray-50/60 p-3">
                    {/* Buscador + filtro por categoría. Solo en "Por artículo":
                        es la vista que tiene ~3.900 renglones, y es la pregunta
                        que sigue a la de categoría. */}
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
                            // 44 px de alto y letra de 16 px en celular: por
                            // debajo de 16, iOS hace zoom solo al enfocar y deja
                            // la pantalla corrida.
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

                    <VistaRanking
                      vista={vista}
                      filas={filas}
                      totalSinFiltrar={base?.length ?? 0}
                      visibles={visibles}
                      onVerMas={() => setVisibles(v => v + TANDA)}
                      orden={orden}
                      onOrdenar={clic}
                    />
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Qué parte del total juntan los que se muestran. `null` si alguno no lo sabe
 *  (total no positivo) — no se suman "—" como si fueran ceros. */
function sumaPct(filas: TopFila[]): number | null {
  if (filas.length === 0) return null;
  let acc = 0;
  for (const f of filas) {
    if (f.pctDelTotal == null) return null;
    acc += f.pctDelTotal;
  }
  return acc;
}

// ── 1. El pulso: cómo vamos ─────────────────────────────────────────────────

function Pulso({
  totales,
  comparativo,
  totalesAnterior,
}: {
  totales: TotalesRanking;
  comparativo: Comparativo | null;
  /** Los totales del MISMO corte (marca elegida o todas) un año antes. Se pasa
   *  aparte de `comparativo` porque `comparativo.totales` es siempre el del
   *  período completo: con Tommy elegido, comparar contra el todo daría una
   *  caída del 35% que es puro artefacto del filtro. */
  totalesAnterior: TotalesRanking | null;
}) {
  const c = totalesAnterior;
  return (
    <Card className="overflow-hidden p-0">
      {/* Celdas apiladas en celular y en fila desde `sm`: tres montos de cinco
          cifras con centavos no entran en 358 px útiles ni con la letra al
          piso, y esta pantalla es de plata (nada de "$33.2K"). */}
      <div className="divide-y divide-gray-100 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <CeldaPulso
          rotulo="Unidades"
          valor={fmtUnidades(totales.unidades)}
          tono="volumen"
          delta={c ? variacion(totales.unidades, c.unidades) : null}
          anterior={c ? `${fmtUnidades(c.unidades)} piezas` : null}
          fmtAbs={fmtUnidadesConSigno}
        />
        <CeldaPulso
          rotulo="Venta"
          valor={fmtMoney(totales.venta)}
          tono="plata"
          delta={c ? variacion(totales.venta, c.venta) : null}
          anterior={c ? fmtMoney(c.venta) : null}
          fmtAbs={fmtMontoConSigno}
        />
        <CeldaPulso
          rotulo="Utilidad"
          valor={fmtMoney(totales.utilidad)}
          tono="plata"
          delta={c ? variacion(totales.utilidad, c.utilidad) : null}
          anterior={c ? fmtMoney(c.utilidad) : null}
          fmtAbs={fmtMontoConSigno}
        />
      </div>

      {/* El margen va en su propia línea y no como cuarta celda: es una
          proporción, no un monto, y meterlo entre los tres montos lo hacía
          leerse como uno más. Su comparación va en PUNTOS, que es como se
          compara un porcentaje contra otro. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-gray-200 bg-gray-50 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Margen</span>
        <span className="font-mono text-sm font-medium tabular-nums text-gray-950">
          {fmtMargen(totales.margen)}
        </span>
        {c && (
          <span className="text-xs text-gray-500">
            {c.margen == null || totales.margen == null ? (
              <>el año pasado {fmtMargen(c.margen)}</>
            ) : (
              <>
                <span className={cn("font-mono tabular-nums", tonoVariacion(totales.margen - c.margen))}>
                  {flechaVariacion(totales.margen - c.margen)}{" "}
                  {(totales.margen - c.margen >= 0 ? "+" : "−")}
                  {Math.abs((totales.margen - c.margen) * 100).toFixed(1)} puntos
                </span>{" "}
                contra {fmtMargen(c.margen)} el año pasado
              </>
            )}
          </span>
        )}
      </div>

      {/* Contra QUÉ se compara, con las dos fechas. Sin esta línea, "−12%" es un
          número sin período: nadie puede verificarlo ni repetirlo. */}
      <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        {comparativo ? (
          <>
            Comparado con {fmtFecha(comparativo.desde)} – {fmtFecha(comparativo.hasta)}
            {comparativo.parcial && " (los mismos días del año pasado, para que sea comparable)"}
            {/* Una marca que no existía el año pasado no tiene contra qué
                compararse, y decirlo es más útil que dejar tres "sin
                comparación" sueltos arriba sin explicación. */}
            {!c && ". En ese período esta marca no vendió nada."}
          </>
        ) : (
          "Sin comparación contra el año pasado en este momento."
        )}
      </div>
    </Card>
  );
}

function CeldaPulso({
  rotulo,
  valor,
  tono,
  delta,
  anterior,
  fmtAbs,
}: {
  rotulo: string;
  valor: string;
  /** "plata" va en el acento de la app; "volumen" en gris. Son unidades
   *  distintas y verlas iguales es la mitad del problema que se vino a
   *  arreglar (unidades y dólares compitiendo en la misma fila). */
  tono: "plata" | "volumen";
  delta: Variacion | null;
  anterior: string | null;
  fmtAbs: (n: number) => string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{rotulo}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl font-medium leading-tight tabular-nums",
          tono === "plata" ? "text-teal-800" : "text-gray-950",
        )}
      >
        {valor}
      </p>
      {delta && anterior ? (
        <p className="mt-1 text-xs text-gray-500">
          <span className={cn("font-mono font-medium tabular-nums", tonoVariacion(delta.pct ?? delta.abs))}>
            {flechaVariacion(delta.pct ?? delta.abs)}{" "}
            {delta.pct != null ? fmtVariacionPct(delta.pct, true, 1) : fmtAbs(delta.abs)}
          </span>{" "}
          contra <span className="font-mono tabular-nums">{anterior}</span> el año pasado
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-400">Sin comparación</p>
      )}
    </div>
  );
}

// ── 2. Los primeros 5 de cada corte ─────────────────────────────────────────

function ListaTop({
  titulo,
  ayuda,
  filas,
  unidad,
  vista,
}: {
  titulo: string;
  ayuda: string;
  filas: TopFila[];
  unidad: "piezas" | "plata";
  vista: Vista;
}) {
  if (filas.length === 0) return null;
  const esPlata = unidad === "plata";
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="font-display text-sm font-semibold text-gray-950">{titulo}</h4>
        <p className="mt-0.5 text-xs text-gray-500">{ayuda}</p>
      </div>
      <ol className="divide-y divide-gray-100">
        {filas.map((f, i) => (
          <li key={f.clave} className="px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-gray-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-950" title={f.etiqueta}>
                {f.etiqueta}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-sm font-medium tabular-nums",
                  esPlata ? "text-teal-800" : "text-gray-950",
                )}
              >
                {esPlata ? fmtMoney(f.valor) : fmtUnidades(f.valor)}
              </span>
            </div>
            {/* La barra va DEBAJO y a lo ancho: en la misma línea que el monto
                le quedarían ~60 px y dejaría de comparar nada. */}
            <div className="mt-1.5 flex items-center gap-2 pl-6">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <div
                  className={cn("h-full rounded-full", esPlata ? "bg-teal-600" : "bg-gray-400")}
                  style={{ width: `${(f.fraccion * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">
                {fmtPctTotal(f.pctDelTotal)} del total
              </span>
            </div>
            {/* La segunda cifra, la que la otra lista responde: quien vende
                mucho puede dejar poco, y verlo acá es medio hallazgo. */}
            <p className="mt-0.5 pl-6 text-xs text-gray-500">
              {esPlata ? (
                <>
                  {fmtUnidades(f.unidades)} piezas · margen{" "}
                  <span className="font-mono tabular-nums">{fmtMargen(f.margen)}</span>
                </>
              ) : (
                <>
                  {fmtMoney(f.venta)} de venta · margen{" "}
                  <span className="font-mono tabular-nums">{fmtMargen(f.margen)}</span>
                </>
              )}
              {vista === "articulo" && f.detalle && <> · {f.detalle}</>}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── 3. Se vende mucho pero deja poco ────────────────────────────────────────

function MargenFlojo({
  filas,
  margenGeneral,
  sustantivo,
}: {
  filas: ReturnType<typeof margenFlojo>;
  margenGeneral: number | null;
  sustantivo: string;
}) {
  if (filas.length === 0 || margenGeneral == null) return null;
  return (
    <Card className="overflow-hidden border-amber-200 p-0">
      <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
        <div className="min-w-0">
          <h4 className="font-display text-sm font-semibold text-amber-950">
            Se vende mucho pero deja poco
          </h4>
          {/* La regla se dice completa. Una advertencia cuyo criterio no se ve
              es una advertencia en la que nadie confía. */}
          <p className="mt-0.5 text-xs text-amber-900">
            {sustantivo === "categorías" ? "Categorías" : "Artículos"} entre los {ALERTA_ENTRE} más vendidos
            del período con margen por debajo del margen general (
            <span className="font-mono tabular-nums">{fmtMargen(margenGeneral)}</span>).
          </p>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {filas.map(f => (
          <li key={f.clave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-950" title={f.etiqueta}>
              {f.etiqueta}
            </span>
            <span className="font-mono text-sm font-medium tabular-nums text-amber-800">
              {fmtMargen(f.margen)}
            </span>
            <p className="w-full text-xs text-gray-500">
              N.º {f.puesto} en unidades · {fmtUnidades(f.unidades)} piezas ·{" "}
              {fmtMoney(f.venta)} de venta · {fmtMoney(f.utilidad)} de utilidad
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── 4. Qué movió la aguja ───────────────────────────────────────────────────

function Movimientos({
  cambios,
  comparativo,
  sustantivo,
}: {
  cambios: ReturnType<typeof movimientos>;
  comparativo: Comparativo;
  sustantivo: string;
}) {
  if (cambios.subieron.length === 0 && cambios.bajaron.length === 0) return null;
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="font-display text-sm font-semibold text-gray-950">Lo que más cambió</h4>
        <p className="mt-0.5 text-xs text-gray-500">
          {sustantivo === "categorías" ? "Categorías" : "Artículos"} con la mayor diferencia de venta
          contra {fmtFecha(comparativo.desde)} – {fmtFecha(comparativo.hasta)}. En dólares, no en
          porcentaje: lo que sube 400% desde $40 no mueve el mes.
        </p>
      </div>
      <div className="grid divide-y divide-gray-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <ColumnaMovimiento titulo="Subió" filas={cambios.subieron} />
        <ColumnaMovimiento titulo="Bajó" filas={cambios.bajaron} />
      </div>
    </Card>
  );
}

function ColumnaMovimiento({
  titulo,
  filas,
}: {
  titulo: string;
  filas: ReturnType<typeof movimientos>["subieron"];
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      {filas.length === 0 ? (
        <p className="mt-1 text-xs text-gray-400">Nada por acá.</p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {filas.map(m => (
            <li key={m.clave}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-950" title={m.etiqueta}>
                  {m.etiqueta}
                </span>
                <span className={cn("shrink-0 font-mono text-sm font-medium tabular-nums", tonoVariacion(m.abs))}>
                  {fmtMontoConSigno(m.abs)}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {m.nuevo ? (
                  <>no se vendía el año pasado</>
                ) : m.desaparecido ? (
                  <>dejó de venderse · el año pasado {fmtMoney(m.ventaAnterior)}</>
                ) : (
                  <>
                    <span className={cn("font-mono tabular-nums", tonoVariacion(m.pct))}>
                      {fmtVariacionPct(m.pct, true, 1)}
                    </span>{" "}
                    · {fmtMoney(m.ventaAnterior)} → {fmtMoney(m.ventaActual)}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 5. El detalle: tabla (categoría / artículo) ─────────────────────────────

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
}: {
  vista: Vista;
  filas: RenglonRanking[];
  totalSinFiltrar: number;
  visibles: number;
  onVerMas: () => void;
  orden: { col: ColumnaRanking; dir: DireccionOrden };
  onOrdenar: (c: ColumnaRanking) => void;
}) {
  const cols = COLUMNAS.filter(c => vista === "categoria" || !c.soloCategoria).map(c =>
    c.col === "etiqueta" ? { ...c, titulo: vista === "categoria" ? "Categoría" : "Artículo" } : c,
  );
  const mostradas = filas.slice(0, visibles);

  if (filas.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-700">Ningún artículo coincide con la búsqueda.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
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

// ── Vista por DEPARTAMENTO ──────────────────────────────────────────────────
//
// Es el agrupador que antes se llamaba "por marca" (#420). Los números no
// cambiaron; el nombre sí, porque el campo `marca` de Switch guarda 32 valores
// del tipo `TH MENSWEAR` = marca + departamento pegados. Con el filtro de marca
// arriba, llamarle "marca" a estos 32 dejaba dos controles diciendo cosas
// distintas con la misma palabra.
//
// Lo único que cambió del dato: los departamentos que Switch tiene escritos de
// dos formas (`TH ACCESORIES` / `TH ACCESSORIES`) se muestran juntos — aprobado
// por Daniel, con lista EXPLÍCITA en marcas-grupo.ts.

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
                <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Departamento</th>
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

// ── El filtro de marca ──────────────────────────────────────────────────────

/**
 * Las marcas del período, y el filtro de la pantalla: son la MISMA cosa.
 *
 * 🩸 **Un solo control.** La tentación era píldoras arriba (el filtro) y una
 * tabla de marcas abajo (los números). Serían dos controles para la misma
 * decisión, y en este módulo eso ya se pagó una vez: con dos selectores de
 * período en pantalla, uno de los dos siempre está desactualizado (CLAUDE.md,
 * "Mes a mes"). Acá se toca lo que se está leyendo.
 *
 * **Y muestra el margen a propósito.** Medido: Karl Lagerfeld y Reebok venden
 * $78.496 al año con 23,4% y 18,2% de margen contra el 37,8% de Tommy. Ese
 * hallazgo no puede vivir dentro de un desplegable — se ve al abrir la pantalla,
 * sin tocar nada.
 *
 * El ámbar es el MISMO criterio que la alerta de más abajo: por debajo del margen
 * general del período, que es el número contra el que un dueño mide su negocio.
 */
function SelectorMarcas({
  grupos,
  totalPeriodo,
  totalUnidades,
  margenGeneral,
  seleccion,
  onSeleccion,
  loading,
}: {
  grupos: TotalesMarca[];
  totalPeriodo: number;
  totalUnidades: number;
  margenGeneral: number | null;
  seleccion: GrupoMarcaId | null;
  onSeleccion: (g: GrupoMarcaId | null) => void;
  loading: boolean;
}) {
  // Por venta, de mayor a menor: el orden en que un dueño las nombra. Desempate
  // por nombre, para que dos marcas parejas no se intercambien entre renders.
  const orden = [...grupos].sort(
    (a, b) => b.totales.venta - a.totales.venta || a.nombre.localeCompare(b.nombre, "es"),
  );

  return (
    <Card className={cn("overflow-hidden p-0", loading && "opacity-60 transition-opacity")}>
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="font-display text-sm font-semibold text-gray-950">Marcas</h4>
        <p className="mt-0.5 text-xs text-gray-500">
          Tocá una marca y todo lo de abajo muestra solo lo suyo.
          {margenGeneral != null && (
            <>
              {" "}En <span className="text-amber-700">ámbar</span>, el margen por debajo del general
              del período (<span className="font-mono tabular-nums">{fmtMargen(margenGeneral)}</span>).
            </>
          )}
        </p>
      </div>
      {/* Una columna hasta `xl`. A 1216 px útiles la fila de una sola columna
          deja ~900 px de blanco entre el nombre y el monto —el ojo pierde de
          vista qué monto es de quién—, así que ahí van dos columnas. NO antes:
          a 610 px útiles (iPad) dos columnas dejan ~300 y el renglón de "% del
          total · N piezas" empieza a recortarse. */}
      <div
        role="group"
        aria-label="Filtrar por marca"
        className="divide-y divide-gray-100 xl:grid xl:grid-cols-2 xl:divide-y-0 xl:[&>*]:border-b xl:[&>*]:border-gray-100 xl:[&>*:nth-child(odd)]:border-r"
      >
        <FilaMarcaFiltro
          nombre="Todas las marcas"
          venta={totalPeriodo}
          pct={totalPeriodo > 0 ? 1 : null}
          unidades={totalUnidades}
          margen={margenGeneral}
          margenGeneral={margenGeneral}
          activo={seleccion == null}
          onClick={() => onSeleccion(null)}
        />
        {orden.map(g => (
          <FilaMarcaFiltro
            key={g.id}
            nombre={g.nombre}
            venta={g.totales.venta}
            pct={totalPeriodo > 0 ? g.totales.venta / totalPeriodo : null}
            unidades={g.totales.unidades}
            margen={g.totales.margen}
            margenGeneral={margenGeneral}
            activo={seleccion === g.id}
            // Tocar la marca ya elegida vuelve a "todas": el camino de vuelta es
            // el mismo dedo, sin buscar dónde se quita el filtro.
            onClick={() => onSeleccion(seleccion === g.id ? null : g.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function FilaMarcaFiltro({
  nombre,
  venta,
  pct,
  unidades,
  margen,
  margenGeneral,
  activo,
  onClick,
}: {
  nombre: string;
  venta: number;
  pct: number | null;
  unidades: number;
  margen: number | null;
  margenGeneral: number | null;
  activo: boolean;
  onClick: () => void;
}) {
  const flojo = margen != null && margenGeneral != null && margen < margenGeneral;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      // 44 px de alto: es el control que más se toca de la pestaña, y en este
      // módulo ya hubo píldoras de 26 px (CLAUDE.md).
      className={cn(
        "block min-h-[44px] w-full px-4 py-2.5 text-left transition",
        activo ? "bg-teal-50" : "hover:bg-gray-50",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            activo ? "font-semibold text-teal-900" : "font-medium text-gray-950",
          )}
        >
          {nombre}
        </span>
        {/* Teal = plata, como en toda la pantalla. */}
        <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-teal-800">
          {fmtMoney(venta)}
        </span>
      </div>
      {/* El margen va ÚLTIMO y pegado a la derecha en las dos líneas: así las seis
          marcas lo muestran en la misma columna y se comparan de un barrido, que
          es justo lo que la pantalla vino a hacer posible. */}
      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-gray-500">
        <span className="min-w-0 truncate">
          <span className="font-mono tabular-nums">{fmtPctTotal(pct)}</span> del total ·{" "}
          <span className="font-mono tabular-nums">{fmtUnidades(unidades)}</span> piezas
        </span>
        <span className="shrink-0">
          margen{" "}
          <span className={cn("font-mono tabular-nums", flojo ? "font-medium text-amber-700" : "text-gray-700")}>
            {fmtMargen(margen)}
          </span>
        </span>
      </div>
    </button>
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
