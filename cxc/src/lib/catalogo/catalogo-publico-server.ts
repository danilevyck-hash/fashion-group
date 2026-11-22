// ─────────────────────────────────────────────────────────────────────────────
// La lectura del catálogo PÚBLICO, en UN lugar (velocidad-2026-11): la usan la
// ruta `/api/catalogo/<marca>/public` y la PÁGINA pública, que ahora llega con
// los productos puestos desde el servidor en vez de pedirlos después. Mismo
// paquete, misma caché (`catalogo:<marca>`), mismas reglas: se movió, no cambió.
// ─────────────────────────────────────────────────────────────────────────────

import { bultoEnRenglon, productoConBulto } from "@/lib/catalogo/bulto-renglon-reebok";
import { leerConColumnaOpcional } from "@/lib/catalogo/cols-opcionales";
import { unstable_cache } from "next/cache";
import type { MarcaConfig } from "@/lib/catalogo/marcas";
import { paquetePublico } from "@/lib/catalogo/publico-payload";
import { catalogoTag, CATALOGO_PUBLICO_TTL_SEGUNDOS } from "@/lib/catalogo/cache";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

/** Error cuyo `message` es EXACTAMENTE el texto que devuelve el endpoint. */
export class ErrorCatalogo extends Error {}

export type PayloadPublico = ReturnType<typeof paquetePublico>;

/** Lectura VIVA del catálogo — es lo que se cachea. Lanza en vez de devolver un
 *  payload a medias, así un fallo de Supabase nunca queda cacheado. */
async function leerCatalogo(cfg: MarcaConfig): Promise<PayloadPublico> {
  const supabase = await cfg.publicCatalog.db();
  if (!supabase) throw new ErrorCatalogo("Not configured");

  if (cfg.publicCatalog.conInventario) {
    // ⚠️ PAGINADO (26-jul-2026): las dos lecturas se cortaban en 1.000 filas sin
    // error. `inventory` es una fila POR PRODUCTO Y TALLA, así que es la primera
    // en pasarse — y truncarla es el peor síntoma de todos: el producto sí
    // aparece en la tienda pero sin ninguna talla, o sea **Agotado** a la vista
    // del cliente. Encima el resultado se guarda en `unstable_cache`, así que la
    // versión truncada quedaba servida hasta la próxima invalidación.
    // El orden de NEGOCIO se conserva intacto y se le agrega `id` como
    // desempate: paginar exige un orden único (con filas empatadas, PostgREST
    // puede repetir o saltear entre páginas), pero cambiar la columna de orden
    // cambiaría el orden en que el cliente ve los productos. Compuesto = las dos
    // cosas.
    // `bulto_pzas` (Tommy) puede no existir todavía — migración 20260806120000,
    // que corre Daniel a mano. Sin este respaldo el catálogo PÚBLICO entero no
    // carga hasta que la corra.
    const products = await leerConColumnaOpcional(cfg.publicCatalog.cols, "bulto_pzas", (cols) =>
      leerTodoPaginado<unknown>(
      `${cfg.productsTable} (catálogo público ${cfg.marca})`,
      (pedirCount, desde, hasta) =>
        supabase
          .from(cfg.productsTable)
          .select(cols, pedirCount ? { count: "exact" } : {})
          .eq("active", true)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(desde, hasta),
    ));

    const inventory = await leerTodoPaginado<unknown>(
      `inventory (catálogo público ${cfg.marca})`,
      (pedirCount, desde, hasta) =>
        supabase
          .from("inventory")
          .select("product_id,size,quantity", pedirCount ? { count: "exact" } : {})
          .order("size")
          .order("id", { ascending: true })
          .range(desde, hasta),
    );

    // 🔴 LO QUE SALE AL NAVEGADOR SE RESUELVE ACÁ (7-sep-2026). `existencia` y
    // `stock` se LEEN (hacen falta para el fallback cuando el sync todavía no
    // escribió `disponibilidad`) pero NO viajan, y el inventario se acota a los
    // productos de este mismo paquete — Reebok mandaba las 391 filas, 159 de
    // ellas de productos apagados. Regla única en `lib/catalogo/publico-payload`.
    return paquetePublico(
      products as Record<string, unknown>[],
      inventory as Record<string, unknown>[],
    );
  }

  // Columnas explícitas (no select("*")): endpoint público — blinda contra
  // fugas si se agregan columnas internas (ej. costo). Son exactamente los
  // campos que consume la página pública (incl. stock e is_regalia).
  // Paginado con el mismo criterio: orden de negocio (category, name) + `id`
  // como desempate único para que la paginación no pierda ni repita filas.
  const products = await leerConColumnaOpcional(cfg.publicCatalog.cols, "bulto_pzas", (cols) =>
    leerTodoPaginado<unknown>(
    `${cfg.productsTable} (catálogo público ${cfg.marca})`,
    (pedirCount, desde, hasta) =>
      supabase
        .from(cfg.productsTable)
        .select(cols, pedirCount ? { count: "exact" } : {})
        .eq("active", true)
        .order("category")
        .order("name")
        .order("id", { ascending: true })
        .range(desde, hasta),
  ));

  return paquetePublico(products as Record<string, unknown>[]);
}

/** La misma lectura, cacheada bajo la tag de la marca. `marca` viaja como
 *  ARGUMENTO (no solo en keyParts) para que la key sea distinta por marca. */
function leerCatalogoCacheado(cfg: MarcaConfig): Promise<PayloadPublico> {
  return unstable_cache(
    async (_marca: string) => leerCatalogo(cfg),
    ["catalogo-publico"],
    { tags: [catalogoTag(cfg.marca)], revalidate: CATALOGO_PUBLICO_TTL_SEGUNDOS },
  )(cfg.marca);
}

/** El paquete que ve el cliente: el cacheado, más el bulto de HOY de Reebok
 *  (fuera del caché para que entre apenas exista la columna). Lanza. */
export async function leerCatalogoPublico(cfg: MarcaConfig): Promise<PayloadPublico> {
  let payload = await leerCatalogoCacheado(cfg);
  if (cfg.marca === "reebok" && (await bultoEnRenglon(cfg))) {
    payload = { ...payload, products: payload.products.map((p) => productoConBulto(p as { category?: string | null }, true)) } as PayloadPublico;
  }
  // 🔴 El dato «llegó en los últimos 30 días» NO viaja al cliente (Daniel,
  // 22-nov-2026: «que el cliente no lo sepa»). Solo el catálogo interno.
  return payload;
}
