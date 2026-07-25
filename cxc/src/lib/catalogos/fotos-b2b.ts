// ─────────────────────────────────────────────────────────────────────────────
// Banco de fotos B2B → catálogo. NÚCLEO PURO (sin DOM, sin canvas, sin
// supabase): todo lo que decide QUÉ foto se usa y CÓMO se recorta vive aquí,
// para poder testearlo con imágenes sintéticas en Node.
//
// El envoltorio de navegador (JSZip + canvas + subida a Storage) está en
// `zip-b2b-client.ts`, que solo aporta píxeles a estas funciones.
//
// Reglas VALIDADAS sobre 2,562 fotos reales del banco (jul-2026):
//   · nombre de archivo `{ESTILO}_{COLOR}_{N}.jpg` → código = ESTILO+COLOR,
//     vista = N. Algunos traen un espacio antes del número
//     (`FM0FM05675_YBS_ 1.jpg`) — se tolera.
//   · detector de lifestyle (foto de modelo/escena, inservible para catálogo):
//     desviación estándar del promedio de píxeles de la banda superior 12%
//     de la imagen escalada a ~160px. `var_top > 10` = lifestyle.
//     6 lifestyle detectadas con score 35-56 vs 5.79 de la siguiente foto de
//     producto — cero falsos positivos.
//   · orden de preferencia de vista: 1 → 6 → 13 → 7 → 2 → 3 → 4 → resto asc,
//     saltando siempre las lifestyle. Si TODAS son lifestyle: sin foto.
// ─────────────────────────────────────────────────────────────────────────────

// ── Normalización de códigos ─────────────────────────────────────────────────

/**
 * Código canónico para EMPAREJAR (match) un archivo del banco con un SKU:
 * mayúsculas y sin nada que no sea A-Z0-9. Así `FM0FM04474-BDS` (SKU en la DB)
 * y `FM0FM04474_BDS` (nombre del archivo) caen en el mismo `FM0FM04474BDS`.
 */
export function normalizarCodigo(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Nombre del objeto en Storage para un SKU: minúsculas y sin nada que no sea
 * a-z0-9. Es la convención con la que ya están subidas las fotos de Tommy
 * (`tommy/fw0fw05034dw5.jpg`).
 *
 * OJO — divergencia deliberada: el endpoint legacy `/api/catalogo/[marca]/upload`
 * usa otra normalización (conserva `.`, `-`, `_` y no agrega extensión). No se
 * toca: cambiarla dejaría huérfanas las fotos ya subidas por ese camino. Las
 * variantes y la foto elegida por el selector usan SIEMPRE esta función, y el
 * producto apunta a la que corresponda vía image_url.
 */
export function normalizarSkuStorage(sku: string): string {
  return (sku || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Nombre de archivo del banco B2B ──────────────────────────────────────────

export interface ArchivoB2B {
  /** Código normalizado para match (ESTILO+COLOR, sin separadores). */
  codigo: string;
  /** Sufijo de vista del banco (1, 2, 3, 6, 13, …). */
  vista: number;
}

/**
 * `{ESTILO}_{COLOR}_{N}.(jpg|jpeg|png|webp)` → { codigo, vista }.
 * Tolerante a: espacios antes del número (`FM0FM05675_YBS_ 1.jpg`), rutas
 * dentro del ZIP (`images/FM0..._1.jpg`), mayúsculas/minúsculas de la
 * extensión y separadores `-` en vez de `_`.
 * Devuelve null si el nombre no tiene la forma esperada (no se sube nada).
 */
export function parseNombreArchivoB2B(nombreOPath: string): ArchivoB2B | null {
  const base = (nombreOPath || "").split("/").pop() || "";
  // Ignora artefactos de compresión de macOS y ocultos.
  if (!base || base.startsWith(".") || base.startsWith("__MACOSX")) return null;

  const m = base.match(/^(.*)[_-]\s*(\d{1,3})\s*\.(jpe?g|png|webp)$/i);
  if (!m) return null;

  const codigo = normalizarCodigo(m[1]);
  const vista = Number(m[2]);
  if (!codigo || !Number.isFinite(vista)) return null;
  return { codigo, vista };
}

// ── Imagen mínima (misma forma que ImageData del canvas) ─────────────────────

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes por píxel, fila por fila. */
  data: Uint8ClampedArray | Uint8Array | number[];
}

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** Escalado por vecino más cercano — suficiente para las MÉTRICAS (lifestyle);
 *  la calidad visual la da el canvas del navegador, no esto. */
export function escalarNN(img: RgbaImage, maxLado: number): RgbaImage {
  const mayor = Math.max(img.width, img.height);
  if (mayor <= maxLado) return img;
  const escala = maxLado / mayor;
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ── Detector de lifestyle ────────────────────────────────────────────────────

/** Umbral validado sobre el banco real: 6 lifestyle con score 35-56, la
 *  siguiente foto (de producto) 5.79. 10 deja margen a ambos lados. */
export const LIFESTYLE_VAR_TOP_UMBRAL = 10;

/** Fracción superior de la imagen que se mide (la banda del "fondo"). */
const BANDA_TOP = 0.12;

/**
 * Score de lifestyle: desviación estándar del PROMEDIO de los canales RGB de
 * los píxeles de la banda superior 12% (imagen escalada a ~160px de lado
 * mayor). Un fondo de estudio es plano → std ~0-6; una escena/modelo tiene
 * paisaje, ropa y sombras arriba → std 30+.
 */
export function scoreLifestyle(img: RgbaImage): number {
  const small = escalarNN(img, 160);
  const filas = Math.max(1, Math.round(small.height * BANDA_TOP));
  const vals: number[] = [];
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < small.width; x++) {
      const [r, g, b] = px(small, x, y);
      vals.push((r + g + b) / 3);
    }
  }
  if (vals.length === 0) return 0;
  const media = vals.reduce((s, v) => s + v, 0) / vals.length;
  const varianza = vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length;
  return Math.sqrt(varianza);
}

/** true = foto de modelo/escena → NO sirve como foto de catálogo. */
export function esLifestyle(img: RgbaImage): boolean {
  return scoreLifestyle(img) > LIFESTYLE_VAR_TOP_UMBRAL;
}

// ── Elección de la vista por defecto ─────────────────────────────────────────

/** Orden de preferencia validado. Lo que no está aquí va después, ascendente. */
export const ORDEN_VISTAS = [1, 6, 13, 7, 2, 3, 4];

function rankVista(n: number): number {
  const i = ORDEN_VISTAS.indexOf(n);
  return i >= 0 ? i : ORDEN_VISTAS.length + n;
}

export interface VarianteCandidata {
  vista: number;
  lifestyle: boolean;
}

/**
 * Vista elegida como foto de catálogo, o null si TODAS son lifestyle (o no hay
 * ninguna). Regla: preferir `_1`; si `_1` es lifestyle o no existe, bajar por
 * 6 → 13 → 7 → 2 → 3 → 4 → resto ascendente, saltando siempre las lifestyle.
 */
export function elegirVistaDefault(candidatas: VarianteCandidata[]): number | null {
  const utiles = candidatas.filter((c) => !c.lifestyle);
  if (utiles.length === 0) return null;
  return [...utiles].sort((a, b) => rankVista(a.vista) - rankVista(b.vista))[0].vista;
}

// ── Recorte: fondo, bounding box y reencuadre 4:3 ────────────────────────────

/** Diferencia por canal a partir de la cual un píxel "no es fondo". */
export const BBOX_TOLERANCIA = 12;
/** Proporción del encuadre final que ocupa el producto. */
export const OCUPACION_PRODUCTO = 0.9;
/** Relación de aspecto del encuadre final (ancho / alto). */
export const ASPECTO = 4 / 3;

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Color de fondo = promedio de los 4 píxeles de las esquinas. */
export function colorFondo(img: RgbaImage): [number, number, number] {
  const esquinas: [number, number][] = [
    [0, 0],
    [img.width - 1, 0],
    [0, img.height - 1],
    [img.width - 1, img.height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of esquinas) {
    const p = px(img, Math.max(0, x), Math.max(0, y));
    r += p[0];
    g += p[1];
    b += p[2];
  }
  return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
}

/**
 * Bounding box de los píxeles que difieren del fondo en más de
 * BBOX_TOLERANCIA en cualquier canal. Si no hay ninguno (imagen de un solo
 * color) devuelve la imagen completa — nunca un recorte vacío.
 */
export function detectarBBox(img: RgbaImage, fondo?: [number, number, number]): Caja {
  const [fr, fg, fb] = fondo ?? colorFondo(img);
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = px(img, x, y);
      const dif = Math.max(Math.abs(r - fr), Math.abs(g - fg), Math.abs(b - fb));
      if (dif > BBOX_TOLERANCIA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: img.width, h: img.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export interface Encuadre {
  /** Lienzo final. */
  destW: number;
  destH: number;
  /** Dónde va el producto (bbox reescalada) dentro del lienzo. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Reencuadra la bbox a 4:3 con el producto ocupando el 90%, centrado. NUNCA
 * distorsiona (una sola escala para ancho y alto) ni corta producto (la escala
 * se toma del lado que más manda). El resto del lienzo se rellena con el color
 * de fondo detectado.
 *
 * `ladoMayor` = lado mayor del lienzo final (720 en producción).
 */
export function encuadrar(bbox: Caja, ladoMayor: number, aspecto = ASPECTO): Encuadre {
  const destW = aspecto >= 1 ? ladoMayor : Math.round(ladoMayor * aspecto);
  const destH = aspecto >= 1 ? Math.round(ladoMayor / aspecto) : ladoMayor;

  const maxW = destW * OCUPACION_PRODUCTO;
  const maxH = destH * OCUPACION_PRODUCTO;
  // Una sola escala → sin distorsión; el mínimo → el producto siempre cabe.
  const escala = Math.min(maxW / bbox.w, maxH / bbox.h);
  const dw = Math.max(1, Math.round(bbox.w * escala));
  const dh = Math.max(1, Math.round(bbox.h * escala));
  return {
    destW,
    destH,
    dw,
    dh,
    dx: Math.round((destW - dw) / 2),
    dy: Math.round((destH - dh) / 2),
  };
}

// ── Manifiesto (lo que el navegador reporta al server tras procesar el ZIP) ───

export interface ManifiestoItem {
  /** SKU tal como está en la tabla de la marca (no normalizado). */
  sku: string;
  /** Vistas subidas a `{prefijo}/_v/{skuStorage}/{n}.jpg`. */
  variantes: number[];
  /** Vista elegida como foto de catálogo, o null si todas eran lifestyle. */
  elegida: number | null;
}

export interface ReporteZip {
  asignadas: number;
  sinMatch: string[];
  manuales: number;
  variantesSubidas: number;
}
