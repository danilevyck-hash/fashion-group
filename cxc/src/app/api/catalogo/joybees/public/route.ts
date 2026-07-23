import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js): el
// catálogo debe reflejar al instante el sync y el toggle "Ocultar del catálogo".
export const fetchCache = "force-no-store";
export const revalidate = 0;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();

  // Columnas explícitas (no select("*")): endpoint público — blinda contra
  // fugas si se agregan columnas internas (ej. costo) a joybees_products.
  // Mismo criterio que reebok/public|products. Son exactamente los campos que
  // consume la página pública (incl. stock e is_regalia para disponibilidad).
  const { data: products, error } = await supabase
    .from("joybees_products")
    .select(
      "id,sku,name,category,gender,price,stock,image_url,active,popular,is_regalia,badge",
    )
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
