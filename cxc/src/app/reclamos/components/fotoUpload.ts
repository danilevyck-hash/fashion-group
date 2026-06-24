import { Foto } from "./types";

// Subida de fotos de reclamo con manejo de error robusto. El bug que arreglamos:
// el uploader viejo solo hacía console.error en fallo (silencioso) y NO tenía
// try/catch ni timeout → una subida colgada dejaba "Subiendo..." para siempre.
// Aquí: validación previa + AbortController (timeout) + Error con mensaje claro.

const FOTO_MIN_BYTES = 5 * 1024; // espejo de upload/route.ts (>5KB)
export const FOTO_MAX_MB = 12;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const UPLOAD_TIMEOUT_MS = 45_000;

/** Valida tipo/tamaño ANTES de subir. Devuelve mensaje de error o null si OK. */
export function validateFotoFile(file: File): string | null {
  if (file.type && !ALLOWED.includes(file.type)) {
    return "Ese archivo no es una imagen válida. Usa JPG, PNG o WEBP.";
  }
  if (file.size < FOTO_MIN_BYTES) {
    return "La imagen es muy pequeña o está dañada (mínimo 5KB).";
  }
  if (file.size > FOTO_MAX_MB * 1024 * 1024) {
    return `La imagen pesa demasiado (máximo ${FOTO_MAX_MB}MB). Toma una más liviana.`;
  }
  return null;
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
    const fd = new FormData();
    fd.append("file", file);
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
