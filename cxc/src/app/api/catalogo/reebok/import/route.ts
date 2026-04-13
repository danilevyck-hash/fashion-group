import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/components/reebok/supabase";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

interface ImportProduct {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  gender: string;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { products: incoming } = (await req.json()) as { products: ImportProduct[] };

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "No se recibieron productos" }, { status: 400 });
    }

    // Load existing products
    const { data: existing, error: fetchErr } = await supabase
      .from("products")
      .select("id, sku, name, price, gender");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const existingBySku = new Map<string, { id: string; sku: string; name: string; price: number; gender: string | null }>();
    for (const p of existing || []) {
      if (p.sku) existingBySku.set(p.sku, p);
    }

    const incomingSkus = new Set(incoming.map((p) => p.sku));

    let updated = 0;
    let created = 0;
    let zeroed = 0;

    // Update or create products from file
    for (const item of incoming) {
      const existing = existingBySku.get(item.sku);

      if (existing) {
        // Update product fields
        await reebokServer
          .from("products")
          .update({
            name: item.name,
            price: item.price,
            gender: item.gender || null,
          })
          .eq("id", existing.id);

        // Upsert inventory with size UNICA
        await reebokServer
          .from("inventory")
          .upsert(
            { product_id: existing.id, size: "UNICA", quantity: item.quantity },
            { onConflict: "product_id,size" }
          );

        updated++;
      } else {
        // Create new product
        const { data: newProd } = await reebokServer
          .from("products")
          .insert({
            sku: item.sku,
            name: item.name,
            price: item.price,
            gender: item.gender || null,
            category: "calzado",
            active: true,
            on_sale: false,
          })
          .select("id")
          .single();

        if (newProd) {
          await reebokServer
            .from("inventory")
            .insert({ product_id: newProd.id, size: "UNICA", quantity: item.quantity });
        }

        created++;
      }
    }

    // Zero out products NOT in file
    for (const [sku, prod] of existingBySku) {
      if (!incomingSkus.has(sku)) {
        await reebokServer
          .from("inventory")
          .upsert(
            { product_id: prod.id, size: "UNICA", quantity: 0 },
            { onConflict: "product_id,size" }
          );
        zeroed++;
      }
    }

    return NextResponse.json({ updated, created, zeroed });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
