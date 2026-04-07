import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Rate limiting: max 5 attempts per IP per minute
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function setSessionCookie(res: NextResponse, payload: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
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
  // Rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera un minuto." }, { status: 429 });
  }

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
          // Modules come from the role, not the individual user
          let modules: string[] = [];
          try {
            const { data: rolePerm } = await supabaseServer
              .from("role_permissions")
              .select("modulos")
              .eq("role", user.role)
              .single();
            if (rolePerm?.modulos) modules = rolePerm.modulos;
          } catch { /* use defaults below if table missing */ }

          // Fallback to hardcoded defaults if no role_permissions entry
          if (modules.length === 0) {
            const ALL = ["cxc","guias","caja","directorio","reclamos","prestamos","ventas","upload","cheques","reebok","camisetas"];
            const DEFAULTS: Record<string, string[]> = {
              admin: ALL, director: ALL,
              contabilidad: ["prestamos","ventas"],
              secretaria: ["upload","guias","caja","reclamos","cheques","directorio"],
              vendedor: ["reebok","cxc","directorio"],
              bodega: ["guias"],
              cliente: ["reebok"],
            };
            modules = DEFAULTS[user.role] || [];
          }

          const payload = {
            authenticated: true,
            role: user.role,
            userId: user.id,
            userName: user.name,
            modules,
          };

          const sessionToken = randomUUID();
          // Create revocable session record
          try {
            await supabaseServer.from("user_sessions").insert({
              user_name: user.name,
              user_role: user.role,
              session_token: sessionToken,
              ip_address: ip,
            });
          } catch { /* table may not exist yet */ }

          const res = NextResponse.json(payload);
          setSessionCookie(res, { role: user.role, userId: user.id, userName: user.name, modules, sessionToken });
          await logActivity(user.role, "login", "auth", { userName: user.name }, user.name);
          return res;
        }
      }
    }
  } catch {
    // fg_users table may not exist yet — continue to role_passwords
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

  // 3. Legacy fallback: env var passwords (for roles without fg_users entries)
  if (!role) {
    const envRoles: Record<string, string> = {};
    if (process.env.ADMIN_PASSWORD) envRoles[process.env.ADMIN_PASSWORD] = "admin";
    if (process.env.DIRECTOR_PASSWORD) envRoles[process.env.DIRECTOR_PASSWORD] = "director";
    if (process.env.UPLOAD_PASSWORD) envRoles[process.env.UPLOAD_PASSWORD] = "secretaria";
    if (process.env.CONTABILIDAD_PASSWORD) envRoles[process.env.CONTABILIDAD_PASSWORD] = "contabilidad";
    role = envRoles[password] || null;
  }

  if (!role) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  // 3. Check if legacy role is active
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

  const sessionToken = randomUUID();
  try {
    await supabaseServer.from("user_sessions").insert({
      user_name: role,
      user_role: role,
      session_token: sessionToken,
      ip_address: ip,
    });
  } catch { /* table may not exist yet */ }

  const res = NextResponse.json({ role });
  setSessionCookie(res, { role, sessionToken });
  await logActivity(role, "login", "auth");
  return res;
}

// DELETE — logout (clear cookie + revoke session)
export async function DELETE(req: NextRequest) {
  // Revoke session in DB
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
      if (parsed.sessionToken) {
        await supabaseServer
          .from("user_sessions")
          .update({ revoked: true })
          .eq("session_token", parsed.sessionToken);
      }
    } catch { /* */ }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
