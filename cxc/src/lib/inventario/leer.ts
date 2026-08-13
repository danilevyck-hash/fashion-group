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
 * 🔴 Y NUNCA UN $0. Si la tabla no existe, `disponible:false` y la pantalla lo
 * dice. Un inventario en cero y un inventario sin medir se ven idénticos.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { esFuncionAusente } from "@/lib/multifashion/productos-lectura";
import { esTablaAusente } from "@/lib/mayor/leer";
import {
  agregarInventario,
  armarInventario,
  inventarioNoDisponible,
  num,
  type FilaArticuloInfo,
  type InventarioEmpresa,
  type InventarioValorizado,
} from "./valorizado";

export const RPC_INVENTARIO = "inventario_valorizado_v1";

/**
 * Las empresas que el cron `sync-articulo-info` cubre — las 6 de Fashion Group.
 * Se DERIVA, no se escribe a mano: el propio `syncArticuloInfo` rechaza
 * cualquier otra, así que sumar una empresa al cron achica sola la lista de
 * "sin inventario" que ve el usuario.
 */
export const EMPRESAS_CON_INVENTARIO: readonly string[] = B2B_EMPRESA_KEYS;

/** De dónde salió el número, para poder auditarlo desde la respuesta. */
export type FuenteInventario = "rpc" | "paginado" | "no-instalado";

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

/**
 * El inventario valorizado de las empresas cubiertas por el sync.
 *
 * `ahoraMs` entra por parámetro para que la frescura sea testeable con fechas
 * FIJAS (el repo ya se quemó con `new Date()` dentro de la lógica).
 */
export async function leerInventarioValorizado(ahoraMs: number = Date.now()): Promise<LecturaInventario> {
  // ── Camino rápido: la suma la hace Postgres ──
  const { data, error } = await supabaseServer.rpc(RPC_INVENTARIO);
  if (!error) {
    const filas = (data as FilaRpc[] | null) ?? [];
    return {
      ...armarInventario(filas.map(deRpc), EMPRESAS_CON_INVENTARIO, ahoraMs),
      fuente: "rpc",
    };
  }
  // La tabla no existe todavía → la pantalla lo dice, no inventa un cero.
  if (esTablaAusente(error)) {
    return { ...inventarioNoDisponible(EMPRESAS_CON_INVENTARIO), fuente: "no-instalado" };
  }
  // ⚠️ ESTRECHO A PROPÓSITO: sólo "la función no existe" cae al camino largo.
  if (!esFuncionAusente(error)) throw new Error(`${RPC_INVENTARIO}: ${error.message}`);
  console.warn(
    `[inventario] ${RPC_INVENTARIO} no existe todavía (falta correr ` +
      `supabase/migrations/20260813190000_inventario_valorizado.sql). ` +
      `Se lee paginado: mismos números, 17 consultas en vez de 1.`,
  );

  // ── Camino largo: paginado con verificación contra COUNT exacto ──
  // `leerTodoPaginado` revienta si lo leído no cuadra con el count: un truncado
  // silencioso acá se vería como "tengo menos mercancía", sin ningún error.
  let filas: FilaArticuloInfo[];
  try {
    filas = await leerTodoPaginado<FilaArticuloInfo>(
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
  } catch (e) {
    if (esTablaAusente(e)) {
      return { ...inventarioNoDisponible(EMPRESAS_CON_INVENTARIO), fuente: "no-instalado" };
    }
    throw e;
  }
  return {
    ...agregarInventario(filas, EMPRESAS_CON_INVENTARIO, ahoraMs),
    fuente: "paginado",
  };
}
