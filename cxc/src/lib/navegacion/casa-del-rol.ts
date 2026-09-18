// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «IR AL INICIO» ES LA CASA DEL ROL, NO `/home` A SECAS (17-sep-2026).
//
// Tres roles del sistema NO tienen Inicio: bodega, Jennifer (`gerente_acs`) y
// David (`gerente_boston`) entran y `/home` los empuja a su único módulo. Son
// 108 sesiones en 30 días (77 + 26 + 5, medidas el 6-sep-2026 en
// `docs/mapas/rutas.md`). Mandarlos a `/home` es mandarlos a una pantalla que
// su propio rol rebota: parpadea y vuelven a donde estaban, así que el botón se
// siente muerto.
//
// 🔑 LA REGLA ES LA MISMA QUE YA APLICABA `/home`, dicha en UN solo lugar:
//   1. admin → el Inicio de verdad;
//   2. un rol con UN solo módulo visible → ese módulo;
//   3. un rol con CASA fijada (`MODULO_CASA_POR_ROL`) → su casa, aunque tenga
//      varios módulos (David ganó Catálogos el 27-ago-2026 y dejó de ser «rol
//      de un solo módulo»; su casa no cambió);
//   4. cualquier otro → el Inicio.
//
// ⚠️ La casa se resuelve contra los módulos VISIBLES: si a alguien le quitaran
// su módulo a mano, esto NO lo manda a una pantalla que no puede ver.
//
// No hay ningún `role === "gerente_…"` escrito acá: el rol se dice en su archivo
// (`lib/boston/rol.ts`, `lib/marcacion/rol.ts`) y la casa en `modules.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { getVisibleModules, moduloCasaDeRol } from "@/lib/modules";

/** El Inicio de verdad — el de quien SÍ tiene fichas que mirar. */
export const INICIO = "/home";

/** A dónde lleva «Ir al inicio» para este rol. */
export function casaDelRol(role: string | null | undefined, fgModules?: string[] | null): string {
  if (!role) return INICIO;
  if (role === "admin") return INICIO;
  const visibles = getVisibleModules(role, fgModules);
  if (visibles.length === 1) return visibles[0].href;
  const casa = visibles.find((m) => m.key === moduloCasaDeRol(role));
  return casa ? casa.href : INICIO;
}

/**
 * ¿Ya está parado en su casa? Entonces el botón de volver NO se dibuja: un
 * botón que no hace nada es peor que no tenerlo.
 */
export function yaEstaEnSuCasa(pathname: string, casa: string): boolean {
  if (!pathname) return false;
  if (casa === INICIO) return pathname === INICIO;
  return pathname === casa || pathname.startsWith(`${casa}/`);
}
