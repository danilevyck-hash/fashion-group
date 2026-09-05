// ─────────────────────────────────────────────────────────────────────────────
// Sync del snapshot de catálogo → `switch_articulo_info` (Fase 2 del tab
// Ventas › Referencia).
//
// Trae de `/apiarticulos/lista`, por empresa: la DESCRIPCIÓN real del catálogo
// (nombre comercial — `switch_articulo_diario.descripcion` es solo
// categoría+género), la EXISTENCIA disponible y el PRECIO de etiqueta.
//
// 🔴 `costo_api` SE GUARDA PERO NO SE MUESTRA — Y YA SABEMOS QUÉ ES: EL CIF.
// Medido el 10-ago-2026 con 3 códigos donde la pantalla de Switch muestra
// FOB ≠ CIF (scripts/_diag-fob-3-codigos.ts): la API devolvió 3.19 / 10.01 /
// 39.60 = el CIF en los 3 (el FOB era 2.90 / 9.10 / 36.00). Decisión de
// Daniel: si la API manda CIF, NO se muestra nada — y el FOB JAMÁS se deriva
// (CIF÷1.1 no revierte; los CK Jeans importaron a 17,7%, no al 10%). El FOB
// real no viaja por la API v1.0; hasta que Switch lo exponga, esta columna
// queda almacenada sin pintar.
//
// DOS disparadores (10-ago-2026 — Daniel: "es que debería ser ya automático"):
//   · CRON diario /api/cron/sync-articulo-info — 3 entradas de 2 empresas
//     (04:30/04:40/04:50 UTC), las 6 FG. Garantiza el piso de frescura.
//   · el botón "Actualizar datos de Switch" del tab (POST
//     /api/ventas/referencia/actualizar), por empresa — SE QUEDA para el dato
//     del momento antes de comprar.
// El lock es el de siempre en los dos caminos: la fila 'running' de
// `switch_sync_log` (índice único parcial) — sesión única de Switch por empresa.
//
// Patrón heredado de sync-articulo-marca.ts (los mismos gotchas medidos):
//   · el endpoint ignora `porPagina` → el corte es por página VACÍA;
//   · el catálogo REPITE renglones (221 ids repetidos medidos) → dedupe antes
//     del upsert o el ON CONFLICT revienta el lote;
//   · UPSERT, nunca DELETE: un artículo descatalogado conserva su última foto;
//   · guard de barrido corto: una página vacía a mitad de camino no puede
//     anotarse `success` con medio catálogo.
// ─────────────────────────────────────────────────────────────────────────────

import { createSwitchClient, type SwitchClient } from "./client";
import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";
import { particionarFilas } from "./monto-guard";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { enParalelo } from "./en-paralelo";

/** Paginación real del endpoint (manda ~50 aunque se pida más). */
const PER_PAGE = 50;

/** Cota de páginas (american_classic, el catálogo más grande del grupo, mide
 *  183). Si se alcanza, error en vez de escribir a medias. */
const MAX_PAGES = 400;

const UPSERT_BATCH = 500;

/** Piso de "el barrido llegó al final" contra lo YA guardado — el mismo 70%
 *  holgado de sync-articulo-marca (la tabla solo crece; un barrido cortado a
 *  la mitad cae muy por debajo). */
const PISO_BARRIDO = 0.7;

/** Existencia por encima de esto no es una existencia: es el bug de los
 *  4,46 billones que Switch ya mandó una vez (active_shoes, 27-jul-2026).
 *  Son UNIDADES, no plata — por eso no pasa por el guard de montos y el número
 *  es propio (500k piezas de UN artículo en UNA empresa no existen en este
 *  negocio). La fila se guarda igual con existencia NULL — el precio y la
 *  descripción siguen siendo buenos y "sin dato" es más honesto que un número
 *  absurdo. */
export const EXISTENCIA_MAX = 500_000;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FICHA DEL ARTÍCULO (rubro / subrubro / marca) — 2-sep-2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🩸 **`/apiarticulos/lista` NO TRAE ESTOS TRES CAMPOS, y está medido.** El
 * encabezado de `getArticuloInfo` en `client.ts` lo dice desde el 6-ago-2026:
 * sobre los 9.126 artículos de american_classic, `marcaId` viene en el 100% y
 * el campo `marca` está **ausente en el 100%**; `rubro`/`subrubro` tampoco
 * vienen. O sea: el barrido de páginas que este sync ya hace **no puede** dar
 * la clasificación, por más que se le agreguen columnas. El único endpoint que
 * la da es `/apiarticulos/info`, y va **de a UNO** por código de barra.
 *
 * Por eso la ficha se pide en una SEGUNDA fase, con tres frenos:
 *   1. **Solo las empresas que la usan** (`EMPRESAS_CON_FICHA`). Pedirle la
 *      ficha a los 8.254 artículos de vistana serían 8.254 requests para un
 *      dato que nadie lee.
 *   2. **Solo a quien todavía no la tiene** (`ficha_at IS NULL`), y primero a
 *      los que tienen existencia — que son los que se ven en el catálogo. El
 *      rubro de un artículo no cambia solo; el catálogo sí crece. En régimen
 *      esta fase pide 0 fichas. Es la MISMA estrategia con la que
 *      `sync-articulo-marca` traduce los marcaId nuevos (33 la primera vez, 0
 *      después).
 *   3. **Un presupuesto duro**, de cantidad y de reloj. La función tiene 800 s
 *      y el barrido de páginas ya se come una parte; si la primera corrida no
 *      alcanza a drenar la cola, drena la de mañana. Nunca al revés: preferimos
 *      tardar dos noches en clasificar que tumbar el sync que trae el precio.
 *
 * ⚠️ Un `/info` que falla NO tumba el sync (misma decisión que
 * `sync-articulo-marca`): ese artículo queda sin ficha y se reintenta mañana.
 * Perder el snapshot entero de precios por una ficha sería peor.
 */
export const EMPRESAS_CON_FICHA: readonly string[] = ["active_shoes"];

/** De a cuántas fichas en paralelo. Por debajo del 8 de `/stock`: esta fase
 *  corre DESPUÉS del barrido de páginas dentro de la misma sesión, y la regla
 *  de la casa con un ERP ajeno es quedarse por debajo del borde. */
const FICHA_CONCURRENCIA = 4;

/** Tope de fichas por corrida. 400 cubre de una vez el universo con existencia
 *  de active_shoes (237 el 2-sep-2026) con aire, y frena en seco el día que
 *  alguien agregue una empresa de 8.000 artículos a `EMPRESAS_CON_FICHA`. */
const FICHA_MAX_POR_CORRIDA = 400;

/** Reloj de pared para la fase de fichas. Se corta apenas se pasa y lo que
 *  quedó se pide mañana. NO es un timeout por llamada: es el presupuesto del
 *  bloque, que es lo que protege el techo de la función. */
const FICHA_PRESUPUESTO_MS = 240_000;

/** Un renglón del catálogo, con lo que este sync consume. */
export interface ArticuloInfoCrudo {
  id: number;
  codigo: string | null;
  descripcion: string | null;
  /** `disponible` = existencia física − comprometido (string numérico). */
  disponible: string | null;
  precio: string | null;
  costo: string | null;
  /** EAN — la llave de `/apiarticulos/info`, que va por código de barra y no
   *  por id. Sin él no hay forma de pedir la ficha de ese artículo. */
  codigoBarra?: string | null;
}

/** Fila lista para el upsert. PURO — testeable sin base. */
export interface FilaArticuloInfo {
  empresa_key: string;
  articulo_id: number;
  codigo: string;
  descripcion: string | null;
  existencia: number | null;
  precio_etiqueta: number | null;
  /** Crudo del endpoint. NO SE MUESTRA (ver encabezado). */
  costo_api: number | null;
  synced_at: string;
  updated_at: string;
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Traducción cruda → fila, PURA. Aplica el techo de existencia con nombre. */
export function filaDeArticulo(empresaKey: string, a: ArticuloInfoCrudo, ahoraIso: string): FilaArticuloInfo | null {
  const codigo = (a.codigo ?? "").trim();
  if (!codigo) return null; // sin código no hay llave — no se adivina
  const exist = num(a.disponible);
  return {
    empresa_key: empresaKey,
    articulo_id: a.id,
    codigo,
    descripcion: (a.descripcion ?? "").trim() || null,
    existencia: exist != null && Math.abs(exist) <= EXISTENCIA_MAX ? exist : null,
    precio_etiqueta: num(a.precio),
    costo_api: num(a.costo),
    synced_at: ahoraIso,
    updated_at: ahoraIso,
  };
}

/** Un renglón por código (el catálogo repite renglones; gana la ÚLTIMA
 *  aparición — la semántica del upsert renglón a renglón). PURO. */
export function dedupePorCodigo(filas: readonly FilaArticuloInfo[]): FilaArticuloInfo[] {
  const porCodigo = new Map<string, FilaArticuloInfo>();
  for (const f of filas) porCodigo.set(f.codigo, f);
  return [...porCodigo.values()];
}

/** Fila de ficha lista para el upsert PARCIAL (solo estas columnas; el upsert
 *  choca siempre contra la fila que el barrido acaba de escribir, así que no
 *  toca ni la descripción, ni el precio, ni la existencia). */
export interface FilaFicha {
  empresa_key: string;
  codigo: string;
  rubro: string | null;
  subrubro: string | null;
  marca: string | null;
  ficha_at: string;
}

/** Texto crudo de Switch, sin traducir. Vacío ⇒ null (no `""`: la clasificación
 *  distingue "no vino" de "vino vacío" y las dos cosas caen igual, pero un `""`
 *  guardado se ve como un dato y no lo es). */
const texto = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * ¿La tabla ya tiene las columnas de la ficha? En este proyecto las DDL las
 * corre Daniel a mano, así que entre el deploy y el SQL hay días. Sin esta
 * sonda, la fase de fichas le pediría a Switch cientos de artículos para morir
 * recién en el upsert: llamadas tiradas y una sesión abierta para nada.
 *
 * Es un SELECT real con `limit`, NUNCA un `head:true` (medido el 9-ago-2026: un
 * HEAD contra algo que no existe devuelve 204 sin error — silencio total).
 * Fail-CERRADO: cualquier error deja la fase apagada y el resto del sync
 * intacto.
 */
export async function fichaColumnasListas(): Promise<boolean> {
  const { error } = await supabaseServer
    .from("switch_articulo_info")
    .select("rubro, subrubro, marca, ficha_at")
    .limit(1);
  return !error;
}

/**
 * A quién le falta la ficha, en el ORDEN en que conviene pedirla: primero los
 * que tienen existencia (los que se ven en el catálogo), después el resto.
 * PURA — recibe el universo y lo ya guardado, no lee nada.
 */
export function pendientesDeFicha(
  universo: readonly { codigo: string; existencia: number | null; codigoBarra: string | null }[],
  yaConFicha: ReadonlySet<string>,
  tope: number,
): Array<{ codigo: string; codigoBarra: string }> {
  const faltan = universo.filter(
    (a) => !yaConFicha.has(a.codigo) && !!a.codigoBarra,
  );
  const conExistencia = faltan.filter((a) => (a.existencia ?? 0) >= 1);
  const resto = faltan.filter((a) => (a.existencia ?? 0) < 1);
  return [...conExistencia, ...resto]
    .slice(0, tope)
    .map((a) => ({ codigo: a.codigo, codigoBarra: a.codigoBarra as string }));
}

/** Resultado de la fase de fichas (telemetría; va al resultado del sync). */
export interface FichasResult {
  /** false = las columnas todavía no existen; NO se le pidió nada a Switch. */
  columnasListas: boolean;
  pendientes: number;
  pedidas: number;
  escritas: number;
  fallidas: number;
  /** true = se cortó por presupuesto (de cantidad o de reloj) y quedó cola. */
  cortadaPorPresupuesto: boolean;
}

/** Pide las fichas que falten y las guarda. NUNCA lanza: devuelve qué pasó. */
export async function traerFichas(
  empresaKey: string,
  client: SwitchClient,
  universo: readonly { codigo: string; existencia: number | null; codigoBarra: string | null }[],
): Promise<FichasResult> {
  const vacio: FichasResult = {
    columnasListas: false, pendientes: 0, pedidas: 0, escritas: 0,
    fallidas: 0, cortadaPorPresupuesto: false,
  };
  if (!EMPRESAS_CON_FICHA.includes(empresaKey)) return { ...vacio, columnasListas: true };
  if (!(await fichaColumnasListas())) {
    console.warn(
      "[sync-articulo-info] switch_articulo_info todavía no tiene rubro/subrubro/marca — falta correr " +
        "supabase/migrations/20260906120000_clasificacion_catalogo.sql. No se le pidió ninguna ficha a Switch.",
    );
    return vacio;
  }

  // 🩸 ESTA LECTURA SE PAGINA, Y NO ES DECORACIÓN (5-sep-2026).
  //
  // Hasta hoy era un `select` pelado. `db-max-rows` es **1000 y corta EN
  // SILENCIO**: el día que una empresa pasó las 1.000 fichas traídas, el `Set`
  // se quedó con 1.000 y las demás **volvieron a verse como pendientes**.
  //
  // Medido el 5-sep-2026 en active_shoes: **1.408 fichas traídas de 1.763
  // artículos**. La consulta devolvía 1.000, así que 408 artículos que ya
  // tenían ficha entraban otra vez a `pendientesDeFicha` — se le pedían a
  // Switch ~400 fichas por día que ya estaban, y como el presupuesto por
  // corrida es fijo, **los 355 que faltan de verdad no llegaban nunca**. El
  // 2-sep eran 400 fichas y todo andaba: el defecto se estrenó al cruzar el
  // tope, sin un solo error en el log. Y esto alimenta la clasificación del
  // catálogo, que es de donde sale el bulto.
  //
  // ⚠️ Vistana tiene **8.273 artículos**: el día que estrene su fase de fichas
  // cruza el tope ocho veces.
  //
  // `leerTodoPaginado` además **verifica contra un COUNT exacto** y tira si la
  // lectura sale incompleta, así que un truncado futuro se ve en vez de
  // convertirse en trabajo repetido. El `.order("codigo")` es obligatorio: sin
  // orden estable, paginar puede repetir y saltear filas.
  let yaConFicha: Set<string>;
  try {
    const filas = await leerTodoPaginado<{ codigo: unknown }>(
      `switch_articulo_info fichas ${empresaKey}`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_articulo_info")
          .select("codigo", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", empresaKey)
          .not("ficha_at", "is", null)
          .order("codigo", { ascending: true })
          .range(desde, hasta),
    );
    yaConFicha = new Set(filas.map((r) => String(r.codigo)));
  } catch (e) {
    // No poder leer lo ya hecho NO es "no hay nada hecho": pedir todo de nuevo
    // sería castigar a Switch por un error nuestro. Se salta la fase.
    console.error(`[sync-articulo-info] ${empresaKey}: no pude leer qué fichas ya están: ${String(e)}`);
    return { ...vacio, columnasListas: true };
  }

  const pendientesTodos = universo.filter((a) => !yaConFicha.has(a.codigo) && !!a.codigoBarra).length;
  const aPedir = pendientesDeFicha(universo, yaConFicha, FICHA_MAX_POR_CORRIDA);
  if (aPedir.length === 0) {
    return { columnasListas: true, pendientes: pendientesTodos, pedidas: 0, escritas: 0, fallidas: 0, cortadaPorPresupuesto: false };
  }

  const limite = Date.now() + FICHA_PRESUPUESTO_MS;
  let fallidas = 0;
  let sinPresupuesto = false;
  const ahoraIso = new Date().toISOString();

  const fichas = await enParalelo(aPedir, FICHA_CONCURRENCIA, async (a) => {
    if (Date.now() > limite) { sinPresupuesto = true; return null; }
    try {
      const info = await client.getArticuloInfo(a.codigoBarra);
      const art = info?.articulo;
      if (!art) { fallidas++; return null; }
      return {
        empresa_key: empresaKey,
        codigo: a.codigo,
        rubro: texto(art.rubro),
        subrubro: texto(art.subrubro),
        marca: texto(art.marca),
        ficha_at: ahoraIso,
      } as FilaFicha;
    } catch {
      // Una ficha que falla no tumba el sync: se reintenta mañana.
      fallidas++;
      return null;
    }
  });

  const buenas = fichas.filter((f): f is FilaFicha => f !== null);
  let escritas = 0;
  for (let i = 0; i < buenas.length; i += UPSERT_BATCH) {
    const { error: upErr } = await supabaseServer
      .from("switch_articulo_info")
      .upsert(buenas.slice(i, i + UPSERT_BATCH), { onConflict: "empresa_key,codigo" });
    if (upErr) {
      console.error(`[sync-articulo-info] ${empresaKey}: no pude guardar las fichas: ${upErr.message}`);
      break;
    }
    escritas += buenas.slice(i, i + UPSERT_BATCH).length;
  }

  return {
    columnasListas: true,
    pendientes: pendientesTodos,
    pedidas: aPedir.length,
    escritas,
    fallidas,
    cortadaPorPresupuesto: sinPresupuesto || pendientesTodos > aPedir.length,
  };
}

export interface ArticuloInfoSyncResult {
  empresaKey: string;
  /** `false` = la tabla todavía no existe (migración 20260810130000 pendiente)
   *  y NO se le pidió nada a Switch. */
  tablaLista: boolean;
  renglones: number;
  articulosUnicos: number;
  filasEscritas: number;
  rechazadasPorMonto: number;
  syncedAt: string | null;
  /** Telemetría de la 2.ª fase (rubro/subrubro/marca). Ver `traerFichas`. */
  fichas?: FichasResult;
}

/** Filas que la tabla YA tiene de esta empresa; null si la tabla no existe.
 *
 *  🩸 La sonda va con GET, NUNCA con HEAD. Medido el 9-ago-2026 contra
 *  producción: un `head: true` sobre una tabla inexistente devuelve
 *  `status 204, error null, count null` — silencio total. Con esa sonda el
 *  sync barría el catálogo ENTERO de Switch (una sesión de ~2 min) para morir
 *  recién en el upsert. El GET sí trae el 404 con su mensaje. */
async function filasGuardadas(empresaKey: string): Promise<number | null> {
  const sonda = await supabaseServer.from("switch_articulo_info").select("codigo").limit(1);
  if (sonda.error) {
    if (/does not exist|schema cache/i.test(sonda.error.message)) return null;
    throw new Error(`switch_articulo_info (sonda): ${sonda.error.message}`);
  }
  const { count, error } = await supabaseServer
    .from("switch_articulo_info")
    .select("codigo", { count: "exact", head: true })
    .eq("empresa_key", empresaKey);
  if (error) throw new Error(`switch_articulo_info (conteo previo): ${error.message}`);
  return count ?? 0;
}

export async function syncArticuloInfo(
  empresaKey: string,
  triggeredBy: SwitchSyncTriggeredBy = "manual",
): Promise<ArticuloInfoSyncResult> {
  // SOLO las 6 de Fashion Group — la misma lista del tab (Boston/ACS afuera).
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresaKey)) {
    throw new Error(`empresa fuera del tab Referencia: ${empresaKey}`);
  }

  // El lock (fila 'running') va ANTES de tocar Switch: si otra corrida del par
  // está viva, createSwitchSyncLog LANZA y acá no se abre ninguna sesión.
  const logId = await createSwitchSyncLog({ empresaKey, syncType: "articulo_info", triggeredBy });

  try {
    const filasPrevias = await filasGuardadas(empresaKey);
    if (filasPrevias === null) {
      await finishSwitchSyncLog(logId, "success", { inserted: 0 });
      console.warn(
        "[sync-articulo-info] switch_articulo_info todavía no existe — falta correr " +
          "supabase/migrations/20260810130000_switch_articulo_info.sql. No se llamó a Switch.",
      );
      return {
        empresaKey, tablaLista: false, renglones: 0, articulosUnicos: 0,
        filasEscritas: 0, rechazadasPorMonto: 0, syncedAt: null,
      };
    }

    const client = createSwitchClient(empresaKey);
    const ahoraIso = new Date().toISOString();

    const crudas: FilaArticuloInfo[] = [];
    // Universo para la 2.ª fase: el `codigoBarra` solo viene en la LISTA y es la
    // única llave con la que se le puede pedir la ficha a Switch. Se junta acá
    // para no volver a barrer las páginas.
    const universo: Array<{ codigo: string; existencia: number | null; codigoBarra: string | null }> = [];
    let renglones = 0;
    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
      const lote = (data?.articulos ?? []) as unknown as ArticuloInfoCrudo[];
      if (lote.length === 0) break; // corte por página VACÍA (el endpoint ignora porPagina)
      renglones += lote.length;
      for (const a of lote) {
        const fila = filaDeArticulo(empresaKey, a, ahoraIso);
        if (fila) {
          crudas.push(fila);
          universo.push({ codigo: fila.codigo, existencia: fila.existencia, codigoBarra: a.codigoBarra ?? null });
        }
      }
      if (pagina === MAX_PAGES) {
        throw new Error(
          `catálogo de ${empresaKey}: tope de ${MAX_PAGES} páginas sin llegar al final — no se escribe a medias`,
        );
      }
    }

    const unicas = dedupePorCodigo(crudas);

    // Guard de barrido corto — ANTES del upsert (success con medio catálogo es
    // la forma silenciosa de fallar que ya se pagó con articulo_marca).
    if (filasPrevias > 0 && unicas.length < filasPrevias * PISO_BARRIDO) {
      throw new Error(
        `catálogo de ${empresaKey}: el barrido trajo ${unicas.length} artículos contra ${filasPrevias} guardados ` +
          `(menos del ${Math.round(PISO_BARRIDO * 100)}%) — se cortó a mitad de camino, no se escribe nada`,
      );
    }

    // Guard de montos (familia articulo_info): la fila con precio imposible NO
    // se escribe — el upsert conserva la última foto buena.
    const umbral = await calibrarUmbral("articulo_info", empresaKey);
    const { buenas, rechazadas } = particionarFilas(
      "articulo_info",
      unicas as unknown as Record<string, unknown>[],
      umbral,
      (f) => `${(f as unknown as FilaArticuloInfo).codigo}`,
    );
    if (rechazadas.length) {
      console.error(
        `[sync-articulo-info] ${empresaKey}: ${rechazadas.length} fila(s) con monto IMPOSIBLE (umbral ${umbral}) — no se guardaron`,
      );
    }

    for (let i = 0; i < buenas.length; i += UPSERT_BATCH) {
      const { error } = await supabaseServer
        .from("switch_articulo_info")
        .upsert(buenas.slice(i, i + UPSERT_BATCH), { onConflict: "empresa_key,codigo" });
      if (error) throw new Error(`upsert switch_articulo_info ${empresaKey}: ${error.message}`);
    }

    // ── 2.ª fase: la ficha de cada artículo (rubro/subrubro/marca). Va DESPUÉS
    //    del upsert de la lista: si algo falla acá, el snapshot de precios y
    //    existencias ya está guardado. NUNCA lanza.
    const fichas = await traerFichas(empresaKey, client, universo);
    if (fichas.pedidas > 0) {
      console.warn(
        `[sync-articulo-info] ${empresaKey}: fichas pedidas ${fichas.pedidas} · guardadas ${fichas.escritas} · ` +
          `fallidas ${fichas.fallidas} · pendientes totales ${fichas.pendientes}` +
          (fichas.cortadaPorPresupuesto ? " · quedó cola para la corrida siguiente" : ""),
      );
    }

    const skipDetails = rechazadas.length
      ? detallesDeRechazo("articulo_info", rechazadas, umbral)
      : undefined;
    if (rechazadas.length) {
      try {
        await avisarMontosImposibles({
          familia: "articulo_info",
          empresaKey,
          syncType: "articulo_info",
          rechazadas,
          umbral,
          logId,
        });
      } catch (e) {
        console.error(`[sync-articulo-info] ${empresaKey}: no pude avisar el monto imposible: ${String(e)}`);
      }
    }

    await finishSwitchSyncLog(logId, "success", {
      inserted: buenas.length,
      skipped: rechazadas.length,
      skipDetails,
    });

    return {
      empresaKey,
      tablaLista: true,
      renglones,
      articulosUnicos: unicas.length,
      filasEscritas: buenas.length,
      rechazadasPorMonto: rechazadas.length,
      syncedAt: ahoraIso,
      fichas,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    throw err;
  }
}
