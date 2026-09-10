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
  impulsadoraId?: string;
}): Promise<UploadUrlResponse> {
  const res = await fetch("/api/marketing/adjuntos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyectoId: args.proyectoId,
      facturaId: args.facturaId,
      impulsadoraId: args.impulsadoraId,
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

/**
 * 🔴 CUELGA EL PDF DE UNA FACTURA — Y NUNCA LO SUBE DOS VECES (10-sep-2026).
 *
 * Si el archivo YA se subió (para que la IA pudiera leerlo), lo único que
 * falta es registrar el adjunto con ESE MISMO `path`. Volver a subirlo dejaría
 * dos copias del mismo PDF en el bucket privado y la ficha mostrando dos
 * comprobantes iguales.
 *
 * Vive acá, y no dentro de una pantalla, porque las DOS puertas que crean una
 * factura con PDF hacen exactamente esto: «Registrar gasto» y la sección de
 * facturas del proyecto.
 *
 * Tira si algo falla — el gasto YA quedó guardado cuando esto corre, así que
 * quien llama lo dice con un aviso y no revienta el guardado.
 */
export async function adjuntarPdfDeFactura(args: {
  facturaId: string;
  file: File;
  /** El `path` en Storage si el PDF ya se subió antes. */
  pathPreSubido?: string | null;
}): Promise<void> {
  let path = (args.pathPreSubido ?? "").trim();
  if (!path) {
    const subida = await pedirUploadUrl({ file: args.file, facturaId: args.facturaId });
    await subirArchivoAStorage(subida.uploadUrl, args.file);
    path = subida.path;
  }
  const res = await fetch("/api/marketing/adjuntos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facturaId: args.facturaId,
      tipo: "pdf_factura",
      url: path,
      nombreOriginal: args.file.name,
      sizeBytes: args.file.size,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "No se pudo registrar el comprobante");
  }
}
