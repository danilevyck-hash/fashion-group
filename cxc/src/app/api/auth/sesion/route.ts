import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { armarPayloadSesion } from "@/lib/sesion-payload";

/**
 * GET /api/auth/sesion — reanudar la sesión con la cookie vigente (3-sep-2026).
 *
 * Por qué existe: la identidad del CLIENTE (rol, módulos) vivía solo en
 * sessionStorage, que el navegador borra al cerrar la app. La cookie de 7 días
 * seguía viva, pero al reabrir la app el cliente no tenía rol y mandaba al
 * usuario a la pantalla de contraseña. Medido: 453 de 468 logins en 30 días
 * eran de usuarios con una sesión previa vigente.
 *
 * Este endpoint devuelve el MISMO payload que el login con contraseña
 * (fuente única: src/lib/sesion-payload.ts) para que la pantalla de login
 * rehidrate sessionStorage y mande al usuario a su casa SIN pedir contraseña.
 *
 * Seguridad — TODO fail-closed (ante cualquier duda: 401 → contraseña):
 *   - La ruta NO es pública: el middleware ya validó firma HMAC + user_sessions.
 *   - Igual se re-verifica acá (defensa en profundidad): firma de la cookie,
 *     token vivo (no revocado) en user_sessions, y que el token sea del MISMO
 *     usuario que dice la cookie.
 *   - El usuario tiene que seguir activo en fg_users (rol y módulos se leen
 *     FRESCOS de la base, no de la cookie: si le cambiaron el rol o lo
 *     desactivaron después del login, acá se refleja).
 *   - NO crea sesiones, NO toca la cookie, NO guarda nada nuevo en el
 *     navegador. El maxAge de 7 días y la revocación no cambian.
 */
export const dynamic = "force-dynamic";

function noAutorizado(): NextResponse {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const parsed = verifySession(req.cookies.get("cxc_session")?.value);
  if (!parsed || !parsed.sessionToken || !parsed.userId || !parsed.userName) {
    return noAutorizado();
  }

  // El token tiene que existir en user_sessions, NO estar revocado, y ser del
  // mismo usuario que la cookie dice ser. Un error de la base también es 401:
  // en el peor caso el usuario escribe su contraseña, como hoy.
  const { data: ses, error: sesErr } = await supabaseServer
    .from("user_sessions")
    .select("user_name")
    .eq("session_token", parsed.sessionToken)
    .eq("revoked", false)
    .maybeSingle();
  if (sesErr || !ses || ses.user_name !== parsed.userName) {
    return noAutorizado();
  }

  // El usuario tiene que seguir existiendo y ACTIVO.
  const { data: user, error: userErr } = await supabaseServer
    .from("fg_users")
    .select("id, name, role, active, is_owner, associated_company, modulos_override")
    .eq("id", parsed.userId)
    .eq("active", true)
    .maybeSingle();
  if (userErr || !user) {
    return noAutorizado();
  }

  const payload = await armarPayloadSesion(user);
  return NextResponse.json({ authenticated: true, ...payload });
}
