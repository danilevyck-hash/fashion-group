// Flujo Reebok → Active Shoes · lógica pura (sin DOM, sin xlsx).
//
// 🔴 DOS ENTRADAS, UN SOLO FLUJO (17-sep-2026). Este archivo lee la CONFIRMACIÓN
// de compra (lo que va a llegar) y arma las dos salidas. El Excel de DESPACHO
// (lo que de verdad llegó, con el costo real, el código de barras y la cantidad
// recibida) lo lee `reebok-despacho.ts`, que produce los MISMOS `ReebokItem` y
// entra por acá sin un segundo camino. La confirmación NO se retiró: es lo que
// se usa para cotizar antes de que la mercancía exista.
//
// SEPARADO del Depurador CK/TH: Reebok usa otro formato de Excel del proveedor
// (Book4: headers en la 2.ª fila, columnas New Article / SKU / RRP / WholesalePrice
// y una columna de mes con piezas por SKU) y otra lógica de precio. NO pasa por
// processRows() del Depurador. Reusa el orden de columnas Switch (OUT_COLS, las
// 25 de la plantilla real), TEXT_COLS y el patrón xlsx-js-style del cliente. Dos salidas:
//   A) Catálogo para clientes (una fila por PO NAME + New Article).
//   B) Plantilla Switch (una fila por ARTÍCULO, 25 cols FOB+CIF, la misma de todo el sistema).

import { OUT_COLS, TEXT_COLS, ceilPar, precioDescripcion, marcaKey, tasaSwitch } from "./logic";
import type { Cell, SheetRow, Redondeo, MarcaRubroFormula } from "./logic";
import { COL_FOTO, TEXTO_SIN_FOTO } from "./fotos-excel";
import { normalizarFlete } from "./flete";
import { factorDeDescuento, normalizarDescuento } from "./descuento-proveedor";
// 🔴 La lista de CATEGORY se DERIVA del mapa del catálogo: UNA sola fuente.
// Ver `REEBOK_CATEGORY_ESPERADAS`, más abajo.
import { rubrosQueElCatalogoConoce } from "@/lib/reebok-clasificacion";

export { OUT_COLS, TEXT_COLS, ceilPar };

/* ============ CONSTANTES ============ */
export const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";

// Reebok entra al sistema de fórmulas por marca (FormulasConfig) como DOS marcas
// editables: "Reebok Precio A" y "Reebok Precio B". Defaults equivalentes al cálculo
// histórico (÷0.75 / ÷0.80, redondeo al par hacia arriba), pero editables.
export const REEBOK_MARCA_A = "Reebok Precio A";
export const REEBOK_MARCA_B = "Reebok Precio B";
export const REEBOK_EMPRESA = "Active Shoes";
/** La `empresa_key` de Reebok. Es CONSTANTE del servidor de este flujo, nunca
 *  se elige: el Excel de Reebok solo sube a Active Shoes. La usa la línea de
 *  «qué es nuevo en Switch», que acota `switch_articulo_info` por empresa. */
export const REEBOK_EMPRESA_KEY = "active_shoes";

// Marca usada para las EXCEPCIONES por Name (modelo), en la tabla marca_rubro_formulas.
// Jerarquía por Name (igual que CK/TH): precio fijo > fórmula del Name > fórmula de
// marca (A o B). Un override por Name aplica a AMBAS salidas y a Precio A y B.
export const REEBOK_MARCA_EXC = "Reebok";

/** Excepción (fórmula/precio-fijo) del Name, o null. `excByName` va keyed por marcaKey(Name). */
export function excForName(excByName: Map<string, MarcaRubroFormula> | undefined, name: string): MarcaRubroFormula | null {
  return excByName?.get(marcaKey(name)) ?? null;
}

export interface PriceFormula { divisor: number; extra: number; redondeo: Redondeo }
export const REEBOK_FORMULA_A_DEFAULT: PriceFormula = { divisor: 0.75, extra: 0, redondeo: "par" };
export const REEBOK_FORMULA_B_DEFAULT: PriceFormula = { divisor: 0.8, extra: 0, redondeo: "par" };

// Meses en español para autodetectar la columna de piezas del mes (JULIO, AGOSTO…).
export const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/* ============ UTILES ============ */
const normH = (s: Cell): string => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
const round2 = (x: number): number => Math.round(x * 100) / 100;

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

const esFootwear = (dept: Cell): boolean => normH(dept).includes("FOOTWEAR");
const unidadPara = (dept: Cell): string => (esFootwear(dept) ? "PAR" : "PIEZA");

/** Costo FOB de Salida B. TRES reglas, en este orden (ver `descuento-proveedor.ts`):
 *  1. «WholesalePrice OFF» si viene con valor → el dato REAL gana siempre. Es el
 *     camino del DESPACHO (`Precio after Disc`), que no se toca.
 *  2. El descuento que Daniel escribió en pantalla, uno solo para todo el archivo.
 *  3. Sin nada de lo anterior, el ESTIMADO de siempre: footwear → ×0.8;
 *     apparel/hardware → ×0.7. La pantalla lo dice en ámbar. */
export function fobReebok(
  dept: Cell, wholesale: number, off: number | null, descuento?: unknown,
): number {
  if (off !== null && off > 0) return off;
  return wholesale * factorDeDescuento(normalizarDescuento(descuento), esFootwear(dept));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL COSTO DE UN ARTÍCULO DE REEBOK SE DECIDE ACÁ, Y EN NINGÚN OTRO LADO.
 *
 * Daniel, textual (14-sep-2026): «que el pedido use el mismo costo que Switch.
 * Un solo costo por producto».
 *
 * 🩸 Hasta hoy eran DOS cuentas distintas para el mismo artículo. La plantilla
 * de Switch usaba `fobReebok` —0.80 en footwear, 0.70 en ropa y accesorios, y el
 * «WholesalePrice OFF» del proveedor cuando viene con valor— y el pedido para
 * cliente tenía su propio `× 0.80` escrito a mano, que ignoraba las dos reglas.
 * Resultado medido sobre el archivo real de septiembre: de 526 artículos, **207
 * salían con un costo en la plantilla y otro en el pedido** — el mismo producto
 * valiendo dos cosas según qué archivo se bajara. Y como el pedido es el que ve
 * el cliente, la ropa se estaba cotizando sobre un costo MÁS ALTO que el real,
 * y unos pocos zapatos un centavo por debajo.
 *
 * 🔑 NO SE COPIA LA REGLA: SE LLAMA. Duplicarla es cómo nacieron los dos costos.
 * El día que cambie el 0.70, el 0.80 o el trato del descuento, cambia una sola
 * línea y las dos salidas se mueven juntas.
 *
 * ⚠️ El redondeo también vive acá y es el de la plantilla: se redondea el FOB a
 * centavos y RECIÉN AHÍ se le aplica el flete. Redondear una sola vez al final
 * daba un centavo distinto en 66 artículos del archivo de septiembre.
 *
 * 🔴 EL DESCUENTO (18-sep-2026). `descuentoCrudo` es el porcentaje que Daniel
 * escribe en pantalla para TODO el archivo de la preforma. No es una cuarta
 * regla: entra por `fobReebok`, detrás del «WholesalePrice OFF», que sigue
 * ganando siempre. Por eso el camino del DESPACHO —donde ese campo viene con el
 * `Precio after Disc`— no se mueve ni un centavo. Ver `descuento-proveedor.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

/** Costo FOB y CIF de UN artículo. `null` si el proveedor no mandó WholesalePrice.
 *  Es la ÚNICA fuente de costo de las dos salidas (plantilla Switch y pedido). */
export function costoReebok(
  dept: Cell, wholesale: number | null, off: number | null, fleteCrudo: unknown,
  descuentoCrudo?: unknown,
): { fob: number | null; cif: number | null } {
  if (wholesale === null) return { fob: null, cif: null };
  const flete = normalizarFlete(fleteCrudo);
  const fob = round2(fobReebok(dept, wholesale, off, descuentoCrudo));
  return { fob, cif: round2(fob * flete) };
}

/* ============ DETECCIÓN DE HOJA / HEADERS ============ */
export interface ReebokCols {
  po: number; newArticle: number; sku: number; name: number; department: number;
  category: number; ageGroup: number; colorName: number; gender: number;
  sellIn: number; rrp: number; wholesale: number; wholesaleOff: number; talla: number;
}

const findCol = (headers: Cell[], names: string[]): number => {
  const H = headers.map(normH);
  for (const n of names) { const i = H.indexOf(normH(n)); if (i !== -1) return i; }
  return -1;
};

/** Fila de headers = la que contiene New Article + SKU + WholesalePrice (el Book4
 *  trae una fila de basura arriba con totales precalculados). */
export function findHeaderRow(rows: SheetRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const H = (rows[i] || []).map(normH);
    if (H.includes("NEW ARTICLE") && H.includes("SKU") && H.includes("WHOLESALEPRICE")) return i;
  }
  return -1;
}

export function findReebokCols(headers: Cell[]): ReebokCols {
  return {
    po: findCol(headers, ["PO NAME"]),
    newArticle: findCol(headers, ["New Article"]),
    sku: findCol(headers, ["SKU"]),
    name: findCol(headers, ["Name"]),
    department: findCol(headers, ["Department"]),
    category: findCol(headers, ["CATEGORY"]),
    ageGroup: findCol(headers, ["AGE GROUP"]),
    colorName: findCol(headers, ["COLOR NAME"]),
    gender: findCol(headers, ["GENDER"]),
    sellIn: findCol(headers, ["SELL-IN QUARTER"]),
    rrp: findCol(headers, ["RRP"]),
    wholesale: findCol(headers, ["WholesalePrice"]),
    wholesaleOff: findCol(headers, ["WholesalePrice OFF", "WholesalePriceOFF", "WHOLESALE OFF"]),
    talla: findCol(headers, ["Talla", "SIZE"]),
  };
}

/** Columnas candidatas a "piezas del mes" (para el dropdown). Marca cuál es un mes. */
export interface MonthOption { idx: number; label: string; isMonth: boolean }
export function monthOptions(headers: Cell[]): MonthOption[] {
  return headers
    .map((h, idx) => ({ idx, label: String(h ?? "").trim(), isMonth: MESES_ES.includes(normH(h)) }))
    .filter((o) => o.label !== "");
}

/** Autodetecta la columna de mes (primer header que sea un mes en español). -1 si ninguno. */
export function detectMonthCol(headers: Cell[]): number {
  for (let i = 0; i < headers.length; i++) if (MESES_ES.includes(normH(headers[i]))) return i;
  return -1;
}

/* ============ PARSEO ============ */
export interface ReebokItem {
  po: string; newArticle: string; sku: string; name: string; department: string;
  category: string; ageGroup: string; colorName: string; gender: string;
  sellIn: string; wholesale: number | null; wholesaleOff: number | null;
  talla: string; piezas: number;
  /* ── Lo que solo trae el Excel de DESPACHO (17-sep-2026) ──────────────────
   * Los dos son OPCIONALES a propósito: la CONFIRMACIÓN de compra no los trae
   * y tiene que seguir saliendo exactamente igual que siempre. Sin ellos, cada
   * columna cae en su valor de siempre — el SKU como código de barra y la
   * «Composición» vacía. Ver `reebok-despacho.ts`. */
  /** 🔴 El código de barras DE VERDAD (el `UPC` de Reebok, o el `EAN`). El
   *  `SKU` que se escribía hasta hoy (`RBKAPPTR1200M`) no se puede pistolear. */
  codigoBarra?: string;
  /** La composición de la prenda («UPPER: 99% TEXTILE…»), tal cual la manda
   *  Reebok. Solo viene en el despacho de calzado. */
  composicion?: string;
  /** 🔑 El número de factura del proveedor («Document Number» del despacho).
   *  NO entra a ninguna de las 25 columnas: es para que la fila de totales
   *  diga contra qué facturas se cuadra el costo. La confirmación de compra no
   *  lo trae y entonces no se dice nada — no se inventa. */
  documento?: string;
}

export interface ParseResult { items: ReebokItem[]; headerRow: number; cols: ReebokCols; warnings: string[] }

/* ============ LOS VALORES QUE SE ESPERAN EN CATEGORY Y GENDER ============ */
// 🩸 ESTAS DOS COLUMNAS SON LAS QUE CLASIFICAN EL CATÁLOGO, Y EL DEPURADOR LAS
// TRATABA COMO OPCIONALES (arreglado el 2-sep-2026).
//
// El Depurador escribe HACIA Switch: `CATEGORY` sale como `rubro *` y `GENDER`
// como `subrubro` (ver buildSwitchRows). De ahí el catálogo las lee de vuelta y
// arma la categoría y el género de cada producto. O sea que estas dos celdas
// deciden bajo qué filtro se ve el producto y, vía la categoría, **de cuántas
// piezas es el bulto que se le cobra al cliente** (calzado 12, todo lo demás 6).
//
// Y sin embargo solo eran obligatorias `New Article`, `SKU`, `WholesalePrice` y
// `Department`. Si Reebok renombraba la columna en su Excel, `findCol` devolvía
// −1, `val` devolvía `""`, y **el archivo entero subía a Switch con el rubro y
// el subrubro EN BLANCO sin que nada avisara**. El error se descubría meses
// después, del otro lado, con el catálogo mostrando todo en el cajón equivocado.
//
// Dos arreglos, los dos ANTES de subir el archivo — que es cuando corregirlo
// sale barato:
//   1. las dos columnas pasan a OBLIGATORIAS (abajo, en `parseReebok`);
//   2. una lista de valores esperados que avisa en pantalla cuando aparece algo
//      que el catálogo no va a saber traducir.
//
// El patrón #2 ya existía en el MISMO módulo, del lado CK/TH: `esGenero` en
// `logic.ts` valida el rubro contra una lista de géneros conocidos y las marcas
// desconocidas se cuentan y se dicen en pantalla. Esto es lo mismo para Reebok.
//
// 🔴 AVISA, NO CORRIGE. Nada se descarta ni se traduce: el archivo sale igual,
// con el valor que puso el proveedor. Daniel: *«las cosas deben ser sencillas y
// yo ordenarlas como se debe en Switch»*.

/**
 * 🔴 Los DEPARTMENT esperados. **Ésta es la columna que de verdad clasifica.**
 *
 * `Department` sale a Switch como `Marca *` (ver `buildSwitchRows`) y desde el
 * 2-sep-2026 la MARCA es la fuente primaria de la categoría del catálogo:
 * medido sobre los 609 artículos de `active_shoes`, FOOTWEAR↔SHOES 456/456,
 * APPAREL↔APPAREL 10/10, HARDWARE↔BAGS 1/1, cero contradicciones — mientras que
 * el rubro tiene 35 valores y casi todos son basura vieja.
 *
 * Department YA era obligatoria; lo que faltaba era mirar QUÉ dice.
 */
export const REEBOK_DEPARTMENT_ESPERADOS = ["FOOTWEAR", "APPAREL", "HARDWARE"] as const;

/**
 * Los CATEGORY que el catálogo sabe traducir a una categoría (`rubro`), que es
 * el plan B cuando la marca viene vacía.
 *
 * ═══ 🩸 ESTO ERA UNA LISTA ESCRITA A MANO, Y ERA UN ESPEJO ══════════════════
 *
 * Hasta el 17-sep-2026 acá había seis valores tecleados y allá, en
 * `src/lib/reebok-clasificacion.ts`, los mismos seis otra vez. Un candado
 * comparaba las dos listas — que es la confesión de que el espejo estaba mal: el
 * 2-sep-2026 `HEADWEAR` entró en una sola y **cada archivo de Reebok con gorras
 * avisaba «valor inesperado» sobre un dato perfectamente bueno**. Un centinela
 * que se equivoca deja de ser un centinela: se vuelve ruido que se aprende a
 * ignorar.
 *
 * 🔴 **Ya no se escribe: se DERIVA.** La fuente es la tabla
 * `reebok_rubro_categoria` (se administra en Catálogos › Reebok › Categorías del
 * catálogo) y, cuando no está, las seis reglas del código
 * (`CATEGORIA_POR_RUBRO_BASE`). Esta constante es el valor POR DEFECTO —el de la
 * red— para quien llame a `valoresInesperados` sin pasarle nada; la pantalla de
 * Plantilla Switch le pasa lo que trae la tabla.
 */
export const REEBOK_CATEGORY_ESPERADAS: readonly string[] = rubrosQueElCatalogoConoce();

/** Los GENDER que el catálogo sabe traducir a un género (`subrubro`). Mismo
 *  espejo y mismo candado. */
export const REEBOK_GENDER_ESPERADOS = ["MALE", "MEN", "FEMALE", "WOMEN", "KIDS", "UNISEX"] as const;

export interface ValorInesperado {
  columna: "CATEGORY" | "GENDER" | "Department";
  valor: string;
  /** Artículos del archivo con ese valor (para ir a buscarlos). */
  articulos: string[];
}

/**
 * Los CATEGORY/GENDER del archivo que el catálogo NO va a saber traducir. PURA.
 *
 * Una celda VACÍA también cuenta: es el caso más peligroso, porque es el que
 * produce una columna renombrada, y en Switch se ve igual que un dato ausente.
 */
export function valoresInesperados(
  items: readonly ReebokItem[],
  /**
   * 🔴 LOS RUBROS QUE EL CATÁLOGO CONOCE HOY. Por defecto, la red del código;
   * la pantalla le pasa los de la tabla `reebok_rubro_categoria`. Así, agregar
   * un rubro desde Catálogos › Reebok apaga este aviso **sin tocar código**, que
   * es exactamente lo que el espejo impedía.
   */
  rubrosConocidos: readonly string[] = REEBOK_CATEGORY_ESPERADAS,
): ValorInesperado[] {
  const esperadas = new Set<string>(rubrosConocidos.map((r) => normH(r)));
  const esperados = new Set<string>(REEBOK_GENDER_ESPERADOS);
  const departamentos = new Set<string>(REEBOK_DEPARTMENT_ESPERADOS);
  const fuera = new Map<string, ValorInesperado>();
  const anotar = (columna: ValorInesperado["columna"], crudo: string, articulo: string) => {
    const valor = normH(crudo) || "(vacío)";
    const k = `${columna}|${valor}`;
    const e = fuera.get(k) ?? { columna, valor, articulos: [] };
    const id = articulo || "(sin código)";
    if (!e.articulos.includes(id)) e.articulos.push(id);
    fuera.set(k, e);
  };
  for (const it of items) {
    const id = it.newArticle || it.sku;
    // Department primero: es la que decide la categoría del catálogo.
    if (!departamentos.has(normH(it.department))) anotar("Department", it.department, id);
    if (!esperadas.has(normH(it.category))) anotar("CATEGORY", it.category, id);
    if (!esperados.has(normH(it.gender))) anotar("GENDER", it.gender, id);
  }
  // Primero lo que más artículos afecta; a igualdad, orden estable por clave.
  return [...fuera.values()].sort(
    (a, b) => b.articulos.length - a.articulos.length ||
      `${a.columna}|${a.valor}`.localeCompare(`${b.columna}|${b.valor}`),
  );
}

/** Parsea el Book4 crudo. `monthColIdx` = columna de piezas (autodetectada o elegida). */
export function parseReebok(rows: SheetRow[], monthColIdx: number): ParseResult {
  const headerRow = findHeaderRow(rows);
  if (headerRow === -1) {
    throw new Error("No encontré la fila de encabezados (busco New Article + SKU + WholesalePrice). ¿Es el Excel de Reebok?");
  }
  const headers = rows[headerRow];
  const cols = findReebokCols(headers);
  const missing: string[] = [];
  if (cols.newArticle === -1) missing.push("New Article");
  if (cols.sku === -1) missing.push("SKU");
  if (cols.wholesale === -1) missing.push("WholesalePrice");
  if (cols.department === -1) missing.push("Department");
  // 🔴 CATEGORY y GENDER son OBLIGATORIAS desde el 2-sep-2026: son el rubro y el
  // subrubro que van a Switch, y de ahí salen la categoría, el género y el
  // BULTO del catálogo. Sin ellas el archivo entraba en blanco y en silencio.
  if (cols.category === -1) missing.push("CATEGORY");
  if (cols.gender === -1) missing.push("GENDER");
  if (missing.length) throw new Error("Faltan columnas en el archivo: " + missing.join(", ") + ".");

  const warnings: string[] = [];
  const items: ReebokItem[] = [];
  const val = (row: SheetRow, i: number): string => (i === -1 ? "" : String(row[i] ?? "").trim());

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
    const newArticle = val(row, cols.newArticle);
    const sku = val(row, cols.sku);
    if (!newArticle && !sku) continue;
    const wholesale = num(row[cols.wholesale]);
    if (wholesale === null) warnings.push(`${newArticle || sku}: sin WholesalePrice`);
    const piezas = monthColIdx === -1 ? 0 : (num(row[monthColIdx]) || 0);
    items.push({
      po: val(row, cols.po),
      newArticle,
      sku,
      name: val(row, cols.name),
      department: val(row, cols.department),
      category: val(row, cols.category),
      ageGroup: val(row, cols.ageGroup),
      colorName: val(row, cols.colorName),
      gender: val(row, cols.gender),
      sellIn: val(row, cols.sellIn),
      wholesale,
      wholesaleOff: cols.wholesaleOff === -1 ? null : num(row[cols.wholesaleOff]),
      talla: val(row, cols.talla),
      piezas,
    });
  }
  if (items.length === 0) throw new Error("No se encontraron filas de productos válidas.");
  return { items, headerRow, cols, warnings };
}

/* ============ ORDEN Y TALLA-MUESTRA ============ */
// Ambas salidas se ordenan por PO NAME → Name → Género.
const cmpPoNameGender = (a: { po: string; name: string; gender: string }, b: { po: string; name: string; gender: string }): number =>
  a.po.localeCompare(b.po, "es") || a.name.localeCompare(b.name, "es") || a.gender.localeCompare(b.gender, "es");

/** true si el artículo es Kids/Unisex para la talla-muestra:
 *  AGE GROUP presente y ≠ Adult, o GENDER = Unisex. */
const esKidsUnisex = (it: Pick<ReebokItem, "ageGroup" | "gender">): boolean => {
  const ag = normH(it.ageGroup);
  return (ag !== "" && ag !== "ADULT") || normH(it.gender) === "UNISEX";
};

/* ── LA REGLA DE TALLA-MUESTRA DE REEBOK, COMO DATO (8-sep-2026) ──────────────
 * Igual que en el Depurador CK/TH: la pestaña «Reglas» dibujaba una tabla
 * TECLEADA A MANO que decía ser el espejo de `pickSample`. Ahora hay UNA sola
 * tabla — `pickSample` decide con `casoTallaReebok` y la pantalla dibuja
 * `CASOS_TALLA_REEBOK`. */

export type CasoTallaReebokId = "calzado-hombre" | "calzado-dama" | "calzado-kids" | "ropa";

export interface CasoTallaReebok {
  id: CasoTallaReebokId;
  /** Cómo se llama el caso en pantalla. */
  caso: string;
  /** Qué talla se elige. */
  talla: string;
}

export const CASOS_TALLA_REEBOK: CasoTallaReebok[] = [
  { id: "calzado-hombre", caso: "Calzado · Male", talla: "9 · si no existe, la numérica más cercana (queda en ámbar)" },
  { id: "calzado-dama", caso: "Calzado · Female", talla: "7 · si no existe, la numérica más cercana (queda en ámbar)" },
  { id: "calzado-kids", caso: "Calzado · Kids / Unisex (AGE GROUP ≠ Adult, GENDER Unisex o sin género)", talla: "la mediana de las tallas disponibles" },
  { id: "ropa", caso: "Ropa y accesorios (Apparel / Hardware)", talla: "M · si no hay M, la talla única (ámbar si hay varias)" },
];

/** La talla numérica que busca cada caso de calzado con género conocido. */
const TALLA_OBJETIVO_REEBOK: Record<"calzado-hombre" | "calzado-dama", number> = {
  "calzado-hombre": 9,
  "calzado-dama": 7,
};

/** Qué caso de CASOS_TALLA_REEBOK le toca a un artículo. Es la MISMA decisión
 *  que toma `pickSample`: no hay una segunda copia de la regla. */
export function casoTallaReebok(it: Pick<ReebokItem, "department" | "ageGroup" | "gender">): CasoTallaReebokId {
  if (!esFootwear(it.department)) return "ropa";
  const g = normH(it.gender);
  if (esKidsUnisex(it) || (g !== "MALE" && g !== "FEMALE")) return "calzado-kids";
  return g === "MALE" ? "calzado-hombre" : "calzado-dama";
}

interface SampleResult {
  sku: string;
  /** 🔴 El código de barra de ESA talla (el UPC del despacho). Vacío cuando el
   *  archivo no lo trae —la confirmación de compra—, y entonces manda el SKU,
   *  que es lo que el sistema escribía hasta el 17-sep-2026. */
  codigoBarra: string;
  talla: string;
  fallback: boolean;
}

/** Elige el código de barra representativo (talla-muestra) de un artículo:
 *  - Footwear Male → 9 · Female → 7 · Kids/Unisex → mediana de las tallas.
 *    Si la talla exacta (9/7) no existe: la numérica más cercana + fallback (ámbar).
 *  - Apparel/Hardware → M; si no hay M → la talla única. */
function pickSample(group: ReebokItem[]): SampleResult {
  const first = group[0];
  // Mapa talla → sku (primera aparición). Tallas numéricas ordenadas para mediana/cercanía.
  const bySize = new Map<string, ReebokItem>();
  for (const it of group) { const t = it.talla.trim(); if (t && !bySize.has(t)) bySize.set(t, it); }
  const nums = [...bySize.keys()]
    .map((t) => ({ t, n: num(t) }))
    .filter((x): x is { t: string; n: number } => x.n !== null)
    .sort((a, b) => a.n - b.n);
  const deTalla = (t: string): ReebokItem => bySize.get(t) ?? first;
  const muestra = (t: string, fallback: boolean): SampleResult => {
    const it = deTalla(t);
    return { sku: it.sku, codigoBarra: (it.codigoBarra ?? "").trim(), talla: t, fallback };
  };
  const fallbackAll = (): SampleResult => {
    const t = [...bySize.keys()][0] ?? first.talla;
    return muestra(t, bySize.size > 1);
  };

  const caso = casoTallaReebok(first);
  if (caso !== "ropa") {
    if (caso === "calzado-kids") {
      if (nums.length === 0) return fallbackAll();
      const mid = nums[Math.floor((nums.length - 1) / 2)]; // mediana (talla real, sin fallback)
      return muestra(mid.t, false);
    }
    const target = TALLA_OBJETIVO_REEBOK[caso];
    if (nums.length === 0) return fallbackAll();
    const exact = nums.find((x) => x.n === target);
    if (exact) return muestra(exact.t, false);
    // Más cercana + fallback ámbar (empate → la menor).
    const nearest = nums.reduce((best, x) =>
      Math.abs(x.n - target) < Math.abs(best.n - target) ? x : best, nums[0]);
    return muestra(nearest.t, true);
  }
  // Apparel / Hardware → M; si no hay M → talla única.
  const m = [...bySize.keys()].find((t) => normH(t) === "M");
  if (m) return muestra(m, false);
  return fallbackAll();
}

/* ============ SALIDA A · CATÁLOGO CLIENTES ============ */
// Una fila por PO NAME + New Article. Costo = el MISMO que la plantilla de Switch
// (`costoReebok`): FOB por `fobReebok` —0.80 footwear · 0.70 el resto · el
// «WholesalePrice OFF» del proveedor cuando viene— y el flete del embarque encima
// (1.10 por defecto, 1.15 si se elige — ver `flete.ts`). 🔴 Un solo costo por producto.
// Precio A/B = fórmulas editables (default ÷0.75 / ÷0.80, redondeo par). Orden PO/Name/Género.

export interface CatalogoRow {
  po: string; newArticle: string; name: string; department: string; category: string;
  ageGroup: string; colorName: string; gender: string;
  wholesale: number | null; costo: number | null; precioA: number | null; precioB: number | null;
  /** 🔑 El FOB del artículo, el MISMO que `costoReebok` le dio a la plantilla de
   *  Switch. Se guarda para que la fila de totales pueda decir FOB y CIF también
   *  cuando lo que se va a bajar es la preforma. ⚠️ NO entra a
   *  `buildCatalogoAoa`: ese Excel enumera sus columnas y no lleva costos (el
   *  cliente ve Precio A y B, nunca el costo). */
  fob: number | null;
  piezas: number;
  /** Cuántas filas del archivo (tallas/SKUs) se agruparon en este artículo. */
  skus: number;
}

export interface CatalogoConfig {
  formulaA: PriceFormula;
  formulaB: PriceFormula;
  /** Excepciones por Name (marcaKey(Name) → excepción). Ganan a la fórmula de marca. */
  excByName?: Map<string, MarcaRubroFormula>;
  /** Flete del embarque: 1.10 o 1.15 (ver `flete.ts`). Sin valor → 1.10, el de
   *  siempre. Es el MISMO flete de la plantilla Switch: un solo embarque. */
  flete?: number;
  /** El descuento del proveedor en %, escrito a mano para TODO el archivo (ver
   *  `descuento-proveedor.ts`). Sin valor → se estima 20 % en calzado y 30 % en
   *  el resto, como siempre. ⚠️ Un artículo cuyo archivo trae el precio ya
   *  descontado NO lo usa: el dato real gana. Es el MISMO descuento de la
   *  plantilla Switch: un solo costo por producto. */
  descuento?: string | number | null;
}

export function buildCatalogo(items: ReebokItem[], cfg: CatalogoConfig): CatalogoRow[] {
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    const key = `${it.po}|||${it.newArticle}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const out: CatalogoRow[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    const w = first.wholesale;
    // 🔴 EL MISMO costo que la plantilla de Switch, de la MISMA función.
    const { fob, cif: costo } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete, cfg.descuento);
    // Jerarquía por Name: precio fijo > fórmula del Name > fórmula de marca (A/B).
    const exc = excForName(cfg.excByName, first.name);
    const precioA = precioDescripcion(costo, exc, cfg.formulaA);
    const precioB = precioDescripcion(costo, exc, cfg.formulaB);
    const piezas = group.reduce((s, it) => s + (it.piezas || 0), 0);
    out.push({
      po: first.po, newArticle: first.newArticle, name: first.name, department: first.department,
      category: first.category, ageGroup: first.ageGroup, colorName: first.colorName, gender: first.gender,
      wholesale: w, costo, fob, precioA, precioB, piezas, skus: group.length,
    });
  }
  out.sort(cmpPoNameGender);
  return out;
}

/** AOA del catálogo de clientes. `monthLabel` rotula la columna de piezas (ej. "JULIO").
 *  NO incluye WholesalePrice, Costo ni COLOR NAME (son internos; el cliente solo ve
 *  Precio A/B y piezas).
 *
 *  `tieneFoto` es OPCIONAL y solo lo manda la pantalla cuando se eligió una carpeta
 *  de fotos: agrega la columna "Foto" ADELANTE (a la izquierda del código, igual que
 *  el Excel que Daniel arma a mano con el macro). La celda va vacía cuando hay foto
 *  —la imagen se pega encima— y dice "NO IMAGEN" cuando no la hay: **la fila nunca
 *  se salta**. 🔴 Sin `tieneFoto` el resultado es EXACTAMENTE el de siempre, columna
 *  por columna: lo de las fotos es opcional y no puede cambiar el Excel de hoy. */
export function buildCatalogoAoa(
  rows: CatalogoRow[],
  monthLabel: string,
  tieneFoto?: (newArticle: string) => boolean,
): (string | number)[][] {
  const head = [
    "PO NAME", "New Article", "Name", "Department", "CATEGORY", "AGE GROUP", "GENDER",
    "Precio A", "Precio B", `Piezas ${monthLabel}`.trim(),
  ];
  if (tieneFoto) head.unshift(COL_FOTO);
  const aoa: (string | number)[][] = [head];
  const cell = (v: number | null): string | number => (v === null ? "" : v);
  for (const r of rows) {
    const fila: (string | number)[] = [
      r.po, r.newArticle, r.name, r.department, r.category, r.ageGroup, r.gender,
      cell(r.precioA), cell(r.precioB), r.piezas,
    ];
    if (tieneFoto) fila.unshift(tieneFoto(r.newArticle) ? "" : TEXTO_SIN_FOTO);
    aoa.push(fila);
  }
  return aoa;
}

/* ============ SALIDA B · PLANTILLA SWITCH ============ */
// UNA fila por ARTÍCULO (New Article), igual que CK/TH. Cantidad = suma de todas las
// tallas del mes. Código de barra = el de la talla-muestra (pickSample). 25 cols
// (OUT_COLS) = la plantilla de Switch. SIN Title Case (Department/proveedor tal cual).

export type PrecioAB = "A" | "B";

export interface SwitchBuildConfig {
  formula: PriceFormula;
  temporada: string;
  tasa: string;
  /** Flete del embarque: 1.10 o 1.15 (ver `flete.ts`). Es lo que convierte el
   *  Costo FOB en Costo CIF. Sin valor → 1.10, el de siempre. */
  flete?: number;
  /** El descuento del proveedor en %, escrito a mano para TODO el archivo (ver
   *  `descuento-proveedor.ts`). Sin valor → se estima 20 % / 30 %, como siempre.
   *  ⚠️ El artículo cuyo archivo trae el precio ya descontado NO lo usa. */
  descuento?: string | number | null;
  /** Excepciones por Name (marcaKey(Name) → excepción). Ganan a la fórmula de marca. */
  excByName?: Map<string, MarcaRubroFormula>;
}

/** Fila Switch = las 25 columnas + metadatos de UI (talla-muestra, fallback). */
export interface SwitchRow {
  cols: Record<string, string | number | null>;
  talla: string;
  fallback: boolean;   // true si no se halló la talla exacta (9/7) → revisar (ámbar)
  po: string; name: string; gender: string;
  /** Piezas del mes del artículo (= "Stock Ideal"). Espejo tipado de cols para
   *  poder filtrar sin leer dentro del Record. */
  piezas: number;
  /** Cuántas filas del archivo (tallas/SKUs) se agruparon en este artículo. */
  skus: number;
}

/** Filas Switch, una por artículo, ordenadas por PO/Name/Género. */
export function buildSwitchRows(items: ReebokItem[], cfg: SwitchBuildConfig): SwitchRow[] {
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    if (!it.newArticle) continue;
    if (!groups.has(it.newArticle)) groups.set(it.newArticle, []);
    groups.get(it.newArticle)!.push(it);
  }
  const out: SwitchRow[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    const sample = pickSample(group);
    const qty = group.reduce((s, it) => s + (it.piezas || 0), 0);
    const w = first.wholesale;
    const { fob, cif } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete, cfg.descuento);
    // Jerarquía por Name: precio fijo > fórmula del Name > fórmula de marca (A/B).
    const precio = precioDescripcion(cif, excForName(cfg.excByName, first.name), cfg.formula);
    const composicion = group.map((it) => (it.composicion ?? "").trim()).find((c) => c !== "") ?? "";
    out.push({
      cols: {
        "Código *": first.newArticle,
        "Referencia *": first.newArticle,
        // 🔴 EL CÓDIGO DE BARRAS DE LA TALLA-MUESTRA. Con el Excel de DESPACHO es
        // el `EAN` de Reebok y, sin él, el `UPC` — en ese orden, porque el EAN es
        // el que Switch ya tiene cargado (94 de los 183 artículos de Active Shoes
        // son EAN-13 válidos, 66 con el prefijo `120` del despacho) y porque los
        // dos son códigos válidos pero NO son el mismo número. Con la
        // confirmación de compra no viene ninguno y se conserva el `SKU`, que es
        // lo que el sistema escribía hasta el 17-sep-2026 (`RBKAPPTR1200M`: no se
        // puede pistolear, pero no se inventa otra cosa). Ver `reebok-despacho.ts`.
        "Código Barra *": sample.codigoBarra || sample.sku || first.newArticle,
        "Descripción *": first.name,
        "Precio *": precio,
        "Tasa de Impuesto *": tasaSwitch(cfg.tasa), // «07», texto
        "Costo FOB *": fob,
        "Costo CIF *": cif,
        "rubro *": first.category,       // CATEGORY (SHOES / T-SHIRTS / SOCKS / BAGS…)
        "subrubro": first.gender,        // GENDER (Male / Female / Kids / Unisex)
        "Marca *": first.department,     // Department (FOOTWEAR / APPAREL / HARDWARE)
        "Proveedor *": REEBOK_PROVEEDOR,
        "Mínimo Stock": "",
        "Código Tipo de Artículo *": "01",
        "Unidad de medida *": unidadPara(first.department),
        "Origen": "",
        "Lote": "",
        "Serie": "",
        "Stock Ideal": qty,
        "Temporada": cfg.temporada,
        // La «Composición» del despacho de calzado («UPPER: 99% TEXTILE…»), tal
        // cual la manda Reebok. Se toma la PRIMERA no vacía del artículo: las
        // tallas del mismo estilo comparten material y alguna puede venir en
        // blanco. ⚠️ Con la confirmación de compra sigue SIEMPRE vacía, que es la
        // conducta de siempre (Daniel: «vuelve vacía, no la quiero»).
        "Composición": composicion,
        "Codigo CPBS": "",
        "Codigo CPBS Abrev": "",
        "Bonificación": "",
        "Cantidad por caja": "",
      },
      talla: sample.talla,
      fallback: sample.fallback,
      po: first.po, name: first.name, gender: first.gender,
      piezas: qty, skus: group.length,
    });
  }
  out.sort(cmpPoNameGender);
  return out;
}

/* ============ FILTRO · ARTÍCULOS SIN PIEZAS DEL MES ============ */
// Daniel: "no deberia de aparecerme en el excel los que tengan stock 0".
//
// OJO CON QUÉ SIGNIFICA EL 0. En Reebok la columna "STOCK" de la vista previa ES
// "Stock Ideal", que ES la suma de las piezas del mes elegido. O sea: "stock 0" y
// "el proveedor no pidió nada de este artículo en JULIO" son el MISMO número. Por eso
// acá filtrar por la celda en 0 sí equivale a filtrar por "sin piezas del mes".
//
// NO vale generalizar esto a los otros generadores: en el Depurador CK/TH un
// "Stock Ideal" 0 también lo llevan los SERVICIOS (tipo de artículo 02), que deben
// seguir saliendo. Ese caso se maneja aparte en logic.ts.
//
// Y hay un 0 que NO es del proveedor: si no se detectó la columna del mes, parseReebok
// pone piezas=0 en TODAS las filas y el filtro vaciaría el archivo. Por eso esta función
// NO decide sola: el llamador solo la aplica cuando hay columna de mes de verdad.

/** true si el artículo no tiene ninguna pieza del mes (suma de todas sus tallas = 0). */
export const sinPiezasDelMes = (r: { piezas: number }): boolean => r.piezas === 0;

/** Deja solo los artículos con piezas del mes y dice cuántos quedaron afuera.
 *  Una talla suelta en 0 NO saca al artículo: lo que cuenta es la SUMA del artículo. */
export function filtrarConPiezas<T extends { piezas: number }>(rows: T[]): { rows: T[]; omitidos: number } {
  const conPiezas = rows.filter((r) => !sinPiezasDelMes(r));
  return { rows: conPiezas, omitidos: rows.length - conPiezas.length };
}

/** AOA de la plantilla Switch. Constructor propio SIN Title Case (a diferencia de
 *  buildAoa del Depurador): Department y proveedor van tal cual (mayúscula). */
export function buildSwitchAoa(rows: SwitchRow[]): (string | number)[][] {
  const aoa: (string | number)[][] = [OUT_COLS.slice()];
  for (const r of rows) {
    aoa.push(OUT_COLS.map((c) => {
      const v = r.cols[c];
      return v === null || v === undefined ? "" : v;
    }));
  }
  return aoa;
}
