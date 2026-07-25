// ─────────────────────────────────────────────────────────────────────────────
// Caché del catálogo PÚBLICO por marca — tag + invalidación explícita.
//
// POR QUÉ `unstable_cache` + `revalidateTag` (y no `revalidatePath` ni caché de
// CDN):
//   · El endpoint público lee con supabase-js, no con `fetch()` etiquetable, así
//     que el Data Cache de Next no puede etiquetarse solo. `unstable_cache`
//     envuelve la LECTURA COMPLETA y le pone la tag `catalogo:<marca>`.
//   · `revalidateTag("catalogo:tommy")` invalida esa entrada — y SOLO esa — desde
//     cualquier route handler (cron, sync-now, admin). `revalidatePath` sobre una
//     ruta dinámica exige el parámetro `type` y no cubre el fetch que hace el
//     browser contra el API; la tag sí, porque vive del lado del server.
//   · La caché de CDN queda DESCARTADA a propósito: no se puede invalidar con
//     certeza desde un cron, y el histórico (#244 y #253) es justamente servir
//     catálogo viejo. La respuesta sigue saliendo con `no-store` al browser: lo
//     que se cachea es la CONSULTA a Supabase, no la respuesta HTTP.
//
// CINTURÓN DE SEGURIDAD (TTL): además de la invalidación por evento, la entrada
// expira sola a los 10 min. Si algún día se agrega un write path y se olvida
// invalidarlo, lo viejo dura como MUCHO 10 minutos en vez de para siempre. 10
// min es el punto medio: el catálogo cambia ~2 veces al día (crons de sync) más
// ediciones puntuales de fotos —todas cubiertas por invalidación explícita—, y
// 10 min siguen absorbiendo el pico típico (un link de WhatsApp que abren 50
// personas seguidas) con UNA sola consulta a Supabase.
//
// GARANTÍA DE FRESCURA AL REGENERAR: Next corre el callback de `unstable_cache`
// con `fetchCache: "force-no-store"`, así que las lecturas de Supabase de
// adentro NUNCA salen del Data Cache — cuando la entrada se regenera, se
// regenera con datos vivos.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import type { MarcaKey } from "@/lib/catalogo/marcas";

/** TTL de respaldo de la entrada cacheada, en segundos (ver nota de cabecera). */
export const CATALOGO_PUBLICO_TTL_SEGUNDOS = 600;

/** Tag de caché del catálogo público de una marca. */
export function catalogoTag(marca: MarcaKey | string): string {
  return `catalogo:${marca}`;
}

/**
 * Invalida el catálogo público de UNA marca. Se llama desde TODOS los puntos que
 * escriben algo que el público ve (sync, fotos, visibilidad, precios, import).
 *
 * NUNCA rompe la escritura que la llamó: `revalidateTag` exige el store de Next
 * (route handler / server action) y revienta fuera de él —tests unitarios,
 * scripts—, así que el fallo se traga. El TTL es la red debajo.
 */
export function invalidarCatalogoPublico(marca: MarcaKey | string): void {
  try {
    revalidateTag(catalogoTag(marca));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fuera del runtime de Next (vitest, scripts) no hay store: no es un error
    // real, solo significa "aquí no hay caché que invalidar".
    if (!msg.includes("static generation store missing")) {
      console.error(`[catalogo-cache] no pude invalidar ${catalogoTag(marca)}: ${msg}`);
    }
  }
}
