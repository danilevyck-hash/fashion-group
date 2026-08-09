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
// 3. LA SUMA LA HACE POSTGRES, Y ESO NO CAMBIA UN CENTAVO. La ruta pide el
//    período YA AGRUPADO por (artículo, código, descripción, **tipo**) con la
//    RPC `multifashion_articulo_diario_agrupado_v1`, y la agregación de negocio
//    sigue viviendo entera en los módulos puros de siempre. Es seguro porque la
//    llave de la RPC es más FINA que la que usa el código (que además colapsa
//    espacios): lo que Postgres deja separado, el código lo junta igual que
//    antes. Y `tipo` VIAJA: la RPC suma magnitudes, nunca firma — el signo de
//    las NC lo sigue poniendo `signoDeTipo()` y nadie más.
//    · Medido contra producción el 9-ago-2026: 20.483 filas del período +
//      18.417 del comparativo + 8.454 del diccionario de marcas = **48 páginas
//      de PostgREST, una atrás de otra**, y 8,6-9,0 s de respuesta. Agrupadas
//      son 4.740 filas (4,32× menos) en UNA llamada, y las tres lecturas van en
//      paralelo.
//    · **Si la función todavía no existe** (las DDL las corre Daniel a mano) la
//      ruta se cae sola al camino paginado de siempre y lo DICE en `fuentes`.
//
//    ⚠️ EL CAMINO PAGINADO SIGUE ENTERO, y no es decorado: `db-max-rows` = 1000
//    y PostgREST corta EN SILENCIO. Sin paginar se leerían 1.000 filas de
//    20.483 y la pestaña mostraría el 4,9% de las ventas SIN UN SOLO ERROR. Por
//    eso el fallback es `leerTodoPaginado`, que verifica contra un COUNT exacto.
//
// 4. EL COMPARATIVO ES UNA LECTURA, NO UNA ESTIMACIÓN. "Qué cambió" se responde
//    leyendo el MISMO período un año antes de la MISMA tabla y agregándolo con
//    la MISMA función pura (`rangoComparativo` + `agregarRanking`). Nada se
//    proyecta ni se prorratea. Y un mes empezado se compara contra los MISMOS
//    días del año pasado: el 7 de agosto, medir 7 días contra los 31 de agosto
//    del año pasado mostraría una caída del 78% que no ocurrió.
//    · **Duplica la lectura**, y el costo está MEDIDO contra producción. Las
//      TRES lecturas (período, comparativo y diccionario de marcas) van EN
//      PARALELO —el diccionario también, que antes esperaba a las otras dos— y
//      SWR cachea 5 minutos, o sea una descarga por sesión y por período. El
//      payload al navegador NO cambia con la RPC: son las mismas cifras.
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
  RPC_MARCAS,
  RPC_PERIODO,
  esFuncionAusente,
  marcasDesdeRpc,
  periodoDesdeRpc,
  type FuenteLectura,
} from "@/lib/multifashion/productos-lectura";
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

/** Una lectura de período resuelta, venga por RPC o por el camino paginado. */
interface LecturaPeriodo {
  filas: FilaArticuloDiario[];
  /** Filas CRUDAS de la tabla (no grupos) — lo que publica `filasLeidas`. */
  filasCrudas: number;
  fuente: FuenteLectura;
}

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

  /** El período, agrupado por Postgres. UNA llamada — ver el punto 3. */
  const leerPeriodoRpc = async (d: string, h: string): Promise<LecturaPeriodo> => {
    const { data, error } = await supabaseServer.rpc(RPC_PERIODO, {
      p_empresa_key: EMPRESA,
      p_desde: d,
      p_hasta: h,
    });
    if (!error) {
      const { filas, filasCrudas } = periodoDesdeRpc(data, `${RPC_PERIODO} (${d}→${h})`);
      return { filas, filasCrudas, fuente: "rpc" };
    }
    // Solo el caso "la DDL todavía no se corrió" cae al camino lento. Cualquier
    // otro error se propaga: taparlo con 21 consultas más contra una base que
    // ya se cayó por saturación sería esconder el problema y agrandarlo.
    if (!esFuncionAusente(error)) {
      throw new Error(`${RPC_PERIODO} (${d}→${h}): ${error.message}`);
    }
    console.warn(
      `[multifashion/productos] ${RPC_PERIODO} no existe todavía (falta correr la migración 20260809140000) — se lee paginado`,
    );
    const filas = await leerPeriodoPaginado(d, h);
    return { filas, filasCrudas: filas.length, fuente: "paginado" };
  };

  /** El camino de SIEMPRE. Paginado porque `db-max-rows` = 1000 y PostgREST
   *  corta EN SILENCIO. El orden es el de la PAGINACIÓN (id, único y estable),
   *  no el de presentación: el orden que ve Daniel lo decide la agregación. */
  const leerPeriodoPaginado = (d: string, h: string) =>
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

  /** El diccionario `articulo_id → marca`. Mismo trato: una llamada, y si la
   *  función no está, las 9 páginas de siempre. */
  const leerMarcas = async (): Promise<{ marcas: FilaMarca[]; fuente: FuenteLectura }> => {
    const { data, error } = await supabaseServer.rpc(RPC_MARCAS, { p_empresa_key: EMPRESA });
    if (!error) return { marcas: marcasDesdeRpc(data, RPC_MARCAS), fuente: "rpc" };
    if (!esFuncionAusente(error)) throw new Error(`${RPC_MARCAS}: ${error.message}`);
    const marcas = await leerTodoPaginado<FilaMarca>(
      `switch_articulo_marca (${EMPRESA})`,
      (pedirCount, ini, fin) =>
        supabaseServer
          .from("switch_articulo_marca")
          .select("articulo_id, marca_id, marca_nombre", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", EMPRESA)
          .order("articulo_id", { ascending: true })
          .range(ini, fin),
    );
    return { marcas, fuente: "paginado" };
  };

  try {
    // Las TRES lecturas van EN PARALELO: son independientes, y secuenciarlas es
    // exactamente lo que hacía que esta pantalla tardara 9 s. El diccionario de
    // marcas también entra acá — antes esperaba a que terminaran las otras dos
    // para recién ahí pedir sus 9 páginas.
    // Cada `catch` va PEGADO a su promesa: sin eso, si la lectura principal
    // falla primero, las otras quedarían como rechazos sin manejar.
    const fallo: { comparativo: string | null } = { comparativo: null };

    // ── Diccionario de marcas. ADITIVO: si todavía no existe la tabla (la DDL
    //    se aplica a mano en este proyecto) o está vacía, la pestaña sigue
    //    funcionando y el agrupador por marca lo DICE, en vez de inventar la
    //    marca a partir del código del proveedor.
    let marcaDisponible = true;
    let marcaError: string | null = null;

    const [periodo1, periodoComp, dicc] = await Promise.all([
      leerPeriodoRpc(desde, hasta),
      compPermitido
        ? leerPeriodoRpc(compPermitido.inicio, compPermitido.fin).catch(err => {
            fallo.comparativo = err instanceof Error ? err.message : "error inesperado";
            console.error("[multifashion/productos] comparativo no disponible", err);
            return null;
          })
        : Promise.resolve(null),
      leerMarcas().catch(err => {
        marcaDisponible = false;
        marcaError = err instanceof Error ? err.message : "error inesperado";
        console.error("[multifashion/productos] diccionario de marcas no disponible", err);
        return null;
      }),
    ]);

    const filas = periodo1.filas;
    const filasComp = periodoComp ? periodoComp.filas : null;
    const marcas: FilaMarca[] = dicc?.marcas ?? [];
    if (marcaDisponible) marcaDisponible = marcas.length > 0;

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
      /** Filas crudas leídas — el número que prueba que no hubo truncado.
       *  Sigue contando las filas CRUDAS de la tabla, no los grupos: la RPC lo
       *  devuelve junto con la agregación, en la misma pasada. */
      filasLeidas: periodo1.filasCrudas,
      /** Por qué camino salió cada lectura: `rpc` (la suma la hizo Postgres) o
       *  `paginado` (la migración todavía no se corrió). No cambia ni un
       *  número; está para poder verlo desde afuera sin adivinar. */
      fuentes: {
        periodo: periodo1.fuente,
        comparativo: periodoComp?.fuente ?? null,
        marcas: dicc?.fuente ?? null,
      },
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
              filasLeidas: periodoComp?.filasCrudas ?? 0,
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
