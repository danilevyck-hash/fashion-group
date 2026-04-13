import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/components/reebok/supabase";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  // Fetch all products with their inventory
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, sku, name, price, gender")
    .order("name");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: inventory, error: iErr } = await supabase
    .from("inventory")
    .select("product_id, quantity");

  if (iErr) {
    return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  // Sum quantities per product
  const stockMap = new Map<string, number>();
  for (const inv of inventory || []) {
    stockMap.set(inv.product_id, (stockMap.get(inv.product_id) || 0) + inv.quantity);
  }

  const rows = (products || []).map((p) => ({
    sku: p.sku || "",
    name: p.name,
    price: p.price || 0,
    quantity: stockMap.get(p.id) || 0,
    gender: p.gender || "",
  }));

  return NextResponse.json(rows);
}
