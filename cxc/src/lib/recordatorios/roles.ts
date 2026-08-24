/**
 * QUIÉN VE Y TOCA LOS RECORDATORIOS — una sola lista.
 *
 * Daniel, a la pregunta de quién los ve: ***"admin y secre"***. Es exactamente
 * la misma pareja que ya entra al módulo (la ficha `cheques` de `modules.ts` y
 * los `CHEQUES_ROLES` de `/api/cheques`), y por eso vive en un módulo propio:
 * escrita a mano en cada route, una de las copias se afloja sin que nadie se
 * entere. Hay candado que las compara entre sí.
 *
 * ⚠️ La `key` del módulo sigue siendo **`cheques`** (está en `role_permissions`
 * y en `fg_users.modulos_override`): lo único que cambió es el label visible.
 */
export const RECORDATORIOS_ROLES: readonly string[] = ["admin", "secretaria"];

/** La `key` del módulo. NO cambia con el label — renombrarla rompe permisos. */
export const RECORDATORIOS_MODULO_KEY = "cheques";
