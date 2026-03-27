import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { userId, userName, action, module, details } = await req.json();

  const { error } = await supabaseServer.from("fg_audit_log").insert({
    user_id: userId || null,
    user_name: userName || null,
    action,
    module: module || null,
    details: details || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
