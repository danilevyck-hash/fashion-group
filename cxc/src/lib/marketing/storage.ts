import { supabaseServer } from "@/lib/supabase-server";
import type { MkAdjunto } from "./types";

const BUCKET = "marketing";
const DEFAULT_TTL_SECONDS = 60 * 60;

export function esPathStorage(valor: string): boolean {
  return !/^https?:\/\//i.test(valor);
}

export async function firmarPath(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo firmar URL");
  }
  return data.signedUrl;
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
