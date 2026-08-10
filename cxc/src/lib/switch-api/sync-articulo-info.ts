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

import { createSwitchClient } from "./client";
import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchSyncLog, finishSwitchSyncLog, type SwitchSyncTriggeredBy } from "./sync-log";
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

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

/** Un renglón del catálogo, con lo que este sync consume. */
export interface ArticuloInfoCrudo {
  id: number;
  codigo: string | null;
  descripcion: string | null;
  /** `disponible` = existencia física − comprometido (string numérico). */
  disponible: string | null;
  precio: string | null;
  costo: string | null;
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
    let renglones = 0;
    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
      const lote = (data?.articulos ?? []) as unknown as ArticuloInfoCrudo[];
      if (lote.length === 0) break; // corte por página VACÍA (el endpoint ignora porPagina)
      renglones += lote.length;
      for (const a of lote) {
        const fila = filaDeArticulo(empresaKey, a, ahoraIso);
        if (fila) crudas.push(fila);
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
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    throw err;
  }
}
