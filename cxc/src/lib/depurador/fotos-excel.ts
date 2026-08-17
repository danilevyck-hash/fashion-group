// Fotos del pedido Reebok · emparejado por NOMBRE y geometría de la celda.
// Módulo PURO: sin DOM, sin xlsx, sin red. Lo usan la pantalla (para emparejar y
// contar) y el armador del Excel (para saber qué celda va vacía y cuál dice
// "NO IMAGEN"), así que lo que se ve en pantalla y lo que sale en el archivo no
// pueden decir cosas distintas.
//
// 🔴 EL EMPAREJADO ES POR NOMBRE EXACTO, SIN MAYÚSCULAS Y SIN NADA MÁS.
// `100262385` ↔ `100262385.jpg`. No se quitan guiones, no se recorta, no se
// busca por parecido y no se compara por distancia de edición. En este repo el
// pareo por aproximación ya costó caro (`Outlet Duty Free N2` vs `N3`, ver la
// nota de Guías en CLAUDE.md): dos códigos parecidos son DOS artículos, y
// pegarle a un pedido la foto del artículo de al lado no deja ningún rastro —
// el cliente recibe el catálogo con la foto equivocada y nadie se entera.
// Un código sin foto exacta sale con "NO IMAGEN", que es la verdad.

/** Lo que dice la celda cuando ese código no tiene foto. Es el mismo texto que
 *  usa hoy el Excel que Daniel arma a mano con el macro. */
export const TEXTO_SIN_FOTO = "NO IMAGEN";

/** Encabezado de la columna nueva (primera columna, a la izquierda del código). */
export const COL_FOTO = "Foto";

/** Extensiones que se aceptan como foto. La carpeta real de Reebok es 100% .jpg;
 *  .jpeg entra porque es el mismo formato con otro nombre. */
export const EXTENSIONES_FOTO = [".jpg", ".jpeg"] as const;

// ── Geometría de la celda de la foto ────────────────────────────────────────
// Medidas en píxeles de Excel (96 px = 1 pulgada). La foto se encaja DENTRO de
// la caja conservando su proporción: nunca se estira ni se recorta.
/** Lado mayor de la foto dentro de la celda. */
export const CAJA_FOTO_PX = 90;
/** Alto de las filas de datos, en puntos (72 pt = 96 px). */
export const ALTO_FILA_PT = 72;
/** Ancho de la columna de la foto en unidades de Excel (≈104 px). */
export const ANCHO_COL_FOTO_WCH = 14;
/** Alto de la celda en píxeles, derivado del alto en puntos (1 pt = 96/72 px). */
export const ALTO_CELDA_PX = Math.round((ALTO_FILA_PT * 96) / 72);
/** Ancho de la celda en píxeles, derivado del ancho en unidades de Excel.
 *  Fórmula de OOXML con MDW=7 (la fuente por defecto de la plantilla). */
export const ANCHO_CELDA_PX = Math.round(((256 * ANCHO_COL_FOTO_WCH + Math.round(128 / 7)) / 256) * 7);

/** 1 píxel = 9525 EMU (914400 EMU por pulgada ÷ 96 px). */
export const EMU_POR_PX = 9525;

/** Píxeles → EMU, la unidad en la que OOXML posiciona y dimensiona una imagen. */
export function pxAEmu(px: number): number {
  return Math.round(px * EMU_POR_PX);
}

/** Normaliza para comparar: recorta espacios y baja a minúsculas. NADA MÁS —
 *  ni quitar guiones, ni ceros a la izquierda, ni acentos. */
function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Clave de una foto a partir del nombre de archivo: el nombre sin la extensión,
 * en minúsculas. Devuelve `null` si no es una foto (.jpg/.jpeg).
 * Tolera que venga con carpetas adelante (`Fotos/100262385.jpg`).
 */
export function claveFoto(nombreArchivo: string): string | null {
  const base = String(nombreArchivo ?? "").split(/[\\/]/).pop() ?? "";
  const punto = base.lastIndexOf(".");
  if (punto <= 0) return null; // sin extensión, o archivo oculto tipo ".DS_Store"
  const ext = base.slice(punto).toLowerCase();
  if (!EXTENSIONES_FOTO.includes(ext as (typeof EXTENSIONES_FOTO)[number])) return null;
  const sinExt = normalizar(base.slice(0, punto));
  return sinExt === "" ? null : sinExt;
}

/** Clave de un código de artículo, con la MISMA normalización que la foto. */
export function claveCodigo(codigo: string): string {
  return normalizar(String(codigo ?? ""));
}

export interface IndiceFotos<T> {
  /** clave (nombre sin extensión, en minúsculas) → archivo */
  indice: Map<string, T>;
  /** Archivos de la carpeta que no son fotos (.csv, .xlsm, subcarpetas…). */
  ignorados: number;
  /** Claves que aparecían más de una vez (p. ej. `A.jpg` y `a.JPG`). Se queda la primera. */
  duplicados: string[];
}

/**
 * Indexa la carpeta elegida por nombre de archivo. No lee el contenido de nada:
 * la carpeta real tiene 4.742 fotos y ~800 MB, así que solo se leen las que
 * terminan emparejadas con un código del pedido.
 */
export function indexarFotos<T extends { name: string }>(archivos: readonly T[]): IndiceFotos<T> {
  const indice = new Map<string, T>();
  const duplicados: string[] = [];
  let ignorados = 0;
  for (const a of archivos) {
    const clave = claveFoto(a.name);
    if (clave === null) { ignorados++; continue; }
    if (indice.has(clave)) { duplicados.push(clave); continue; } // gana la primera
    indice.set(clave, a);
  }
  return { indice, ignorados, duplicados };
}

export interface ParFoto<T> {
  codigo: string;
  /** El archivo de la carpeta, o `null` si ese código no tiene foto exacta. */
  foto: T | null;
}

export interface Emparejado<T> {
  pares: ParFoto<T>[];
  conFoto: number;
  sinFoto: number;
}

/**
 * Empareja los códigos del pedido con la carpeta. **No se salta ninguna fila**:
 * un código sin foto viaja igual, con `foto: null`, para que su celda diga
 * "NO IMAGEN" en vez de desaparecer del pedido.
 */
export function parearFotos<T extends { name: string }>(
  codigos: readonly string[],
  indice: ReadonlyMap<string, T>,
): Emparejado<T> {
  const pares: ParFoto<T>[] = [];
  let conFoto = 0;
  for (const codigo of codigos) {
    const foto = indice.get(claveCodigo(codigo)) ?? null;
    if (foto) conFoto++;
    pares.push({ codigo, foto });
  }
  return { pares, conFoto, sinFoto: pares.length - conFoto };
}

export interface Encaje {
  ancho: number;
  alto: number;
  /** Sangría para que la foto quede centrada en la celda. */
  offsetX: number;
  offsetY: number;
}

/**
 * Encaja una imagen de `ancho × alto` dentro de la caja de la celda, CONSERVANDO
 * la proporción (una sola escala para los dos ejes: dos escalas distintas
 * deforman el producto) y sin agrandarla nunca por encima de su tamaño real.
 */
export function encajar(
  ancho: number,
  alto: number,
  caja = CAJA_FOTO_PX,
  celdaAncho = ANCHO_CELDA_PX,
  celdaAlto = ALTO_CELDA_PX,
): Encaje {
  const w = ancho > 0 ? ancho : caja;
  const h = alto > 0 ? alto : caja;
  const escala = Math.min(caja / Math.max(w, h), 1); // nunca agranda
  const a = Math.max(1, Math.round(w * escala));
  const b = Math.max(1, Math.round(h * escala));
  return {
    ancho: a,
    alto: b,
    offsetX: Math.max(0, Math.round((celdaAncho - a) / 2)),
    offsetY: Math.max(0, Math.round((celdaAlto - b) / 2)),
  };
}

/** "183 de 203 códigos tienen foto · 20 sin foto" — el mismo texto en pantalla
 *  y en el aviso de después de descargar, para que no puedan discrepar. */
export function textoEmparejado(conFoto: number, total: number): string {
  const sinFoto = total - conFoto;
  const cabeza = `${conFoto.toLocaleString()} de ${total.toLocaleString()} código${total === 1 ? "" : "s"} con foto`;
  if (sinFoto <= 0) return `${cabeza} · no falta ninguna`;
  return `${cabeza} · ${sinFoto.toLocaleString()} sin foto (${TEXTO_SIN_FOTO})`;
}
