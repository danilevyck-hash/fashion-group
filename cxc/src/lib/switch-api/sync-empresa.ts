/**
 * Sync multi-empresa Switch → Supabase.
 *
 *   syncEmpresaFacturas(empresaKey, opts)      → switch_facturas
 *   syncEmpresaEstadoCuenta(empresaKey, opts)  → switch_estadocuenta
 *
 * Multifashion (american_classic) SÍ usa estas funciones para facturas desde el
 * 26-jul-2026: su tabla legacy multifashion_tickets quedó CONGELADA (nadie la
 * leía; ver CLAUDE.md) y switch_facturas es su única fuente viva. NO entra en
 * syncEmpresaEstadoCuenta (cxc:false, retail sin cuenta corriente), pero sí en
 * CxP (cxp:true) — ver EMPRESA_SYNC_CAPABILITIES en empresas.ts.
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
import {
  escribirDirectorioDeClientes,
  traerListaDeClientes,
} from "./clientes-directorio";
import { clearStaleRunning } from "./sync-log";
import { particionarFilas, campoSkip } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { enParalelo } from "./en-paralelo";

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

/**
 * Cuántos `/apiestadocuenta` (uno por cliente) se piden a la vez.
 *
 * 🩸 POR QUÉ EXISTE (13-ago-2026). La cartera es el segundo sync que hace
 * esperar a Daniel mirando: **109 s de mediana** sobre 145 corridas de 7 días,
 * y la forma es la misma que ya costó cara dos veces (Boston 4.912 llamadas /
 * 54 min, Tommy 478 llamadas = 72% de su cron): **una llamada HTTP por cliente,
 * en serie**. Las 6 empresas del grupo tienen 136-140 clientes cada una.
 *
 * **No hay forma masiva de pedirlo por la API** — el reporte web del panel
 * (`estadocuenta-web.ts`) sí la tiene, pero está reservado a Boston por una
 * razón que no aplica acá: abre una SEGUNDA sesión (la del panel web) que
 * expulsa a quien esté usando Switch, y para 136 clientes no compra nada frente
 * a la concurrencia. Así que lo que se acorta es el tiempo de pared.
 *
 * **LA CURVA, con clientes DISJUNTOS** (`scripts/_probe-sync-lento.ts`, vistana,
 * 20 clientes por nivel, ms/cliente efectivo, **0 errores en todos**):
 *
 *     serial ×1  442 ms   —
 *     ×2         216 ms   2,1×
 *     ×4         117 ms   3,8×
 *     ×6          81 ms   5,4×   ← acá
 *     ×8          66 ms   6,7×
 *     ×12         53 ms   8,4×
 *
 * Se elige 6 quedándose por debajo del borde, mismo criterio conservador que
 * `STOCK_CONCURRENCIA`. Con 139 clientes eso son ~12 s contra los ~63 s del
 * barrido serial medido el mismo día.
 *
 * ⚠️ Requiere el de-dup de login de `client.ts` (`loginEnVuelo`): Switch admite
 * UN solo token válido por USUARIO (PDF del API, p. 6; «una sesión por empresa»
 * en la práctica, porque cada empresa entra con un único usuario de API) y N
 * llamadas concurrentes que encuentren el token
 * vencido dispararían N `/autenticacion` matándose el token entre sí (0006).
 */
const ESTADOCUENTA_CONCURRENCIA = 6;

/**
 * Cuántos clientes se leen antes de volver a escribir.
 *
 * NO es la concurrencia: es el tamaño del bocado. Con un lote igual a la
 * concurrencia, cada vuelta espera al cliente MÁS LENTO del grupo antes de
 * pedir el siguiente, y esa espera se paga 137/6 = 23 veces. Con un lote más
 * grande la pileta de `enParalelo` sigue llena y el rezagado se absorbe.
 *
 * ⚠️ No se lee TODO de una: la memoria queda acotada y las escrituras siguen
 * siendo incrementales, igual que antes de paralelizar. `switch_estadocuenta`
 * es lo que Daniel mira para cobrar; no es el lugar para estrenar un
 * read-all-then-write.
 */
const ESTADOCUENTA_LOTE = ESTADOCUENTA_CONCURRENCIA * 4;

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

/**
 * Marca como 'error' los logs de esta empresa+tipo que quedaron atascados en
 * 'running' (un run previo que murió antes de llamar finalizeSyncLog).
 *
 * DELEGA en `clearStaleRunning` (sync-log.ts) — hasta el 27-jul-2026 esto era
 * una SEGUNDA implementación, con su propio `30 * 60 * 1000` escrito a mano y su
 * propia copia del mensaje. Dos copias del mismo candado es una que se puede
 * corregir sola: el día que el techo de la función cambie, la que no se toque
 * empieza a liberar candados de corridas vivas (o a no liberarlos nunca). Ahora
 * el corte y el texto salen de un solo lugar.
 */
export async function markStaleRunningLogs(
  empresaKey: EmpresaKey,
  syncType: "facturas" | "estadocuenta" | "costo",
): Promise<void> {
  await clearStaleRunning(empresaKey, syncType);
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
  | { ok: true; row: FacturaRow; warnings?: SkipDetail[] }
  | { ok: false; skip: SkipDetail };

/**
 * parseAmount para campos OPCIONALES (descuento/impuesto/saldo). Distingue:
 *   - ausente (null/undefined/""): 0 legítimo, sin warning.
 *   - presente pero NO parseable: 0 + warning en `warnings` (no skipea la fila,
 *     pero deja rastro en switch_sync_log.skip_details). 🟡-10: antes
 *     `parseAmount(x) ?? 0` convertía un valor corrupto en 0 sin registro.
 */
function parseOptionalAmount(
  raw: string | number | null | undefined,
  campo: string,
  facturaId: number | string | null,
  secuencial: string | null,
  warnings: SkipDetail[],
): number {
  if (raw == null || String(raw).trim() === "") return 0;
  const n = parseAmount(raw);
  if (n === null) {
    warnings.push({ facturaId, secuencial, campo: `${campo}_malformado_default_0`, valorCrudo: raw });
    return 0;
  }
  return n;
}

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

  const warnings: SkipDetail[] = [];
  return {
    ok: true,
    warnings,
    row: {
      empresa_key: empresaKey,
      switch_factura_id: Number(f.id),
      secuencial: f.secuencial,
      tipo_comprobante: f.tipoComprobante,
      fecha: fechaIso,
      subtotal,
      descuento: parseOptionalAmount(f.descuento, "descuento", facturaId, secuencial, warnings),
      subtotal_descuento: subtotalDescuento,
      impuesto: parseOptionalAmount(f.impuesto, "impuesto", facturaId, secuencial, warnings),
      total,
      saldo: parseOptionalAmount(f.saldo, "saldo", facturaId, secuencial, warnings),
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
 *     El signo contable se aplica en query time por `tipo_comprobante`:
 *     `signoVenta()` en `src/lib/ventas/tipos-comprobante.ts` (TS) y el CASE
 *     de `switch_ventas_unificado_vw` (SQL). `switch_ventas_netas_vw` ya no
 *     existe: se borró el 26-jul-2026 (`20260726210100`).
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

  const warnings: SkipDetail[] = [];
  return {
    ok: true,
    warnings,
    row: {
      empresa_key: empresaKey,
      switch_factura_id: Number(n.id),
      secuencial: n.secuencial,
      tipo_comprobante: tipo,
      fecha: fechaIso,
      subtotal: Math.abs(subtotal),
      descuento: Math.abs(parseOptionalAmount(n.descuento, "descuento", facturaId, secuencial, warnings)),
      subtotal_descuento: Math.abs(subtotalDescuento),
      impuesto: Math.abs(parseOptionalAmount(n.impuesto, "impuesto", facturaId, secuencial, warnings)),
      total: Math.abs(total),
      saldo: Math.abs(parseOptionalAmount(n.saldo, "saldo", facturaId, secuencial, warnings)),
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
  // Auto-sana logs huérfanos ANTES del insert: con el índice único de 'running'
  // (DDL 20260723150000) una fila atascada bloquearía este insert para siempre.
  await markStaleRunningLogs(empresaKey, "facturas");
  const logId = await createSyncLog(empresaKey, "facturas", opts);

  const counters = { inserted: 0, updated: 0, skipped: 0 };
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(empresaKey);
    const buffer: FacturaRow[] = [];

    // Guard de montos imposibles. `switch_facturas` es la peor tabla donde puede
    // entrar una cifra corrupta: es la base de las ventas, del margen, de las
    // comisiones y de la proyección, y contamina 6 vistas materializadas. El
    // umbral se calibra UNA vez por corrida contra el histórico de esta empresa.
    const umbralFactura = await calibrarUmbral("factura", empresaKey);
    const rechazadasFactura: Array<ReturnType<typeof particionarFilas<FacturaRow>>["rechazadas"][number]> = [];

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
          // 🟡-10: campos opcionales malformados → la fila se guarda (con 0) pero
          // el anómalo queda visible en skip_details. No incrementa `skipped`.
          if (res.warnings && res.warnings.length > 0) {
            for (const w of res.warnings) {
              skipDetails.push(w);
              console.warn(
                `[sync ${empresaKey} ${label}] CAMPO MALFORMADO id=${w.facturaId} campo=${w.campo} valorCrudo=${JSON.stringify(w.valorCrudo)}`,
              );
            }
          }
          // Guard de montos imposibles: se mira la fila ENTERA (subtotal,
          // descuento, impuesto, total, saldo). Una factura imposible NO se
          // escribe —el upsert conserva así el último valor bueno— y NO frena a
          // las demás del lote.
          const { buenas, rechazadas } = particionarFilas(
            "factura",
            [res.row],
            umbralFactura,
            (f) => `${f.tipo_comprobante} ${f.secuencial}`,
          );
          if (rechazadas.length > 0) {
            counters.skipped++;
            rechazadasFactura.push(...rechazadas);
            skipDetails.push(...detallesDeRechazo("factura", rechazadas, umbralFactura));
            console.error(
              `[sync ${empresaKey} ${label}] MONTO IMPOSIBLE sec=${res.row.secuencial} (umbral ${umbralFactura})`,
              rechazadas[0].columnas,
            );
            continue;
          }
          buffer.push(...buenas);
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

    // El aviso va DESPUÉS de escribir (las facturas buenas ya están guardadas) y
    // nunca puede tumbar la corrida: si Telegram falla, el sync sigue success.
    if (rechazadasFactura.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "factura",
          empresaKey,
          syncType: "facturas",
          rechazadas: rechazadasFactura,
          umbral: umbralFactura,
          logId,
        });
      } catch (e) {
        console.error(`[sync ${empresaKey} facturas] no pude avisar el monto imposible: ${String(e)}`);
      }
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
  await markStaleRunningLogs(empresaKey, "estadocuenta");
  const logId = await createSyncLog(empresaKey, "estadocuenta", opts);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipDetails: SkipDetail[] = [];

  try {
    const client = createSwitchClient(empresaKey);

    // Guard de montos imposibles: un umbral por corrida, calibrado contra el
    // histórico de cartera de ESTA empresa.
    const umbralCxc = await calibrarUmbral("cxc", empresaKey);
    const rechazadasCxc: Array<ReturnType<typeof particionarFilas<EstadoCuentaRow>>["rechazadas"][number]> = [];

    // 1) Traer todos los clientes de la empresa y escribir el directorio.
    //
    // El camino vive en `clientes-directorio.ts`: un solo escritor de
    // `switch_clientes`, compartido con el cron semanal de Boston (que no puede
    // usar este sync porque su estado de cuenta por API no cabe en la función).
    // Ahí están la trampa de la paginación de `/apicliente/lista` y la guarda de
    // «lista completa» antes de marcar ausentes.
    const lista = await traerListaDeClientes(client);
    const clientes = lista.clientes;
    console.error(`[sync ${empresaKey} cxc] ${lista.cobertura} clientes a consultar`);

    // Warning explícito si el sync no cubrió todos los clientes que el API dice
    // que existen — se persiste también en switch_sync_log vía skipDetails para
    // que sea visible (no silencioso).
    if (!lista.completa) {
      const faltantes = lista.totalReportado - clientes.length;
      console.warn(`[sync ${empresaKey} cxc] WARNING: faltaron ${faltantes} clientes del API (paginación incompleta)`);
      skipDetails.push({
        facturaId: null,
        secuencial: null,
        campo: "listClientes_paginacion_incompleta",
        valorCrudo: { total_reportado: lista.totalReportado, traidos: clientes.length, faltantes },
      });
    }

    // 1b) Persistir el directorio completo en switch_clientes (PUENTE id→codigo
    //     para las vistas de clientes). Se hace acá porque ya tenemos la lista
    //     completa en memoria; incluye clientes de contado ausentes de
    //     switch_estadocuenta. Falla del directorio NO aborta el sync de CXC.
    try {
      const dir = await escribirDirectorioDeClientes(empresaKey, lista, runStamp);
      console.error(`[sync ${empresaKey} cxc] switch_clientes: ${dir.escritos} clientes upserted (puente id→codigo)`);
    } catch (err) {
      console.error(`[sync ${empresaKey} cxc] WARNING persistClientesDirectorio: ${err instanceof Error ? err.message : String(err)}`);
      skipDetails.push({ facturaId: null, secuencial: null, campo: "persistClientesDirectorio", valorCrudo: err instanceof Error ? err.message : String(err) });
    }

    // 2) Estado de cuenta por cliente → buffer → flush batches.
    //
    // failedClienteIds: clientes cuyo getEstadoCuenta falló (red/timeout/429) en
    // este run. NO deben entrar al reconcile que pone saldo=0 — no los pudimos
    // re-consultar, así que su saldo viejo es la mejor verdad disponible, NO 0.
    let buffer: EstadoCuentaRow[] = [];
    let procesados = 0;
    const failedClienteIds: number[] = [];
    // Las LECTURAS van de a ESTADOCUENTA_CONCURRENCIA; el PROCESADO y las
    // escrituras siguen en serie y en el orden original de `clientes`. Un
    // orden que cambia entre corridas vuelve el sync irreproducible al depurar,
    // y el buffer de UPSERT depende de acumular en un orden estable.
    //
    // 🔴 El error de UN cliente NO puede abortar la tanda: `enParalelo` propaga
    // el primer rechazo, así que el fallo se atrapa DENTRO y viaja como dato.
    // Los demás clientes de la tanda se procesan igual, exactamente como cuando
    // esto era un `try/catch` dentro del `for` serial.
    type LecturaEc =
      | { tipo: "ok"; cliente: SwitchCliente; ec: Awaited<ReturnType<typeof client.getEstadoCuenta>> }
      | { tipo: "error"; cliente: SwitchCliente; error: unknown }
      | { tipo: "sin-id"; cliente: SwitchCliente };

    for (let i = 0; i < clientes.length; i += ESTADOCUENTA_LOTE) {
      const tanda = clientes.slice(i, i + ESTADOCUENTA_LOTE);
      const lecturas = await enParalelo<SwitchCliente, LecturaEc>(
        tanda,
        ESTADOCUENTA_CONCURRENCIA,
        async (cliente) => {
          if (typeof cliente.id !== "number") return { tipo: "sin-id", cliente };
          try {
            return { tipo: "ok", cliente, ec: await client.getEstadoCuenta(cliente.id) };
          } catch (error) {
            return { tipo: "error", cliente, error };
          }
        },
      );

      for (const lectura of lecturas) {
        const cliente = lectura.cliente;
        if (lectura.tipo === "sin-id") {
          // 🟡-11: no skip silencioso — un cliente sin id numérico se omite pero
          // queda registrado en switch_sync_log.skip_details.
          skipped++;
          skipDetails.push({ facturaId: null, secuencial: cliente.codigo ?? null, campo: "cliente_id_no_numerico", valorCrudo: cliente.id });
          console.error(`[sync ${empresaKey} cxc] cliente sin id numérico omitido: codigo=${cliente.codigo ?? "?"} id=${JSON.stringify(cliente.id)}`);
          continue;
        }
        if (lectura.tipo === "error") {
          // Un cliente que falla no aborta todo el run; se loguea como skip y se
          // excluye del reconcile (abajo) para no corromper su saldo a 0.
          const err = lectura.error;
          skipped++;
          failedClienteIds.push(cliente.id as number);
          skipDetails.push({ facturaId: cliente.id, secuencial: null, campo: "getEstadoCuenta", valorCrudo: err instanceof Error ? err.message : String(err) });
          console.error(`[sync ${empresaKey} cxc] cliente ${cliente.id} falló: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        const ec = lectura.ec;
        const elements = ec?.estadocuenta?.elements ?? [];
        for (const el of elements) {
          const res = mapEstadoCuentaElement(empresaKey, cliente, el);
          if (!res.ok) {
            skipped++;
            skipDetails.push(res.skip);
            continue;
          }
          // Guard de montos imposibles. Un saldo corrupto acá infla la cartera y
          // dispara alertas de cobranza falsas. Se rechaza el documento entero
          // (upsert: el último valor bueno sobrevive); los demás documentos del
          // mismo cliente se guardan igual.
          const p = particionarFilas(
            "cxc",
            [res.row],
            umbralCxc,
            (f) => `${f.secuencial ?? f.ccte_id} · ${f.cliente_nombre ?? ""}`.trim(),
          );
          if (p.rechazadas.length > 0) {
            skipped++;
            rechazadasCxc.push(...p.rechazadas);
            skipDetails.push(...detallesDeRechazo("cxc", p.rechazadas, umbralCxc));
            console.error(
              `[sync ${empresaKey} cxc] MONTO IMPOSIBLE ccte=${res.row.ccte_id} (umbral ${umbralCxc})`,
              p.rechazadas[0].columnas,
            );
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
    }
    if (buffer.length > 0) {
      const r = await persistEstadoCuentaBatch(empresaKey, buffer, runStamp);
      inserted += r.inserted;
      updated += r.updated;
      buffer = [];
    }

    // Aviso DESPUÉS de escribir; nunca tumba la corrida.
    if (rechazadasCxc.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "cxc",
          empresaKey,
          syncType: "estadocuenta",
          rechazadas: rechazadasCxc,
          umbral: umbralCxc,
          logId,
        });
      } catch (e) {
        console.error(`[sync ${empresaKey} cxc] no pude avisar el monto imposible: ${String(e)}`);
      }
    }

    // 3) Reconciliar: documentos no vistos en este run (pagados/cerrados) que
    //    aún tengan saldo > 0 → poner saldo 0. synced_at < runStamp = no tocado.
    //
    //    PERO excluir los clientes que fallaron este run (failedClienteIds): no
    //    los pudimos re-consultar, así que sus documentos tienen synced_at viejo
    //    sin que eso signifique "cerrado". Zerearlos corrompería su CXC a $0 por
    //    una falla transitoria de red. Un cliente procesado OK con 0 elements SÍ
    //    se reconcilia (sus docs realmente se cerraron).
    //
    //    ⚠️ Y EXCLUIR TAMBIÉN los documentos que el guard de montos rechazó. Sin
    //    esto el guard se volvería DESTRUCTIVO: como no se reescriben, su
    //    synced_at queda viejo y el reconcile los leería como "cerrados" y les
    //    pondría saldo 0 — que es exactamente el valor bueno que el guard existe
    //    para conservar. Switch sigue mandando el documento; lo que está mal es
    //    su monto, no que el documento haya dejado de existir.
    let reconcileQuery = supabaseServer
      .from("switch_estadocuenta")
      .update({ saldo: 0, updated_at: new Date().toISOString() })
      .eq("empresa_key", empresaKey)
      .lt("synced_at", runStamp)
      .gt("saldo", 0);
    if (rechazadasCxc.length > 0) {
      const cctesRechazados = [...new Set(rechazadasCxc.map((r) => r.fila.ccte_id))];
      reconcileQuery = reconcileQuery.not("ccte_id", "in", `(${cctesRechazados.join(",")})`);
      console.error(
        `[sync ${empresaKey} cxc] reconcile excluye ${cctesRechazados.length} documento(s) con monto imposible (su saldo bueno se conserva)`,
      );
    }
    if (failedClienteIds.length > 0) {
      const uniqFailed = [...new Set(failedClienteIds)];
      reconcileQuery = reconcileQuery.not(
        "cliente_switch_id",
        "in",
        `(${uniqFailed.join(",")})`,
      );
      console.error(
        `[sync ${empresaKey} cxc] reconcile excluye ${uniqFailed.length} clientes que fallaron este run`,
      );
    }
    const { error: recErr } = await reconcileQuery;
    if (recErr) {
      // 🟡-13: un reconcile fallido deja documentos cerrados con saldo stale →
      // CXC inflado. No marcar 'success' en silencio: tiramos para que el run
      // quede como 'error' en switch_sync_log (vía el catch). Los upserts ya
      // están commiteados; el próximo run reconcilia (idempotente).
      throw new Error(`reconcile falló: ${recErr.message}`);
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
  logId: string | null;
}

/**
 * Sincroniza el costo/venta/utilidad diario del MES EN CURSO desde el reporte
 * "Total de ventas" (tipo=03) → switch_costo_diario. Único endpoint con costo
 * completo (incluye B2B). Forward-only: solo el período en curso. El cron diario
 * re-corre y refresca todo el mes (los días que aún no ocurrieron se actualizan
 * al pasar). UPSERT por (empresa_key, fecha).
 *
 * 🟡-8: loguea a switch_sync_log (sync_type='costo') igual que facturas/cxc —
 * antes no dejaba rastro persistente y los errores solo vivían en el JSON del cron.
 */
export async function syncCostoDiario(
  empresaKey: EmpresaKey,
  triggeredBy: "cron" | "manual" | "backfill" = "cron",
): Promise<CostoDiarioResult> {
  const startedAt = Date.now();

  await markStaleRunningLogs(empresaKey, "costo");
  // Logging degradable: si el INSERT falla (ej. migración del CHECK 'costo' aún
  // no aplicada), NO abortamos el sync — el costo se sincroniza igual y solo se
  // pierde la observabilidad de esa corrida.
  let logId: string | null = null;
  {
    const { data: logRow, error: logErr } = await supabaseServer
      .from("switch_sync_log")
      .insert({
        empresa_key: empresaKey,
        sync_type: "costo",
        status: "running",
        triggered_by: triggeredBy,
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
      })
      .select("id")
      .single();
    if (logErr || !logRow) {
      console.error(`[sync ${empresaKey} costo] no pude crear switch_sync_log (¿migración 'costo' pendiente?): ${logErr?.message ?? "vacío"}`);
    } else {
      logId = (logRow as { id: string }).id;
    }
  }

  const skipDetails: SkipDetail[] = [];
  let skipped = 0;

  try {
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

    // 1ª pasada — parsear. El guard necesita saber QUÉ días trae el reporte
    // antes de calcular el umbral (esos días se excluyen de la historia: el
    // umbral se mide contra el pasado, no contra el dato que se está validando).
    const parsed: Array<{ fecha: string; venta: number; costo: number; utilidad: number }> = [];
    for (const v of Object.values(totales) as SwitchTotalVentasDia[]) {
      const fecha = parseFechaDMY(v.fecha);
      if (!fecha) {
        // 🟡-8: día con fecha inválida/vacía no se descarta en silencio.
        skipped++;
        skipDetails.push({ facturaId: null, secuencial: null, campo: "costo_fecha_invalida", valorCrudo: v.fecha });
        continue;
      }
      parsed.push({
        fecha,
        venta: parseAmount(v.total) ?? 0,
        costo: parseAmount(v.costo) ?? 0,
        utilidad: parseAmount(v.utilidad) ?? 0,
      });
    }

    const umbral = await calibrarUmbral("costo_diario", empresaKey);

    // 2ª pasada — guard. Un día imposible NO se escribe (así el último valor
    // bueno de ese día sobrevive) y NO frena a los demás días del mes.
    //
    // ⚠️ Se miran las TRES columnas de plata (venta, costo, utilidad), no solo
    // el costo: el guard viejo validaba el costo y dejaba pasar la venta del
    // mismo día sin mirar, y con la venta corrupta el margen queda igual de
    // reventado. La simetría vive en GUARDS.costo_diario.columnas.
    const candidatas = parsed.map((p) => ({
      empresa_key: empresaKey,
      fecha: p.fecha,
      venta_total: p.venta,
      costo_total: p.costo,
      utilidad_total: p.utilidad,
      synced_at: nowIso,
      updated_at: nowIso,
    }));
    const { buenas, rechazadas } = particionarFilas(
      "costo_diario",
      candidatas,
      umbral,
      (f) => f.fecha,
    );
    rows.push(...buenas);
    if (rechazadas.length > 0) {
      skipped += rechazadas.length;
      skipDetails.push(...detallesDeRechazo("costo_diario", rechazadas, umbral));
    }

    if (rows.length > 0) {
      const { error } = await supabaseServer
        .from("switch_costo_diario")
        .upsert(rows, { onConflict: "empresa_key,fecha", ignoreDuplicates: false });
      if (error) throw new Error(`UPSERT costo_diario falló: ${error.message}`);
    }

    // El aviso va DESPUÉS del upsert (los días buenos ya están guardados) y
    // nunca puede tumbar la corrida: si Telegram falla, el sync sigue success.
    if (rechazadas.length > 0) {
      console.error(
        `[sync ${empresaKey} costo] ${rechazadas.length} día(s) con monto IMPOSIBLE (umbral ${umbral}) — no se guardaron`,
        rechazadas,
      );
      try {
        await avisarMontosImposibles({
          familia: "costo_diario",
          empresaKey,
          syncType: "costo",
          rechazadas,
          umbral,
          logId,
        });
      } catch (e) {
        console.error(`[sync ${empresaKey} costo] no pude avisar el monto imposible: ${String(e)}`);
      }
    }

    if (logId) {
      await finalizeSyncLog(logId, {
        status: "success",
        finished_at: new Date().toISOString(),
        records_inserted: 0,
        records_updated: rows.length, // upsert refresca el mes; no separa ins/upd
        records_skipped: skipped,
        skip_details: skipDetails,
      });
    }

    return { empresaKey, dias: rows.length, durationMs: Date.now() - startedAt, logId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync ${empresaKey} costo] ERROR: ${message}`);
    if (logId) {
      await finalizeSyncLog(logId, {
        status: "error",
        finished_at: new Date().toISOString(),
        records_inserted: 0,
        records_updated: 0,
        records_skipped: skipped,
        error_message: message.slice(0, 2000),
        skip_details: skipDetails,
      });
    }
    throw err;
  }
}
