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
  // Optional — only honored for active_wear. Ignored for active_shoes.
  category?: string;
}

// Category filters for each company
const COMPANY_CATEGORIES: Record<string, string[]> = {
  active_shoes: ["footwear"],
  active_wear: ["apparel", "accessories"],
};

const VALID_WEAR_CATEGORIES = new Set(["apparel", "accessories"]);

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
      .select("id, sku, name, price, gender, category, badge, active");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Only scope to the company's categories
    const companyCategories = company ? COMPANY_CATEGORIES[company] : null;
    const existing = (allExisting || []).filter((p) => {
      if (!companyCategories) return true;
      return companyCategories.includes(p.category);
    });

    const existingBySku = new Map<string, { id: string; sku: string; name: string; price: number; gender: string | null; category: string; badge: string | null; active: boolean }>();
    for (const p of existing) {
      if (p.sku) existingBySku.set(p.sku, p);
    }

    const incomingSkus = new Set(incoming.map((p) => p.sku));

    let updated = 0;
    let created = 0;
    let deactivated = 0;
    let reactivated = 0;
    // SKUs of products NUEVOS that entered with the default category because the
    // CSV did not provide a recognized Categoria. Only meaningful for active_wear.
    const unclassifiedNew: string[] = [];

    // Determine default category for new products
    const defaultCategory = companyCategories ? companyCategories[0] : "footwear";

    // Update or create products from file
    for (const item of incoming) {
      const exist = existingBySku.get(item.sku);
      const badgeValue =
        item.badge === "nuevo" || item.badge === "oferta" || item.badge === "proximamente"
          ? item.badge
          : null;
      // Pre-order items stay active even without stock so they appear in the catalog.
      const shouldBeActive = item.quantity > 0 || badgeValue === "proximamente";

      // Category from CSV only applies to active_wear. For active_shoes it is ignored.
      const itemCategoryForWear =
        company === "active_wear" && item.category && VALID_WEAR_CATEGORIES.has(item.category)
          ? item.category
          : null;

      if (exist) {
        // Update product fields — active follows stock.
        // Only touch category when the CSV brings a valid one (preserves manual edits otherwise).
        const updatePayload: Record<string, unknown> = {
          name: item.name,
          price: item.price,
          gender: item.gender || null,
          badge: badgeValue,
          active: shouldBeActive,
        };
        if (itemCategoryForWear) {
          updatePayload.category = itemCategoryForWear;
        }

        await reebokServer
          .from("products")
          .update(updatePayload)
          .eq("id", exist.id);

        // Upsert inventory with size UNICA
        await reebokServer
          .from("inventory")
          .upsert(
            { product_id: exist.id, size: "UNICA", quantity: item.quantity },
            { onConflict: "product_id,size" }
          );

        if (exist.active === false && shouldBeActive) reactivated++;
        else if (exist.active === true && !shouldBeActive) deactivated++;
        else updated++;
      } else {
        // Create new product — active only if it has stock
        const finalCategory = itemCategoryForWear || defaultCategory;
        const { data: newProd } = await reebokServer
          .from("products")
          .insert({
            sku: item.sku,
            name: item.name,
            price: item.price,
            gender: item.gender || null,
            category: finalCategory,
            active: shouldBeActive,
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

        // Track new wear products that fell back to default category.
        if (company === "active_wear" && !itemCategoryForWear) {
          unclassifiedNew.push(item.sku);
        }

        created++;
      }
    }

    // Soft-delete products NOT in file — only within the company's scope, only if currently active
    for (const [sku, prod] of existingBySku) {
      if (!incomingSkus.has(sku) && prod.active) {
        await reebokServer
          .from("products")
          .update({ active: false })
          .eq("id", prod.id);

        await reebokServer
          .from("inventory")
          .upsert(
            { product_id: prod.id, size: "UNICA", quantity: 0 },
            { onConflict: "product_id,size" }
          );
        deactivated++;
      }
    }

    return NextResponse.json({ updated, created, deactivated, reactivated, unclassifiedNew });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Error al importar" }, { status: 500 });
  }
}
