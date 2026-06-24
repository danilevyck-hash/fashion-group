import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getDefaultModulesForRole } from "@/lib/modules";
import { signSession, verifySession } from "@/lib/session-cookie";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getLoginLock, registerLoginFailure, clearLoginAttempts } from "@/lib/login-rate-limit";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Rate limiting: store COMPARTIDO en Supabase (ver src/lib/login-rate-limit.ts).
// Antes era un Map en-memoria, inefectivo en serverless. Cuenta intentos fallidos
// por IP y bloquea (lockout) tras MAX_FAILS.
function lockedResponse(retryAfter: number): NextResponse {
  const res = NextResponse.json(
    { error: "Demasiados intentos fallidos. Intenta de nuevo en unos minutos." },
    { status: 429 },
  );
  if (retryAfter > 0) res.headers.set("Retry-After", String(retryAfter));
  return res;
}

function setSessionCookie(res: NextResponse, payload: Record<string, unknown>) {
  const value = signSession(payload);
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  // Pre-check: si la IP ya está bloqueada, no gastamos bcrypt.
  const lock = await getLoginLock(ip);
  if (lock.locked) return lockedResponse(lock.retryAfter);

  // Helper de fallo: registra el intento fallido (atómico en DB) y devuelve 429
  // si el lockout se activó con este fallo, o 401 si aún hay margen.
  const fail = async () => {
    const r = await registerLoginFailure(ip);
    return r.locked
      ? lockedResponse(r.retryAfter)
      : NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  };

  const { password } = await req.json();

  // 1. Check fg_users table (bcrypt hash required)
  try {
    const { data: users } = await supabaseServer
      .from("fg_users")
      .select("id, name, role, password, active, is_owner, associated_company, modulos_override")
      .eq("active", true);

    if (users) {
      // Recolectar TODOS los matches en vez de cortar en el primero.
      // Si dos usuarios comparten contraseña el login es AMBIGUO: no se puede
      // determinar la identidad, así que se rechaza (evita que un usuario entre
      // con la identidad/rol de otro). Mismo mensaje genérico que "no encontrado"
      // para no revelar que existe una colisión.
      const matches: typeof users = [];
      for (const user of users) {
        if (!isHash(user.password)) {
          console.warn(`[auth] User "${user.name}" has non-bcrypt password — login skipped. Re-hash required.`);
          continue;
        }
        const match = await bcrypt.compare(password, user.password)
          || await bcrypt.compare(password.toLowerCase(), user.password);
        if (match) matches.push(user);
      }

      if (matches.length > 1) {
        return await fail();
      }

      if (matches.length === 1) {
        const user = matches[0];
        {
          // Módulos por rol — fuente única: role_permissions.
          // Prioridad de módulos del usuario:
          //   1) modulos_override (per-usuario) si está definido y no vacío
          //   2) role_permissions del rol
          //   3) defaults hardcoded por rol (fallback si la tabla no responde)
          let modules: string[] = [];
          if (Array.isArray(user.modulos_override) && user.modulos_override.length > 0) {
            modules = user.modulos_override;
          } else {
            try {
              const { data: rolePerm } = await supabaseServer
                .from("role_permissions")
                .select("modulos")
                .eq("role", user.role)
                .single();
              if (rolePerm?.modulos) modules = rolePerm.modulos;
            } catch { /* use defaults below if table missing */ }

            if (modules.length === 0) {
              modules = getDefaultModulesForRole(user.role);
            }
          }

          // Per-user config (readonly flags). El filtro de empresa para CXC ya
          // NO se hardcodea acá: viene de fg_users.associated_company (DB).
          const USER_CONFIG: Record<string, { guiasReadonly?: boolean }> = {
            edwin: { guiasReadonly: true },
          };
          const userConfig = USER_CONFIG[user.name.toLowerCase()] || {};

          // Restricción de empresa para CXC (fuente: fg_users.associated_company).
          // Vendedor con empresa asociada ve solo esa; sin asociada (null) ve todas.
          // El server (API /api/cxc/aging) la re-aplica de forma autoritativa;
          // esto solo alimenta el lock visual del selector de empresa.
          const empresaFilter = user.associated_company || undefined;

          const payload = {
            authenticated: true,
            role: user.role,
            userId: user.id,
            userName: user.name,
            modules,
            isOwner: !!user.is_owner,
            ...(empresaFilter && { empresaFilter }),
            ...(userConfig.guiasReadonly && { guiasReadonly: true }),
          };

          const sessionToken = randomUUID();
          // MULTI-DISPOSITIVO: NO se revocan las sesiones previas del usuario al
          // loguear. Así puede estar activo en varios dispositivos a la vez
          // (iPhone + escritorio + PWA), cada uno con su propia ventana deslizante
          // de 7 días, sin que un login expulse a los otros. La revocación sigue
          // disponible MANUALMENTE (Admin → Sesiones) para un dispositivo perdido,
          // y el logout (DELETE) revoca solo la sesión de ESE dispositivo. La cookie
          // es HMAC-firmada (no forjable) y caduca a los 7 días de inactividad.

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
            ...(empresaFilter && { empresaFilter }),
            ...(userConfig.guiasReadonly && { guiasReadonly: true }),
          });
          await logActivity(user.role, "login", "auth", { userName: user.name }, user.name);
          // Login OK → limpiar el contador de fallos de esta IP.
          await clearLoginAttempts(ip);
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

  return await fail();
}

// DELETE — logout (clear cookie + revoke session)
export async function DELETE(req: NextRequest) {
  // Revoke session in DB (verifica la firma para extraer el sessionToken).
  const parsed = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (parsed?.sessionToken) {
    try {
      await supabaseServer
        .from("user_sessions")
        .update({ revoked: true })
        .eq("session_token", parsed.sessionToken);
    } catch { /* */ }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
