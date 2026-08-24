/**
 * Sync del DETALLE DE LÍNEA de facturas y notas de crédito → switch_factura_lineas.
 *
 * Es la respuesta al pedido de Daniel del 24-ago-2026: poder ver sus productos
 * más vendidos FILTRADOS POR CLIENTE. Hoy eso no se puede, y no por falta de
 * pantalla — el cruce artículo × cliente **no existe en ninguna tabla**:
 *
 *     switch_articulo_diario   artículo × día × empresa   →  sin cliente
 *     switch_facturas          cliente × documento        →  sin artículo
 *
 * La propia migración de jun-2026 lo dejó escrito como pendiente ("la utilidad
 * por línea de factura queda en BACKLOG, Opción 4"). Esto es esa opción 4.
 *
 * ── Fuentes ────────────────────────────────────────────────────────────────
 *   /apifactura/info?facturaId=X          → data.detalle[]   (documentado)
 *   /apinotacredito/info?notacreditoId=X  → data.detalle[]   (NO documentado)
 *
 * 🔴 LAS NOTAS DE CRÉDITO NO SON OPCIONALES. Su endpoint no está en el PDF de
 * Switch y se descubrió probando el 20-ago-2026. Sin él, todo conteo de
 * unidades es BRUTO: en Active Shoes las NC son el **13,4% de las unidades
 * facturadas**, y por cliente el sesgo es brutal — City Mall David devolvió el
 * **58%** de lo que se le facturó a $30. Un ranking bruto pone a ese cliente
 * donde no va.
 *
 * ── Sesión única ───────────────────────────────────────────────────────────
 * Switch admite UN login por empresa (code 0006). Las empresas se procesan
 * SERIALMENTE y la sesión se cierra en el `finally`. Dentro de una empresa las
 * peticiones van de a `CONCURRENCIA` sobre el MISMO token, que es una sola
 * sesión.
 */

import type { EmpresaKey } from "@/lib/empresa-mapping";
import { supabaseServer } from "../supabase-server";
import { leerTodoPaginado } from "../supabase-paginado";
import { createSwitchClient, logoutAllSwitchSessions } from "./client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import type { SwitchSyncTriggeredBy } from "./sync-log";
import {
  empresasConDetalleDeLinea,
  lineasDeDocumento,
  tieneDetalle,
  type CabeceraDocumento,
  type LineaFactura,
} from "./factura-lineas-parse";

export { empresasConDetalleDeLinea };

/** Cuántas peticiones de detalle van a la vez, sobre la MISMA sesión.
 *  3 medido contra producción: 489 facturas de active_shoes en ~3 min sin un
 *  solo 429 ni pérdida de sesión. Subirlo arriesga la sesión única por ahorrar
 *  minutos de un backfill que se corre una vez. */
const CONCURRENCIA = 3;

/** Cuántos documentos se escriben por lote. */
const LOTE_ESCRITURA = 500;

/**
 * Switch devuelve 400 "NO SE HA ENCONTRADO INFORMACIÓN SOLICITADA" de forma
 * TRANSITORIA. Medido: 15 de 489 facturas de active_shoes fallaron así en la
 * primera pasada y **las 15 salieron bien en la segunda, sin cambiar nada**.
 * Por eso se reintenta una vez antes de contarlo como fallo.
 */
const REINTENTOS = 1;

export interface ResultadoLineas {
  empresaKey: EmpresaKey;
  ok: boolean;
  pendientesAlEmpezar: number;
  documentosBajados: number;
  documentosFallados: number;
  lineasEscritas: number;
  documentosSinLineas: number;
  error?: string;
}

interface FilaPendiente {
  switch_factura_id: number;
  tipo_comprobante: string;
  secuencial: string | null;
  fecha: string;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  vendedor_switch_id: number | null;
  vendedor_nombre: string | null;
}

/**
 * Los documentos de esta empresa que todavía no tienen su detalle.
 *
 * ⚠️ `db-max-rows` = 1000 CORTA EN SILENCIO: sin paginar, un backfill de 3.000
 * facturas bajaría 1.000 y se anotaría `success`, dejando dos tercios de las
 * ventas invisibles sin un solo error. `leerTodoPaginado` pagina y **verifica
 * contra un `count: "exact"`**, así que un truncado revienta en vez de mentir.
 */
async function leerPendientes(
  empresaKey: EmpresaKey,
  limite: number | null,
): Promise<FilaPendiente[]> {
  const filas = await leerTodoPaginado<FilaPendiente>(
    `pendientes de ${empresaKey}`,
    (_primera, desde, hasta) =>
      supabaseServer
        .from("switch_facturas")
        .select(
          "switch_factura_id,tipo_comprobante,secuencial,fecha," +
            "cliente_switch_id,cliente_nombre,vendedor_switch_id,vendedor_nombre",
          { count: "exact" },
        )
        .eq("empresa_key", empresaKey)
        .in("tipo_comprobante", ["Factura", "Nota de Crédito"])
        .is("lineas_synced_at", null)
        // El orden tiene que ser TOTAL o PostgREST puede repetir o saltear
        // filas entre páginas. `fecha` sola no alcanza (hay documentos del
        // mismo instante); el id desempata y es único.
        .order("fecha", { ascending: true })
        .order("switch_factura_id", { ascending: true })
        .range(desde, hasta),
  );
  return limite === null ? filas : filas.slice(0, limite);
}

/** Baja el detalle de UN documento. Devuelve null si Switch no lo entregó. */
async function bajarDetalle(
  cliente: ReturnType<typeof createSwitchClient>,
  fila: FilaPendiente,
): Promise<unknown[] | null> {
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    try {
      const resp = (await (fila.tipo_comprobante === "Nota de Crédito"
        ? cliente.getNotaCredito(fila.switch_factura_id)
        : cliente.getFactura(fila.switch_factura_id))) as {
        detalle?: unknown[];
      };
      return Array.isArray(resp?.detalle) ? resp.detalle : [];
    } catch {
      if (intento === REINTENTOS) return null;
    }
  }
  return null;
}

/**
 * Sincroniza el detalle de línea de UNA empresa.
 *
 * REANUDABLE: solo mira los documentos con `lineas_synced_at IS NULL`, así que
 * si la corrida se corta (timeout de la función, sesión perdida, deploy) la
 * siguiente sigue donde quedó. Es lo que hace viable el backfill de ~12.300
 * documentos sin una corrida gigante que tenga que salir bien de una vez.
 */
export async function sincronizarLineasEmpresa(
  empresaKey: EmpresaKey,
  opts: { limite?: number | null; triggeredBy?: SwitchSyncTriggeredBy } = {},
): Promise<ResultadoLineas> {
  const limite = opts.limite ?? null;
  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "factura_lineas",
    triggeredBy: opts.triggeredBy ?? "cron",
  });

  const res: ResultadoLineas = {
    empresaKey,
    ok: false,
    pendientesAlEmpezar: 0,
    documentosBajados: 0,
    documentosFallados: 0,
    lineasEscritas: 0,
    documentosSinLineas: 0,
  };

  try {
    const pendientes = await leerPendientes(empresaKey, limite);
    res.pendientesAlEmpezar = pendientes.length;
    if (pendientes.length === 0) {
      res.ok = true;
      await finishSwitchSyncLog(logId, "success", { inserted: 0, updated: 0, skipped: 0 });
      return res;
    }

    const cliente = createSwitchClient(empresaKey);
    let buffer: LineaFactura[] = [];
    let idsListos: { id: number; tipo: string }[] = [];

    const volcar = async () => {
      if (buffer.length > 0) {
        const { error } = await supabaseServer
          .from("switch_factura_lineas")
          .upsert(buffer, {
            onConflict: "empresa_key,tipo_comprobante,switch_factura_id,linea_orden",
          });
        if (error) throw new Error(`upsert de líneas: ${error.message}`);
        res.lineasEscritas += buffer.length;
      }
      // 🔴 LA MARCA SE PONE DESPUÉS DE ESCRIBIR LAS LÍNEAS, NUNCA ANTES.
      // Al revés, un fallo del upsert dejaría el documento marcado como hecho
      // y sus líneas no se bajarían NUNCA MÁS: un hueco permanente y en
      // silencio, que es el peor modo de fallo posible acá.
      for (const grupo of porTipo(idsListos)) {
        const { error } = await supabaseServer
          .from("switch_facturas")
          .update({ lineas_synced_at: new Date().toISOString() })
          .eq("empresa_key", empresaKey)
          .eq("tipo_comprobante", grupo.tipo)
          .in("switch_factura_id", grupo.ids);
        if (error) throw new Error(`marcar documentos: ${error.message}`);
      }
      buffer = [];
      idsListos = [];
    };

    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
      const lote = pendientes.slice(i, i + CONCURRENCIA);
      const bajados = await Promise.all(
        lote.map(async (fila) => ({ fila, detalle: await bajarDetalle(cliente, fila) })),
      );

      for (const { fila, detalle } of bajados) {
        if (detalle === null) {
          res.documentosFallados++;
          continue; // sin marcar: la próxima corrida lo reintenta
        }
        if (!tieneDetalle(fila.tipo_comprobante)) {
          // No puede pasar (el select filtra), pero si pasara, marcarlo sería
          // guardar "este documento no tiene líneas" sobre un tipo que ni
          // siquiera tiene endpoint de detalle.
          res.documentosFallados++;
          continue;
        }
        const cab: CabeceraDocumento = {
          empresa_key: empresaKey,
          tipo_comprobante: fila.tipo_comprobante,
          switch_factura_id: fila.switch_factura_id,
          secuencial: fila.secuencial,
          fecha: fila.fecha,
          cliente_switch_id: fila.cliente_switch_id,
          cliente_nombre: fila.cliente_nombre,
          vendedor_switch_id: fila.vendedor_switch_id,
          vendedor_nombre: fila.vendedor_nombre,
        };
        const lineas = lineasDeDocumento(cab, detalle);
        if (lineas.length === 0) res.documentosSinLineas++;
        buffer.push(...lineas);
        idsListos.push({ id: fila.switch_factura_id, tipo: fila.tipo_comprobante });
        res.documentosBajados++;
      }

      if (buffer.length >= LOTE_ESCRITURA) await volcar();
    }
    await volcar();

    res.ok = true;
    await finishSwitchSyncLog(logId, "success", {
      inserted: res.lineasEscritas,
      updated: res.documentosBajados,
      skipped: res.documentosFallados,
    });
    return res;
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
    await finishSwitchSyncLog(logId, "error", { errorMessage: res.error });
    return res;
  }
}

/** Agrupa por tipo para poder usar un `.in()` por grupo: el `update` filtra por
 *  `(empresa, tipo, id)` y mezclar tipos en un solo `.in()` marcaría el
 *  documento equivocado cuando una factura y una NC comparten número. */
function porTipo(ids: { id: number; tipo: string }[]): { tipo: string; ids: number[] }[] {
  const mapa = new Map<string, number[]>();
  for (const { id, tipo } of ids) {
    const lista = mapa.get(tipo) ?? [];
    lista.push(id);
    mapa.set(tipo, lista);
  }
  return [...mapa.entries()].map(([tipo, lista]) => ({ tipo, ids: lista }));
}

/**
 * Corre las empresas SERIALMENTE (sesión única de Switch) y cierra las sesiones
 * al terminar. Una empresa que falla NO tumba a las demás.
 */
export async function sincronizarLineas(opts: {
  empresas?: EmpresaKey[];
  limitePorEmpresa?: number | null;
  triggeredBy?: SwitchSyncTriggeredBy;
}): Promise<ResultadoLineas[]> {
  const empresas = opts.empresas ?? empresasConDetalleDeLinea();
  const out: ResultadoLineas[] = [];
  try {
    for (const empresaKey of empresas) {
      out.push(
        await sincronizarLineasEmpresa(empresaKey, {
          limite: opts.limitePorEmpresa ?? null,
          triggeredBy: opts.triggeredBy,
        }),
      );
    }
  } finally {
    await logoutAllSwitchSessions();
  }
  return out;
}
