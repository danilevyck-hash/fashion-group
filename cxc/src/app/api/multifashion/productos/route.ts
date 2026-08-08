// ─────────────────────────────────────────────────────────────────────────────
// Endpoint del sub-tab "Productos" de Multifashion: lo más vendido del período,
// agrupado por CATEGORÍA (la `descripcion` de Switch), por ARTÍCULO (el código)
// y por MARCA — con unidades, venta, costo, utilidad y margen.
//
// Fuente: `switch_articulo_diario` (american_classic), que mantiene al día el
// cron `switch-articulos` (08:40 UTC). No se le pide NADA a Switch en vivo.
//
// Query params (los mismos que overview / detalle-mensual, para que el selector
// de período del módulo sirva sin traducción):
//   year    int — default: año actual
//   mes     int — 1..12, default: mes en curso (año actual) / 12 (año cerrado)
//   periodo "mes" | "12m" — default "mes"
//
// ⚠️ El default del PARÁMETRO es "mes" y el de la PANTALLA es "12m", y no es un
// descuido: la ruta ya tenía llamadores (y candados) que piden un mes sin decir
// `periodo`, y cambiarle el default por debajo les habría cambiado el número que
// devuelven sin que nadie tocara esa línea. La pantalla manda `periodo=12m`
// explícito.
//
// ── LAS CUATRO COSAS QUE ESTA RUTA NO PUEDE HACER MAL ───────────────────────
//
// 1. LA VENTANA DE `gerente_acs` SE ACOTA ACÁ, EN EL SERVIDOR. Jennifer ve el
//    mes en curso y el mismo mes del año pasado. Esconder el selector en la UI
//    no cierra nada: con su cookie se llama a esta URL a mano. (Ver
//    src/lib/multifashion/ventana-gerente.ts y el candado
//    multifashion-ventana-gerente.test.ts, que exige el clamp en toda ruta nueva.)
//
//    ⚠️ **SON DOS RANGOS, y los DOS pasan por el clamp.** El comparativo contra
//    el año pasado es un período NUEVO: se deriva del ya acotado y encima vuelve
//    a validarse con `clampRangoComparativo`. La regla de esta ruta no es "la
//    ruta tiene un clamp", es **ningún rango llega a la DB sin que el rol lo
//    haya aprobado** — un `.gte()/.lte()` nuevo sin su clamp es una fuga, aunque
//    el clamp de arriba siga en su lugar.
//
// 2. LAS NOTAS DE CRÉDITO RESTAN. La tabla guarda MAGNITUDES positivas y el
//    signo lo pone la lectura, mirando `tipo`. La matemática vive en
//    `src/lib/multifashion/productos.ts` — módulo puro, con su candado.
//
// 3. SE LEE PAGINADO. `db-max-rows` = 1000 y PostgREST corta EN SILENCIO. El mes
//    más grande medido (dic-2025) tiene 5.321 filas y la ventana de 12 meses
//    **21.749** (medido contra producción el 7-ago-2026): sin paginar se
//    leerían 1.000 y la pestaña mostraría el 4,6% de las ventas SIN UN SOLO
//    ERROR. Por eso va `leerTodoPaginado`, que además verifica contra un COUNT
//    exacto.
//
// 4. EL COMPARATIVO ES UNA LECTURA, NO UNA ESTIMACIÓN. "Qué cambió" se responde
//    leyendo el MISMO período un año antes de la MISMA tabla y agregándolo con
//    la MISMA función pura (`rangoComparativo` + `agregarRanking`). Nada se
//    proyecta ni se prorratea. Y un mes empezado se compara contra los MISMOS
//    días del año pasado: el 7 de agosto, medir 7 días contra los 31 de agosto
//    del año pasado mostraría una caída del 78% que no ocurrió.
//    · **Duplica la lectura**, y el costo está MEDIDO contra producción
//      (7-ago-2026, build de producción): ventana de 12 meses = 20.445 filas +
//      18.281 del comparativo = 38.726 en total, **7,6 s** de respuesta contra
//      los 60 s de `maxDuration`. Un mes suelto: 344 + 236 filas, **1,9 s**.
//      Van EN PARALELO y SWR cachea 5 minutos, o sea una descarga por sesión y
//      por período. Payload comprimido: **129 KB → 190 KB** (el comparativo
//      viaja aliviado — clave + 3 cifras, sin costo ni margen ni etiquetas).
//    · **Falla ABIERTO**: si esa segunda lectura se cae, `comparativo` sale
//      `null`, la pantalla se dibuja completa sin los deltas y el error viaja en
//      `comparativoError`. Una comparación que no cargó nunca puede tumbar los
//      números que sí cargaron.
//
// 5. EL FILTRO DE MARCA **NO ES UN PARÁMETRO**. Las mismas filas ya leídas se
//    reparten en las 5 marcas reales (+ "Otros") y viajan particionadas en
//    `porMarca`; el navegador filtra sin red. Dos razones, y las dos pesan:
//    · un `?marca=TH` sería un rango más contra la base por cada toque —20.445
//      filas, 7,6 s— y encima una superficie nueva que tendría que pasar por el
//      clamp del punto 1;
//    · "un toque" con espera de 2 s no es un toque.
//    Lo que Switch llama "marca" son 32 valores que en realidad son MARCA +
//    DEPARTAMENTO (`TH MENSWEAR`); las marcas de verdad son cinco. El mapa es
//    EXPLÍCITO y vive en `src/lib/multifashion/marcas-grupo.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  clampPeriodoProductos,
  clampRangoComparativo,
  type PeriodoProductos,
} from "@/lib/multifashion/ventana-gerente";
// `agregarProductos` (agrupador por MARCA) sigue igual: su `FilaArticuloDiario`
// es un subconjunto de la de acá (le sobra `costo_total`), así que la MISMA
// lectura alimenta a los dos sin copiar filas ni pedirlas dos veces.
import { agregarProductos, type FilaMarca } from "@/lib/multifashion/productos";
import {
  agregarRanking,
  rango12Meses,
  rangoComparativo,
  type FilaArticuloDiario,
  type RenglonRanking,
} from "@/lib/multifashion/productos-ranking";
import type { RenglonComparativo } from "@/lib/multifashion/productos-resumen";
import {
  armarPorMarca,
  armarPorMarcaComparativo,
  departamentoCanonico,
  grupoDeDepartamento,
  mapaArticuloGrupo,
} from "@/lib/multifashion/productos-marca";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La empresa del módulo. Constante y no un parámetro: Multifashion ES
 *  american_classic, y aceptarla por query sería una fuga (gerente_acs solo
 *  puede ver esta tienda). */
const EMPRESA = "american_classic";

/** Cuántos renglones se devuelven por agrupador. El % ya se calculó contra el
 *  total COMPLETO del período antes de cortar (ver productos.ts). */
const TOP_N = 50;

const dd = (n: number) => String(n).padStart(2, "0");

/** El período de comparación viaja LIGERO: la pantalla solo parea por `clave` y
 *  resta. Mandar el renglón completo por segunda vez duplicaría un payload que
 *  ya se mide en cientos de KB (ver el comentario de costo más abajo). */
const aliviar = (filas: readonly RenglonRanking[]): RenglonComparativo[] =>
  filas.map(f => ({
    clave: f.clave,
    unidades: f.unidades,
    venta: f.venta,
    utilidad: f.utilidad,
  }));

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const yearPedido = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(yearPedido) || yearPedido < 2000 || yearPedido > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  const now = new Date();
  const isCurrent = yearPedido === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mesPedido = mesParam ? parseInt(mesParam, 10) : mesFallback;
  if (!Number.isFinite(mesPedido) || mesPedido < 1 || mesPedido > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  const periodoParam = (sp.get("periodo") ?? "mes").toLowerCase();
  if (periodoParam !== "mes" && periodoParam !== "12m") {
    return NextResponse.json({ error: "periodo inválido (mes | 12m)" }, { status: 400 });
  }

  // CANDADO gerente_acs — ver el punto 1 del encabezado. Admin no cambia en nada.
  // Se acota el PERÍODO, no solo year/mes: con `periodo=12m` la ruta ni mira
  // year/mes, así que un clamp que solo tocara esos dos no cerraría nada.
  const acotado = clampPeriodoProductos(
    auth.role,
    { periodo: periodoParam as PeriodoProductos, year: yearPedido, mes: mesPedido },
    now,
  );
  const periodo = acotado.periodo;
  const year = acotado.year;
  const mes = acotado.mes as number;

  // `fecha` es DATE pelado, así que el período se acota con dos fechas de
  // calendario (nada de timestamps ni zonas horarias: no hay hora que correr).
  const ventana = rango12Meses(now);
  const desde = periodo === "12m" ? ventana.desde : `${year}-${dd(mes)}-01`;
  const hasta =
    periodo === "12m"
      ? ventana.hasta
      : `${year}-${dd(mes)}-${dd(new Date(Date.UTC(year, mes, 0)).getUTCDate())}`;

  // ── El MISMO período un año antes (ver el punto 4 del encabezado). Se deriva
  //    del período YA ACOTADO, y aun así vuelve a pasar por el clamp: es un
  //    rango nuevo contra la base, y en esta ruta ningún rango llega a la DB sin
  //    que `auth.role` lo haya aprobado. `null` = no se consulta y no hay
  //    comparación (la pantalla se dibuja igual).
  const compRango = rangoComparativo(periodo, { year, mes, desde, hasta }, now);
  const compPermitido = clampRangoComparativo(
    auth.role,
    { inicio: compRango.desde, fin: compRango.hasta },
    now,
  );

  /** Una lectura completa del período. PAGINADO — ver el punto 3 del encabezado.
   *  El orden es el de la PAGINACIÓN (id, único y estable), no el de
   *  presentación: el orden que ve Daniel lo decide la agregación, por monto. */
  const leerPeriodo = (d: string, h: string) =>
    leerTodoPaginado<FilaArticuloDiario>(
      `switch_articulo_diario (${EMPRESA} ${d}→${h})`,
      (pedirCount, ini, fin) =>
        supabaseServer
          .from("switch_articulo_diario")
          .select(
            "articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("empresa_key", EMPRESA)
          .gte("fecha", d)
          .lte("fecha", h)
          .order("id", { ascending: true })
          .range(ini, fin),
    );

  try {
    // Los dos períodos se leen EN PARALELO: son independientes y secuenciarlos
    // duplicaría la espera de una pantalla que ya lee ~22.000 filas.
    // El `catch` de la comparación va PEGADO a su promesa: sin él, si la lectura
    // principal falla primero, la otra quedaría como rechazo sin manejar.
    const fallo: { comparativo: string | null } = { comparativo: null };
    const [filas, filasComp] = await Promise.all([
      leerPeriodo(desde, hasta),
      compPermitido
        ? leerPeriodo(compPermitido.inicio, compPermitido.fin).catch(err => {
            fallo.comparativo = err instanceof Error ? err.message : "error inesperado";
            console.error("[multifashion/productos] comparativo no disponible", err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    // ── Diccionario de marcas. ADITIVO: si todavía no existe la tabla (la DDL
    //    se aplica a mano en este proyecto) o está vacía, la pestaña sigue
    //    funcionando y el agrupador por marca lo DICE, en vez de inventar la
    //    marca a partir del código del proveedor.
    let marcas: FilaMarca[] = [];
    let marcaDisponible = true;
    let marcaError: string | null = null;
    try {
      marcas = await leerTodoPaginado<FilaMarca>(
        `switch_articulo_marca (${EMPRESA})`,
        (pedirCount, ini, fin) =>
          supabaseServer
            .from("switch_articulo_marca")
            .select("articulo_id, marca_id, marca_nombre", pedirCount ? { count: "exact" } : {})
            .eq("empresa_key", EMPRESA)
            .order("articulo_id", { ascending: true })
            .range(ini, fin),
      );
      marcaDisponible = marcas.length > 0;
    } catch (err) {
      marcaDisponible = false;
      marcaError = err instanceof Error ? err.message : "error inesperado";
      console.error("[multifashion/productos] diccionario de marcas no disponible", err);
    }

    // ── Los departamentos de Switch se CANONIZAN antes de agrupar ────────────
    //    `TH ACCESORIES` (sin la S) y `TH ACCESSORIES` son el mismo departamento
    //    escrito de dos formas: juntarlos AL MOSTRAR está aprobado por Daniel
    //    (corregirlo en Switch es tarea aparte). La lista de equivalencias es
    //    explícita y vive en marcas-grupo.ts — nada de parecido de textos.
    const marcasCanon: FilaMarca[] = marcas.map(m => ({
      ...m,
      marca_nombre: m.marca_nombre == null ? m.marca_nombre : departamentoCanonico(m.marca_nombre),
    }));

    const resumen = agregarProductos(filas, marcasCanon, TOP_N);

    // ── Los dos agrupadores que pidió Daniel ──────────────────────────────────
    // Se devuelven ENTEROS (todas las categorías y todos los códigos), no un top
    // N: la pantalla ordena por cualquier columna con un clic y busca por código
    // o descripción, y las dos cosas serían MENTIRA sobre un top recortado en el
    // servidor — "el artículo de mayor margen" saldría del top 50 por unidades,
    // no del catálogo.
    //
    // COSTO MEDIDO (7-ago-2026, ventana de 12 meses en vivo): 570 categorías + 3.925
    // códigos = **776 KB de JSON crudo, 126 KB comprimido** (Vercel comprime en
    // el borde). Con SWR cacheando 5 minutos es una descarga por sesión y por
    // período. Si algún día no alcanza, lo que hay que mover al servidor es el
    // ORDEN y el FILTRO completos — NO cortar la lista, que es lo que vuelve
    // mentira al buscador.
    const porCategoria = agregarRanking(filas, "categoria");
    const porCodigo = agregarRanking(filas, "codigo");

    // El comparativo se agrega con LA MISMA función que el período actual: dos
    // matemáticas para dos períodos que después se restan entre sí es la forma
    // más barata de inventar una diferencia que no existe.
    const compCategoria = filasComp ? agregarRanking(filasComp, "categoria") : null;
    const compCodigo = filasComp ? agregarRanking(filasComp, "codigo") : null;

    // ── EL FILTRO DE MARCA ────────────────────────────────────────────────────
    // Las mismas filas, repartidas en las 5 marcas reales (+ "Otros") y agregadas
    // con la MISMA función. Viajan CON el payload —no por otra consulta— para que
    // el filtro sea un toque y no una espera: cada cambio de marca costaría otra
    // lectura de 20.445 filas contra una base que ya se cayó por saturación.
    // Peso medido: +268 KB crudos sobre los 768 KB que la pantalla ya bajaba.
    // Si el diccionario de marcas no está, no hay filtro y la pantalla queda
    // exactamente como estaba (el cliente lo trata como ausente).
    const mapaGrupo = mapaArticuloGrupo(marcasCanon);
    const porMarca = marcaDisponible ? armarPorMarca(filas, mapaGrupo) : null;
    const porMarcaComp =
      marcaDisponible && filasComp ? armarPorMarcaComparativo(filasComp, mapaGrupo) : null;

    return NextResponse.json({
      year,
      mes,
      periodo,
      desde,
      hasta,
      /** Filas crudas leídas — el número que prueba que no hubo truncado. */
      filasLeidas: filas.length,
      marcaDisponible,
      marcaError,
      ...resumen,
      // Cada departamento dice a qué MARCA pertenece, para que el agrupador
      // "por departamento" se filtre con el mismo toque que el resto. Va DESPUÉS
      // del spread de `resumen`, que ya trae su propio `marcas`.
      marcas: resumen.marcas.map(m => ({ ...m, grupo: grupoDeDepartamento(m.marca).id })),
      porMarca,
      ranking: {
        totales: porCategoria.totales,
        categorias: porCategoria.filas,
        codigos: porCodigo.filas,
      },
      comparativo:
        compCategoria && compCodigo
          ? {
              desde: compRango.desde,
              hasta: compRango.hasta,
              parcial: compRango.parcial,
              filasLeidas: filasComp?.length ?? 0,
              totales: compCategoria.totales,
              categorias: aliviar(compCategoria.filas),
              codigos: aliviar(compCodigo.filas),
              porMarca: porMarcaComp,
            }
          : null,
      comparativoError: fallo.comparativo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/productos] fetch failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
