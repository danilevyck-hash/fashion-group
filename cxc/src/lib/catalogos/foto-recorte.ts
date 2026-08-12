// ─────────────────────────────────────────────────────────────────────────────
// Auto-recorte de fotos de producto — NÚCLEO PURO + envoltorio de canvas.
//
// El banco B2B de PVH entrega fotos de estudio con el producto CHICO y
// descentrado sobre un fondo enorme (caso real: HW0HW02958AEF.jpg, 1364×1819,
// una sandalia que ocupa el cuarto de abajo y el resto es fondo gris en
// DEGRADADO). En la tarjeta del catálogo ese producto se ve diminuto al lado
// de las fotos bien encuadradas.
//
// Por qué no alcanzaba con `detectarBBox` de fotos-b2b: su fondo es el promedio
// de las 4 esquinas con tolerancia fija 12, y el fondo de estudio de PVH es un
// degradado vertical — las puntas difieren del promedio en más de 12, TODO el
// fondo se marca como "producto", la caja da la imagen entera y el recorte es
// un no-op. Aquí el fondo se estima POR FILA (banda izquierda + banda derecha,
// interpolado a lo ancho), que absorbe el degradado sin inventar nada.
//
// REGLA DURA — FAIL-OPEN: si la detección no es confiable (fondo no uniforme,
// foto de local/modelo, producto que toca los 4 bordes, imagen chica, producto
// indistinguible del fondo) se devuelve `ok:false` y el llamador sube LA
// ORIGINAL sin tocar. Este módulo NUNCA puede bloquear ni degradar una subida:
// el envoltorio de canvas atrapa cualquier excepción y devuelve null.
//
// Todo lo que decide (fondo, caja, guardas, plan de encuadre) es matemática
// pura sobre RgbaImage → testeable en Node con imágenes sintéticas. El canvas
// solo dibuja lo que el plan ya decidió.
// ─────────────────────────────────────────────────────────────────────────────

import type { RgbaImage, Caja } from "./fotos-b2b";

// ── Umbrales (documentados; medidos sobre las fotos reales del banco CK) ─────

/** Lado mayor de la copia sobre la que se MIDE (barato; el dibujo final va
 *  sobre el bitmap original, sin perder nitidez). */
export const LADO_MEDICION = 320;

/** Una imagen con el lado menor por debajo de esto no se toca: recortar una
 *  foto chica solo la empeora y la medición pierde precisión. */
export const MIN_LADO_ORIGINAL = 300;

/** Diferencia máxima por canal contra el fondo estimado de SU fila para seguir
 *  siendo "fondo". 20 tolera el ruido JPEG del degradado (±3-6) y sigue viendo
 *  el producto (la sandalia crema difiere ~50-90 del gris). */
export const TOLERANCIA_FONDO = 20;

/** Rugosidad máxima del borde: promedio de |Δ luminancia| entre píxeles
 *  CONSECUTIVOS del anillo del borde (copia ≤320). Un degradado de estudio da
 *  <1.5 (cambia suave); una foto de local/escena da 8-40. Si el borde es
 *  rugoso, el "fondo" no es un fondo → no se recorta. */
export const RUGOSIDAD_BORDE_MAX = 4;

/** Rango máximo (max−min de luminancia) del anillo del borde — techo de
 *  SANIDAD, no el detector de escenas (ese es la rugosidad). Medido sobre las
 *  33 fotos reales del banco CK: los degradados de estudio dan rango 0-140, y
 *  un producto oscuro que asoma al borde sobre fondo blanco llega a ~190-215
 *  con rugosidad baja (pocas transiciones nítidas diluidas en el promedio).
 *  230 deja pasar todos esos casos reales y solo frena bordes patológicos. */
export const RANGO_BORDE_MAX = 230;

/** Caja con área por debajo de esta fracción de la imagen = probablemente
 *  ruido, no un producto → no se recorta. */
export const OCUPACION_MINIMA = 0.02;

/** Si la caja ya ocupa esta fracción del ancho Y del alto, la foto ya está
 *  encuadrada: recortar no gana nada y re-encodear pierde calidad. */
export const OCUPACION_YA_ENCUADRADA = 0.85;

/** Margen parejo alrededor del producto en el encuadre final (fracción del
 *  lado MAYOR de la caja). 8% = el punto medio del rango aprobado (8-10%). */
export const MARGEN_PRODUCTO = 0.08;

/** Lado mayor máximo del lienzo de salida — mismo techo que la compresión de
 *  siempre (photoUpload comprime a 1600). */
export const LADO_MAX_SALIDA = 1600;

/** Criterio del RE-PROCESO de fotos ya subidas (script de Calvin): solo se
 *  reprocesa una foto cuya caja de producto ocupa menos de la mitad del área —
 *  las bien encuadradas no se tocan ni se re-encodean. */
export const OCUPACION_REPROCESO = 0.5;

/** Grosor (px sobre la copia medida) de las bandas laterales con las que se
 *  estima el fondo de cada fila, y del anillo del borde. */
const BANDA_PX = 3;

// ── Tipos ────────────────────────────────────────────────────────────────────

export type MotivoNoRecorte =
  | "muy-chica"
  | "fondo-no-uniforme"
  | "sin-producto"
  | "toca-bordes"
  | "ya-encuadrada";

export interface Medicion {
  ok: boolean;
  motivo?: MotivoNoRecorte;
  /** Caja del producto, en coordenadas de la imagen MEDIDA. */
  caja?: Caja;
  /** Color de relleno si el encuadre pide lienzo más grande que la foto. */
  fondo?: [number, number, number];
  /** Área de la caja / área de la imagen (criterio del re-proceso). */
  ocupacionArea?: number;
}

export interface PlanRecorte {
  /** Lienzo final. */
  destW: number;
  destH: number;
  /** Región de la FUENTE que se dibuja (ya recortada a los límites reales). */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** Dónde cae esa región dentro del lienzo. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

// ── Helpers de píxel ─────────────────────────────────────────────────────────

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function lum(rgb: [number, number, number]): number {
  return (rgb[0] + rgb[1] + rgb[2]) / 3;
}

// ── Anillo del borde: rugosidad, rango y color promedio ─────────────────────

/** Recorre el borde como un camino continuo (top→right→bottom→left) y devuelve
 *  las luminancias en orden. Así "consecutivo" significa vecino de verdad. */
function caminoBorde(img: RgbaImage): number[] {
  const w = img.width;
  const h = img.height;
  const vals: number[] = [];
  for (let x = 0; x < w; x++) vals.push(lum(px(img, x, 0)));
  for (let y = 1; y < h; y++) vals.push(lum(px(img, w - 1, y)));
  for (let x = w - 2; x >= 0; x--) vals.push(lum(px(img, x, h - 1)));
  for (let y = h - 2; y >= 1; y--) vals.push(lum(px(img, 0, y)));
  return vals;
}

/** Promedio de |Δ| entre píxeles consecutivos del borde. Suave = fondo de
 *  estudio (aunque tenga degradado); rugoso = escena/local. */
export function rugosidadBorde(img: RgbaImage): number {
  const vals = caminoBorde(img);
  if (vals.length < 2) return 0;
  let suma = 0;
  for (let i = 1; i < vals.length; i++) suma += Math.abs(vals[i] - vals[i - 1]);
  return suma / (vals.length - 1);
}

/** max − min de luminancia del borde. */
export function rangoBorde(img: RgbaImage): number {
  const vals = caminoBorde(img);
  let min = 255;
  let max = 0;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

/** Color promedio del anillo del borde (relleno del encuadre). */
export function fondoBorde(img: RgbaImage): [number, number, number] {
  const vals: [number, number, number][] = [];
  const w = img.width;
  const h = img.height;
  const g = Math.min(BANDA_PX, Math.floor(Math.min(w, h) / 4));
  for (let y = 0; y < h; y++) {
    const bordeY = y < g || y >= h - g;
    for (let x = 0; x < w; x++) {
      if (bordeY || x < g || x >= w - g) vals.push(px(img, x, y));
    }
  }
  let r = 0;
  let gg = 0;
  let b = 0;
  for (const [vr, vg, vb] of vals) {
    r += vr;
    gg += vg;
    b += vb;
  }
  const n = Math.max(1, vals.length);
  return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
}

// ── Caja del producto con fondo estimado POR FILA ────────────────────────────

/**
 * Caja de los píxeles que difieren del fondo de SU fila en más de
 * TOLERANCIA_FONDO en algún canal. El fondo de la fila se estima con las
 * bandas izquierda/derecha e interpola a lo ancho — eso absorbe el degradado
 * vertical Y el horizontal de los fondos de estudio. Devuelve null si ningún
 * píxel califica (imagen sin producto distinguible).
 */
export function detectarCajaProducto(img: RgbaImage): Caja | null {
  const w = img.width;
  const h = img.height;
  const k = Math.max(1, Math.min(BANDA_PX, Math.floor(w / 8)));
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    // Fondo estimado de la fila: promedio de las bandas de cada lado.
    let lr = 0, lg = 0, lb = 0, rr = 0, rg = 0, rb = 0;
    for (let x = 0; x < k; x++) {
      const [a, b2, c] = px(img, x, y);
      lr += a; lg += b2; lb += c;
      const [d, e, f] = px(img, w - 1 - x, y);
      rr += d; rg += e; rb += f;
    }
    lr /= k; lg /= k; lb /= k; rr /= k; rg /= k; rb /= k;

    for (let x = 0; x < w; x++) {
      const t = w > 1 ? x / (w - 1) : 0;
      const fr = lr + (rr - lr) * t;
      const fg = lg + (rg - lg) * t;
      const fb = lb + (rb - lb) * t;
      const [r, g2, b3] = px(img, x, y);
      const dif = Math.max(Math.abs(r - fr), Math.abs(g2 - fg), Math.abs(b3 - fb));
      if (dif > TOLERANCIA_FONDO) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ── Medición completa con guardas (el corazón del fail-open) ────────────────

/**
 * Decide si la foto se puede recortar CON CONFIANZA. `small` es la copia de
 * medición (≤LADO_MEDICION); `originalW/H` son las dimensiones reales.
 * Cualquier duda → ok:false, y el llamador sube la original.
 */
export function medirRecorte(small: RgbaImage, originalW: number, originalH: number): Medicion {
  if (Math.min(originalW, originalH) < MIN_LADO_ORIGINAL) {
    return { ok: false, motivo: "muy-chica" };
  }
  if (rugosidadBorde(small) > RUGOSIDAD_BORDE_MAX || rangoBorde(small) > RANGO_BORDE_MAX) {
    return { ok: false, motivo: "fondo-no-uniforme" };
  }

  const caja = detectarCajaProducto(small);
  if (!caja) return { ok: false, motivo: "sin-producto" };

  const area = (caja.w * caja.h) / (small.width * small.height);
  if (area < OCUPACION_MINIMA) return { ok: false, motivo: "sin-producto", ocupacionArea: area };

  // Toca los 4 bordes (con 1px de holgura) → no hay fondo que recortar y el
  // encuadre no puede saber dónde termina el producto.
  const tocaIzq = caja.x <= 1;
  const tocaArr = caja.y <= 1;
  const tocaDer = caja.x + caja.w >= small.width - 1;
  const tocaAba = caja.y + caja.h >= small.height - 1;
  if (tocaIzq && tocaArr && tocaDer && tocaAba) {
    return { ok: false, motivo: "toca-bordes", ocupacionArea: area };
  }

  if (
    caja.w >= OCUPACION_YA_ENCUADRADA * small.width &&
    caja.h >= OCUPACION_YA_ENCUADRADA * small.height
  ) {
    return { ok: false, motivo: "ya-encuadrada", caja, ocupacionArea: area };
  }

  return { ok: true, caja, fondo: fondoBorde(small), ocupacionArea: area };
}

// ── Plan de encuadre (coordenadas de la FUENTE) ──────────────────────────────

/** Reescala una caja medida sobre la copia chica a las coordenadas del bitmap
 *  original, sin salirse de los límites. */
export function escalarCaja(caja: Caja, deW: number, deH: number, aW: number, aH: number): Caja {
  const fx = aW / deW;
  const fy = aH / deH;
  const x = Math.max(0, Math.floor(caja.x * fx));
  const y = Math.max(0, Math.floor(caja.y * fy));
  return {
    x,
    y,
    w: Math.min(aW - x, Math.ceil(caja.w * fx)),
    h: Math.min(aH - y, Math.ceil(caja.h * fy)),
  };
}

/**
 * Encuadre final: la caja del producto + un margen PAREJO (MARGEN_PRODUCTO del
 * lado mayor de la caja, el mismo en los 4 lados), centrado. El rectángulo se
 * arma en coordenadas de la fuente: el margen sale de la FOTO REAL (conserva
 * el degradado, sin costuras); solo lo que se pasa del límite de la foto se
 * rellena con el color de fondo detectado. Una sola escala para ancho y alto
 * (nunca distorsiona) y nunca agranda (escala ≤ 1, salvo el techo de 1600).
 */
export function planRecorte(
  caja: Caja,
  imgW: number,
  imgH: number,
  margen = MARGEN_PRODUCTO,
  ladoMax = LADO_MAX_SALIDA,
): PlanRecorte {
  const m = Math.round(margen * Math.max(caja.w, caja.h));
  const rectX = caja.x - m;
  const rectY = caja.y - m;
  const rectW = caja.w + 2 * m;
  const rectH = caja.h + 2 * m;

  const escala = Math.min(1, ladoMax / Math.max(rectW, rectH));
  const destW = Math.max(1, Math.round(rectW * escala));
  const destH = Math.max(1, Math.round(rectH * escala));

  // Intersección del rectángulo con la foto real.
  const srcX = Math.max(0, rectX);
  const srcY = Math.max(0, rectY);
  const srcW = Math.min(imgW, rectX + rectW) - srcX;
  const srcH = Math.min(imgH, rectY + rectH) - srcY;

  return {
    destW,
    destH,
    srcX,
    srcY,
    srcW: Math.max(1, srcW),
    srcH: Math.max(1, srcH),
    dx: Math.round((srcX - rectX) * escala),
    dy: Math.round((srcY - rectY) * escala),
    dw: Math.max(1, Math.round(srcW * escala)),
    dh: Math.max(1, Math.round(srcH * escala)),
  };
}

// ── Envoltorio de canvas (SOLO NAVEGADOR) ────────────────────────────────────

/** Copia de medición ≤LADO_MEDICION dibujada en canvas. */
function muestraPixeles(src: CanvasImageSource, w: number, h: number): RgbaImage {
  const escala = Math.min(1, LADO_MEDICION / Math.max(w, h));
  const mw = Math.max(1, Math.round(w * escala));
  const mh = Math.max(1, Math.round(h * escala));
  const c = document.createElement("canvas");
  c.width = mw;
  c.height = mh;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, mw, mh);
  return ctx.getImageData(0, 0, mw, mh);
}

/**
 * Recorta y centra el producto en un canvas nuevo, o devuelve null si la
 * detección no es confiable O si algo revienta — el llamador sigue con la
 * imagen original. FAIL-OPEN GARANTIZADO: nada de lo que pase aquí adentro
 * puede impedir una subida.
 */
export function recortarEnCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  try {
    const small = muestraPixeles(src, w, h);
    const med = medirRecorte(small, w, h);
    if (!med.ok || !med.caja) return null;

    const caja = escalarCaja(med.caja, small.width, small.height, w, h);
    const plan = planRecorte(caja, w, h);

    const c = document.createElement("canvas");
    c.width = plan.destW;
    c.height = plan.destH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const [fr, fg, fb] = med.fondo ?? [255, 255, 255];
    ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
    ctx.fillRect(0, 0, plan.destW, plan.destH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, plan.srcX, plan.srcY, plan.srcW, plan.srcH, plan.dx, plan.dy, plan.dw, plan.dh);
    return c;
  } catch {
    return null;
  }
}
