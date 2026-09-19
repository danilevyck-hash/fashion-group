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

// ─────────────────────────────────────────────────────────────────────────────
// EL LARGO MÍNIMO: TRES CARACTERES, Y NADA MÁS (19-sep-2026).
//
// Daniel, textual: *«y que las contraseñas que los usuarios cambien no tenga
// limite de nada, minimo 3 caracteres nada mas»*.
//
// 🩸 Por qué nace este número: el 15-sep se le quitó el mínimo de 8 a los DOS
// servidores («lo quiero sin restricciones») pero la VENTANA de «Cambiar mi
// contraseña» se quedó exigiendo 8 por su cuenta. Cindy quiso ponerse una de
// 6 dígitos, la ventana la frenó, nunca se guardó, y al entrar con la nueva le
// salía «Contraseña incorrecta» —la vieja seguía siendo la buena—. Por eso el
// número vive ACÁ y lo leen la ventana y las dos rutas: un mínimo escrito dos
// veces es un mínimo que se desincroniza.
//
// ⚠️ Lo único que sigue en pie además del largo: no puede repetir la de otra
// persona (`contrasenaEnUso`), porque el login no pide usuario y la contraseña
// ES la identidad.
// ─────────────────────────────────────────────────────────────────────────────

/** El único largo mínimo del sistema. Lo leen la ventana y las dos rutas. */
export const LARGO_MINIMO_CONTRASENA = 3;

/** Lo que se le dice a quien escribe una más corta. */
export const AVISO_CONTRASENA_CORTA = `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;

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
