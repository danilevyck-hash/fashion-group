import { NextResponse } from "next/server";
import { supabase } from "@/components/reebok/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (pErr) {
    console.error(pErr);
    return NextResponse.json(
      { error: "Error al cargar productos" },
      { status: 500 }
    );
  }

  const { data: inventory, error: iErr } = await supabase
    .from("inventory")
    .select("product_id,size,quantity")
    .order("size");

  if (iErr) {
    console.error(iErr);
    return NextResponse.json(
      { error: "Error al cargar inventario" },
      { status: 500 }
    );
  }

  return NextResponse.json({ products: products || [], inventory: inventory || [] });
}
