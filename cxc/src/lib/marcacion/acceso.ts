// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN ENTRA A MARCACIÓN — el guard de la página y de las rutas (14-sep-2026).
//
// Dos puertas, UNA regla:
//   · por ROL: `admin` y `marcacion` (`ROLES_MODULO_MARCACION`);
//   · por PERSONA: quien lleva `marcacion` en los módulos de su cookie firmada
//     —hoy Rodrigo (bodega), por su `modulos_override`—.
//
// La lista de módulos sale de la COOKIE y no de una consulta nueva, por las
// mismas dos razones de `lib/asistencia/guard.ts`: es la MISMA fuente que el
// menú (`fg_modules` → `getVisibleModules`), así la ficha que se ve y la ruta
// que contesta no pueden decir cosas distintas; y cero consultas. ⚠️ El precio,
// dicho: quitarle el módulo a alguien entra recién en su próximo login — igual
// que hoy con cualquier override.
//
// 🔴 LO QUE ESTE GUARD NO DECIDE: quién es la persona que marca. Eso lo dice
// `fg_users.empleado_codigo` (migración `20261125120000`), y se lee con
// `leerEmpleadoCodigo`. Un admin pasa el guard y NO tiene código: la pantalla
// tiene que decirlo, no inventarle uno.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { verifySession, type SessionPayload } from "@/lib/session-cookie";
import { fgModulesDaAcceso } from "@/lib/modules";
import { MODULO_MARCACION, ROLES_MODULO_MARCACION } from "./rol";

// ⚠️ El cliente de Supabase se importa DENTRO de `leerEmpleadoCodigo`, no
// arriba: así este archivo —que es el guard, y lo llaman los candados— se
// puede importar sin que exista una URL de base de datos. Un guard que no se
// puede cargar en una prueba es un guard sin candado.

const COOKIE_NAME = "cxc_session";

/** ¿Esta sesión abre Marcación? Por rol, o por tener el módulo. */
export function puedeAbrirMarcacion(
  session: Pick<SessionPayload, "role" | "modules"> | null | undefined,
): boolean {
  if (!session) return false;
  if ((ROLES_MODULO_MARCACION as readonly string[]).includes(session.role)) return true;
  const mods = session.modules;
  if (!Array.isArray(mods) || mods.length === 0) return false; // fail-closed
  return fgModulesDaAcceso(mods, MODULO_MARCACION, session.role);
}

/**
 * El guard de la PÁGINA (SSR). Devuelve a dónde redirigir, o `null` si entra.
 *
 *   const destino = destinoSiNoAbreMarcacion((await cookies()).get("cxc_session")?.value);
 *   if (destino) redirect(destino);
 *
 * Sin sesión → `/` (la contraseña); con sesión y sin permiso → `/home`.
 * Mismo molde que `/multifashion/page.tsx`.
 */
export function destinoSiNoAbreMarcacion(rawCookie: string | undefined): "/" | "/home" | null {
  const parsed = verifySession(rawCookie);
  if (!parsed) return "/";
  return puedeAbrirMarcacion(parsed) ? null : "/home";
}

/**
 * El guard de las RUTAS (`/api/marcacion/*`). Igual que `requireRole`, y además
 * deja pasar por módulo. 401 sin sesión, 403 sin permiso.
 *
 *   const auth = requireMarcacion(req);
 *   if (auth instanceof NextResponse) return auth;
 */
export function requireMarcacion(req: NextRequest): SessionPayload | NextResponse {
  const parsed = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!parsed) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeAbrirMarcacion(parsed)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return parsed;
}

/**
 * El código de colaborador (`asistencia_personas.empleado_codigo`) atado a
 * este usuario, o `null` si no tiene ninguno. Se lee FRESCO de la base: es la
 * identidad de quien marca, no un permiso de navegación.
 */
export async function leerEmpleadoCodigo(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data, error } = await supabaseServer
    .from("fg_users")
    .select("empleado_codigo")
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[marcacion] fg_users.empleado_codigo:", error.message);
    return null;
  }
  const codigo = (data as { empleado_codigo?: string | null } | null)?.empleado_codigo;
  return typeof codigo === "string" && codigo.trim() ? codigo.trim() : null;
}
