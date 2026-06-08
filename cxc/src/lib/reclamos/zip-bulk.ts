import JSZip from "jszip";
import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { buildBulkReclamosExcel, type ReclamoFull } from "./excel-bulk";

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
}

/** Limpia un texto para usarlo como nombre de carpeta/archivo dentro del ZIP. */
function sanitizeSegment(s: string | undefined, fallback: string): string {
  const clean = (s || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
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
 * Arma un ZIP "todo en uno":
 *   Resumen.xlsx                         (resumen + hoja por reclamo, incluye # Fotos)
 *   fotos/{nro_factura}/{nro_reclamo}_N.jpg   (comprimidas)
 *
 * El nombre de archivo se prefija con el N° de reclamo para evitar choques
 * si dos reclamos comparten número de factura.
 */
export async function buildReclamosZip(
  reclamos: ReclamoFull[],
  empresa: string,
  contacto: ContactoLike | null,
): Promise<ZipResult> {
  const zip = new JSZip();

  // 1) Excel resumen (reusa la generación existente)
  const xlsx = await buildBulkReclamosExcel(reclamos, empresa, contacto);
  zip.file("Resumen.xlsx", xlsx);

  // 2) Lista plana de fotos a procesar (con su reclamo y un índice 1-based)
  const tasks: { rec: ReclamoFull; storagePath: string; idx: number }[] = [];
  for (const rec of reclamos) {
    const fotos = rec.reclamo_fotos || [];
    fotos.forEach((f, i) => {
      if (f?.storage_path) tasks.push({ rec, storagePath: f.storage_path, idx: i + 1 });
    });
  }

  let fotosIncluidas = 0;
  let fotosOmitidas = 0;

  // 3) Procesa en lotes con concurrencia limitada
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
      const facturaDir = sanitizeSegment(t.rec.nro_factura, "sin-factura");
      const recName = sanitizeSegment(t.rec.nro_reclamo, "reclamo");
      zip.file(`fotos/${facturaDir}/${recName}_${t.idx}.jpg`, buf);
      fotosIncluidas++;
    }
  }

  const buffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })) as Buffer;

  return { buffer, fotosIncluidas, fotosOmitidas };
}
