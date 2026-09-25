// ─────────────────────────────────────────────────────────────────────────────
// EL SELLO DEL TELÉFONO (25-sep-2026).
//
// 🩸 LA PREGUNTA QUE LA BASE NO PODÍA CONTESTAR. Medido el 24-sep-2026: las
// cuatro personas de Multifashion marcan **juntas**, seis veces en tres días,
// al abrir y al cerrar la tienda, siempre desde el mismo punto (las cuatro
// ubicaciones caen a 5-11 m una de otra). Cada marca trae su usuario, su selfie
// y su ubicación propios, así que se pudo DESCARTAR que fuera un solo teléfono
// esa mañana —el 22 de septiembre, en 63 segundos, marcaron **tres versiones de
// iPhone distintas**—, pero no se pudo decir de quién era cada aparato:
// `asistencia_marcaciones` **no guardaba nada que identifique el teléfono**. El
// `user_agent` no sirve: Daniel, a 500 km, comparte versión con Cindy y con
// Angel.
//
// 🔴 QUÉ ES ESTE SELLO, Y QUÉ NO ES. Es un número al azar que el NAVEGADOR se
// pone a sí mismo la primera vez que abre `/marcacion`, y que vuelve con cada
// marca. **No es el hardware** (se borra si alguien limpia el navegador o marca
// de incógnito) y **no es la persona**. Sirve para UNA sola pregunta: ¿dos
// personas distintas marcaron hoy desde el mismo teléfono?
//
// 🔴 NO BLOQUEA NADA. Con o sin sello, la marca entra igual. Lo único que pasa
// es que Daniel recibe un mensaje en su chat privado y él decide qué hacer.
// Daniel no pidió un candado: pidió enterarse.
//
// 🔴 EL PAYLOAD NO CAMBIA DE FORMA. Es **un campo opcional más** y nada más: ni
// uno menos, ni uno renombrado. El candado `marcacion-payload-igual.test.ts`
// está actualizado para permitir exactamente ese campo y ningún otro.
//
// ⚠️ Interruptor: en `false` el teléfono no se pone sello, no lo manda, y la
// columna queda en NULL como estaba. Nada más cambia.
// ─────────────────────────────────────────────────────────────────────────────

/** Hoy prendido. `false` = el teléfono de antes, sin sello. */
export const SELLO_DEL_APARATO = true;

/** Dónde vive el sello en el teléfono. */
export const LLAVE_SELLO = "fg_marcacion_aparato";

/** El nombre del campo en el formulario que viaja al servidor. */
export const CAMPO_APARATO = "aparatoId";

/** Un sello nuevo. `crypto.randomUUID` donde exista; si no, uno a mano. */
function selloNuevo(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* sin crypto: se arma abajo */
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** ¿Tiene forma de sello? Lo comprueba el SERVIDOR antes de guardarlo. */
export function selloValido(v: unknown): v is string {
  const s = String(v ?? "").trim();
  return s.length >= 8 && s.length <= 64 && /^[A-Za-z0-9._-]+$/.test(s);
}

/**
 * El sello de ESTE teléfono: el que ya tenía, o uno nuevo que se guarda.
 *
 * Corre solo en el navegador. Sin `localStorage` —modo privado de Safari, o el
 * almacenamiento bloqueado— devuelve `null` y la marca viaja sin sello: eso no
 * es un error, es una marca de la que no se va a decir nada.
 */
export function selloDeEsteAparato(): string | null {
  if (!SELLO_DEL_APARATO) return null;
  try {
    if (typeof localStorage === "undefined") return null;
    const guardado = localStorage.getItem(LLAVE_SELLO);
    if (selloValido(guardado)) return guardado;
    const nuevo = selloNuevo();
    localStorage.setItem(LLAVE_SELLO, nuevo);
    return nuevo;
  } catch {
    return null;
  }
}
