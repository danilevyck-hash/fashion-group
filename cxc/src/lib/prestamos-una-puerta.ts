// ─────────────────────────────────────────────────────────────────────────────
// PRÉSTAMOS: UNA SOLA PUERTA, NUNCA DOS.
//
// Daniel, 10-sep-2026, al aprobar la Planilla Unida: Préstamos deja de ser un
// módulo aparte y pasa a vivir DENTRO de Asistencia, como una pestaña.
//
// 🔴 CON EL INTERRUPTOR APAGADO NO CAMBIA NADA. Sin
// `NEXT_PUBLIC_PLANILLA_UNIDA`, Préstamos es exactamente lo de hoy: su ficha en
// el menú y en el home, su dirección `/prestamos`, y en Asistencia NO hay
// pestaña de Préstamos. Todo lo de este archivo cuelga de ese interruptor.
//
// 🔴 CON EL INTERRUPTOR PRENDIDO HAY UNA PUERTA Y SOLO UNA: la pestaña.
//   · La ficha sale del menú y del home (se FILTRA, no se borra de la lista).
//   · `/prestamos` y todo lo que cuelga de ella redirigen a la pestaña, con la
//     query intacta y con 307 (temporal): el día que se apague, los enlaces
//     viejos y los favoritos vuelven a servir solos.
//   · Las rutas `/api/prestamos/*` NO se tocan. Son las MISMAS que usa la
//     pestaña; redirigir una llamada de datos rompería el módulo entero.
//
// 🔑 NO SE PIERDE NINGUNA FUNCIÓN: deudas, abonos, aprobar, préstamo nuevo y
// «Eliminar todo el historial» siguen siendo los mismos, adentro de la pestaña.
// Esto mueve la PUERTA, no lo que hay detrás.
//
// 🔴 Y NO SE PIERDE NINGUNA PERSONA. Quien hoy entra a Préstamos tiene que
// llegar a la pestaña **aunque no tenga el módulo Asistencia** — si la pestaña
// se autorizara por Asistencia, mover la puerta le quitaría el módulo a alguien
// en silencio, que es la peor forma de perder un permiso. Por eso la lista de
// abajo sale de `PRESTAMOS_ROLES`, la del módulo, y no de la de Asistencia.
// ─────────────────────────────────────────────────────────────────────────────

import { PRESTAMOS_ROLES } from "./prestamos-roles";
import { planillaUnidaPrendida } from "./asistencia/planilla-unida";

/** La dirección de la pestaña. Un solo texto, para que no se escriba dos veces. */
export const PESTANA_PRESTAMOS = "/asistencia?tab=prestamos";

/** La `key` del módulo en `modules.ts`. No cambia: está en `role_permissions`. */
export const MODULO_PRESTAMOS = "prestamos";

/**
 * 🔴 QUIÉN LLEGA A LA PESTAÑA.
 *
 * `PRESTAMOS_ROLES` (admin · contabilidad) **más la secretaria, que entra SOLO
 * A VER** — Daniel: *«La secretaria entra a Préstamos solo a VER»*, y eso ya
 * era así antes de este cambio: quitárselo acá sería una regresión escondida
 * adentro de una mudanza. Lo de «solo ver» lo decide el SERVIDOR en las rutas,
 * no esta lista: acá solo se resuelve si la pestaña se DIBUJA.
 *
 * 🔑 Se DERIVA de `PRESTAMOS_ROLES`, nunca se teclea: el día que el módulo gane
 * un rol, la pestaña lo gana sola.
 */
export const PRESTAMOS_PESTANA_ROLES: readonly string[] = [
  ...PRESTAMOS_ROLES,
  "secretaria",
];

/** ¿Este rol ve la pestaña de Préstamos dentro de Asistencia? */
export function vePestanaPrestamos(rol: string | null | undefined): boolean {
  return !!rol && PRESTAMOS_PESTANA_ROLES.includes(rol);
}

/**
 * ¿El módulo suelto sigue en el menú y en el home?
 *
 * Con la pestaña prendida, NO: dos puertas a lo mismo es cómo la gente termina
 * mirando dos pantallas distintas de la misma plata.
 */
export function moduloPrestamosEnElMenu(): boolean {
  return !planillaUnidaPrendida();
}

/** ¿Esta dirección es del módulo suelto de Préstamos? (nunca una ruta de datos) */
export function esRutaDelModuloPrestamos(pathname: string): boolean {
  const p = String(pathname ?? "");
  // 🔴 `/api/prestamos/...` NO entra: las rutas de datos no se redirigen.
  if (p.startsWith("/api/")) return false;
  return p === "/prestamos" || p.startsWith("/prestamos/");
}

/**
 * 🔴 A DÓNDE VA UNA DIRECCIÓN VIEJA DE PRÉSTAMOS. `null` = no se redirige.
 *
 * La query se conserva ENTERA y se le suma `tab=prestamos`: un enlace con
 * `?persona=7` tiene que seguir diciendo `persona=7` del otro lado.
 * ⚠️ Si la query ya trae un `tab`, el nuestro manda: el destino ES la pestaña.
 */
export function destinoDePrestamos(pathname: string, search?: string): string | null {
  if (!planillaUnidaPrendida()) return null;
  if (!esRutaDelModuloPrestamos(pathname)) return null;
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  params.set("tab", "prestamos");
  return `/asistencia?${params.toString()}`;
}

/**
 * El enlace que dibuja la página de una persona para mandar a Préstamos.
 *
 * ⚠️ NO es una tercera copia del módulo: la sección de la persona MUESTRA lo
 * suyo y para escribir manda acá. Con la pestaña prendida el destino es la
 * pestaña (la ficha suelta ya no existe); apagada, es la ficha de siempre.
 */
export function enlaceAPrestamos(sub?: string | null): string {
  if (planillaUnidaPrendida()) return PESTANA_PRESTAMOS;
  const s = String(sub ?? "").trim();
  return s ? `/prestamos/${encodeURIComponent(s)}` : "/prestamos";
}
