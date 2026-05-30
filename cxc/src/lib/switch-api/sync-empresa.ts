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
  SwitchNota,
  SwitchCliente,
  SwitchEstadoCuentaElement,
} from "./types";
import { parseAmount, parseSwitchFecha, parseFechaDMY } from "./parse";
import { supabaseServer } from "../supabase-server";

import type { SwitchTotalVentasDia } from "./types";

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
      switch_factura_id: Number(f.id),
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

/**
 * Mapea una Nota de Crédito/Débito a FacturaRow. Diferencias vs mapFactura:
 *   - tipo_comprobante se setea explícito (el endpoint no lo trae).
 *   - condicion_venta y cliente_email no vienen → null.
 *   - Montos se guardan en POSITIVO (ABS): las NCs llegan negativas del API.
 *     El signo contable lo aplica switch_ventas_netas_vw en query time.
 */
function mapNota(
  empresaKey: string,
  tipo: "Nota de Crédito" | "Nota de Débito",
  n: SwitchNota,
): FacturaMapResult {
  const facturaId = n && (typeof n.id === "number" || typeof n.id === "string") ? n.id : null;
  const secuencial = n && typeof n.secuencial === "string" ? n.secuencial : null;
  if (!n) return { ok: false, skip: { facturaId: null, secuencial: null, campo: "nota", valorCrudo: n } };
  if (typeof n.id !== "number") return { ok: false, skip: { facturaId, secuencial, campo: "id", valorCrudo: n.id } };
  if (!n.secuencial) return { ok: false, skip: { facturaId, secuencial, campo: "secuencial", valorCrudo: n.secuencial } };
  if (!n.fecha) return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: n.fecha } };
  const fechaIso = parseSwitchFecha(n.fecha);
  if (!fechaIso) return { ok: false, skip: { facturaId, secuencial, campo: "fecha", valorCrudo: n.fecha } };

  const subtotal = parseAmount(n.subTotal);
  if (subtotal === null) return { ok: false, skip: { facturaId, secuencial, campo: "subTotal", valorCrudo: n.subTotal } };
  const total = parseAmount(n.total);
  if (total === null) return { ok: false, skip: { facturaId, secuencial, campo: "total", valorCrudo: n.total } };
  const subtotalDescuento = parseAmount(n.subTotalDescuento);
  if (subtotalDescuento === null) return { ok: false, skip: { facturaId, secuencial, campo: "subTotalDescuento", valorCrudo: n.subTotalDescuento } };

  return {
    ok: true,
    row: {
      empresa_key: empresaKey,
      switch_factura_id: Number(n.id),
      secuencial: n.secuencial,
      tipo_comprobante: tipo,
      fecha: fechaIso,
      subtotal: Math.abs(subtotal),
      descuento: Math.abs(parseAmount(n.descuento) ?? 0),
      subtotal_descuento: Math.abs(subtotalDescuento),
      impuesto: Math.abs(parseAmount(n.impuesto) ?? 0),
      total: Math.abs(total),
      saldo: Math.abs(parseAmount(n.saldo) ?? 0),
      condicion_venta: null,
      cliente_switch_id: typeof n.clienteId === "number" ? n.clienteId : null,
      cliente_nombre: n.cliente ?? null,
      cliente_email: null,
      vendedor_switch_id: typeof n.vendedorId === "number" ? n.vendedorId : null,
      vendedor_nombre: n.vendedor ?? null,
      sucursal_switch_id: typeof n.sucursalId === "number" ? n.sucursalId : null,
      sucursal_nombre: n.sucursal ?? null,
      raw_data: n,
    },
  };
}

async function persistFacturasBatch(
  empresaKey: string,
  rows: FacturaRow[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // Dedupe within-batch por switch_factura_id (last-wins). Imprescindible: un
  // upsert con la misma conflict-key repetida en el mismo payload revienta.
  const byId = new Map<number, FacturaRow>();
  for (const r of rows) byId.set(r.switch_factura_id, r);
  const unique = Array.from(byId.values());

  // Conteo informativo (NO condiciona la escritura). Casteamos ambos lados a
  // number: el path viejo SELECT→split clasificaba mal cuando PostgREST devolvía
  // el id como string en algunos deployments (Set<number>.has(string)=false),
  // marcando filas existentes como nuevas → INSERT → duplicate key. El upsert
  // de abajo es inmune a eso.
  const ids = unique.map((r) => r.switch_factura_id);
  const preexisting = new Set<number>();
  const { data: existing, error: selErr } = await supabaseServer
    .from("switch_facturas")
    .select("switch_factura_id")
    .eq("empresa_key", empresaKey)
    .in("switch_factura_id", ids);
  if (selErr) {
    console.error(
      `[sync ${empresaKey} facturas] SELECT informativo falló (conteo aproximado): ${selErr.message}`,
    );
  } else {
    for (const r of (existing ?? []) as Array<{ switch_factura_id: number | string }>) {
      preexisting.add(Number(r.switch_factura_id));
    }
  }

  // Upsert atómico por (empresa_key, switch_factura_id). Omitimos synced_at del
  // payload para preservar el primer sync en filas existentes (default now() en
  // insert, sin cambio en conflicto); updated_at sí se refresca siempre.
  const nowIso = new Date().toISOString();
  const payload = unique.map((r) => ({ ...r, updated_at: nowIso }));
  const { error: upErr } = await supabaseServer
    .from("switch_facturas")
    .upsert(payload, {
      onConflict: "empresa_key,switch_factura_id",
      ignoreDuplicates: false,
    });
  if (upErr) throw new Error(`UPSERT falló: ${upErr.message}`);

  let inserted = 0;
  let updated = 0;
  for (const r of unique) {
    if (preexisting.has(r.switch_factura_id)) updated++;
    else inserted++;
  }
  return { inserted, updated };
}

export async function syncEmpresaFacturas(
  empresaKey: EmpresaKey,
  opts: SyncOptions,
): Promise<EmpresaSyncResult> {
  const startedAt = Date.now();
  const logId = await createSyncLog(empresaKey, "facturas", opts);

  const counters = { inserted: 0, updated: 0, skipped: 0 };
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(empresaKey);
    const buffer: FacturaRow[] = [];

    const flush = async (): Promise<void> => {
      while (buffer.length >= UPSERT_BATCH) {
        const batch = buffer.splice(0, UPSERT_BATCH);
        const r = await persistFacturasBatch(empresaKey, batch);
        counters.inserted += r.inserted;
        counters.updated += r.updated;
      }
    };

    // Pagina un endpoint de comprobantes y empuja filas mapeadas al buffer común.
    //
    // Corte por ACUMULADO REAL (traidos >= total), NO por page*PAGE_SIZE. Switch
    // capa porPagina silenciosamente en endpoints hermanos (/apicliente/lista
    // devuelve ~50 aunque pidamos más), así que asumir "cada página trajo
    // PAGE_SIZE" trunca páginas y pierde comprobantes en silencio. Además, si el
    // API reporta total=0/ausente, el corte viejo (page*PAGE_SIZE>=0) cortaba tras
    // la página 1; ahora solo cortamos por total cuando total es confiable (>0) y
    // si no, seguimos hasta que una página venga vacía.
    const stream = async (
      label: string,
      fetchPage: (page: number) => Promise<{ items: unknown[]; total: number }>,
      mapOne: (it: unknown) => FacturaMapResult,
    ): Promise<void> => {
      let traidos = 0;
      let totalReportado = 0;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { items, total } = await fetchPage(page);
        if (page === 1) totalReportado = total;
        if (items.length === 0) break;
        for (const it of items) {
          const res = mapOne(it);
          if (!res.ok) {
            counters.skipped++;
            skipDetails.push(res.skip);
            console.error(
              `[sync ${empresaKey} ${label}] SKIP id=${res.skip.facturaId} sec=${res.skip.secuencial} campo=${res.skip.campo} valorCrudo=${JSON.stringify(res.skip.valorCrudo)}`,
            );
            continue;
          }
          buffer.push(res.row);
        }
        traidos += items.length;
        await flush();
        if (totalReportado > 0 && traidos >= totalReportado) break;
      }

      // Cobertura: si el API dijo que había más de lo que trajimos, warning
      // visible (console + skip_details en switch_sync_log). Nunca truncar callado.
      if (totalReportado > 0 && traidos < totalReportado) {
        const faltantes = totalReportado - traidos;
        console.warn(
          `[sync ${empresaKey} ${label}] WARNING: traídos ${traidos}/${totalReportado}, faltan ${faltantes} (paginación incompleta)`,
        );
        skipDetails.push({
          facturaId: null,
          secuencial: null,
          campo: `${label}_paginacion_incompleta`,
          valorCrudo: { total_reportado: totalReportado, traidos, faltantes },
        });
      }
    };

    // 1) Facturas (incluye Tiquete y Transacción que devuelve el mismo endpoint).
    await stream(
      "facturas",
      async (page) => {
        const resp = await client.listFacturas({ desde: opts.desde, hasta: opts.hasta, porPagina: PAGE_SIZE, paginaActual: page });
        return { items: resp.facturas ?? [], total: Number(resp.paginacion?.total ?? 0) };
      },
      (it) => mapFactura(empresaKey, it as SwitchFactura),
    );

    // 2) Notas de crédito (total llega negativo del API; se guarda positivo).
    await stream(
      "notas-credito",
      async (page) => {
        const resp = await client.listNotasCredito({ desde: opts.desde, hasta: opts.hasta, porPagina: PAGE_SIZE, paginaActual: page });
        return { items: resp.notascredito ?? [], total: Number(resp.paginacion?.total ?? 0) };
      },
      (it) => mapNota(empresaKey, "Nota de Crédito", it as SwitchNota),
    );

    // 3) Notas de débito.
    await stream(
      "notas-debito",
      async (page) => {
        const resp = await client.listNotasDebito({ desde: opts.desde, hasta: opts.hasta, porPagina: PAGE_SIZE, paginaActual: page });
        return { items: resp.notasdebito ?? [], total: Number(resp.paginacion?.total ?? 0) };
      },
      (it) => mapNota(empresaKey, "Nota de Débito", it as SwitchNota),
    );

    // Flush final del remanente (< UPSERT_BATCH).
    if (buffer.length > 0) {
      const r = await persistFacturasBatch(empresaKey, buffer);
      counters.inserted += r.inserted;
      counters.updated += r.updated;
    }

    const durationMs = Date.now() - startedAt;
    await finalizeSyncLog(logId, {
      status: "success",
      finished_at: new Date().toISOString(),
      records_inserted: counters.inserted,
      records_updated: counters.updated,
      records_skipped: counters.skipped,
      skip_details: skipDetails,
    });
    return {
      empresaKey,
      syncType: "facturas",
      logId,
      inserted: counters.inserted,
      updated: counters.updated,
      skipped: counters.skipped,
      durationMs,
    };
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
      records_inserted: counters.inserted,
      records_updated: counters.updated,
      records_skipped: counters.skipped,
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
      ccte_id: Number(el.ccteId),
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

  // Conteo informativo (NO condiciona la escritura), casteando a number.
  const ids = unique.map((r) => r.ccte_id);
  const preexisting = new Set<number>();
  const { data: existing, error: selErr } = await supabaseServer
    .from("switch_estadocuenta")
    .select("ccte_id")
    .eq("empresa_key", empresaKey)
    .in("ccte_id", ids);
  if (selErr) {
    console.error(
      `[sync ${empresaKey} cxc] SELECT informativo falló (conteo aproximado): ${selErr.message}`,
    );
  } else {
    for (const r of (existing ?? []) as Array<{ ccte_id: number | string }>) {
      preexisting.add(Number(r.ccte_id));
    }
  }

  // Upsert atómico por (empresa_key, ccte_id). CXC es snapshot: synced_at=runStamp
  // en cada escritura (insert y update) para que la reconciliación posterior
  // (synced_at < runStamp) detecte documentos cerrados.
  const payload = unique.map((r) => ({ ...r, synced_at: runStamp, updated_at: runStamp }));
  const { error: upErr } = await supabaseServer
    .from("switch_estadocuenta")
    .upsert(payload, {
      onConflict: "empresa_key,ccte_id",
      ignoreDuplicates: false,
    });
  if (upErr) throw new Error(`UPSERT estadocuenta falló: ${upErr.message}`);

  let inserted = 0;
  let updated = 0;
  for (const r of unique) {
    if (preexisting.has(r.ccte_id)) updated++;
    else inserted++;
  }
  return { inserted, updated };
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
    //
    // OJO con la paginación: /apicliente/lista NO respeta porPagina (Switch cap
    // silencioso ~50 por página aunque pidamos 200). El sync anterior usaba
    //   if (page * CLIENTES_PAGE >= total) break;
    // y cortaba en la página 1 cuando page*200 >= total — dejaba afuera 60%+
    // de los clientes en vistana (50 de 135). Ahora cortamos por:
    //   a) accumulated >= total (clientes ya traídos cubren el total reportado), o
    //   b) batch vacío (defensa contra loop infinito si total es 0/mentiroso).
    // No confiamos en porPagina; trackeamos accumulated real.
    const clientes: SwitchCliente[] = [];
    let clientesTotalReportado = 0;
    for (let page = 1; page <= MAX_CLIENTES_PAGES; page++) {
      const resp = await client.listClientes({ porPagina: CLIENTES_PAGE, paginaActual: page });
      const batch = resp.clientes ?? [];
      if (batch.length === 0) break;
      clientes.push(...batch);
      const totalPagina = Number(resp.paginacion?.total ?? 0);
      if (page === 1) clientesTotalReportado = totalPagina;
      if (totalPagina > 0 && clientes.length >= totalPagina) break;
    }
    const cobertura = clientesTotalReportado > 0
      ? `${clientes.length}/${clientesTotalReportado} (${Math.round((clientes.length / clientesTotalReportado) * 100)}%)`
      : `${clientes.length} (total no reportado)`;
    console.error(`[sync ${empresaKey} cxc] ${cobertura} clientes a consultar`);

    // Warning explícito si el sync no cubrió todos los clientes que el API dice
    // que existen — se persiste también en switch_sync_log vía skipDetails para
    // que sea visible (no silencioso).
    if (clientesTotalReportado > 0 && clientes.length < clientesTotalReportado) {
      const faltantes = clientesTotalReportado - clientes.length;
      console.warn(`[sync ${empresaKey} cxc] WARNING: faltaron ${faltantes} clientes del API (paginación incompleta)`);
      skipDetails.push({
        facturaId: null,
        secuencial: null,
        campo: "listClientes_paginacion_incompleta",
        valorCrudo: { total_reportado: clientesTotalReportado, traidos: clientes.length, faltantes },
      });
    }

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

// ═══════════════════════════════════════════════════════════════════════════
//   COSTO DIARIO (forward) → switch_costo_diario
// ═══════════════════════════════════════════════════════════════════════════

export interface CostoDiarioResult {
  empresaKey: EmpresaKey;
  dias: number;
  durationMs: number;
}

/**
 * Sincroniza el costo/venta/utilidad diario del MES EN CURSO desde el reporte
 * "Total de ventas" (tipo=03) → switch_costo_diario. Único endpoint con costo
 * completo (incluye B2B). Forward-only: solo el período en curso. El cron diario
 * re-corre y refresca todo el mes (los días que aún no ocurrieron se actualizan
 * al pasar). UPSERT por (empresa_key, fecha).
 */
export async function syncCostoDiario(
  empresaKey: EmpresaKey,
): Promise<CostoDiarioResult> {
  const startedAt = Date.now();
  const client = createSwitchClient(empresaKey);
  const data = await client.getReporteMesActual();
  const totales = data.totales ?? {};

  const nowIso = new Date().toISOString();
  const rows: Array<{
    empresa_key: string;
    fecha: string;
    venta_total: number;
    costo_total: number;
    utilidad_total: number;
    synced_at: string;
    updated_at: string;
  }> = [];

  for (const v of Object.values(totales) as SwitchTotalVentasDia[]) {
    const fecha = parseFechaDMY(v.fecha);
    if (!fecha) continue;
    rows.push({
      empresa_key: empresaKey,
      fecha,
      venta_total: parseAmount(v.total) ?? 0,
      costo_total: parseAmount(v.costo) ?? 0,
      utilidad_total: parseAmount(v.utilidad) ?? 0,
      synced_at: nowIso,
      updated_at: nowIso,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseServer
      .from("switch_costo_diario")
      .upsert(rows, { onConflict: "empresa_key,fecha", ignoreDuplicates: false });
    if (error) throw new Error(`UPSERT costo_diario falló: ${error.message}`);
  }

  return { empresaKey, dias: rows.length, durationMs: Date.now() - startedAt };
}
