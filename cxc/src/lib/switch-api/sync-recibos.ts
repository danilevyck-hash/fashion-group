/**
 * Sync de RECIBOS (cobros) → switch_recibos.
 *
 * Fuente: /apireporte/recibos (API JSON, mismo token que facturas). Un row por
 * recibo (fechaCreacion, cliente, vendedor que registró, total). El endpoint NO
 * da id/secuencial → estrategia delete+insert por (empresa, mes) en cada corrida
 * (re-sincronizar un mes reemplaza limpio TODO el mes).
 *
 * VENTANA RODANTE (jul-2026, audit sync): el cron re-sincroniza SIEMPRE los
 * últimos 3 meses (mesesCronRecibos). A diferencia de facturas/utilidad (upsert
 * incremental), los recibos SÍ cambian dentro de la ventana: Switch permite
 * anular, editar o retro-cargar recibos con fecha pasada, y el delete+insert
 * por mes es la única forma de corregirlos (detectados 4 faltantes + 1 anulado
 * en may-jun 2026 que la ventana de 1 mes nunca corrigió). Duración medida:
 * mediana ~5.1s por empresa-mes → 3 meses × 6 empresas ≈ 90-120s, holgado bajo
 * maxDuration 300.
 *
 * RECIBOS CON TOTAL $0: son cobros por APLICACIÓN/CRUCE (el recibo aplica saldo
 * a favor / NC contra facturas, sin plata nueva) o recibos ANULADOS. Por
 * decisión de negocio (Daniel, 23-jul-2026) NO comisionan: se persisten tal
 * cual (total=0) y las RPC de comisiones (comision_b2b_v5 / comision_detalle)
 * los suman por total → aportan $0 a la base de cobro. NO filtrarlos ni
 * "corregirles" el total.
 *
 * Usos: último pago CXC (switch_ultimo_pago_cliente_v2) y comisión sobre cobro.
 * Tolerante a fallos: una empresa falla → las demás siguen.
 */

import type { EmpresaKey } from "@/lib/empresa-mapping";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { supabaseServer } from "../supabase-server";
import { createSwitchClient } from "./client";
import { clearStaleRunning, isRunningLockConflict } from "./sync-log";
import type { Mes } from "./sync-utilidad";

/** Recibos se sincronizan para las 5 B2B + Multifashion (american_classic). */
export const RECIBOS_EMPRESA_KEYS: EmpresaKey[] = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "american_classic",
];

/** Meses de la ventana rodante del cron de recibos (mes en curso + 2 anteriores). */
const RECIBOS_VENTANA_MESES = 3;

/**
 * Ventana del cron diario de RECIBOS: mes en curso + los 2 meses anteriores,
 * SIEMPRE (orden viejo → nuevo). Distinta de mesesCronDiario (facturas/utilidad:
 * mes en curso + anterior solo los días 1-5): los recibos se corrigen por
 * delete+insert por mes, así que re-sincronizar la ventana completa repara solo
 * anulaciones/ediciones/retro-cargas de hasta ~3 meses atrás. NO cambiar la
 * semántica de mesesCronDiario — facturas/utilidad la comparten.
 */
export function mesesCronRecibos(now: Date = new Date()): Mes[] {
  const meses: Mes[] = [];
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;
  for (let i = 0; i < RECIBOS_VENTANA_MESES; i++) {
    meses.unshift({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return meses;
}

export interface SyncRecibosResult {
  empresaKey: EmpresaKey;
  ok: boolean;
  meses: number;
  recibos: number;
  error?: string;
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function monthBounds(year: number, month: number): { inicio: string; finExcl: string } {
  const inicio = `${year}-${String(month).padStart(2, "0")}-01`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const finExcl = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { inicio, finExcl };
}

async function createLog(empresaKey: EmpresaKey, meses: Mes[], triggeredBy: string): Promise<string | null> {
  // Auto-sana logs huérfanos antes del insert: con el índice único de 'running'
  // (DDL 20260723150000) una fila atascada bloquearía este insert para siempre.
  await clearStaleRunning(empresaKey, "recibos");
  const s = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f = s[0];
  const l = s[s.length - 1];
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .insert({
      empresa_key: empresaKey,
      sync_type: "recibos",
      status: "running",
      range_from: `${f.year}-${String(f.month).padStart(2, "0")}-01`,
      range_to: `${l.year}-${String(l.month).padStart(2, "0")}-01`,
      triggered_by: triggeredBy,
      records_inserted: 0,
      records_updated: 0,
      records_skipped: 0,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Conflicto del lock = otra corrida fresca de recibos de esta empresa en
    // curso → mutex: se lanza y syncEmpresaRecibos devuelve ok:false limpio.
    if (error && isRunningLockConflict(error)) {
      throw new Error(
        `Ya hay una corrida de recibos en curso para ${empresaKey} (lock switch_sync_log_running_lock)`,
      );
    }
    console.error(`[sync-recibos ${empresaKey}] no pude crear log: ${error?.message}`);
    return null;
  }
  return (data as { id: string }).id;
}

async function finishLog(logId: string | null, status: "success" | "error", n: number, err?: string): Promise<void> {
  if (!logId) return;
  await supabaseServer
    .from("switch_sync_log")
    .update({ status, finished_at: new Date().toISOString(), records_inserted: n, error_message: err ?? null })
    .eq("id", logId);
}

/** cliente_switch_id → vendedor dueño de cartera (maestro /apicliente/lista). */
async function buildCarteraMap(empresaKey: EmpresaKey): Promise<Map<number, string>> {
  const client = createSwitchClient(empresaKey);
  const map = new Map<number, string>();
  let pagina = 1;
  for (;;) {
    const data = await client.listClientes({ porPagina: 500, paginaActual: pagina });
    const clientes = data.clientes ?? [];
    for (const c of clientes) {
      if (c.vendedor && String(c.vendedor).trim()) map.set(c.id, String(c.vendedor).trim());
    }
    const total = data.paginacion?.total ?? clientes.length;
    if (map.size >= total || clientes.length === 0) break;
    pagina += 1;
  }
  return map;
}

/** cliente_switch_id → facturas [{fecha, impuesto}] para la heurística de retención. */
type ImpuestoMap = Map<number, { fecha: string; imp: number }[]>;

/** Carga impuesto de facturas (switch_facturas) del rango para detectar
 *  retenciones. `from` inclusivo y `toExcl` EXCLUSIVO, ambos YYYY-MM-DD en día
 *  Panamá. Gotcha (fix audit jul-2026): switch_facturas.fecha es timestamptz
 *  UTC — filtrarla con date pelado corría el rango 5h (los docs nocturnos de
 *  Panamá caen al día UTC siguiente) y PERDÍA los bordes: una factura del
 *  último día del rango emitida en la noche quedaba fuera y su retención no se
 *  clasificaba. El rango se ancla a medianoche Panamá (offset -05:00 explícito)
 *  y la fecha del doc se normaliza a día Panamá (fechaPanamaDe), que es el
 *  mismo calendario que la fecha de los recibos del API. */
async function loadImpuestoMap(empresaKey: EmpresaKey, from: string, toExcl: string): Promise<ImpuestoMap> {
  const map: ImpuestoMap = new Map();
  const { data, error } = await supabaseServer
    .from("switch_facturas")
    .select("cliente_switch_id,fecha,impuesto")
    .eq("empresa_key", empresaKey)
    .eq("tipo_comprobante", "Factura")
    .gte("fecha", `${from}T00:00:00-05:00`)
    .lt("fecha", `${toExcl}T00:00:00-05:00`)
    .range(0, 99999);
  if (error) {
    console.error(`[sync-recibos ${empresaKey}] loadImpuestoMap: ${error.message}`);
    return map;
  }
  for (const f of (data ?? []) as { cliente_switch_id: number | null; fecha: string; impuesto: unknown }[]) {
    const k = f.cliente_switch_id;
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push({ fecha: fechaPanamaDe(String(f.fecha)), imp: num(f.impuesto) });
  }
  return map;
}

const RET_WINDOW_MS = 35 * 864e5;
/** Retención = total ≈ impuesto/2 de una factura del mismo cliente, dentro de ±35d.
 *  Ventana SIMÉTRICA (|rf - ff|): Switch estampa la retención el mismo día o hasta
 *  un día ANTES que su factura, así que exigir factura ≤ recibo perdía esos casos
 *  (ej. FW mayo: recibos 111.02/55.44/7.28 cuya factura quedó 1 día después). */
function esRetencion(cliId: number | null, fecha: string | null, total: number, map: ImpuestoMap): boolean {
  if (cliId == null || !fecha) return false;
  const list = map.get(cliId);
  if (!list) return false;
  const rf = Date.parse(fecha);
  return list.some((f) => {
    const ff = Date.parse(f.fecha);
    return Math.abs(rf - ff) <= RET_WINDOW_MS && Math.abs(total - f.imp / 2) <= 0.01;
  });
}

/** Trae todos los recibos de un mes (paginación de 50 server-side). */
async function fetchRecibosMes(empresaKey: EmpresaKey, year: number, month: number, impuestoMap: ImpuestoMap, carteraMap: Map<number, string>) {
  const client = createSwitchClient(empresaKey);
  const { inicio } = monthBounds(year, month);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hasta = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const rows: ReturnType<typeof mapRow>[] = [];
  let pagina = 1;
  for (;;) {
    const data = await client.listRecibos({ desde: inicio, hasta, porPagina: 50, paginaActual: pagina });
    const recibos = data.recibos ?? [];
    for (const r of recibos) rows.push(mapRow(empresaKey, r, impuestoMap, carteraMap));
    const total = data.paginacion?.total ?? recibos.length;
    if (rows.length >= total || recibos.length === 0) break;
    pagina += 1;
  }
  return rows;
}

function mapRow(empresaKey: EmpresaKey, r: Record<string, unknown>, impuestoMap: ImpuestoMap, carteraMap: Map<number, string>) {
  const fc = String(r.fechaCreacion ?? "");
  const fecha = fc.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null; // "YYYY-MM-DD HH:mm:ss" → fecha
  const cliId = typeof r.clienteId === "number" ? r.clienteId : null;
  const total = num(r.total);
  const vendedorRegistro = (r.vendedor as string) ?? null;
  return {
    empresa_key: empresaKey,
    fecha,
    fecha_creacion: fc ? fc.replace(" ", "T") : null,
    cliente_switch_id: cliId,
    cliente_codigo: (r.clienteCodigo as string) ?? null,
    cliente_nombre: (r.clienteNombre as string) ?? null,
    vendedor_registro: vendedorRegistro,
    // atribución por cartera (dueño del cliente); fallback al vendedor del recibo
    vendedor_cartera: (cliId != null ? carteraMap.get(cliId) : undefined) ?? vendedorRegistro,
    total,
    es_retencion: esRetencion(cliId, fecha, total, impuestoMap),
    synced_at: new Date().toISOString(),
  };
}

export async function syncEmpresaRecibos(
  empresaKey: EmpresaKey,
  meses: Mes[],
  triggeredBy = "manual",
): Promise<SyncRecibosResult> {
  // createLog va DENTRO del try: con el lock de 'running' puede lanzar si ya
  // hay una corrida en curso → esta empresa devuelve ok:false limpio y
  // syncAllRecibos sigue con las demás.
  let logId: string | null = null;
  try {
    logId = await createLog(empresaKey, meses, triggeredBy);
    // Mapa de impuestos para clasificar retenciones: cubre los meses + 35 días antes
    // (una factura puede preceder a su recibo de retención).
    const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    const f0 = sorted[0];
    const lN = sorted[sorted.length - 1];
    const winFrom = new Date(Date.UTC(f0.year, f0.month - 1, 1) - RET_WINDOW_MS).toISOString().slice(0, 10);
    const winTo = monthBounds(lN.year, lN.month).finExcl;
    const impuestoMap = await loadImpuestoMap(empresaKey, winFrom, winTo);
    const carteraMap = await buildCarteraMap(empresaKey);

    let totalRecibos = 0;
    for (const { year, month } of meses) {
      const rows = await fetchRecibosMes(empresaKey, year, month, impuestoMap, carteraMap);
      const { inicio, finExcl } = monthBounds(year, month);
      // delete+insert por mes (el endpoint no da id de recibo → reemplazo limpio)
      const { error: delErr } = await supabaseServer
        .from("switch_recibos")
        .delete()
        .eq("empresa_key", empresaKey)
        .gte("fecha", inicio)
        .lt("fecha", finExcl);
      if (delErr) throw new Error(`delete switch_recibos: ${delErr.message}`);
      if (rows.length > 0) {
        const { error: insErr } = await supabaseServer.from("switch_recibos").insert(rows);
        if (insErr) throw new Error(`insert switch_recibos: ${insErr.message}`);
      }
      totalRecibos += rows.length;
    }
    await finishLog(logId, "success", totalRecibos);
    return { empresaKey, ok: true, meses: meses.length, recibos: totalRecibos };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLog(logId, "error", 0, msg);
    return { empresaKey, ok: false, meses: meses.length, recibos: 0, error: msg };
  }
}

/** Sync de recibos de todas las empresas (serial; tolerante a fallos). */
export async function syncAllRecibos(meses: Mes[], triggeredBy = "cron"): Promise<SyncRecibosResult[]> {
  const results: SyncRecibosResult[] = [];
  for (const empresaKey of RECIBOS_EMPRESA_KEYS) {
    results.push(await syncEmpresaRecibos(empresaKey, meses, triggeredBy));
  }
  return results;
}
