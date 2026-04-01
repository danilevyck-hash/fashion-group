import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

// GET — list active sessions
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from("user_sessions")
    .select("id, user_name, user_role, ip_address, last_seen, created_at, revoked")
    .order("last_seen", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// DELETE — revoke session(s)
export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { sessionId, userName } = await req.json();

  if (userName) {
    // Revoke ALL sessions for a user
    const { error } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("user_name", userName)
      .eq("revoked", false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "revoked_all", userName });
  }

  if (sessionId) {
    // Revoke single session
    const { error } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("id", sessionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "revoked", sessionId });
  }

  return NextResponse.json({ error: "sessionId o userName requerido" }, { status: 400 });
}
