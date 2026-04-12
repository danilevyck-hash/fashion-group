import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();

  const { data: products, error } = await supabase
    .from("joybees_products")
    .select("*")
    .eq("active", true)
    .order("category")
    .order("name");

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error al cargar productos" }, { status: 500 });
  }

  return NextResponse.json({ products: products || [] });
}
