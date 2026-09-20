// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIEN NO TIENE INICIO NO LO VE NI UN INSTANTE (19-sep-2026).
//
// Daniel, textual: *«la persona entra y se ve el home y de una marcaciones, se
// siente bug»*.
//
// 🩸 EL DEFECTO. El rebote a «la casa del rol» vivía SOLO en un efecto del
// NAVEGADOR (`home/page.tsx`): el servidor mandaba el Inicio entero, el
// navegador lo pintaba, después bajaba el JavaScript, recién ahí leía
// `sessionStorage` para saber quién miraba y recién ahí navegaba. Ana, Cindy y
// Yeisibeth (`marcacion`, 1 módulo), Jennifer (`gerente_acs`, 1 módulo) y
// David (`gerente_boston`, casa fijada) veían dibujarse una pantalla que no es
// suya y el salto se sentía roto.
//
// 🔑 EL ARREGLO. El servidor YA SABE quién entra: la cookie `cxc_session` viaja
// firmada con HMAC y trae rol y módulos, y el middleware la verificó contra
// `user_sessions` antes de que esta página se dibuje. Así que la decisión se
// toma AQUÍ, en un componente de SERVIDOR que corre ANTES que `page.tsx`: si la
// casa de ese rol no es el Inicio, `redirect()` sale con un 307 y el navegador
// no recibe una sola línea del Inicio. No hay nada que pintar y después
// esconder.
//
// 🔴 LA REGLA NO SE REESCRIBIÓ: es `casaDelRol`, la MISMA de siempre, la que
// ya usan el efecto de `page.tsx`, el 404 y el botón «Ir al inicio» del
// encabezado. Un segundo lugar que decida «cuál es tu casa» es exactamente el
// bug que ese archivo vino a cerrar.
//
// 🔴 FALLA ABIERTA. Sin cookie, con cookie vencida o forjada, o con un rol
// desconocido, `leerSemillaDeSesion()` devuelve `null` / `casaDelRol` devuelve
// el Inicio y esto NO redirige: se sirve `page.tsx` como siempre y el efecto
// del navegador decide, igual que hasta hoy. Un redirect equivocado deja a
// alguien fuera de su trabajo; un pintado de más solo se ve feo.
//
// 🔴 EL EFECTO DEL NAVEGADOR NO SE TOCÓ, y no sobra: es el que sigue
// atendiendo la sesión sin semilla, el rol `cliente` del catálogo público y el
// caso en que la cookie y `sessionStorage` no dicen lo mismo.
//
// ⚠️ AQUÍ NO SE PINTA NADA, Y ESO ES A PROPÓSITO. El Inicio elige sus colores
// con el modo oscuro, que vive en el `localStorage` del navegador y el
// servidor no puede conocer: por eso `/home` quedó fuera del arreglo del
// primer pintado del 19-sep-2026 (semilla), y sigue afuera. Este layout solo
// DECIDE A DÓNDE VA la petición; quien se queda en el Inicio lo ve exactamente
// como antes, sin destello de tema claro.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { casaDelRol, INICIO } from "@/lib/navegacion/casa-del-rol";
import { leerSemillaDeSesion } from "@/lib/sesion-semilla-servidor";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const semilla = leerSemillaDeSesion();
  if (semilla) {
    const casa = casaDelRol(semilla.role, semilla.modules);
    if (casa !== INICIO) redirect(casa);
  }
  return <>{children}</>;
}
