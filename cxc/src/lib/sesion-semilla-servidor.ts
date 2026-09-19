import { cookies } from "next/headers";
import { verifySession } from "@/lib/session-cookie";
import { semillaDeSesion, type SemillaSesion } from "@/lib/sesion-semilla";

/**
 * Lee la semilla de sesión en el SERVIDOR, desde la cookie firmada (19-sep-2026).
 *
 * 🔴 SOLO POR `verifySession`: la firma HMAC se comprueba en tiempo constante y
 * sin `SESSION_SECRET` no hay semilla (fail-closed). Nadie decodifica el cuerpo
 * de la cookie por su cuenta. El middleware ya rechazó, antes de llegar aquí,
 * toda cookie sin firma, forjada o con el token revocado en `user_sessions`.
 *
 * 🔴 FALLA ABIERTA hacia la conducta de antes: si `cookies()` no está
 * disponible o la cookie no sirve, devuelve `null` y la pantalla espera al
 * efecto del navegador, como siempre. Un arreglo de pintado no puede dejar a
 * nadie sin pantalla.
 *
 * ⚠️ Leer `cookies()` en el layout raíz vuelve dinámicas las rutas que Next
 * prerenderizaba estáticas (`/cxc`, `/guias`, `/caja`…): a propósito, porque
 * el HTML estático de esas rutas era el que salía VACÍO, y el middleware ya
 * corre en cada petición de todos modos.
 */
export function leerSemillaDeSesion(): SemillaSesion | null {
  try {
    const raw = cookies().get("cxc_session")?.value;
    return semillaDeSesion(verifySession(raw));
  } catch {
    return null;
  }
}
