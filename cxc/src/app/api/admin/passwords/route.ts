import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("role_passwords")
    .select("role, password, updated_at");

  if (error && error.code === "42P01") return NextResponse.json([]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const { role, password } = await req.json();
  if (!role || !password) return NextResponse.json({ error: "Role y password requeridos" }, { status: 400 });

  const { error } = await supabaseServer
    .from("role_passwords")
    .upsert({ role, password, updated_at: new Date().toISOString() }, { onConflict: "role" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
