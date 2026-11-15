/**
 * Lo que se prueba contra cada hash al entrar: la contraseña tal cual y, si
 * tiene mayúsculas, también en minúsculas (el iPhone a veces pone la primera en
 * mayúscula). Sin mayúsculas las dos son la MISMA prueba: se hace una sola.
 */
export function variantesDeContrasena(password: string): string[] {
  const minusculas = password.toLowerCase();
  return minusculas === password ? [password] : [password, minusculas];
}
