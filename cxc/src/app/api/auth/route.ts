import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  // 1. Check Supabase role_passwords table first
  let role: string | null = null;
  try {
    const { data } = await supabaseServer
      .from("role_passwords")
      .select("role")
      .eq("password", password)
      .single();
    if (data) role = data.role;
  } catch {
    // Table may not exist — continue to env vars
  }

  // 2. Fall back to env vars if not found in DB
  if (!role) {
    const envRoles: Record<string, string> = {};
    if (process.env.ADMIN_PASSWORD) envRoles[process.env.ADMIN_PASSWORD] = "admin";
    if (process.env.DIRECTOR_PASSWORD) envRoles[process.env.DIRECTOR_PASSWORD] = "director";
    if (process.env.DAVID_PASSWORD) envRoles[process.env.DAVID_PASSWORD] = "david";
    if (process.env.UPLOAD_PASSWORD) envRoles[process.env.UPLOAD_PASSWORD] = "upload";
    if (process.env.CONTABILIDAD_PASSWORD) envRoles[process.env.CONTABILIDAD_PASSWORD] = "contabilidad";
    if (process.env.VENDEDOR_PASSWORD) envRoles[process.env.VENDEDOR_PASSWORD] = "vendedor";
    if (process.env.CLIENTE_PASSWORD) envRoles[process.env.CLIENTE_PASSWORD] = "cliente";
    role = envRoles[password] || null;
  }

  if (!role) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  // 3. Check if role is active
  try {
    const { data } = await supabaseServer
      .from("role_permissions")
      .select("activo")
      .eq("role", role)
      .single();
    if (data && data.activo === false) {
      return NextResponse.json({ error: "Este acceso ha sido desactivado" }, { status: 403 });
    }
  } catch { /* */ }

  return NextResponse.json({ role });
}
