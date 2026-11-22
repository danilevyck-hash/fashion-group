// ─────────────────────────────────────────────────────────────────────────────
// Distintivo «Nuevo» del catálogo (22-nov-2026, decisión de Daniel).
//
// 🔑 LA REGLA: un artículo es «Nuevo» si la PRIMERA llegada de su código exacto
// de Switch (código con color = `sku` del catálogo) cae en los últimos 30 días
// de Panamá (`hoyPanama()`, hoy − 30 inclusive). Una REPOSICIÓN de un código que
// ya había llegado antes NO es nuevo. Fuente: `switch_ingresos_mercancia`
// (historia desde 2022).
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

/** PURO: los códigos cuya PRIMERA llegada (fecha mínima) es ≥ hoy − 30. */
export function codigosNuevos(filas: FilaIngreso[], hoy: string): Set<string> {
  const primera = new Map<string, string>();
  for (const f of filas) {
    const c = f.codigo_articulo?.trim();
    if (!c) continue;
    const prev = primera.get(c);
    if (!prev || f.fecha < prev) primera.set(c, f.fecha);
  }
  const desde = desdeNuevo(hoy);
  return new Set(Array.from(primera).filter(([, f]) => f >= desde).map(([c]) => c));
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

/** Lectura: lo llegado en la ventana y, de esos códigos, lo llegado ANTES
 *  (reposiciones). Lanza si algo falla — así nunca se cachea un error. */
async function leerNuevos(empresaKey: string): Promise<string[]> {
  const { supabaseServer: db } = await import("@/lib/supabase-server");
  const hoy = hoyPanama();
  const desde = desdeNuevo(hoy);
  const recientes = await leerTodoPaginado<FilaIngreso>(
    `switch_ingresos_mercancia (nuevos ${empresaKey})`,
    (pedirCount, a, b) =>
      db.from("switch_ingresos_mercancia")
        .select("codigo_articulo,fecha", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresaKey)
        .gte("fecha", desde)
        .order("n_interno").order("linea")
        .range(a, b),
  );
  const codigos = Array.from(new Set(recientes.map((f) => f.codigo_articulo).filter((c): c is string => !!c)));
  if (codigos.length === 0) return [];
  // ponytail: un solo `.in` — hoy ~60 códigos por empresa en 30 días; partir en
  // tandas si algún día pasa de unos cientos (largo de la URL).
  const anteriores = await leerTodoPaginado<FilaIngreso>(
    `switch_ingresos_mercancia (reposiciones ${empresaKey})`,
    (pedirCount, a, b) =>
      db.from("switch_ingresos_mercancia")
        .select("codigo_articulo,fecha", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresaKey)
        .in("codigo_articulo", codigos)
        .lt("fecha", desde)
        .order("n_interno").order("linea")
        .range(a, b),
  );
  return Array.from(codigosNuevos([...recientes, ...anteriores], hoy));
}

/** Cacheado 1 h por empresa (los ingresos llegan una vez al día). */
const leerNuevosCacheado = (empresaKey: string) =>
  unstable_cache(async (_e: string) => leerNuevos(_e), ["catalogo-nuevos"], { revalidate: 3600 })(empresaKey);

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
