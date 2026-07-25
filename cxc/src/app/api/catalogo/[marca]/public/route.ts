// Catálogo PÚBLICO (sin login) por marca. Reebok responde {products,
// inventory} (stock por talla en tabla aparte); Joybees {products} (stock en
// la fila) con headers no-store explícitos — shapes heredados que consumen las
// páginas públicas de cada marca.

import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js): el
// catálogo debe reflejar al instante el sync y el toggle "Ocultar del catálogo".
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(_req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const supabase = await cfg.publicCatalog.db();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });

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
      return NextResponse.json({ error: "Error al cargar productos" }, { status: 500 });
    }

    const { data: inventory, error: iErr } = await supabase
      .from("inventory")
      .select("product_id,size,quantity")
      .order("size");

    if (iErr) {
      console.error(iErr);
      return NextResponse.json({ error: "Error al cargar inventario" }, { status: 500 });
    }

    return NextResponse.json({ products: products || [], inventory: inventory || [] });
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
    return NextResponse.json({ error: "Error al cargar productos" }, { status: 500 });
  }

  return NextResponse.json(
    { products: products || [] },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "CDN-Cache-Control": "no-store" } }
  );
}
