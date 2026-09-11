// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUÉ MÓDULOS SE LE PUEDEN DAR A UNA PERSONA — Y CUÁLES NO, AUNQUE EL
// EDITOR TENGA LA CASILLA (11-sep-2026).
//
// 🩸 EL DEFECTO, medido en producción. El editor de «permisos personalizados»
// de `/admin/usuarios` ofrecía las 20 keys del catálogo, para cualquier rol.
// Pero el `modulos_override` NO decide solo: cada módulo tiene además su
// guard, y ese guard mira el **ROL**. Resultado: **andrea (secretaria) tenía
// `multifashion` en su override**, la ficha se le pintaba en el Inicio y en el
// sidebar, la tocaba… y `/multifashion` la devolvía a `/home` sin decirle
// nada. Un permiso que se puede regalar y no se puede usar.
//
// 🔑 LA REGLA, y por qué ésta. Un módulo se le puede ofrecer a un rol
// **solo si el catálogo (`ALL_MODULES`) se lo da a ese rol**. No es una lista
// nueva ni una copia: es la MISMA lista que dibuja el Inicio y el sidebar, y
// es la que los guards ya usan — se comprobó uno por uno que el `allowedRoles`
// de cada pantalla es esa lista o un subconjunto suyo, y hay candado
// (`usuarios-modulos-ofrecibles.test.ts`) que pone el build ROJO si alguna
// pantalla se sale de su lista.
//
// CONSECUENCIA, dicha en voz alta: el override pasa a **quitar** módulos, no a
// inventar accesos. Es lo que ya hacía en la práctica —los dos overrides vivos
// (Angela y andrea) no le dan a ninguna de las dos un solo módulo que su rol
// no tuviera, salvo justamente el `multifashion` que rebotaba— y es lo único
// honesto que puede hacer una casilla: si marcarla no abre la pantalla, la
// casilla no debería existir.
//
// MEDIDO ANTES DE ENCENDERLO (11-sep-2026): con esta regla, de los 10 módulos
// del override de Angela y los 11 de andrea, el ÚNICO que deja de ofrecerse es
// `multifashion` para la secretaria. Ninguna de las dos pierde nada de lo que
// hoy le funciona.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_MODULES, type AppModule } from "@/lib/modules";

/**
 * Los módulos que el editor de Usuarios puede OFRECER para un rol: los que ese
 * rol puede de verdad abrir. Conserva el orden del catálogo.
 */
export function modulosOfrecibles(rol: string | null | undefined): AppModule[] {
  const r = (rol ?? "").trim();
  if (!r) return [];
  return ALL_MODULES.filter((m) => m.roles.includes(r));
}

/** ¿Se le puede dar este módulo a este rol sin que la pantalla lo rebote? */
export function moduloOfrecible(rol: string | null | undefined, key: string): boolean {
  return modulosOfrecibles(rol).some((m) => m.key === key);
}
