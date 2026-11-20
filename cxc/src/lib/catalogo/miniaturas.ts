// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA ÚNICA PUERTA PARA GUARDAR UNA FOTO DE CATÁLOGO (19-nov-2026).
//
// Daniel: «arregla lo de que la foto no suba por otro camino. Todo tiene que
// ir en orden.» Toda foto que entra al bucket `product-images` sale de aquí con
// sus dos miniaturas WebP (600 y 160 px de ancho) al lado, en la ruta derivada
// `rutaMiniatura()` (lib/image-thumb.ts). Así las pantallas dejan de pedirle a
// Supabase que transforme la foto (`/render/image`, se cobra por foto).
//
// Dos formas de llamarla:
//   · con `original` → sube el original (igual que antes) y sus miniaturas
//     (subida de administración, /api/catalogo/[marca]/upload);
//   · sin `original` → el original YA está en Storage (lo subió el navegador
//     con un token firmado, el ZIP del B2B): se descarga y se hacen solo las
//     miniaturas. Lo llama `guardarFotoElegida`, el único que escribe
//     `image_url` para una variante.
//
// Si una miniatura falla, el original queda guardado y se dice en el log: el
// `onError` de la tarjeta cae al original, nunca una foto rota.
// Candado: src/__tests__/lib/fotos-catalogo-una-puerta.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANCHOS_MINIATURA, BUCKET_FOTOS, rutaMiniatura, type AnchoMiniatura } from "@/lib/image-thumb";

/** La calidad que pedía el render de Supabase. */
const CALIDAD = 70;
/** 1 año: las URLs llevan `?v=` propio, que cambia con cada foto nueva. */
const CACHE_CONTROL = "31536000";

/** Las dos miniaturas de una foto. Nunca agranda una foto chica. */
export async function generarMiniaturas(
  original: Buffer,
): Promise<{ ancho: AnchoMiniatura; bytes: Buffer }[]> {
  return Promise.all(
    ANCHOS_MINIATURA.map(async (ancho) => ({
      ancho,
      bytes: await sharp(original)
        .rotate()
        .resize({ width: ancho, height: ancho, fit: "inside", withoutEnlargement: true })
        .webp({ quality: CALIDAD })
        .toBuffer(),
    })),
  );
}

export async function guardarFotoConMiniaturas(
  db: SupabaseClient,
  ruta: string,
  original?: { bytes: Buffer; contentType: string },
): Promise<{ miniaturas: boolean; motivo?: string }> {
  const bucket = db.storage.from(BUCKET_FOTOS);
  let bytes = original?.bytes;
  if (original) {
    const { error } = await bucket.upload(ruta, original.bytes, {
      contentType: original.contentType,
      upsert: true,
      cacheControl: CACHE_CONTROL,
    });
    if (error) throw new Error(error.message);
  }
  try {
    if (!bytes) {
      const { data, error } = await bucket.download(ruta);
      if (error || !data) throw new Error(error?.message || "no se pudo leer el original");
      bytes = Buffer.from(await data.arrayBuffer());
    }
    for (const m of await generarMiniaturas(bytes)) {
      const { error } = await bucket.upload(rutaMiniatura(ruta, m.ancho), m.bytes, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: CACHE_CONTROL,
      });
      if (error) throw new Error(error.message);
    }
    return { miniaturas: true };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error(`[miniaturas] ${ruta}: ${motivo}`);
    return { miniaturas: false, motivo };
  }
}
