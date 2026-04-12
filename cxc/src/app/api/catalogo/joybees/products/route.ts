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

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);

  let query = supabase
    .from("joybees_products")
    .select("*")
    .order("created_at", { ascending: false });

  if (searchParams.get("active") === "true") query = query.eq("active", true);
  if (searchParams.get("category")) query = query.eq("category", searchParams.get("category"));
  if (searchParams.get("gender")) query = query.eq("gender", searchParams.get("gender"));

  const searchQ = searchParams.get("search");
  if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const supabase = getSupabase();
  const body = await req.json();

  if (!body.name || !body.sku) {
    return NextResponse.json({ error: "Nombre y SKU son requeridos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("joybees_products")
    .upsert(body, { onConflict: "sku" })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
