/**
 * 🩸 7-oct-2026: Ángela tocó «Recibir» y el servidor le contestó «Ese paso lo
 * marca la secretaria». Su pestaña decía Angela (secretaria) —el rol vive en
 * `sessionStorage`, uno por pestaña— pero la cookie, que es UNA por navegador,
 * ya era la de jorman (bodega): alguien entró como jorman en otra pestaña del
 * mismo navegador. La pantalla ofrecía botones de una persona y el servidor
 * firmaba como otra (en Guías y Etiquetas, que bodega sí puede tocar, el
 * cambio pasaba callado con la firma equivocada).
 *
 * Arreglo: cada entrada deja en `localStorage` (compartido por todas las
 * pestañas, como la cookie) de quién es la sesión del navegador; una pestaña
 * que ve otro nombre vuelve a «/», que retoma la sesión real de la cookie.
 */
export const CLAVE_SESION_DEL_NAVEGADOR = "fg_sesion_del_navegador";

/** ¿La sesión del navegador ya no es la de esta pestaña? Sin dato = no se sabe, no se toca. */
export function otraSesionEnElNavegador(delNavegador: string | null, deLaPestana: string | null): boolean {
  return !!delNavegador && !!deLaPestana && delNavegador !== deLaPestana;
}
