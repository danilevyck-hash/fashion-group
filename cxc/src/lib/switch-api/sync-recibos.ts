/**
 * Sync de RECIBOS (cobros) → switch_recibos.
 *
 * Fuente: /apireporte/recibos (API JSON, mismo token que facturas). Un row por
 * recibo (fechaCreacion, cliente, vendedor que registró, total). El endpoint NO
 * da id/secuencial → la unidad de reemplazo es el (empresa, mes) completo:
 * re-sincronizar un mes deja la tabla IDÉNTICA a lo que devuelve Switch para ese
 * mes, incluidas las BAJAS (recibos anulados o borrados en el ERP).
 *
 * VENTANA RODANTE (jul-2026, audit sync): el cron re-sincroniza SIEMPRE los
 * últimos 3 meses (mesesCronRecibos). A diferencia de facturas/utilidad (upsert
 * incremental), los recibos SÍ cambian dentro de la ventana: Switch permite
 * anular, editar o retro-cargar recibos con fecha pasada, y reemplazar el mes
 * es la única forma de corregirlos (detectados 4 faltantes + 1 anulado en
 * may-jun 2026 que la ventana de 1 mes nunca corrigió). Duración medida:
 * mediana ~5.1s por empresa-mes → 3 meses × 6 empresas ≈ 90-120s.
 *
 * ESCRITURA SELECTIVA (26-jul-2026): el reemplazo del mes se calcula, no se
 * ejecuta a ciegas. Antes era DELETE de todo el mes + INSERT de todo el mes en
 * cada una de las 4 corridas diarias, lo que reescribía ~37K filas al día para
 * cambiar unas pocas decenas y dejó la tabla con 18,3% de filas muertas. Ahora
 * se lee el mes que ya está guardado, se compara contra lo que trajo Switch y
 * se escriben SOLO las diferencias (altas, bajas y modificaciones). El conjunto
 * final es el mismo por construcción — ver la demostración en recibos-diff.ts.
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

import { CODIGO_CLIENTE_CONTADO } from "@/lib/catalogo/publico-switch-actor";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { supabaseServer } from "../supabase-server";
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { createSwitchClient } from "./client";
import { empresasConRecibos } from "./empresas";
import { diffRecibos, type ReciboExistente } from "./recibos-diff";
import { clearStaleRunning, isRunningLockConflict } from "./sync-log";
import type { Mes } from "./sync-utilidad";

/**
 * Empresas con sync de recibos: las 8 — las 6 B2B, Multifashion
 * (american_classic) y Confecciones Boston (`recibos: true` desde el PR #347).
 *
 * DERIVADA de EMPRESA_SYNC_CAPABILITIES (`recibos: true`), no escrita a mano.
 * Cuando era un array literal decía 6 empresas y omitía `joystep`, mientras
 * `B2B_EMPRESA_KEYS` sí lo incluía — dos listas que se contradecían en silencio
 * desde el commit que creó este archivo, sin un comentario que lo explicara.
 * Costó $15.262,00 de cobros invisibles solo en julio 2026. Para agregar o
 * sacar una empresa se toca EMPRESA_SYNC_CAPABILITIES, en un solo lugar.
 */
export const RECIBOS_EMPRESA_KEYS: EmpresaKey[] = empresasConRecibos();

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
  /** Filas que Switch devolvió para la ventana (el tamaño del mes, no lo escrito). */
  recibos: number;
  /** Filas insertadas de verdad (altas + modificaciones). */
  insertadas?: number;
  /** Filas borradas de verdad (bajas + modificaciones). */
  borradas?: number;
  /** Filas idénticas que NO se tocaron (lo que antes se reescribía por gusto). */
  sinCambio?: number;
  error?: string;
}

/** Columnas de negocio de switch_recibos + id: lo que necesita el diff. */
const COLUMNAS_DIFF =
  "id,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,cliente_nombre,vendedor_registro,vendedor_cartera,total,es_retencion";

/**
 * Tamaño de página de la lectura del mes.
 *
 * ⚠️ PostgREST corta TODA respuesta en `db-max-rows` = 1000 filas en este
 * proyecto, y lo hace en SILENCIO: pedir `.range(0, 49999)` devuelve 1000 sin
 * error. Medido el 26-jul-2026: american_classic jun-2026 tiene 1.259 recibos y
 * el select devolvía 1.000. Comparar el mes contra una lectura truncada haría
 * que las 259 filas invisibles se consideraran ausentes y se RE-INSERTARAN en
 * cada corrida → recibos duplicados y comisión-cobro inflada. Por eso se pagina
 * con orden estable y se verifica el total contra un COUNT exacto.
 */
const PAGINA_LECTURA = 1000;

/** Cota dura de páginas (1M filas en un mes-empresa es imposible: el mes más
 *  grande medido tiene 1.259). Está para que el bucle no pueda quedar girando. */
const MAX_PAGINAS = 1000;

/** Tamaño de lote del DELETE por id (la lista de uuids viaja en el query string). */
const LOTE_BORRADO = 100;

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

async function finishLog(
  logId: string | null,
  status: "success" | "error",
  n: number,
  err?: string,
  // Los descartes del guard de montos. De acá sale el anti-loop del aviso: sin
  // persistirlos, el recordatorio volvería a sonar en cada corrida.
  skipDetails?: unknown[],
): Promise<void> {
  if (!logId) return;
  await supabaseServer
    .from("switch_sync_log")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_inserted: n,
      error_message: err ?? null,
      ...(skipDetails && skipDetails.length > 0
        ? { records_skipped: skipDetails.length, skip_details: skipDetails }
        : {}),
    })
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
 *  mismo calendario que la fecha de los recibos del API.
 *
 *  ⚠️ PAGINADO (26-jul-2026): esta lectura tenía el MISMO defecto que
 *  leerMesGuardado — `.range(0, 99999)` contra un `db-max-rows` de 1000 devuelve
 *  1.000 filas SIN error. Medido: american_classic tiene 3.904 facturas en la
 *  ventana y el select traía 1.000; las 2.904 invisibles no podían clasificar
 *  ninguna retención, así que un recibo de retención de ITBMS quedaba marcado
 *  como COBRO REAL y contaminaba el "último pago" del CXC y la comisión sobre
 *  cobro. Hoy no muerde (esa empresa es retail: 0 retenciones en la ventana, 6
 *  en toda su historia; las 5 B2B tienen 47-208 facturas, muy por debajo del
 *  tope) pero muerde el día que una empresa B2B pase de 1.000 facturas en 4
 *  meses. Mismo patrón que leerMesGuardado: orden estable + COUNT exacto.
 *
 *  FALLA CERRADA a propósito: antes un error del select se tragaba y devolvía
 *  un mapa VACÍO → todos los recibos salían es_retencion=false y el sync los
 *  escribía como cobros reales. Ahora lanza: la empresa queda ok:false con el
 *  error en switch_sync_log y el mes NO se toca (la lectura ocurre antes de
 *  cualquier escritura). Un sync que no corre se ve y se repara; un sync que
 *  marca mal las retenciones, no. */
export async function loadImpuestoMap(empresaKey: EmpresaKey, from: string, toExcl: string): Promise<ImpuestoMap> {
  const map: ImpuestoMap = new Map();
  type FilaFactura = { cliente_switch_id: number | null; fecha: string; impuesto: unknown };
  const filas: FilaFactura[] = [];
  let esperadas: number | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const desde = pagina * PAGINA_LECTURA;
    const { data, error, count } = await supabaseServer
      .from("switch_facturas")
      .select("cliente_switch_id,fecha,impuesto", pagina === 0 ? { count: "exact" } : {})
      .eq("empresa_key", empresaKey)
      .eq("tipo_comprobante", "Factura")
      .gte("fecha", `${from}T00:00:00-05:00`)
      .lt("fecha", `${toExcl}T00:00:00-05:00`)
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA_LECTURA - 1);
    if (error) throw new Error(`select switch_facturas (impuestos ${empresaKey}): ${error.message}`);
    if (pagina === 0) esperadas = count ?? null;
    const lote = (data ?? []) as unknown as FilaFactura[];
    filas.push(...lote);
    if (lote.length < PAGINA_LECTURA) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }
  if (esperadas == null) {
    throw new Error(`switch_facturas sin COUNT (${empresaKey} ${from}): no puedo garantizar la lectura completa`);
  }
  if (filas.length !== esperadas) {
    throw new Error(
      `lectura incompleta de switch_facturas (${empresaKey} ${from}): ${filas.length} filas leídas vs ${esperadas} contadas`,
    );
  }
  for (const f of filas) {
    const k = f.cliente_switch_id;
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push({ fecha: fechaPanamaDe(String(f.fecha)), imp: num(f.impuesto) });
  }
  return map;
}

const RET_WINDOW_MS = 35 * 864e5;

/**
 * El cliente de MOSTRADOR nunca retiene ITBMS — y sin este corte la heurística
 * se vuelve ruido puro sobre él.
 *
 * Quién retiene ITBMS es una figura fiscal: un negocio registrado como agente de
 * retención le retiene el impuesto a su proveedor y se lo paga a la DGI. Quien
 * paga en efectivo en el mostrador no es eso. Por eso `es_retencion` sobre el
 * mostrador no puede ser otra cosa que un falso positivo.
 *
 * Y es un falso positivo casi garantizado, porque el mostrador es un
 * PSEUDO-CLIENTE que acumula toda la venta al detalle bajo un solo id: en
 * american_classic son 25.800 de las ~26.500 facturas de la empresa, 3.455 solo
 * en la ventana del mapa. Contra ese volumen, "el recibo coincide con impuesto/2
 * de ALGUNA factura del cliente dentro de ±35 días" deja de ser evidencia y pasa
 * a ser el problema del cumpleaños: medido el 26-jul-2026, un recibo de $2.00
 * cuadra con 6 facturas distintas y uno de $0.01 con 4. Un cliente B2B real
 * tiene 3-50 facturas en la misma ventana y ahí la coincidencia sí significa
 * algo.
 *
 * IDENTIDAD: `cliente_codigo = 'TCKCTA'`, el código con el que Switch marca a su
 * pseudo-cliente de contado. NO se compara por nombre: el nombre cambia por
 * empresa ("CONTADO", "Contado", "VENTAS LOCA", "VENTAS LOCAL" — ver
 * sync-clientes-master.ts, que lo normaliza justamente por eso) y un día alguien
 * escribe "Contado " con espacio o existe un cliente real que se llame parecido.
 * El código es el mismo dato que ya usan las RPC de comisión para excluir al
 * mostrador de la base de cobro (`AND COALESCE(r.cliente_codigo,'') <> 'TCKCTA'`
 * en comision_b2b_v4/v5, comision_cobro_v3 y comision_detalle) y el que resuelve
 * el checkout público (CODIGO_CLIENTE_CONTADO). Reusarlo mantiene una sola
 * definición de "esto no es un cliente de verdad" en todo el sistema.
 */
function esClienteMostrador(clienteCodigo: string | null): boolean {
  return (clienteCodigo ?? "").trim().toUpperCase() === CODIGO_CLIENTE_CONTADO;
}

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
export async function fetchRecibosMes(empresaKey: EmpresaKey, year: number, month: number, impuestoMap: ImpuestoMap, carteraMap: Map<number, string>) {
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
  const clienteCodigo = (r.clienteCodigo as string) ?? null;
  return {
    empresa_key: empresaKey,
    fecha,
    fecha_creacion: fc ? fc.replace(" ", "T") : null,
    cliente_switch_id: cliId,
    cliente_codigo: clienteCodigo,
    cliente_nombre: (r.clienteNombre as string) ?? null,
    vendedor_registro: vendedorRegistro,
    // atribución por cartera (dueño del cliente); fallback al vendedor del recibo
    vendedor_cartera: (cliId != null ? carteraMap.get(cliId) : undefined) ?? vendedorRegistro,
    total,
    // El mostrador no retiene ITBMS: sobre él la heurística sólo puede producir
    // falsos positivos (ver esClienteMostrador).
    es_retencion: !esClienteMostrador(clienteCodigo) && esRetencion(cliId, fecha, total, impuestoMap),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Mapas auxiliares de una corrida: impuestos de facturas (para clasificar
 * retenciones) y cartera (vendedor dueño de cada cliente). Se arman una vez por
 * empresa y valen para todos los meses de la ventana.
 */
export async function cargarMapasRecibos(empresaKey: EmpresaKey, meses: Mes[]) {
  // El mapa de impuestos cubre los meses + 35 días antes (una factura puede
  // preceder a su recibo de retención).
  const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f0 = sorted[0];
  const lN = sorted[sorted.length - 1];
  const winFrom = new Date(Date.UTC(f0.year, f0.month - 1, 1) - RET_WINDOW_MS).toISOString().slice(0, 10);
  const winTo = monthBounds(lN.year, lN.month).finExcl;
  const impuestoMap = await loadImpuestoMap(empresaKey, winFrom, winTo);
  const carteraMap = await buildCarteraMap(empresaKey);
  return { impuestoMap, carteraMap };
}

/**
 * Lee el mes COMPLETO tal como está guardado hoy. El predicado es EXACTAMENTE
 * el del DELETE que hacía la versión vieja (empresa_key + fecha en
 * [inicio, finExcl)), que es lo que hace equivalentes al viejo y al nuevo
 * estado final.
 *
 * "Completo" es la palabra clave: una lectura corta se traduce en filas
 * duplicadas (ver PAGINA_LECTURA). Se pagina con `order("id")` —hace falta un
 * orden estable, sin él PostgREST puede repetir o saltear filas entre páginas—
 * y al final se compara contra el COUNT exacto. Si no cuadra se corta con
 * error: la lectura ocurre ANTES de cualquier escritura del mes, así que el mes
 * queda intacto.
 */
export async function leerMesGuardado(
  empresaKey: EmpresaKey,
  inicio: string,
  finExcl: string,
): Promise<ReciboExistente[]> {
  const filas: ReciboExistente[] = [];
  let esperadas: number | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const desde = pagina * PAGINA_LECTURA;
    const { data, error, count } = await supabaseServer
      .from("switch_recibos")
      .select(COLUMNAS_DIFF, pagina === 0 ? { count: "exact" } : {})
      .eq("empresa_key", empresaKey)
      .gte("fecha", inicio)
      .lt("fecha", finExcl)
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA_LECTURA - 1);
    if (error) throw new Error(`select switch_recibos: ${error.message}`);
    if (pagina === 0) esperadas = count ?? null;
    const lote = (data ?? []) as unknown as ReciboExistente[];
    filas.push(...lote);
    // Se corta por página incompleta o al alcanzar el COUNT. El segundo corte
    // existe para que un servidor que devolviera páginas llenas para siempre no
    // deje el bucle girando: se sale y el chequeo de abajo lo denuncia.
    if (lote.length < PAGINA_LECTURA) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }
  if (esperadas == null) {
    throw new Error(`switch_recibos sin COUNT (${empresaKey} ${inicio}): no puedo garantizar la lectura completa`);
  }
  if (filas.length !== esperadas) {
    throw new Error(
      `lectura incompleta de switch_recibos (${empresaKey} ${inicio}): ${filas.length} filas leídas vs ${esperadas} contadas`,
    );
  }
  return filas;
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
    const { impuestoMap, carteraMap } = await cargarMapasRecibos(empresaKey, meses);

    // Guard de montos imposibles: el total de un recibo es la base de la
    // comisión sobre cobro. Un umbral por corrida, calibrado contra el
    // histórico de cobros de ESTA empresa.
    const umbralRecibo = await calibrarUmbral("recibo", empresaKey);
    const rechazadasRecibo: Array<
      ReturnType<typeof particionarFilas<ReturnType<typeof mapRow>>>["rechazadas"][number]
    > = [];

    let totalRecibos = 0;
    let totalInsertadas = 0;
    let totalBorradas = 0;
    let totalSinCambio = 0;
    for (const { year, month } of meses) {
      const crudas = await fetchRecibosMes(empresaKey, year, month, impuestoMap, carteraMap);
      const { inicio, finExcl } = monthBounds(year, month);

      // Un recibo con monto imposible no entra. Los demás del mes sí — una fila
      // mala no tumba el sync.
      const { buenas: rows, rechazadas } = particionarFilas(
        "recibo",
        crudas,
        umbralRecibo,
        (f) => `${f.fecha ?? "sin fecha"} · ${f.cliente_nombre ?? "sin cliente"}`,
      );
      if (rechazadas.length > 0) {
        rechazadasRecibo.push(...rechazadas);
        console.error(
          `[sync-recibos ${empresaKey}] ${rechazadas.length} recibo(s) con monto IMPOSIBLE (umbral ${umbralRecibo}) — no se guardaron`,
          rechazadas.map((r) => r.clave),
        );
      }

      // Reemplazo del mes calculado, no a ciegas: se escriben solo las
      // diferencias contra lo guardado. El conjunto final es idéntico al del
      // DELETE+INSERT completo (demostración en recibos-diff.ts).
      const guardadas = await leerMesGuardado(empresaKey, inicio, finExcl);
      const { insertar, borrarIds: borrarCrudos, sinCambio } = diffRecibos(guardadas, rows);

      // ⚠️ SIN ESTO EL GUARD SERÍA DESTRUCTIVO. `total` entra en la identidad
      // del diff, así que el recibo cuya cifra vino corrupta no se parea con su
      // fila guardada y esa fila —la que tiene el ÚLTIMO VALOR BUENO— caería en
      // `borrarIds`. Rechazar el dato malo terminaría BORRANDO el bueno, que es
      // justo lo contrario de lo que el guard existe para hacer. Se protege la
      // fila guardada del recibo rechazado (misma fecha y mismo cliente).
      const clavesRechazadas = new Set(
        rechazadas.map((r) => `${r.fila.fecha}|${r.fila.cliente_switch_id}|${r.fila.cliente_nombre}`),
      );
      const protegidos = new Set(
        guardadas
          .filter((g) => clavesRechazadas.has(`${g.fecha}|${g.cliente_switch_id}|${g.cliente_nombre}`))
          .map((g) => g.id),
      );
      const borrarIds = protegidos.size > 0
        ? borrarCrudos.filter((id) => !protegidos.has(id))
        : borrarCrudos;
      if (protegidos.size > 0) {
        console.error(
          `[sync-recibos ${empresaKey}] ${protegidos.size} recibo(s) guardado(s) protegidos del borrado (su versión nueva vino con monto imposible)`,
        );
      }

      // Las BAJAS primero (recibos que Switch anuló/borró y modificaciones), en
      // lotes: la lista de uuids viaja en el query string.
      for (let i = 0; i < borrarIds.length; i += LOTE_BORRADO) {
        const lote = borrarIds.slice(i, i + LOTE_BORRADO);
        const { error: delErr } = await supabaseServer.from("switch_recibos").delete().in("id", lote);
        if (delErr) throw new Error(`delete switch_recibos: ${delErr.message}`);
      }
      if (insertar.length > 0) {
        const { error: insErr } = await supabaseServer.from("switch_recibos").insert(insertar);
        if (insErr) throw new Error(`insert switch_recibos: ${insErr.message}`);
      }

      totalRecibos += rows.length;
      totalInsertadas += insertar.length;
      totalBorradas += borrarIds.length;
      totalSinCambio += sinCambio;
    }
    // records_inserted del log sigue siendo el TAMAÑO DE LA VENTANA, no lo
    // escrito: es lo que muestran /api/sync-status y el panel "Actualizar
    // ahora" ("N recibos sincronizados"). Cambiarlo por las filas escritas
    // haría parecer que el sync dejó de traer datos.
    await finishLog(
      logId,
      "success",
      totalRecibos,
      undefined,
      rechazadasRecibo.length > 0
        ? detallesDeRechazo("recibo", rechazadasRecibo, umbralRecibo)
        : undefined,
    );

    // Aviso DESPUÉS de escribir; nunca tumba la corrida.
    if (rechazadasRecibo.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "recibo",
          empresaKey,
          syncType: "recibos",
          rechazadas: rechazadasRecibo,
          umbral: umbralRecibo,
          logId,
        });
      } catch (e) {
        console.error(`[sync-recibos ${empresaKey}] no pude avisar el monto imposible: ${String(e)}`);
      }
    }

    return {
      empresaKey,
      ok: true,
      meses: meses.length,
      recibos: totalRecibos,
      insertadas: totalInsertadas,
      borradas: totalBorradas,
      sinCambio: totalSinCambio,
    };
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
