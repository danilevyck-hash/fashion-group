import { supabaseServer } from "@/lib/supabase-server";
import type { MkAdjunto } from "./types";

const BUCKET = "marketing";
const DEFAULT_TTL_SECONDS = 60 * 60;
const SIGN_RETRY_DELAY_MS = 250;

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
