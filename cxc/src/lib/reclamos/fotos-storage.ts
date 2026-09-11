// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LAS FOTOS Y LOS COMPROBANTES YA NO ABREN SIN SESIÓN (11-sep-2026).
//
// Daniel, textual: *«Link público ciérralo»*. El bucket `reclamo-fotos` era
// PÚBLICO: la URL de cada foto —y la de los 5 comprobantes de pago que viven
// en el mismo bucket— abría sin ninguna sesión. Marketing y las cédulas de
// Asistencia hacen lo contrario: bucket privado y URL firmada de vida corta
// generada en el servidor solo para quien tiene el módulo.
//
// La migración 20261111120000 pone el bucket en privado. Este módulo firma:
//   · el detalle (`GET /api/reclamos/[id]`) firma cada foto y el comprobante
//     con 1 h;
//   · la galería que ve el PROVEEDOR (`/reclamos/galeria/[id]`, con su token
//     HMAC de siempre en el link del Excel) firma al cargar, así el link del
//     correo NO se rompe: el token abre la página y la página firma fresco;
//   · la subida devuelve la URL firmada para la miniatura de ese momento.
//
// `reclamo_fotos.url` (la URL pública guardada) queda sin lectores: la verdad
// es `storage_path`. Patrón espejo de `factura-storage.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

export const FOTOS_BUCKET = "reclamo-fotos";
const TTL_PANTALLA_SEG = 60 * 60; // 1 h: lo que dura abierta una ficha
const REINTENTO_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Firma un path del bucket privado de fotos. Reintenta una vez (recién subido). */
export async function firmarFotoPath(path: string, ttlSeg: number = TTL_PANTALLA_SEG): Promise<string> {
  let ultimo: string | null = null;
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await sleep(REINTENTO_MS);
    const { data, error } = await supabaseServer.storage.from(FOTOS_BUCKET).createSignedUrl(path, ttlSeg);
    if (data && !error) return data.signedUrl;
    ultimo = error?.message ?? null;
  }
  throw new Error(ultimo ?? "No se pudo firmar la foto");
}

/** Firma sin lanzar: null si falla, para no romper la ficha por una foto. */
export async function firmarFotoPathSafe(path: string | null | undefined, ttlSeg?: number): Promise<string | null> {
  if (!path) return null;
  try {
    return await firmarFotoPath(path, ttlSeg);
  } catch (err) {
    console.warn("firmarFotoPathSafe:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Firma en lote: devuelve las fotos con `url` firmada (o vacía si no se pudo). */
export async function firmarFotos<T extends { storage_path: string }>(fotos: readonly T[], ttlSeg?: number): Promise<(T & { url: string })[]> {
  return Promise.all(
    fotos.map(async (f) => ({ ...f, url: (await firmarFotoPathSafe(f.storage_path, ttlSeg)) ?? "" })),
  );
}
