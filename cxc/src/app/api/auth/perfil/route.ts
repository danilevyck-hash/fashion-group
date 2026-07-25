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
 * La columna nombre_completo llegó con la DDL 20260709120000, que puede NO estar
 * aplicada: si PostgREST devuelve 42703 ("column does not exist") caemos a `name`
 * en vez de romper el saludo. Mismo patrón que /api/cxc/enviar-email.
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

  if (error || !data) {
    // 42703 (columna ausente) o cualquier otro fallo: el saludo NUNCA debe romper.
    return NextResponse.json({ userName: fallback, displayName: fallback });
  }

  const userName = (data.name as string | null)?.trim() || fallback;
  const displayName = (data.nombre_completo as string | null)?.trim() || userName;
  return NextResponse.json({ userName, displayName });
}
