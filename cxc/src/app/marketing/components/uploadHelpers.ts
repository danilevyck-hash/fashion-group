import type { TipoAdjunto } from "@/lib/marketing/types";

interface UploadUrlResponse {
  uploadUrl: string;
  token: string;
  path: string;
}

export async function pedirUploadUrl(args: {
  file: File;
  proyectoId?: string;
  facturaId?: string;
}): Promise<UploadUrlResponse> {
  const res = await fetch("/api/marketing/adjuntos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyectoId: args.proyectoId,
      facturaId: args.facturaId,
      filename: args.file.name,
      contentType: args.file.type,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "No se pudo generar URL de subida");
  }
  return (await res.json()) as UploadUrlResponse;
}

export async function subirArchivoAStorage(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("No se pudo subir el archivo");
}

interface UploadArgs {
  file: File;
  proyectoId?: string;
  facturaId?: string;
  tipo: TipoAdjunto;
}

export interface AdjuntoCreado {
  id: string;
  url: string;
  nombre_original: string | null;
  size_bytes: number | null;
  tipo: TipoAdjunto;
}

/**
 * Sube un archivo al bucket 'marketing' via signed URL y registra la fila
 * en mk_adjuntos. Devuelve el adjunto creado.
 *
 * Fallo si cualquier paso falla — el caller debe atrapar y mostrar toast.
 */
export async function subirAdjunto({
  file,
  proyectoId,
  facturaId,
  tipo,
}: UploadArgs): Promise<AdjuntoCreado> {
  // 1) Pedir signed upload URL
  const urlRes = await fetch("/api/marketing/adjuntos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyectoId,
      facturaId,
      filename: file.name,
      contentType: file.type,
    }),
  });
  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => null);
    throw new Error(err?.error ?? "No se pudo generar URL de subida");
  }
  const { uploadUrl, path } = (await urlRes.json()) as UploadUrlResponse;

  // 2) PUT del archivo al signed URL
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("No se pudo subir el archivo");
  }

  // 3) Registrar fila en mk_adjuntos
  const adjRes = await fetch("/api/marketing/adjuntos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyectoId,
      facturaId,
      tipo,
      url: path,
      nombreOriginal: file.name,
      sizeBytes: file.size,
    }),
  });
  if (!adjRes.ok) {
    const err = await adjRes.json().catch(() => null);
    throw new Error(err?.error ?? "No se pudo registrar el adjunto");
  }
  const data = (await adjRes.json()) as AdjuntoCreado;
  return data;
}
