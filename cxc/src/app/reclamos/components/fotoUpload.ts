import { Foto } from "./types";

// Subida de fotos de reclamo con manejo de error robusto. El bug que arreglamos:
// el uploader viejo solo hacía console.error en fallo (silencioso) y NO tenía
// try/catch ni timeout → una subida colgada dejaba "Subiendo..." para siempre.
// Aquí: validación previa + AbortController (timeout) + Error con mensaje claro.

const FOTO_MIN_BYTES = 5 * 1024; // espejo de upload/route.ts (>5KB)
// Tope de sanidad sobre el ORIGINAL (antes de comprimir): solo bloquea archivos
// absurdos que harían colapsar el canvas. Las fotos normales de celular (3-12MB)
// pasan y se comprimen. El límite real de subida lo resuelve la compresión.
const FOTO_MAX_MB = 50;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const UPLOAD_TIMEOUT_MS = 45_000;

// Compresión en cliente: el endpoint corre en Vercel, cuyo límite de body de
// función es ~4.5MB → fotos de celular grandes daban 413. Redimensionamos a
// 1600px (lado mayor) y exportamos JPEG q0.8 → típico 150-500KB, holgadamente
// bajo 4.5MB, conservando detalle suficiente para ver el defecto reclamado.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];

/** Ajustes de `compressImage`. Omitirlos deja EXACTAMENTE el comportamiento de
 *  siempre (1600 px · JPEG 0.8), que es el que necesitan Reclamos y Mobiliario. */
export interface OpcionesCompresion {
  /** Lado mayor máximo, en píxeles. */
  maxDimension?: number;
  /** Calidad JPEG, 0-1. */
  quality?: number;
}

/** Valida tipo/tamaño ANTES de subir. Devuelve mensaje de error o null si OK. */
export function validateFotoFile(file: File): string | null {
  if (file.type && !ALLOWED.includes(file.type)) {
    return "Ese archivo no es una imagen válida. Usa JPG, PNG o WEBP.";
  }
  if (file.size < FOTO_MIN_BYTES) {
    return "La imagen es muy pequeña o está dañada (mínimo 5KB).";
  }
  if (file.size > FOTO_MAX_MB * 1024 * 1024) {
    return `La imagen es demasiado grande para procesar (máximo ${FOTO_MAX_MB}MB).`;
  }
  return null;
}

// El comprobante (a diferencia de las fotos de evidencia) también acepta PDF.
// Los PDF no pasan por compresión, así que el tope es el límite real de body
// de la función en Vercel (~4.5MB) con margen.
const PDF_MAX_MB = 4;

/** Valida el archivo de COMPROBANTE: foto (mismas reglas que las fotos) o PDF. */
export function validateComprobanteFile(file: File): string | null {
  const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (esPdf) {
    if (file.size > PDF_MAX_MB * 1024 * 1024) {
      return `El PDF es demasiado grande (máximo ${PDF_MAX_MB}MB).`;
    }
    return null;
  }
  const err = validateFotoFile(file);
  if (err && file.type && !ALLOWED.includes(file.type)) {
    return "El comprobante debe ser una foto (JPG, PNG, WEBP) o un PDF.";
  }
  return err;
}

async function decodeImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation:"from-image" respeta el EXIF (foto de celular rotada).
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("no se pudo leer la imagen"));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Comprime/redimensiona en el cliente para no exceder el límite de body del
 * endpoint (≈4.5MB en Vercel). No agranda imágenes ya pequeñas, y si el
 * resultado no es más liviano conserva el original. Tolerante a fallos: si algo
 * sale mal (formato raro, canvas no disponible) devuelve el archivo tal cual —
 * el manejo de error/413 de la subida sigue cubriendo el caso extremo.
 *
 * `opts` permite pedir OTRO tamaño sin escribir un segundo compresor: el
 * Depurador pega miniaturas dentro de un Excel y necesita ~300 px, no 1600
 * (203 fotos a 1600 px darían un archivo imposible de abrir). **Sin `opts` el
 * comportamiento es el de siempre**, así que Reclamos y Mobiliario no cambian.
 */
export async function compressImage(file: File, opts: OpcionesCompresion = {}): Promise<File> {
  const maxDimension = opts.maxDimension ?? MAX_DIMENSION;
  const quality = opts.quality ?? JPEG_QUALITY;
  if (!COMPRESSIBLE.includes(file.type)) return file; // gif/avif → tal cual
  try {
    const { src, w, h, close } = await decodeImage(file);
    const longest = Math.max(w, h);
    const scale = longest > maxDimension ? maxDimension / longest : 1; // nunca agranda
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) { close(); return file; }
    ctx.drawImage(src, 0, 0, tw, th);
    close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // ya era más chico → conserva original
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // fallback seguro
  }
}

/**
 * Sube UNA foto a un reclamo existente. Lanza Error con un mensaje legible si el
 * server rechaza, si hay error de red, o si la subida se cuelga (timeout) — así
 * el caller SIEMPRE puede mostrar el fallo y nunca queda un spinner infinito.
 */
export async function uploadReclamoFoto(reclamoId: string, file: File): Promise<Foto> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    // Comprime ANTES de subir → elimina el 413 (foto muy pesada).
    const toSend = await compressImage(file);
    const fd = new FormData();
    fd.append("file", toSend);
    const res = await fetch(`/api/reclamos/${reclamoId}/fotos`, {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `No se pudo subir la foto (error ${res.status}).`);
    }
    return (await res.json()) as Foto;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.");
    }
    if (err instanceof Error) throw err;
    throw new Error("No se pudo subir la foto. Intenta de nuevo.");
  } finally {
    clearTimeout(timer);
  }
}
