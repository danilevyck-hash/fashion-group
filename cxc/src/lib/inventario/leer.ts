/**
 * Lectura del INVENTARIO VALORIZADO. **UNA sola implementación.**
 *
 * La suma la hace POSTGRES (`inventario_valorizado_v1()`): `switch_articulo_info`
 * tiene 16.180 filas y `db-max-rows` de PostgREST es 1000, así que bajarlas
 * crudas son 17 idas y vueltas SECUENCIALES contra una base en compute Micro
 * para responder ocho números. Agrupado son 6 filas en UNA llamada — el mismo
 * precedente de `multifashion_articulo_diario_agrupado_v1` (49 viajes → 3).
 *
 * 🔴 LA PANTALLA FUNCIONA SIN LA MIGRACIÓN. Si PostgREST contesta "no existe
 * esa función" (PGRST202 / 42883) se cae sola al camino PAGINADO, que da
 * exactamente los mismos números (misma función pura para armar el resultado) y
 * lo dice en `fuente`. Un error de verdad —timeout, permiso denegado— se
 * propaga: caerse a 17 consultas ante una base que está sufriendo sería
 * esconder el problema y agrandarlo.
 *
 * 🔴 Y NUNCA UN $0. Un inventario en cero y un inventario sin medir se ven
 * idénticos, así que esta lectura NUNCA devuelve ceros inventados: o trae los
 * números, o revienta. Quien la llama (`/api/dashboard/vista-general`) la
 * envuelve en un `.catch` y pinta "no se pudo medir".
 *
 * Histórico: si `switch_articulo_info` no existía todavía se devolvía
 * `disponible:false` con `fuente:"no-instalado"`.
 * Tolerancia retirada el 3-sep-2026: la tabla existe (y la RPC también, desde
 * 20260813190000_inventario_valorizado.sql). Un "no existe esa tabla" que hoy
 * llegue es un permiso, un cambio de esquema o un timeout mal leído, y
 * disfrazarlo de "todavía no instalado" dejaba la tarjeta apagada para siempre
 * sin que nadie se enterara.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { esFuncionAusente } from "@/lib/multifashion/productos-lectura";
import {
  agregarEmpresa,
  agregarInventario,
  armarInventario,
  descontarFantasmas,
  num,
  type FilaArticuloInfo,
  type InventarioEmpresa,
  type InventarioValorizado,
} from "./valorizado";

export const RPC_INVENTARIO = "inventario_valorizado_v1";

/**
 * Las 6 de Fashion Group (el cron `sync-articulo-info` también trae Multifashion
 * desde el 5-oct-2026, pero la Vista general sigue mirando solo el grupo).
 * Se DERIVA, no se escribe a mano: el propio `syncArticuloInfo` rechaza
 * cualquier otra, así que sumar una empresa al cron achica sola la lista de
 * "sin inventario" que ve el usuario.
 */
export const EMPRESAS_CON_INVENTARIO: readonly string[] = B2B_EMPRESA_KEYS;

/** De dónde salió el número, para poder auditarlo desde la respuesta. */
export type FuenteInventario = "rpc" | "paginado";

export interface LecturaInventario extends InventarioValorizado {
  fuente: FuenteInventario;
}

/** Fila que devuelve la RPC (una por empresa, ya sumada por Postgres). */
interface FilaRpc {
  e: string;
  art: number;
  stk: number;
  u: number | string;
  c: number | string;
  p: number | string;
  sca: number;
  scu: number | string;
  neg: number | string;
  m: string | null;
}

const n0 = (v: unknown): number => num(v) ?? 0;

function deRpc(r: FilaRpc): InventarioEmpresa {
  return {
    key: r.e,
    name: EMPRESA_KEY_TO_NAME[r.e] ?? r.e,
    articulos: n0(r.art),
    conStock: n0(r.stk),
    unidades: n0(r.u),
    // Postgres suma `numeric` exacto; acá sólo se cierra al centavo, igual que
    // el camino paginado, para que los dos den el MISMO número.
    costo: Math.round(n0(r.c) * 100) / 100,
    precio: Math.round(n0(r.p) * 100) / 100,
    sinCostoArticulos: n0(r.sca),
    sinCostoUnidades: n0(r.scu),
    unidadesNegativas: n0(r.neg),
    medidoEn: r.m,
  };
}

const COLCHON_RELOJ_MS = 10 * 60_000;

/** La última corrida BUENA de `sync-articulo-info` por empresa (switch_sync_log). */
export interface CorridaArticuloInfo {
  inicio: string;
  fin: string | null;
}

export async function leerUltimasCorridas(empresas: readonly string[]): Promise<Map<string, CorridaArticuloInfo>> {
  const out = new Map<string, CorridaArticuloInfo>();
  await Promise.all(
    empresas.map(async (k) => {
      const { data, error } = await supabaseServer
        .from("switch_sync_log")
        .select("started_at, finished_at")
        .eq("empresa_key", k)
        .eq("sync_type", "articulo_info")
        .eq("status", "success")
        // Una corrida «buena» que no escribió nada no dice qué artículos existen.
        .gt("records_inserted", 0)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(`switch_sync_log (articulo_info ${k}): ${error.message}`);
      const f = (data ?? [])[0] as { started_at: string; finished_at: string | null } | undefined;
      // El sello de las filas lo pone el reloj del servidor y el inicio, el de
      // la base: 10 min de colchón (la corrida anterior es de hace ~24 h).
      if (f) out.set(k, { inicio: new Date(Date.parse(f.started_at) - COLCHON_RELOJ_MS).toISOString(), fin: f.finished_at });
    }),
  );
  return out;
}

/** Las filas que NO vinieron en la última corrida buena de su empresa. */
async function leerFantasmas(empresa: string, inicio: string): Promise<FilaArticuloInfo[]> {
  return leerTodoPaginado<FilaArticuloInfo>(`switch_articulo_info (no vino en la corrida, ${empresa})`, (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_articulo_info")
      .select("empresa_key, existencia, costo_api, precio_etiqueta, synced_at", pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", empresa)
      .lt("synced_at", inicio)
      .order("codigo", { ascending: true })
      .range(desde, hasta),
  );
}

/**
 * El inventario valorizado de las empresas cubiertas por el sync.
 *
 * `ahoraMs` entra por parámetro para que la frescura sea testeable con fechas
 * FIJAS (el repo ya se quemó con `new Date()` dentro de la lógica).
 *
 * 🩸 27-nov-2026: solo suma lo que vino en la ÚLTIMA corrida buena de cada
 * empresa (`switch_sync_log`), y la frescura es el fin de esa corrida — ver
 * `descontarFantasmas`. Sin corrida registrada, la empresa queda como antes.
 */
export async function leerInventarioValorizado(
  ahoraMs: number = Date.now(),
  empresas: readonly string[] = EMPRESAS_CON_INVENTARIO,
): Promise<LecturaInventario> {
  const corridas = await leerUltimasCorridas(empresas);
  const fantasmas = new Map<string, InventarioEmpresa>();
  await Promise.all(
    [...corridas].map(async ([k, c]) => {
      const filas = await leerFantasmas(k, c.inicio);
      if (filas.length > 0) fantasmas.set(k, agregarEmpresa(k, filas));
    }),
  );
  const corregir = (e: InventarioEmpresa) =>
    corridas.has(e.key) ? descontarFantasmas(e, fantasmas.get(e.key) ?? null, corridas.get(e.key)!.fin) : e;

  // ── Camino rápido: la suma la hace Postgres ──
  const { data, error } = await supabaseServer.rpc(RPC_INVENTARIO);
  if (!error) {
    const filas = (data as FilaRpc[] | null) ?? [];
    return {
      ...armarInventario(filas.map(deRpc).map(corregir), empresas, ahoraMs),
      fuente: "rpc",
    };
  }
  // ⚠️ ESTRECHO A PROPÓSITO: sólo "la función no existe" cae al camino largo.
  // Todo lo demás —incluido un "no existe esa tabla"— se propaga.
  if (!esFuncionAusente(error)) throw new Error(`${RPC_INVENTARIO}: ${error.message}`);
  console.warn(
    `[inventario] ${RPC_INVENTARIO} no existe todavía (falta correr ` +
      `supabase/migrations/20260813190000_inventario_valorizado.sql). ` +
      `Se lee paginado: mismos números, 17 consultas en vez de 1.`,
  );

  // ── Camino largo: paginado con verificación contra COUNT exacto ──
  // `leerTodoPaginado` revienta si lo leído no cuadra con el count: un truncado
  // silencioso acá se vería como "tengo menos mercancía", sin ningún error.
  const filas = await leerTodoPaginado<FilaArticuloInfo>(
    "switch_articulo_info (inventario valorizado)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_articulo_info")
        .select(
          "empresa_key, existencia, costo_api, precio_etiqueta, synced_at",
          pedirCount ? { count: "exact" } : {},
        )
        // Orden ESTABLE para paginar: la PK es (empresa_key, codigo).
        .order("empresa_key", { ascending: true })
        .order("codigo", { ascending: true })
        .range(desde, hasta),
  );
  const vinieron = filas.filter((f) => {
    const c = corridas.get(f.empresa_key);
    return !c || (f.synced_at != null && Date.parse(String(f.synced_at)) >= Date.parse(c.inicio));
  });
  const base = agregarInventario(vinieron, empresas, ahoraMs);
  return {
    ...armarInventario(base.porEmpresa.map((e) => (corridas.has(e.key) ? { ...e, medidoEn: corridas.get(e.key)!.fin ?? e.medidoEn } : e)), empresas, ahoraMs),
    fuente: "paginado",
  };
}
