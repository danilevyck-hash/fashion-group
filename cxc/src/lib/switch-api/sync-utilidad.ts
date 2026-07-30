/**
 * Sync del reporte de UTILIDAD por documento (comisiones B2B) → switch_factura_utilidad.
 *
 * Fuente: reporte web de Switch /reportesventa/facturas (ver web-client.ts) —
 * única fuente de costo/utilidad por documento. NO existe en el API JSON.
 *
 * ATRIBUCIÓN POR CARTERA: cada documento se atribuye al vendedor DUEÑO del
 * cliente (maestro /apicliente/lista), NO al vendedor de la factura. Fallback:
 * vendedor de la factura si el cliente no tiene dueño asignado. (Validado al
 * centavo: FS/Reinaldo abr=65,051.50, FW/Reinaldo abr=217,793.00.)
 *
 * Tolerante a fallos: si una empresa falla, las demás siguen. Log en switch_sync_log.
 * Single-session: el login web EXPULSA al humano logueado → correr off-hours.
 */

import type { EmpresaKey } from "@/lib/empresa-mapping";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { supabaseServer } from "../supabase-server";
import { createSwitchClient } from "./client";
import { empresasConUtilidad } from "./empresas";
import { clearStaleRunning } from "./sync-log";
import { loginSwitchWeb, fetchUtilidadMes, type UtilidadRow } from "./web-client";
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";

/**
 * Empresas B2B con comisión sobre venta: las 6 B2B (excluye Multifashion, que es
 * retail sin comisión sobre venta, y Boston, que liquida fuera del sistema).
 *
 * DERIVADA de EMPRESA_SYNC_CAPABILITIES (`utilidad: true`), no escrita a mano.
 * El array literal anterior decía "excluye Multifashion/Boston/Joystep" y listaba
 * 5 empresas: joystep quedó fuera desde el origen del módulo aunque sí estuviera
 * en B2B_EMPRESA_KEYS (o sea, con pestaña de comisiones visible). Efecto medido
 * el 27-jul-2026: `switch_factura_utilidad` con CERO filas de joystep en toda su
 * historia y comisión de julio en $0,00 con 0 vendedores, mientras el sistema
 * mostraba ese $0 como si fuera un dato real.
 */
export const B2B_COMISION_KEYS: EmpresaKey[] = empresasConUtilidad();

export interface Mes {
  year: number;
  month: number;
}

export interface SyncUtilidadResult {
  empresaKey: EmpresaKey;
  ok: boolean;
  meses: number;
  documentos: number;
  vendedoresNuevos: number;
  error?: string;
}

// ─── Cartera: cliente → vendedor dueño (maestro API) ─────────────────────────

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

// ─── Resolución del id real de Switch (blindaje de llave, audit jul-2026) ─────
// Switch REINICIÓ numeraciones de secuenciales (40 duplicados cross-era en
// switch_facturas) → (empresa_key, secuencial) NO es identidad estable. El id
// real vive en switch_facturas.switch_factura_id; se resuelve por
// (secuencial, fecha Panamá) — la fecha separa las eras (verificado 23-jul-2026:
// 1,485/1,499 match exacto y las 14 restantes eran solo el desfase nocturno
// UTC↔Panamá, 0 ambiguos). Un doc sin match (factura aún no sincronizada por
// timing) queda con switch_id null — por eso la LLAVE del upsert es
// (empresa_key, secuencial, fecha), no el switch_id.

/** Tamaño de página / cota de páginas de la lectura de switch_facturas.
 *  PostgREST corta en `db-max-rows` = 1000 en este proyecto: pedir más en una
 *  sola llamada devuelve 1000 filas SIN error. Ver buildSwitchIdMap. */
const PAGINA_LECTURA_FACTURAS = 1000;
const MAX_PAGINAS_FACTURAS = 1000;

/** Borde del rango de meses anclado a medianoche PANAMÁ (offset -05:00 explícito).
 *  Un `date` pelado corre el rango 5h y pierde los documentos nocturnos. */
function rangoPanama(meses: Mes[]): { desde: string; hastaExcl: string } | null {
  if (meses.length === 0) return null;
  const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f = sorted[0];
  const l = sorted[sorted.length - 1];
  const finY = l.month === 12 ? l.year + 1 : l.year;
  const finM = l.month === 12 ? 1 : l.month + 1;
  return {
    desde: `${f.year}-${String(f.month).padStart(2, "0")}-01T00:00:00-05:00`,
    hastaExcl: `${finY}-${String(finM).padStart(2, "0")}-01T00:00:00-05:00`,
  };
}

/** Cuántas facturas tiene switch_facturas para (empresa, rango de meses).
 *  Solo lo usa el guard del "cero silencioso" — ver syncEmpresaUtilidad. */
async function contarFacturasEnRango(empresaKey: EmpresaKey, meses: Mes[]): Promise<number> {
  const r = rangoPanama(meses);
  if (!r) return 0;
  const { count, error } = await supabaseServer
    .from("switch_facturas")
    .select("*", { count: "exact", head: true })
    .eq("empresa_key", empresaKey)
    .gte("fecha", r.desde)
    .lt("fecha", r.hastaExcl);
  if (error) {
    // No se puede desmentir el cero → se deja pasar (el guard no debe inventar
    // un fallo por un problema de lectura suyo), pero queda el rastro.
    console.error(`[sync-utilidad ${empresaKey}] contarFacturasEnRango: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/** (secuencial|fechaPanama) → switch_factura_id de los meses a sincronizar.
 *  Ambigüedad (mismo secuencial+fecha con ids distintos) → se descarta (null). */
async function buildSwitchIdMap(empresaKey: EmpresaKey, meses: Mes[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rango = rangoPanama(meses);
  if (!rango) return map;
  const { desde, hastaExcl } = rango;
  // Rango timestamptz con offset Panamá explícito (gotcha: date pelado pierde
  // los docs nocturnos — ver loadImpuestoMap en sync-recibos).
  //
  // ⚠️ PAGINADO (26-jul-2026): antes era un solo `.range(0, 99999)`, el mismo
  // anti-patrón que se arregló en sync-recibos. PostgREST corta en `db-max-rows`
  // = 1000 y NO avisa, así que un rango grande devolvía 1.000 filas y las demás
  // facturas quedaban sin resolver su switch_factura_id. HOY no muerde —
  // utilidad corre solo para las 5 B2B (B2B_COMISION_KEYS) y ahí el máximo
  // medido es 162 facturas en la ventana del cron y 710 en un backfill de un año
  // entero (fashion_wear)— pero el modo backfill pide el año completo de una y
  // el margen se acorta solo con el tiempo. Ordena por `id` (orden estable: sin
  // él PostgREST puede repetir o saltear filas entre páginas) y verifica contra
  // un COUNT exacto.
  //
  // Se mantiene el contrato BEST-EFFORT del original: un problema de lectura se
  // reporta y el mapa se devuelve como esté. Acá un switch_id faltante es un
  // caso ya contemplado (la llave del upsert es (empresa_key, secuencial, fecha),
  // no el switch_id), así que abortar la corrida entera sería peor que seguir.
  // Lo que ya no puede pasar es que se trunque en silencio.
  const filas: { secuencial: string | null; fecha: string; switch_factura_id: number }[] = [];
  let esperadas: number | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS_FACTURAS; pagina += 1) {
    const desdeFila = pagina * PAGINA_LECTURA_FACTURAS;
    const { data, error, count } = await supabaseServer
      .from("switch_facturas")
      .select("secuencial,fecha,switch_factura_id", pagina === 0 ? { count: "exact" } : {})
      .eq("empresa_key", empresaKey)
      .gte("fecha", desde)
      .lt("fecha", hastaExcl)
      .order("id", { ascending: true })
      .range(desdeFila, desdeFila + PAGINA_LECTURA_FACTURAS - 1);
    if (error) {
      console.error(`[sync-utilidad ${empresaKey}] buildSwitchIdMap: ${error.message}`);
      break;
    }
    if (pagina === 0) esperadas = count ?? null;
    const lote = (data ?? []) as typeof filas;
    filas.push(...lote);
    if (lote.length < PAGINA_LECTURA_FACTURAS) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }
  if (esperadas != null && filas.length !== esperadas) {
    console.error(
      `[sync-utilidad ${empresaKey}] buildSwitchIdMap: lectura incompleta de switch_facturas (${filas.length} leídas vs ${esperadas} contadas) — habrá docs con switch_id null`,
    );
  }
  const ambiguos = new Set<string>();
  for (const r of filas) {
    if (!r.secuencial || typeof r.switch_factura_id !== "number") continue;
    const key = `${r.secuencial}|${fechaPanamaDe(r.fecha)}`;
    const prev = map.get(key);
    if (prev !== undefined && prev !== r.switch_factura_id) ambiguos.add(key);
    else map.set(key, r.switch_factura_id);
  }
  for (const key of ambiguos) map.delete(key);
  return map;
}

// ─── Mapeo fila reporte → fila cache (con atribución por cartera) ────────────

// pct_utilidad es numeric(8,4) → rango ±9999.9999. Docs basura (subtotal≈0 con
// costo) pueden dar pct absurdos (ej. −221792%). Se clampea: no afecta la regla
// (>20% para facturas; las NC no se filtran por utilidad) y capa el ruido.
const PCT_CAP = 9999.9999;
const clampPct = (p: number | null): number | null =>
  p == null ? null : Math.max(-PCT_CAP, Math.min(PCT_CAP, p));

function toCacheRow(
  empresaKey: EmpresaKey,
  r: UtilidadRow,
  cartera: Map<number, string>,
  switchIds: Map<string, number>,
) {
  const vendedorCartera =
    (r.clienteSwitchId != null ? cartera.get(r.clienteSwitchId) : undefined) ?? r.vendedor;
  return {
    empresa_key: empresaKey,
    secuencial: r.secuencial,
    fecha: r.fecha,
    // Id real de Switch (columna de DDL 20260723120000; el upsert la descarta
    // en modo legacy si la DDL aún no corrió). Null si no se pudo resolver.
    switch_id: r.fecha != null ? switchIds.get(`${r.secuencial}|${r.fecha}`) ?? null : null,
    tipo_comprobante: r.tipoComprobante,
    vendedor: vendedorCartera, // ← dueño de cartera (fallback: vendedor de factura)
    cliente: r.cliente,
    cliente_switch_id: r.clienteSwitchId ?? null, // id estable para utilidad_por_cliente
    subtotal_con_descuento: r.subtotalConDescuento,
    costo: r.costo,
    utilidad: r.utilidad,
    pct_utilidad: clampPct(r.pctUtilidad),
    synced_at: new Date().toISOString(),
  };
}

// ─── Maestro de vendedores: Switch /apivendedor/lista → tabla vendedores ──────
// Universo del tab Comisiones v2 (mostrar a todos aunque base=$0). Usa el API
// JSON (mismo token que listClientes), independiente del login web single-session.
// Devuelve los nombres sincronizados para sembrar sus tasas globales.
async function syncVendedores(empresaKey: EmpresaKey): Promise<string[]> {
  const client = createSwitchClient(empresaKey);
  const rows: { empresa_key: string; switch_id: number; nombre: string; codigo: string | null; activo: boolean; updated_at: string }[] = [];
  const now = new Date().toISOString();
  let pagina = 1;
  for (;;) {
    const data = await client.listVendedores({ porPagina: 500, paginaActual: pagina });
    const vendedores = data.vendedores ?? [];
    for (const v of vendedores) {
      const nombre = String(v.nombre ?? "").trim();
      if (!nombre) continue;
      rows.push({
        empresa_key: empresaKey,
        switch_id: v.id,
        nombre,
        codigo: v.codigo ?? null,
        activo: true,
        updated_at: now,
      });
    }
    const total = data.paginacion?.total ?? vendedores.length;
    if (rows.length >= total || vendedores.length === 0) break;
    pagina += 1;
  }
  if (rows.length > 0) {
    const { error } = await supabaseServer
      .from("vendedores")
      .upsert(rows, { onConflict: "empresa_key,nombre" });
    if (error) console.error(`[sync-utilidad ${empresaKey}] upsert vendedores falló: ${error.message}`);
  }
  return rows.map((r) => r.nombre);
}

// ─── Auto-seed de tasas GLOBALES: vendedores nuevos → 0.50% (excepto DEFAULT) ──
// Tabla global comision_vendedor_tasa (no por empresa). ignoreDuplicates: no pisa
// tasas ya configuradas (ej. Reinaldo 1%, o lo que edite Daniel en el modal).
async function seedTasasGlobal(vendedores: Set<string>): Promise<number> {
  const rows = [...vendedores]
    .filter((v) => v && v.toUpperCase() !== "DEFAULT")
    .map((v) => ({
      vendedor_nombre: v,
      tasa_venta: 0.005,
      tasa_cobro: 0,
    }));
  if (rows.length === 0) return 0;
  const { error } = await supabaseServer
    .from("comision_vendedor_tasa")
    .upsert(rows, { onConflict: "vendedor_nombre", ignoreDuplicates: true });
  if (error) console.error(`[sync-utilidad] seed tasas global falló: ${error.message}`);
  return rows.length;
}

// ─── Persistencia ────────────────────────────────────────────────────────────
// Llave preferida: (empresa_key, secuencial, fecha) — separa las ERAS de
// secuenciales reiniciados (DDL 20260723120000, índice único
// ux_sfu_empresa_secuencial_fecha + columna switch_id). TOLERANTE a que la DDL
// aún no haya corrido: si el upsert falla con 42P10 (índice único ausente) o
// PGRST204 (columna switch_id desconocida), cae a la llave legacy
// (empresa_key, secuencial) sin switch_id. El flag es por-proceso (serverless:
// se re-evalúa en cada invocación; cuando Daniel corra la DDL, el siguiente
// sync usa la llave nueva solo).

let llaveEraDisponible: boolean | null = null; // null = aún no probada en este proceso

const ES_ERROR_DDL_PENDIENTE = (code: string | undefined): boolean =>
  code === "42P10" || code === "PGRST204";

async function upsertCacheRows(rows: ReturnType<typeof toCacheRow>[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (llaveEraDisponible !== false) {
      const { error } = await supabaseServer
        .from("switch_factura_utilidad")
        .upsert(chunk, { onConflict: "empresa_key,secuencial,fecha" });
      if (!error) {
        llaveEraDisponible = true;
        continue;
      }
      if (!ES_ERROR_DDL_PENDIENTE(error.code)) {
        throw new Error(`upsert switch_factura_utilidad: ${error.message}`);
      }
      console.error(
        `[sync-utilidad] llave por era no disponible (DDL 20260723120000 pendiente): ${error.message} — fallback a llave legacy (empresa_key, secuencial)`,
      );
      llaveEraDisponible = false;
    }
    // Modo legacy: sin columna switch_id y con la llave vieja.
    const legacy = chunk.map(({ switch_id: _switchId, ...r }) => r);
    const { error } = await supabaseServer
      .from("switch_factura_utilidad")
      .upsert(legacy, { onConflict: "empresa_key,secuencial" });
    if (error) throw new Error(`upsert switch_factura_utilidad (legacy): ${error.message}`);
  }
}

// ─── Log (best-effort) ───────────────────────────────────────────────────────

async function createLog(empresaKey: EmpresaKey, meses: Mes[], triggeredBy: string): Promise<string | null> {
  // Auto-sana logs huérfanos antes del insert: con el índice único de 'running'
  // (DDL 20260723150000) una fila atascada bloquearía este insert para siempre.
  // Un conflicto con corrida FRESCA degrada como antes (logId null, sin mutex —
  // utilidad no está en el sync manual).
  await clearStaleRunning(empresaKey, "utilidad");
  const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f = sorted[0];
  const l = sorted[sorted.length - 1];
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .insert({
      empresa_key: empresaKey,
      sync_type: "utilidad",
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
    console.error(`[sync-utilidad ${empresaKey}] no pude crear log: ${error?.message}`);
    return null;
  }
  return (data as { id: string }).id;
}

async function finishLog(
  logId: string | null,
  status: "success" | "error",
  records: number,
  errorMessage?: string,
  // Los descartes del guard de montos. Es también de donde sale el anti-loop del
  // aviso: sin persistirlos, el recordatorio volvería a sonar cada corrida.
  skipDetails?: unknown[],
): Promise<void> {
  if (!logId) return;
  await supabaseServer
    .from("switch_sync_log")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_inserted: records,
      error_message: errorMessage ?? null,
      ...(skipDetails && skipDetails.length > 0
        ? { records_skipped: skipDetails.length, skip_details: skipDetails }
        : {}),
    })
    .eq("id", logId);
}

// ─── Sync por empresa ────────────────────────────────────────────────────────

export async function syncEmpresaUtilidad(
  empresaKey: EmpresaKey,
  meses: Mes[],
  triggeredBy = "manual",
): Promise<SyncUtilidadResult> {
  const logId = await createLog(empresaKey, meses, triggeredBy);
  try {
    const cartera = await buildCarteraMap(empresaKey);
    // Maestro de vendedores (API JSON, no usa el login web). Alimenta el universo
    // del tab Comisiones v2 + siembra tasas globales de los nombres del maestro.
    const vendedoresMaestro = await syncVendedores(empresaKey);
    // Id real de Switch por (secuencial, fecha Panamá) — best-effort, ver arriba.
    const switchIds = await buildSwitchIdMap(empresaKey, meses);
    const session = await loginSwitchWeb(empresaKey);

    const cacheRows: ReturnType<typeof toCacheRow>[] = [];
    const vendedores = new Set<string>(vendedoresMaestro);
    for (const { year, month } of meses) {
      const rows = await fetchUtilidadMes(session, year, month);
      for (const r of rows) {
        // Sin fecha no hay llave (empresa, secuencial, fecha) ni filtro de mes
        // en las RPC — se omite con log (0 casos observados a la fecha).
        if (!r.fecha) {
          console.error(`[sync-utilidad ${empresaKey}] doc sin fecha omitido: secuencial=${r.secuencial}`);
          continue;
        }
        const cr = toCacheRow(empresaKey, r, cartera, switchIds);
        cacheRows.push(cr);
        if (cr.vendedor) vendedores.add(cr.vendedor);
      }
    }

    // Dedupe within-run por la llave (empresa, secuencial, fecha): dos filas
    // idénticas en el mismo lote romperían el ON CONFLICT del upsert ("cannot
    // affect row a second time"). Última gana (mismo criterio que el upsert).
    const byKey = new Map<string, ReturnType<typeof toCacheRow>>();
    for (const cr of cacheRows) byKey.set(`${cr.secuencial}|${cr.fecha}`, cr);

    // Guard de montos imposibles. Esta tabla decide QUÉ FACTURAS COMISIONAN: un
    // costo o una utilidad corruptos son plata mal pagada. Se rechaza el
    // documento entero (el upsert conserva el último valor bueno) y los demás
    // del mes se guardan igual — una fila mala no tumba el sync.
    const umbralUtilidad = await calibrarUmbral("utilidad", empresaKey);
    const { buenas: uniqueRows, rechazadas } = particionarFilas(
      "utilidad",
      [...byKey.values()],
      umbralUtilidad,
      (f) => `${f.secuencial} · ${f.fecha}`,
    );
    const skipDetails = rechazadas.length > 0
      ? detallesDeRechazo("utilidad", rechazadas, umbralUtilidad)
      : [];
    if (rechazadas.length > 0) {
      console.error(
        `[sync-utilidad ${empresaKey}] ${rechazadas.length} doc(s) con monto IMPOSIBLE (umbral ${umbralUtilidad}) — no se guardaron`,
        rechazadas.map((r) => r.clave),
      );
    }

    // GUARD "cero silencioso": no se puede registrar success habiendo escrito 0
    // filas cuando SÍ había documentos que escribir. Un sync que corre, no
    // escribe nada y se anota success es peor que uno que falla: nadie se entera.
    // Es exactamente lo que hacía invisible el agujero de joystep — la tabla
    // vacía convivía con un panel que mostraba $0,00 de comisión como si fuera
    // un dato real. Cero filas es LEGÍTIMO cuando la empresa no facturó en el
    // rango; deja de serlo cuando switch_facturas sí tiene documentos ahí.
    if (uniqueRows.length === 0) {
      const facturasEnRango = await contarFacturasEnRango(empresaKey, meses);
      if (facturasEnRango > 0) {
        // Si lo que vació el lote fue el guard de montos, decirlo: "0 documentos"
        // y "todos los documentos venían corruptos" son diagnósticos distintos.
        throw new Error(
          rechazadas.length > 0
            ? `el reporte de utilidad trajo ${rechazadas.length} documento(s) y TODOS traían montos imposibles (umbral ${umbralUtilidad}) — no se registra success con la tabla vacía`
            : `el reporte de utilidad devolvió 0 documentos pero switch_facturas tiene ${facturasEnRango} en el rango — no se registra success con la tabla vacía`,
        );
      }
    }

    await upsertCacheRows(uniqueRows);
    // Siembra tasas globales (0.5%) para nombres del maestro + atribuidos por cartera.
    const vendedoresNuevos = await seedTasasGlobal(vendedores);

    await finishLog(logId, "success", uniqueRows.length, undefined, skipDetails);

    // Aviso DESPUÉS de escribir; nunca tumba la corrida.
    if (rechazadas.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "utilidad",
          empresaKey,
          syncType: "utilidad",
          rechazadas,
          umbral: umbralUtilidad,
          logId,
        });
      } catch (e) {
        console.error(`[sync-utilidad ${empresaKey}] no pude avisar el monto imposible: ${String(e)}`);
      }
    }
    return {
      empresaKey,
      ok: true,
      meses: meses.length,
      documentos: uniqueRows.length,
      vendedoresNuevos,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLog(logId, "error", 0, msg);
    return { empresaKey, ok: false, meses: meses.length, documentos: 0, vendedoresNuevos: 0, error: msg };
  }
}

// ─── Sync todas las B2B (tolerante: una falla → las demás siguen) ────────────

export async function syncAllUtilidad(
  meses: Mes[],
  triggeredBy = "cron",
): Promise<SyncUtilidadResult[]> {
  const results: SyncUtilidadResult[] = [];
  for (const empresaKey of B2B_COMISION_KEYS) {
    // secuencial por empresa: single-session web + evita pisar sesiones en paralelo.
    results.push(await syncEmpresaUtilidad(empresaKey, meses, triggeredBy));
  }
  return results;
}

/** Helper: el mes en curso (UTC). */
export function mesActual(): Mes {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Meses del cron diario: mes en curso + mes ANTERIOR durante los días 1-5 (UTC).
 *  Cierra el gap del último día del mes: el cron corre ~08:00 UTC (~3am Panamá),
 *  así que los docs/recibos registrados en Switch durante el día hábil del 30/31
 *  quedaban fuera para siempre (el día 1 el cron ya solo pedía el mes nuevo).
 *  Re-sincronizar el mes anterior es idempotente: utilidad upserta por
 *  (empresa_key, secuencial) y recibos hace delete+insert por (empresa, mes) —
 *  cada doc cuenta en el mes de su propia fecha. */
export function mesesCronDiario(now: Date = new Date()): Mes[] {
  const cur = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  if (now.getUTCDate() > 5) return [cur];
  const prev = cur.month === 1 ? { year: cur.year - 1, month: 12 } : { year: cur.year, month: cur.month - 1 };
  return [prev, cur];
}

/** Helper: todos los meses de un año hasta el mes dado (para backfill). */
export function mesesDeAnio(year: number, hastaMes: number): Mes[] {
  return Array.from({ length: hastaMes }, (_, i) => ({ year, month: i + 1 }));
}
