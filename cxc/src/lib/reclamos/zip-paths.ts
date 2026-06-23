// Rutas/segmentos de archivos dentro del ZIP de reclamos. Centralizado para que
// el armado del ZIP (zip-bulk.ts) y los hyperlinks del Excel (excel-bulk.ts /
// excel-reclamo.ts) usen EXACTAMENTE las mismas rutas relativas → los links del
// Excel abren los archivos que van en el mismo ZIP (no expiran).
//
// Estructura por reclamo:
//   {nro_reclamo}/factura.pdf
//   {nro_reclamo}/fotos/foto_N.jpg

/** Limpia un texto para usarlo como nombre de carpeta/archivo dentro del ZIP. */
export function sanitizeSegment(s: string | undefined | null, fallback: string): string {
  const clean = (s || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

/** Carpeta del reclamo dentro del ZIP (= N° de reclamo saneado). */
export function reclamoFolder(nroReclamo: string | undefined | null): string {
  return sanitizeSegment(nroReclamo, "reclamo");
}

/** Ruta relativa de la factura PDF dentro del ZIP. */
export function facturaPath(nroReclamo: string | undefined | null): string {
  return `${reclamoFolder(nroReclamo)}/factura.pdf`;
}

/** Carpeta de fotos del reclamo dentro del ZIP. */
export function fotosFolder(nroReclamo: string | undefined | null): string {
  return `${reclamoFolder(nroReclamo)}/fotos/`;
}

/** Ruta relativa de la foto N (1-based) dentro del ZIP. */
export function fotoPath(nroReclamo: string | undefined | null, idx: number): string {
  return `${reclamoFolder(nroReclamo)}/fotos/foto_${idx}.jpg`;
}
