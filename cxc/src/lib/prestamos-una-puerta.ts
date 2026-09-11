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
//   · `/prestamos` EXACTO redirige a la pestaña, con la query intacta y con 307
//     (temporal): el día que se apague, los enlaces viejos y los favoritos
//     vuelven a servir solos.
//   · 🔴 `/prestamos/<id>` —los MOVIMIENTOS de una persona— NO redirige
//     (11-sep-2026). Daniel: *«sí, arregla lo de préstamos»*, con el mockup
//     aprobado: tocar el nombre en la pestaña abre esa página, que lleva
//     «← Préstamos» de vuelta a la pestaña. 🩸 Del 10 al 11-sep TODO lo que
//     colgaba de `/prestamos/` rebotaba, y con eso se perdió la única pantalla
//     que muestra los movimientos, el saldo corrido y «Eliminar todo el
//     historial». Se reusa la página del módulo viejo tal cual, en vez de
//     dibujar una segunda.
//   · Las rutas `/api/prestamos/*` NO se tocan. Son las MISMAS que usa la
//     pestaña; redirigir una llamada de datos rompería el módulo entero.
//
// 🔑 NO SE PIERDE NINGUNA FUNCIÓN: deudas, abonos, préstamo nuevo, los
// movimientos de cada quien y «Eliminar todo el historial» siguen siendo los
// mismos, adentro de la pestaña o a un toque de ella. Esto mueve la PUERTA, no
// lo que hay detrás.
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

/**
 * ¿Esta dirección es la LISTA del módulo suelto de Préstamos? (nunca una ruta
 * de datos, y nunca la página de una persona)
 *
 * 🔴 Solo `/prestamos` EXACTO (11-sep-2026). `/prestamos/<id>` es la página de
 * los movimientos de una persona y la pestaña la ENLAZA — redirigirla dejaba
 * al módulo sin forma de ver un solo movimiento.
 */
export function esRutaDelModuloPrestamos(pathname: string): boolean {
  const p = String(pathname ?? "");
  // 🔴 `/api/prestamos/...` NO entra: las rutas de datos no se redirigen.
  if (p.startsWith("/api/")) return false;
  return p === "/prestamos" || p === "/prestamos/";
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
 * suyo y para escribir manda acá. Sin `sub`, con la pestaña prendida el destino
 * es la pestaña (la lista suelta ya no existe); apagada, la lista de siempre.
 * Con `sub` (el id de la ficha) es SIEMPRE la página de sus movimientos,
 * `/prestamos/<id>` — desde el 11-sep-2026 esa página no rebota.
 */
export function enlaceAPrestamos(sub?: string | null): string {
  const s = String(sub ?? "").trim();
  if (s) return `/prestamos/${encodeURIComponent(s)}`;
  return planillaUnidaPrendida() ? PESTANA_PRESTAMOS : "/prestamos";
}

/**
 * A dónde vuelve «← Préstamos» desde la página de una persona: a la pestaña
 * con el interruptor prendido, a la lista suelta si está apagado. UNA
 * definición para el botón, la miga de pan y el rebote de «ficha no
 * encontrada».
 */
export function enlaceVolverAPrestamos(): string {
  return planillaUnidaPrendida() ? PESTANA_PRESTAMOS : "/prestamos";
}
