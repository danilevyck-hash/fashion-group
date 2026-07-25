// Subida de foto de producto del admin de catálogos — módulo ÚNICO por marca
// (PR-2, antes gemelos Reebok/Joybees). Reusa el endpoint /api/catalogo/[marca]/
// upload (file + sku → path determinístico) y luego guarda image_url en el
// producto con el verbo/identificador de la marca (QUIRK 5: Reebok PUT por id,
// Joybees POST por sku — MARCA_THEME.admin.productEdit). Compresión cliente
// para no exceder el límite de body de Vercel (~4.5MB → fotos de celular daban
// 413), timeout, y LANZA Error con mensaje legible (nunca un spinner colgado).

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

const MIN_BYTES = 5 * 1024;            // espejo de upload/route.ts (>5KB)
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIMENSION = 1600;            // lado mayor
const JPEG_QUALITY = 0.82;
const UPLOAD_TIMEOUT_MS = 45_000;

export function validateProductPhoto(file: File): string | null {
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
 * Actualiza la etiqueta (badge) de un producto. `badge` null = sin etiqueta.
 * Solo marcas con badgeEditable (Reebok — PUT por id). Lanza Error con mensaje
 * legible si falla (server/red/timeout) → el caller siempre puede mostrar el
 * error y revertir el optimista.
 */
const BADGE_TIMEOUT_MS = 15_000;

export async function updateProductBadge(marca: MarcaUiKey, productId: string, badge: string | null): Promise<void> {
  const theme = getMarcaTheme(marca)!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BADGE_TIMEOUT_MS);
  try {
    const res = await fetch(`${theme.api}/products`, {
      method: theme.admin.productEdit.verb,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId, badge }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "No se pudo guardar la etiqueta.");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tardó demasiado. Revisa tu conexión e intenta de nuevo.");
    }
    if (err instanceof Error) throw err;
    throw new Error("No se pudo guardar la etiqueta.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Renombra un producto (solo marcas con nombreEditable — Tommy). El endpoint
 * marca nombre_manual=true → el sync deja de pisar el nombre. Lanza Error con
 * mensaje legible si falla.
 */
export async function editProductName(
  marca: MarcaUiKey,
  producto: { id: string; sku: string },
  name: string,
): Promise<void> {
  const theme = getMarcaTheme(marca)!;
  const body =
    theme.admin.productEdit.idField === "id"
      ? { id: producto.id, name }
      : { sku: producto.sku, name };
  const res = await fetch(`${theme.api}/products`, {
    method: theme.admin.productEdit.verb,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error || "No se pudo guardar el nombre.");
  }
}

/**
 * Toggle "Ocultar del catálogo / Mostrar en catálogo" (oculto_manual) vía
 * PATCH { id|sku, oculto } según la marca. El flag sobrevive al sync.
 */
export async function toggleProductOculto(
  marca: MarcaUiKey,
  producto: { id: string; sku: string },
  oculto: boolean,
): Promise<void> {
  const theme = getMarcaTheme(marca)!;
  const body =
    theme.admin.productEdit.idField === "id"
      ? { id: producto.id, oculto }
      : { sku: producto.sku, oculto };
  const res = await fetch(`${theme.api}/products`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error || "No se pudo actualizar el producto.");
  }
}

/**
 * Sube la foto de un producto y actualiza image_url en el producto. Lanza Error
 * con mensaje legible si falla (server/red/timeout) → el caller siempre puede
 * mostrar el error y nunca queda un spinner infinito. Devuelve la URL nueva.
 */
export async function uploadProductPhoto(
  marca: MarcaUiKey,
  producto: { id: string; sku: string },
  file: File,
): Promise<string> {
  const theme = getMarcaTheme(marca)!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const toSend = await compress(file);
    const fd = new FormData();
    fd.append("file", toSend);
    if (producto.sku) fd.append("sku", producto.sku); // path determinístico → re-subir sobrescribe
    const upRes = await fetch(`${theme.api}/upload`, { method: "POST", body: fd, signal: controller.signal });
    if (!upRes.ok) {
      const body = await upRes.json().catch(() => null);
      throw new Error(body?.error || `No se pudo subir la foto (error ${upRes.status}).`);
    }
    const { url } = await upRes.json();
    // QUIRK 5 (respetado desde la UI): Reebok edita por id vía PUT; Joybees por
    // sku vía POST. Solo { id|sku, image_url } — los endpoints tienen allow-list
    // y mandar el producto entero pisaría active/stock/price del cron.
    const body =
      theme.admin.productEdit.idField === "id"
        ? { id: producto.id, image_url: url }
        : { sku: producto.sku, image_url: url };
    const putRes = await fetch(`${theme.api}/products`, {
      method: theme.admin.productEdit.verb,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const b = await putRes.json().catch(() => null);
      throw new Error(b?.error || "La foto se subió pero no se pudo guardar en el producto.");
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
