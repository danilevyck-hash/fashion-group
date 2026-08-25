// Capa compartida del tab "Productos" de /ventas: tipos, lista de empresas,
// cálculo de rango de fechas por período y export a Excel. Lo consumen las dos
// rutas API (nivel 1 + drill-down) y el componente ProductosView.

import { MONTHS } from "./format";
// El criterio de "la misma ventana un año antes" vive en UN solo lugar (ver la
// nota de esa función). Acá se importa, no se copia.
import { unAnioAntes } from "@/lib/multifashion/productos-ranking";
// El día de negocio en Panamá (UTC−5 fijo) también vive en UN solo lugar. Acá se
// importa, no se copia: este repo ya pagó dos veces por agrupar en UTC (el borde
// de mes de Multifashion y el día de las marcaciones del reloj).
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";

// Las 7 empresas con switch_articulo_diario poblado (todo el grupo menos
// Confecciones Boston, que no se backfilleó). Default Fashion Wear.
export const PRODUCTOS_EMPRESAS: { key: string; nombre: string }[] = [
  { key: "fashion_wear", nombre: "Fashion Wear" },
  { key: "vistana", nombre: "Vistana International" },
  { key: "fashion_shoes", nombre: "Fashion Shoes" },
  { key: "active_shoes", nombre: "Active Shoes" },
  { key: "active_wear", nombre: "Active Wear" },
  { key: "joystep", nombre: "Joystep" },
  { key: "american_classic", nombre: "Multifashion" },
];

export const PRODUCTOS_EMPRESA_KEYS = PRODUCTOS_EMPRESAS.map(e => e.key);
export const DEFAULT_PRODUCTOS_EMPRESA = "fashion_wear";

export function empresaNombre(key: string): string {
  return PRODUCTOS_EMPRESAS.find(e => e.key === key)?.nombre ?? key;
}

export interface ProductoNivel1 {
  descripcion: string;
  num_codigos: number;
  cantidad: number;
  venta: number;
  costo: number;
  margen: number | null;
}

export interface ProductoCodigo {
  codigo: string;
  descripcion: string;
  cantidad: number;
  venta: number;
  costo: number;
  margen: number | null;
}

export interface ProductosResponse {
  empresa: string;
  year: number;
  mes: number | null;
  /** Qué período resolvió el servidor. Ausente en respuestas viejas = "ytd". */
  periodo?: ProductosPeriodo;
  desde: string;
  hasta: string;
  /** Ventana contra la que se mide el Δ. La devuelve el servidor para que la
   *  pantalla pueda DECIR contra qué compara, en vez de que Daniel lo adivine. */
  comparativo?: { desde: string; hasta: string };
  /**
   * ⛔ YA NO SE MANDA. Quedan los meses sueltos que alimentaban el selector.
   *
   * Daniel, textual (24-ago-2026), sobre el desplegable de período: *"solo
   * dejame las 4 primeras, las otras quítamelas que sobran, nunca te las pedí"*.
   * Sin esas opciones, `meses` no lo lee NADIE — y lo llenaba una RPC
   * (`switch_articulo_margen_mensual`) que se pedía en cada carga de la
   * pantalla. Dejar la consulta viva para una respuesta que nadie mira es
   * exactamente lo que esta base —en compute Micro, caída 4 veces esta
   * semana— no se puede seguir pagando.
   *
   * Se deja el campo OPCIONAL en vez de borrarlo para que una respuesta vieja
   * en caché no rompa nada al deserializarse.
   */
  meses?: number[];
  totales: { venta: number; costo: number; margen: number | null };
  productos: ProductoNivel1[];
}

// Período → rango de fechas [desde, hasta] (YYYY-MM-DD).
//   mes 1..12 → mes calendario completo.
//   mes null  → YTD: 1-ene del año hasta hoy (o fin de año si es año cerrado).
//
// `ahora` es un parámetro con default para que el "hoy" del período y el del
// comparativo salgan del MISMO instante (y para que los tests puedan pararse en
// un borde de año).
//
// 🩸 ESE INSTANTE SE LEE EN HORA DE PANAMÁ, NO EN UTC. Panamá es UTC−5 fijo (sin
// horario de verano), así que entre las 7 de la tarde y la medianoche de Panamá
// —00:00 a 05:00 UTC del día siguiente— el reloj UTC ya está en MAÑANA: el
// 25-ago-2026 a las 00:30 UTC son las 19:30 del 24 en Panamá, y «Año en curso»
// terminaba el 2026-08-25, un día que todavía no pasó. En la MISMA pantalla y a
// la misma hora, «Últimos 12 meses» terminaba el 24 (ese ya cortaba en Panamá).
// El caso simétrico duele más: el 1-ene a las 02:00 UTC en Panamá todavía es el
// 31-dic, así que el año que corre es el VIEJO. El arreglo es que el instante se
// resuelva en Panamá; las dos puntas (período y comparativo) siguen naciendo del
// mismo `ahora` y no se pueden separar ni un día.
export function productosRange(
  year: number,
  mes: number | null,
  ahora: Date = new Date(),
): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (mes && mes >= 1 && mes <= 12) {
    const lastDay = new Date(year, mes, 0).getDate(); // día 0 del mes siguiente = último día de `mes`
    return { desde: `${year}-${pad(mes)}-01`, hasta: `${year}-${pad(mes)}-${pad(lastDay)}` };
  }
  const yearEnd = `${year}-12-31`;
  const todayStr = hoyPanama(ahora);
  return { desde: `${year}-01-01`, hasta: todayStr < yearEnd ? todayStr : yearEnd };
}

// ── PERÍODOS ────────────────────────────────────────────────────────────────
//
// Los cuatro que pidió Daniel, textual: "año en curso, últimos 6 meses, últimos
// 12 meses, año pasado". El MES SUELTO que ya existía se queda: es lo que se usa
// para cerrar un mes contra el mismo mes del año pasado.
//
// 🩸 LOS RELATIVOS NO MIRAN EL AÑO DEL SELECTOR DE ARRIBA, Y ES A PROPÓSITO.
// "Últimos 12 meses" es una ventana anclada en HOY: pararla en el año 2025 del
// selector global no significaría nada. Por eso la pantalla imprime SIEMPRE las
// dos fechas del período debajo del total — un rótulo relativo sin fechas es
// justo el que se malinterpreta.
//
// Los cortes son el 1 del mes, nunca "hace 180 días": una ventana cuyo piso se
// corre un día por día es una ventana que cambia sola, y "del 25 de febrero al
// 24 de agosto" no es un período que nadie sepa repetir. Mismo criterio que
// `rango12Meses` de Multifashion.

export type ProductosPeriodo = "ytd" | "6m" | "12m" | "anio_pasado";

export const PRODUCTOS_PERIODO_KEYS: readonly ProductosPeriodo[] = [
  "ytd",
  "6m",
  "12m",
  "anio_pasado",
] as const;

export function esProductosPeriodo(v: string): v is ProductosPeriodo {
  return (PRODUCTOS_PERIODO_KEYS as readonly string[]).includes(v);
}

/**
 * Rango del período elegido.
 *
 * PURO: `ahora` explícito (nunca `new Date()` adentro) — el bug de un borde de
 * mes aparece 1 día de cada 30 y sin esto no se puede probar.
 *
 * `ytd` delega en `productosRange` SIN TOCARLA: es el camino que la pantalla
 * viene usando y sus números no se pueden mover.
 */
export function productosRangoPeriodo(
  periodo: ProductosPeriodo,
  year: number,
  mes: number | null,
  ahora: Date,
): { desde: string; hasta: string } {
  if (periodo === "ytd") return productosRange(year, mes, ahora);

  const hoy = hoyPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));

  // "Año pasado" = el año calendario cerrado anterior a HOY, entero.
  if (periodo === "anio_pasado") return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };

  // 6 o 12 meses de CALENDARIO incluido el mes en curso: el 24-ago-2026, "12
  // meses" es 1-sep-2025 → 24-ago-2026 (once cerrados + el que corre).
  const largo = periodo === "6m" ? 6 : 12;
  const desde = new Date(Date.UTC(anio, mesHoy - largo, 1)).toISOString().slice(0, 10);
  return { desde, hasta: hoy };
}

/**
 * La ventana contra la que se mide el Δ: EL MISMO PERÍODO DEL AÑO ANTERIOR.
 *
 * ── LA REGLA, UNA SOLA: UN PERÍODO EMPEZADO SE COMPARA CONTRA EL MISMO TRAMO ─
 *
 * 🩸 «Año en curso» comparaba los meses transcurridos de 2026 contra los DOCE
 * meses enteros de 2025. El año pasado corría con cuatro meses de ventaja, así
 * que la Δ mostraba caídas que eran del calendario y no del negocio: en Fashion
 * Wear, *Women-T-Shirts S/S* daba **−38%** en «Año en curso» y **+29% / +15%**
 * en «Últimos 6 / 12 meses», en la MISMA pantalla y con las mismas ventas. Ahora
 * se compara 1-ene → el mismo día del año pasado.
 *
 * Es el criterio que este repo YA usa en `rangoComparativo` de Multifashion —
 * "un mes empezado se compara contra los MISMOS DÍAS del año pasado"— aplicado
 * al año en vez de al mes, y con su misma pieza: `unAnioAntes` (que hace caer el
 * 29-feb en el 28). No hay un tercer criterio dando vueltas.
 *
 * · Año en curso → [1-ene del año anterior, `unAnioAntes(hasta del actual)`].
 *   El `hasta` sale del PERÍODO ACTUAL, no de un "hoy" recalculado acá: las dos
 *   puntas de la comparación nacen del mismo instante y no se pueden separar ni
 *   un día (Panamá es UTC−5 fijo, y un `new Date()` de más entre las 7 p.m. y la
 *   medianoche corre el día de una punta y no de la otra).
 *   Un año YA CERRADO cae solo en el año entero: su `hasta` es el 31-dic, y
 *   `unAnioAntes("2024-12-31")` es el 31-dic anterior. No hay caso especial.
 *
 * · Mes suelto → `productosRange(year - 1, mes)`, INTACTO. Un mes cerrado ya se
 *   compara entero contra entero; no hay nada que recortar y su columna no se
 *   mueve.
 *
 * · Períodos relativos → la MISMA ventana corrida 12 meses, punta a punta.
 *   Mismo largo y mismo corte de día, nada que recortar.
 */
export function productosRangoComparativo(
  periodo: ProductosPeriodo,
  year: number,
  mes: number | null,
  ahora: Date,
): { desde: string; hasta: string } {
  if (periodo === "ytd") {
    const anterior = productosRange(year - 1, mes, ahora);
    if (mes && mes >= 1 && mes <= 12) return anterior;
    const actual = productosRange(year, mes, ahora);
    return { desde: anterior.desde, hasta: unAnioAntes(actual.hasta) };
  }
  const r = productosRangoPeriodo(periodo, year, mes, ahora);
  return { desde: unAnioAntes(r.desde), hasta: unAnioAntes(r.hasta) };
}

/** Nombre del período para el título del Excel y el rótulo de la pantalla. */
export function periodoLabel(
  year: number,
  mes: number | null,
  periodo: ProductosPeriodo = "ytd",
  ahora: Date = new Date(),
): string {
  if (periodo === "6m") return "Últimos 6 meses";
  if (periodo === "12m") return "Últimos 12 meses";
  if (periodo === "anio_pasado") return `Año ${Number(hoyPanama(ahora).slice(0, 4)) - 1}`;
  if (mes) return `${MONTHS[mes - 1]} ${year}`;
  // Un año todavía abierto es "el año en curso"; uno cerrado es el año entero.
  // "YTD" era jerga: Daniel lo nombra "año en curso".
  return year >= Number(hoyPanama(ahora).slice(0, 4)) ? "Año en curso" : `Año ${year}`;
}

/** Trozo del nombre de archivo del Excel. */
export function periodoSlug(mes: number | null, periodo: ProductosPeriodo): string {
  if (periodo !== "ytd") return periodo;
  return mes ? String(mes).padStart(2, "0") : "ytd";
}

/**
 * PRECIO PROMEDIO del grupo: venta neta ÷ unidades netas.
 *
 * Se calcula sobre el AGREGADO, no se promedian los precios de cada código: en
 * "Women-T-Shirts S/S" un código de 8 unidades pesaría igual que uno de 8.000.
 *
 * `null` cuando las unidades no son positivas — un grupo que quedó en devolución
 * neta no tiene precio promedio, y un "$0.00" sería mentira. Es la misma regla
 * con la que el margen es `null` con venta ≤ 0.
 */
export function precioPromedio(
  venta: number | null | undefined,
  cantidad: number | null | undefined,
): number | null {
  if (venta == null || cantidad == null) return null;
  if (!Number.isFinite(venta) || !Number.isFinite(cantidad)) return null;
  return cantidad > 0 ? venta / cantidad : null;
}

/** Precio promedio listo para pintar. "—" cuando no hay unidades netas. */
export function fmtPrecioProm(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Margen como % sin signo forzado, 1 decimal. "—" si no aplica.
export function fmtMargen(d: number | null | undefined): string {
  if (d == null) return "—";
  return (d * 100).toFixed(1) + "%";
}

// Export Excel del nivel 1 (todas las descripciones, no solo el Top 20).
// Estilo de la casa (src/lib/excel-export.ts, hallazgo I11): título navy,
// subtítulo MID con venta total y margen, headers navy, zebra, fila TOTAL en
// banda PRI. Venta MONEY_FMT y margen PCT_FMT como números reales.

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildProductosSheet(
  resp: ProductosResponse,
  /**
   * Nombre del cliente cuando la pantalla está filtrada por uno.
   *
   * 🔴 CON CLIENTE, LA COLUMNA MARGEN% NO SALE. `switch_factura_lineas` no trae
   * costo: no hay margen de este cliente. Una columna "Margen%" vacía en un
   * archivo que se manda por correo se lee como un cero, y el margen del
   * PRODUCTO al lado de la venta del CLIENTE se lee como si fuera suyo.
   */
  cliente?: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  const nombre = empresaNombre(resp.empresa);
  const periodo = periodoLabel(resp.year, resp.mes, resp.periodo ?? "ytd");

  const totalCant = resp.productos.reduce((s, p) => s + p.cantidad, 0);
  const totalPrecio = precioPromedio(resp.totales.venta, totalCant);

  return buildReportSheet({
    // Las dos fechas van en el subtítulo: un Excel titulado "Últimos 12 meses"
    // que se guarda y se abre en noviembre no dice qué 12 meses fueron.
    title: `FASHION GROUP — Productos · ${nombre} · ${periodo}` + (cliente ? ` · ${cliente}` : ""),
    // 🔴 LAS FECHAS VAN CON EL FORMATEADOR DE LA CASA (`fmtDate`, "1 mar 2026"),
    // el MISMO que usa la pantalla. Este Excel Daniel lo manda por correo, y
    // "Del 2026-03-01 al 2026-08-24" es formato de base de datos: la misma fecha
    // se leía distinta en la pantalla y en el archivo que sale de ella.
    subtitle:
      `Del ${fmtDate(resp.desde)} al ${fmtDate(resp.hasta)} · Venta total ${fmtMoneyPlain(resp.totales.venta)}` +
      ` · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`,
    columns: [
      { header: "Descripción", wch: 34 },
      { header: "# Códigos", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Cantidad", wch: 12, align: "right", fmt: "#,##0" },
      { header: "Venta", wch: 16, align: "right", fmt: MONEY_FMT },
      // Precio prom. va PEGADO a Venta y Cantidad, que son sus dos factores.
      // Vacío (no cero) cuando no hay unidades netas: un 0 se suma y se promedia.
      { header: "Precio prom.", wch: 14, align: "right", fmt: MONEY_FMT },
      ...(cliente ? [] : [{ header: "Margen%", wch: 10, align: "right" as const, fmt: PCT_FMT }]),
    ],
    // 🔴 `p.margen` VA TAL CUAL, sin `?? 0`. En pantalla un grupo sin margen
    // calculable (venta ≤ 0, o sea devolución neta) se lee "—"; un 0,0% en el
    // Excel es un margen REAL que se suma y se promedia con los demás y baja el
    // promedio sin que nadie lo note. Es la MISMA regla que ya seguía
    // `precioPromedio` en la columna de al lado: `null` = celda VACÍA.
    rows: resp.productos.map(p => [
      p.descripcion,
      p.num_codigos,
      p.cantidad,
      p.venta,
      precioPromedio(p.venta, p.cantidad),
      ...(cliente ? [] : [p.margen]),
    ]),
    totals: [
      "TOTAL", null, totalCant, resp.totales.venta, totalPrecio,
      ...(cliente ? [] : [resp.totales.margen]),
    ],
  });
}

export async function exportProductosToExcel(
  resp: ProductosResponse,
  cliente?: string,
): Promise<void> {
  const ws = await buildProductosSheet(resp, cliente);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Productos", ws }]),
    `productos-${resp.empresa}-${periodoSlug(resp.mes, resp.periodo ?? "ytd")}-${resp.year}` +
      (cliente ? `-${cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "") +
      ".xlsx",
  );
}

function fmtMoneyPlain(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
