// Depurador de Productos · lógica pura (sin DOM, sin xlsx).
//
// Portado TAL CUAL del HTML validado (depurador-REFERENCIA): mismo parsing,
// mismas reglas de talla del EAN, mismo mapeo de las 25 columnas de salida de
// Switch y misma detección de hoja. Está validado al centavo contra plantillas
// manuales reales — NO cambiar la lógica de negocio, solo el envoltorio.
//
// El único cambio estructural es de contenedor: en vez de un dict plano por fila
// (como en el HTML), cada fila procesada guarda los valores de columna en `cols`
// y los metadatos de UI (talla editable, fallback, destino) en campos propios.
// Los cálculos (redondeos, reglas, totales) son idénticos.

import { NORMALIZACION } from "./marca-descripciones";

export type Cell = string | number | boolean | null | undefined;

/** Catálogo de descripciones por marca. La fuente de verdad es la tabla
 *  `depurador_descripciones` (GET /api/productos/cargar/descripciones);
 *  las funciones que lo usan lo reciben como parámetro (puras/sincrónicas). */
export type CatalogoDescripciones = Record<string, string[]>;
export type SheetRow = Cell[];

export interface NamedSheet {
  name: string;
  rows: SheetRow[];
}

export interface DepuradorConfig {
  /** Factor costo CIF: Costo FOB × factor = CIF. Default 1.1 */
  factor: number | string;
  /** Tasa de impuesto (texto, ej "7") */
  tasa: string;
  /** Índice de mes 0-11 para la temporada */
  mesIdx: number;
  /** Año de la temporada */
  anio: string | number;
}

/** Una fila procesada = un estilo (tallas colapsadas a 1 fila). */
export interface ProcessedRow {
  /** Valores de las 25 columnas de salida, keyed por el nombre exacto de OUT_COLS. */
  cols: Record<string, string | number | null>;
  /** Talla actual del EAN elegido (editable por el usuario). */
  talla: string;
  /** Talla que eligió la regla automática (para marcar ámbar si se cambia). */
  tallaAuto: string;
  /** Todas las tallas disponibles del estilo -> su EAN (para el dropdown). */
  tallaMap: Record<string, string>;
  /** true si la regla NO halló la talla esperada y usó la más chica (revisar). */
  fallback: boolean;
  /** Empresa destino leída del archivo (NOMBRE_DESTINATARIO_MERCANCIAS). */
  destino: string;
}

export interface ProcessResult {
  rows: ProcessedRow[];
  warnings: string[];
  /** Artículos que quedaron fuera por no traer cantidad en el archivo (ver la nota
   *  de "artículos sin cantidad" en processRows). Los SERVICIOS nunca se cuentan acá. */
  omitidosSinCantidad: number;
  /** true si el archivo NO trae columna de CANTIDAD: no se filtró nada, porque sin
   *  esa columna TODO daría 0 y el Excel saldría vacío. */
  sinColumnaCantidad: boolean;
  /** Marcas del archivo que el catálogo NO conoce. `reclassMarca` las manda a
   *  "Otros", y "Otros" no tiene fórmula de precio → esos productos salen SIN
   *  PRECIO. Antes eso pasaba EN SILENCIO: nadie se enteraba hasta abrir el
   *  Excel. Ahora se dice en pantalla, con el conteo de productos afectados.
   *
   *  ⚠️ NO frena la carga: el producto sigue saliendo, igual que hoy. Lo único
   *  que cambia es que se dice. Los SERVICIOS (Ajuste de Precio, Mercancía
   *  Defectuosa…) no cuentan: su marca "Otros" es a propósito.
   *
   *  La marca va CRUDA, tal cual la escribió el proveedor — es el dato que hay
   *  que buscar en el archivo o darle de alta en MARCAS_CATALOGO.
   *  Ordenadas de más productos a menos. */
  marcasDesconocidas: { marca: string; productos: number }[];
}

/* ============ CONFIG / CONSTANTES ============ */
export const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

// Columnas de salida EXACTAS que espera Switch (orden fijo)
export const OUT_COLS = ["Código *", "Referencia *", "Código Barra *", "Descripción *", "Precio *",
  "Tasa de Impuesto *", "Costo FOB *", "Costo CIF *", "rubro *", "subrubro", "Marca *", "Proveedor *",
  "Mínimo Stock", "Código Tipo de Artículo *", "Unidad de medida *", "Origen", "Lote", "Serie",
  "Stock Ideal", "Temporada", "Composición", "Codigo CPBS", "Codigo CPBS Abrev", "Bonificación", "Cantidad por caja"];

/** Columnas forzadas a TEXTO en el Excel descargado: Código(0), Referencia(1), Código Barra(2). */
export const TEXT_COLS = [0, 1, 2];

// Alias de columnas de entrada (el proveedor cambia los nombres entre archivos)
const ALIAS: Record<string, string[]> = {
  ref: ["REFERENCIA", "REFERENCE", "REF"],
  ean: ["EAN", "CODIGO BARRA", "CODIGOBARRA", "BARCODE", "EAN_2"],
  cat: ["P_CATEGORY", "CATEGORY", "CATEGORIA"],
  talla: ["TALLA", "SIZE"],
  cant: ["CANTIDAD", "CANT", "QTY", "QUANTITY"],
  costo: ["COSTO", "COST", "COSTO FOB", "FOB"],
  precio: ["PRECIO2", "PRECIO F", "PRECIO_F", "PRICE"],
  marca: ["MARCA", "BRAND"],
  prov: ["PROVEEDOR", "SUPPLIER", "VENDOR"],
  genero: ["GENERO", "GENDER", "GÉNERO"],
  destino: ["NOMBRE_DESTINATARIO_MERCANCIAS", "DESTINATARIO", "NOMBRE_DESTINATARIO"],
  // Número de factura/documento del proveedor → va a "Codigo CPBS". Si no se detecta
  // por nombre, se cae a la POSICIÓN columna C (índice 2) en processRows.
  factura: ["FACT", "FACT.", "NUMERO_FACTURA", "NUMERO FACTURA", "NRO_FACTURA", "NO_FACTURA",
    "NUM_FACTURA", "N_FACTURA", "FACTURA", "NUMERO_DOCUMENTO", "NUMERO DOCUMENTO", "NRO_DOCUMENTO",
    "NO_DOCUMENTO", "DOCUMENTO", "INVOICE", "INVOICE NUMBER", "INVOICE_NO", "DOCUMENT"],
};

// Palabras que indican prenda inferior (pantalón/short) → talla numérica de ropa
const BOTTOMS = ["SHORT", "PANT", "DENIM", "TROUSER", "JEAN", "CHINO", "BERMUDA", "JOGGER", "LEGGING", "SKIRT", "FALDA"];
// Palabras que indican calzado → talla numérica de zapato (distinta de ropa)
const FOOTWEAR = ["SNEAKER", "SANDAL", "SHOE", "BOOT", "FLIP FLOP", "FLIPFLOP", "SLIPPER", "ESPADRILLE", "LOAFER", "HEEL", "MULE", "FOOTWEAR", "CHANCLA", "ZAPATO", "BOTA", "TENIS", "MOCASIN", "SWIMSHO"];

// Palabras que, si aparecen en un encabezado, lo descalifican para ciertos campos
// (evita que "COSTO" parcial agarre "COSTO CIF", o "PRECIO" agarre "PRECIO1"=costo inflado)
const COL_BLOCK: Record<string, string[]> = {
  costo: ["CIF", "PROMEDIO", "2"],
  precio: ["1", "BASE", "COSTO"],
};

/* ============ UTILES ============ */
export const norm = (s: Cell): string => (s === null || s === undefined) ? "" : String(s).trim().toUpperCase();

/** Clave canónica para emparejar marcas entre el Excel y la tabla de fórmulas.
 *  Insensible a mayúsculas Y a espacios: NFKC (NBSP → espacio normal), colapsa
 *  espacios múltiples, recorta y pasa a minúsculas. Así "CK MENSWEAR",
 *  "ck  menswear" y "CK Menswear" caen en la misma clave. NO toca `norm`
 *  (que usan la detección de columnas y las reglas de talla). */
export function marcaKey(s: Cell): string {
  return String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Correcciones de marcas mal escritas → marca correcta del catálogo.
 *  Llave = marcaKey(mal escrita); valor = la marca canónica, tal cual figura en
 *  MARCAS_CATALOGO. Insensible a caja y espacios en ambos lados, así que sirve
 *  igual para "TH ACCESORIES" (como viene de Switch, en MAYÚSCULA) que para
 *  "TH Accesories" (como viene del Excel del proveedor).
 *
 *  Estos nombres existen mal escritos DENTRO de Switch y no se pueden arreglar
 *  por API (para artículos la API de Switch es solo lectura). Se corrigen acá,
 *  al leerlos, para que el artículo caiga bajo su marca real en vez de "Otros".
 *  Ojo: corregir el nombre NO le pone precio — sin fórmula cargada para esa
 *  marca el producto sigue saliendo sin precio.
 *
 *  "OTROS" y "OTHERS" NO se corrigen: ésos son el cajón a propósito.
 *  Ampliar aquí en el futuro. */
export const MARCA_FIXES: Record<string, string> = {
  [marcaKey("TH ACCESORIES")]: "TH Accessories",       // typo del proveedor (una sola S)
  [marcaKey("TH OTHER ACCESORIES")]: "TH Accessories", // confirmado por Daniel: es TH Accessories
  [marcaKey("TH ACCESORIOS")]: "TH Accessories",       // en español
  [marcaKey("TH-ACCESORIOS")]: "TH Accessories",       // en español, con guion
  [marcaKey("CK ACCESORIES")]: "CK Accessories",       // mismo typo, línea CK
  [marcaKey("TH WOMEN")]: "TH Womenswear",
  [marcaKey("TH MEN")]: "TH Menswear",
  // 27T3128HDS600 "Unisex-Home": es el juego de toallas Tommy. Sus hermanas
  // (Unisex-Home, Unisex-Towels, Unisex-Home Towels) ya viven catalogadas bajo
  // TH Other — va exactamente donde ya están.
  [marcaKey("TH HOME")]: "TH Other",
  // MW0MW26882-MBP y 78E9892-832, los dos "POLO BASICO P/H COLOR ... SLIM",
  // rubro MEN. Un polo de hombre es menswear.
  [marcaKey("TH SPORT MEN")]: "TH Menswear",
};

/* "TH" a secas queda AFUERA a propósito: sus dos artículos van a marcas
 * distintas — 09TCR01-099 es "MENS T-SHIRT S-S" (sería TH Menswear) y
 * 69J7605-410 es "WOMEN HANDBAGS" (sería TH Accessories). Una corrección de
 * marca es una sola salida por entrada, así que no puede resolverlo: eso se
 * arregla artículo por artículo en Switch. Son 2 artículos sin venta desde
 * febrero de 2023. */

/** Normaliza la marca corrigiendo typos conocidos (insensible a caja/espacios).
 *  Se aplica al procesar: corrige la marca ANTES de buscar su fórmula y de
 *  escribirla en el Excel, para que Switch nunca reciba la marca mal escrita. */
export function fixMarca(marca: Cell): string {
  const raw = String(marca ?? "");
  return MARCA_FIXES[marcaKey(raw)] ?? raw;
}

function findCol(headers: Cell[], aliasList: string[], key?: string): number {
  const H = headers.map((h) => norm(h));
  // 1) match EXACTO (siempre gana)
  for (const a of aliasList) {
    const i = H.indexOf(norm(a));
    if (i !== -1) return i;
  }
  // 2) match parcial, pero descartando encabezados con palabras conflictivas
  const blockers = (key && COL_BLOCK[key]) ? COL_BLOCK[key].map(norm) : [];
  for (const a of aliasList) {
    const i = H.findIndex((h) => h.includes(norm(a)) && !blockers.some((b) => h.includes(b)));
    if (i !== -1) return i;
  }
  return -1;
}

// Limpia número que puede venir como "2,112.0000" o "13.5"
function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

// Descripción: quita SOLO el prefijo "M51-" y deja el resto TAL CUAL.
// Ej: "M51-Men-T-Shirts S/S" -> "Men-T-Shirts S/S"
function buildDesc(cat: Cell): string {
  let c = String(cat || "").trim();
  if (c.includes("-")) {
    const parts = c.split("-");
    // si el primer trozo parece código (M51, M02, 09...) lo quitamos
    if (/^[A-Z]?\d{1,3}$/i.test(parts[0].trim())) {
      parts.shift();
      c = parts.join("-");
    }
  }
  return c.trim();
}

// rubro = lo que va ANTES del primer guion (el género), case tal cual.
// Ej: "Men-T-Shirts S/S" -> "Men"  |  "Women-Bras" -> "Women"
export function buildRubro(desc: string): string {
  const i = desc.indexOf("-");
  return (i === -1 ? desc : desc.slice(0, i)).trim();
}

// subrubro = todo lo que va DESPUÉS del primer guion, TAL CUAL (conserva sus
// guiones internos). Solo el primer guion separa rubro de subrubro.
// Ej: "Men-Pant Non-Denim" -> "Pant Non-Denim"  |  "Men-T-Shirts S/S" -> "T-Shirts S/S"
export function buildSubrubro(desc: string): string {
  const i = desc.indexOf("-");
  return (i === -1 ? "" : desc.slice(i + 1)).trim();
}

// Géneros conocidos. Si el rubro no empieza con uno → es basura → "Otros" (Tarea 3.2).
const GENEROS = ["men", "women", "boys", "girls", "kids", "unisex", "newborn", "toddler"];
export function esGenero(rubro: string): boolean {
  const first = rubro.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return GENEROS.includes(first);
}

// Servicios: se detectan por la descripción. Tipo de artículo 02, sin stock,
// costo "0" explícito, marca/rubro "Otros" (Tarea 4).
const SERVICIOS: { match: string; descripcion: string }[] = [
  { match: "AJUSTE DE PRECIO", descripcion: "Ajuste de Precio" },
  { match: "MERCANCIA DEFECTUOSA", descripcion: "Mercancía Defectuosa" },
  { match: "RETENCION", descripcion: "Retención de N/C" },
  { match: "LIMPIEZA DE SALDO", descripcion: "Limpieza de Saldo" },
];
/** Si la descripción es un servicio, devuelve su nombre capitalizado; si no, null. */
export function detectServicio(desc: Cell): string | null {
  const d = norm(desc);
  for (const s of SERVICIOS) if (d.includes(s.match)) return s.descripcion;
  return null;
}

const MESES_TEMP: Record<string, string> = {
  FA: "11", FALL: "11", SP: "03", SPRING: "03", SF: "03", SU: "06",
  PF: "08", PS: "01", PSP: "01",
};

/** Convierte una temporada "gringa" o sucia a AAAA-MM (Tarea 3.5). Si trae año
 *  (2 o 4 dígitos) lo usa; si no, deja el año por defecto. Serial Excel
 *  (40000-50000) → fecha. 7+ dígitos o irrecuperable → "". */
export function convertTemporada(raw: Cell, anioDefault: string): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return "";
  // Serial de Excel (días desde 1899-12-30)
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (/^[0-9.]+$/.test(s) && n >= 40000 && n <= 50000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (/^\d{7,}$/.test(s)) return ""; // irrecuperable
  // Código gringo (FA, SP, SU, PF, PS, FALL, SPRING...) + año opcional (2 o 4 díg)
  const m = s.match(/([A-Z]+)\s*'?\s*(\d{2,4})?/);
  if (m && MESES_TEMP[m[1]]) {
    let yr = m[2] || anioDefault;
    if (yr.length === 2) yr = "20" + yr;
    return `${yr}-${MESES_TEMP[m[1]]}`;
  }
  // Ya viene AAAA-MM o similar
  const ym = s.match(/(\d{4})[-/](\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  return "";
}

interface RawItem {
  ean: string;
  talla: Cell;
  cant: number;
  costo: number | null;
  precio: number | null;
  marca: string;
  prov: string;
  cat: string;
  genero: string;
  destino: string;
  factura: string;
}

interface PickEANResult {
  ean: string;
  talla: string;
  fallback: boolean;
}

// Elegir el EAN representativo del estilo según las reglas de talla.
// Devuelve {ean, talla, fallback} — fallback=true si NO encontró la talla esperada
// y tuvo que usar la más chica TENIENDO varias tallas (señal de revisar).
function pickEAN(items: RawItem[], catRaw: string, genRaw: string): PickEANResult {
  const map: Record<string, string> = {};
  for (const it of items) { map[norm(it.talla)] = it.ean; }
  const cat = norm(catRaw), gen = norm(genRaw);
  const isMen = (cat.includes("MEN") && !cat.includes("WOMEN")) || gen === "MEN";
  const isWomen = cat.includes("WOMEN") || gen === "WOMEN";
  const isBottom = BOTTOMS.some((w) => cat.includes(w));
  const isFoot = FOOTWEAR.some((w) => cat.includes(w));
  // Kids: a veces viene con tallas USA (M) y a veces Europa (8, 10, 12) →
  // intentar "8" primero y caer a "M". Solo KIDS literal (Boys/Girls/Toddler
  // siguen en la regla general). Caso ADITIVO: no toca los existentes.
  const isKids = cat.includes("KIDS") || gen === "KIDS";

  const order: string[] = [];
  if (isKids) order.push("8");                  // kids: talla Europa 8
  if (isFoot && isMen) order.push("41");        // zapato hombre
  else if (isFoot && isWomen) order.push("37"); // zapato dama
  else if (isBottom && isMen) order.push("32"); // pantalón/short hombre
  else if (isBottom && isWomen) order.push("27"); // pantalón/short dama
  order.push("M"); // tops por defecto

  for (const t of order) { if (map[t] !== undefined) return { ean: map[t], talla: t, fallback: false }; }

  // No encontró la talla esperada. Usa la más chica.
  const SZ: Record<string, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6, OS: 0, U: 0, UNI: 0, "": 99, NONE: 99 };
  const keys = Object.keys(map);
  keys.sort((a, b) => {
    const ka: [number, number | string] = (a in SZ) ? [0, SZ[a]] : (isNaN(parseFloat(a)) ? [2, a] : [1, parseFloat(a)]);
    const kb: [number, number | string] = (b in SZ) ? [0, SZ[b]] : (isNaN(parseFloat(b)) ? [2, b] : [1, parseFloat(b)]);
    return ka[0] - kb[0] || (ka[1] > kb[1] ? 1 : ka[1] < kb[1] ? -1 : 0);
  });
  const chosen = keys[0];
  // OS / talla única = normal (sin alerta). Alerta SOLO si hay >1 talla real.
  const realSizes = keys.filter((k) => k !== "" && k !== "NONE");
  const isSingleOrOS = realSizes.length <= 1 || (realSizes.length === 1) ||
    (realSizes.every((k) => ["OS", "U", "UNI"].includes(k)));
  const fallback = !isSingleOrOS && realSizes.length > 1;
  return { ean: map[chosen], talla: chosen, fallback };
}

/* ============ DETECCIÓN DE HOJA ============ */
// Buscar la hoja con datos crudos: la que tenga REFERENCIA y EAN.
// Prioriza hojas cuyo nombre termina en _TXT.
export function pickBestSheet(sheets: NamedSheet[]): SheetRow[] | null {
  let bestSheet: SheetRow[] | null = null;
  let bestScore = -1;
  for (const { name, rows: arr } of sheets) {
    if (!arr.length) continue;
    const hdr = (arr[0] || []).map((h) => norm(h));
    let score = 0;
    if (hdr.some((h) => h.includes("REFERENCIA") || h === "REF")) score += 2;
    if (hdr.some((h) => h === "EAN" || h.includes("EAN"))) score += 2;
    if (hdr.some((h) => h.includes("TALLA") || h === "SIZE")) score += 1;
    if (hdr.some((h) => h.includes("CANTIDAD") || h === "QTY")) score += 1;
    if (/_TXT/i.test(name)) score += 3; // la hoja cruda del proveedor
    score += Math.min(arr.length / 100, 2); // más filas = más probable que sea la cruda
    if (score > bestScore) { bestScore = score; bestSheet = arr; }
  }
  return bestSheet;
}

/* ============ PROCESAMIENTO ============ */
export function processRows(rows: SheetRow[], config: DepuradorConfig): ProcessResult {
  const warnings: string[] = [];
  if (!rows.length) { throw new Error("El archivo no tiene filas de datos."); }

  const headers = rows[0];
  const col: Record<string, number> = {};
  for (const k in ALIAS) { col[k] = findCol(headers, ALIAS[k], k); }

  const missing: string[] = [];
  if (col.ref === -1) missing.push("REFERENCIA");
  if (col.ean === -1) missing.push("EAN");
  if (col.cat === -1) missing.push("P_CATEGORY / DESCRIPCIÓN");
  if (col.talla === -1) missing.push("TALLA");
  if (col.costo === -1) missing.push("COSTO");
  if (col.precio === -1) missing.push("PRECIO");
  if (missing.length) {
    throw new Error("No encontré estas columnas en el archivo: " + missing.join(", ") +
      ". Revisa que sea el Excel correcto del proveedor.");
  }

  // Columna del número de factura/documento del proveedor (→ "Codigo CPBS").
  // 1) por nombre de encabezado (alias). 2) si no, por POSICIÓN columna C (índice 2),
  //    siempre que esa columna no sea ya otra columna reconocida (evita agarrar la
  //    descripción/categoría si el archivo de prueba la tiene en C).
  let facturaCol = col.factura;
  if (facturaCol === -1) {
    const known = new Set([col.ref, col.ean, col.cat, col.talla, col.cant, col.costo, col.precio, col.marca, col.prov, col.genero, col.destino]);
    if (!known.has(2)) facturaCol = 2;
  }

  // Agrupar por REFERENCIA conservando orden de aparición
  const groups = new Map<string, RawItem[]>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
    const ref = String(row[col.ref] ?? "").trim();
    if (!ref) continue;
    const item: RawItem = {
      ean: String(row[col.ean] ?? "").trim(),
      talla: row[col.talla],
      cant: num(row[col.cant]) || 0,
      costo: num(row[col.costo]),
      precio: num(row[col.precio]),
      marca: col.marca !== -1 ? String(row[col.marca] ?? "").trim() : "",
      prov: col.prov !== -1 ? String(row[col.prov] ?? "").trim() : "",
      cat: col.cat !== -1 ? String(row[col.cat] ?? "").trim() : "",
      genero: col.genero !== -1 ? String(row[col.genero] ?? "").trim() : "",
      destino: col.destino !== -1 ? String(row[col.destino] ?? "").trim() : "",
      factura: facturaCol !== -1 ? String(row[facturaCol] ?? "").trim() : "",
    };
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref)!.push(item);
  }

  if (groups.size === 0) throw new Error("No se encontraron productos válidos (sin REFERENCIA).");

  const factor = num(config.factor) || 1.1;
  const tasa = config.tasa.trim();
  const mesIdx = config.mesIdx;
  const anio = String(config.anio);
  // Temporada en formato AAAA-MM (ej. 2026-06) (CAMBIO 3).
  const temporada = `${anio}-${String(mesIdx + 1).padStart(2, "0")}`;

  // ── Artículos sin cantidad ────────────────────────────────────────────────────
  // Daniel no quiere en el Excel los artículos que el proveedor no pidió. Acá el
  // criterio NO puede ser "la celda Stock Ideal dice 0": los SERVICIOS (tipo 02,
  // AJUSTE DE PRECIO y compañía) se emiten a propósito con Stock Ideal 0 y tienen que
  // seguir saliendo. El criterio correcto es "el proveedor no le asignó cantidad a este
  // artículo", y eso solo se puede saber si el archivo TRAE la columna CANTIDAD — que
  // no es obligatoria acá: sin ella num(row[-1]) da 0 en todas las filas y el filtro
  // vaciaría la plantilla entera. Sin columna, no se filtra nada.
  const hayColumnaCantidad = col.cant !== -1;
  let omitidosSinCantidad = 0;
  // Marcas que el catálogo no conoce → el producto sale sin precio. Se cuentan
  // DESPUÉS del filtro de "sin cantidad": lo que no entra al Excel no se avisa.
  const desconocidas = new Map<string, { marca: string; productos: number }>();

  const out: ProcessedRow[] = [];
  for (const [ref, items] of groups) {
    const first = items[0];
    const { ean, talla, fallback } = pickEAN(items, first.cat, first.genero);
    // mapa de todas las tallas disponibles del estilo -> su EAN (para el dropdown)
    const tallaMap: Record<string, string> = {};
    for (const it of items) {
      const t = String(it.talla || "").trim();
      if (t && !tallaMap[t]) tallaMap[t] = it.ean;
    }
    // Normaliza la descripción del proveedor a su forma limpia ANTES de mostrarla,
    // matchear su excepción y escribirla en el Excel (Tarea 2). rubro/subrubro se
    // derivan de la descripción ya limpia.
    const descRaw = normalizeDescripcion(buildDesc(first.cat));
    const qtyTotal = items.reduce((s, it) => s + (it.cant || 0), 0);
    let descOut = descRaw;
    let rubro = buildRubro(descRaw);
    let sub = buildSubrubro(descRaw);
    // Rubro no-género → basura → "Otros" y subrubro vacío (Tarea 3.2).
    if (!esGenero(rubro)) { rubro = "Otros"; sub = ""; }
    // Marca reclasificada (catálogo canónico, regla de marca rara, o "Otros") (Tarea 6).
    let marcaOut = reclassMarca(first.marca, descRaw);
    let tipoArt = "01";
    let stockOut: number = qtyTotal;
    let fob: number | null = first.costo;
    let cif = fob !== null ? Math.round(fob * factor * 100) / 100 : null;
    // FOB=0 pero CIF con valor → copiar CIF a FOB (Tarea 3.7).
    if ((fob === null || fob === 0) && cif !== null && cif > 0) fob = cif;

    // Servicio (Tarea 4): tipo 02, sin stock, costo 0 explícito, marca/rubro Otros.
    const servicio = detectServicio(descRaw);
    if (servicio) {
      descOut = servicio;
      marcaOut = "Otros";
      rubro = "Otros"; sub = "";
      tipoArt = "02";
      stockOut = 0;
      fob = 0; cif = 0;
    }

    // Fuera del Excel: artículo real (no servicio) al que el proveedor no le asignó
    // cantidad. `servicio` es justo lo que distingue "cantidad 0 de verdad" de
    // "Stock Ideal 0 por diseño".
    if (hayColumnaCantidad && !servicio && qtyTotal === 0) {
      omitidosSinCantidad++;
      continue;
    }

    // Marca fuera del catálogo: cae a "Otros" y sale SIN PRECIO. Se anota para
    // decirlo en pantalla (no frena nada). El servicio no cuenta: su "Otros" es
    // intencional. Va la marca CRUDA del proveedor, que es lo accionable.
    if (!servicio && marcaOut === "Otros") {
      const cruda = String(first.marca ?? "").trim() || "(sin marca)";
      const k = marcaKey(cruda);
      const e = desconocidas.get(k) ?? { marca: cruda, productos: 0 };
      e.productos++;
      desconocidas.set(k, e);
    }

    // Código de barra obligatorio: si no hay, usar el código del producto (Tarea 3.8).
    const barcode = ean || ref;

    // avisos de datos faltantes (no bloquea, solo informa)
    if (!ean) warnings.push(`${ref}: sin código de barra (se usó el código del producto)`);
    if (fob === null) warnings.push(`${ref}: sin costo`);
    if (first.precio === null) warnings.push(`${ref}: sin precio`);

    out.push({
      cols: {
        "Código *": ref,
        "Referencia *": ref,
        "Código Barra *": barcode,
        "Descripción *": descOut,
        "Precio *": first.precio,
        "Tasa de Impuesto *": tasa,
        "Costo FOB *": fob,
        "Costo CIF *": cif,
        "rubro *": rubro,
        "subrubro": sub,
        "Marca *": marcaOut,
        "Proveedor *": first.prov,
        "Mínimo Stock": "",
        "Código Tipo de Artículo *": tipoArt,
        "Unidad de medida *": "PIEZA",
        "Origen": "",
        "Lote": "",
        "Serie": "",
        "Stock Ideal": stockOut,
        "Temporada": temporada,
        "Composición": "",
        "Codigo CPBS": first.factura, // número de factura/documento del proveedor (columna C)
        "Codigo CPBS Abrev": "",
        "Bonificación": "",
        "Cantidad por caja": "",
      },
      talla,
      tallaAuto: talla,
      tallaMap,
      fallback,
      destino: first.destino,
    });
  }
  // Nunca entregar una plantilla vacía en silencio.
  if (out.length === 0 && omitidosSinCantidad > 0) {
    throw new Error(`Ninguno de los ${omitidosSinCantidad} artículos del archivo trae cantidad, ` +
      "así que la plantilla saldría vacía. Revisa que la columna CANTIDAD tenga números.");
  }
  return {
    rows: out,
    warnings,
    omitidosSinCantidad,
    sinColumnaCantidad: !hayColumnaCantidad,
    marcasDesconocidas: [...desconocidas.values()].sort(
      (a, b) => b.productos - a.productos || a.marca.localeCompare(b.marca)
    ),
  };
}

/** Reescribe el EAN de una fila a la talla elegida en el dropdown (inmutable). */
export function setRowTalla(row: ProcessedRow, nuevaTalla: string): ProcessedRow {
  return {
    ...row,
    talla: nuevaTalla,
    cols: { ...row.cols, "Código Barra *": row.tallaMap[nuevaTalla] ?? row.cols["Código Barra *"] },
  };
}

// Columnas de texto que van en Title Case en el Excel (CAMBIO 5). Código,
// Referencia, Marca (TH/CK) y Temporada (AAAA-MM) se dejan tal cual.
const TITLECASE_COLS = new Set(["Descripción *", "rubro *", "subrubro", "Proveedor *"]);

const SIGLA_BARRA = /^[A-Za-z]{1,3}(\/[A-Za-z]{1,3})+$/; // S/S, L/S
const capSeg = (seg: string): string =>
  seg.split("/").map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p)).join("/");

/** Title Case (Primera Mayúscula, resto minúscula) preservando siglas de manga
 *  (S/S, L/S), códigos con dígitos (3PK, 2PK, 1PC) y acrónimos cortos (SA). */
export function titleCase(s: Cell): string {
  const str = String(s ?? "");
  if (!str) return str;
  return str.split(/(\s+)/).map((tok) => {
    if (tok === "" || /^\s+$/.test(tok)) return tok;     // espacios
    if (/\d/.test(tok)) return tok;                      // 3PK, 2PK, 1PC
    if (SIGLA_BARRA.test(tok)) return tok.toUpperCase(); // S/S, L/S
    if (/^[A-Z]{1,2}$/.test(tok)) return tok;            // SA (acrónimo corto)
    return tok.split("-").map(capSeg).join("-");         // mantiene los "-"
  }).join("");
}

// Columnas de salida por defecto (Vistana / Fashion Wear / Active Wear): 24 cols,
// FOB+CIF, SIN Composición pero CON Codigo CPBS (= número de factura del proveedor).
export const OUT_COLS_DEFAULT = OUT_COLS.filter((c) => c !== "Composición");

// Plantilla de Fashion Shoes (Tarea 5): 24 cols, UNA sola columna "Costo *"
// (= FOB desde el 1-sep-2026; era el CIF), e incluye Composición y Codigo CPBS
// (van VACÍAS pero la columna existe).
export const OUT_COLS_SHOES = [
  "Código *", "Referencia *", "Código Barra *", "Descripción *", "Precio *",
  "Tasa de Impuesto *", "Costo *", "rubro *", "subrubro", "Marca *", "Proveedor *",
  "Mínimo Stock", "Código Tipo de Artículo *", "Unidad de medida *", "Origen", "Lote",
  "Serie", "Stock Ideal", "Temporada", "Composición", "Codigo CPBS", "Codigo CPBS Abrev",
  "Bonificación", "Cantidad por caja",
];

/** Columnas de salida según la empresa destino (Tarea 5). Fashion Shoes usa la
 *  plantilla de 1 columna de costo; el resto usa FOB+CIF. */
export function outColsForEmpresa(empresaKey: string): string[] {
  return empresaKey === "fashion_shoes" ? OUT_COLS_SHOES : OUT_COLS_DEFAULT;
}

/** AOA (array of arrays) para generar el Excel, con el set de columnas dado
 *  (default = OUT_COLS_DEFAULT). Aplica Title Case y, en subrubro, "/"→"-".
 *  La columna "Costo *" (plantilla Fashion Shoes) toma el Costo FOB. */
export function buildAoa(rows: ProcessedRow[], cols: string[] = OUT_COLS_DEFAULT): (string | number)[][] {
  const aoa: (string | number)[][] = [cols.slice()];
  for (const d of rows) {
    aoa.push(cols.map((c) => {
      if (c === "Costo *") {
        // 🔴 EL FOB, NO EL CIF (1-sep-2026). Daniel, textual: *"en fashion shoes,
        // cuando me das el excel ya depurado, me das un solo costo… quiero que
        // me des el fob en vez del cif ahí"*.
        //
        // 🔑 No lleva respaldo, y no es un olvido: el FOB es el costo que viene
        // en el archivo del proveedor y el CIF se CALCULA de él
        // (`cif = fob × factor`). Cuando no hay FOB tampoco hay CIF, así que un
        // `?? CIF` nunca se dispararía — y si algún día se disparara estaría
        // poniendo un costo con flete adentro en una columna que dice FOB.
        const v = d.cols["Costo FOB *"];
        return v === null || v === undefined ? "" : v;
      }
      const v = d.cols[c];
      if (v === null || v === undefined) return "";
      // subrubro: Title Case y luego "/"→"-" (ej. "T-Shirts S/S" → "T-Shirts S-S") (Tarea 3.1).
      if (c === "subrubro") return titleCase(v).replace(/\//g, "-");
      return TITLECASE_COLS.has(c) ? titleCase(v) : v;
    }));
  }
  return aoa;
}

/** Nombre de archivo de salida: PLANT_<MARCA>_<TEMPORADA>.xlsx */
export function outputFilename(rows: ProcessedRow[]): string {
  const marca = String(rows[0]?.cols["Marca *"] || "PROD").replace(/[^A-Za-z0-9]/g, "_").slice(0, 12).toUpperCase();
  const temp = String(rows[0]?.cols["Temporada"] || "");
  return `PLANT_${marca}_${temp}.xlsx`;
}

/* ============ EMPRESA DESTINO (Tarea 3) ============ */
export interface EmpresaDestino {
  key: string;
  label: string;
  marca: string;
}

// Empresas destino a las que se sube en Switch.
export const EMPRESAS_DESTINO: EmpresaDestino[] = [
  { key: "vistana", label: "Vistana International", marca: "Calvin" },
  { key: "fashion_wear", label: "Fashion Wear", marca: "Tommy" },
  { key: "fashion_shoes", label: "Fashion Shoes", marca: "Tommy" },
  { key: "active_wear", label: "Active Wear", marca: "Karl Lagerfeld" },
];

/** Proveedor fijo según la empresa destino (CAMBIO 2). Para las 3 empresas
 *  conocidas devuelve el nombre exacto; para otras, null = dejar el del archivo. */
export function proveedorParaEmpresa(empresaKey: string): string | null {
  switch (empresaKey) {
    case "vistana": return "American Designer Fashion";
    case "fashion_wear":
    case "fashion_shoes": return "American Fashion Wear, SA";
    default: return null;
  }
}

/** Preselecciona la empresa leyendo NOMBRE_DESTINATARIO_MERCANCIAS del archivo.
 *  Si no calza o no hay dato, devuelve null (la secretaria elige a mano). */
export function matchEmpresaFromDestino(destinoRaw: string): string | null {
  const d = norm(destinoRaw);
  if (!d) return null;
  if (d.includes("VISTANA")) return "vistana";
  if (d.includes("FASHION SHOES")) return "fashion_shoes";
  if (d.includes("FASHION WEAR")) return "fashion_wear";
  if (d.includes("ACTIVE WEAR") || d.includes("KARL") || d.includes("LAGERFELD") || d.includes("MULTIFASHION")) return "active_wear";
  return null;
}

/* ============ CATÁLOGO FIJO DE MARCAS CK/TH ============ */
export interface MarcaCatalogo {
  marca: string;
  empresa: string; // etiqueta de EMPRESAS_DESTINO, para agrupar en la config
}

// Catálogo fijo que la pantalla de Configuración SIEMPRE muestra como filas
// editables, tenga o no fórmula guardada. CK → Vistana; TH apparel → Fashion Wear;
// TH calzado → Fashion Shoes. Ampliar aquí si el proveedor agrega marcas.
// Empresa (etiqueta para agrupar en la config) según el prefijo de la marca.
function empresaDeMarcaCatalogo(marca: string): string {
  const m = marca.toUpperCase();
  if (m.startsWith("KL")) return "Active Wear";
  if (m.startsWith("CK")) return "Vistana International";
  if (m === "TH FOOTWEAR") return "Fashion Shoes"; // calzado Tommy → plantilla Costo único
  return "Fashion Wear"; // resto TH (apparel)
}

// Lista FIJA de las marcas del catálogo (CK/TH/KL). Es lógica de negocio y se
// queda en código (las descripciones de cada marca viven en la tabla
// depurador_descripciones). Ampliar aquí si el proveedor agrega marcas.
//
// ── 26-ago-2026: entran 7 líneas que el proveedor ya factura y el sistema no
// conocía. Una marca que no está acá cae a "Otros" en reclassMarca, y "Otros"
// no tiene fórmula de precio: el producto salía SIN PRECIO. Karl Lagerfeld se
// agregó después que CK y TH y nunca se le completó el juego — de sus 9 líneas
// el sistema conocía 4. Evidencia (reporte del proveedor
// FASHION_WEAR_Y_VISTANA_EN_DETALLES, hoja FACTURACION 2022-2026 + hojas de
// pedidos pendientes, y ventas reales en switch_factura_lineas):
//
//   KL Jeans           facturado $844.80 (2026)
//   KL Legwear         6 pedidos pendientes · 96 unidades
//   KL Other           facturado $112.00 (2026) · 18 pedidos · 50 unidades
//   KL Underwear       17 pedidos pendientes · 96 unidades
//   KL Display & Promo facturado $27.00 (2024)
//   TH License         facturado $158,464.45 (2022-2026)
//   TH Display & Promo 47 líneas de venta en Switch · 2 filas en un archivo
//                      real del proveedor (la ÚNICA marca fuera de catálogo
//                      que aparece en los archivos _TXT que come el Depurador)
//
// Dar de alta la marca NO le pone precio: le abre la fila en Configuración para
// que se le cargue la fórmula. Sin fórmula el precio sigue vacío, a propósito.
const MARCAS_CATALOGO: string[] = [
  "CK Accessories",
  "CK Display & Promo",
  "CK Footwear",
  "CK Jeans",
  "CK Kids",
  "CK Legwear",
  "CK Menswear",
  "CK Other",
  "CK Performance",
  "CK Swimwear",
  "CK Underwear",
  "CK Womenswear",
  "KL Accessories",
  "KL Display & Promo",
  "KL Footwear",
  "KL Jeans",
  "KL Legwear",
  "KL Menswear",
  "KL Other",
  "KL Underwear",
  "KL Womenswear",
  "TH Accessories",
  "TH Display & Promo",
  "TH Footwear",
  "TH Kids",
  "TH Legwear",
  "TH License",
  "TH Menswear",
  "TH Other",
  "TH Swimwear",
  "TH Tommy Jeans",
  "TH Underwear",
  "TH Womenswear",
];

export const MARCA_CATALOGO: MarcaCatalogo[] = MARCAS_CATALOGO.map(
  (marca) => ({ marca, empresa: empresaDeMarcaCatalogo(marca) })
);

/* ============ FÓRMULA DE PRECIO POR MARCA ============ */
// precio = CEILING(Costo CIF ÷ divisor) + extra, redondeado hacia arriba.
// El Costo CIF YA es FOB × 1.1 (lo calcula processRows) — el divisor NO vuelve
// a multiplicar. Si divisor = 0 o no hay fórmula, el precio queda vacío (null).

// "int" = entero hacia arriba · "half" = a .50 hacia arriba · "par" = siguiente
// entero PAR hacia arriba (usado por Reebok). CK/TH solo usan int/half.
export type Redondeo = "int" | "half" | "par";

export interface MarcaFormula {
  marca: string;
  empresa?: string | null;
  divisor: number;
  extra: number;
  redondeo: Redondeo;
}

/** Excepción de fórmula por marca + rubro/descripción. Tiene prioridad sobre la de la marca.
 *  `precio_fijo` (opcional): si está lleno, es el precio en dólares asignado directo a la
 *  descripción y GANA a cualquier fórmula (ignora costo/divisor/extra/redondeo). */
export interface MarcaRubroFormula {
  id?: string;
  marca: string;
  rubro: string;
  divisor: number;
  extra: number;
  redondeo: Redondeo;
  precio_fijo?: number | null;
}

/** Clave canónica de una excepción por marca+rubro/descripción (insensible a caja/espacios). */
export function marcaRubroKey(marca: Cell, rubro: Cell): string {
  return `${marcaKey(marca)}|||${marcaKey(rubro)}`;
}

/* ============ CATÁLOGO DE DESCRIPCIONES POR MARCA (inyectado) ============ */
// El catálogo viene de la tabla depurador_descripciones y se inyecta como
// parámetro. Para no reindexar en cada llamada, el mapa marca (clave canónica)
// → descripciones se cachea por objeto de catálogo (WeakMap).
const DESC_INDEX_CACHE = new WeakMap<CatalogoDescripciones, Map<string, string[]>>();

function descIndex(catalogo: CatalogoDescripciones): Map<string, string[]> {
  let idx = DESC_INDEX_CACHE.get(catalogo);
  if (!idx) {
    idx = new Map(Object.entries(catalogo).map(([m, arr]) => [marcaKey(m), arr]));
    DESC_INDEX_CACHE.set(catalogo, idx);
  }
  return idx;
}

/** Descripciones del catálogo para una marca (ya vienen en orden alfabético).
 *  [] si la marca no está en el catálogo. */
export function descripcionesDeMarca(catalogo: CatalogoDescripciones, marca: Cell): string[] {
  return descIndex(catalogo).get(marcaKey(marca)) ?? [];
}

// Marca canónica del catálogo por clave (para escribir "CK Menswear", no "CK MENSWEAR").
const MARCA_CANON_BY_KEY: Map<string, string> = new Map(
  MARCA_CATALOGO.map((c) => [marcaKey(c.marca), c.marca])
);

/** Devuelve la marca con la capitalización canónica del catálogo (ej. "CK Menswear").
 *  Si no está en el catálogo, la deja tal cual (sin forzar mayúsculas). */
export function canonicalMarca(marca: Cell): string {
  const raw = String(marca ?? "").trim();
  return MARCA_CANON_BY_KEY.get(marcaKey(raw)) ?? raw;
}

/** Reclasifica marcas raras del proveedor a una marca CK/TH válida o "Otros" (Tarea 6).
 *  Si ya es una marca limpia del catálogo, devuelve su forma canónica. */
export function reclassMarca(rawMarca: Cell, desc: Cell): string {
  const fixed = fixMarca(rawMarca); // corrige typo TH ACCESORIES → TH ACCESSORIES
  if (MARCA_CANON_BY_KEY.has(marcaKey(fixed))) return canonicalMarca(fixed);
  const m = marcaKey(fixed);
  const d = norm(desc);
  if (m.startsWith("toddler")) return "TH Kids";          // TODDLER BOYS/GIRLS
  if (m === "unisex") return "TH Other";                  // luggage
  if (m === "alberto" && d.includes("POLO")) return "TH Menswear";
  if (m === "general" && d.includes("PANTIES")) return "TH Underwear";
  if (m === "apparel" && d.includes("T-SHIRT")) return "CK Jeans";
  if (m === "women") return "CK Jeans";                   // marca suelta
  // OTHERS y todo lo demás no-mercancía (AGUA, muebles, freezer, tazas…) → Otros.
  return "Otros";
}

/** true si la descripción (canónica) está catalogada para esa marca. */
export function esDescripcionCatalogada(catalogo: CatalogoDescripciones, marca: Cell, desc: Cell): boolean {
  const list = descIndex(catalogo).get(marcaKey(marca));
  if (!list) return false;
  const k = marcaKey(desc);
  return list.some((d) => marcaKey(d) === k);
}

// Normalización de descripciones sucias del proveedor → limpia (clave canónica).
const NORM_BY_KEY: Map<string, string> = new Map(
  Object.entries(NORMALIZACION).map(([dirty, clean]) => [marcaKey(dirty), clean])
);

const SHIRTS_WOVEN = /Shirts\s*[-/]?\s*Woven\s*Tops/gi;

/** Principios programáticos de limpieza de descripción (Tarea 1), en orden.
 *  Se aplican ANTES de buscar en el catálogo. */
function applyPrinciples(s: string): string {
  let d = s;
  d = d.replace(/\s*\(Layette\)/gi, "");              // 1 quitar (Layette)
  d = d.replace(/\s*\bDESTALLADOS?\b/gi, "");          // 2 quitar DESTALLADO(S) (edición manual)
  d = d.replace(/\s*\bOFERTA\b/gi, "");                // 3 quitar OFERTA
  d = d.replace(SHIRTS_WOVEN, "Shirts Woven");         // 4 Shirts [-/]? Woven Tops → Shirts Woven
  d = d.replace(/\s*\bKnits\b/gi, "");                 // 5 quitar Knits (plural; NO toca "Knit")
  d = d.replace(/\s*\bGoods\b/gi, "");                 // 6 quitar Goods
  // (sin Polo→Polos: el proveedor manda "Polos S/S" y "Polo S/S Core" a propósito)
  d = d.replace(/\bS-S\b/gi, "S/S").replace(/\bL-S\b/gi, "L/S"); // 7 S-S→S/S, L-S→L/S
  d = d.replace(/\s{2,}/g, " ").trim();                // 9 colapsar dobles espacios
  return d;
}

/** Lista de los principios de limpieza (Tarea 1), para la pestaña "Reglas". */
export const PRINCIPIOS_LIMPIEZA: { titulo: string; ejemplo: string }[] = [
  { titulo: "Quitar (Layette)", ejemplo: "Newborn (Layette)-Bodies → Newborn-Bodies" },
  { titulo: "Quitar DESTALLADO / DESTALLADOS (edición manual)", ejemplo: "Men-Polos S/S DESTALLADO → Men-Polos S/S" },
  { titulo: "Quitar OFERTA", ejemplo: "Men-Polos L/S OFERTA → Men-Polos L/S" },
  { titulo: "Shirts / Woven Tops → Shirts Woven", ejemplo: "Men-Shirts / Woven Tops S/S → Men-Shirts Woven S/S" },
  { titulo: "Quitar Knits (plural; NO toca Knit)", ejemplo: "Men-Heavyweight Knits → Men-Heavyweight" },
  { titulo: "Quitar Goods", ejemplo: "Men-Small Leather Goods → Men-Small Leather" },
  { titulo: "S-S → S/S, L-S → L/S", ejemplo: "Boys-Polos S-S → Boys-Polos S/S" },
  { titulo: "Colapsar dobles espacios a uno", ejemplo: "Men-Shirts  L/S → Men-Shirts L/S" },
];

/** Normaliza una descripción del proveedor a su forma limpia (insensible a
 *  caja/espacios). Aplica el mapa directo NORMALIZACION + los principios
 *  programáticos, y re-chequea el mapa tras los principios. */
export function normalizeDescripcion(desc: Cell): string {
  const original = String(desc ?? "").trim();
  let d = NORM_BY_KEY.get(marcaKey(original)) ?? original; // 1) mapa directo (typo exacto)
  d = applyPrinciples(d);                                  // 2) principios
  d = NORM_BY_KEY.get(marcaKey(d)) ?? d;                   // 3) re-chequear mapa
  return d;
}

/** Redondeo CEILING al entero hacia arriba (13.00→13, 13.01→14).
 *  Se redondea antes a 4 decimales para matar polvo de punto flotante. */
export function ceilInt(x: number): number {
  return Math.ceil(Math.round(x * 10000) / 10000);
}

/** Redondeo CEILING a .50 hacia arriba (13.44→13.50, 13.01→13.50). */
export function ceilHalf(x: number): number {
  return Math.ceil(x * 2 - 0.0001) / 2;
}

/** Redondeo al siguiente entero PAR hacia arriba: ceil(x); si es impar, +1
 *  (50.34→51→52, 47.19→48→48). Usado por Reebok. */
export function ceilPar(x: number): number {
  const c = Math.ceil(Math.round(x * 10000) / 10000);
  return c % 2 === 0 ? c : c + 1;
}

/** Calcula el precio de un estilo. Devuelve null (precio vacío) si no hay CIF,
 *  no hay fórmula o el divisor es 0 → la secretaria lo pone a mano. */
export function calcPrecio(
  cif: number | null | undefined,
  f: { divisor: number; extra: number; redondeo: Redondeo } | null | undefined
): number | null {
  if (cif === null || cif === undefined || !Number.isFinite(cif)) return null;
  if (!f || !f.divisor || f.divisor === 0) return null;
  const q = cif / f.divisor;
  const base = f.redondeo === "half" ? ceilHalf(q) : f.redondeo === "par" ? ceilPar(q) : ceilInt(q);
  return base + (f.extra || 0);
}

/** Precio de una descripción según la jerarquía (de mayor a menor prioridad):
 *  1) precio fijo de la descripción → ese número tal cual (sin cálculo).
 *  2) fórmula propia de la descripción (divisor/extra/redondeo).
 *  3) fórmula de la marca.
 *  Devuelve null si nada aplica (la secretaria lo pone a mano). */
export function precioDescripcion(
  cif: number | null | undefined,
  exc: MarcaRubroFormula | null | undefined,
  marcaFormula: { divisor: number; extra: number; redondeo: Redondeo } | null | undefined
): number | null {
  if (exc && exc.precio_fijo != null && Number.isFinite(exc.precio_fijo) && exc.precio_fijo > 0) {
    return exc.precio_fijo; // 1) precio fijo gana
  }
  if (exc && exc.divisor) return calcPrecio(cif, exc); // 2) fórmula propia de la descripción
  return calcPrecio(cif, marcaFormula ?? null);        // 3) fórmula de la marca
}

/** Texto humano de la fórmula, para mostrar en vivo. */
export function formulaText(f: { divisor: number; extra: number; redondeo: Redondeo }): string {
  const ex = f.extra > 0 ? ` + ${f.extra}` : "";
  const r = f.redondeo === "half" ? "a .50" : f.redondeo === "par" ? "al par" : "al entero";
  return `TECHO(Costo CIF ÷ ${f.divisor || "—"})${ex} · redondeo ${r} hacia arriba`;
}

/** Hint compacto del cálculo de una fila (ej "17.60÷0.73+2"). */
export function calcHint(cif: number | null | undefined, f: { divisor: number; extra: number } | null | undefined): string {
  if (cif === null || cif === undefined || !f || !f.divisor) return "—";
  return `${Number(cif).toFixed(2)}÷${f.divisor}${f.extra > 0 ? "+" + f.extra : ""}`;
}

/** Margen REAL post-redondeo, en % entero: (precioFinal − CIF) / precioFinal.
 *  Se trunca a entero (no redondea hacia arriba) para no inflar el margen.
 *  Ej: CIF 13.20, precio 19 → 30%. null si falta CIF o el precio es ≤ 0. */
export function marginPct(cif: number | null | undefined, finalPrice: number | null | undefined): number | null {
  if (cif === null || cif === undefined || finalPrice === null || finalPrice === undefined) return null;
  if (!Number.isFinite(cif) || !Number.isFinite(finalPrice) || finalPrice <= 0) return null;
  return Math.floor(((finalPrice - cif) / finalPrice) * 100);
}

/* ============ TOTALES PARA HISTORIAL (Tarea 4) ============ */
export interface CargaTotales {
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
  marca: string;
}

/** Calcula los totales de la carga para el registro de historial.
 *  total_costo = Σ (Costo CIF × unidades) por estilo. */
export function computeTotales(rows: ProcessedRow[]): CargaTotales {
  let total_unidades = 0;
  let total_costo = 0;
  for (const r of rows) {
    const units = Number(r.cols["Stock Ideal"]) || 0;
    const cif = Number(r.cols["Costo CIF *"]) || 0;
    total_unidades += units;
    total_costo += cif * units;
  }
  return {
    cantidad_estilos: rows.length,
    total_unidades,
    total_costo: Math.round(total_costo * 100) / 100,
    marca: String(rows[0]?.cols["Marca *"] || ""),
  };
}
