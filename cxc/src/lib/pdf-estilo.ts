// ─────────────────────────────────────────────────────────────────────────────
// EL ESTILO ÚNICO DE LOS PAPELES (6-oct-2026).
//
// Daniel, mirando la galería: «Algunos PDF en azul, gris, negro. No hay
// congruencia». Cada módulo pintaba su papel: encabezado de tabla azul marino
// lleno (Comisiones, CxC, Reclamos, Marketing), gris con rejilla (Guías), negro
// (pedido Reebok), solo texto (Asistencia); márgenes de 14 a 21 mm; el pie en
// tres formas distintas; el rojo de los negativos en dos tonos.
//
// 🔴 UN SOLO PAPEL, «un ERP hecho por Apple»:
//   · Logo arriba a la izquierda; título negro y subtítulo gris a su lado; lo
//     del documento (número, fecha) arriba a la derecha; una raya fina abajo.
//   · Tabla: encabezado gris oscuro chico sobre gris muy claro con una raya fina
//     abajo; filas sin rayas verticales ni cebra, separadas por una raya
//     finísima; números a la derecha (Helvetica ya trae cifras del mismo ancho:
//     son tabulares); negativos en el rojo de la paleta; totales en negrita con
//     raya arriba.
//   · El mismo pie («Confidencial · Página N de M · fashiongr.com») y el mismo
//     margen (16 mm) en todos.
//   · Colores: SOLO los de `PALETA_PAPEL` (los grises, el negro, el blanco y el
//     rojo de `docs/diseno.md`). La revisión automática lo controla.
//
// Excepciones (no usan este estilo, y la revisión de color no las mide):
//   · Etiquetas 4x6 y carta: van a la Zebra térmica; blanco y negro, letra
//     grande y raya gruesa para leerse a un metro (`docs/diseno.md`, regla 11).
//   · Catálogo Reebok y la franja de arriba de los pedidos de catálogo: los ve
//     el cliente y llevan el color de su marca (la excepción de marca de
//     `docs/diseno.md`). La TABLA del pedido sí es la de la casa.
//
// Interruptor `PAPELES_ESTILO_UNICO_2026_10` (false = como antes). Para la
// maqueta y la prueba de color se prende sin publicar con la variable de
// entorno `PAPELES_ESTILO_UNICO=1` (solo en la máquina; en el navegador no existe).
// ─────────────────────────────────────────────────────────────────────────────

import type { jsPDF } from "jspdf";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";

export const PAPELES_ESTILO_UNICO_2026_10 = false;

export const ESTILO_UNICO: boolean =
  PAPELES_ESTILO_UNICO_2026_10 ||
  (typeof process !== "undefined" && process.env?.PAPELES_ESTILO_UNICO === "1");

type RGB = [number, number, number];

/** La paleta del papel: la de las pantallas (`docs/diseno.md`). Nada más. */
export const PAPEL = {
  negro: [0, 0, 0] as RGB,
  tinta: [17, 24, 39] as RGB, // gray-900: títulos, texto, totales
  grisOscuro: [75, 85, 99] as RGB, // gray-600: encabezado de tabla
  gris: [107, 114, 128] as RGB, // gray-500: subtítulos, rótulos
  grisClaro: [156, 163, 175] as RGB, // gray-400: pie, filas apagadas
  linea: [209, 213, 219] as RGB, // gray-300: raya bajo el encabezado de tabla, campos
  separador: [229, 231, 235] as RGB, // gray-200: entre filas, bajo la cabecera
  fondo: [249, 250, 251] as RGB, // gray-50: fondo del encabezado de tabla y de los grupos
  blanco: [255, 255, 255] as RGB,
  rojo: [220, 38, 38] as RGB, // red-600: negativos y NC
} as const;

const hex = (c: readonly number[]) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
/** Los colores permitidos, en el formato en que pdfjs los lee del archivo. */
export const PALETA_PAPEL: ReadonlySet<string> = new Set(Object.values(PAPEL).map(hex));

/**
 * Lleva cualquier color al de la paleta con el mismo papel: un rojizo al rojo,
 * un fondo de color a gris muy claro, un texto oscuro a la tinta. Así la tabla
 * de un módulo no puede volver a pintar su azul aunque se lo pida.
 */
export function aPaleta(c: unknown, rol: "texto" | "fondo" | "linea"): RGB | false {
  if (c === false || c == null) return false;
  const rgb: RGB | null = Array.isArray(c)
    ? (c.length === 1 ? [c[0], c[0], c[0]] : [c[0], c[1], c[2]]) as RGB
    : typeof c === "number" ? [c, c, c] : null;
  if (!rgb) return rol === "fondo" ? false : PAPEL.tinta;
  if (PALETA_PAPEL.has(hex(rgb))) return rgb;
  const [r, g, b] = rgb;
  if (r > 150 && r - Math.max(g, b) > 60) return rol === "fondo" ? PAPEL.fondo : PAPEL.rojo;
  if (rol === "fondo") return r + g + b > 750 ? PAPEL.blanco : PAPEL.fondo;
  if (rol === "linea") return r + g + b > 600 ? PAPEL.separador : PAPEL.linea;
  const luz = (r + g + b) / 3;
  return luz > 190 ? PAPEL.blanco : luz > 140 ? PAPEL.grisClaro : luz > 95 ? PAPEL.gris : PAPEL.tinta;
}

// ── Medidas (mm) ─────────────────────────────────────────────────────────────

export const MARGEN_PAPEL = 16;
const LOGO = 11;
const Y_LOGO = 12;
const Y_TITULO = 17.4;
const Y_SUBTITULO = 22.2;
const Y_RAYA = 27;
/** Dónde empieza el contenido debajo de la cabecera. */
export const Y_CONTENIDO = 33;
/** Lo que se deja libre abajo para el pie. */
export const PIE_PAPEL = 18;
/** Línea base del pie y de la nota que va encima. */
export const Y_PIE_DESDE_ABAJO = 10;
export const Y_NOTA_DESDE_ABAJO = 14;

export interface Cabecera {
  titulo: string;
  /** Una línea gris, o varias (los datos fiscales de la empresa que cobra). */
  subtitulo?: string | string[];
  /** Arriba a la derecha: la primera línea en tinta (n.° o fecha), el resto en gris. */
  derecha?: string[];
  /** Sin la raya de abajo (el detalle de comisión pone su número grande primero). */
  sinRaya?: boolean;
  /** El logo de la casa que firma; `null` = sin logo (Boston no tiene el suyo cargado). Por omisión, Fashion Group. */
  logo?: { base64: string } | null;
}

/** La cabecera del papel. Devuelve dónde empieza el contenido. */
export function cabeceraPapel(doc: jsPDF, c: Cabecera): number {
  const w = doc.internal.pageSize.getWidth();
  const m = MARGEN_PAPEL;
  const logo = c.logo === undefined ? FG_LOGO_BASE64 : c.logo?.base64;
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", m, Y_LOGO, LOGO, LOGO);
    } catch {
      /* el papel sale igual sin el logo */
    }
  }
  let derechaAncho = 0;
  (c.derecha ?? []).filter(Boolean).forEach((t, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 10 : 8.5);
    doc.setTextColor(...(i === 0 ? PAPEL.tinta : PAPEL.gris));
    derechaAncho = Math.max(derechaAncho, doc.getTextWidth(t));
    doc.text(t, w - m, i === 0 ? Y_TITULO : Y_SUBTITULO + (i - 1) * 4.2, { align: "right" });
  });
  const x = logo ? m + LOGO + 4 : m;
  const ancho = w - m - x - (derechaAncho ? derechaAncho + 6 : 0);
  doc.setFont("helvetica", "bold");
  let tam = 13;
  doc.setFontSize(tam);
  while (doc.getTextWidth(c.titulo) > ancho && tam > 9) doc.setFontSize((tam -= 0.5));
  doc.setTextColor(...PAPEL.tinta);
  doc.text(recortar(doc, c.titulo, ancho), x, Y_TITULO);
  const subs = (Array.isArray(c.subtitulo) ? c.subtitulo : [c.subtitulo]).filter((t): t is string => !!t);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PAPEL.gris);
  subs.forEach((t, i) => doc.text(recortar(doc, t, ancho), x, Y_SUBTITULO + i * 4.2));
  const extra = Math.max(0, subs.length - 1) * 4.2;
  if (!c.sinRaya) rayaPapel(doc, Y_RAYA + extra);
  // Lo que se escriba después va en tinta, no en el gris del subtítulo.
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PAPEL.tinta);
  return Y_CONTENIDO + extra;
}

function recortar(doc: jsPDF, t: string, ancho: number): string {
  if (doc.getTextWidth(t) <= ancho) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > ancho) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** La raya fina de la casa, de margen a margen. */
export function rayaPapel(doc: jsPDF, y: number, color: RGB = PAPEL.separador): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.25);
  doc.line(MARGEN_PAPEL, y, doc.internal.pageSize.getWidth() - MARGEN_PAPEL, y);
}

/** Rótulo de sección («VENTAS», «OBSERVACIONES»): chico, gris, en mayúsculas. */
export function rotuloPapel(doc: jsPDF, texto: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PAPEL.gris);
  doc.text(texto.toUpperCase(), x, y);
}

/**
 * El pie, en TODAS las hojas y con el total ya conocido: se llama al final.
 * `nota`: una línea gris opcional encima, en la última hoja (lo que ya está
 * descontado, etc.). `web: null` lo deja sin «fashiongr.com» (Boston firma como Boston).
 */
export function piePapel(doc: jsPDF, nota?: string, web: string | null = "fashiongr.com"): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    if (nota && i === n) {
      doc.setFontSize(7.5);
      doc.setTextColor(...PAPEL.gris);
      doc.text(nota, MARGEN_PAPEL, h - Y_NOTA_DESDE_ABAJO, { maxWidth: w - 2 * MARGEN_PAPEL });
    }
    doc.setFontSize(7);
    doc.setTextColor(...PAPEL.grisClaro);
    doc.text("Confidencial", MARGEN_PAPEL, h - Y_PIE_DESDE_ABAJO);
    doc.text(`Página ${i} de ${n}`, w / 2, h - Y_PIE_DESDE_ABAJO, { align: "center" });
    if (web) doc.text(web, w - MARGEN_PAPEL, h - Y_PIE_DESDE_ABAJO, { align: "right" });
  }
}

/** «FASHION GROUP» → «Fashion Group»: el papel no grita. */
export const sinMayusculas = (t: string) => t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());

/** Un monto o número negativo como se escribe en el papel: «-$420.50», «-0.60», «($5.00)». */
export const esNegativo = (t: string) => /^\s*(-|−)\s*\$?\s*\d|^\s*\(\$?\d[\d,.]*\)\s*$/.test(t);
