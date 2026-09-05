// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN ENTRA A PRÉSTAMOS — dicho UNA sola vez.
//
// 🩸 Hasta el 5-sep-2026 `["admin", "contabilidad"]` estaba tecleado a mano en
// SEIS archivos (la pantalla, cuatro rutas y el export), dos de ellos con el
// literal escrito dos veces adentro del mismo archivo. Seis listas que nadie
// obliga a coincidir son seis puertas que un día no cierran igual: agregar un
// rol en cinco y olvidarse de la sexta no rompe nada, no avisa, y deja una ruta
// de plata abierta o cerrada de más.
//
// Acá viven las tres respuestas del módulo, y ninguna otra:
//   · quién ve y escribe            → PRESTAMOS_ROLES
//   · quién entra a la zona peligrosa → PRESTAMOS_ADMIN_ROLES
//   · 🔴 quién APRUEBA un préstamo sobre el tope → `puedeAprobarPrestamo`
//
// 🔴 LA TERCERA NO ES UN ROL, ES UNA PERSONA. Daniel, 5-sep-2026: solo él
// aprueba. Hoy hay DOS usuarios con rol `admin` (`daniel` y `alberto`), así que
// preguntar por el rol dejaría aprobar a alguien que no lo decide. Se pregunta
// por el rol Y por el nombre de usuario. Contabilidad y David lo ven en gris.
// ─────────────────────────────────────────────────────────────────────────────

/** Quien ve y escribe el módulo. */
export const PRESTAMOS_ROLES: readonly string[] = ["admin", "contabilidad"];

/** La zona de acciones peligrosas y el «Eliminar» de la lista. */
export const PRESTAMOS_ADMIN_ROLES: readonly string[] = ["admin"];

/**
 * 🔴 EL ÚNICO USUARIO QUE APRUEBA UN PRÉSTAMO SOBRE EL TOPE.
 *
 * Es el `user_name` de la sesión, medido en producción (`user_sessions`): los
 * dos admins son `daniel` y `alberto`. Se compara sin distinguir mayúsculas ni
 * espacios, como el login del sistema.
 */
export const USUARIO_APRUEBA_PRESTAMOS = "daniel";

export interface SesionMinima {
  role?: string | null;
  userName?: string | null;
}

/** ¿Este rol entra al módulo? */
export function esRolDePrestamos(role: string | null | undefined): boolean {
  return !!role && PRESTAMOS_ROLES.includes(role);
}

/** ¿Este rol entra a la zona de acciones peligrosas? */
export function esAdminDePrestamos(role: string | null | undefined): boolean {
  return !!role && PRESTAMOS_ADMIN_ROLES.includes(role);
}

/**
 * 🔴 ¿Puede APROBAR un préstamo que pasa el tope? Rol admin **y** que sea él.
 *
 * Las dos condiciones, no una: `alberto` también es admin y no decide esto.
 */
export function puedeAprobarPrestamo(s: SesionMinima | null | undefined): boolean {
  if (!s || !esAdminDePrestamos(s.role)) return false;
  return String(s.userName ?? "").trim().toLowerCase() === USUARIO_APRUEBA_PRESTAMOS;
}
