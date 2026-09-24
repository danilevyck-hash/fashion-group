// ─────────────────────────────────────────────────────────────────────────────
// EL BLOQUE QUE VIAJA AL MODELO: `document` para un PDF, `image` para una foto.
//
// Módulo PURO, sin el SDK adentro, para que el candado lo pueda leer sin
// levantar una conexión: la regla es de FORMA, no de red.
//
// 🔑 Por qué existe (24-sep-2026): el lector de facturas mandaba SIEMPRE un
// bloque `document` con `media_type: "application/pdf"`, así que desde el
// teléfono no se podía ni empezar un reclamo —la factura le llega a Andrea por
// correo, y a Daniel muchas veces en papel o por WhatsApp—. El MISMO modelo
// (`claude-sonnet-4-6`) lee una imagen igual de bien; lo único que había que
// cambiar es cómo se le entrega el archivo.
//
// 🔴 EL PROMPT, EL MODELO Y EL PARSER NO SE TOCAN. Acá solo se elige la forma
// del bloque según el tipo del archivo.
//
// 🔴 LO QUE NO RECONOCE SE RECHAZA, no se adivina: mandar un .docx como si
// fuera un PDF devuelve un error del proveedor que nadie sabe leer. Mejor
// frenar acá, con una frase en español.
// ─────────────────────────────────────────────────────────────────────────────

/** El PDF de siempre. Es el default en todos lados: nada cambia sin pedirlo. */
export const TIPO_PDF = "application/pdf";

/** Las fotos que el modelo lee — las mismas que sabe achicar el navegador. */
export const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type TipoImagen = (typeof TIPOS_IMAGEN)[number];
export type TipoQueLee = typeof TIPO_PDF | TipoImagen;

/** true si el modelo sabe recibir un archivo de ese tipo. */
export function esTipoQueLee(v: unknown): v is TipoQueLee {
  return v === TIPO_PDF || (TIPOS_IMAGEN as readonly string[]).includes(String(v));
}

export interface BloqueDocumento {
  type: "document";
  source: { type: "base64"; media_type: typeof TIPO_PDF; data: string };
}
export interface BloqueImagen {
  type: "image";
  source: { type: "base64"; media_type: TipoImagen; data: string };
}
export type BloqueDeArchivo = BloqueDocumento | BloqueImagen;

/**
 * El bloque de contenido para un archivo ya en base64.
 *
 * - `application/pdf` → `document` (lo de siempre, byte por byte).
 * - una imagen → `image`.
 * - cualquier otra cosa → LANZA, con el mensaje que ve quien sube el archivo.
 */
export function bloqueDeArchivo(mediaType: string, base64: string): BloqueDeArchivo {
  if (mediaType === TIPO_PDF) {
    return { type: "document", source: { type: "base64", media_type: TIPO_PDF, data: base64 } };
  }
  if (esTipoQueLee(mediaType)) {
    return { type: "image", source: { type: "base64", media_type: mediaType as TipoImagen, data: base64 } };
  }
  throw new Error("Ese archivo no se puede leer: manda un PDF o una foto.");
}

/**
 * El tipo de un archivo deducido de su NOMBRE (o de su ruta en el bucket).
 *
 * Se usa cuando el archivo ya está guardado y lo único que queda es el path:
 * el bucket no devuelve el `Content-Type` en todas las lecturas. Sin extensión
 * conocida cae en PDF, que es como se comportó siempre.
 */
export function tipoPorNombre(nombre: string): TipoQueLee {
  const limpio = nombre.toLowerCase().split("?")[0];
  if (limpio.endsWith(".jpg") || limpio.endsWith(".jpeg")) return "image/jpeg";
  if (limpio.endsWith(".png")) return "image/png";
  if (limpio.endsWith(".webp")) return "image/webp";
  if (limpio.endsWith(".gif")) return "image/gif";
  return TIPO_PDF;
}
