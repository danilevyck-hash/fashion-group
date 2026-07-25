// Catálogo PÚBLICO (sin login) por marca. Reebok responde {products,
// inventory} (stock por talla en tabla aparte); Joybees {products} (stock en
// la fila) con headers no-store explícitos — shapes heredados que consumen las
// páginas públicas de cada marca.
//
// CACHÉ (diseño completo en lib/catalogo/cache.ts): la LECTURA de Supabase va
// envuelta en `unstable_cache` con la tag `catalogo:<marca>` y un TTL de
// respaldo de 10 min. La respuesta HTTP sigue saliendo `no-store` al browser y
// al CDN: lo único cacheado es el round-trip a Supabase, del lado del server, y
// se invalida con `revalidateTag` desde CADA write path del catálogo (sync,
// fotos, oculto_manual, precios, import). Así el cliente nunca ve catálogo
// viejo — que es justo lo que rompió en #244 y #253.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import { catalogoTag, CATALOGO_PUBLICO_TTL_SEGUNDOS } from "@/lib/catalogo/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// OJO: NO volver a poner `fetchCache = "force-no-store"` aquí. Next lo trata
// como bypass TOTAL de `unstable_cache` (unstable-cache.js comprueba
// `store.fetchCache !== "force-no-store"` antes de leer la entrada): la caché
// quedaría escrita pero jamás leída. Lo que ese flag protegía —que las lecturas
// de Supabase no salgan del Data Cache— hoy lo garantizan dos cosas: los
// clients de marca inyectan `cache: "no-store"` en cada fetch, y Next corre el
// callback de `unstable_cache` ya forzado a `force-no-store`.

/** Error cuyo `message` es EXACTAMENTE el texto que devuelve el endpoint. */
class ErrorCatalogo extends Error {}

/** Nada de caché en browser/CDN: la caché vive en el server, donde SÍ se puede
 *  invalidar con certeza. */
const HEADERS_NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
};

interface PayloadPublico {
  products: unknown[];
  inventory?: unknown[];
}

/** Lectura VIVA del catálogo — es lo que se cachea. Lanza en vez de devolver un
 *  payload a medias, así un fallo de Supabase nunca queda cacheado. */
async function leerCatalogo(cfg: MarcaConfig): Promise<PayloadPublico> {
  const supabase = await cfg.publicCatalog.db();
  if (!supabase) throw new ErrorCatalogo("Not configured");

  if (cfg.publicCatalog.conInventario) {
    // Columnas explícitas (no select("*")): catálogo público — blinda contra
    // fugas de columnas futuras agregadas a products.
    const { data: products, error: pErr } = await supabase
      .from(cfg.productsTable)
      .select(cfg.publicCatalog.cols)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (pErr) {
      console.error(pErr);
      throw new ErrorCatalogo("Error al cargar productos");
    }

    const { data: inventory, error: iErr } = await supabase
      .from("inventory")
      .select("product_id,size,quantity")
      .order("size");

    if (iErr) {
      console.error(iErr);
      throw new ErrorCatalogo("Error al cargar inventario");
    }

    return { products: products || [], inventory: inventory || [] };
  }

  // Columnas explícitas (no select("*")): endpoint público — blinda contra
  // fugas si se agregan columnas internas (ej. costo). Son exactamente los
  // campos que consume la página pública (incl. stock e is_regalia).
  const { data: products, error } = await supabase
    .from(cfg.productsTable)
    .select(cfg.publicCatalog.cols)
    .eq("active", true)
    .order("category")
    .order("name");

  if (error) {
    console.error(error);
    throw new ErrorCatalogo("Error al cargar productos");
  }

  return { products: products || [] };
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

export async function GET(_req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  let payload: PayloadPublico;
  try {
    payload = await leerCatalogoCacheado(cfg);
  } catch (err) {
    if (!(err instanceof ErrorCatalogo)) console.error(err);
    const msg = err instanceof ErrorCatalogo ? err.message : "Error al cargar productos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json(payload, { headers: HEADERS_NO_STORE });
}
