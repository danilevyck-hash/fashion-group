import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { action, module, details } = await req.json();
  if (!action || !module) {
    return NextResponse.json({ error: "action y module requeridos" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("activity_logs").insert({
    user_role: session.role,
    user_name: session.userName || null,
    action,
    module,
    details: details || null,
  });

  if (error) return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const module = searchParams.get("module");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseServer
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (module) query = query.eq("module", module);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to + "T23:59:59");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });
  return NextResponse.json(data || []);
}
