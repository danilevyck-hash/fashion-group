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
// Acá viven las dos respuestas del módulo, y ninguna otra:
//   · quién ve y escribe              → PRESTAMOS_ROLES
//   · quién entra a la zona peligrosa → PRESTAMOS_ADMIN_ROLES
//
// 🔴 HABÍA UNA TERCERA Y SE RETIRÓ EL 11-SEP-2026: «quién APRUEBA un préstamo
// sobre el tope» (`puedeAprobarPrestamo`: rol admin **y** que fuera `daniel`,
// porque hay dos admins). Daniel, textual: *«Aprobar préstamos: eso también se
// quita»*. Un préstamo queda activo de una, lo registre quien lo registre; el
// tope solo AVISA (`prestamos-tope.ts`). Medido antes de retirarlo: 0 préstamos
// esperando en producción.
// ─────────────────────────────────────────────────────────────────────────────

/** Quien ve y escribe el módulo. */
export const PRESTAMOS_ROLES: readonly string[] = ["admin", "contabilidad"];

/** La zona de acciones peligrosas y el «Eliminar» de la lista. */
export const PRESTAMOS_ADMIN_ROLES: readonly string[] = ["admin"];

/** ¿Este rol entra al módulo? */
export function esRolDePrestamos(role: string | null | undefined): boolean {
  return !!role && PRESTAMOS_ROLES.includes(role);
}

/** ¿Este rol entra a la zona de acciones peligrosas? */
export function esAdminDePrestamos(role: string | null | undefined): boolean {
  return !!role && PRESTAMOS_ADMIN_ROLES.includes(role);
}
