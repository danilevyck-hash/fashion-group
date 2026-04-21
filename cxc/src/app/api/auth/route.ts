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
      .select("id, name, role, password, active, is_owner")
      .eq("active", true);

    if (users) {
      for (const user of users) {
        const match = isHash(user.password)
          ? (await bcrypt.compare(password, user.password) || await bcrypt.compare(password.toLowerCase(), user.password))
          : password.toLowerCase() === user.password.toLowerCase();

        if (match) {
          // 1. Check per-user module overrides (fg_user_modules)
          let modules: string[] = [];
          try {
            const { data: userMods } = await supabaseServer
              .from("fg_user_modules")
              .select("module_key")
              .eq("user_id", user.id)
              .eq("enabled", true);
            if (userMods && userMods.length > 0) {
              modules = userMods.map((m: { module_key: string }) => m.module_key);
            }
          } catch { /* table may not exist */ }

          // 2. Fall back to role_permissions
          if (modules.length === 0) {
            try {
              const { data: rolePerm } = await supabaseServer
                .from("role_permissions")
                .select("modulos")
                .eq("role", user.role)
                .single();
              if (rolePerm?.modulos) modules = rolePerm.modulos;
            } catch { /* use defaults below if table missing */ }
          }

          // 3. Fallback to hardcoded defaults if no role_permissions entry
          if (modules.length === 0) {
            const ALL = ["cxc","guias","caja","directorio","reclamos","prestamos","ventas","upload","cheques","reebok","camisetas","marketing","packing-lists","catalogos"];
            const DEFAULTS: Record<string, string[]> = {
              admin: ALL, director: ALL,
              contabilidad: ["prestamos","ventas"],
              secretaria: ["upload","guias","caja","reclamos","cheques","directorio","packing-lists","marketing"],
              vendedor: ["catalogos","reebok","cxc","directorio","camisetas","guias"],
              bodega: ["guias","packing-lists"],
              cliente: ["reebok"],
            };
            modules = DEFAULTS[user.role] || [];
          }

          // Per-user config (empresa restrictions, readonly flags)
          const USER_CONFIG: Record<string, { empresaFilter?: string; guiasReadonly?: boolean }> = {
            edwin: { empresaFilter: "vistana", guiasReadonly: true },
          };
          const userConfig = USER_CONFIG[user.name.toLowerCase()] || {};

          const payload = {
            authenticated: true,
            role: user.role,
            userId: user.id,
            userName: user.name,
            modules,
            isOwner: !!user.is_owner,
            ...(userConfig.empresaFilter && { empresaFilter: userConfig.empresaFilter }),
            ...(userConfig.guiasReadonly && { guiasReadonly: true }),
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
          setSessionCookie(res, {
            role: user.role, userId: user.id, userName: user.name, modules, sessionToken,
            isOwner: !!user.is_owner,
            ...(userConfig.empresaFilter && { empresaFilter: userConfig.empresaFilter }),
            ...(userConfig.guiasReadonly && { guiasReadonly: true }),
          });
          await logActivity(user.role, "login", "auth", { userName: user.name }, user.name);
          return res;
        }
      }
    }
  } catch {
    // fg_users query failed — fall through to 401. Shared role-based
    // passwords (role_passwords table + env vars) were retired in
    // Sprint 1E to restore traceability; every login must now match a
    // named row in fg_users.
  }

  return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
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
