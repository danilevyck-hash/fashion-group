/**
 * Sincronización AUTOMÁTICA del INGRESO DE MERCANCÍA (las COMPRAS).
 *
 * Es el I/O que el encabezado del módulo PURO `ingresos-mercancia.ts` viene
 * nombrando desde que se escribió y que nunca se había construido: login web,
 * descarga de los dos CSV, cuadre y escritura en `switch_ingresos_mercancia`.
 * **El parseo no se reimplementa acá** — se llama al módulo puro, que ya está
 * testeado contra las líneas reales del archivo.
 *
 * ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
 *
 * La tabla se cargó A MANO UNA sola vez, el 11-ago-2026, y nadie volvió a
 * tocarla: al 24-ago tenía datos hasta el **7-ago**. Diecisiete días de compras
 * invisibles, y la carga manual se corría "cada tanto".
 *
 * De esta tabla sale el **"Compré 935 · Vendí 552 · Me quedan 345"** de
 * Ventas › Referencia, y de ahí salió la proyección con la que Daniel decidió
 * comprar **7.620 pares por $186.614**. El modo de falla no es "el número está
 * viejo": es que **el número miente hacia el lado peligroso**. Si entró un
 * contenedor el 15-ago y Referencia no lo sabe, el denominador de "% vendido"
 * queda chico y el porcentaje sale MÁS ALTO de lo real — la pantalla dice "se
 * vendió casi todo" justo cuando la bodega está llena, y la próxima compra se
 * hace de más.
 *
 * ── 🔴 EL CUADRE ES LA PRUEBA DE QUE NO SE PERDIÓ NADA ──────────────────────
 *
 * El reporte tiene dos botones y se bajan LOS DOS: "Descargar Detalle" (una
 * fila por artículo) es el dato, "Descargar" (una fila por documento) es la
 * prueba. Las unidades del detalle tienen que sumar EXACTAMENTE las del
 * resumen, **documento por documento** (`cuadrar()` exige las tres cosas: mismo
 * total, ningún documento suelto y ninguno con distinta cantidad — dos errores
 * que se compensan dan el mismo gran total y son dos documentos mal cargados).
 *
 * **Si el cuadre no da, NO SE ESCRIBE NADA y la corrida queda en `error`.** Es
 * fail-closed y no es negociable: cargar un detalle truncado deja la pantalla
 * diciendo "compraste 900" cuando compraste 1.000, y nadie tiene cómo notarlo.
 * Quedarse con el dato viejo es peor que nada; quedarse con un dato MENOR que
 * el real es peor que quedarse con el viejo.
 *
 * ── INCREMENTAL: UNA VENTANA RODANTE, NO LA HISTORIA ENTERA ─────────────────
 *
 * Las 34.916 filas que ya están cargadas no se vuelven a bajar todas las
 * noches: la base corre en compute **Micro** y ya se cayó varias veces por
 * cargas agresivas. Se pide una ventana de `VENTANA_DIAS` hacia atrás, que
 * además se ESTIRA hasta la última fecha cargada de esa empresa cuando el hueco
 * es mayor (joystep tenía datos hasta el 27-ene: con 45 días pelados el hueco
 * no se habría cerrado nunca). Ver `ventanaIngresos`, que es PURA y está
 * testeada.
 *
 * ── ESCRITURA: UPSERT + PODA DE LA COLA, nunca DELETE + INSERT ──────────────
 *
 * La llave es `(empresa_key, n_interno, linea)` y `linea` es un ORDINAL. El
 * script manual resolvía la idempotencia borrando el documento entero y
 * volviéndolo a insertar; acá NO se puede hacer eso, y la diferencia importa:
 * en un script, si el proceso muere entre el DELETE y el INSERT, la persona lo
 * vuelve a correr; en un cron que Vercel puede matar al agotar `maxDuration`,
 * ese hueco queda en producción hasta la noche siguiente — y un hueco en las
 * compras es exactamente el error que hace comprar de más.
 *
 * Por eso: primero se hace **UPSERT** de las líneas nuevas (`onConflict` sobre
 * la llave, así que en ningún instante falta una fila que antes estaba), y
 * DESPUÉS se **poda la cola** — las líneas de ese documento con `linea` mayor a
 * la última que trajo el reporte, que son las que sobrarían si el documento se
 * achicó. El resultado final es idéntico al reemplazo del documento entero, sin
 * la ventana en que el documento no existe. La objeción del script manual
 * ("si Switch reordena los renglones, un upsert mezcla nuevos con viejos") queda
 * cubierta: se reescriben TODAS las líneas 1..N y se borra lo que pase de N.
 *
 * ⚠️ **Un documento ANULADO en Switch no desaparece solo.** Este sync solo toca
 * los documentos que el reporte trajo; si uno se anula, sus filas quedan. Se
 * REPORTA (`documentosSoloEnLaBase`) en vez de borrarse: la ausencia de un
 * documento también es la firma de una descarga a medias, y borrar por ausencia
 * convertiría un problema de red en pérdida de datos. Mismo criterio que el
 * resto del módulo — se mide, no se corrige solo.
 *
 * ── SECUENCIAL, y la sesión se CIERRA al terminar ───────────────────────────
 *
 * El login web hace `changesession="SI"`: TOMA la sesión y expulsa a quien esté
 * en el panel de esa empresa, y el usuario configurado es el de Daniel. Una
 * empresa a la vez, `cerrarSesionWeb` en el `finally`. Nada de `Promise.all`.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { loginSwitchWeb, fetchIngresosMercancia, cerrarSesionWeb } from "./web-client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import {
  parseDetalleCsv,
  parseResumenCsv,
  cuadrar,
  hallazgos,
  type Cuadre,
  type LineaIngreso,
} from "./ingresos-mercancia";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { sumarDias } from "@/lib/cheques-aviso-ventana";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

/**
 * 🔴 LAS 6 DE FASHION GROUP, Y NADA MÁS.
 *
 * Daniel, textual (24-ago-2026): *"sobre Ventas › Referencia solo quiero las
 * compañías de fashion group, las 6"*. `confecciones_boston` y
 * `american_classic` quedan FUERA.
 *
 * Se DERIVA de `B2B_EMPRESA_KEYS` — la MISMA constante de la que sale
 * `REFERENCIA_EMPRESA_KEYS`, que es lo que lee la pantalla. Escribir acá un
 * array propio sería estrenar una segunda lista que puede separarse de la del
 * lector sin que nada avise; hay un test que exige que las dos sean idénticas.
 */
export const INGRESOS_EMPRESA_KEYS: readonly string[] = B2B_EMPRESA_KEYS;

/**
 * Cuántos días hacia atrás se le piden a Switch en una corrida normal.
 *
 * 45 y no 7: un documento de ingreso se puede registrar con fecha atrasada, y
 * se puede CORREGIR después de registrado. Una ventana corta vería la corrección
 * solo si cae adentro. 45 días de compras son unos cientos de renglones (vistana
 * hizo 1.477 en seis meses), o sea que el costo de la holgura es despreciable.
 */
export const VENTANA_DIAS = 45;

/**
 * Cuánto se retrocede POR DETRÁS de la última fecha ya cargada cuando el hueco
 * es más grande que la ventana normal. El día del borde puede haberse cargado a
 * medias, así que se vuelve a pedir con margen.
 */
export const SOLAPE_DIAS = 7;

/**
 * Piso duro de la ventana. Un hueco mayor NO es trabajo de un cron: es un
 * backfill, y se hace con los scripts manuales, por empresa y mirando.
 * Sin este tope, una empresa con la tabla vacía intentaría bajar cuatro años
 * dentro de una función de 800 s, moriría a mitad de camino y dejaría la fila
 * 'running' trabada (el caso `catalogo_tommy` del 27-jul-2026).
 */
export const VENTANA_MAX_DIAS = 400;

/** Tope de sanidad del reporte. La bajada histórica más grande fue de 18.529
 *  renglones (fashion_wear, cuatro años); 200.000 en una ventana es absurdo. */
const MAX_LINEAS = 200_000;

/**
 * Guard del BARRIDO CORTO. Si el reporte trae menos del 70% de las líneas que
 * la tabla YA tiene dentro de la misma ventana, no se escribe nada.
 *
 * 🩸 El cuadre prueba que el detalle y el resumen dicen lo mismo, pero no puede
 * probar que Switch no haya filtrado de menos: si los DOS vinieran recortados
 * igual, cuadrarían. Esta es la segunda red, y mide contra lo único que no
 * depende de esta descarga — lo que ya está guardado. El 70% es holgado a
 * propósito: dentro de una ventana pasada las compras no bajan salvo por
 * anulaciones, y perder un tercio por anulaciones no es plausible.
 */
export const UMBRAL_BARRIDO_CORTO = 0.7;

/** Filas por lote de escritura. Chico y con pausa: la base es compute Micro. */
const LOTE = 500;
const PAUSA_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Ventana {
  desde: string;
  hasta: string;
  /** `true` si el piso de `VENTANA_MAX_DIAS` recortó el hueco real. */
  recortada: boolean;
}

/**
 * Qué rango se le pide a Switch para esta empresa. PURA: recibe el día de hoy y
 * la última fecha ya cargada, no los va a buscar.
 *
 * - Sin nada cargado → la ventana normal (el histórico es un backfill manual).
 * - Con datos frescos → la ventana normal.
 * - Con un hueco más viejo que la ventana → se estira hasta cubrirlo, con
 *   `SOLAPE_DIAS` de margen y con el piso de `VENTANA_MAX_DIAS`.
 */
export function ventanaIngresos(hoy: string, ultimaFecha: string | null): Ventana {
  const normal = sumarDias(hoy, -VENTANA_DIAS);
  const piso = sumarDias(hoy, -VENTANA_MAX_DIAS);
  const conSolape = ultimaFecha ? sumarDias(ultimaFecha, -SOLAPE_DIAS) : normal;
  const querido = conSolape < normal ? conSolape : normal;
  const desde = querido < piso ? piso : querido;
  return { desde, hasta: hoy, recortada: querido < piso };
}

/** La fecha más nueva que la tabla ya tiene de esa empresa (`null` si vacía). */
export async function ultimaFechaCargada(empresaKey: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_ingresos_mercancia")
    .select("fecha")
    .eq("empresa_key", empresaKey)
    .order("fecha", { ascending: false })
    .limit(1);
  if (error) throw new Error(`última fecha de ${empresaKey}: ${error.message}`);
  return (data?.[0] as { fecha: string } | undefined)?.fecha ?? null;
}

interface FilaGuardada {
  n_interno: string;
  linea: number;
}

/**
 * Lo que la tabla YA tiene dentro de la ventana. Sirve para los dos guards y
 * para saber qué documentos quedaron solo en la base.
 *
 * 🔴 Pagina con `leerTodoPaginado` y con `.order()` estable: `db-max-rows` es
 * 1000 y corta EN SILENCIO. Un truncado acá haría creer que la ventana tiene
 * menos líneas de las que tiene, o sea que desarmaría justo al guard que está
 * para frenar una descarga a medias.
 */
async function lineasGuardadasEnVentana(
  empresaKey: string,
  v: Ventana,
): Promise<FilaGuardada[]> {
  return leerTodoPaginado<FilaGuardada>(
    `ingresos_mercancia ventana ${empresaKey}`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_ingresos_mercancia")
        .select("n_interno, linea", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresaKey)
        .gte("fecha", v.desde)
        .lte("fecha", v.hasta)
        // Orden TOTAL: paginar con filas empatadas puede repetir o saltear.
        .order("n_interno", { ascending: true })
        .order("linea", { ascending: true })
        .range(desde, hasta),
  );
}

export interface ResultadoIngresosEmpresa {
  empresaKey: string;
  ok: boolean;
  ventana: Ventana;
  /** Líneas de detalle escritas. */
  lineas: number;
  /** Documentos distintos que trajo el reporte. */
  documentos: number;
  unidades: number;
  /** Fechas de los documentos que trajo el reporte (para el informe). */
  fechas: { desde: string | null; hasta: string | null };
  /** Documentos NUEVOS: los que el reporte trajo y la ventana no tenía. */
  documentosNuevos: string[];
  /** ⚠️ Documentos que la base tiene en la ventana y el reporte NO trajo.
   *  Se REPORTAN, no se borran: la ausencia también es la firma de una
   *  descarga a medias. */
  documentosSoloEnLaBase: string[];
  /** Filas de la cola podadas (documentos que se achicaron en Switch). */
  filasPodadas: number;
  /** El cuadre, siempre — también cuando dio bien. Es la prueba, se guarda. */
  cuadre: Cuadre | null;
  /** Líneas del CSV que no se pudieron leer. Nunca se descartan en silencio. */
  lineasSalteadas: number;
  /** `false` = `switch_sync_log` no aceptó el `sync_type` (DDL pendiente).
   *  La corrida escribe igual; lo que falta es su fila en el log. */
  logRegistrado: boolean;
  error?: string;
}

/** Índice `n_interno → cantidad de líneas` de un juego de filas. */
function porDocumento(filas: readonly { n_interno: string; linea: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of filas) m.set(f.n_interno, Math.max(m.get(f.n_interno) ?? 0, f.linea));
  return m;
}

/**
 * Sincroniza UNA empresa. Abre su sesión, baja la ventana, cuadra, escribe y
 * cierra. Nunca lanza: devuelve el resultado para que una empresa mala no tumbe
 * al resto.
 */
export async function syncEmpresaIngresos(
  empresaKey: string,
  rango?: { desde: string; hasta: string },
  hoy: string = hoyPanama(),
): Promise<ResultadoIngresosEmpresa> {
  const ventana: Ventana = rango
    ? { ...rango, recortada: false }
    : ventanaIngresos(hoy, await ultimaFechaCargada(empresaKey));

  const vacio = {
    empresaKey,
    ventana,
    lineas: 0,
    documentos: 0,
    unidades: 0,
    fechas: { desde: null as string | null, hasta: null as string | null },
    documentosNuevos: [] as string[],
    documentosSoloEnLaBase: [] as string[],
    filasPodadas: 0,
    cuadre: null as Cuadre | null,
    lineasSalteadas: 0,
  };

  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "ingresos_mercancia",
    rangeFrom: ventana.desde,
    rangeTo: ventana.hasta,
  });
  const logRegistrado = logId !== null;
  let session: Awaited<ReturnType<typeof loginSwitchWeb>> | null = null;

  try {
    session = await loginSwitchWeb(empresaKey);
    const { detalleCsv, resumenCsv } = await fetchIngresosMercancia(
      session,
      ventana.desde,
      ventana.hasta,
    );

    const detalle = parseDetalleCsv(empresaKey, detalleCsv);
    const resumen = parseResumenCsv(resumenCsv);

    // ── 🔴 EL CUADRE. Fail-closed: si no da, no se escribe NADA. ──
    const c = cuadrar(detalle.filas, resumen.documentos);
    if (!c.ok) {
      throw new Error(
        `NO CUADRA el detalle contra el resumen — no se escribió nada. ` +
          `unidades detalle ${c.unidadesDetalle} vs resumen ${c.unidadesResumen} (dif ${c.diferencia}); ` +
          `docs ${c.documentosDetalle} vs ${c.documentosResumen}; ` +
          `faltan en el detalle: ${c.soloEnResumen.slice(0, 5).join(", ") || "—"}; ` +
          `sobran en el detalle: ${c.soloEnDetalle.slice(0, 5).join(", ") || "—"}; ` +
          `descuadrados: ${
            c.documentosDescuadrados
              .slice(0, 5)
              .map((d) => `${d.n_interno} (${d.unidadesDetalle} vs ${d.unidadesResumen})`)
              .join(", ") || "—"
          }`,
      );
    }

    if (detalle.filas.length > MAX_LINEAS) {
      throw new Error(
        `el reporte trajo ${detalle.filas.length} renglones (tope ${MAX_LINEAS}); no se escribió nada`,
      );
    }

    const guardadas = await lineasGuardadasEnVentana(empresaKey, ventana);

    // ── Guard del CERO SILENCIOSO ──
    // Una ventana sin compras es LEGÍTIMA (joystep pasó meses sin comprar).
    // Deja de serlo cuando la base ya tenía renglones de esa misma ventana: ahí
    // el cero es nuestro, no del negocio.
    if (detalle.filas.length === 0 && guardadas.length > 0) {
      throw new Error(
        `el reporte vino vacío pero la ventana ${ventana.desde}→${ventana.hasta} ya tenía ` +
          `${guardadas.length} renglones cargados; no se tocó nada`,
      );
    }

    // ── Guard del BARRIDO CORTO ──
    if (
      guardadas.length > 0 &&
      detalle.filas.length < guardadas.length * UMBRAL_BARRIDO_CORTO
    ) {
      throw new Error(
        `el reporte trajo ${detalle.filas.length} renglones contra ${guardadas.length} ya cargados ` +
          `en ${ventana.desde}→${ventana.hasta} (menos del ${Math.round(UMBRAL_BARRIDO_CORTO * 100)}%); ` +
          `parece una descarga a medias, no se escribió nada`,
      );
    }

    // ── Escritura: UPSERT primero, poda de la cola después ──
    const maxLineaNueva = porDocumento(detalle.filas);
    const maxLineaVieja = porDocumento(guardadas);
    const ahora = new Date().toISOString();

    for (let i = 0; i < detalle.filas.length; i += LOTE) {
      const lote = detalle.filas.slice(i, i + LOTE).map((f: LineaIngreso) => ({
        ...f,
        // La tabla tiene DEFAULT pero no trigger: en un UPSERT hay que ponerlo.
        synced_at: ahora,
        updated_at: ahora,
      }));
      const { error } = await supabaseServer
        .from("switch_ingresos_mercancia")
        .upsert(lote, { onConflict: "empresa_key,n_interno,linea" });
      if (error) throw new Error(`escritura de ${empresaKey}: ${error.message}`);
      await dormir(PAUSA_MS);
    }

    // Poda de la cola: solo de los documentos que ESTA descarga trajo y que
    // ahora tienen MENOS líneas que antes. Nunca se poda un documento ausente.
    let filasPodadas = 0;
    for (const [doc, maxNueva] of maxLineaNueva) {
      const maxVieja = maxLineaVieja.get(doc);
      if (maxVieja == null || maxVieja <= maxNueva) continue;
      const { error, count } = await supabaseServer
        .from("switch_ingresos_mercancia")
        .delete({ count: "exact" })
        .eq("empresa_key", empresaKey)
        .eq("n_interno", doc)
        .gt("linea", maxNueva);
      if (error) throw new Error(`poda de ${empresaKey}/${doc}: ${error.message}`);
      filasPodadas += count ?? 0;
    }

    const documentosNuevos = [...maxLineaNueva.keys()].filter((d) => !maxLineaVieja.has(d)).sort();
    const documentosSoloEnLaBase = [...maxLineaVieja.keys()]
      .filter((d) => !maxLineaNueva.has(d))
      .sort();

    const fechas = detalle.filas.map((f) => f.fecha).sort();
    const h = hallazgos(detalle.filas);

    await finishSwitchSyncLog(logId, "success", {
      inserted: detalle.filas.length,
      skipped: detalle.skips.length,
      skipDetails: [
        {
          cuadre: {
            unidades: c.unidadesDetalle,
            documentos: c.documentosDetalle,
            diferencia: c.diferencia,
          },
          ventana,
          documentosNuevos: documentosNuevos.length,
          documentosSoloEnLaBase,
          filasPodadas,
          negativas: h.negativas.length,
          sinDesglosar: h.sinDesglosar,
          skips: detalle.skips.slice(0, 5),
        },
      ],
    });

    return {
      ...vacio,
      ok: true,
      lineas: detalle.filas.length,
      documentos: detalle.documentos,
      unidades: detalle.unidades,
      fechas: { desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null },
      documentosNuevos,
      documentosSoloEnLaBase,
      filasPodadas,
      cuadre: c,
      lineasSalteadas: detalle.skips.length,
      logRegistrado,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    return { ...vacio, ok: false, error: msg, logRegistrado };
  } finally {
    // Siempre: dejar la sesión abierta alarga el despojo a Daniel.
    if (session) await cerrarSesionWeb(session);
  }
}

/**
 * Sincroniza todas las empresas, UNA DETRÁS DE OTRA.
 * Nada de `Promise.all`: serían N sesiones simultáneas contra Switch, y Switch
 * admite una sola por empresa (un 2º login mata el token del 1º).
 */
export async function syncAllIngresos(
  empresas: readonly string[] = INGRESOS_EMPRESA_KEYS,
  rango?: { desde: string; hasta: string },
  hoy: string = hoyPanama(),
): Promise<ResultadoIngresosEmpresa[]> {
  const out: ResultadoIngresosEmpresa[] = [];
  for (const empresaKey of empresas) {
    out.push(await syncEmpresaIngresos(empresaKey, rango, hoy));
  }
  return out;
}
