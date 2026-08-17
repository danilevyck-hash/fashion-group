// "Tomá MI Excel y ponele las fotos" — el camino aparte del Depurador.
//
// 🔴 ESTE CAMINO NO CALCULA NADA. No pasa por el precio (`CEILING(CIF÷divisor)`),
// no reordena, no agrega ni quita una columna: toma el archivo tal como viene y
// le escribe SOLO la columna A. Todo lo demás —hojas, valores, orden de filas,
// formatos, anchos, altos, filtros y hasta el macro— viaja intacto.
//
// 🔑 POR ESO NO SE PASA POR `xlsx-js-style`. Leer con SheetJS y volver a
// escribir produce un archivo NUEVO: pierde el `vbaProject.bin` (o sea el
// macro), los xr:uid, las extensiones de Excel y todo lo que la librería no
// entiende. Acá se abre el .zip que ES el .xlsx/.xlsm, se tocan tres partes y
// se vuelve a cerrar. Las entradas que no se nombran salen byte por byte
// iguales a como entraron.
//
// Módulo PURO: entra XML como texto, sale XML como texto. Sin DOM, sin red, sin
// zip. Lo prueba el candado con el archivo REAL de Daniel.

import { TEXTO_SIN_FOTO } from "./fotos-excel";

/** Columna donde va la foto (0-based) → A. Es la que el archivo deja vacía. */
export const COL_FOTO_INDICE = 0;
/** Columna donde vive el código (0-based) → B. **SIEMPRE la B**, no se busca ni
 *  se adivina: Daniel lo dijo así y adivinar la columna es cómo se pega la foto
 *  del artículo de al lado. */
export const COL_CODIGO_INDICE = 1;
/** La fila 1 es el encabezado y no se toca. */
export const FILA_ENCABEZADO = 1;

/** Margen entre la foto y el borde de la celda, en píxeles. */
const MARGEN_CELDA_PX = 8;
/** Ancho de columna de Excel por defecto cuando la hoja no lo dice. */
const ANCHO_COL_DEFECTO = 8.43;
/** Alto de fila de Excel por defecto cuando la hoja no lo dice, en puntos. */
const ALTO_FILA_DEFECTO_PT = 15;
/** "Maximum digit width" de la fuente por defecto: la fórmula de OOXML. */
const MDW = 7;

// ── XML: utilidades mínimas ─────────────────────────────────────────────────

const RE_FILA = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const RE_CELDA = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function atributo(attrs: string, nombre: string): string | null {
  const m = new RegExp(`\\b${nombre}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "B12" → 1 (índice de columna, 0-based). */
export function columnaDeRef(ref: string): number {
  const letras = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1];
  if (!letras) return -1;
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Índice 0-based → letra de columna ("A", "B", … "AA"). */
export function letraDeColumna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── Partes del libro ────────────────────────────────────────────────────────

/** Textos de `xl/sharedStrings.xml`, en orden. Un `<si>` puede venir partido en
 *  varios `<r><t>` (texto con formatos mezclados): se concatenan, que es lo que
 *  Excel muestra en la celda. */
export function leerSharedStrings(xml: string | null | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let texto = "";
    for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) texto += desescapar(t[1]);
    out.push(texto);
  }
  return out;
}

export interface HojaDelLibro {
  /** Ruta dentro del zip, p. ej. `xl/worksheets/sheet1.xml`. */
  ruta: string;
  /** Nombre visible de la pestaña. */
  nombre: string;
}

/**
 * Resuelve la PRIMERA hoja del libro por el índice del propio archivo
 * (`workbook.xml` → `workbook.xml.rels`), nunca adivinando `sheet1.xml`: el
 * archivo lo hizo otro programa y el nombre del part no tiene por qué coincidir
 * con el orden de las pestañas.
 *
 * Devuelve también cuántas hojas hay, para poder DECIRLO en pantalla: si el
 * libro tuviera varias, escribir en la primera en silencio sería adivinar.
 */
export function resolverHojas(workbookXml: string, relsXml: string): HojaDelLibro[] {
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = atributo(m[1], "Id");
    const target = atributo(m[1], "Target");
    if (id && target) rels.set(id, target);
  }
  const hojas: HojaDelLibro[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const nombre = atributo(m[1], "name") ?? "";
    const rid = atributo(m[1], "r:id") ?? atributo(m[1], "id");
    const target = rid ? rels.get(rid) : null;
    if (!target) continue;
    const limpio = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
    hojas.push({ ruta: `xl/${limpio}`, nombre: desescapar(nombre) });
  }
  return hojas;
}

// ── Lectura de la hoja ──────────────────────────────────────────────────────

/** Valor de una celda tal como se ve en Excel, como texto. */
function valorDeCelda(attrs: string, cuerpo: string | undefined, sst: readonly string[]): string {
  if (cuerpo == null) return "";
  const tipo = atributo(attrs, "t") ?? "n";
  if (tipo === "s") {
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    if (v == null) return "";
    const i = Number(v.trim());
    return Number.isInteger(i) && i >= 0 && i < sst.length ? sst[i] : "";
  }
  if (tipo === "inlineStr") {
    let texto = "";
    for (const t of cuerpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) texto += desescapar(t[1]);
    return texto;
  }
  // `str` (resultado de fórmula), `n`, `b`, `e`: el texto crudo de <v> es la
  // representación exacta que guarda el archivo. No se re-formatea: un código
  // numérico tiene que salir igual que como está escrito.
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
  return v == null ? "" : desescapar(v).trim();
}

export interface FilaConCodigo {
  /** Número de fila de Excel (1-based, el que se ve al costado). */
  fila: number;
  /** El código tal como está escrito en la columna B. */
  codigo: string;
}

export interface LecturaHoja {
  /** Encabezado de la columna B (fila 1), para poder mostrarlo. */
  encabezadoCodigo: string;
  /** Encabezado de la columna A (fila 1). */
  encabezadoFoto: string;
  /** Filas de datos con código, en el orden del archivo. */
  filas: FilaConCodigo[];
  /** Filas de datos (después del encabezado) SIN nada escrito en la columna B. */
  filasSinCodigo: number[];
  /** Filas de datos donde la columna A ya tiene algo escrito. Se van a pisar. */
  filasConAOcupada: number[];
  /** Última fila con contenido. */
  ultimaFila: number;
}

/**
 * Lee los códigos de la columna B. **No se salta ninguna fila con código** y no
 * se ordena nada: el orden es el del archivo, que es el orden en que Daniel lo
 * va a leer.
 */
export function leerHoja(sheetXml: string, sst: readonly string[]): LecturaHoja {
  const filas: FilaConCodigo[] = [];
  const filasSinCodigo: number[] = [];
  const filasConAOcupada: number[] = [];
  let encabezadoCodigo = "";
  let encabezadoFoto = "";
  let ultimaFila = 0;

  const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(sheetXml)?.[1] ?? "";
  RE_FILA.lastIndex = 0;
  for (const m of sheetData.matchAll(RE_FILA)) {
    const nFila = Number(atributo(m[1], "r") ?? "0");
    if (!nFila) continue;
    if (nFila > ultimaFila) ultimaFila = nFila;
    const cuerpo = m[2] ?? "";

    let codigo = "";
    let colA = "";
    RE_CELDA.lastIndex = 0;
    for (const c of cuerpo.matchAll(RE_CELDA)) {
      const ref = atributo(c[1], "r");
      if (!ref) continue;
      const col = columnaDeRef(ref);
      if (col === COL_CODIGO_INDICE) codigo = valorDeCelda(c[1], c[2] ?? "", sst);
      else if (col === COL_FOTO_INDICE) colA = valorDeCelda(c[1], c[2] ?? "", sst);
    }

    if (nFila === FILA_ENCABEZADO) {
      encabezadoCodigo = codigo;
      encabezadoFoto = colA;
      continue;
    }
    if (codigo.trim() === "") filasSinCodigo.push(nFila);
    else filas.push({ fila: nFila, codigo: codigo.trim() });
    if (colA.trim() !== "") filasConAOcupada.push(nFila);
  }

  return { encabezadoCodigo, encabezadoFoto, filas, filasSinCodigo, filasConAOcupada, ultimaFila };
}

// ── Geometría real de la celda ──────────────────────────────────────────────

/** Ancho de columna de Excel → píxeles (fórmula de OOXML con MDW=7). */
export function anchoColumnaAPx(ancho: number): number {
  return Math.round(((256 * ancho + Math.round(128 / MDW)) / 256) * MDW);
}

/** Alto en puntos → píxeles (72 pt = 96 px). */
export function altoPuntosAPx(pt: number): number {
  return Math.round((pt * 96) / 72);
}

export interface GeometriaHoja {
  /** Ancho de la columna A en píxeles. */
  anchoPx: number;
  /** Alto de cada fila que declara el suyo. */
  altoPorFila: Map<number, number>;
  /** Alto de las filas que no declaran ninguno. */
  altoDefectoPx: number;
}

/**
 * Mide la celda donde va a caer la foto **leyéndola del archivo**, no
 * suponiéndola: el alto de fila y el ancho de columna son de Daniel y este
 * camino no los cambia. Si la fila es baja, la foto sale chica — pero el
 * archivo sigue siendo el suyo.
 */
export function medirCeldaFoto(sheetXml: string): GeometriaHoja {
  const fmt = /<sheetFormatPr\b([^>]*)\/?>/.exec(sheetXml)?.[1] ?? "";
  const anchoDefecto = Number(atributo(fmt, "defaultColWidth") ?? "") || ANCHO_COL_DEFECTO;
  const altoDefectoPt = Number(atributo(fmt, "defaultRowHeight") ?? "") || ALTO_FILA_DEFECTO_PT;

  let anchoCol = anchoDefecto;
  const cols = /<cols>([\s\S]*?)<\/cols>/.exec(sheetXml)?.[1] ?? "";
  for (const m of cols.matchAll(/<col\b([^>]*)\/>/g)) {
    const min = Number(atributo(m[1], "min") ?? "0");
    const max = Number(atributo(m[1], "max") ?? "0");
    const w = Number(atributo(m[1], "width") ?? "");
    if (min <= COL_FOTO_INDICE + 1 && COL_FOTO_INDICE + 1 <= max && w > 0) {
      anchoCol = w;
      break;
    }
  }

  const altoPorFila = new Map<number, number>();
  const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(sheetXml)?.[1] ?? "";
  RE_FILA.lastIndex = 0;
  for (const m of sheetData.matchAll(RE_FILA)) {
    const nFila = Number(atributo(m[1], "r") ?? "0");
    const ht = Number(atributo(m[1], "ht") ?? "");
    if (nFila && ht > 0) altoPorFila.set(nFila, altoPuntosAPx(ht));
  }

  return {
    anchoPx: anchoColumnaAPx(anchoCol),
    altoPorFila,
    altoDefectoPx: altoPuntosAPx(altoDefectoPt),
  };
}

/** Caja disponible para la foto en una fila: la celda real menos un margen. */
export function cajaDeFila(geo: GeometriaHoja, fila: number): { ancho: number; alto: number; caja: number } {
  const alto = geo.altoPorFila.get(fila) ?? geo.altoDefectoPx;
  const ancho = geo.anchoPx;
  const caja = Math.max(8, Math.min(ancho, alto) - MARGEN_CELDA_PX);
  return { ancho, alto, caja };
}

// ── Escritura de la columna A ───────────────────────────────────────────────

/** Lo que va a quedar en la celda A de una fila. */
export type PlanCeldaFoto =
  /** Hay foto: la celda queda vacía (la foto se dibuja encima). */
  | "vacia"
  /** No hay foto: la celda dice NO IMAGEN. */
  | "sin-foto";

/**
 * Fila 0-based de `filas[i]` — la unidad en la que OOXML ancla una imagen.
 *
 * 🔴 NO es `i + 1`. Eso vale para el pedido Reebok, donde el Excel lo arma el
 * sistema y las filas van pegadas; acá las filas son las del archivo de Daniel
 * y pueden tener huecos (una fila sin código en la columna B no se toca pero
 * ocupa su número). Calcularlo en la pantalla es cómo la foto termina pegada
 * una fila más abajo.
 */
export function filaAnclaDe(filas: readonly FilaConCodigo[], i: number): number {
  return filas[i].fila - 1;
}

/**
 * Qué queda en cada celda de la columna A.
 *
 * 🔴 **NINGUNA FILA SE SALTA**: la que no tiene foto dice NO IMAGEN, que es la
 * verdad. Dejarla vacía se vería igual que "se pegó y nadie se dio cuenta".
 * `tieneFoto` es por CÓDIGO, así que un artículo repetido en dos filas recibe
 * el mismo trato en las dos.
 */
export function planColumnaFoto(
  filas: readonly FilaConCodigo[],
  tieneFoto: (codigo: string) => boolean,
): Map<number, PlanCeldaFoto> {
  const plan = new Map<number, PlanCeldaFoto>();
  for (const f of filas) plan.set(f.fila, tieneFoto(f.codigo) ? "vacia" : "sin-foto");
  return plan;
}

/**
 * Escribe la columna A. **Es lo ÚNICO que se toca de la hoja.**
 *
 * - Si la celda A ya existía, se le CONSERVA el estilo (`s`) y se le cambia el
 *   contenido: cambiar el formato sería cambiar el archivo de Daniel.
 * - Si no existía, se inserta al principio de la fila (las celdas de una fila
 *   tienen que venir en orden de columna).
 * - Una fila que no está en el plan no se toca ni se lee.
 */
export function escribirColumnaFoto(sheetXml: string, plan: ReadonlyMap<number, PlanCeldaFoto>): string {
  if (plan.size === 0) return sheetXml;

  const iniData = sheetXml.search(/<sheetData\b[^>]*>/);
  if (iniData === -1) return sheetXml;
  const aperturaFin = sheetXml.indexOf(">", iniData) + 1;
  const finData = sheetXml.indexOf("</sheetData>", aperturaFin);
  if (finData === -1) return sheetXml;

  const antes = sheetXml.slice(0, aperturaFin);
  const cuerpoData = sheetXml.slice(aperturaFin, finData);
  const despues = sheetXml.slice(finData);

  RE_FILA.lastIndex = 0;
  const nuevoCuerpo = cuerpoData.replace(RE_FILA, (completo, attrs: string, cuerpo?: string) => {
    const nFila = Number(atributo(attrs, "r") ?? "0");
    const que = plan.get(nFila);
    if (!que) return completo;

    const ref = `${letraDeColumna(COL_FOTO_INDICE)}${nFila}`;
    const filaCuerpo = cuerpo ?? "";

    // ¿ya existe la celda A?
    let estilo: string | null = null;
    let inicioA = -1;
    let finA = -1;
    RE_CELDA.lastIndex = 0;
    for (const c of filaCuerpo.matchAll(RE_CELDA)) {
      const r = atributo(c[1], "r");
      if (!r || columnaDeRef(r) !== COL_FOTO_INDICE) continue;
      estilo = atributo(c[1], "s");
      inicioA = c.index ?? -1;
      finA = inicioA + c[0].length;
      break;
    }

    const attrEstilo = estilo != null ? ` s="${estilo}"` : "";
    const celda =
      que === "sin-foto"
        ? `<c r="${ref}"${attrEstilo} t="inlineStr"><is><t>${escapar(TEXTO_SIN_FOTO)}</t></is></c>`
        : `<c r="${ref}"${attrEstilo}/>`;

    const nuevoCuerpoFila =
      inicioA >= 0 ? filaCuerpo.slice(0, inicioA) + celda + filaCuerpo.slice(finA) : celda + filaCuerpo;

    // `spans` dice qué columnas trae la fila; si empezaba en la B hay que
    // correrlo a la A o Excel avisa que el archivo tiene un problema.
    let nuevosAttrs = attrs;
    const spans = atributo(attrs, "spans");
    if (spans) {
      const [desde, hasta] = spans.split(":");
      if (Number(desde) > 1) nuevosAttrs = attrs.replace(`spans="${spans}"`, `spans="1:${hasta}"`);
    }

    return `<row${nuevosAttrs}>${nuevoCuerpoFila}</row>`;
  });

  let salida = antes + nuevoCuerpo + despues;

  // El `dimension` tiene que incluir la columna A.
  salida = salida.replace(/<dimension\b([^>]*)\/>/, (completo, attrs: string) => {
    const ref = atributo(attrs, "ref");
    if (!ref || !ref.includes(":")) return completo;
    const [ini, fin] = ref.split(":");
    if (columnaDeRef(ini) <= COL_FOTO_INDICE) return completo;
    const filaIni = /(\d+)$/.exec(ini)?.[1] ?? "1";
    return completo.replace(`ref="${ref}"`, `ref="A${filaIni}:${fin}"`);
  });

  return salida;
}

// ── Preguntas que la pantalla necesita contestar ────────────────────────────

/** ¿La hoja ya tiene fotos (o cualquier dibujo) pegadas? */
export function hojaTieneDibujo(sheetXml: string): boolean {
  return /<drawing\b[^>]*\/>/.test(sheetXml);
}

/** Extensiones que este camino acepta. `.xlsm` es el archivo de siempre. */
export const EXTENSIONES_LIBRO = [".xlsx", ".xlsm"] as const;

export function extensionAceptada(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES_LIBRO.some((e) => n.endsWith(e));
}

/** Nombre del archivo de salida: el mismo, con "-con fotos" antes de la
 *  extensión. Si el macro no se pudiera conservar, la extensión baja a .xlsx —
 *  y la pantalla lo dice ANTES de descargar. */
export function nombreDeSalida(nombreEntrada: string, conservaMacro: boolean): string {
  const punto = nombreEntrada.lastIndexOf(".");
  const base = punto > 0 ? nombreEntrada.slice(0, punto) : nombreEntrada;
  const ext = punto > 0 ? nombreEntrada.slice(punto).toLowerCase() : ".xlsx";
  const salidaExt = ext === ".xlsm" && !conservaMacro ? ".xlsx" : ext;
  return `${base} con fotos${salidaExt}`;
}
