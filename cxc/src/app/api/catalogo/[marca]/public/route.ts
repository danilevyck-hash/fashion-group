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
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { ErrorCatalogo, leerCatalogoPublico, type PayloadPublico } from "@/lib/catalogo/catalogo-publico-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// OJO: NO volver a poner `fetchCache = "force-no-store"` aquí. Next lo trata
// como bypass TOTAL de `unstable_cache` (unstable-cache.js comprueba
// `store.fetchCache !== "force-no-store"` antes de leer la entrada): la caché
// quedaría escrita pero jamás leída. Lo que ese flag protegía —que las lecturas
// de Supabase no salgan del Data Cache— hoy lo garantizan dos cosas: los
// clients de marca inyectan `cache: "no-store"` en cada fetch, y Next corre el
// callback de `unstable_cache` ya forzado a `force-no-store`.
//
// La lectura vive en `lib/catalogo/catalogo-publico-server.ts` (la comparte la
// página pública, que llega con los productos puestos).

/** Nada de caché en browser/CDN: la caché vive en el server, donde SÍ se puede
 *  invalidar con certeza. */
const HEADERS_NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
};

export async function GET(_req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  let payload: PayloadPublico;
  try {
    payload = await leerCatalogoPublico(cfg);
  } catch (err) {
    if (!(err instanceof ErrorCatalogo)) console.error(err);
    const msg = err instanceof ErrorCatalogo ? err.message : "Error al cargar productos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json(payload, { headers: HEADERS_NO_STORE });
}
