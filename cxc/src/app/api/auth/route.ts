import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  // 1. Check fg_users table first (new system)
  try {
    const { data: user } = await supabaseServer
      .from("fg_users")
      .select("id, name, role, active")
      .eq("password", password)
      .eq("active", true)
      .single();

    if (user) {
      // Get enabled modules
      const { data: mods } = await supabaseServer
        .from("fg_user_modules")
        .select("module_key")
        .eq("user_id", user.id)
        .eq("enabled", true);

      const modules = (mods || []).map((m: { module_key: string }) => m.module_key);

      return NextResponse.json({
        authenticated: true,
        role: user.role,
        userId: user.id,
        userName: user.name,
        modules,
      });
    }
  } catch {
    // fg_users table may not exist yet — continue to legacy
  }

  // 2. Legacy: Check role_passwords table
  let role: string | null = null;
  try {
    const { data } = await supabaseServer
      .from("role_passwords")
      .select("role")
      .eq("password", password)
      .single();
    if (data) role = data.role;
  } catch { /* */ }

  // 3. Legacy: Fall back to env vars
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

  // 4. Check if legacy role is active
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
