// ─────────────────────────────────────────────────────────────────────────────
// LA SELFIE — ACHICAR Y GUARDAR (14-sep-2026).
//
// Daniel: la selfie es obligatoria y *«se achican antes de subirla»*.
//
// 🔑 SE ACHICA DOS VECES, A PROPÓSITO, Y CADA UNA SIRVE PARA ALGO DISTINTO:
//   · en el TELÉFONO (`selfie-telefono.ts`, con el canvas del navegador), para
//     que la foto que espera señal no ocupe 4 MB en el teléfono y para que
//     suba por una red mala;
//   · acá, en el SERVIDOR, con `sharp` — el mismo que usan Reclamos y el ZIP
//     de Marketing—, porque lo que llega del navegador no se cree: un iPhone
//     puede mandar un HEIC que ningún navegador de la contadora abre, y una
//     foto sin pasar por el canvas (si el canvas falló) llega entera.
//
// ⚠️ SI `sharp` NO LA PUEDE LEER, LA FOTO SE GUARDA TAL CUAL. Misma decisión
// que en Reclamos: se prefiere guardarla pesada a no guardarla. La selfie es
// la prueba de que marcó ella; perderla por no poder comprimirla sería perder
// justo lo que se quería.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { CALIDAD_SELFIE, LADO_MAYOR_SELFIE } from "./medidas-selfie";

/** El bucket PRIVADO de las selfies. Nace en `20261127120000`. */
export const BUCKET_SELFIES = "asistencia-marcaciones";

/** Cuánto vive el enlace que mira la contadora. Una hora, como la cédula. */
export const SEGUNDOS_URL_FIRMADA = 60 * 60;

/** Achica a JPEG respetando la orientación EXIF. `null` = no se pudo leer. */
export async function achicarSelfie(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input)
      .rotate()
      .resize({
        width: LADO_MAYOR_SELFIE,
        height: LADO_MAYOR_SELFIE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: CALIDAD_SELFIE, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Sube la selfie al bucket privado. Devuelve el path guardado.
 *
 * `upsert: true` a propósito: el `path` lleva el `evento_id` adentro, así que
 * reescribirlo solo puede pasar cuando el teléfono reenvía LA MISMA marca que
 * no alcanzó a confirmarse. Sobrescribir esa foto con ella misma es inofensivo;
 * fallar con «ya existe» dejaría la marca sin poder entrar.
 */
export async function subirSelfie(
  path: string,
  original: Buffer,
): Promise<{ path: string; achicada: boolean }> {
  const chica = await achicarSelfie(original);
  const bytes = chica ?? original;
  const { error } = await supabaseServer.storage
    .from(BUCKET_SELFIES)
    .upload(path, new Uint8Array(bytes), {
      contentType: chica ? "image/jpeg" : "application/octet-stream",
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return { path, achicada: chica !== null };
}

/** Retira una selfie (se usa cuando la fila no se pudo guardar después). */
export async function borrarSelfies(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseServer.storage.from(BUCKET_SELFIES).remove([...paths]);
}

/** Firma un path para mirarlo. `null` si no se pudo: la pantalla lo dice. */
export async function firmarSelfie(path: string | null | undefined): Promise<string | null> {
  const p = String(path ?? "").trim();
  if (!p) return null;
  try {
    const { data, error } = await supabaseServer.storage
      .from(BUCKET_SELFIES)
      .createSignedUrl(p, SEGUNDOS_URL_FIRMADA);
    if (error || !data) return null;
    return data.signedUrl;
  } catch (err) {
    console.warn("[marcacion] no se pudo firmar la selfie:", err instanceof Error ? err.message : err);
    return null;
  }
}
