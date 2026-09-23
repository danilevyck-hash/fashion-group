// ============================================================================
// Marketing — QUIÉN ENTRA Y QUIÉN ESCRIBE. Módulo PURO.
//
// Daniel (23-sep-2026), textual: el módulo lo ven *«contabilidad, admin y
// secres»*. Contabilidad entra a MIRAR: no registra gastos, no edita, no
// anula, no cierra períodos ni baja ZIPs.
//
// 🔴 UNA lista para leer y OTRA para escribir. Las rutas de lectura (GET)
// aceptan `ROLES_MARKETING`; las que escriben siguen con
// `ROLES_MARKETING_ESCRITURA`, que es exactamente la lista de siempre. La
// pantalla esconde los botones de escritura con `puedeEscribirMarketing`, y
// el SERVIDOR contesta 403 aunque alguien los encuentre.
//
// 🔴 FALLA ABIERTA sin la migración `20261218120100`: `role_permissions` de
// contabilidad no trae `marketing`, así que la ficha del menú le llega por
// herencia (`MODULO_HEREDA_PERMISO_DE` en `lib/modules.ts`) y las páginas la
// aceptan por `allowedRoles`. Con la migración, por derecho propio.
// ============================================================================

/** Quien VE Marketing: portada, tiendas, marcas, impulsadoras, mobiliario. */
export const ROLES_MARKETING: readonly string[] = ["admin", "secretaria", "contabilidad"];

/** Quien ESCRIBE: registrar, editar, anular, cerrar, bajar ZIP. Sin cambios. */
export const ROLES_MARKETING_ESCRITURA: readonly string[] = ["admin", "secretaria"];

/** ¿Este rol puede escribir en Marketing? Contabilidad NO. */
export function puedeEscribirMarketing(role: string | null | undefined): boolean {
  return ROLES_MARKETING_ESCRITURA.includes(String(role ?? ""));
}

/** ¿Este rol entra a Marketing, aunque sea solo a mirar? */
export function puedeVerMarketing(role: string | null | undefined): boolean {
  return ROLES_MARKETING.includes(String(role ?? ""));
}

/** El rótulo que se le dice a quien solo mira. */
export const TEXTO_SOLO_LECTURA = "Solo lectura";
