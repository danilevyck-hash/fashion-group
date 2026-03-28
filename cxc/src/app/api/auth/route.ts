import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function setSessionCookie(res: NextResponse, payload: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64");
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

function isHash(s: string): boolean {
  return s.startsWith("$2a$") || s.startsWith("$2b$");
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  // 1. Check fg_users table (supports both hashed and plaintext during migration)
  try {
    const { data: users } = await supabaseServer
      .from("fg_users")
      .select("id, name, role, password, active")
      .eq("active", true);

    if (users) {
      for (const user of users) {
        const match = isHash(user.password)
          ? await bcrypt.compare(password, user.password)
          : password === user.password;

        if (match) {
          const { data: mods } = await supabaseServer
            .from("fg_user_modules")
            .select("module_key")
            .eq("user_id", user.id)
            .eq("enabled", true);

          const modules = (mods || []).map((m: { module_key: string }) => m.module_key);

          const payload = {
            authenticated: true,
            role: user.role,
            userId: user.id,
            userName: user.name,
            modules,
          };

          const res = NextResponse.json(payload);
          setSessionCookie(res, { role: user.role, userId: user.id, userName: user.name, modules });
          return res;
        }
      }
    }
  } catch {
    // fg_users table may not exist yet — continue to legacy
  }

  // 2. Legacy: Check role_passwords table (supports both hashed and plaintext)
  let role: string | null = null;
  try {
    const { data: rows } = await supabaseServer
      .from("role_passwords")
      .select("role, password");

    if (rows) {
      for (const row of rows) {
        const match = isHash(row.password)
          ? await bcrypt.compare(password, row.password)
          : password === row.password;

        if (match) {
          role = row.role;
          break;
        }
      }
    }
  } catch { /* */ }

  // 3. Legacy: Fall back to env vars (always plaintext)
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

  const res = NextResponse.json({ role });
  setSessionCookie(res, { role });
  return res;
}

// DELETE — logout (clear cookie)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
