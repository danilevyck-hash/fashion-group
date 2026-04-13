import { NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!reebokServer) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { data: products, error: pErr } = await reebokServer
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

  const { data: inventory, error: iErr } = await reebokServer
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
