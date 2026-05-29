/**
 * Sync multi-empresa Switch → Supabase.
 *
 *   syncEmpresaFacturas(empresaKey, opts)      → switch_facturas
 *   syncEmpresaEstadoCuenta(empresaKey, opts)  → switch_estadocuenta
 *
 * Multifashion (american_classic) NO usa estas funciones para facturas — sigue
 * en multifashion_tickets vía sync.ts (legacy). Sí participa en CXC.
 *
 * Reusa parse.ts (parseAmount con fix de coma de miles). Nunca skip silencioso:
 * cada descarte se loguea y se persiste en switch_sync_log.skip_details.
 */

import { createSwitchClient, SwitchApiError } from "./client";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import type {
  SwitchFactura,
  SwitchCliente,
  SwitchEstadoCuentaElement,
} from "./types";
import { parseAmount, parseSwitchFecha, parseFechaDMY } from "./parse";
import { supabaseServer } from "../supabase-server";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface EmpresaSyncResult {
  empresaKey: EmpresaKey;
  syncType: "facturas" | "estadocuenta";
  logId: string;
  inserted: number;
  updated: number;
  skipped: number;
  durationMs: number;
}

export interface SyncOptions {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  triggeredBy: "cron" | "manual" | "backfill";
}

export interface SkipDetail {
  facturaId: number | string | null;
  secuencial: string | null;
  campo: string;
  valorCrudo: unknown;
}

const PAGE_SIZE = 50;
const UPSERT_BATCH = 100;
const MAX_PAGES = 1000;
const CLIENTES_PAGE = 200;
const MAX_CLIENTES_PAGES = 2000;

// ─── Log helper (resiliente a skip_details ausente) ──────────────────────────

interface SyncLogFinalFields {
  status: "success" | "error";
  finished_at: string;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  error_message?: string;
  skip_details: SkipDetail[];
}

async function finalizeSyncLog(
  logId: string,
  fields: SyncLogFinalFields,
): Promise<void> {
  const { skip_details, ...core } = fields;
  const { error } = await supabaseServer
    .from("switch_sync_log")
    .update({ ...core, skip_details })
    .eq("id", logId);
  if (!error) return;
  console.error(
    `[sync] update con skip_details falló (${error.message}); reintento sin ella`,
  );
  const { error: error2 } = await supabaseServer
    .from("switch_sync_log")
    .update(core)
    .eq("id", logId);
  if (error2) console.error(`[sync] no pude finalizar switch_sync_log: ${error2.message}`);
}

async function createSyncLog(
  empresaKey: EmpresaKey,
  syncType: "facturas" | "estadocuenta",
  opts: SyncOptions,
): Promise<string> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .insert({
      empresa_key: empresaKey,
      sync_type: syncType,
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
  if (error || !data) {
    throw new Error(`No pude crear switch_sync_log: ${error?.message ?? "vacío"}`);
  }
  return (data as { id: string }).id;
}

// ═══════════════════════════════════════════════════════════════════════════
//   FACTURAS → switch_facturas
// ═══════════════════════════════════════════════════════════════════════════

interface FacturaRow {
  empresa_key: string;
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

type FacturaMapResult =
  | { ok: true; row: FacturaRow }
  | { ok: false; skip: SkipDetail };

function mapFactura(empresaKey: string, f: SwitchFactura): FacturaMapResult {
  const facturaId = f && (typeof f.id === "number" || typeof f.id === "string") ? f.id : null;
  const secuencial = f && typeof f.secuencial === "string" ? f.secuencial : null;
  if (!f) return { ok: false, skip: { facturaId: null, secuencial: null, campo: "factura", valorCrudo: f } };
  if (typeof f.id !== "number") return { ok: false, skip: { facturaId, secuencial, campo: "id", valorCrudo: f.id } };
  if (!f.secuencial) return { ok: false, skip: { facturaId, secuencial, campo: "secuencial", valorCrudo: f.secuencial } };
  if (!f.tipoComprobante) return { ok: false, skip: { facturaId, secuencial, campo: "tipoComprobante", valorCrudo: f.tipoComprobante } };
  if (!f.fecha) return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: f.fecha } };
  const fechaIso = parseSwitchFecha(f.fecha);
  if (!fechaIso) return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: f.fecha } };

  const subtotal = parseAmount(f.subTotal);
  if (subtotal === null) return { ok: false, skip: { facturaId, secuencial, campo: "subTotal", valorCrudo: f.subTotal } };
  const total = parseAmount(f.total);
  if (total === null) return { ok: false, skip: { facturaId, secuencial, campo: "total", valorCrudo: f.total } };
  const subtotalDescuento = parseAmount(f.subTotalDescuento);
  if (subtotalDescuento === null) return { ok: false, skip: { facturaId, secuencial, campo: "subTotalDescuento", valorCrudo: f.subTotalDescuento } };

  return {
    ok: true,
    row: {
      empresa_key: empresaKey,
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

async function persistFacturasBatch(
  empresaKey: string,
  rows: FacturaRow[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // Dedupe within-batch por switch_factura_id (last-wins).
  const byId = new Map<number, FacturaRow>();
  for (const r of rows) byId.set(r.switch_factura_id, r);
  const unique = Array.from(byId.values());

  const ids = unique.map((r) => r.switch_factura_id);
  const { data: existing, error: selErr } = await supabaseServer
    .from("switch_facturas")
    .select("switch_factura_id")
    .eq("empresa_key", empresaKey)
    .in("switch_factura_id", ids);
  if (selErr) throw new Error(`SELECT existentes falló: ${selErr.message}`);

  const existingSet = new Set<number>(
    ((existing ?? []) as Array<{ switch_factura_id: number }>).map((r) => r.switch_factura_id),
  );

  const nowIso = new Date().toISOString();
  const newRows = unique.filter((r) => !existingSet.has(r.switch_factura_id));
  const updRows = unique.filter((r) => existingSet.has(r.switch_factura_id));

  if (newRows.length > 0) {
    const { error } = await supabaseServer
      .from("switch_facturas")
      .insert(newRows.map((r) => ({ ...r, synced_at: nowIso, updated_at: nowIso })));
    if (error) throw new Error(`INSERT falló: ${error.message}`);
  }

  if (updRows.length > 0) {
    // Mutable: total, saldo, descuento, subtotal_descuento, impuesto, raw_data.
    // Inmutable: switch_factura_id, secuencial, fecha, tipo_comprobante, subtotal.
    const results = await Promise.all(
      updRows.map((r) =>
        supabaseServer
          .from("switch_facturas")
          .update({
            total: r.total,
            saldo: r.saldo,
            descuento: r.descuento,
            subtotal_descuento: r.subtotal_descuento,
            impuesto: r.impuesto,
            raw_data: r.raw_data,
            updated_at: nowIso,
          })
          .eq("empresa_key", empresaKey)
          .eq("switch_factura_id", r.switch_factura_id),
      ),
    );
    for (const res of results) if (res.error) throw new Error(`UPDATE falló: ${res.error.message}`);
  }

  return { inserted: newRows.length, updated: updRows.length };
}

export async function syncEmpresaFacturas(
  empresaKey: EmpresaKey,
  opts: SyncOptions,
): Promise<EmpresaSyncResult> {
  const startedAt = Date.now();
  const logId = await createSyncLog(empresaKey, "facturas", opts);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(empresaKey);
    let buffer: FacturaRow[] = [];

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
        const res = mapFactura(empresaKey, f);
        if (!res.ok) {
          skipped++;
          skipDetails.push(res.skip);
          console.error(
            `[sync ${empresaKey} facturas] SKIP id=${res.skip.facturaId} sec=${res.skip.secuencial} campo=${res.skip.campo} valorCrudo=${JSON.stringify(res.skip.valorCrudo)}`,
          );
          continue;
        }
        buffer.push(res.row);
      }

      while (buffer.length >= UPSERT_BATCH) {
        const batch = buffer.splice(0, UPSERT_BATCH);
        const r = await persistFacturasBatch(empresaKey, batch);
        inserted += r.inserted;
        updated += r.updated;
      }

      const total = Number(resp.paginacion?.total ?? 0);
      if (page * PAGE_SIZE >= total) break;
    }

    if (buffer.length > 0) {
      const r = await persistFacturasBatch(empresaKey, buffer);
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
    return { empresaKey, syncType: "facturas", logId, inserted, updated, skipped, durationMs };
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync ${empresaKey} facturas] ERROR tras ${durationMs}ms: ${message}`);
    if (err instanceof SwitchApiError) {
      console.error(`[sync ${empresaKey} facturas] SwitchApiError code=${err.code} httpCode=${err.httpCode} endpoint=${err.endpoint}`);
    }
    if (err instanceof Error && err.stack) console.error(err.stack);
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

// ═══════════════════════════════════════════════════════════════════════════
//   ESTADO DE CUENTA (CXC) → switch_estadocuenta
// ═══════════════════════════════════════════════════════════════════════════

interface EstadoCuentaRow {
  empresa_key: string;
  ccte_id: number;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  cliente_codigo: string | null;
  secuencial: string | null;
  numero_fiscal: string | null;
  tipo_comprobante: string | null;
  abrev: string | null;
  total: number | null;
  saldo: number | null;
  debito: number | null;
  credito: number | null;
  saldo_original: number | null;
  total_original: number | null;
  plazo_credito: number | null;
  dias: number | null;
  fecha_creacion: string | null;
  raw_data: unknown;
}

function mapEstadoCuentaElement(
  empresaKey: string,
  cliente: SwitchCliente,
  el: SwitchEstadoCuentaElement,
): { ok: true; row: EstadoCuentaRow } | { ok: false; skip: SkipDetail } {
  if (typeof el.ccteId !== "number") {
    return { ok: false, skip: { facturaId: cliente.id ?? null, secuencial: el.secuencial ?? null, campo: "ccteId", valorCrudo: el.ccteId } };
  }
  return {
    ok: true,
    row: {
      empresa_key: empresaKey,
      ccte_id: el.ccteId,
      cliente_switch_id: typeof cliente.id === "number" ? cliente.id : null,
      cliente_nombre: cliente.nombre ?? null,
      cliente_codigo: cliente.codigo ?? null,
      secuencial: el.secuencial ?? null,
      numero_fiscal: el.numeroFiscal ?? null,
      tipo_comprobante: el.tipoComprobante ?? null,
      abrev: el.abrev ?? null,
      total: parseAmount(el.total),
      saldo: parseAmount(el.saldo),
      debito: parseAmount(el.debito),
      credito: parseAmount(el.credito),
      saldo_original: parseAmount(el.saldoOriginal),
      total_original: parseAmount(el.totalOriginal),
      plazo_credito: parseAmount(el.plazoCredito),
      dias: typeof el.dias === "number" ? el.dias : null,
      fecha_creacion: parseFechaDMY(el.fechaCreacion),
      raw_data: el,
    },
  };
}

async function persistEstadoCuentaBatch(
  empresaKey: string,
  rows: EstadoCuentaRow[],
  runStamp: string,
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // Dedupe within-batch por ccte_id.
  const byId = new Map<number, EstadoCuentaRow>();
  for (const r of rows) byId.set(r.ccte_id, r);
  const unique = Array.from(byId.values());

  const ids = unique.map((r) => r.ccte_id);
  const { data: existing, error: selErr } = await supabaseServer
    .from("switch_estadocuenta")
    .select("ccte_id")
    .eq("empresa_key", empresaKey)
    .in("ccte_id", ids);
  if (selErr) throw new Error(`SELECT estadocuenta falló: ${selErr.message}`);

  const existingSet = new Set<number>(
    ((existing ?? []) as Array<{ ccte_id: number }>).map((r) => r.ccte_id),
  );

  const newRows = unique.filter((r) => !existingSet.has(r.ccte_id));
  const updRows = unique.filter((r) => existingSet.has(r.ccte_id));

  if (newRows.length > 0) {
    const { error } = await supabaseServer
      .from("switch_estadocuenta")
      .insert(newRows.map((r) => ({ ...r, synced_at: runStamp, updated_at: runStamp })));
    if (error) throw new Error(`INSERT estadocuenta falló: ${error.message}`);
  }

  if (updRows.length > 0) {
    // Snapshot: todos los campos son mutables. synced_at=runStamp marca "visto
    // en este run" para la reconciliación posterior.
    const results = await Promise.all(
      updRows.map((r) =>
        supabaseServer
          .from("switch_estadocuenta")
          .update({
            cliente_switch_id: r.cliente_switch_id,
            cliente_nombre: r.cliente_nombre,
            cliente_codigo: r.cliente_codigo,
            secuencial: r.secuencial,
            numero_fiscal: r.numero_fiscal,
            tipo_comprobante: r.tipo_comprobante,
            abrev: r.abrev,
            total: r.total,
            saldo: r.saldo,
            debito: r.debito,
            credito: r.credito,
            saldo_original: r.saldo_original,
            total_original: r.total_original,
            plazo_credito: r.plazo_credito,
            dias: r.dias,
            fecha_creacion: r.fecha_creacion,
            raw_data: r.raw_data,
            synced_at: runStamp,
            updated_at: runStamp,
          })
          .eq("empresa_key", empresaKey)
          .eq("ccte_id", r.ccte_id),
      ),
    );
    for (const res of results) if (res.error) throw new Error(`UPDATE estadocuenta falló: ${res.error.message}`);
  }

  return { inserted: newRows.length, updated: updRows.length };
}

export async function syncEmpresaEstadoCuenta(
  empresaKey: EmpresaKey,
  opts: SyncOptions,
): Promise<EmpresaSyncResult> {
  const startedAt = Date.now();
  const runStamp = new Date(startedAt).toISOString();
  const logId = await createSyncLog(empresaKey, "estadocuenta", opts);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(empresaKey);

    // 1) Traer todos los clientes de la empresa.
    const clientes: SwitchCliente[] = [];
    for (let page = 1; page <= MAX_CLIENTES_PAGES; page++) {
      const resp = await client.listClientes({ porPagina: CLIENTES_PAGE, paginaActual: page });
      const batch = resp.clientes ?? [];
      if (batch.length === 0) break;
      clientes.push(...batch);
      const total = Number(resp.paginacion?.total ?? 0);
      if (page * CLIENTES_PAGE >= total) break;
    }
    console.error(`[sync ${empresaKey} cxc] ${clientes.length} clientes a consultar`);

    // 2) Estado de cuenta por cliente → buffer → flush batches.
    let buffer: EstadoCuentaRow[] = [];
    let procesados = 0;
    for (const cliente of clientes) {
      if (typeof cliente.id !== "number") continue;
      let ec;
      try {
        ec = await client.getEstadoCuenta(cliente.id);
      } catch (err) {
        // Un cliente que falla no aborta todo el run; se loguea como skip.
        skipped++;
        skipDetails.push({ facturaId: cliente.id, secuencial: null, campo: "getEstadoCuenta", valorCrudo: err instanceof Error ? err.message : String(err) });
        console.error(`[sync ${empresaKey} cxc] cliente ${cliente.id} falló: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const elements = ec?.estadocuenta?.elements ?? [];
      for (const el of elements) {
        const res = mapEstadoCuentaElement(empresaKey, cliente, el);
        if (!res.ok) {
          skipped++;
          skipDetails.push(res.skip);
          continue;
        }
        buffer.push(res.row);
      }
      while (buffer.length >= UPSERT_BATCH) {
        const b = buffer.splice(0, UPSERT_BATCH);
        const r = await persistEstadoCuentaBatch(empresaKey, b, runStamp);
        inserted += r.inserted;
        updated += r.updated;
      }
      procesados++;
      if (procesados % 100 === 0) {
        console.error(`[sync ${empresaKey} cxc] ${procesados}/${clientes.length} clientes — ins=${inserted} upd=${updated}`);
      }
    }
    if (buffer.length > 0) {
      const r = await persistEstadoCuentaBatch(empresaKey, buffer, runStamp);
      inserted += r.inserted;
      updated += r.updated;
      buffer = [];
    }

    // 3) Reconciliar: documentos no vistos en este run (pagados/cerrados) que
    //    aún tengan saldo > 0 → poner saldo 0. synced_at < runStamp = no tocado.
    const { error: recErr } = await supabaseServer
      .from("switch_estadocuenta")
      .update({ saldo: 0, updated_at: new Date().toISOString() })
      .eq("empresa_key", empresaKey)
      .lt("synced_at", runStamp)
      .gt("saldo", 0);
    if (recErr) console.error(`[sync ${empresaKey} cxc] reconcile falló: ${recErr.message}`);

    const durationMs = Date.now() - startedAt;
    await finalizeSyncLog(logId, {
      status: "success",
      finished_at: new Date().toISOString(),
      records_inserted: inserted,
      records_updated: updated,
      records_skipped: skipped,
      skip_details: skipDetails,
    });
    return { empresaKey, syncType: "estadocuenta", logId, inserted, updated, skipped, durationMs };
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync ${empresaKey} cxc] ERROR tras ${durationMs}ms: ${message}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
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
