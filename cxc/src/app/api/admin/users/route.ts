import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { data: users, error } = await supabaseServer
    .from("fg_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  // Modules now come from role_permissions, not fg_user_modules
  const result = (users || []).map((u) => ({ ...u }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { name, password, role, associated_company } = await req.json();
  if (!name || !password) return NextResponse.json({ error: "name and password required" }, { status: 400 });

  const { data: user, error } = await supabaseServer
    .from("fg_users")
    .insert({ name, password, role: role || "vendedor", associated_company: associated_company || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });

  // Modules are now inherited from role — no per-user module assignment
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, name, password, role, associated_company } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (password !== undefined) update.password = password;
  if (role !== undefined) update.role = role;
  if (associated_company !== undefined) update.associated_company = associated_company;

  const { error } = await supabaseServer.from("fg_users").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

  // Modules are now inherited from role — no per-user module assignment
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, active } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("fg_users")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
