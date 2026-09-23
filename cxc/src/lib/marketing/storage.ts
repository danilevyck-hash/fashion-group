import { supabaseServer } from "@/lib/supabase-server";
import type { MkAdjunto } from "./types";
import { pathDelZipGuardado, ttlDeLinkDelZip } from "./zip-e-impulsadoras";

const BUCKET = "marketing";
const DEFAULT_TTL_SECONDS = 60 * 60;
const SIGN_RETRY_DELAY_MS = 250;

/**
 * 🔴 LOS LINKS DEL ZIP DURAN 30 DÍAS (22-sep-2026, Daniel). Antes duraban un
 * AÑO: un link firmado por un año es una puerta abierta a los papeles de la
 * casa que nadie puede cerrar, y el archivo que la marca recibe ya trae los
 * PDF y las fotos ADENTRO del ZIP — el link es una comodidad, no el respaldo.
 *
 * ⚠️ El default de `firmarPath` sigue siendo UNA HORA y no se toca: eso firma
 * lo que se mira dentro de la app (una foto, un comprobante), no lo que sale
 * de la casa.
 *
 * Vencido, se vuelve a firmar por `POST /api/marketing/zip/firmar-de-nuevo`.
 */
export { TTL_LINK_ZIP_SEGUNDOS, ttlDeLinkDelZip } from "./zip-e-impulsadoras";

export function esPathStorage(valor: string): boolean {
  return !/^https?:\/\//i.test(valor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function firmarPath(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  // Un archivo recién subido puede no estar propagado en Storage en el primer
  // intento de firma. Reintentar una vez tras una pausa corta cubre ese caso
  // transitorio (foto que "a veces no aparece") sin convertir un fallo real
  // en una espera larga.
  let lastError: string | null = null;
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await sleep(SIGN_RETRY_DELAY_MS);
    const { data, error } = await supabaseServer.storage
      .from(BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (data && !error) return data.signedUrl;
    lastError = error?.message ?? null;
  }
  throw new Error(lastError ?? "No se pudo firmar URL");
}

export async function firmarAdjunto(
  adjunto: MkAdjunto,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<MkAdjunto> {
  if (!esPathStorage(adjunto.url)) return adjunto;
  try {
    const signedUrl = await firmarPath(adjunto.url, ttlSeconds);
    return { ...adjunto, url: signedUrl };
  } catch (err) {
    console.warn(
      `firmarAdjunto: no se pudo firmar ${adjunto.id}`,
      err instanceof Error ? err.message : err,
    );
    return adjunto;
  }
}

export async function firmarAdjuntos(
  adjuntos: ReadonlyArray<MkAdjunto>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<MkAdjunto[]> {
  return Promise.all(adjuntos.map((a) => firmarAdjunto(a, ttlSeconds)));
}

/**
 * Firma un path del bucket `marketing` con el TTL de los ZIP (30 días hoy).
 * Es el único lugar por el que se firma lo que SALE de la casa.
 */
export async function firmarPathDelZip(path: string): Promise<string> {
  return firmarPath(path, ttlDeLinkDelZip());
}

/**
 * Guarda el ZIP que se acaba de bajar, en `marketing/periodos/<id>/<fecha>.zip`.
 *
 * 🔴 FALLA ABIERTA: si Storage no acepta el archivo, la descarga NO se cae —
 * el encargado igual recibe su ZIP. Devuelve el path guardado o `null`.
 * Dos descargas del mismo período el mismo día escriben el MISMO archivo
 * (upsert): es el ZIP de ese día, y los dos quedan anotados igual.
 */
export async function guardarZipDelPeriodo(
  periodoId: string,
  fechaISO: string,
  bytes: Buffer,
): Promise<string | null> {
  const path = pathDelZipGuardado(periodoId, fechaISO);
  try {
    const { error } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(error.message);
    return path;
  } catch (err) {
    console.warn(
      "guardarZipDelPeriodo: no se pudo guardar el ZIP",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
