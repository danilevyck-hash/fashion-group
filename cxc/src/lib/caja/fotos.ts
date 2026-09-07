/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA FOTO DEL RECIBO (7-sep-2026).
 *
 * Daniel, textual: *«que sea opcional y también que se pueda hacer drop»*.
 *
 * 🔴 OPCIONAL, nunca obligatoria: 34 de los 77 recibos vivos no tienen ni
 * número de factura, así que exigir la foto dejaría la caja sin poder cargarse.
 *
 * Sigue la regla 3 de la casa, sin excepciones:
 *   · UN solo cuadro, no uno por tipo de archivo;
 *   · se ARRASTRA y se TOCA, siempre las dos;
 *   · la lista SUMA: volver a elegir agrega, no reemplaza, y el mismo archivo
 *     dos veces no entra dos veces;
 *   · se quita uno sin perder los demás;
 *   · sin botón de guardar: sube solo apenas cae.
 *
 * Módulo PURO: decide qué se acepta y cómo se nombra. No sube nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo que la cámara de un teléfono y un escáner producen. Nada más. */
export const TIPOS_FOTO_ACEPTADOS = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
] as const;

/** Lo que se le pasa al `accept` del campo y a la cámara del celular. */
export const ACCEPT_FOTO = "image/*,application/pdf";

/** 12 MB: una foto de iPhone pesa 2-4 MB; un PDF escaneado, menos. */
export const MAX_BYTES_FOTO = 12 * 1024 * 1024;

export const BUCKET_FOTOS_CAJA = "caja-recibos";

export interface ArchivoDeRecibo {
  nombre: string;
  tipo: string;
  bytes: number;
}

/**
 * ¿Se puede subir este archivo? Devuelve `null` cuando sí, y si no, el mensaje
 * tal como se lee en pantalla: qué pasó · qué significa · qué hacer.
 */
export function validarArchivoFoto(archivo: ArchivoDeRecibo): string | null {
  const tipo = String(archivo.tipo || "").toLowerCase();
  const aceptado = (TIPOS_FOTO_ACEPTADOS as readonly string[]).includes(tipo);
  if (!aceptado) {
    return `«${archivo.nombre}» no es una foto ni un PDF. Adjunta la foto del recibo o el PDF escaneado.`;
  }
  if (archivo.bytes > MAX_BYTES_FOTO) {
    return `«${archivo.nombre}» pesa más de ${Math.round(MAX_BYTES_FOTO / (1024 * 1024))} MB. Sácale la foto de nuevo con menos calidad o mándala como PDF.`;
  }
  if (archivo.bytes <= 0) {
    return `«${archivo.nombre}» llegó vacío. Vuelve a elegirlo.`;
  }
  return null;
}

/** Extensión que le toca al archivo guardado, derivada de su tipo. */
export function extensionDeFoto(tipo: string, nombre: string): string {
  const delNombre = /\.([0-9a-z]{1,5})$/i.exec(String(nombre || ""));
  if (delNombre) return delNombre[1].toLowerCase();
  const t = String(tipo || "").toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/heic" || t === "image/heif") return "heic";
  return "jpg";
}

/**
 * Dónde vive el archivo dentro del bucket: una carpeta por gasto. El nombre lo
 * pone el servidor (nunca el que traía el archivo, que puede venir con
 * cualquier cosa adentro).
 */
export function rutaDeFoto(gastoId: string, fotoId: string, tipo: string, nombre: string): string {
  return `${gastoId}/${fotoId}.${extensionDeFoto(tipo, nombre)}`;
}

export interface FotoDeRecibo {
  id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  bytes?: number | null;
}

/**
 * 🔴 LA LISTA SUMA. Agrega los nuevos a los que ya están y descarta los que ya
 * estaban — el mismo archivo elegido dos veces no entra dos veces. Se reconocen
 * por nombre + tamaño, que es lo único que un navegador da antes de subir.
 */
export function sumarArchivos<T extends ArchivoDeRecibo>(actuales: T[], nuevos: T[]): T[] {
  const clave = (a: ArchivoDeRecibo) => `${a.nombre.trim().toLowerCase()}|${a.bytes}`;
  const vistos = new Set(actuales.map(clave));
  const suma = [...actuales];
  for (const n of nuevos) {
    const k = clave(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    suma.push(n);
  }
  return suma;
}

/** Quita UNO de la lista sin tocar a los demás. */
export function quitarArchivo<T extends ArchivoDeRecibo>(actuales: T[], indice: number): T[] {
  return actuales.filter((_, i) => i !== indice);
}
