// ─────────────────────────────────────────────────────────────────────────────
// ¿ESTA CONTRASEÑA YA LA USA OTRA PERSONA? — UN solo lugar (14-sep-2026).
//
// El login de este sistema es SOLO contraseña: no hay campo de usuario, la
// contraseña ES la identidad. Dos personas con la misma hacen el login
// ambiguo (`POST /api/auth` rechaza el empate), así que toda contraseña que se
// escriba —la que pone el admin en Usuarios y la que cada quien se cambia
// desde su menú— pasa por ESTA función. Una segunda comprobación es la que un
// día se queda vieja y deja pasar el empate.
//
// Vivía dentro de `/api/admin/users/route.ts` (`passwordInUse`); salió de ahí
// cuando nació el cambio de contraseña propio. La conducta no cambió: unicidad
// GLOBAL (incluye inactivos, por si se reactivan) y la MISMA normalización del
// login (exacta + minúsculas, por el autocapitalizar del iPhone).
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ El cliente de Supabase se importa DENTRO de la función, no acá arriba:
// así la frase y `esHashBcrypt` —que son puras— se pueden importar sin que
// exista una URL de base de datos, y el candado puede leerlas.

/** Daniel, textual, para quien elige una contraseña que ya usa otra persona. */
export const AVISO_CONTRASENA_REPETIDA = "Crea otra, esa no se puede";

export function esHashBcrypt(s: string | null | undefined): boolean {
  return typeof s === "string" && (s.startsWith("$2a$") || s.startsWith("$2b$"));
}

/**
 * ¿La contraseña ya está en uso por OTRO usuario?
 * @param excluirId el propio usuario, cuando se cambia la suya (una persona
 *        puede «volver a poner» la que ya tiene sin chocar consigo misma).
 */
export async function contrasenaEnUso(plaintext: string, excluirId?: string): Promise<boolean> {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data: users } = await supabaseServer.from("fg_users").select("id, password");
  if (!users) return false;
  const bcrypt = (await import("bcryptjs")).default;
  const lower = plaintext.toLowerCase();
  for (const u of users) {
    if (excluirId && u.id === excluirId) continue;
    if (!esHashBcrypt(u.password)) continue;
    if ((await bcrypt.compare(plaintext, u.password)) || (await bcrypt.compare(lower, u.password))) {
      return true;
    }
  }
  return false;
}
