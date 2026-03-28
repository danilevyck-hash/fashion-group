import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const session = getSession(req)!;
  const { action, module, details } = await req.json();

  const { error } = await supabaseServer.from("fg_audit_log").insert({
    user_id: session.userId || null,
    user_name: session.userName || null,
    action,
    module: module || null,
    details: details || null,
  });

  if (error) return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
