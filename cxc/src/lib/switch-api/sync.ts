/**
 * Sincronización de facturas/tiquetes Multifashion desde Switch Soft → Supabase.
 *
 * Flujo:
 *   1. Crea fila en multifashion_sync_log con status='running'.
 *   2. Pagina listFacturas (50 por página) sobre [desde, hasta].
 *   3. Por batch: SELECT IDs existentes → INSERT nuevos + UPDATE mutables.
 *   4. Actualiza el log a 'success' o 'error' con counters.
 *
 * Inmutable on conflict (NO actualizar en UPDATE):
 *   switch_factura_id, secuencial, fecha, tipo_comprobante
 * Mutable (SÍ actualizar):
 *   total, saldo, descuento, subtotal_descuento, impuesto, raw_data, updated_at
 *
 * Las columnas denormalizadas (cliente_*, vendedor_*, sucursal_*) y subtotal
 * sólo se escriben en el INSERT inicial; no se tocan en updates posteriores
 * (siguen la regla "inmutable" implícita del spec del sprint).
 */

import { createSwitchClient, SwitchApiError } from "./client";
import type { SwitchFactura } from "./types";
import { supabaseServer } from "../supabase-server";

export interface SyncResult {
  logId: string;
  inserted: number;
  updated: number;
  skipped: number;
  durationMs: number;
}

export interface SyncOptions {
  /** YYYY-MM-DD */
  desde: string;
  /** YYYY-MM-DD */
  hasta: string;
  triggeredBy: "cron" | "manual" | "backfill";
}

const EMPRESA_KEY = "multifashion";
const PAGE_SIZE = 50;
const UPSERT_BATCH = 100;
/** Guardia: cap absoluto de páginas por run para evitar loops infinitos si
 *  Switch devuelve paginación inconsistente. 1000 * 50 = 50k facturas, suficiente
 *  para cualquier mes razonable. */
const MAX_PAGES = 1000;

// ─── Mapeo Switch → tabla ────────────────────────────────────────────────────

interface TicketInsertRow {
  switch_factura_id: number;
  secuencial: string;
  tipo_comprobante: string;
  fecha: string;
  subtotal: number;
  descuento: number;
  subtotal_descuento: number;
  impuesto: number;
  total: number;
  saldo: number;
  condicion_venta: string | null;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  vendedor_switch_id: number | null;
  vendedor_nombre: string | null;
  sucursal_switch_id: number | null;
  sucursal_nombre: string | null;
  raw_data: unknown;
}

/** Switch devuelve "YYYY-MM-DD HH:mm:ss" sin TZ; tratamos como hora Panamá (UTC-5, sin DST). */
function parseSwitchFecha(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-05:00`;
}

/**
 * Switch formatea montos en formato US: coma = separador de miles, punto =
 * decimal. Ej: "2,112.0000" = 2112.0. Inconsistente entre campos: `total`
 * llega sin coma ("2112.0000") pero `subTotal`/`subTotalDescuento` llegan con
 * coma cuando son >= 1000. Number("2,112.0000") es NaN, así que hay que sacar
 * la coma antes de parsear — sin esto se descartaban TODAS las facturas
 * >= $1,000 (todo el wholesale). NO asumir formato europeo (punto=miles).
 */
function parseAmount(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = String(s).trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Detalle de una factura descartada — para diagnóstico, nunca skip silencioso. */
export interface SkipDetail {
  facturaId: number | string | null;
  secuencial: string | null;
  campo: string;
  valorCrudo: unknown;
}

type MapResult =
  | { ok: true; row: TicketInsertRow }
  | { ok: false; skip: SkipDetail };

function mapFacturaToRow(f: SwitchFactura): MapResult {
  // Identidad. Reportamos el primer campo de identidad que falle.
  const facturaId = f && (typeof f.id === "number" || typeof f.id === "string") ? f.id : null;
  const secuencial = f && typeof f.secuencial === "string" ? f.secuencial : null;
  if (!f) {
    return { ok: false, skip: { facturaId: null, secuencial: null, campo: "factura", valorCrudo: f } };
  }
  if (typeof f.id !== "number") {
    return { ok: false, skip: { facturaId, secuencial, campo: "id", valorCrudo: f.id } };
  }
  if (!f.secuencial) {
    return { ok: false, skip: { facturaId, secuencial, campo: "secuencial", valorCrudo: f.secuencial } };
  }
  if (!f.tipoComprobante) {
    return { ok: false, skip: { facturaId, secuencial, campo: "tipoComprobante", valorCrudo: f.tipoComprobante } };
  }
  if (!f.fecha) {
    return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: f.fecha } };
  }
  const fechaIso = parseSwitchFecha(f.fecha);
  if (!fechaIso) {
    return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: f.fecha } };
  }

  const subtotal = parseAmount(f.subTotal);
  if (subtotal === null) {
    return { ok: false, skip: { facturaId, secuencial, campo: "subTotal", valorCrudo: f.subTotal } };
  }
  const total = parseAmount(f.total);
  if (total === null) {
    return { ok: false, skip: { facturaId, secuencial, campo: "total", valorCrudo: f.total } };
  }
  const subtotalDescuento = parseAmount(f.subTotalDescuento);
  if (subtotalDescuento === null) {
    return { ok: false, skip: { facturaId, secuencial, campo: "subTotalDescuento", valorCrudo: f.subTotalDescuento } };
  }

  return {
    ok: true,
    row: {
      switch_factura_id: f.id,
      secuencial: f.secuencial,
      tipo_comprobante: f.tipoComprobante,
      fecha: fechaIso,
      subtotal,
      descuento: parseAmount(f.descuento) ?? 0,
      subtotal_descuento: subtotalDescuento,
      impuesto: parseAmount(f.impuesto) ?? 0,
      total,
      saldo: parseAmount(f.saldo) ?? 0,
      condicion_venta: f.condicionVenta ?? null,
      cliente_switch_id: typeof f.clienteId === "number" ? f.clienteId : null,
      cliente_nombre: f.cliente ?? null,
      cliente_email: f.clienteEmail ? f.clienteEmail : null,
      vendedor_switch_id: typeof f.vendedorId === "number" ? f.vendedorId : null,
      vendedor_nombre: f.vendedor ?? null,
      sucursal_switch_id: typeof f.sucursalId === "number" ? f.sucursalId : null,
      sucursal_nombre: f.sucursal ?? null,
      raw_data: f,
    },
  };
}

// ─── Persistencia ────────────────────────────────────────────────────────────

/**
 * Persistir un batch + reportar contadores correctos.
 *
 * Contrato del flujo de conteo (no romper sin actualizar el spec del sprint):
 *
 *   inserted = filas cuyo switch_factura_id NO existía en multifashion_tickets
 *              ANTES de esta batch específica (medido por el SELECT inicial).
 *   updated  = filas cuyo switch_factura_id SÍ existía en multifashion_tickets
 *              ANTES de esta batch específica.
 *
 * Reglas clave para no regresionar:
 *   1. El SELECT debe correr ANTES del INSERT. Si invertís el orden, los nuevos
 *      se cuentan como updates (era el bug observado en el primer backfill:
 *      todo terminaba en updated=N, inserted=0).
 *   2. Dedupe IN-MEMORY por switch_factura_id antes del SELECT. Switch puede
 *      devolver la misma factura en dos páginas adyacentes del mismo run;
 *      sin dedupe, el INSERT explota por unique violation, o (peor) cuenta
 *      la misma factura dos veces.
 *   3. NO usar upsert sin SELECT previo: PostgREST no distingue insert vs
 *      update en la respuesta y perdemos los counters.
 *   4. La SELECT mira el estado pre-batch. Si en una run multi-batch la misma
 *      factura aparece en batch 1 y batch 3 (cross-page Switch dupe), la
 *      segunda aparición se cuenta como update porque ya está en DB — lo cual
 *      es correcto: ese factura ya se contó como inserted en su primer
 *      encuentro.
 */
async function persistBatch(
  rows: TicketInsertRow[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // Dedupe within-batch: last-wins por switch_factura_id.
  const byId = new Map<number, TicketInsertRow>();
  for (const r of rows) byId.set(r.switch_factura_id, r);
  const uniqueRows = Array.from(byId.values());

  // Snapshot del estado PRE-batch. Cualquier id devuelto acá ya existía
  // antes de tocar la tabla en esta llamada → se contará como update.
  const ids = uniqueRows.map((r) => r.switch_factura_id);
  const { data: existing, error: selErr } = await supabaseServer
    .from("multifashion_tickets")
    .select("switch_factura_id")
    .in("switch_factura_id", ids);
  if (selErr) {
    throw new Error(`SELECT existentes falló: ${selErr.message}`);
  }

  const existingSet = new Set<number>(
    ((existing ?? []) as Array<{ switch_factura_id: number }>).map(
      (r) => r.switch_factura_id,
    ),
  );

  const nowIso = new Date().toISOString();
  const newRows = uniqueRows.filter(
    (r) => !existingSet.has(r.switch_factura_id),
  );
  const updRows = uniqueRows.filter((r) =>
    existingSet.has(r.switch_factura_id),
  );

  if (newRows.length > 0) {
    const insertPayload = newRows.map((r) => ({
      ...r,
      synced_at: nowIso,
      updated_at: nowIso,
    }));
    const { error: insErr } = await supabaseServer
      .from("multifashion_tickets")
      .insert(insertPayload);
    if (insErr) {
      throw new Error(`INSERT falló: ${insErr.message}`);
    }
  }

  if (updRows.length > 0) {
    // Sólo campos mutables del spec. Per-row porque PostgREST no expone SET
    // selectivo en upsert; ~50 updates paralelos por batch es manejable.
    const results = await Promise.all(
      updRows.map((r) =>
        supabaseServer
          .from("multifashion_tickets")
          .update({
            total: r.total,
            saldo: r.saldo,
            descuento: r.descuento,
            subtotal_descuento: r.subtotal_descuento,
            impuesto: r.impuesto,
            raw_data: r.raw_data,
            updated_at: nowIso,
          })
          .eq("switch_factura_id", r.switch_factura_id),
      ),
    );
    for (const res of results) {
      if (res.error) {
        throw new Error(`UPDATE falló: ${res.error.message}`);
      }
    }
  }

  return { inserted: newRows.length, updated: updRows.length };
}

// ─── Finalización del log (resiliente a columna skip_details ausente) ────────

interface SyncLogFinalFields {
  status: "success" | "error";
  finished_at: string;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  error_message?: string;
  skip_details: SkipDetail[];
}

/**
 * Marca el sync_log como terminado. Intenta escribir skip_details; si la
 * columna aún no existe (migración no aplicada), reintenta sin ella para no
 * dejar el log atascado en 'running'. Los skips ya quedaron en console.error.
 */
async function finalizeSyncLog(
  logId: string,
  fields: SyncLogFinalFields,
): Promise<void> {
  const { skip_details, ...core } = fields;
  const withDetails = { ...core, skip_details };

  const { error } = await supabaseServer
    .from("multifashion_sync_log")
    .update(withDetails)
    .eq("id", logId);
  if (!error) return;

  // Fallback: probablemente la columna skip_details no existe todavía.
  console.error(
    `[sync] update con skip_details falló (${error.message}); reintento sin skip_details`,
  );
  const { error: error2 } = await supabaseServer
    .from("multifashion_sync_log")
    .update(core)
    .eq("id", logId);
  if (error2) {
    console.error(`[sync] no pude finalizar sync_log: ${error2.message}`);
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

export async function syncMultifashionTickets(
  opts: SyncOptions,
): Promise<SyncResult> {
  const startedAt = Date.now();

  const { data: logRow, error: logErr } = await supabaseServer
    .from("multifashion_sync_log")
    .insert({
      status: "running",
      range_from: opts.desde,
      range_to: opts.hasta,
      triggered_by: opts.triggeredBy,
      records_inserted: 0,
      records_updated: 0,
      records_skipped: 0,
    })
    .select("id")
    .single();
  if (logErr || !logRow) {
    throw new Error(
      `No pude crear multifashion_sync_log: ${logErr?.message ?? "respuesta vacía"}`,
    );
  }
  const logId = (logRow as { id: string }).id;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(EMPRESA_KEY);
    let buffer: TicketInsertRow[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const resp = await client.listFacturas({
        desde: opts.desde,
        hasta: opts.hasta,
        porPagina: PAGE_SIZE,
        paginaActual: page,
      });

      const facturas = resp.facturas ?? [];
      if (facturas.length === 0) break;

      for (const f of facturas) {
        const res = mapFacturaToRow(f);
        if (!res.ok) {
          skipped++;
          skipDetails.push(res.skip);
          // Nunca skip silencioso: log explícito con el campo y valor crudo.
          console.error(
            `[sync] SKIP factura id=${res.skip.facturaId} sec=${res.skip.secuencial} campo=${res.skip.campo} valorCrudo=${JSON.stringify(res.skip.valorCrudo)}`,
          );
          continue;
        }
        buffer.push(res.row);
      }

      while (buffer.length >= UPSERT_BATCH) {
        const batch = buffer.splice(0, UPSERT_BATCH);
        const r = await persistBatch(batch);
        inserted += r.inserted;
        updated += r.updated;
      }

      const total = Number(resp.paginacion?.total ?? 0);
      if (page * PAGE_SIZE >= total) break;
    }

    if (buffer.length > 0) {
      const r = await persistBatch(buffer);
      inserted += r.inserted;
      updated += r.updated;
      buffer = [];
    }

    const durationMs = Date.now() - startedAt;

    await finalizeSyncLog(logId, {
      status: "success",
      finished_at: new Date().toISOString(),
      records_inserted: inserted,
      records_updated: updated,
      records_skipped: skipped,
      skip_details: skipDetails,
    });

    return { logId, inserted, updated, skipped, durationMs };
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[sync] ERROR tras ${durationMs}ms: ${message}`);
    if (err instanceof SwitchApiError) {
      console.error(
        `[sync] SwitchApiError code=${err.code} httpCode=${err.httpCode} endpoint=${err.endpoint}`,
      );
    }
    if (stack) console.error(stack);

    await finalizeSyncLog(logId, {
      status: "error",
      finished_at: new Date().toISOString(),
      records_inserted: inserted,
      records_updated: updated,
      records_skipped: skipped,
      error_message: message.slice(0, 2000),
      skip_details: skipDetails,
    });

    throw err;
  }
}
