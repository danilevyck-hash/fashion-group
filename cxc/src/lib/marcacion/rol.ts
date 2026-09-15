// ─────────────────────────────────────────────────────────────────────────────
// EL ROL `marcacion` Y EL MÓDULO «Marcación» — FUENTE ÚNICA (14-sep-2026).
//
// Daniel aprobó un reloj más: el del teléfono, para quien trabaja afuera y no
// pasa por ningún reloj físico. Medido: Ana Trejos (2) y Cindy De Gracia (3)
// marcan 1 de 22 días hábiles; el resto les cuenta como ausencia. Con
// Yeisibeth Muñoz (306) son las tres impulsadoras de Multifashion; Rodrigo
// Miranda (13) es bodega en Vistana. Daniel: *«ponle marcación al módulo»*.
//
// 🔴 QUIEN TIENE ESTE ROL NO VE NADA MÁS: ni planilla, ni sueldos, ni las
// marcas de otra persona, ni el resto de Asistencia. Es el molde de
// `gerente_acs` y `gerente_boston` —un rol de UN solo módulo, auto-redirigido
// desde /home, con guard SSR en la página y `requireRole` en cada ruta— y por
// eso el rol se dice UNA vez, acá, como en `lib/boston/rol.ts`. Una copia a
// mano en el catálogo o en una ruta es exactamente el bug de `boston-roles.ts`.
//
// ═══ 🔑 ES UN MÓDULO «POR PERSONA», Y ESO ES LO QUE LO DISTINGUE ═══════════
//
// Rodrigo YA tenía usuario (`rodrigo`, vendedor) y Daniel, textual: *«rodrigo
// es bodega con marcacion»*. Un rol solo no alcanza para las dos cosas, y de
// los dos caminos que existen hoy —`fg_users.modulos_override` o que `bodega`
// gane la key— se eligió el override, porque es el ÚNICO que no abre el módulo
// a los demás bodegas: `bodega` NO está en `ROLES_MODULO_MARCACION`, así que
// `getDefaultModulesForRole("bodega")` no lo trae y `role_permissions.bodega`
// tampoco. El módulo se le da a UNA persona, por su override.
//
// Consecuencia, y por eso existe `MODULOS_POR_PERSONA`: la regla de la casa
// «un módulo se le ofrece a un rol solo si el catálogo se lo da a ese rol»
// (`modulos-ofrecibles.ts`) tiene acá su excepción DECLARADA. Un módulo por
// persona se le puede dar a cualquier rol, y su guard (`lib/marcacion/
// acceso.ts`) lo sabe: deja pasar por ROL (`admin`, `marcacion`) o por tener
// el módulo en la cookie firmada, como ya hace `requireAsistencia`. La
// excepción y el guard van juntos: uno sin el otro es una ficha que se pinta
// y una pantalla que rebota.
// ─────────────────────────────────────────────────────────────────────────────

/** El rol de quien SOLO marca. Ana, Cindy y Yeisibeth. */
export const ROL_MARCACION = "marcacion" as const;

/** La key del módulo en `role_permissions` / `fg_users.modulos_override`.
 *  Daniel: «ponle marcación al módulo». */
export const MODULO_MARCACION = "marcacion" as const;

/** La dirección de la pantalla de marcar. */
export const RUTA_MARCACION = "/marcacion" as const;

/** Cómo se llama en pantalla — la ficha del menú y el rol debajo del nombre. */
export const ROTULO_MARCACION = "Marcación" as const;

/**
 * Quién abre el módulo POR ROL. `admin` está explícito porque la NAVEGACIÓN no
 * pasa por `requireRole` (que lo deja pasar siempre): sin nombrarlo acá, el
 * dueño se quedaría sin la ficha. ⚠️ `bodega` NO va acá a propósito (ver
 * arriba): Rodrigo entra por su override, no por su rol.
 */
export const ROLES_MODULO_MARCACION = ["admin", ROL_MARCACION] as const;

/** Copia mutable para las APIs que reciben `string[]`. */
export const rolesModuloMarcacion = (): string[] => [...ROLES_MODULO_MARCACION];

/**
 * Los módulos que se dan POR PERSONA (override) y no por rol. Hoy uno solo.
 * `modulos-ofrecibles.ts` los ofrece a cualquier rol; su guard tiene que
 * aceptar por módulo de la cookie, no solo por rol.
 */
export const MODULOS_POR_PERSONA: readonly string[] = [MODULO_MARCACION];

/** ¿Este módulo se da por persona? */
export function esModuloPorPersona(key: string): boolean {
  return MODULOS_POR_PERSONA.includes(key);
}

/** ¿Este rol es el de quien solo marca? */
export function esRolMarcacion(rol: string | null | undefined): boolean {
  return rol === ROL_MARCACION;
}
