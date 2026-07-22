// Facturas Tienda · lógica pura (sin DOM, sin xlsx).
//
// Convierte las facturas que las 6 empresas del grupo le emiten a la tienda
// retail (Multifashion/ACS) en la plantilla de importación de Switch (24
// columnas, formato Fashion Shoes: UNA sola columna "Costo *"). Acepta 3
// formatos de la MISMA factura exportada distinto desde Switch:
//   A) .xls  — header en fila 3 (índice 2), fila 1 trae "N. Interno: 11-XXXX".
//              Columnas: CODIGO, CODIGO BARRA, REFERENCIA, DESCRIPCION, MARCA,
//              RUBRO, SUB RUBRO, UNIDAD DE MEDIDA, PROVEEDOR, CANTIDAD, PRECIO…
//   B) .csv  — delimitado por ';' (UTF-8 con BOM), header en fila 1. Columnas:
//              FECHA, COMPROBANTE, …, CODIGO ARTICULO, NOMBRE ARTICULO, ORIGEN,
//              REFERENCIA, CODIGO DE BARRA, PROVEEDOR, CANTIDAD, PRECIO, …
//   C) .xlsx — mismo header que (B).
//
// Reusa del Depurador: normalizeDescripcion (NORMALIZACION + applyPrinciples),
// buildRubro/buildSubrubro, esGenero, reclassMarca, detectServicio, titleCase
// y la plantilla OUT_COLS_SHOES. NO toca la lógica del Depurador.

import {
  OUT_COLS_SHOES,
  buildRubro,
  buildSubrubro,
  esGenero,
  detectServicio,
  normalizeDescripcion,
  reclassMarca,
  canonicalMarca,
  marcaKey,
  titleCase,
  norm,
  MARCA_CATALOGO,
  descripcionesDeMarca,
  esDescripcionCatalogada,
  type CatalogoDescripciones,
  type Cell,
  type SheetRow,
  type MarcaCatalogo,
} from "./logic";

export { OUT_COLS_SHOES };

/* ============ EMPRESAS DEL GRUPO (proveedor factura → proveedor TIENDA) ============ */
// La columna "Proveedor *" de la plantilla SIEMPRE lleva la razón social completa
// de la empresa del grupo (proveedor TIENDA), nunca el proveedor original.
export interface EmpresaTienda {
  key: string;
  label: string;
  /** Razón social que va en la columna "Proveedor *" de la plantilla. */
  proveedorTienda: string;
}

export const EMPRESAS_TIENDA: EmpresaTienda[] = [
  { key: "vistana", label: "Vistana", proveedorTienda: "VISTANA INTERNATIONAL PANAMA, S.A." },
  { key: "fashion_wear", label: "Fashion Wear", proveedorTienda: "FASHION WEAR, INC" },
  { key: "fashion_shoes", label: "Fashion Shoes", proveedorTienda: "FASHION SHOES HOLDINGS, S.A." },
  { key: "active_wear", label: "Active Wear", proveedorTienda: "ACTIVE WEAR S.A" },
  { key: "active_shoes", label: "Active Shoes", proveedorTienda: "ACTIVE SHOES S.A" },
  { key: "joystep", label: "Joystep", proveedorTienda: "JOYSTEP CORP." },
];

const EMPRESA_BY_KEY = new Map(EMPRESAS_TIENDA.map((e) => [e.key, e]));

/** Normaliza el proveedor entrante: NFKC, colapsa espacios múltiples, trim,
 *  minúsculas (el CSV trae " American  Fashion  Wear,  SA " con dobles espacios). */
export function provKey(s: Cell): string {
  return String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

// Descripción footwear → desempata "American Fashion Wear" a Fashion Shoes.
const FOOTWEAR_DESC = ["SNEAKER", "FLIP FLOP", "FLIPFLOP", "FLIP-FLOP", "SANDAL", "BOOT", "SHOE"];
export function esDescripcionFootwear(desc: Cell): boolean {
  const d = norm(desc);
  return FOOTWEAR_DESC.some((w) => d.includes(w));
}

/** Empresa del grupo según el PROVEEDOR de la factura (regla fija). "American
 *  Fashion Wear" es AMBIGUO y se desempata por la descripción (footwear →
 *  Fashion Shoes; si no → Fashion Wear). null = proveedor desconocido. */
export function matchEmpresaTienda(proveedor: Cell, descripcion: Cell): EmpresaTienda | null {
  const p = provKey(proveedor);
  if (!p) return null;
  const pick = (key: string) => EMPRESA_BY_KEY.get(key) ?? null;
  if (p.startsWith("american designer fashion")) return pick("vistana");
  if (p.startsWith("american sportswear")) return pick("active_wear");
  if (p.startsWith("latin fitness")) return pick("active_shoes");
  if (p.startsWith("jcbbrands")) return pick("joystep");
  if (p.startsWith("american fashion wear")) {
    return pick(esDescripcionFootwear(descripcion) ? "fashion_shoes" : "fashion_wear");
  }
  return null;
}

/* ============ CATÁLOGO DE MARCAS DE TIENDA (para FormulasConfig) ============ */
// Mismas marcas CK/TH/KL del Depurador + las marcas propias de la tienda
// (Reebok convertido y Joybees). Las fórmulas de tienda viven en tablas aparte
// (tienda_marca_formulas / tienda_rubro_formulas) porque el markup es distinto.
export const TIENDA_MARCA_CATALOGO: MarcaCatalogo[] = [
  ...MARCA_CATALOGO,
  { marca: "RBK FOOTWEAR", empresa: "Active Shoes" },
  { marca: "RBK APPAREL", empresa: "Active Shoes" },
  { marca: "RBK HARDWARE", empresa: "Active Shoes" },
  { marca: "JOYBEES", empresa: "Joystep" },
];

/* ============ DERIVACIÓN DE MARCA (formatos B/C sin columna MARCA) ============ */
// Prefijo de marcas candidatas según la empresa del grupo detectada.
// (Exportada: la alarma de aprobación la usa para el dropdown de marca cuando
// una descripción bloqueada no trae marca exacta.)
export function marcasCandidatasDeEmpresa(empresaKey: string): string[] {
  const marcas = MARCA_CATALOGO.map((c) => c.marca);
  switch (empresaKey) {
    case "vistana": return marcas.filter((m) => m.toUpperCase().startsWith("CK"));
    case "fashion_shoes": return marcas.filter((m) => m.toUpperCase() === "TH FOOTWEAR");
    case "fashion_wear": return marcas.filter((m) => m.toUpperCase().startsWith("TH") && m.toUpperCase() !== "TH FOOTWEAR");
    case "active_wear": return marcas.filter((m) => m.toUpperCase().startsWith("KL"));
    default: return [];
  }
}

/** Marcas del catálogo (de la empresa detectada) cuyo catálogo contiene la
 *  descripción normalizada. 1 = inequívoca · >1 = ambigua (dropdown) · 0 = nueva. */
export function marcasQueContienen(catalogo: CatalogoDescripciones, empresaKey: string, descNorm: string): string[] {
  return marcasCandidatasDeEmpresa(empresaKey).filter((m) =>
    esDescripcionCatalogada(catalogo, m, descNorm)
  );
}

/* ============ REEBOK / JOYBEES ============ */
// Reebok (proveedor LATIN FITNESS GROUP → Active Shoes). La factura .xls trae
// MARCA=FOOTWEAR/APPAREL/HARDWARE (o "REEBOK" a secas), RUBRO=SHOES/APPAREL/
// SOCKS/BAGS/HEADWEAR/T-SHIRT…, SUB RUBRO=MALE/FEMALE/UNISEX/KIDS. Conversión:
//   Marca    = RBK FOOTWEAR | RBK APPAREL | RBK HARDWARE
//   Rubro    = género (MALE→Men, FEMALE→Women, UNISEX/ADULT→Unisex, KIDS→Kids)
//   Subrubro = la columna RUBRO de la factura (Shoes / Apparel / Socks / Bags…)
//   Descripción = el modelo tal cual ("REEBOK RELORA"), NO formato Genero-Tipo.
const RBK_HARDWARE_KW = ["SOCK", "BAG", "BACKPACK", "HEADWEAR", "CAP", "HAT", "GORRA", "MEDIA", "BOLSO", "MOCHILA"];

function marcaReebok(marcaFactura: Cell, rubroFactura: Cell, desc: Cell): string {
  const m = norm(marcaFactura);
  if (m.includes("FOOTWEAR")) return "RBK FOOTWEAR";
  if (m.includes("APPAREL")) return "RBK APPAREL";
  if (m.includes("HARDWARE")) return "RBK HARDWARE";
  // "REEBOK" a secas o sin columna MARCA (formatos B/C) → derivar de RUBRO/descripción.
  const r = norm(rubroFactura);
  if (r.includes("SHOE") || r.includes("FOOTWEAR")) return "RBK FOOTWEAR";
  if (RBK_HARDWARE_KW.some((w) => r.includes(w))) return "RBK HARDWARE";
  if (r) return "RBK APPAREL";
  const d = norm(desc);
  if (esDescripcionFootwear(d)) return "RBK FOOTWEAR";
  if (RBK_HARDWARE_KW.some((w) => d.includes(w))) return "RBK HARDWARE";
  return "RBK APPAREL";
}

// Género para Reebok/Joybees: primero el SUB RUBRO de la factura; si no viene,
// keywords de la descripción (P/DAMA→Women, P/NINO→Kids…); si no, "" (el caller
// pone Unisex y marca la fila en ámbar para revisión).
const GENERO_MAP: Record<string, string> = {
  MALE: "Men", MEN: "Men", HOMBRE: "Men", CABALLERO: "Men",
  FEMALE: "Women", WOMEN: "Women", DAMA: "Women", MUJER: "Women",
  UNISEX: "Unisex", ADULT: "Unisex", ADULTO: "Unisex",
  KIDS: "Kids", KID: "Kids", NINO: "Kids", "NIÑO": "Kids", NINA: "Kids", "NIÑA": "Kids", INFANTIL: "Kids",
  BOYS: "Boys", GIRLS: "Girls",
};

function generoDe(subRubroFactura: Cell, desc: Cell): string {
  const s = norm(subRubroFactura);
  if (s && GENERO_MAP[s]) return GENERO_MAP[s];
  const d = ` ${norm(desc)} `;
  if (/\bP\/?\s?DAMA\b|\bDAMA\b|\bWOMEN\b|\bMUJER\b|\bFEMALE\b/.test(d)) return "Women";
  if (/\bP\/?\s?NIN[OA]\b|\bNIN[OA]\b|\bKIDS?\b|\bINFANTIL\b/.test(d.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return "Kids";
  if (/\bP\/?\s?HOMBRE\b|\bHOMBRE\b|\bCABALLERO\b|\bMEN\b|\bMALE\b/.test(d)) return "Men";
  if (/\bUNISEX\b/.test(d)) return "Unisex";
  return "";
}

// Subrubro Reebok cuando el formato B/C no trae la columna RUBRO.
function subrubroReebokDe(marca: string, desc: Cell): string {
  if (marca === "RBK FOOTWEAR") return "Shoes";
  const d = norm(desc);
  if (d.includes("SOCK") || d.includes("MEDIA")) return "Socks";
  if (d.includes("BAG") || d.includes("BACKPACK") || d.includes("BOLSO") || d.includes("MOCHILA")) return "Bags";
  if (d.includes("CAP") || d.includes("HAT") || d.includes("GORRA")) return "Headwear";
  return "Apparel";
}

/* ============ CSV (formato B: ';', UTF-8 BOM, CRLF) ============ */
/** Parser CSV con delimitador ';' que respeta comillas dobles y "" escapadas. */
export function parseCsvSemicolon(text: string): SheetRow[] {
  const src = text.replace(/^﻿/, ""); // BOM
  const rows: SheetRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      pushField();
    } else if (c === "\n") {
      pushField(); pushRow();
    } else if (c === "\r") {
      // CRLF: se consume en el \n
    } else {
      field += c;
    }
  }
  pushField(); pushRow();
  return rows;
}

/* ============ DETECCIÓN DE FORMATO / HEADERS ============ */
export type FormatoFactura = "A" | "BC";

export interface FacturaDetect { formato: FormatoFactura; headerRow: number }

const H = (row: SheetRow | undefined): string[] => (row || []).map((c) => norm(c));

/** Busca la fila de encabezados en las primeras 10 filas. Formato A = CODIGO +
 *  CODIGO BARRA + PROVEEDOR + DESCRIPCION. Formato B/C = CODIGO ARTICULO +
 *  NOMBRE ARTICULO + PROVEEDOR. null = no es una factura reconocible. */
export function detectFactura(rows: SheetRow[]): FacturaDetect | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const h = H(rows[i]);
    if (h.includes("CODIGO ARTICULO") && h.includes("NOMBRE ARTICULO") && h.includes("PROVEEDOR")) {
      return { formato: "BC", headerRow: i };
    }
    if (h.includes("CODIGO") && h.includes("CODIGO BARRA") && h.includes("PROVEEDOR") && h.includes("DESCRIPCION")) {
      return { formato: "A", headerRow: i };
    }
  }
  return null;
}

/** "N. Interno: 11-000002966" de la fila 1 del formato A (informativo). */
export function nInternoDe(rows: SheetRow[]): string {
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    for (const c of rows[i] || []) {
      const m = String(c ?? "").match(/N\.?\s*Interno:?\s*([0-9-]+)/i);
      if (m) return m[1];
    }
  }
  return "";
}

/* ============ FECHA → TEMPORADA (AAAA-MM) ============ */
/** FECHA de la factura → AAAA-MM. Acepta DD-MM-AAAA, DD/MM/AAAA, AAAA-MM-DD y
 *  serial de Excel. "" si no se puede (nunca formato sucio). */
export function temporadaDeFecha(raw: Cell): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number" && raw >= 40000 && raw <= 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); // DD-MM-AAAA (Switch exporta día primero)
  if (m) {
    const mes = parseInt(m[2], 10);
    if (mes >= 1 && mes <= 12) return `${m[3]}-${String(mes).padStart(2, "0")}`;
    return "";
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})/); // AAAA-MM(-DD)
  if (m) {
    const mes = parseInt(m[2], 10);
    if (mes >= 1 && mes <= 12) return `${m[1]}-${String(mes).padStart(2, "0")}`;
  }
  return "";
}

/* ============ CÓDIGO DE BARRA ============ */
// El CSV puede traer el código de barra en notación científica ("8.72065E+12"):
// Excel lo truncó y los dígitos finales se PERDIERON — no se puede reconstruir.
// Recuperación: REFERENCIA o CODIGO si son numéricos largos (8+ dígitos); si no,
// se usa el código del producto y la fila queda marcada para revisión.
// NUNCA se inventan códigos.
interface BarcodeResult { value: string; revisar: string | null }

function resolveBarcode(rawBarcode: Cell, referencia: string, codigo: string): BarcodeResult {
  const b = typeof rawBarcode === "number"
    ? (Number.isInteger(rawBarcode) ? String(rawBarcode) : String(rawBarcode))
    : String(rawBarcode ?? "").trim();
  const esCientifico = /e[+-]?\d/i.test(b) || /^\d+\.\d+$/.test(b);
  if (b && !esCientifico) return { value: b, revisar: null }; // tal cual, nunca modificar
  const candidatos = [referencia, codigo].map((c) => String(c ?? "").trim());
  for (const c of candidatos) {
    if (/^\d{8,14}$/.test(c)) return { value: c, revisar: null }; // recuperado de REFERENCIA/CODIGO
  }
  if (!b) return { value: codigo, revisar: "Sin código de barra (se usó el código del producto)" };
  return { value: codigo, revisar: `Código de barra ilegible ("${b}") — revisar en Switch` };
}

/* ============ PROCESAMIENTO ============ */
export interface FacturaRow {
  /** Valores de las 24 columnas de salida (OUT_COLS_SHOES). "Precio *" queda
   *  null — lo calcula el cliente con las fórmulas de tienda. */
  cols: Record<string, string | number | null>;
  /** Marcas candidatas cuando la descripción matchea varias (formatos B/C).
   *  El cliente muestra un dropdown; cols["Marca *"] trae la primera. */
  marcaCandidatas: string[];
  /** Motivo de revisión (fila en ámbar). null = fila limpia. */
  revisar: string | null;
  /** Empresa del grupo detectada (key de EMPRESAS_TIENDA) o null. */
  empresaKey: string | null;
}

export interface FacturaProcessResult {
  rows: FacturaRow[];
  warnings: string[];
  formato: FormatoFactura;
  nInterno: string;
  /** true si el archivo NO trae FECHA (formato A) → la temporada sale del
   *  mes/año que ingresa la secretaria. */
  sinFecha: boolean;
  /** Descripciones que BLOQUEAN la descarga: no están en el catálogo de
   *  descripciones bajo una marca conocida (hay que aprobarlas al catálogo).
   *  `empresaKey` viene cuando la marca no es exacta (formatos B/C con
   *  candidatas 0): la aprobación debe elegir una marca de esa empresa. */
  bloqueos: { marca: string; desc: string; empresaKey?: string }[];
}

export interface FacturaConfig {
  /** Temporada AAAA-MM a usar cuando la factura no trae FECHA (formato A). */
  temporadaFallback: string;
  /** Catálogo de descripciones por marca (tabla depurador_descripciones). */
  catalogo: CatalogoDescripciones;
}

function numDe(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

const findIdx = (headers: string[], ...names: string[]): number => {
  for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; }
  return -1;
};

/** Colapsa espacios múltiples y trim (el CSV trae " Multi  Fashion " sucio). */
const clean = (v: Cell): string => String(v ?? "").replace(/\s+/g, " ").trim();

export function processFactura(rows: SheetRow[], cfg: FacturaConfig): FacturaProcessResult {
  const det = detectFactura(rows);
  if (!det) {
    throw new Error("No reconozco este archivo como una factura de Switch. Espero el .xls de la factura, o el CSV/XLSX exportado con FECHA + CODIGO ARTICULO + PROVEEDOR.");
  }
  const { formato, headerRow } = det;
  const headers = H(rows[headerRow]);

  const col = formato === "A"
    ? {
        codigo: findIdx(headers, "CODIGO"),
        barra: findIdx(headers, "CODIGO BARRA"),
        ref: findIdx(headers, "REFERENCIA"),
        desc: findIdx(headers, "DESCRIPCION"),
        marca: findIdx(headers, "MARCA"),
        rubro: findIdx(headers, "RUBRO"),
        subrubro: findIdx(headers, "SUB RUBRO"),
        unidad: findIdx(headers, "UNIDAD DE MEDIDA"),
        prov: findIdx(headers, "PROVEEDOR"),
        cant: findIdx(headers, "CANTIDAD"),
        precio: findIdx(headers, "PRECIO"),
        fecha: -1,
        impuesto: -1,
      }
    : {
        codigo: findIdx(headers, "CODIGO ARTICULO"),
        barra: findIdx(headers, "CODIGO DE BARRA"),
        ref: findIdx(headers, "REFERENCIA"),
        desc: findIdx(headers, "NOMBRE ARTICULO"),
        marca: -1,
        rubro: -1,
        subrubro: -1,
        unidad: -1,
        prov: findIdx(headers, "PROVEEDOR"),
        cant: findIdx(headers, "CANTIDAD"),
        precio: findIdx(headers, "PRECIO"),
        fecha: findIdx(headers, "FECHA"),
        impuesto: findIdx(headers, "% IMPUESTO"),
      };

  const faltan: string[] = [];
  if (col.codigo === -1) faltan.push(formato === "A" ? "CODIGO" : "CODIGO ARTICULO");
  if (col.desc === -1) faltan.push(formato === "A" ? "DESCRIPCION" : "NOMBRE ARTICULO");
  if (col.prov === -1) faltan.push("PROVEEDOR");
  if (col.cant === -1) faltan.push("CANTIDAD");
  if (col.precio === -1) faltan.push("PRECIO");
  if (faltan.length) {
    throw new Error("Faltan columnas en la factura: " + faltan.join(", ") + ".");
  }

  const warnings: string[] = [];
  const bloqueosSet = new Map<string, { marca: string; desc: string; empresaKey?: string }>();
  const nInterno = formato === "A" ? nInternoDe(rows) : "";

  // Agrupar por CODIGO (misma pieza en varias líneas/facturas → suma cantidades).
  interface Grupo { row: SheetRow; cantidad: number }
  const grupos = new Map<string, Grupo>();
  const orden: string[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const codigo = clean(row[col.codigo]);
    if (!codigo) continue;
    const cant = numDe(row[col.cant]) ?? 0;
    const g = grupos.get(codigo);
    if (g) g.cantidad += cant;
    else { grupos.set(codigo, { row, cantidad: cant }); orden.push(codigo); }
  }
  if (orden.length === 0) throw new Error("No se encontraron líneas de productos en la factura.");

  const out: FacturaRow[] = [];
  for (const codigo of orden) {
    const { row, cantidad } = grupos.get(codigo)!;
    const descRaw = clean(row[col.desc]);
    const proveedorRaw = row[col.prov];
    const referencia = col.ref !== -1 ? clean(row[col.ref]) : "";
    const costo = numDe(row[col.precio]); // PRECIO factura = lo que la empresa cobra a la tienda
    const empresa = matchEmpresaTienda(proveedorRaw, descRaw);

    let revisar: string | null = null;
    if (!empresa) {
      revisar = `Proveedor desconocido: "${clean(proveedorRaw)}"`;
      warnings.push(`${codigo}: proveedor no reconocido ("${clean(proveedorRaw)}") — revisa la fila`);
    }

    // Código de barra (notación científica → recuperar o marcar).
    const bc = resolveBarcode(row[col.barra], referencia, codigo);
    if (bc.revisar) { revisar = revisar ?? bc.revisar; warnings.push(`${codigo}: ${bc.revisar}`); }

    // Temporada: FECHA de la factura (B/C) o el mes/año de la secretaria (A).
    const temporada = col.fecha !== -1
      ? (temporadaDeFecha(row[col.fecha]) || cfg.temporadaFallback)
      : cfg.temporadaFallback;

    // Tasa: % IMPUESTO de la factura si viene; si no, 7.00.
    const tasaNum = col.impuesto !== -1 ? numDe(row[col.impuesto]) : null;
    const tasa = (tasaNum ?? 7).toFixed(2);

    // Unidad de medida: la de la factura (PIEZA / PAR); default PIEZA.
    const unidad = col.unidad !== -1 && clean(row[col.unidad]) ? clean(row[col.unidad]).toUpperCase() : "PIEZA";

    let descOut: string;
    let rubro: string;
    let sub: string;
    let marca: string;
    let marcaCandidatas: string[] = [];
    let tipoArt = "01";
    let costoOut: number | null = costo;
    let stock: number = cantidad;

    const servicio = detectServicio(descRaw);
    const esReebok = empresa?.key === "active_shoes";
    const esJoybees = empresa?.key === "joystep";

    if (servicio) {
      // Servicios (AJUSTE DE PRECIO, MERCANCIA DEFECTUOSA, RETENCION, LIMPIEZA
      // DE SALDO): tipo 02, sin stock, costo 0, marca/rubro Otros.
      descOut = servicio;
      marca = "Otros";
      rubro = "Otros"; sub = "";
      tipoArt = "02";
      stock = 0;
      costoOut = 0;
    } else if (esReebok) {
      descOut = descRaw; // modelo tal cual ("REEBOK RELORA"), NO Genero-Tipo
      marca = marcaReebok(col.marca !== -1 ? row[col.marca] : "", col.rubro !== -1 ? row[col.rubro] : "", descRaw);
      const gen = generoDe(col.subrubro !== -1 ? row[col.subrubro] : "", descRaw);
      rubro = gen || "Unisex";
      if (!gen) revisar = revisar ?? "Género no identificado — quedó Unisex, revisa";
      sub = col.rubro !== -1 && clean(row[col.rubro])
        ? titleCase(clean(row[col.rubro]).toLowerCase())
        : subrubroReebokDe(marca, descRaw);
    } else if (esJoybees) {
      descOut = descRaw; // modelo tal cual
      marca = "JOYBEES";
      const gen = generoDe(col.subrubro !== -1 ? row[col.subrubro] : "", descRaw);
      rubro = gen || "Unisex";
      if (!gen) revisar = revisar ?? "Género no identificado — quedó Unisex, revisa";
      sub = "Flip Flops";
    } else {
      // CK / TH / KL: misma normalización del Depurador.
      descOut = normalizeDescripcion(descRaw);
      rubro = buildRubro(descOut);
      sub = buildSubrubro(descOut);
      if (!esGenero(rubro)) {
        rubro = "Otros"; sub = ""; marca = "Otros";
      } else if (col.marca !== -1) {
        // Formato A: la factura trae MARCA → reclasificar como el Depurador.
        marca = reclassMarca(row[col.marca], descOut);
      } else if (empresa) {
        // Formatos B/C: derivar del catálogo (empresa → marcas candidatas).
        const candidatas = marcasQueContienen(cfg.catalogo, empresa.key, descOut);
        if (candidatas.length === 1) {
          marca = candidatas[0];
        } else if (candidatas.length > 1) {
          marca = candidatas[0];
          marcaCandidatas = candidatas;
          revisar = revisar ?? `Marca ambigua (${candidatas.join(" / ")}) — elige en el dropdown`;
        } else {
          // Descripción nueva: no está en el catálogo de ninguna marca de la
          // empresa → BLOQUEA la descarga hasta que Daniel la apruebe.
          marca = "Otros";
          const marcaLabel = `${empresa.label} (sin marca exacta)`;
          bloqueosSet.set(`${marcaLabel}|||${marcaKey(descOut)}`, { marca: marcaLabel, desc: descOut, empresaKey: empresa.key });
        }
      } else {
        marca = "Otros";
      }
    }

    // Alarma bloqueante (igual que el Depurador): descripción bajo una marca
    // catalogada que NO está en su catálogo. "Otros" y RBK/JOYBEES no bloquean.
    if (!servicio && !esReebok && !esJoybees && marca !== "Otros" && marcaCandidatas.length === 0) {
      const canon = canonicalMarca(marca);
      if (
        descripcionesDeMarca(cfg.catalogo, canon).length > 0 &&
        !esDescripcionCatalogada(cfg.catalogo, canon, descOut)
      ) {
        bloqueosSet.set(`${canon}|||${marcaKey(descOut)}`, { marca: canon, desc: descOut });
      }
    }

    // Switch no acepta "/" en rubro y subrubro (la descripción NO se toca).
    rubro = rubro.replace(/\//g, "-");
    sub = sub.replace(/\//g, "-");

    // Marca en MAYÚSCULAS en la plantilla ("TH MENSWEAR", "CK UNDERWEAR").
    // "Otros" se queda tal cual (convención del Depurador).
    const marcaOut = marca === "Otros" ? "Otros" : marca.toUpperCase();

    if (costo === null && !servicio) warnings.push(`${codigo}: sin precio en la factura (Costo quedó vacío)`);

    out.push({
      cols: {
        "Código *": codigo,
        "Referencia *": referencia || codigo,
        "Código Barra *": bc.value,
        "Descripción *": descOut,
        "Precio *": null, // lo calcula el cliente con las fórmulas de TIENDA
        "Tasa de Impuesto *": tasa,
        "Costo *": costoOut,
        "rubro *": rubro,
        "subrubro": sub,
        "Marca *": marcaOut,
        "Proveedor *": empresa ? empresa.proveedorTienda : clean(proveedorRaw),
        "Mínimo Stock": "",
        "Código Tipo de Artículo *": tipoArt,
        "Unidad de medida *": unidad,
        "Origen": "",
        "Lote": "",
        "Serie": "",
        "Stock Ideal": stock,
        "Temporada": temporada,
        "Composición": "", // SIEMPRE vacía
        "Codigo CPBS": "",
        "Codigo CPBS Abrev": "",
        "Bonificación": "",
        "Cantidad por caja": "",
      },
      marcaCandidatas,
      revisar,
      empresaKey: empresa?.key ?? null,
    });
  }

  return {
    rows: out,
    warnings,
    formato,
    nInterno,
    sinFecha: formato === "A",
    bloqueos: [...bloqueosSet.values()],
  };
}

/** Cambia la marca de una fila (dropdown de candidatas) — inmutable. */
export function setRowMarca(row: FacturaRow, marca: string): FacturaRow {
  return { ...row, cols: { ...row.cols, "Marca *": marca === "Otros" ? marca : marca.toUpperCase() } };
}

/* ============ SALIDA ============ */
/** AOA de la plantilla (24 cols OUT_COLS_SHOES). SIN Title Case: el proveedor
 *  tienda y la marca van EXACTOS (razón social / mayúsculas). */
export function buildTiendaAoa(rows: FacturaRow[]): (string | number)[][] {
  const aoa: (string | number)[][] = [OUT_COLS_SHOES.slice()];
  for (const r of rows) {
    aoa.push(OUT_COLS_SHOES.map((c) => {
      const v = r.cols[c];
      return v === null || v === undefined ? "" : (v as string | number);
    }));
  }
  return aoa;
}

/** Switch no acepta más de 500 filas por archivo → partir la salida. */
export const MAX_FILAS_SWITCH = 500;

export function chunkRows<T>(rows: T[], size: number = MAX_FILAS_SWITCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
