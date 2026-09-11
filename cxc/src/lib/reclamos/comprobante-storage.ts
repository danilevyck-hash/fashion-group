// Subida del COMPROBANTE de un reclamo (foto o PDF) al bucket reclamo-fotos,
// subcarpeta /comprobante. Compartida por /en-proceso (adjunto opcional al
// avanzar) y /comprobante (adjuntar sin cambiar estado, requisito para Pagado).
//
// 🔴 Desde el 11-sep-2026 el bucket es PRIVADO («Link público ciérralo»): lo
// que se guarda es el PATH; la URL se firma en el detalle con vida corta
// (`fotos-storage.ts`). `url` acá es esa firma del momento, para responder.

import { supabaseServer } from "@/lib/supabase-server";
import { FOTOS_BUCKET, firmarFotoPathSafe } from "./fotos-storage";

export interface ComprobanteSubido {
  /** URL firmada de vida corta (para responder); en la fila va NULL. */
  url: string;
  path: string;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** true si el archivo es un PDF (por MIME o extensión). */
export function esPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Sube el comprobante y devuelve {url, path}, o null si falló la subida. */
export async function subirComprobante(reclamoId: string, file: File): Promise<ComprobanteSubido | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() || (esPdf(file) ? "pdf" : "jpg");
  const storagePath = `${reclamoId}/comprobante/${crypto.randomUUID()}.${ext}`;
  const contentType = file.type || CONTENT_TYPES[ext] || "image/jpeg";

  const { error } = await supabaseServer.storage
    .from(FOTOS_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    console.error("Comprobante upload error:", JSON.stringify(error));
    return null;
  }
  return { url: (await firmarFotoPathSafe(storagePath)) ?? "", path: storagePath };
}
