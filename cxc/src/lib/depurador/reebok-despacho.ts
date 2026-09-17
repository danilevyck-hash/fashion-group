// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE **DESPACHO** DE REEBOK — la segunda entrada del mismo flujo.
//
// 🔴 SON DOS ENTRADAS, NO UN REEMPLAZO. El flujo Reebok de «Plantilla Switch»
// come dos archivos distintos del proveedor y saca las MISMAS dos salidas
// (preforma para el cliente y plantilla de Switch de 25 columnas):
//
//   · la CONFIRMACIÓN de compra (`RBK FW26 - ACTIVE SEPTIEMBRE.xlsx`) — lo que
//     VA A LLEGAR. Se usa para cotizar antes de que la mercancía exista. La lee
//     `parseReebok` y no cambió ni una coma.
//   · el DESPACHO (`Detalle_Despacho…xlsx`) — lo que DE VERDAD LLEGÓ. Lo lee
//     este módulo.
//
// 🔑 Y EL DESPACHO TIENE DOS GENERACIONES, y las dos se tienen que poder subir.
// Daniel, textual (17-sep-2026): *«en el despacho excel que solo trae calzado
// fue reemplazado por el que tiene accesory donde sí trae category, solo falta
// que me agreguen poname y department»*.
//   · FORMATO NUEVO (26 columnas, hoja `Sheet1`) — el que Reebok manda de acá en
//     adelante, para ropa Y para calzado. Trae `Category`, `Color Name` y
//     `Lista de Precio`. ⚠️ **PERDIÓ dos columnas que el viejo traía:
//     `Composición` y `EAN`. La que hay que pedirle a Reebok de vuelta es el
//     `EAN`** —es el código de barra que Switch ya tiene cargado—; la
//     `Composición` Daniel no la usa y no la quiere.
//   · FORMATO VIEJO (25 columnas, hoja `Despacho`) — solo calzado. Trae
//     `Composición` y `EAN`, y NO trae `Category` ni `Color Name`.
// Los archivos viejos ya existen y alguien los va a soltar en la pantalla, así
// que el parser se come los dos y la tabla de respaldo de abajo es la que
// resuelve cada diferencia sin que nadie configure nada.
//
// 🩸 POR QUÉ NACIÓ ESTE ARCHIVO. De la confirmación salían tres números mal, y
// los tres vienen buenos en el despacho:
//
//   1. EL COSTO SE INVENTABA. `fobReebok` asume un descuento —0,80 en calzado y
//      0,70 en ropa y accesorios— porque la confirmación no dice cuál es. El
//      despacho SÍ lo dice, columna por columna (`% de descuento` y
//      `Precio after Disc`). Medido sobre los dos archivos reales del 17-sep-2026:
//      el calzado trae descuentos de **20 %, 25 % y 30 %** en el mismo embarque.
//      Daniel: *«hay veces que puede llegar un porcentaje más alto. No siempre
//      será 20»*. Por eso el descuento **no se reemplaza por otra constante: se
//      LEE**. Y como el precio de venta sale del CIF, un costo bajo es un precio
//      bajo: esto mueve plata en las dos salidas.
//   2. EL CÓDIGO DE BARRAS NO ERA UN CÓDIGO DE BARRAS — **en ropa**. Se escribía
//      el `SKU` de Reebok (`RBKAPPTR1200M`), que no se puede pistolear. Ahora
//      sale del `EAN` de cada talla y, sin él, del `UPC`. ⚠️ En el despacho VIEJO
//      de calzado el `SKU` ES el EAN (idénticos en las 1.579 filas), así que ahí
//      el sistema ya escribía el código bueno: el defecto era solo de ropa. El
//      porqué del orden EAN → UPC está medido en la tabla de respaldo.
//   3. LA CANTIDAD ERA UNA PROYECCIÓN — las piezas de la columna del MES de la
//      confirmación. El despacho trae `Quantity`.
//
// 🔑 CÓMO SE CONECTA SIN TOCAR NADA: este módulo NO arma filas de Switch. Solo
// produce los MISMOS `ReebokItem` que `parseReebok`, ya traducidos. De ahí para
// abajo (`buildCatalogo`, `buildSwitchRows`, `costoReebok`, `pickSample`, las 25
// columnas) es el mismo camino, palabra por palabra. En particular el costo:
// `Precio Base` entra como `wholesale` y `Precio after Disc` como
// `wholesaleOff`, que es exactamente el campo que `fobReebok` ya prefiere cuando
// viene con valor. 🔴 Un solo costo por producto, y sin una segunda cuenta.
// ─────────────────────────────────────────────────────────────────────────────

import type { Cell, SheetRow } from "./logic";
import type { ReebokItem } from "./reebok";

const normH = (s: Cell): string => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
const txt = (v: Cell): string => String(v ?? "").trim();

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔴 LA TABLA DE RESPALDO — **EL MISMO ARCHIVO, CON O SIN LAS COLUMNAS NUEVAS**
 *
 * Daniel, textual (17-sep-2026): *«vendrá con poname y category pero por ahora
 * que el sistema acepte este excel, y cuando llegue con lo otro ya sepa y me lo
 * acepte también sin tener que estar reconfigurando»*.
 *
 * O sea: **ninguna columna que hoy falta puede ser obligatoria, y ninguna puede
 * pedir que alguien toque una pantalla el día que aparezca.** El día que Reebok
 * agregue `PO NAME`, `Category` o `Department`, el sistema empieza a usarlas
 * SOLO, sin configurar nada; y si mañana les cambia el nombre, se agrega un
 * alias en esta tabla y no se toca una línea del parser.
 *
 * ⚠️ Y las DOS generaciones del despacho tampoco tienen las mismas columnas
 * ENTRE SÍ — el formato nuevo GANÓ `Category` y `Color Name` y PERDIÓ
 * `Composición` y `EAN`. La diferencia no es un descuido del proveedor: es el
 * estado normal, y va a volver a pasar. Por eso la regla de respaldo es un DATO
 * y no un `if` suelto en medio del parser: el día que Reebok devuelva el `EAN`
 * al formato nuevo, el mapeo ya está escrito y no hay nada que tocar — el mismo
 * trato que `PO NAME`, `Category` y `Department`.
 * ══════════════════════════════════════════════════════════════════════════ */

export type CampoDespacho =
  | "po" | "orden" | "documento" | "season" | "talla" | "skuFather" | "segmento" | "department"
  | "gender" | "ageGroup" | "sku" | "descripcion" | "quantity" | "precioBase"
  | "descuentoPct" | "precioAfterDisc" | "upc" | "ean" | "category" | "colorName"
  | "composicion";

export interface ColumnaDespacho {
  campo: CampoDespacho;
  /** Cómo se llama en pantalla (el nombre que usa Reebok). */
  rotulo: string;
  /** Los encabezados aceptados. El PRIMERO es el de hoy; los demás son alias.
   *  Se comparan NORMALIZADOS (mayúsculas, sin espacios de más). */
  alias: string[];
  /** Sin ella el archivo no se puede leer. */
  obligatoria: boolean;
  /** Obligatoria SALVO que venga este otro campo (ej: el segmento deja de hacer
   *  falta el día que llegue la columna `Department` de verdad). */
  obligatoriaSalvo?: CampoDespacho;
  /** De dónde sale si NO viene. Se muestra tal cual en pantalla. */
  respaldo: string;
}

export const COLUMNAS_DESPACHO: ColumnaDespacho[] = [
  { campo: "skuFather", rotulo: "SKU Father", alias: ["SKU Father", "SKU Padre"], obligatoria: true,
    respaldo: "—" },
  { campo: "sku", rotulo: "SKU", alias: ["SKU"], obligatoria: true, respaldo: "—" },
  { campo: "descripcion", rotulo: "Description SKUs", alias: ["Description SKUs", "Descripción SKUs", "Description SKU"], obligatoria: true,
    respaldo: "—" },
  { campo: "talla", rotulo: "Talla", alias: ["Talla", "Size"], obligatoria: true, respaldo: "—" },
  { campo: "gender", rotulo: "Gender", alias: ["Gender", "Género"], obligatoria: true, respaldo: "—" },
  // 🔴 Las dos que arreglan defectos que mueven plata: sin ellas el sistema
  // volvería a inventar el costo y a proyectar la cantidad, y en silencio.
  { campo: "quantity", rotulo: "Quantity", alias: ["Quantity", "Cantidad"], obligatoria: true,
    respaldo: "—" },
  { campo: "precioAfterDisc", rotulo: "Precio after Disc", alias: ["Precio after Disc", "Precio After Disc", "Precio con descuento"], obligatoria: true,
    respaldo: "—" },
  { campo: "segmento", rotulo: "Segmento de negocio", alias: ["Segmento de negocio"], obligatoria: true, obligatoriaSalvo: "department",
    respaldo: "—" },
  // ── De acá para abajo, TODAS opcionales ───────────────────────────────────
  // 🔑 DESDE EL 17-sep-2026 VIENE, Y LA DERIVACIÓN ERA CORRECTA — está MEDIDO,
  // no supuesto: sobre las 229 filas del archivo con las columnas nuevas, la
  // columna `Department` (APPAREL 163 · HARDWARE 66) coincide con lo que
  // `departmentDelSegmento` derivaba de «Segmento de negocio» en **229 de 229,
  // cero diferencias**. Por eso se quedan las dos: cuando la columna viene se
  // usa, y cuando no, el respaldo da exactamente lo mismo.
  { campo: "department", rotulo: "Department", alias: ["Department", "Departamento"], obligatoria: false,
    respaldo: "se deriva de «Segmento de negocio» (FTW → FOOTWEAR · APP → APPAREL · ACC HW → HARDWARE)" },
  // 🔑 Desde el formato nuevo (17-sep-2026) viene SIEMPRE, también en calzado.
  // El respaldo es la red de los despachos viejos, no el camino normal.
  { campo: "category", rotulo: "Category", alias: ["Category", "Categoría", "CATEGORY"], obligatoria: false,
    respaldo: "SHOES cuando el Department es FOOTWEAR; en el resto queda vacío y se dice" },
  // 🔴 EL PO TIENE CUATRO ESCALONES, EN ESTE ORDEN (Daniel, 17-sep-2026:
  // *«por ahora también se puede usar BP Reference No. como poname»*):
  //   1. `PO NAME`            — el nombre viejo; el día que vuelva, gana sola.
  //   2. `PO`                 — 🔑 EL NOMBRE NUEVO (17-sep-2026). Reebok mandó el
  //      dato que Daniel pidió, pero la columna se llama `PO` a secas **y de paso
  //      QUITARON `BP Reference No.`**, que era justo el respaldo que se estaba
  //      usando: sin este alias el PO se perdía del todo.
  //   3. `BP Reference No.`   — es el MISMO dato con otro nombre: medido en los
  //      archivos del 17-sep, dice `VIC` en calzado y `VIC- APP FW26` en el
  //      primer despacho de ropa.
  //   4. `Orden`              — el respaldo de abajo, por fila.
  // El orden de los alias ES la precedencia: `buscarCol` devuelve el primero que
  // encuentra, así que agregar un nombre nuevo es agregarlo a esta lista y nada más.
  //
  // ⚠️ **UN ARCHIVO PUEDE TRAER VARIOS PO, Y NADA PUEDE ASUMIR QUE HAY UNO SOLO.**
  // Medido sobre el archivo con las columnas nuevas (229 filas): `VIC` en 217 y
  // `ACTIVE SHOES` en 12. El PO se lee POR FILA y agrupa la preforma por
  // `po + newArticle`; el que asuma «un PO por archivo» junta dos pedidos.
  { campo: "po", rotulo: "PO NAME", alias: ["PO NAME", "PO Name", "PONAME", "PO", "BP Reference No.", "BP Reference No", "BP Reference"], obligatoria: false,
    respaldo: "se usa «PO» o «BP Reference No.»; sin ninguna, se agrupa por «Orden»" },
  { campo: "orden", rotulo: "Orden", alias: ["Orden", "N° Orden", "N Orden", "No Orden", "Nº Orden"], obligatoria: false,
    respaldo: "queda vacío" },
  // 🔑 EL NÚMERO DE FACTURA DEL PROVEEDOR (17-sep-2026). No entra a ninguna de
  // las 25 columnas —`Codigo CPBS` sigue vacía en Reebok, igual que siempre— y
  // por eso agregarlo NO cambia un solo byte del Excel. Es para la PANTALLA: la
  // fila de totales dice contra qué facturas se está cuadrando el costo. Un
  // despacho puede traer varias (el de ropa trae la 3970 y la 3971).
  { campo: "documento", rotulo: "Document Number", alias: ["Document Number", "Documento", "N° Documento"], obligatoria: false,
    respaldo: "la fila de totales no dice contra qué facturas se cuadra" },
  /* ─────────────────────────────────────────────────────────────────────────
   * 🔴 EL CÓDIGO DE BARRA SALE DEL **EAN**, Y RECIÉN DESPUÉS DEL UPC.
   *
   * 🩸 Los dos son códigos de barras VÁLIDOS del mismo producto, y NO son el
   * mismo número — por eso el orden no da igual y está medido, no elegido.
   *
   * Medido el 17-sep-2026 sobre las 1.579 filas del despacho de calzado:
   *   · `EAN` es de 13 dígitos y `UPC` de 12, los **1.579 con dígito
   *     verificador válido** en los dos campos;
   *   · **`EAN` ≠ `UPC` en las 1.579**, sin una sola coincidencia
   *     (ZIGNITION 9.5 → EAN `1200186012487`, UPC `199307013049`);
   *   · el `EAN` arranca con `120` en las 1.579.
   *
   * Y medido sobre lo que Switch YA tiene cargado (export de Active Shoes,
   * `listaarticulo_1_17092026024104.csv`, 183 artículos): **94 códigos de barra
   * son EAN-13 válidos** —y **66 de esos 94 empiezan con `120`**, el prefijo del
   * EAN del despacho—, **4 son UPC-12** y 85 no son ninguno de los dos
   * (correlativos internos de 5 y 6 dígitos: 993277, 65388, 984730…).
   *
   * 🔑 O sea: **lo que está cargado en Switch es el EAN.** Cargar el UPC
   * teniendo el EAN dejaría el catálogo con dos formatos mezclados, y la pistola
   * de la tienda lee el que está impreso en la etiqueta.
   *
   * ⚠️ Y hay una vuelta más: en el despacho VIEJO de calzado la columna `SKU` ES
   * el EAN —idénticas en las 1.579 filas—, así que ahí el sistema ya venía
   * escribiendo el código bueno sin saberlo. El defecto del código de barras era
   * REAL solo en ropa, donde el `SKU` es `RBKHWACCS055M` y no se puede pistolear.
   * ────────────────────────────────────────────────────────────────────────── */
  { campo: "ean", rotulo: "EAN", alias: ["EAN"], obligatoria: false,
    respaldo: "se usa el UPC (también es un código de barras válido, pero es OTRO número que el que Switch tiene cargado)" },
  { campo: "upc", rotulo: "UPC", alias: ["UPC"], obligatoria: false,
    respaldo: "se usa el EAN; sin ninguno de los dos, el SKU de Reebok (que en ropa NO es un código de barras)" },
  // El formato NUEVO la perdió, y **no hay que pedirla de vuelta**: Daniel no la
  // usa y no la quiere (en CK/TH esa celda de Switch va siempre vacía por pedido
  // suyo). El mapeo queda escrito y funcionando por si algún día vuelve, pero la
  // columna que sí importa recuperar es el `EAN` — ver el bloque de arriba.
  { campo: "composicion", rotulo: "Composición", alias: ["Composición", "Composicion"], obligatoria: false,
    respaldo: "la columna de Switch queda vacía, como siempre" },
  { campo: "colorName", rotulo: "Color Name", alias: ["Color Name", "COLOR NAME"], obligatoria: false,
    respaldo: "no se usa" },
  { campo: "ageGroup", rotulo: "Age Group", alias: ["Age Group", "AGE GROUP"], obligatoria: false,
    respaldo: "la talla-muestra trata el artículo como de adulto" },
  { campo: "season", rotulo: "Season", alias: ["Season", "Temporada Reebok"], obligatoria: false,
    respaldo: "no se usa" },
  { campo: "precioBase", rotulo: "Precio Base", alias: ["Precio Base", "Precio base"], obligatoria: false,
    respaldo: "no se usa: el costo sale de «Precio after Disc»" },
  { campo: "descuentoPct", rotulo: "% de descuento", alias: ["% de descuento", "% descuento", "Descuento %"], obligatoria: false,
    respaldo: "no se usa: el costo sale de «Precio after Disc»" },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * EL DEPARTMENT SE DERIVA DEL SEGMENTO — Y POR TOKEN, NUNCA POR `includes`
 *
 * Reebok todavía no manda `Department` como columna propia del despacho, pero
 * `Segmento de negocio` siempre trae una de tres palabras. Medido sobre los dos
 * archivos reales (17-sep-2026): 17 segmentos distintos en calzado y 6 en ropa,
 * y los 23 caen en una de las tres.
 *
 *     FTW     → FOOTWEAR    «Reebok RUNNING CORE FTW MEN», «Reebok CLASSICS FTW WOMEN»…
 *     APP     → APPAREL     «Reebok TRAINING APP MEN», «Reebok CLASSICS APP MEN»…
 *     ACC HW  → HARDWARE    «REEBOK TRAINING ACC HW ALL»
 *
 * 🩸 LA COMPARACIÓN ES POR PALABRA ENTERA, sobre los tokens del segmento, y eso
 * no es puntillismo: el repo ya se quemó con un `includes` —«female» contiene
 * «male» y «women» contiene «men» (ver `tommy-gender.ts`)— y acá pasa lo mismo
 * en chiquito con marcas como `HWY` o `APPAREL` adentro de un segmento futuro.
 *
 * ⚠️ Si el segmento NO trae ninguna de las tres, NO se adivina: la fila sale con
 * el Department VACÍO, se cuenta y se dice en pantalla con el valor crudo — el
 * mismo trato que `parseReebok` ya le da a un Department desconocido. Daniel:
 * *«las cosas deben ser sencillas y yo ordenarlas como se debe en Switch»*.
 * ══════════════════════════════════════════════════════════════════════════ */

export const DEPARTMENT_POR_TOKEN: ReadonlyArray<{ token: string; department: string }> = [
  { token: "FTW", department: "FOOTWEAR" },
  { token: "APP", department: "APPAREL" },
  { token: "HW", department: "HARDWARE" },
];

/** El Department (la «Marca» de Switch) que le toca a un segmento. `""` = no se
 *  reconoce, y eso NO es un valor: es «no sé». */
export function departmentDelSegmento(segmento: string): string {
  const tokens = new Set(normH(segmento).split(" ").filter(Boolean));
  for (const { token, department } of DEPARTMENT_POR_TOKEN) {
    if (tokens.has(token)) return department;
  }
  return "";
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EL RUBRO CUANDO NO VIENE `Category` — Y UNA PREGUNTA ABIERTA DE DANIEL
 *
 * 🔴 EL CAMINO NORMAL ES `Category`, Y DESDE EL 17-sep-2026 VIENE SIEMPRE. El
 * formato nuevo del despacho la trae para ropa Y para calzado, así que ese valor
 * va al `rubro *` tal cual — exactamente lo que el flujo de la confirmación ya
 * hacía con su columna `CATEGORY`. No hay nada nuevo en ese camino.
 *
 * ⚠️ Lo de abajo es la RED, no la regla: si el archivo NO trae `Category` —solo
 * los despachos viejos de calzado, que ya no se mandan pero siguen existiendo en
 * el disco de alguien— el rubro del calzado es `SHOES`.
 *
 * Medido contra producción el 17-sep-2026 (`switch_articulo_info`, los 1.763
 * artículos de `active_shoes`): **`SHOES` son 1.624**, y los 1.624 artículos con
 * `marca = FOOTWEAR` tienen los 1.624 ese rubro. Cero contradicciones. Por eso
 * el respaldo del calzado no inventa nada. Fuera del calzado no hay un valor
 * único, así que ahí el rubro queda VACÍO y se dice en pantalla — nunca se
 * adivina.
 *
 * ⚠️ **DECISIÓN PENDIENTE DE DANIEL, y ésta es la única línea que va a cambiar.**
 * Él preguntó, textual (17-sep-2026): *«¿si no viene category usará Segmento de
 * negocio y lo convertirá para mantener misma línea que ya existe en el
 * inventario de Active Shoes?»*.
 *
 * La pregunta es de fondo y es ANTERIOR a este archivo: el inventario y lo que
 * el depurador escribe no están en la misma línea. Medido el 17-sep-2026:
 *   · en Switch el rubro de Active Shoes tiene ONCE valores, y tres cubren casi
 *     todo — `SHOES` 1.624 · `APPAREL` 79 · `SOCKS` 24 —, más `BAGS` 15,
 *     `HEADWEAR` 7, `MEN` 3, `GENERAL` 4, `DISPLAY & PROMO` 3, `OFERTA` 2,
 *     `SHORTS` 1 y `MUEBLES ZAPATOS` 1;
 *   · el despacho de ropa trae `Category` con categorías MÁS FINAS —medidas
 *     sobre sus 229 filas: T-SHIRTS 95, SOCKS 46, SHORTS 36, BAGS 20, TOPS 12,
 *     BRA 12, JACKETS 8—, y cuatro de ellas (T-SHIRTS, TOPS, BRA, JACKETS)
 *     **no existen todavía en el inventario**.
 *
 * O sea que subir el archivo tal cual le agrega valores nuevos al rubro. Eso ya
 * pasaba antes de este módulo y **no se cambia por cuenta propia**: es plata y
 * es acomodo de Switch, y las dos cosas las decide él. Cuando decida, se cambia
 * ESTA función y nada más — la regla no está repartida por el módulo.
 * ══════════════════════════════════════════════════════════════════════════ */

/** La red del calzado cuando NO viene `Category`. No es el camino normal. */
export const RUBRO_CALZADO = "SHOES";

export function rubroDeRespaldo(department: string): string {
  return department === "FOOTWEAR" ? RUBRO_CALZADO : "";
}

/* ═══════════════════════════ DETECCIÓN DEL ARCHIVO ═══════════════════════════ */

/** Los encabezados que identifican a un despacho. Se busca por CONTENIDO y no
 *  por el nombre de la hoja: hoy se llama `Sheet1` en ropa y `Despacho` en
 *  calzado, y eso puede cambiar sin avisar. */
const FIRMA_DESPACHO = ["SKU FATHER", "QUANTITY"];

/** Fila de encabezados del despacho, o −1 si el libro no es un despacho.
 *  ⚠️ Un despacho tiene los encabezados en la fila 1; la confirmación, en la 2.
 *  Igual se buscan las primeras 20 filas: la posición no es la que identifica. */
export function findHeaderRowDespacho(rows: SheetRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const H = (rows[i] || []).map(normH);
    if (FIRMA_DESPACHO.every((f) => H.includes(f))) return i;
  }
  return -1;
}

export const esDespacho = (rows: SheetRow[]): boolean => findHeaderRowDespacho(rows) !== -1;

/* ═══════════════════════════════ PARSEO ═══════════════════════════════════ */

/** Dónde quedó cada campo de la tabla de respaldo. −1 = la columna no vino. */
export type IndiceDespacho = Record<CampoDespacho, number>;

export interface ColumnaAusente {
  rotulo: string;
  respaldo: string;
}

export interface ParseDespachoResult {
  items: ReebokItem[];
  headerRow: number;
  indice: IndiceDespacho;
  /** Avisos por fila (un dato que falta en un renglón suelto). */
  warnings: string[];
  /** Las columnas opcionales que NO vinieron, con la regla que las reemplaza.
   *  Se dicen en pantalla: el archivo entra igual. */
  ausentes: ColumnaAusente[];
  /** Segmentos de negocio que no traen FTW/APP/HW. Salen con Department vacío. */
  segmentosDesconocidos: Array<{ valor: string; articulos: string[] }>;
}

const buscarCol = (headers: Cell[], alias: string[]): number => {
  const H = headers.map(normH);
  for (const a of alias) { const i = H.indexOf(normH(a)); if (i !== -1) return i; }
  return -1;
};

/** Dónde está cada campo. PURA: solo mira los encabezados. */
export function indiceDespacho(headers: Cell[]): IndiceDespacho {
  const out = {} as IndiceDespacho;
  for (const c of COLUMNAS_DESPACHO) out[c.campo] = buscarCol(headers, c.alias);
  return out;
}

/**
 * Lee el Excel de despacho y devuelve los MISMOS `ReebokItem` que `parseReebok`.
 *
 * 🔴 De acá para abajo no hay un segundo camino: las 25 columnas, el costo, la
 * talla-muestra y la preforma son los de siempre.
 */
export function parseDespacho(rows: SheetRow[]): ParseDespachoResult {
  const headerRow = findHeaderRowDespacho(rows);
  if (headerRow === -1) {
    throw new Error("No encontré la fila de encabezados del despacho (busco SKU Father + Quantity). ¿Es el Excel de despacho de Reebok?");
  }
  const headers = rows[headerRow];
  const indice = indiceDespacho(headers);

  // Obligatorias: las que sin ellas el archivo entraría mal y en silencio.
  const faltan = COLUMNAS_DESPACHO
    .filter((c) => c.obligatoria && indice[c.campo] === -1)
    .filter((c) => !(c.obligatoriaSalvo && indice[c.obligatoriaSalvo] !== -1))
    .map((c) => c.rotulo);
  if (faltan.length) throw new Error("Faltan columnas en el archivo de despacho: " + faltan.join(", ") + ".");

  // Las opcionales que no vinieron se DICEN, con la regla que las reemplaza.
  const ausentes: ColumnaAusente[] = COLUMNAS_DESPACHO
    .filter((c) => !c.obligatoria && indice[c.campo] === -1 && c.respaldo !== "no se usa")
    .map((c) => ({ rotulo: c.rotulo, respaldo: c.respaldo }));

  const warnings: string[] = [];
  const desconocidos = new Map<string, { valor: string; articulos: string[] }>();
  const items: ReebokItem[] = [];
  const val = (row: SheetRow, i: number): string => (i === -1 ? "" : txt(row[i]));

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
    const newArticle = val(row, indice.skuFather);
    const sku = val(row, indice.sku);
    if (!newArticle && !sku) continue;
    const id = newArticle || sku;

    // Department: la columna si vino; si no, derivado del segmento.
    const segmento = val(row, indice.segmento);
    const department = indice.department !== -1
      ? val(row, indice.department)
      : departmentDelSegmento(segmento);
    if (!department) {
      const clave = normH(segmento) || "(vacío)";
      const e = desconocidos.get(clave) ?? { valor: clave, articulos: [] };
      if (!e.articulos.includes(id)) e.articulos.push(id);
      desconocidos.set(clave, e);
    }

    // rubro: la columna `Category` si vino; si no, el respaldo.
    const category = indice.category !== -1 ? val(row, indice.category) : rubroDeRespaldo(department);

    // 🔴 EL COSTO SE LEE, NO SE ASUME. `Precio after Disc` entra como el
    // «WholesalePrice OFF» que `fobReebok` ya prefiere: el FOB ES ese número.
    const precioAfterDisc = num(row[indice.precioAfterDisc]);
    if (precioAfterDisc === null) warnings.push(`${id}: sin «Precio after Disc» (el costo se calcularía con el descuento asumido)`);
    const precioBase = indice.precioBase === -1 ? null : num(row[indice.precioBase]);

    // 🔴 EL CÓDIGO DE BARRA: **EAN PRIMERO, DESPUÉS UPC**, y el SKU como último
    // recurso. El porqué del orden está arriba, en la tabla de respaldo.
    const codigoBarra = val(row, indice.ean) || val(row, indice.upc);

    items.push({
      // Sin `PO NAME` se agrupa por la orden: es lo que junta una preforma.
      po: val(row, indice.po) || val(row, indice.orden),
      newArticle,
      sku,
      name: val(row, indice.descripcion),
      department,
      category,
      ageGroup: val(row, indice.ageGroup),
      colorName: val(row, indice.colorName),
      gender: val(row, indice.gender),
      sellIn: val(row, indice.season),
      // `wholesale` es el precio de lista y `wholesaleOff` el ya descontado:
      // exactamente los dos campos que `costoReebok` espera.
      wholesale: precioAfterDisc !== null ? (precioBase ?? precioAfterDisc) : precioBase,
      wholesaleOff: precioAfterDisc,
      talla: val(row, indice.talla),
      piezas: num(row[indice.quantity]) || 0,
      codigoBarra,
      composicion: val(row, indice.composicion),
      // Solo para la pantalla: ninguna de las 25 columnas lo lee.
      documento: val(row, indice.documento),
    });
  }
  if (items.length === 0) throw new Error("No se encontraron filas de productos válidas.");

  const segmentosDesconocidos = [...desconocidos.values()]
    .sort((a, b) => b.articulos.length - a.articulos.length || a.valor.localeCompare(b.valor));
  return { items, headerRow, indice, warnings, ausentes, segmentosDesconocidos };
}
