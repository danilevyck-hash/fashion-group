import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from("role_passwords")
    .select("role, password, updated_at");

  if (error && error.code === "42P01") return NextResponse.json([]);
  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });
  // Never return raw passwords — only return whether set and last update
  const safe = (data || []).map(r => ({
    role: r.role,
    has_password: !!r.password,
    is_hashed: r.password?.startsWith("$2"),
    updated_at: r.updated_at,
  }));
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { role, password } = await req.json();
  if (!role || !password) return NextResponse.json({ error: "Role y password requeridos" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });

  const bcrypt = (await import("bcryptjs")).default;
  const hashed = await bcrypt.hash(password, 10);

  const { error } = await supabaseServer
    .from("role_passwords")
    .upsert({ role, password: hashed, updated_at: new Date().toISOString() }, { onConflict: "role" });

  if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
