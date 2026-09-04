import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";

/**
 * GET /api/auth/perfil
 * Nombre para saludar en el home. Devuelve:
 *   - userName:    el usuario de login (fg_users.name), siempre presente
 *   - displayName: fg_users.nombre_completo si existe, si no el userName
 *
 * Por qué un endpoint y no la cookie: `fg_user_name` (sessionStorage) guarda el
 * usuario de login y las sesiones YA abiertas no se re-crean — meter el nombre
 * completo en el login solo lo arreglaría para quien vuelva a entrar. Esto lo
 * resuelve para todos sin tocar la cookie de sesión.
 *
 * Historia (jul-2026): la columna `nombre_completo` llegó con la DDL
 * 20260709120000 y, mientras no estuviera aplicada, un 42703 ("column does not
 * exist") caía a `name` EN SILENCIO. Tolerancia retirada el 3-sep-2026: la
 * columna existe desde 20260709120000_cxc_email_estado_cuenta.sql (verificado
 * en producción). Lo que se conserva es la invariante del módulo —**el saludo
 * NUNCA rompe el home**—, así que un error de la base sigue cayendo al usuario
 * de login; lo que cambia es que ahora SE LOGUEA: un permiso, un timeout o un
 * cambio de esquema ya no se confunden con "todavía no corrió el SQL".
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = verifySession(req.cookies.get("cxc_session")?.value);
  if (!parsed) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const fallback = parsed.userName || "";
  if (!parsed.userId) {
    return NextResponse.json({ userName: fallback, displayName: fallback });
  }

  const { data, error } = await supabaseServer
    .from("fg_users")
    .select("name, nombre_completo")
    .eq("id", parsed.userId)
    .maybeSingle();

  if (error) {
    // El saludo NUNCA rompe el home, pero el error tampoco se esconde.
    console.error("[auth/perfil] fg_users:", error.message);
    return NextResponse.json({ userName: fallback, displayName: fallback });
  }
  if (!data) {
    return NextResponse.json({ userName: fallback, displayName: fallback });
  }

  const userName = (data.name as string | null)?.trim() || fallback;
  const displayName = (data.nombre_completo as string | null)?.trim() || userName;
  return NextResponse.json({ userName, displayName });
}
