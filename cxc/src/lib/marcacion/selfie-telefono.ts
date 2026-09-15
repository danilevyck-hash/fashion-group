// ─────────────────────────────────────────────────────────────────────────────
// LA SELFIE, ACHICADA EN EL TELÉFONO (14-sep-2026).
//
// Se achica ANTES de mandarla, y también antes de guardarla en la cola de
// «sin señal»: una foto de iPhone son 3-5 MB, y por una red de local con una
// barra de señal eso es la diferencia entre marcar y no marcar. A 1.000 px de
// lado mayor y calidad 0,8 una selfie queda en ~120 KB.
//
// ⚠️ SI EL NAVEGADOR NO PUEDE ACHICARLA, VIAJA TAL CUAL. Nunca se pierde la
// marca por no poder comprimir la foto: el servidor la vuelve a pasar por
// `sharp` (`selfie-servidor.ts`) y ahí se normaliza igual.
//
// 🔑 El lado mayor y la calidad son los MISMOS números del servidor y viven
// allá: dos tamaños distintos para la misma foto es cómo se llega a una selfie
// que en el teléfono se ve bien y en la pantalla de la contadora no.
// ─────────────────────────────────────────────────────────────────────────────

import { LADO_MAYOR_SELFIE } from "./medidas-selfie";

/**
 * Devuelve la foto achicada en JPEG, o la original si no se pudo.
 * No lanza nunca: marcar es más importante que comprimir.
 */
export async function achicarEnElTelefono(archivo: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(archivo);
    const lado = Math.max(bitmap.width, bitmap.height);
    const escala = lado > LADO_MAYOR_SELFIE ? LADO_MAYOR_SELFIE / lado : 1;
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const chica = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob((b) => resolve(b), "image/jpeg", 0.8),
    );
    return chica && chica.size > 0 ? chica : archivo;
  } catch {
    return archivo;
  }
}
