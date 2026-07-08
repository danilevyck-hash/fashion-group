// Subida de foto de producto Joybees con compresión cliente. Espejo del
// photoUpload.ts de Reebok: reusa el endpoint /api/catalogo/joybees/upload
// (file + sku → path determinístico) y luego POST /api/catalogo/joybees/products
// con { sku, image_url } (allow-list del endpoint). Comprime para no exceder el
// límite de body de Vercel (~4.5MB → fotos de celular daban 413), timeout, y
// LANZA Error con mensaje legible (nunca un spinner colgado / fallo silencioso).
//
// Nota: Joybees NO edita etiquetas por fila (decisión del dueño) — este archivo
// solo sube foto. La única diferencia con Reebok es el identificador (sku, no id)
// y que el update va por POST (no PUT).

const MIN_BYTES = 5 * 1024;            // espejo de upload/route.ts (>5KB)
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIMENSION = 1600;            // lado mayor
const JPEG_QUALITY = 0.82;
const UPLOAD_TIMEOUT_MS = 45_000;

export function validateJoybeesPhoto(file: File): string | null {
  if (file.type && !ALLOWED.includes(file.type)) return "Ese archivo no es una imagen válida. Usa JPG, PNG o WEBP.";
  if (file.size < MIN_BYTES) return "La imagen es muy pequeña o está dañada (mínimo 5KB).";
  if (file.size > 50 * 1024 * 1024) return "La imagen es demasiado grande para procesar (máximo 50MB).";
  return null;
}

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("no se pudo leer la imagen"));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Redimensiona a 1600px (nunca agranda) y exporta JPEG 0.82. Tolerante a fallos:
// si algo sale mal o no achica, devuelve el archivo original.
async function compress(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file;
  try {
    const { src, w, h, close } = await decode(file);
    const longest = Math.max(w, h);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) { close(); return file; }
    ctx.drawImage(src, 0, 0, tw, th);
    close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Sube la foto de un producto y actualiza joybees_products.image_url. Lanza Error
 * con mensaje legible si falla (server/red/timeout) → el caller siempre puede
 * mostrar el error y nunca queda un spinner infinito. Devuelve la URL nueva.
 */
export async function uploadJoybeesPhoto(sku: string, file: File): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const toSend = await compress(file);
    const fd = new FormData();
    fd.append("file", toSend);
    if (sku) fd.append("sku", sku); // path determinístico → re-subir sobrescribe
    const upRes = await fetch("/api/catalogo/joybees/upload", { method: "POST", body: fd, signal: controller.signal });
    if (!upRes.ok) {
      const body = await upRes.json().catch(() => null);
      throw new Error(body?.error || `No se pudo subir la foto (error ${upRes.status}).`);
    }
    const { url } = await upRes.json();
    // Solo { sku, image_url }: el endpoint tiene allow-list y rechaza el resto.
    // Mandar el producto entero pisaría active/stock/price del cron.
    const putRes = await fetch("/api/catalogo/joybees/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, image_url: url }),
    });
    if (!putRes.ok) {
      const body = await putRes.json().catch(() => null);
      throw new Error(body?.error || "La foto se subió pero no se pudo guardar en el producto.");
    }
    return url as string;
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
