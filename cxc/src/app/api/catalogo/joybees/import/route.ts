import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface ImportRow {
  sku: string;
  name: string;
  price: number;
  stock: number;
  gender: string;
  badge?: string;
  category?: string;
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const supabase = getSupabase();

  try {
    const body = await req.json();
    const rows: ImportRow[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 });
    }

    // Validate rows
    for (const row of rows) {
      if (!row.sku || typeof row.sku !== "string") {
        return NextResponse.json({ error: "Fila invalida: SKU requerido" }, { status: 400 });
      }
    }

    // Get all existing products
    const { data: existing, error: fetchErr } = await supabase
      .from("joybees_products")
      .select("sku, id");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const existingSkus = new Set((existing || []).map((p) => p.sku));
    const importedSkus = new Set(rows.map((r) => r.sku));

    // Products to upsert (update existing + create new)
    const upsertRows = rows.map((r) => {
      const badgeValue = r.badge === "nuevo" || r.badge === "oferta" ? r.badge : null;
      return {
        sku: r.sku,
        name: r.name,
        price: r.price ?? 0,
        stock: r.stock ?? 0,
        gender: r.gender || "unisex",
        category: r.category || "clogs",
        active: (r.stock ?? 0) > 0,
        badge: badgeValue,
      };
    });

    // Products missing from import -> set stock to 0
    const missingSkus = (existing || []).filter((p) => !importedSkus.has(p.sku));

    // Upsert imported rows
    let updated = 0;
    let created = 0;
    let zeroed = 0;

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("joybees_products")
        .upsert(upsertRows, { onConflict: "sku" });

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }

      for (const r of rows) {
        if (existingSkus.has(r.sku)) updated++;
        else created++;
      }
    }

    // Zero out missing products
    if (missingSkus.length > 0) {
      const { error: zeroErr } = await supabase
        .from("joybees_products")
        .update({ stock: 0, active: false })
        .in(
          "id",
          missingSkus.map((p) => p.id)
        );

      if (zeroErr) {
        return NextResponse.json({ error: zeroErr.message }, { status: 500 });
      }

      zeroed = missingSkus.length;
    }

    return NextResponse.json({
      success: true,
      updated,
      created,
      zeroed,
      total: rows.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Error al procesar importacion" }, { status: 500 });
  }
}
