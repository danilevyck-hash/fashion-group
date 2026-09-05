import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { action, module, details } = await req.json();
  if (!action || !module) {
    return NextResponse.json({ error: "action y module requeridos" }, { status: 400 });
  }

  // 🩸 Esquema REAL de activity_logs: user_role, action, entity_type,
  // entity_id, details (ver logActivity en src/lib/log-activity.ts, que sí
  // escribe en producción). Este insert usaba columnas `user_name` y `module`
  // que la tabla no tiene, así que fallaba en silencio — nunca se notó porque
  // logActivityClient no tenía callers hasta el 4-sep-2026 (las descargas de
  // Tallas y Fotos a mi Excel del Depurador).
  const merged = {
    ...(details && typeof details === "object" ? details : {}),
    ...(session.userName ? { user_name: session.userName } : {}),
  };
  const { error } = await supabaseServer.from("activity_logs").insert({
    user_role: session.role,
    action,
    entity_type: module,
    details: Object.keys(merged).length > 0 ? JSON.stringify(merged) : null,
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

  if (module) query = query.eq("entity_type", module);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to + "T23:59:59");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });
  return NextResponse.json(data || []);
}
