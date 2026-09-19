import { tieneAccesoAlModulo } from "@/lib/auth-check";

/**
 * LA SEMILLA DE SESIÓN: lo que el servidor le cuenta a la pantalla sobre quién
 * la está mirando, para que el PRIMER PINTADO ya traiga contenido (19-sep-2026).
 *
 * 🩸 El defecto: `useAuth` arrancaba con `authChecked = false` y solo lo ponía
 * en `true` dentro de un efecto del navegador. Treinta pantallas hacen
 * `if (!authChecked) return null`, así que el HTML que mandaba el servidor
 * salía VACÍO —blanco hasta que bajaba el JavaScript—, y ocho pantallas que ya
 * traían sus datos listos del servidor los tiraban a la basura igual. Daniel,
 * sobre marcación: *«se siente lagged»*.
 *
 * 🔑 El servidor YA SABE quién es: la cookie `cxc_session` viaja firmada con
 * HMAC y lleva rol, módulos, `isOwner` y nombre. El middleware la verificó y
 * la comprobó contra `user_sessions` ANTES de que la página se dibuje. Lo único
 * que faltaba era contárselo a la pantalla.
 *
 * 🔴 LO QUE VIAJA ES SOLO LO QUE LA PANTALLA NECESITA. La semilla se serializa
 * al navegador con la página, así que NUNCA lleva `sessionToken` ni nada que
 * no estuviera ya en `sessionStorage` después del login. `semillaDeSesion`
 * ENUMERA los campos: un campo nuevo en la cookie no entra solo.
 *
 * 🔴 LA SEGURIDAD NO CAMBIA DE LUGAR. El guard de verdad sigue siendo el del
 * servidor (el middleware y los guards SSR de cada página). Esto decide qué se
 * PINTA, no qué se sirve: con un rol sin acceso, `accesoConSemilla` dice que
 * no y la pantalla devuelve `null` exactamente como hoy.
 */
export interface SemillaSesion {
  role: string;
  modules: string[];
  isOwner: boolean;
  userName: string;
}

/** Lo que trae la cookie firmada (`SessionPayload`), o nada. */
export interface PayloadConSesion {
  role?: unknown;
  modules?: unknown;
  isOwner?: unknown;
  userName?: unknown;
}

const CAMPOS_DE_LA_SEMILLA: ReadonlyArray<keyof SemillaSesion> = ["role", "modules", "isOwner", "userName"];

/**
 * Arma la semilla a partir del payload YA VERIFICADO de la cookie. Sin rol no
 * hay semilla (y la pantalla se comporta como antes). Nunca copia el payload
 * entero: cada campo se toma por su nombre.
 */
export function semillaDeSesion(payload: PayloadConSesion | null | undefined): SemillaSesion | null {
  if (!payload || typeof payload.role !== "string" || !payload.role) return null;
  return {
    role: payload.role,
    modules: Array.isArray(payload.modules)
      ? payload.modules.filter((m): m is string => typeof m === "string")
      : [],
    isOwner: payload.isOwner === true,
    userName: typeof payload.userName === "string" ? payload.userName : "",
  };
}

/** Los cuatro nombres, para que un candado pueda exigir que no viaje otro. */
export function camposDeLaSemilla(): readonly string[] {
  return CAMPOS_DE_LA_SEMILLA;
}

/**
 * ¿Con esta semilla la pantalla se puede dibujar? La MISMA regla que el
 * navegador aplica con `sessionStorage` (`hasModuleAccess`): admin entra a
 * todo; después la lista de roles de la pantalla; después los módulos del
 * usuario. Sin semilla, no se sabe y no se dibuja.
 */
export function accesoConSemilla(
  semilla: SemillaSesion | null,
  moduleKey: string,
  allowedRoles: readonly string[],
): boolean {
  if (!semilla) return false;
  return tieneAccesoAlModulo(semilla.role, semilla.modules, moduleKey, allowedRoles);
}
