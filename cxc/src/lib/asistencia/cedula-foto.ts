// ─────────────────────────────────────────────────────────────────────────────
// LA FOTO DE LA CÉDULA — qué se acepta y cómo se llama el archivo (10-sep-2026)
//
// Daniel: *«cédula que se pueda ver o descargar la foto»*.
//
// Módulo PURO, espejo de `lib/caja/fotos.ts`, que es el patrón de la casa para
// un adjunto privado. No toca la red ni la base: decide qué archivo entra y con
// qué nombre se guarda, y esas dos decisiones viven en UN lugar para que la
// pantalla y la ruta no puedan discrepar (una pantalla que acepta un archivo
// que el servidor rechaza es un error que solo aparece al soltar el archivo).
//
// 🔴 EL BUCKET ES PRIVADO. La cédula es un documento de identidad: se lee
// siempre por URL FIRMADA que vence, nunca por una dirección pública que
// funciona para siempre para cualquiera que la adivine.
// ─────────────────────────────────────────────────────────────────────────────

export const BUCKET_CEDULAS = "asistencia-cedulas";

/**
 * Cuánto vive el enlace. Una hora: es lo que dura mirar y descargar una foto,
 * y es el mismo número que usan Caja y Reclamos en su vista de detalle.
 */
export const SEGUNDOS_URL_FIRMADA = 60 * 60;

/**
 * Lo que de verdad manda un teléfono al fotografiar una cédula. El PDF entra
 * porque hay quien la escanea; el HEIC porque es lo que sale de un iPhone sin
 * tocar nada.
 */
export const TIPOS_CEDULA_ACEPTADOS = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
] as const;

/** Lo que se le dice al `<input type="file">`. La cámara del celular incluida. */
export const ACCEPT_CEDULA = "image/*,application/pdf";

/**
 * 12 MB. Una foto de cédula de un iPhone pesa 2-4 MB; 12 deja margen para un
 * escaneo grande y se queda cómodamente por debajo del techo de una función.
 */
export const MAX_BYTES_CEDULA = 12 * 1024 * 1024;

export interface ArchivoDeCedula {
  nombre: string;
  tipo: string;
  bytes: number;
}

const mb = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

/**
 * `null` = se puede subir. Si no, EL MENSAJE QUE VE LA PERSONA — qué pasó, qué
 * significa y qué hacer, sin códigos ni nombres de librería.
 */
export function validarArchivoCedula(a: ArchivoDeCedula): string | null {
  const tipo = String(a?.tipo ?? "").trim().toLowerCase();
  const bytes = Number(a?.bytes ?? 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Ese archivo llegó vacío. Vuelve a elegirlo.";
  }
  if (bytes > MAX_BYTES_CEDULA) {
    return `La foto pesa ${mb(bytes)} y el máximo son ${mb(MAX_BYTES_CEDULA)}. Sácala de nuevo con menos calidad o recórtala.`;
  }
  if (!(TIPOS_CEDULA_ACEPTADOS as readonly string[]).includes(tipo)) {
    return "Solo se puede subir una foto (JPG, PNG, HEIC o WEBP) o un PDF escaneado.";
  }
  return null;
}

/** La extensión que le toca al archivo guardado. Sale del TIPO, no del nombre. */
export function extensionDeCedula(tipo: string, nombre: string): string {
  const t = String(tipo ?? "").trim().toLowerCase();
  const porTipo: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  if (porTipo[t]) return porTipo[t];
  const m = String(nombre ?? "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "bin";
}

/**
 * DÓNDE SE GUARDA. `<codigo>/cedula-<marca>.<ext>`.
 *
 * 🔴 EL CÓDIGO ES LA CARPETA, porque la identidad es el código y nunca el
 * nombre: una persona que cambia de nombre no cambia de carpeta.
 *
 * 🔑 LA MARCA DE TIEMPO EVITA QUE EL NAVEGADOR MUESTRE LA VIEJA. Sin ella, al
 * reemplazar la foto la dirección firmada apuntaría al mismo objeto y el caché
 * seguiría enseñando la anterior — o sea, alguien juraría que subió la cédula
 * buena. Se pasa por parámetro: este módulo no mira el reloj.
 */
export function rutaDeCedula(
  codigo: string,
  marca: string | number,
  tipo: string,
  nombre: string,
): string {
  const cod = String(codigo ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "") || "sin-codigo";
  const m = String(marca ?? "").replace(/[^0-9A-Za-z]/g, "") || "0";
  return `${cod}/cedula-${m}.${extensionDeCedula(tipo, nombre)}`;
}

/**
 * 🔴 UN PATH NO ES UNA URL, y confundirlos es cómo se guarda en la base un
 * enlace firmado que mañana no sirve. La columna guarda SIEMPRE el path.
 */
export function esPathDeCedula(valor: string | null | undefined): boolean {
  const v = String(valor ?? "").trim();
  if (v === "") return false;
  if (/^https?:\/\//i.test(v)) return false;
  return v.includes("/");
}

/** Lo que dice el botón según haya foto o no. Una sola redacción, en un lugar. */
export function textoBotonCedula(tienePath: boolean): string {
  return tienePath ? "Reemplazar la foto" : "Subir la foto";
}
