import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

const ALL_ROLES = ["admin", "secretaria", "director", "contabilidad", "bodega", "vendedor"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ALL_ROLES);
  if (auth instanceof NextResponse) return auth;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ module_order: [] });

  const { data } = await supabaseServer
    .from("fg_user_module_order")
    .select("module_order")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({ module_order: data?.module_order || [] });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ALL_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { userId, moduleOrder } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("fg_user_module_order")
    .upsert({ user_id: userId, module_order: moduleOrder || [] }, { onConflict: "user_id" });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
