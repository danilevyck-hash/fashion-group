// ─────────────────────────────────────────────────────────────────────────────
// Distintivo «Nuevo» del catálogo (22-nov-2026, decisión de Daniel).
//
// 🔑 LA REGLA (22-nov-2026, ajustada por Daniel el mismo día): un artículo lleva
// la bolita «Llegada reciente» si su código exacto de Switch (código con color =
// `sku` del catálogo) tuvo ALGUNA llegada en los últimos 30 días de Panamá
// (`hoyPanama()`, hoy − 30 inclusive). Las REPOSICIONES TAMBIÉN cuentan (al
// principio era solo la primera llegada). Fuente: `switch_ingresos_mercancia`.
//
// 🔴 SOLO EL ADMIN: el dato se agrega únicamente cuando quien pide es admin
// (`GET /api/catalogo/[marca]/products`). Ni el catálogo público ni los demás
// roles internos lo reciben (Daniel: los vendedores muestran su pantalla).
//
// ⚠️ No es el `badge` manual («nuevo · oferta · proximamente»): ese campo nadie
// lo llena y no se revive. Esto es calculado y viaja como `nuevo: boolean`.
//
// 🔴 FALLA ABIERTA: si la lectura de ingresos falla, nadie lleva el distintivo y
// el catálogo carga igual. Lo resuelve el SERVIDOR; al navegador solo va el
// booleano, nunca fechas.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { DISTINTIVO_NUEVO } from "@/lib/ui/catalogo-nuevo-2026-11";

export const DIAS_NUEVO = 30;

/** Primer día (YYYY-MM-DD) que todavía cuenta como «nuevo»: hoy − 30. */
export function desdeNuevo(hoy: string): string {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - DIAS_NUEVO);
  return d.toISOString().slice(0, 10);
}

interface FilaIngreso {
  codigo_articulo: string | null;
  fecha: string;
}

/** PURO: los códigos con ALGUNA llegada ≥ hoy − 30 (reposición incluida). */
export function codigosNuevos(filas: FilaIngreso[], hoy: string): Set<string> {
  const desde = desdeNuevo(hoy);
  const nuevos = new Set<string>();
  for (const f of filas) {
    const c = f.codigo_articulo?.trim();
    if (c && f.fecha >= desde) nuevos.add(c);
  }
  return nuevos;
}

/** PURO: cada producto con `nuevo` resuelto por su `sku` exacto. */
export function marcarNuevos<T extends { sku?: unknown }>(
  products: T[],
  nuevos: Set<string>,
): (T & { nuevo: boolean })[] {
  return products.map((p) => ({
    ...p,
    nuevo: typeof p.sku === "string" && nuevos.has(p.sku.trim()),
  }));
}

/** Lectura: lo llegado en la ventana. Lanza si algo falla — así nunca se
 *  cachea un error. */
async function leerNuevos(empresaKey: string): Promise<string[]> {
  const { supabaseServer: db } = await import("@/lib/supabase-server");
  const hoy = hoyPanama();
  const recientes = await leerTodoPaginado<FilaIngreso>(
    `switch_ingresos_mercancia (llegada reciente ${empresaKey})`,
    (pedirCount, a, b) =>
      db.from("switch_ingresos_mercancia")
        .select("codigo_articulo,fecha", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresaKey)
        .gte("fecha", desdeNuevo(hoy))
        .order("n_interno").order("linea")
        .range(a, b),
  );
  return Array.from(codigosNuevos(recientes, hoy));
}

/** Cacheado 1 h por empresa (los ingresos llegan una vez al día). */
const leerNuevosCacheado = (empresaKey: string) =>
  unstable_cache(async (_e: string) => leerNuevos(_e), ["catalogo-llegada-reciente"], { revalidate: 3600 })(empresaKey);

/** Los productos con `nuevo` puesto. Falla ABIERTA: ante cualquier error,
 *  `nuevo: false` en todos y el catálogo sigue. */
export async function conDistintivoNuevo<T extends { sku?: unknown }>(
  empresaKey: string,
  products: T[],
): Promise<(T & { nuevo: boolean })[]> {
  let nuevos = new Set<string>();
  if (DISTINTIVO_NUEVO) {
    try {
      nuevos = new Set(await leerNuevosCacheado(empresaKey));
    } catch (e) {
      console.error("[catalogo] distintivo «Nuevo» sin datos:", e);
    }
  }
  return marcarNuevos(products, nuevos);
}
