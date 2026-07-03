// Subida del COMPROBANTE de un reclamo (foto o PDF) al bucket reclamo-fotos,
// subcarpeta /comprobante. Compartida por /en-proceso (adjunto opcional al
// avanzar) y /comprobante (adjuntar sin cambiar estado, requisito para Pagado).

import { supabaseServer } from "@/lib/supabase-server";

export interface ComprobanteSubido {
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
    .from("reclamo-fotos")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    console.error("Comprobante upload error:", JSON.stringify(error));
    return null;
  }
  const { data } = supabaseServer.storage.from("reclamo-fotos").getPublicUrl(storagePath);
  return { url: data.publicUrl, path: storagePath };
}
