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

function parseAmount(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapFacturaToRow(f: SwitchFactura): TicketInsertRow | null {
  if (!f || typeof f.id !== "number" || !f.secuencial || !f.tipoComprobante || !f.fecha) {
    return null;
  }
  const fechaIso = parseSwitchFecha(f.fecha);
  if (!fechaIso) return null;

  const subtotal = parseAmount(f.subTotal);
  const total = parseAmount(f.total);
  const subtotalDescuento = parseAmount(f.subTotalDescuento);
  if (subtotal === null || total === null || subtotalDescuento === null) {
    return null;
  }

  return {
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
  };
}

// ─── Persistencia ────────────────────────────────────────────────────────────

async function persistBatch(
  rows: TicketInsertRow[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const ids = rows.map((r) => r.switch_factura_id);
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
  const newRows = rows.filter((r) => !existingSet.has(r.switch_factura_id));
  const updRows = rows.filter((r) => existingSet.has(r.switch_factura_id));

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
        const row = mapFacturaToRow(f);
        if (row === null) {
          skipped++;
          continue;
        }
        buffer.push(row);
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

    const { error: updLogErr } = await supabaseServer
      .from("multifashion_sync_log")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        records_inserted: inserted,
        records_updated: updated,
        records_skipped: skipped,
      })
      .eq("id", logId);
    if (updLogErr) {
      // No revertimos el run — la data ya está en multifashion_tickets.
      console.error("[sync] No pude marcar sync_log success:", updLogErr.message);
    }

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

    await supabaseServer
      .from("multifashion_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        records_inserted: inserted,
        records_updated: updated,
        records_skipped: skipped,
        error_message: message.slice(0, 2000),
      })
      .eq("id", logId);

    throw err;
  }
}
