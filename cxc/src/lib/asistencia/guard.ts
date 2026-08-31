// ─────────────────────────────────────────────────────────────────────────────
// EL CANDADO DE ASISTENCIA — el ROL no alcanza, hay que mirar los MÓDULOS.
//
// 🩸 EL AGUJERO, MEDIDO (31-ago-2026). `requireRole` compara contra el ROL y
// nunca contra los módulos del usuario (`requireRole.ts`: `allowedRoles
// .includes(parsed.role)`). Pero los módulos que una persona ve NO salen solo
// de su rol: `fg_users.modulos_override`, cuando está poblado, **REEMPLAZA** la
// lista de `role_permissions` (`api/auth/route.ts`, «1) modulos_override … si
// está definido y no vacío»).
//
// Las DOS secretarias reales tienen override y NINGUNO incluye `asistencia`:
//   andrea → cheques, comisiones, caja, marketing, directorio, guias,
//            packing-lists, reclamos, catalogos, cargar, multifashion
//   Angela → directorio, marketing, cheques, caja, comisiones, guias,
//            packing-lists, reclamos, catalogos, cargar, cxc
//
// O sea: no ven la ficha en el menú, y entrando por la URL recibían la planilla
// con el sueldo de las 40 personas. Medido con cookies firmadas contra el build
// de producción: **26 respuestas no-403** a usuarios sin el módulo (9 rutas en
// 200 y 2 en 400 —que es «pasó el candado»— por cada secretaria).
//
// El propio `roles.ts` ya decía cuál era el invariante roto: *«la lista de
// modules.ts es la NAVEGACIÓN; la de las rutas es el CANDADO. Esconder la
// tarjeta no cierra nada —cualquiera con el módulo entra por URL—, así que las
// dos tienen que decir lo mismo»*. Decían lo mismo a nivel de ROL; el override
// por USUARIO rompía la equivalencia y no había nada que lo vigilara.
//
// ── 🔑 DE DÓNDE SALEN LOS MÓDULOS: DE LA COOKIE FIRMADA, NO DE LA BASE ───────
//
// `modules` viaja en el payload HMAC-firmado (`session-cookie.ts`), lo escribe
// el login con la precedencia exacta —override > role_permissions > default por
// rol— y no es forjable. Se usa ESA lista, y no una consulta nueva, por dos
// razones que apuntan al mismo lado:
//
//   1. Es la MISMA fuente que el menú (`fg_modules` → `getVisibleModules`). Ir
//      a la base acá haría la API más fresca que la navegación, y volveríamos a
//      tener dos verdades: una pestaña que se ve y la ruta rechaza, o al revés.
//   2. Cero consultas. La base está en compute Micro y esta comprobación corre
//      en cada request del módulo.
//
// ⚠️ EL PRECIO, dicho: un cambio de permisos entra recién en el próximo login.
// Es exactamente lo que ya le pasa al menú, así que no estrena un modo de
// fallo — pero si mañana se quiere que sea inmediato, hay que cambiar las DOS
// puntas a la vez, no solo ésta.
//
// ── 🔴 SIN `modules` NO SE DEJA PASAR ────────────────────────────────────────
//
// Fail-closed. El payload lleva `modules` desde el 27-mar-2026 y la cookie vive
// 7 días (`COOKIE_MAX_AGE`), así que no existe una sesión viva que no lo traiga
// —medido: las 100 sesiones sin revocar se crearon hace 3 días o menos—. Dejar
// pasar una lista vacía sería reabrir el agujero justo para el caso raro.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type SessionPayload } from "@/lib/requireRole";
import { fgModulesDaAcceso } from "@/lib/modules";
import { MODULO_BOSTON } from "@/lib/boston/rol";

/** La key del módulo en `role_permissions` y en `fg_users.modulos_override`. */
export const MODULO_ASISTENCIA = "asistencia";

/**
 * 🔴 LOS MÓDULOS QUE HABILITAN LA PLANILLA, Y POR QUÉ SON DOS.
 *
 * `gerente_boston` (David) abre la planilla de Boston desde `/boston`, y sus
 * módulos son `["boston", "catalogos"]` — **no tiene `asistencia`**, ni puede
 * heredarlo (`fgModulesIncluye` exige que el módulo declare el rol en su
 * `roles[]`, y el de Asistencia son admin/secretaria/contabilidad/bodega).
 * Exigirle `asistencia` a secas le rompería su pestaña.
 *
 * Su acceso ya está acotado por otras dos vías que NO se tocan: la ruta le
 * fuerza la empresa a Boston (no la lee de la URL) y le contesta sin un solo
 * campo de dinero (`planillaSinDinero`).
 */
export const MODULOS_PLANILLA = [MODULO_ASISTENCIA, MODULO_BOSTON] as const;

/**
 * Igual que `requireRole`, y además: el usuario tiene que TENER el módulo.
 *
 * `admin` pasa sin mirar módulos, como en `requireRole` y como en
 * `getVisibleModules` — es una consecuencia de la regla de siempre, no un caso
 * especial nuevo.
 *
 * @param modulosQueHabilitan cualquiera de estos alcanza. Por defecto, solo
 *        `asistencia`; la planilla pasa además `boston` (ver arriba).
 */
export function requireAsistencia(
  req: NextRequest,
  rolesPermitidos: string[],
  modulosQueHabilitan: readonly string[] = [MODULO_ASISTENCIA],
): SessionPayload | NextResponse {
  const auth = requireRole(req, rolesPermitidos);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "admin") return auth;

  const mods = auth.modules;
  if (!Array.isArray(mods) || mods.length === 0) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  // La MISMA regla del menú (`fgModulesDaAcceso`), para que la ficha que se ve
  // y la ruta que contesta no puedan volver a separarse.
  const alcanza = modulosQueHabilitan.some((k) => fgModulesDaAcceso(mods, k, auth.role));
  if (!alcanza) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  return auth;
}
