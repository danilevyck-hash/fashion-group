import JSZip from "jszip";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { buildBulkReclamosExcel, type ReclamoFull } from "./excel-bulk";
import { FACTURA_BUCKET } from "./factura-storage";
import { reclamoFolder, fotoPath } from "./zip-paths";

const BUCKET = "reclamo-fotos";
const MAX_DIM = 1600; // px — lado mayor tras redimensionar
const JPEG_QUALITY = 70;
const PHOTO_CONCURRENCY = 4; // descargas+compresiones simultáneas

interface ContactoLike {
  nombre?: string;
  nombre_contacto?: string;
  correo?: string;
}

export interface ZipResult {
  buffer: Buffer;
  fotosIncluidas: number;
  fotosOmitidas: number;
  pdfsIncluidos: number;
  pdfsOmitidos: number;
}

/**
 * Descarga una foto del Storage y la comprime a JPEG (~1600px / calidad 70).
 * Devuelve null si la foto no existe o falla la compresión (se omite, no rompe el ZIP).
 */
async function compressPhoto(storagePath: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabaseServer.storage.from(BUCKET).download(storagePath);
    if (error || !data) return null;
    const input = Buffer.from(await data.arrayBuffer());
    const out = await sharp(input)
      .rotate() // respeta la orientación EXIF (fotos de celular)
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return out;
  } catch {
    return null;
  }
}

/**
 * Descarga el PDF de factura del bucket privado `reclamo-facturas` (service role).
 * Devuelve null si no hay path o falla la descarga (se omite, no rompe el ZIP).
 */
async function downloadFactura(path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabaseServer.storage.from(FACTURA_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Arma un ZIP "todo en uno", UNA carpeta por RECLAMO:
 *   Resumen.xlsx                              (resumen + hoja por reclamo, con links)
 *   {nro_reclamo}/factura.pdf                 (PDF de la factura, si existe)
 *   {nro_reclamo}/fotos/foto_N.jpg            (fotos comprimidas)
 *
 * Los hyperlinks del Excel apuntan a estas rutas relativas → abren los archivos
 * del propio ZIP (no expiran). Single reclamo y bulk comparten este código.
 */
export async function buildReclamosZip(
  reclamos: ReclamoFull[],
  empresa: string,
  contacto: ContactoLike | null,
): Promise<ZipResult> {
  const zip = new JSZip();

  // 1) Excel resumen (links relativos a los archivos del ZIP)
  const xlsx = await buildBulkReclamosExcel(reclamos, empresa, contacto, { relative: true });
  zip.file("Resumen.xlsx", xlsx);

  let fotosIncluidas = 0;
  let fotosOmitidas = 0;
  let pdfsIncluidos = 0;
  let pdfsOmitidos = 0;

  // 2) Factura PDF por reclamo (bucket privado) → {nro_reclamo}/factura.pdf
  for (let i = 0; i < reclamos.length; i += PHOTO_CONCURRENCY) {
    const batch = reclamos.slice(i, i + PHOTO_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (rec) => ({
        rec,
        buf: rec.factura_pdf_path ? await downloadFactura(rec.factura_pdf_path) : null,
      })),
    );
    for (const { rec, buf } of results) {
      if (!rec.factura_pdf_path) continue; // sin factura → no aplica (no cuenta como omitida)
      if (!buf) { pdfsOmitidos++; continue; }
      zip.file(`${reclamoFolder(rec.nro_reclamo)}/factura.pdf`, buf);
      pdfsIncluidos++;
    }
  }

  // 3) Lista plana de fotos (con su reclamo y un índice 1-based por reclamo)
  const tasks: { rec: ReclamoFull; storagePath: string; idx: number }[] = [];
  for (const rec of reclamos) {
    const fotos = rec.reclamo_fotos || [];
    fotos.forEach((f, i) => {
      if (f?.storage_path) tasks.push({ rec, storagePath: f.storage_path, idx: i + 1 });
    });
  }

  // 4) Procesa fotos en lotes con concurrencia limitada → {nro_reclamo}/fotos/foto_N.jpg
  for (let i = 0; i < tasks.length; i += PHOTO_CONCURRENCY) {
    const batch = tasks.slice(i, i + PHOTO_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (t) => ({ t, buf: await compressPhoto(t.storagePath) })),
    );
    for (const { t, buf } of results) {
      if (!buf) {
        fotosOmitidas++;
        continue;
      }
      zip.file(fotoPath(t.rec.nro_reclamo, t.idx), buf);
      fotosIncluidas++;
    }
  }

  const buffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })) as Buffer;

  return { buffer, fotosIncluidas, fotosOmitidas, pdfsIncluidos, pdfsOmitidos };
}
