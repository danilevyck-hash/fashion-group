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
  badge?: string;
}

// Category filters for each company
const COMPANY_CATEGORIES: Record<string, string[]> = {
  active_shoes: ["footwear"],
  active_wear: ["apparel", "accessories"],
};

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const incoming: ImportProduct[] = body.products;
    const company: string | undefined = body.company;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "No se recibieron productos" }, { status: 400 });
    }

    // Load existing products — filter by company categories if provided
    const { data: allExisting, error: fetchErr } = await supabase
      .from("products")
      .select("id, sku, name, price, gender, category, badge");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Only scope to the company's categories
    const companyCategories = company ? COMPANY_CATEGORIES[company] : null;
    const existing = (allExisting || []).filter((p) => {
      if (!companyCategories) return true;
      return companyCategories.includes(p.category);
    });

    const existingBySku = new Map<string, { id: string; sku: string; name: string; price: number; gender: string | null; category: string; badge: string | null }>();
    for (const p of existing) {
      if (p.sku) existingBySku.set(p.sku, p);
    }

    const incomingSkus = new Set(incoming.map((p) => p.sku));

    let updated = 0;
    let created = 0;
    let zeroed = 0;

    // Determine default category for new products
    const defaultCategory = companyCategories ? companyCategories[0] : "footwear";

    // Update or create products from file
    for (const item of incoming) {
      const exist = existingBySku.get(item.sku);
      const badgeValue = item.badge === "nuevo" || item.badge === "oferta" ? item.badge : null;

      if (exist) {
        // Update product fields
        await reebokServer
          .from("products")
          .update({
            name: item.name,
            price: item.price,
            gender: item.gender || null,
            badge: badgeValue,
          })
          .eq("id", exist.id);

        // Upsert inventory with size UNICA
        await reebokServer
          .from("inventory")
          .upsert(
            { product_id: exist.id, size: "UNICA", quantity: item.quantity },
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
            category: defaultCategory,
            active: true,
            on_sale: false,
            badge: badgeValue,
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

    // Zero out products NOT in file — only within the company's scope
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
