import { NextRequest, NextResponse } from 'next/server';
import { reebokServer } from '@/lib/reebok-supabase-server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = "force-dynamic";

const NEW_PRODUCTS = [
  { sku: "100227359", name: "ENERGEN RUN 4", category: "footwear", gender: "female", price: 45, on_sale: false, active: true },
  { sku: "100244539", name: "ENERGEN RUN 4", category: "footwear", gender: "female", price: 45, on_sale: false, active: true },
  { sku: "100250393", name: "FLIP CHARGE", category: "footwear", gender: "female", price: 30, on_sale: false, active: true },
  { sku: "100250396", name: "FLIP CHARGE", category: "footwear", gender: "female", price: 30, on_sale: false, active: true },
  { sku: "100257648", name: "FLIP CHARGE", category: "footwear", gender: "male", price: 30, on_sale: false, active: true },
  { sku: "100257649", name: "FLIP CHARGE", category: "footwear", gender: "male", price: 30, on_sale: false, active: true },
  { sku: "100257651", name: "FLIP CHARGE", category: "footwear", gender: "female", price: 30, on_sale: false, active: true },
  { sku: "100262521", name: "NFX TRAINER 2", category: "footwear", gender: "female", price: 38, on_sale: false, active: true },
  { sku: "100262523", name: "NFX TRAINER 2", category: "footwear", gender: "female", price: 38, on_sale: false, active: true },
  { sku: "100255642", name: "REEBOK BB 1000 CLEAN", category: "footwear", gender: "unisex", price: 34, on_sale: false, active: true },
  { sku: "100255643", name: "REEBOK BB 1000 CLEAN", category: "footwear", gender: "unisex", price: 34, on_sale: false, active: true },
  { sku: "100255644", name: "REEBOK BB 1000 CLEAN", category: "footwear", gender: "unisex", price: 34, on_sale: false, active: true },
  { sku: "100262393", name: "REEBOK MUNDO", category: "footwear", gender: "male", price: 30, on_sale: false, active: true },
  { sku: "100262396", name: "REEBOK MUNDO", category: "footwear", gender: "male", price: 30, on_sale: false, active: true },
  { sku: "100262399", name: "REEBOK MUNDO", category: "footwear", gender: "female", price: 30, on_sale: false, active: true },
  { sku: "100262387", name: "REEBOK RELORA", category: "footwear", gender: "male", price: 34, on_sale: false, active: true },
  { sku: "100262388", name: "REEBOK RELORA", category: "footwear", gender: "male", price: 34, on_sale: false, active: true },
  { sku: "100262515", name: "REEBOK RELORA", category: "footwear", gender: "male", price: 34, on_sale: false, active: true },
  { sku: "100262379", name: "REEBOK VIVA SPEED", category: "footwear", gender: "male", price: 38, on_sale: false, active: true },
  { sku: "100262380", name: "REEBOK VIVA SPEED", category: "footwear", gender: "male", price: 38, on_sale: false, active: true },
  { sku: "100262381", name: "REEBOK VIVA SPEED", category: "footwear", gender: "female", price: 38, on_sale: false, active: true },
  { sku: "100257643", name: "VERSE", category: "footwear", gender: "male", price: 30, on_sale: false, active: true },
  { sku: "100225490", name: "ZIG DYNAMICA 6", category: "footwear", gender: "male", price: 53, on_sale: false, active: true },
  { sku: "100225495", name: "ZIG DYNAMICA 6", category: "footwear", gender: "female", price: 53, on_sale: false, active: true },
  { sku: "100256060", name: "ZIG RISE", category: "footwear", gender: "female", price: 45, on_sale: false, active: true },
];

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (!reebokServer) {
    return NextResponse.json({ error: "Reebok Supabase not configured" }, { status: 500 });
  }

  const results = { created: 0, failed: 0, errors: [] as string[] };

  for (const product of NEW_PRODUCTS) {
    // Check if SKU already exists
    const { data: existing } = await reebokServer
      .from("products")
      .select("id")
      .eq("sku", product.sku)
      .limit(1);

    if (existing && existing.length > 0) {
      results.errors.push(`${product.sku} ya existe`);
      results.failed++;
      continue;
    }

    const { error } = await reebokServer.from("products").insert(product);
    if (error) {
      results.errors.push(`${product.sku}: ${error.message}`);
      results.failed++;
    } else {
      results.created++;
    }
  }

  return NextResponse.json(results);
}
