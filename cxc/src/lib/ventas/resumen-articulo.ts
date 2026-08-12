// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DE UN ARTÍCULO — los TRES GRANDES del tab Ventas › Referencia.
// Módulo PURO (sin red, sin DOM, sin "ahora").
//
// Lo que Daniel quiere saber para decidir si repone, textual:
//   *"yo lo que quiero ver en cuanto tiempo se me mueve el articulo, para saber
//    si con el stock actual que tengo debo de comprar mas, menos o no comprar.
//    pero no quiero que decidas tu, lo decido yo con la data que me extraigas"*
//
// 🔴 LA JERARQUÍA LA FIJÓ ÉL (12-ago-2026), textual: *"el numero importante
// estan chiquito. cuanto compre es importante, cuanto vendi en total es
// importante… me queda 2 meses de venta / vendo 11u mes es lo que mas llama la
// atencion y no es lo mas importante ya que un mes puedo vender mucho y otros
// meses no, vendo b2b al por mayor no retail"*. De ahí:
//   · Los tres GRANDES: **Compré · Vendí · Stock** (unidades, tipografía
//     grande). Compré = lo que llegó y Vendí = lo vendido neto (NC restadas):
//     el histórico completo, o —cuando la bodega quedó en 0 y volvió a llegar
//     mercancía— los de la ÚLTIMA LLEGADA, que es lo que decide reponer hoy.
//     Stock = `existencia` de Switch, NUNCA deducido y NUNCA recortado.
//   · El RITMO ("vendo por mes", "me queda para") baja a UNA línea secundaria.
//   · ⚠️ `Compré − Vendí` NO siempre da `Me quedan` (ajustes, ventas sin compra
//     registrada, robos). NO se fuerza el cuadre: cada número dice su verdad y
//     los avisos de descuadre explican el hueco.
//
// La PANTALLA y el EXCEL lo llaman a ÉL: si cada uno hiciera su cuenta
// tendríamos dos verdades sobre la misma decisión.
//
// 🔴 LA CAJA DE COMPRAS NO INTERPRETA NADA (11-ago-2026). Ver la nota larga
// sobre por qué se fue el reparto FIFO, más abajo.
//
// 🔴 NUNCA ENTRA EL MES EN CURSO. Medido el 10-ago-2026 en `40HM265001`: los
// "últimos 3 meses" daban 18,3 u/mes con 10 días de agosto adentro y 34,3 con
// meses completos — EL DOBLE. La ventana termina en el mes ANTERIOR a `hoyMes`,
// siempre, y no hay ninguna rama que la corra.
//
// 🔴 LAS NC YA VIENEN RESTADAS. Este módulo recibe `art.serie`, que arma
// `ventasPorMes()` sobre `ventasNetasPorDia()` — el ÚNICO lugar donde se aplica
// `signoTipo()`. Acá NO se vuelve a firmar nada. La firma del error histórico
// del repo es que la diferencia da EXACTO el doble de las notas de crédito.
//
// 🩸 ACÁ NO HAY VEREDICTOS, Y ES A PROPÓSITO. Nada de "comprá N", "se agotó",
// "descontinuado" ni "movimiento lento". Daniel ya rechazó dos diseños por eso:
// él mira los números y decide. Lo único que se agrega a un número crudo es
// DECIR CUÁNDO NO SE PUEDE CALCULAR — que es lo contrario de un veredicto.
// ─────────────────────────────────────────────────────────────────────────────

import { diffMeses, restarMeses } from "./referencia";
import { fobEstimado } from "./referencia-info";
import type { ArticuloCompras, Compra, MesVenta } from "./compras";

/** Cuántos meses completos mira la pantalla. */
export const MESES_VENTANA = 12;

/** Los meses fuertes de Daniel, textual: *"ultimos 3 meses del año vendo mas q
 *  los primeros 3 meses del año"*. Se RESALTAN en las barras; NO ajustan ningún
 *  promedio (decisión B de Daniel: el "me queda para X meses" es el número
 *  simple y él lo interpreta). */
export const MESES_FUERTES: readonly number[] = [10, 11, 12];

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "jul 2026" */
export function fmtMesAnio(mes: string): string {
  return `${fmtMesCorto(mes)} ${mes.slice(0, 4)}`;
}

/** "ene" — la etiqueta de una barra. */
export function fmtMesCorto(mes: string): string {
  return MESES_CORTO[Number(mes.slice(5, 7)) - 1] ?? mes.slice(5, 7);
}

/** "9 abr 2025" — el formato de fecha de la casa. */
export function fmtFechaCorta(f: string): string {
  const [a, m, d] = f.split("-");
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1] ?? m} ${a}`;
}

/** "16 meses" / "1 mes" / "menos de 1 mes". Una sola definición para pantalla
 *  y Excel — si difirieran, la misma compra tendría dos duraciones. */
export function textoMeses(meses: number | null): string {
  if (meses == null) return "—";
  const n = Math.round(meses);
  if (n <= 0) return "menos de 1 mes";
  return n === 1 ? "1 mes" : `${n} meses`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Redondeo a CENTAVOS, exactamente el que muestra la pantalla.
 *
 * 🩸 `toFixed(2)` y la pantalla NO coinciden en el borde del medio centavo, y
 * el caso está en producción: el CIF de `NB2570001` es **16,555**. La pantalla
 * (`toLocaleString`, o sea Intl) redondea sobre el DECIMAL y muestra **$16.56**;
 * `(16.555).toFixed(2)` mira el binario —que en realidad es 16,554999…— y
 * devuelve **16.55**. Con eso el Excel decía un centavo menos que la ficha del
 * mismo artículo, y una planilla que no cuadra con la pantalla es exactamente
 * la clase de detalle que le hace perder la confianza a las dos.
 *
 * Se usa el MISMO formateador que la pantalla y se lee el número de vuelta: la
 * igualdad queda garantizada por construcción, no por parecido.
 */
const FMT_CENTAVOS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function centavos(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Number(FMT_CENTAVOS.format(n));
}

/**
 * Los N meses COMPLETOS anteriores a `hoyMes`, del más viejo al más nuevo.
 *
 * 🔴 `hoyMes` NO entra. En agosto la ventana termina en julio.
 */
export function ultimosMesesCompletos(hoyMes: string, n: number = MESES_VENTANA): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i -= 1) out.push(restarMeses(hoyMes, i));
  return out;
}

// ─── Barras ──────────────────────────────────────────────────────────────────

export interface MesBarra {
  mes: string; // YYYY-MM
  /** Unidades NETAS del mes. 0 = el mes existió y no vendió. */
  unidades: number;
  /** Venta NETA del mes, en dólares. */
  venta: number;
  /** oct · nov · dic — los meses fuertes de Daniel. */
  fuerte: boolean;
  /** `true` = el artículo todavía no había vendido nunca. NO es un cero de
   *  venta: es un mes en el que el artículo no estaba en la calle. */
  antesDeEmpezar: boolean;
}

/** El primer mes en que el artículo vendió ALGO, en toda su historia. */
export function primerMesConVenta(serie: readonly MesVenta[]): string | null {
  const conVenta = serie.filter((s) => s.unidades > 0).map((s) => s.mes);
  return conVenta.length ? conVenta.reduce((a, b) => (a < b ? a : b)) : null;
}

/**
 * Las 12 barras. TODOS los meses de la ventana salen siempre, aunque el
 * artículo sea nuevo: si se recortaran, oct-nov-dic cambiarían de lugar de un
 * artículo a otro y dejarían de servir para comparar de un vistazo.
 */
export function barrasDeVentana(
  serie: readonly MesVenta[],
  hoyMes: string,
  n: number = MESES_VENTANA,
): MesBarra[] {
  const porMes = new Map(serie.map((s) => [s.mes, s]));
  const primero = primerMesConVenta(serie);
  return ultimosMesesCompletos(hoyMes, n).map((mes) => ({
    mes,
    unidades: porMes.get(mes)?.unidades ?? 0,
    venta: porMes.get(mes)?.venta ?? 0,
    fuerte: MESES_FUERTES.includes(Number(mes.slice(5, 7))),
    antesDeEmpezar: primero != null && mes < primero,
  }));
}

// ─── "Vendo por mes" ─────────────────────────────────────────────────────────

export interface Promedio {
  /** Unidades por mes. `null` = no vendió nada en la ventana. */
  porMes: number | null;
  /** Unidades netas sumadas. */
  unidades: number;
  /** Venta neta sumada, en dólares. */
  venta: number;
  /** Entre cuántos meses se dividió. */
  meses: number;
  /**
   * `true` = el artículo empezó a venderse DENTRO de la ventana, así que se
   * promedió su vida y no 12 meses.
   *
   * 🩸 Sin esto, un artículo que llegó en diciembre saldría con el promedio
   * dividido entre 12 —o sea la mitad de lo que vende de verdad— y el "me queda
   * para" se iría al doble. Medido en `QD3958033` (llegó 26-dic-2025, 54 u
   * vendidas): 54÷12 = 4,5 u/mes → 28 meses de stock, contra 54÷7 = 7,7 u/mes →
   * 16 meses, que es lo real.
   */
  desdeQueEmpezo: boolean;
}

/**
 * Unidades por mes sobre la ventana de meses completos.
 *
 * El divisor son los meses de la ventana en los que el artículo YA se vendía.
 * Un mes dentro de su vida con cero ventas SÍ divide (es un mes malo, no un mes
 * inexistente); los anteriores a su primera venta NO.
 */
export function promedioMensual(barras: readonly MesBarra[]): Promedio {
  const vivos = barras.filter((b) => !b.antesDeEmpezar);
  const unidades = vivos.reduce((s, b) => s + b.unidades, 0);
  const venta = vivos.reduce((s, b) => s + b.venta, 0);
  const meses = vivos.length;
  return {
    porMes: meses > 0 && unidades > 0 ? unidades / meses : null,
    unidades,
    venta,
    meses,
    desdeQueEmpezo: meses > 0 && meses < barras.length,
  };
}

// ─── "Me queda para" ─────────────────────────────────────────────────────────

/**
 * Meses que alcanza el stock actual al ritmo del promedio.
 *
 * 🔴 SIN AJUSTE DE TEMPORADA — decisión B de Daniel: *el número simple, él lo
 * interpreta*. Las barras con oct-nov-dic marcados son las que le muestran la
 * estacionalidad; meterla acá adentro la escondería dentro de un número que
 * nadie puede reconstruir.
 */
export function mesesDeStock(existencia: number | null, porMes: number | null): number | null {
  if (existencia == null || porMes == null || porMes <= 0) return null;
  if (existencia <= 0) return 0;
  return existencia / porMes;
}

// ─── Los TRES GRANDES: Compré · Vendí · Stock ────────────────────────────────
//
// 🔴 SON TRES FUENTES DISTINTAS Y NO SE FUERZA EL CUADRE ENTRE ELLAS:
//   · Compré  = lo que llegó. Con UNA sola llegada en toda la historia son
//               TODAS las compras registradas (`cuadre.comprado`, también las
//               de más de 3 años que la lista no muestra); con VARIAS llegadas
//               sobre bodega en 0, es lo que trajo la ÚLTIMA (ver abajo).
//   · Vendí   = lo vendido, neto, con las NC ya restadas (la firma del error de
//               signos es que la diferencia da EXACTO el doble): histórico o de
//               la última llegada, SIEMPRE en el mismo par que Compré.
//   · Stock   = `switch_articulo_info.existencia`, la fuente de verdad.
//               🔴 NUNCA se deduce, y NUNCA se recorta a una llegada: es lo que
//               hay en la bodega, contado por Switch. Decisión explícita de
//               Daniel (12-ago-2026).
// Cuando no cierran (ajuste de inventario, venta sin compra registrada, robo —
// Daniel: *"si hay menos es porq robaron"*), los avisos de descuadre que ya
// existen lo explican. Acá cada número dice su verdad.
//
// 🔴 CON 2+ LLEGADAS SOBRE BODEGA EN 0, LOS GRANDES SON DE LA ÚLTIMA. Daniel,
// sobre la ficha de `4G5004G001` (12-ago-2026), textual: *"mira que sigue
// diciendo compre 72 cuando enverdad son 36"*, y eligió la salida: *"(a) Los
// grandes pasan a ser de la última llegada: Compré 36 · Vendí 25 · Stock 12 —
// que sea coherente"*. Los grandes DECÍAN el histórico (72 · 61) mientras la
// frase, el KPI "Meses" y las columnas VENDIDO·MESES ya hablaban de la última
// llegada: la misma tarjeta contaba dos historias a la vez.
//   ⚠️ NO ES UNA SEGUNDA CUENTA: sale de la MISMA `medirTandas()` que ya mide
//   el reloj, la frase y el ritmo. Si acá se recalculara la llegada, dos
//   definiciones del mismo episodio podrían separarse con el tiempo.
//   ⚠️ EL HISTÓRICO NO SE PIERDE: viaja en `historico` y la ficha lo muestra en
//   chico bajo la lista de compras ("72 u en total · 61 vendidas").

/** El total de toda la historia, cuando los grandes son de la última llegada. */
export interface HistoricoTotal {
  /** Todas las compras registradas. `null` = sin compra registrada. */
  comprado: number | null;
  /** Neto histórico con las NC restadas. */
  vendido: number;
}

export interface TresGrandes {
  /** `null` = sin compra registrada: no se inventa un 0 que parecería dato. */
  comprado: number | null;
  /** Puede ser NEGATIVO (más devoluciones que ventas). */
  vendido: number;
  /** `null` = Switch no tiene este código en el catálogo. SIEMPRE es la
   *  existencia REAL de bodega, también cuando los otros dos son de la última
   *  llegada. */
  quedan: number | null;
  /** vendido ÷ comprado. `null` cuando no se puede decir (sin compras, o
   *  vendido negativo — "el −5% de lo comprado" no es castellano). */
  parteVendida: number | null;
  /** `true` = Compré y Vendí son de la ÚLTIMA LLEGADA, no del histórico. */
  deLlegada: boolean;
  /** El histórico total. `null` = los grandes YA son el histórico y repetirlo
   *  sería el mismo número dos veces. */
  historico: HistoricoTotal | null;
}

export function tresGrandes(
  art: Pick<ArticuloCompras, "cuadre" | "existencia" | "sinCompraRegistrada">,
  // Con 2+ llegadas manda la ACTUAL. `null` (una sola, o timeline no
  // afirmable) = los grandes son los históricos de siempre.
  tandas: MedidaTandas | null = null,
): TresGrandes {
  // `cuadre` puede faltar en una respuesta vieja cacheada tras un deploy —
  // misma degradación honesta que `serie ?? []`.
  const comprado = art.sinCompraRegistrada || art.cuadre == null ? null : art.cuadre.comprado;
  const vendido = art.cuadre?.vendido ?? 0;
  // ⚠️ SIN TOPE en el histórico: vendido > comprado es un descuadre REAL (el
  // caso TERMO) y "el 120% de lo comprado" es la verdad que hay que ver.
  const parteDe = (c: number | null, v: number) => (c != null && c > 0 && v > 0 ? v / c : null);
  const actual = tandas && tandas.tandas.length >= 2 ? tandas.tandas[tandas.tandas.length - 1] : null;
  if (actual) {
    return {
      comprado: actual.llegaron,
      vendido: actual.vendidas,
      // 🔴 La existencia REAL, sin recortar. La diferencia contra
      // (llegaron − vendidas) la explican los avisos de descuadre de siempre.
      quedan: art.existencia,
      parteVendida: parteDeTanda(actual),
      deLlegada: true,
      historico: { comprado, vendido },
    };
  }
  return {
    comprado,
    vendido,
    quedan: art.existencia,
    parteVendida: parteDe(comprado, vendido),
    deLlegada: false,
    historico: null,
  };
}

/** "el 80% de lo comprado" / "el 69% de esa llegada" — el subtítulo de Vendí.
 *  `null` = no hay porcentaje honesto que decir y el que llama pone su propio
 *  texto. */
export function textoParteVendida(parte: number | null, deLlegada = false): string | null {
  if (parte == null || !Number.isFinite(parte)) return null;
  const de = deLlegada ? "de esa llegada" : "de lo comprado";
  const pct = Math.round(parte * 100);
  if (pct < 1) return `menos del 1% ${de}`;
  return `el ${pct}% ${de}`;
}

/** "72 u en total · 61 vendidas" — el histórico completo, en chico, cuando los
 *  grandes son de la última llegada. `null` = no hay nada distinto que contar. */
export function textoHistoricoTotal(h: HistoricoTotal | null): string | null {
  if (!h || h.comprado == null) return null;
  return `${fmtNum(h.comprado)} u en total · ${fmtNum(h.vendido)} vendidas`;
}

// ─── TANDAS: episodios entre CEROS de bodega ─────────────────────────────────
//
// 🔴 EL CASO QUE LAS EXIGIÓ (4G5004G001, captura de Daniel, 12-ago-2026):
// compró 36 u en oct-2025 (30 + 6 el MISMO día), las vendió TODAS en oct y nov
// (bodega en 0), estuvo dic-mar SIN mercancía, y en mar-2026 llegaron 36 más.
// La ficha decía "Meses: 10 · de venta, desde oct 2025" y "Vendo 6.1 u por
// mes". Daniel, textual: *"no me hace sentido que me dice 10 meses de venta,
// entonces pense no comprar porque yo compro para 3 o 4 meses. pero me lo suma
// y me lo aplaza"*, y la regla la fijó él: *"si llego a 0 y llego mercancia,
// cual es la logica q me muestre 10 meses? me debe de mostrar la ultima (y mira
// q hubo dos el mismo dia (se tienen que sumar))"*.
//
// Una TANDA = lo que pasa entre "la bodega quedó en 0" y "volvió a quedar en
// 0". Compras que llegan cuando HAY stock vivo (o el mismo día/mes) se SUMAN a
// la tanda abierta; una compra que llega con la bodega en 0 ABRE tanda nueva.
//
// 🔴 ESTO NO ES EL FIFO PROHIBIDO. El FIFO repartía ventas ENTRE compras con
// stock vivo encima — inventado, nadie marcó las cajas. Acá el corte es un
// HECHO agregado: si el stock tocó 0 antes de la siguiente compra, todo lo
// vendido hasta ahí salió de lo que había llegado hasta ahí — no hay nada que
// atribuir. DENTRO de una tanda todo sigue siendo agregado.
//
// Granularidad MENSUAL, como todo el módulo: el timeline es el neto acumulado
// compras − ventas por mes, con los datos que la ficha ya tiene (compras con
// fecha + ventas mensuales). Al mes, "llegó el mismo día" y "llegó el mismo
// mes con stock vivo" son indistinguibles y los dos SUMAN — que es la regla.
//
// ⚠️ CUÁNDO SE PUEDE AFIRMAR EL TIMELINE (si no, todo queda como siempre):
//   · sin compras de MÁS DE 3 AÑOS (no viajan sus fechas: el saldo arrancaría
//     mentiroso y los "ceros" serían ficción),
//   · sin ventas ANTERIORES a la primera compra (misma razón),
//   · sin "vendidas de más" que pasen del ruido (TERMO vendió 1.648 de 796:
//     con el saldo en −852 cada compra "abriría tanda" sobre un cero falso).
// El RUIDO tolerado son ±2 unidades (ajustes tipo "1 en bodega que no sale de
// ninguna compra") — medido en el barrido de vistana del 12-ago-2026: subir la
// tolerancia de 0 a 2 en el CIERRE solo mueve un puñado de códigos, y exigir 0
// exacto en el guard de vendidoDeMas dejaría fuera artículos con 1 u de ajuste.
//
// ⚠️ "QUEDÓ EN 0" = saldo del timeline ≤ min(2, 10% de lo llegado de la tanda).
// El 10% protege a las tandas chicas: una de 8 u con 2 en bodega NO está en
// cero (le queda el 25%); una de 36 con 2 sí (94% vendido, la cola no cuenta).
//
// 🔴 CON UNA SOLA TANDA NO CAMBIA NADA: el artículo que nunca tocó 0 se mide
// exactamente como siempre (ancla extendida, agotado en la última venta, etc.).
// Solo con 2+ tandas la tanda ACTUAL pasa a mandar en MESES y VENDIDO.

export interface Tanda {
  /** El mes de la llegada que la abrió (YYYY-MM). */
  desdeMes: string;
  /** Unidades llegadas dentro de la tanda (todas sus compras, sumadas). */
  llegaron: number;
  /** Unidades NETAS vendidas mientras la tanda estuvo abierta (el mes en curso
   *  incluido: es un acumulado, no un promedio). */
  vendidas: number;
  /** Último mes con venta neta > 0 dentro de la tanda. */
  ultimaVentaMes: string | null;
  /** `true` = la bodega quedó en 0 (llegó otra tanda después, o el artículo
   *  está agotado según Switch). El reloj quedó CERRADO en su última venta. */
  cerrada: boolean;
  /** Cerrada: meses INCLUSIVE desde la apertura hasta la última venta (oct →
   *  nov = 2, como cuenta Daniel). Viva: meses TRANSCURRIDOS hasta hoy. */
  meses: number;
}

export interface MedidaTandas {
  /** La más vieja primero. La última es la tanda ACTUAL. */
  tandas: Tanda[];
  /** Σ vendidas de todas las tandas — el numerador del "vendo por mes". */
  vendidas: number;
  /** Meses CON mercancía en bodega, sin el mes en curso — el divisor del
   *  "vendo por mes": los meses sin stock no venden porque no hay qué vender,
   *  y dejarlos dividir diluye el ritmo (el "6.1 u por mes" de la captura). */
  mesesConStock: number;
}

/** Ruido de ajustes que se tolera al afirmar el timeline (±2 unidades). */
export const TANDA_RUIDO_MAX = 2;

/** "Quedó en 0" = saldo ≤ este umbral. min(2, 10% de lo llegado): tolera la
 *  cola de 1-2 unidades de ajuste en tandas de tamaño real y exige el 0 exacto
 *  en tandas chicas, donde 2 unidades son un cuarto de la mercancía. */
export function umbralTandaCero(llegaron: number): number {
  return Math.max(0, Math.min(TANDA_RUIDO_MAX, Math.floor(llegaron * 0.1)));
}

/**
 * Parte las compras y ventas del artículo en TANDAS (episodios entre ceros).
 *
 * Devuelve `null` cuando el timeline NO se puede afirmar (ver el encabezado):
 * ahí la ficha se comporta exactamente como siempre. Con 0 ó 1 tandas devuelve
 * la medida igual — el que llama decide que solo 2+ cambian algo.
 */
export function medirTandas(
  art: Pick<ArticuloCompras, "compras" | "comprasFueraDeVentana" | "serie" | "sinCompraRegistrada"> &
    Partial<Pick<ArticuloCompras, "vendidoAntes" | "vendidoDeMas" | "existencia">>,
  hoyMes: string,
  // Solo para MEDIR la sensibilidad del criterio en los diagnósticos
  // (scripts/_diag-tandas-referencia.ts). La pantalla usa SIEMPRE el default.
  umbralDe: (llegaron: number) => number = umbralTandaCero,
): MedidaTandas | null {
  const compras = art.compras ?? [];
  const serie = art.serie ?? [];
  if (art.sinCompraRegistrada || compras.length === 0) return null;
  if ((art.comprasFueraDeVentana ?? 0) > 0) return null;
  // Una respuesta vieja cacheada sin el cotejo no puede afirmar el timeline.
  if (art.vendidoAntes == null || art.vendidoDeMas == null) return null;
  if (art.vendidoAntes > 0) return null;
  if (Math.abs(art.vendidoDeMas) > TANDA_RUIDO_MAX) return null;

  const llegadasPorMes = new Map<string, number>();
  for (const c of compras) {
    const m = c.fecha.slice(0, 7);
    if (m > hoyMes) continue;
    llegadasPorMes.set(m, (llegadasPorMes.get(m) ?? 0) + c.unidades);
  }
  const ventasPorMes = new Map(serie.filter((s) => s.mes <= hoyMes).map((s) => [s.mes, s.unidades]));
  const meses = [...llegadasPorMes.keys()];
  if (!meses.length) return null;
  const primerMes = meses.reduce((a, b) => (a < b ? a : b));

  interface Acc {
    desdeMes: string;
    llegaron: number;
    vendidas: number;
    ultimaVentaMes: string | null;
  }
  const acc: Acc[] = [];
  let abierta: Acc | null = null;
  let saldo = 0; // el neto acumulado al CIERRE del mes anterior

  for (let m = primerMes; m <= hoyMes; m = restarMeses(m, -1)) {
    const lleg = llegadasPorMes.get(m) ?? 0;
    // Una compra abre tanda SOLO si la bodega ya estaba en 0 al cierre del mes
    // anterior. Con stock vivo (o el mismo mes) se SUMA a la tanda abierta.
    if (lleg > 0 && (abierta == null || saldo <= umbralDe(abierta.llegaron))) {
      abierta = { desdeMes: m, llegaron: 0, vendidas: 0, ultimaVentaMes: null };
      acc.push(abierta);
    }
    if (lleg > 0 && abierta) abierta.llegaron += lleg;
    const vta = ventasPorMes.get(m) ?? 0;
    if (abierta) {
      abierta.vendidas += vta;
      if (vta > 0) abierta.ultimaVentaMes = m;
    }
    saldo += lleg - vta;
  }

  const tandas: Tanda[] = acc.map((t, i) => {
    const esUltima = i === acc.length - 1;
    // Las tandas viejas están cerradas POR CONSTRUCCIÓN (la siguiente abrió
    // porque el saldo tocó 0). La actual cierra solo si Switch dice bodega 0 —
    // la misma foto que usa el agotado de siempre.
    const cerrada = !esUltima || (art.existencia === 0 && t.vendidas > 0 && t.ultimaVentaMes != null);
    const meses =
      cerrada && t.ultimaVentaMes != null
        ? Math.max(1, diffMeses(t.ultimaVentaMes, t.desdeMes) + 1)
        : cerrada
          ? 1
          : diffMeses(hoyMes, t.desdeMes);
    return { ...t, cerrada, meses };
  });

  return {
    tandas,
    vendidas: tandas.reduce((s, t) => s + t.vendidas, 0),
    mesesConStock: tandas.reduce((s, t) => s + (t.cerrada ? t.meses : diffMeses(hoyMes, t.desdeMes)), 0),
  };
}

/** El % de UNA tanda: vendidas ÷ llegaron, topeado en 100 (dentro de una tanda
 *  afirmable el exceso es el ruido de ±2 que el guard ya acotó). `null` = no
 *  hay porcentaje honesto (sin llegadas, o vendidas negativas). */
export function parteDeTanda(t: Pick<Tanda, "llegaron" | "vendidas">): number | null {
  if (!(t.llegaron > 0) || t.vendidas < 0) return null;
  return Math.min(1, t.vendidas / t.llegaron);
}

// 🔴 EN PANTALLA LA PALABRA "TANDA" NO EXISTE (redacción aprobada por Daniel,
// 12-ago-2026): se habla de la LLEGADA y del movimiento real. La frase de la
// ficha dice lo ÚNICO que los números grandes no pueden decir — CUÁNDO llegó la
// mercancía que están midiendo — y el ritmo:
//
//   Llegaron 36 u en mar 2026 · vendo 8.7 u por mes
//
// 🩸 LA FRASE SE PODÓ DOS VECES EL MISMO DÍA, Y LAS DOS POR LO MISMO: DECÍA
// NÚMEROS QUE YA ESTABAN ARRIBA.
//   · El "→ me quedan 11 u" era lo que quedaba DE ESA llegada (llegaron −
//     vendidas) mientras el grande "Stock" decía 12 (la existencia REAL). Dos
//     cifras para la misma pregunta —*"¿cuántas me quedan?"*— hacen desconfiar
//     de las dos; la que hay que creer es la de bodega. La unidad de diferencia
//     la explica el aviso de siempre (*"Hay 1 unidad en bodega que no sale de
//     ninguna compra registrada"*): el cuadre NO se fuerza.
//   · El "→ va el 69% en 5 meses" (y su gemelo cerrado "→ se vendió toda en 2
//     meses") quedó repetido palabra por palabra cuando los GRANDES pasaron a
//     ser de la llegada: el 69% ya está bajo Vendí y los 5 meses son el KPI
//     "Meses". Es la misma poda del "$16.56 tres veces" de la fila de plata.
// Lo que la frase SÍ aporta es la FECHA de la llegada y el "vendo N u por mes"
// (que lo agrega `textoLineaVenta`). La historia gris de abajo
// (`textoLlegadaAnterior`) se queda entera: ésa habla de OTRA llegada, no
// repite nada.
//
// Viva = gris (en curso); agotada = negro (cerrada), como en la tabla del modo
// pedido: el estado se dice con el peso de la letra y con el Stock, no con una
// frase que repita el KPI.

/** "Llegaron 36 u en mar 2026" — la cabeza de la línea de venta cuando la
 *  bodega quedó en 0 y volvió a llegar mercancía. Los CUÁNTO/CUÁNTO VA/CUÁNTO
 *  TIEMPO son los números grandes de arriba: acá no se repiten. */
export function fraseLlegadaActual(t: Tanda): string {
  return `Llegaron ${fmtNum(t.llegaron)} u en ${fmtMesAnio(t.desdeMes)}`;
}

/** "La anterior (oct 2025): 36 u — se vendió toda en 2 meses" — la historia,
 *  en gris, debajo de la frase. */
export function fraseLlegadaAnterior(t: Tanda): string {
  const parte = parteDeTanda(t);
  const pct = parte == null ? null : Math.round(parte * 100);
  const cuando = textoMeses(t.meses);
  const cierre =
    pct != null && pct < 100 ? `se vendió el ${pct}% en ${cuando}` : `se vendió toda en ${cuando}`;
  return `La anterior (${fmtMesAnio(t.desdeMes)}): ${fmtNum(t.llegaron)} u — ${cierre}`;
}

/** La línea gris completa de la historia: la llegada ANTERIOR + cuántas más
 *  hubo. `null` = no hay historia que contar (0 ó 1 llegadas). Con 3+ solo se
 *  detalla la anterior — el detalle de llegadas de hace años no decide la
 *  compra de hoy. */
export function textoLlegadaAnterior(tandas: readonly Tanda[] | null): string | null {
  if (!tandas || tandas.length < 2) return null;
  const base = fraseLlegadaAnterior(tandas[tandas.length - 2]);
  const n = tandas.length - 2;
  if (n <= 0) return base;
  return `${base} · y ${n} ${n === 1 ? "llegada anterior" : "llegadas anteriores"}`;
}

// ─── LA LÍNEA DE VENTA: cuánto tiempo de venta y qué % va ────────────────────
//
// 🔴 REEMPLAZA AL "VENDO POR MES" COMO PROTAGONISTA (12-ago-2026). Y LA REGLA
// DEL 90% SE FUE DEL MÓDULO ENTERO ese mismo día — Daniel, textual: *"debe de
// ser cuanto tiempo de venta tiene y % de la venta, asi en todo el modulo…
// podemos no tener esa regla y entender la info?"*. La regla anterior congelaba
// el reloj en el cruce del 90% y producía contradicciones que él mismo cazó
// (*"como stock 0 y vendido 90%?"*). Ahora hay UNA sola definición:
//
//   · % VENDIDO = lo REAL: Vendí ÷ Compré (los totales de los tres grandes).
//   · MESES = tiempo de venta, meses CALENDARIO desde la llegada (el ancla
//     extendida de siempre): si el artículo está AGOTADO (stock 0), hasta el
//     mes de su ÚLTIMA venta neta — el reloj se CIERRA ahí y la cola de bodega
//     no lo infla; si sigue VIVO, hasta hoy — el reloj corre.
//
// El caso que lo exigió (4G5004G030, captura de Daniel): 2 compras el MISMO
// día (5-oct-2025: 30 + 6 = 36), vendió 12 en oct y 24 en nov — TODO — y la
// ficha decía "Meses: 10 · de venta, desde oct 2025", con el reloj corriendo
// hasta hoy. Daniel: *"dice que vendi 36 en 10 meses, pero enverdad fueron en
// dos meses"*. Ahora: 100% · 2 meses (oct y nov).
//
// Las formas, según lo que se pueda AFIRMAR sin inventar:
//   · AGOTADO (stock 0, vendió algo): "Se vendió todo en 2 meses" (o "Se
//     vendió el 80% en 2 meses" si el % real no llega a 100 — el resto lo
//     explican los avisos de descuadre). Aplica igual con 1 o N compras: el
//     mes de la última venta es un HECHO del artículo, no una atribución por
//     tanda — el FIFO sigue prohibido.
//   · Compra ÚNICA viva:  "En 10 meses va el 80% de la compra".
//   · VARIAS compras vivas: agregado ROTULADO como lo que es — "Desde oct 2025
//     llegaron 360 u · van vendidas 295".
// El "vendo N u por mes" queda como dato chiquito al final de la línea.
//
// Granularidad: MESES CALENDARIO (las ventas llegan agregadas por día pero la
// pregunta de Daniel es en meses).
// 🔴 EL CONTEO DEL AGOTADO ES INCLUSIVE: del mes del ancla al mes de la última
// venta contando los dos — llegó en oct y terminó de venderse en nov = 2 meses,
// que es como cuenta Daniel (*"fueron en dos meses"*). El VIVO sigue contando
// meses TRANSCURRIDOS (oct-2025 → ago-2026 = 10): es un reloj abierto, no un
// episodio cerrado; al agotarse, el mes que lo cierra se suma.

export type LineaAvance =
  /** AGOTADO (stock 0): el reloj se CERRÓ en el mes de la última venta neta.
   *  `parte` = Vendí ÷ Compré (0-1); `null` = no afirmable (TERMO: vendido >
   *  comprado). `desdeMes` = el ancla (llegada única o ancla extendida). */
  | { tipo: "agotado"; meses: number; desdeMes: string; parte: number | null }
  /** Compra única viva: van `parte` (0-1) a los `meses` de llegada. */
  | { tipo: "en-curso"; meses: number; parte: number }
  /** Varias compras vivas: agregado desde la primera llegada de la ventana de
   *  12 meses (extendida hacia atrás si no cubre lo vendido). */
  | { tipo: "agregado"; desdeMes: string; llegaron: number; van: number }
  /** Sin compra registrada (o sin fecha utilizable): no se inventa. */
  | { tipo: "sin-dato" };

/**
 * Mide la línea de venta de un artículo.
 *
 * 🔴 CON UNA SOLA COMPRA la cuenta es limpia: todo lo vendido desde que llegó
 * salió de ella. CON VARIAS no se reparte nada — se suma lo llegado desde el
 * ancla y lo vendido desde el ancla, y el texto lo dice tal cual.
 * ⚠️ El mes en curso SÍ entra acá: la última venta y el "van vendidas" son
 * HECHOS acumulados, no promedios — excluirlos diría menos de lo que ya pasó.
 * (El mes en curso sigue FUERA de todos los promedios, como siempre.)
 */
export function medirAvance(
  art: Pick<ArticuloCompras, "compras" | "comprasFueraDeVentana" | "serie" | "sinCompraRegistrada"> &
    // `cuadre` y `existencia` son opcionales acá SOLO por las respuestas viejas
    // cacheadas tras un deploy (misma degradación honesta que `serie ?? []`):
    // sin ellos no se puede afirmar el agotado y la línea cae a la forma viva.
    Partial<Pick<ArticuloCompras, "cuadre" | "existencia">>,
  hoyMes: string,
  // 🔴 Con 2+ TANDAS la que manda es la ACTUAL (12-ago-2026, la regla de
  // Daniel: *"si llego a 0 y llego mercancia… me debe de mostrar la ultima"*).
  // El ancla es la llegada que la abrió y el % es DE LA TANDA — afirmable,
  // porque el cero de bodega separa lo de antes de lo de ahora sin atribuir
  // nada. Con `null` (una sola tanda, o timeline no afirmable) NADA cambia.
  tandas: MedidaTandas | null = null,
): LineaAvance {
  const actual = tandas && tandas.tandas.length >= 2 ? tandas.tandas[tandas.tandas.length - 1] : null;
  if (actual) {
    if (actual.cerrada) {
      return { tipo: "agotado", meses: actual.meses, desdeMes: actual.desdeMes, parte: parteDeTanda(actual) };
    }
    return { tipo: "en-curso", meses: actual.meses, parte: parteDeTanda(actual) ?? 0 };
  }
  const todas = art.compras ?? [];
  const fuera = art.comprasFueraDeVentana ?? 0;
  const serie = art.serie ?? [];
  if (art.sinCompraRegistrada || (todas.length === 0 && fuera === 0)) return { tipo: "sin-dato" };
  // Solo compras de más de 3 años: no viajan sus fechas, no hay ancla honesta.
  if (todas.length === 0) return { tipo: "sin-dato" };

  const unica = todas.length === 1 && fuera === 0;
  const van = (mes: string) =>
    serie.filter((m) => m.mes >= mes && m.mes <= hoyMes).reduce((s, m) => s + m.unidades, 0);
  const llegaronDesde = (mes: string) =>
    todas.filter((c) => c.fecha.slice(0, 7) >= mes).reduce((s, c) => s + c.unidades, 0);

  // El ANCLA: la llegada de la compra única, o — con varias — la primera
  // llegada dentro de los últimos 12 meses completos (la ventana de las
  // barras); si ninguna cae ahí, la más reciente.
  //
  // 🩸 Y EL ANCLA SE EXTIENDE HACIA ATRÁS si lo llegado desde ahí NO alcanza a
  // cubrir lo vendido desde ahí. El caso real que lo exige: NB3705906 tiene una
  // compra grande de jul-2024 (120 u) todavía viva y un refuerzo chico de
  // sep-2025 (20 u); anclado en sep, la línea decía "llegaron 20 · van
  // vendidas 36" — vendió más de lo que llegó, un número que se lee roto. Lo
  // que se vendió salió TAMBIÉN de la compra anterior, así que el grupo de
  // "compras vivas" es el SUFIJO que alcanza a cubrir las ventas: se retrocede
  // compra por compra hasta que llegaron ≥ van (o hasta la más vieja con
  // fecha). Sigue siendo agregado — nada se atribuye a una tanda.
  let mesAncla: string;
  if (unica) {
    mesAncla = todas[0].fecha.slice(0, 7);
  } else {
    const inicioVentana = restarMeses(hoyMes, MESES_VENTANA);
    const enVentana = todas.filter((c) => c.fecha.slice(0, 7) >= inicioVentana);
    // `todas` viene la más NUEVA primero.
    let idx = enVentana.length ? todas.indexOf(enVentana[enVentana.length - 1]) : 0;
    for (; idx < todas.length; idx += 1) {
      const mes = todas[idx].fecha.slice(0, 7);
      if (llegaronDesde(mes) >= van(mes) || idx === todas.length - 1) break;
    }
    mesAncla = todas[Math.min(idx, todas.length - 1)].fecha.slice(0, 7);
  }

  // 🔴 AGOTADO: stock 0 y vendió algo → el reloj se CIERRA en la última venta.
  // `existencia === 0` es la foto de Switch, no una deducción. La última venta
  // neta es el último mes con unidades NETAS > 0 (una devolución posterior no
  // "revive" la venta) y PUEDE ser el mes en curso: es un hecho, no un
  // promedio.
  //
  // ⚠️ Si una compra llegó DESPUÉS de la última venta (mercancía que llegó
  // tarde a un artículo que ya se había terminado de vender), el reloj igual
  // cierra en la última venta: el tiempo de venta es de lo que SE VENDIÓ. Hay
  // un test con ese borde.
  const vendidoTotal = art.cuadre?.vendido ?? null;
  if (art.existencia === 0 && vendidoTotal != null && vendidoTotal > 0) {
    const ultimaVenta = serie
      .filter((m) => m.unidades > 0 && m.mes <= hoyMes)
      .reduce<string | null>((max, m) => (max == null || m.mes > max ? m.mes : max), null);
    if (ultimaVenta != null) {
      const comprado = art.cuadre?.comprado ?? null;
      // El % real. Vendido > comprado (el caso TERMO: faltan compras EN
      // Switch) no es un % afirmable — la celda dice "—" y el aviso explica.
      const parte = comprado != null && comprado > 0 && vendidoTotal <= comprado ? vendidoTotal / comprado : null;
      return {
        tipo: "agotado",
        // INCLUSIVE, y nunca menos de 1: oct → nov son 2 meses.
        meses: Math.max(1, diffMeses(ultimaVenta, mesAncla) + 1),
        desdeMes: mesAncla,
        parte,
      };
    }
  }

  // VIVO (o agotado sin dato utilizable): el reloj corre.
  if (unica) {
    const total = todas[0].unidades;
    if (!(total > 0)) return { tipo: "sin-dato" };
    return {
      tipo: "en-curso",
      meses: diffMeses(hoyMes, mesAncla),
      parte: van(mesAncla) / total,
    };
  }
  return { tipo: "agregado", desdeMes: mesAncla, llegaron: llegaronDesde(mesAncla), van: van(mesAncla) };
}

/** El texto de la línea de venta, en español simple. `null` = no hay nada
 *  honesto que decir (la caja de Compras ya dijo lo suyo). */
export function textoAvance(n: LineaAvance): string | null {
  switch (n.tipo) {
    case "agotado": {
      const cuando = textoMeses(n.meses);
      const pct = n.parte == null ? null : Math.round(n.parte * 100);
      // Con el % real por debajo de 100 no se dice "todo": el resto no se
      // vendió (ajustes, robo) y los avisos lo explican. Con TERMO (parte
      // null: vendió MÁS de lo comprado) todo lo que llegó sí se fue.
      if (pct != null && pct < 100) return `Se vendió el ${pct}% en ${cuando}`;
      return `Se vendió todo en ${cuando}`;
    }
    case "en-curso": {
      const cuando = `En ${textoMeses(n.meses)}`;
      if (n.parte <= 0) return `${cuando} no se ha vendido nada de la compra`;
      const pct = Math.round(n.parte * 100);
      return pct < 1
        ? `${cuando} va menos del 1% de la compra`
        : `${cuando} va el ${pct}% de la compra`;
    }
    case "agregado":
      return n.van < 0
        ? `Desde ${fmtMesAnio(n.desdeMes)} llegaron ${fmtNum(n.llegaron)} u · van devueltas ${fmtNum(-n.van)}`
        : `Desde ${fmtMesAnio(n.desdeMes)} llegaron ${fmtNum(n.llegaron)} u · van vendidas ${fmtNum(n.van)}`;
    case "sin-dato":
      return null;
  }
}

/** La versión CORTA de la línea de venta — la usa la verificación contra
 *  producción (el modo pedido usa VENDIDO · MESES). */
export function textoAvanceCorto(n: LineaAvance): string {
  switch (n.tipo) {
    case "agotado":
      return textoMeses(n.meses);
    case "en-curso": {
      if (n.parte <= 0) return "va 0%";
      const pct = Math.round(n.parte * 100);
      return pct < 1 ? "va <1%" : `va el ${pct}%`;
    }
    case "agregado":
      return n.van < 0 ? `devueltas ${fmtNum(-n.van)}` : `van ${fmtNum(n.van)} de ${fmtNum(n.llegaron)}`;
    case "sin-dato":
      return "—";
  }
}

// ─── VENDIDO · MESES: las dos celdas del modo pedido ─────────────────────────
//
// 🔴 REEMPLAZAN A LA COLUMNA "90% en" (12-ago-2026). Daniel, sobre la tabla del
// modo pedido: "va el 29%" no dice CUÁNTO TIEMPO lleva — y sin el tiempo el %
// no alcanza para decidir una compra. Ahora son dos columnas:
//
//   CÓDIGO       COMPRÉ VENDÍ STOCK  VENDIDO  MESES
//   4F5003G001     48    14    34      29%      8     ← vivo (gris)
//   4K5026G102     24    24     0     100%      3     ← agotado (negro)
//
//   · VENDIDO es SIEMPRE el % REAL: Vendí ÷ Compré (los TOTALES de los tres
//     grandes, redondeado a entero al mostrar). 🩸 La versión anterior lo
//     congelaba en "90%" al cruzar, y Daniel cazó la contradicción en la
//     muestra (12-ago-2026): *"como stock 0 y vendido 90%?"* — con la bodega
//     en cero el % que se lee tiene que ser 100.
//   · MESES = el tiempo de venta de `medirAvance`: AGOTADO (stock 0) = hasta
//     su última venta, CERRADO ahí (la cola de bodega no infla el tiempo);
//     vivo = meses calendario desde la llegada — la MISMA ancla de la ficha
//     (`medirRitmo`): la única compra, o el ancla EXTENDIDA con varias. El mes
//     en curso sigue fuera de todo promedio, pero los meses TRANSCURRIDOS y la
//     última venta cuentan el calendario real (y una venta de hoy sí mueve
//     el %: Vendí es el neto histórico).
//   · SIN DATO: la celda que no se puede afirmar dice "—", nunca se inventa.
//     Sin compra con fecha → las dos en "—". Vendido > comprado (el caso TERMO:
//     faltan compras EN Switch) o negativo → el % sería mentira, pero los meses
//     de venta SÍ se saben y se dicen.
//
// UNA función para pantalla y Excel: si cada una hiciera su cuenta, la tabla y
// la planilla dirían dos cosas distintas de la misma fila.

export interface VendidoMeses {
  /** La celda VENDIDO: el % REAL (Vendí ÷ Compré), como fracción 0-1.
   *  `null` = "—": no hay porcentaje honesto que afirmar. */
  parte: number | null;
  /** La celda MESES (meses calendario, enteros): hasta la última venta si está
   *  agotado (cerrados), o desde la llegada si sigue vivo. `null` = "—". */
  meses: number | null;
  /** `true` = AGOTADO: el tiempo quedó cerrado en la última venta, va en
   *  negro. `false` = en curso, va en gris. */
  terminado: boolean;
}

export function medirVendidoMeses(
  f: Pick<FichaArticulo, "grandes" | "avance" | "ritmo"> & Partial<Pick<FichaArticulo, "tandas">>,
): VendidoMeses {
  // 🔴 Con 2+ TANDAS las dos celdas son DE LA TANDA ACTUAL (la regla de
  // Daniel, 12-ago-2026): VENDIDO = vendido_en_tanda ÷ comprado_en_tanda
  // (100% si se agotó) y MESES = el tiempo de ESA tanda — cerrado en su última
  // venta si la bodega quedó en 0, corriendo si sigue viva. Una sola función
  // para ficha, tabla del modo pedido y Excel, como siempre.
  const actual = f.tandas && f.tandas.length >= 2 ? f.tandas[f.tandas.length - 1] : null;
  if (actual) {
    // Los mismos números que los grandes de la ficha (que desde el 12-ago-2026
    // también son de la llegada): Compré/Vendí de arriba y este % dicen lo
    // mismo, por construcción.
    return { parte: parteDeTanda(actual), meses: actual.meses, terminado: actual.cerrada };
  }
  const { comprado, vendido } = f.grandes;
  // 🔴 El % es SIEMPRE el real (Vendí ÷ Compré) — Daniel: *"como stock 0 y
  // vendido 90%?"*. Un vendido negativo ("el −5% de lo comprado") o mayor que
  // lo comprado (TERMO) no es un % afirmable.
  const parte =
    comprado != null && comprado > 0 && vendido >= 0 && vendido <= comprado
      ? vendido / comprado
      : null;
  // Agotado: los MESES quedan cerrados en la última venta. `avance.meses` no
  // es "cuánto lleva en bodega" — la cola no cuenta.
  if (f.avance.tipo === "agotado") {
    return { parte, meses: f.avance.meses, terminado: true };
  }
  // `ritmo.meses` ya es la ancla de la ficha: llegada de la única compra, o el
  // ancla EXTENDIDA del agregado. No se inventa una segunda.
  return { parte, meses: f.ritmo.meses, terminado: false };
}

/** "29%" / "0%" / "100%" / "—" — el texto de la celda VENDIDO. */
export function textoVendidoCelda(v: VendidoMeses): string {
  if (v.parte == null) return "—";
  return `${Math.round(v.parte * 100)}%`;
}

/** "8" / "0" / "—" — el texto de la celda MESES. */
export function textoMesesCelda(v: VendidoMeses): string {
  return v.meses == null ? "—" : fmtNum(v.meses);
}

// ─── El RITMO: unidades por mes DESDE QUE LLEGÓ la mercancía ─────────────────
//
// 🔴 LA BASE ES LA LLEGADA, NO UNA VENTANA APARTE (12-ago-2026). Daniel,
// textual: *"¿cuántas unidades vendo al mes desde que llegó?"*. El caso que lo
// fijó: 4D5077G001 llegó el 29-mar-2026 (36 u), lleva 5 meses en bodega y
// vendió 18 netas → **3.6 u/mes** — la ventana de 12 meses decía "6 u por mes",
// que sale de otra base y no contesta su pregunta.
//
// El ancla es LA MISMA de la línea de venta (`medirAvance`): compra única = su
// llegada; varias compras = el ancla del agregado ("Desde oct 2025 llegaron
// 360…"). Si el ritmo usara otra ventana que el avance, las dos líneas se
// desmentirían entre sí. Sin compra registrada se cae al promedio de los 12
// meses completos, DICIÉNDOLO.
//
// Y el número grande de la fila de KPIs es LOS MESES — Daniel: *"que me diga
// cuanto tiempo lleva alado de los 3 kpi. deberia de ser: compre, vendi, stock,
// meses (de venta) y abajo u/mes"*. El u/mes va abajo, en la línea secundaria.

export interface RitmoVenta {
  /** Meses de venta — el CUARTO número grande. Para un artículo AGOTADO son
   *  los meses QUE TARDÓ (hasta su última venta). `null` = sin fecha. */
  meses: number | null;
  /** Unidades netas por mes sobre esos meses. `null` = no se puede decir. */
  porMes: number | null;
  /** `agotado` = stock 0: el tiempo quedó CERRADO en la última venta.
   *  `tanda-viva` = 2+ tandas y la actual sigue viva: el reloj es EL DE ELLA. */
  base: "agotado" | "unica-viva" | "agregado" | "ventana-12" | "tanda-viva" | null;
  /** El mes del ancla (llegada o inicio del agregado). */
  desdeMes: string | null;
}

export function medirRitmo(
  art: Pick<ArticuloCompras, "compras" | "serie">,
  hoyMes: string,
  avance: LineaAvance,
  promedio: Promedio,
  tandas: MedidaTandas | null = null,
): RitmoVenta {
  // 🔴 Con 2+ TANDAS: los MESES son los de la tanda ACTUAL, y el "vendo por
  // mes" EXCLUYE los meses sin mercancía (además del mes en curso, como
  // siempre) — el caso de la captura: 61 vendidas ÷ 7 meses CON stock = 8.7,
  // no 61 ÷ 10 = 6.1 "sumando y aplazando" los meses de bodega vacía. Es el
  // MISMO timeline de tandas, no una segunda cuenta.
  const actual = tandas && tandas.tandas.length >= 2 ? tandas.tandas[tandas.tandas.length - 1] : null;
  if (actual && tandas) {
    return {
      meses: actual.meses,
      porMes: tandas.vendidas > 0 && tandas.mesesConStock > 0 ? tandas.vendidas / tandas.mesesConStock : null,
      base: actual.cerrada ? "agotado" : "tanda-viva",
      desdeMes: actual.desdeMes,
    };
  }
  const serie = art.serie ?? [];
  const vanDesde = (mes: string) =>
    serie.filter((m) => m.mes >= mes && m.mes <= hoyMes).reduce((s, m) => s + m.unidades, 0);
  const llegada = (art.compras ?? [])[0]?.fecha.slice(0, 7) ?? null;

  switch (avance.tipo) {
    case "agotado": {
      // Artículo agotado: el ritmo es el de MIENTRAS se vendía — lo vendido
      // desde el ancla ÷ los meses hasta la última venta. Dividir entre los
      // meses en bodega diluiría el ritmo con los meses posteriores al agote.
      const van = vanDesde(avance.desdeMes);
      const divisor = Math.max(1, avance.meses);
      return {
        meses: avance.meses,
        porMes: van > 0 ? van / divisor : null,
        base: "agotado",
        desdeMes: avance.desdeMes,
      };
    }
    case "en-curso": {
      const van = llegada != null ? vanDesde(llegada) : 0;
      return {
        meses: avance.meses,
        porMes: avance.meses > 0 && van > 0 ? van / avance.meses : null,
        base: "unica-viva",
        desdeMes: llegada,
      };
    }
    case "agregado": {
      const meses = diffMeses(hoyMes, avance.desdeMes);
      return {
        meses,
        porMes: meses > 0 && avance.van > 0 ? avance.van / meses : null,
        base: "agregado",
        desdeMes: avance.desdeMes,
      };
    }
    case "sin-dato":
      return {
        meses: null,
        porMes: promedio.porMes,
        base: promedio.porMes != null ? "ventana-12" : null,
        desdeMes: null,
      };
  }
}

/** "3.6" / "9.6" / "28": un decimal por debajo de 10 (ahí el decimal decide),
 *  entero de 10 para arriba (ahí es ruido). */
export function fmtRitmo(porMes: number): string {
  if (porMes >= 10) return fmtNum(porMes);
  const r = Math.round(porMes * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "Vendo 3.6 u por mes" — la primera parte de la línea secundaria. `null` =
 *  sin ventas (no se dice "Vendo 0"). */
export function textoVendoPorMes(porMes: number | null): string | null {
  if (porMes == null || !(porMes > 0)) return null;
  if (porMes < 0.05) return "Vendo menos de 0.1 u por mes";
  return `Vendo ${fmtRitmo(porMes)} u por mes`;
}

/** La línea secundaria completa, tal como se lee bajo los cuatro grandes:
 *  "Vendo 3.6 u por mes · En 5 meses va el 50% de la compra" / "Vendo 18 u por
 *  mes · Se vendió todo en 2 meses". Pantalla y verificación comparan contra
 *  ESTO — una sola definición. */
export function textoLineaVenta(
  n: LineaAvance,
  ritmo: RitmoVenta,
  tandas: readonly Tanda[] | null = null,
): string | null {
  const vendo = textoVendoPorMes(ritmo.porMes);
  // Cuando el ritmo NO sale de la llegada (sin compra registrada), se dice de
  // dónde sale — un número con otra base sin rotular sería una mentirita.
  const vendoRotulado =
    vendo && ritmo.base === "ventana-12" ? `${vendo} (promedio de los últimos 12 meses)` : vendo;
  // 🔴 Con 2+ llegadas sobre bodega en 0, la línea es la FECHA de la última
  // llegada + el ritmo: "Llegaron 36 u en mar 2026 · vendo 8.7 u por mes". El
  // % y los meses NO se repiten acá — son los números grandes de arriba. La
  // historia (la anterior + cuántas más) va en OTRA línea, gris
  // (`textoLlegadaAnterior`) — acá no entra.
  if (tandas && tandas.length >= 2) {
    const frase = fraseLlegadaActual(tandas[tandas.length - 1]);
    return vendo ? `${frase} · ${vendo.charAt(0).toLowerCase()}${vendo.slice(1)}` : frase;
  }
  const partes = [vendoRotulado, textoAvance(n)].filter((t): t is string => t != null);
  return partes.length ? partes.join(" · ") : null;
}

/** El valor del cuarto número grande ("Meses"). */
export function valorGrandeMeses(r: RitmoVenta): string {
  return r.meses == null ? "—" : fmtNum(r.meses);
}

/** El pie del cuarto número grande. Corto a propósito (vive bajo un 34 px). */
export function pieGrandeMeses(r: RitmoVenta): string {
  switch (r.base) {
    case "agotado":
      // El reloj quedó cerrado en la última venta (la cola no cuenta).
      return "en venderse";
    case "unica-viva":
      return "de venta";
    case "tanda-viva":
      // La bodega tocó 0 en el medio: el reloj es el de la ÚLTIMA llegada
      // sobre bodega vacía, y el pie dice desde cuándo corre (redacción
      // aprobada por Daniel — la palabra "tanda" no existe en pantalla).
      return r.desdeMes ? `de venta · desde ${fmtMesAnio(r.desdeMes)}` : "de venta";
    case "agregado":
      return r.desdeMes ? `de venta, desde ${fmtMesAnio(r.desdeMes)}` : "de venta";
    default:
      return "sin fecha de llegada";
  }
}

// ─── La VISTA de las barras: ancladas a la llegada ───────────────────────────
//
// 🔴 CON UNA SOLA COMPRA las barras arrancan EL MES QUE LLEGÓ la mercancía, no
// "los últimos 12 meses", y debajo corre el ACUMULADO: compré 120, ¿en cuánto
// se me van? — contestado mes a mes (mockup aprobado). CON VARIAS compras se
// quedan los últimos 12 meses y cada llegada se marca con ▲ bajo su mes.
//
// El mes EN CURSO sigue sin dibujarse (regla de la casa); el "van vendidas" del
// subtítulo sí lo incluye, porque es un acumulado y no un promedio.

export interface VistaBarras {
  modo: "desde-llegada" | "ultimos-12";
  barras: MesBarra[];
  /** Acumulado de ventas netas desde la llegada, una cifra por barra.
   *  Solo en modo desde-llegada. */
  acumulado: number[] | null;
  /** La compra que ancla la vista (solo desde-llegada). */
  llegada: Compra | null;
  /** true = la compra lleva más de 12 meses: se muestran los PRIMEROS 12. */
  recortada: boolean;
  /** Vendidas desde la llegada (mes en curso incluido). Solo desde-llegada. */
  vanVendidas: number | null;
  /** Llegadas dentro de la ventana (solo ultimos-12), por mes, la más vieja
   *  primero. `cantidades` = las unidades de cada llegada de ese mes. */
  llegadas: { mes: string; cantidades: number[] }[];
}

export function vistaDeBarras(
  art: Pick<ArticuloCompras, "compras" | "comprasFueraDeVentana" | "serie">,
  hoyMes: string,
): VistaBarras {
  const todas = art.compras ?? [];
  const fuera = art.comprasFueraDeVentana ?? 0;
  const serie = art.serie ?? [];
  const porMes = new Map(serie.map((s) => [s.mes, s]));

  const unica = todas.length === 1 && fuera === 0;
  if (unica) {
    const compra = todas[0];
    const mesLlegada = compra.fecha.slice(0, 7);
    const ultimoCompleto = restarMeses(hoyMes, 1);
    const span = mesLlegada <= ultimoCompleto ? diffMeses(ultimoCompleto, mesLlegada) + 1 : 0;
    if (span >= 1) {
      const n = Math.min(span, MESES_VENTANA);
      const barras: MesBarra[] = [];
      const acumulado: number[] = [];
      let acum = 0;
      for (let i = 0; i < n; i += 1) {
        const mes = restarMeses(mesLlegada, -i);
        const fila = porMes.get(mes);
        acum += fila?.unidades ?? 0;
        barras.push({
          mes,
          unidades: fila?.unidades ?? 0,
          venta: fila?.venta ?? 0,
          fuerte: MESES_FUERTES.includes(Number(mes.slice(5, 7))),
          // Desde que llegó, la mercancía ESTÁ en la calle: un mes sin ventas
          // acá es un cero de verdad, no un "antes de empezar".
          antesDeEmpezar: false,
        });
        acumulado.push(acum);
      }
      const vanVendidas = serie
        .filter((m) => m.mes >= mesLlegada && m.mes <= hoyMes)
        .reduce((s, m) => s + m.unidades, 0);
      return {
        modo: "desde-llegada",
        barras,
        acumulado,
        llegada: compra,
        recortada: span > MESES_VENTANA,
        vanVendidas,
        llegadas: [],
      };
    }
    // Llegó en el mes en curso: todavía no hay ningún mes completo que anclar.
  }

  const barras = barrasDeVentana(serie, hoyMes);
  const meses = new Set(barras.map((b) => b.mes));
  const llegadasPorMes = new Map<string, number[]>();
  // `todas` viene la más NUEVA primero; la leyenda va de la más vieja a la más
  // nueva, como se leen las barras.
  for (const c of [...todas].reverse()) {
    const mes = c.fecha.slice(0, 7);
    if (!meses.has(mes)) continue;
    llegadasPorMes.set(mes, [...(llegadasPorMes.get(mes) ?? []), c.unidades]);
  }
  return {
    modo: "ultimos-12",
    barras,
    acumulado: null,
    llegada: null,
    recortada: false,
    vanVendidas: null,
    llegadas: [...llegadasPorMes.entries()]
      .map(([mes, cantidades]) => ({ mes, cantidades }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

/** "Desde que llegó · 23 oct 2025 · 120 u" — el título del modo anclado. */
export function tituloDesdeLlegada(c: Compra): string {
  return `Desde que llegó · ${fmtFechaCorta(c.fecha)} · ${fmtNum(c.unidades)} u`;
}

/** "10 meses en bodega · van vendidas 96 de 120" (+ el aviso del recorte). */
export function subDesdeLlegada(v: VistaBarras, hoyMes: string): string | null {
  if (v.modo !== "desde-llegada" || !v.llegada) return null;
  const meses = diffMeses(hoyMes, v.llegada.fecha.slice(0, 7));
  const partes = [
    `${textoMeses(meses)} en bodega`,
    `van vendidas ${fmtNum(v.vanVendidas ?? 0)} de ${fmtNum(v.llegada.unidades)}`,
  ];
  if (v.recortada) partes.push("se muestran los primeros 12 meses");
  return partes.join(" · ");
}

/** "▲ oct: llegaron 60 u · ▲▲ feb: llegaron 120 y 180 u" — la leyenda de las
 *  llegadas marcadas. `null` = ninguna llegada cae en la ventana. */
export function leyendaLlegadas(llegadas: VistaBarras["llegadas"]): string | null {
  if (!llegadas.length) return null;
  return llegadas
    .map(
      (l) =>
        `${"▲".repeat(Math.min(l.cantidades.length, 3))} ${fmtMesCorto(l.mes)}: llegaron ${l.cantidades
          .map((c) => fmtNum(c))
          .join(" y ")} u`,
    )
    .join(" · ");
}

// ─── El margen REAL ──────────────────────────────────────────────────────────

/**
 * 🔴 EL MARGEN VA CONTRA EL CIF, NO CONTRA EL FOB. Las tres razones:
 *
 *  1. **El FOB no es confiable.** En el 93% de las líneas Switch lo manda IGUAL
 *     al CIF — error de carga conocido, medido y sin corregir. Un margen "sobre
 *     FOB" sería el margen sobre CIF disfrazado en el 93% de los artículos y
 *     otro número distinto en el 7% restante: la MISMA columna significando dos
 *     cosas según el artículo, que es peor que no tenerla.
 *  2. **El CIF es lo que costó de verdad** poner la pieza en la bodega de
 *     Panamá (mercancía + flete + seguro). El FOB deja el flete afuera, así que
 *     un margen sobre FOB sale siempre MÁS ALTO que el real — y este número
 *     existe justo para frenar una compra, no para que se vea mejor.
 *  3. **El CIF está en casi todas las líneas.** Donde Switch no desglosa
 *     (Fashion Shoes) el valor único ES el CIF; el FOB de ahí está ESTIMADO
 *     (CIF ÷ 1,1), o sea que un margen sobre FOB sería un margen sobre un
 *     número que nos inventamos nosotros.
 *
 * El costo es el de la ÚLTIMA compra: es contra ese que se decide reponer, y es
 * el mismo que la fila de costos muestra como "CIF de hoy".
 */
export type MotivoSinMargen = "sin-costo" | "sin-ventas" | "precio-no-positivo";

export interface MargenReal {
  /** venta neta ÷ unidades netas de la ventana. A cuánto salió DE VERDAD —
   *  con los descuentos ya adentro, que es lo que el precio de lista no dice. */
  precioReal: number | null;
  /** CIF de la última compra. */
  costo: number | null;
  /** (precio − costo) ÷ precio. `null` = no se puede calcular con confianza. */
  margen: number | null;
  /** `null` = sí se pudo calcular. */
  motivo: MotivoSinMargen | null;
}

/**
 * Precio real promedio, costo y margen.
 *
 * 🩸 CUANDO NO SE PUEDE, SE DICE. Un margen dudoso en la pantalla con la que se
 * decide una compra es peor que un hueco: el hueco se ve, el número malo no.
 */
export function margenReal(
  ventaNeta: number,
  unidadesNetas: number,
  cif: number | null,
): MargenReal {
  if (unidadesNetas <= 0) {
    return { precioReal: null, costo: cif, margen: null, motivo: "sin-ventas" };
  }
  const precioReal = ventaNeta / unidadesNetas;
  if (precioReal <= 0) {
    return { precioReal, costo: cif, margen: null, motivo: "precio-no-positivo" };
  }
  if (cif == null || cif <= 0) {
    return { precioReal, costo: null, margen: null, motivo: "sin-costo" };
  }
  return { precioReal, costo: cif, margen: (precioReal - cif) / precioReal, motivo: null };
}

/** Por qué no hay margen, en español simple y sin jerga. */
export function textoSinMargen(m: MotivoSinMargen, mesesVentana: number): string {
  switch (m) {
    case "sin-costo":
      return "No se puede calcular el margen: la última compra no trae el costo CIF.";
    case "sin-ventas":
      return `No se puede calcular el margen: no vendió nada en ${mesesVentana === 1 ? "el último mes" : `los últimos ${mesesVentana} meses`}, así que no hay precio real.`;
    case "precio-no-positivo":
      return "No se puede calcular el margen: las devoluciones dejaron la venta del período en cero o en negativo.";
  }
}

// ─── Temporada fuerte ────────────────────────────────────────────────────────

export interface Temporada {
  /** Unidades de oct + nov + dic dentro de la ventana. */
  unidades: number;
  /** Unidades de los 12 meses. */
  total: number;
  /** unidades ÷ total. `null` si el total no es positivo. */
  parte: number | null;
  /** `true` = ninguno de sus oct/nov/dic ocurrió todavía (artículo nuevo). */
  todaviaNoPaso: boolean;
}

export function temporadaFuerte(barras: readonly MesBarra[]): Temporada {
  const fuertes = barras.filter((b) => b.fuerte);
  const unidades = fuertes.reduce((s, b) => s + b.unidades, 0);
  const total = barras.reduce((s, b) => s + b.unidades, 0);
  return {
    unidades,
    total,
    parte: total > 0 ? unidades / total : null,
    todaviaNoPaso: fuertes.length > 0 && fuertes.every((b) => b.antesDeEmpezar),
  };
}

// ─── La caja de COMPRAS ──────────────────────────────────────────────────────
//
// 🔴 FECHA Y CANTIDAD. NADA MÁS. Es la primera caja de la tarjeta y su trabajo
// es NO opinar: la más reciente arriba, una línea por llegada.
//
// 🩸 LO QUE HABÍA ACÁ ERA "Mi última compra · todavía no se acaba · llegó 180 el
// 19 feb · van 0". Ese "van 0" salía de repartir las ventas entre las compras
// (FIFO), y cuando la mercancía llega sobre stock que todavía no se acaba ese
// reparto es INVENTADO: nadie marcó las cajas. En el artículo que Daniel más
// mira (`NB2570001`, tres compras recientes) la caja terminaba diciendo
// literalmente "van 0 de 180" mientras el artículo vendía 28 u/mes — cero
// información, y en el lugar más visible de la pantalla. Daniel: *"no quiero
// que decidas tu, lo decido yo con la data que me extraigas"*.
//
// La línea "Esta: … · Anterior: …" se fue por lo mismo: nacía del mismo reparto.

/** Cuántas compras se ven sin desplegar nada.
 *
 *  Cuatro es lo que aprobó el mockup, y es lo que cabe sin empujar a los otros
 *  dos números: la caja crece HACIA ABAJO y a 390 px las tres van una debajo de
 *  otra. Lo que se está decidiendo es REPONER, y para eso pesan las últimas; el
 *  resto sigue alcanzable de un toque. */
export const COMPRAS_VISIBLES = 4;

export interface ListaCompras {
  /** Las que se ven: hasta COMPRAS_VISIBLES, la más nueva primero. */
  visibles: Compra[];
  /**
   * Cuántas compras más hay, TODAS juntas: las que quedaron fuera de las
   * visibles y las de más de 3 años.
   *
   * 🔴 UN SOLO NÚMERO, Y NO SE DESPLIEGA. Antes eran dos renglones distintos —un
   * botón "Ver 1 compra más" y un texto "y 2 más de hace años"— porque las
   * primeras venían en el payload y las segundas no. Esa diferencia es NUESTRA,
   * no de Daniel: él ve cuatro fechas y quiere saber cuántas hay detrás. Se
   * juntan en una línea gris, sin enlace.
   */
  restantes: number;
  /** `true` = en toda la historia registrada hay UNA sola compra. La caja lo
   *  dice ("única compra") en vez de dejar una línea suelta sin contexto. */
  unica: boolean;
}

/**
 * Parte las compras del artículo en lo que se ve y lo que solo se cuenta.
 *
 * `art.compras` ya viene con la MÁS NUEVA PRIMERO y recortada a 3 años por
 * `armarArticulo()`: acá no se reordena ni se vuelve a recortar por fecha.
 */
export function listaDeCompras(
  art: Pick<ArticuloCompras, "compras" | "comprasFueraDeVentana">,
  tope: number = COMPRAS_VISIBLES,
): ListaCompras {
  const todas = art.compras ?? [];
  const masViejas = art.comprasFueraDeVentana ?? 0;
  return {
    visibles: todas.slice(0, tope),
    restantes: Math.max(0, todas.length - tope) + masViejas,
    unica: todas.length === 1 && masViejas === 0,
  };
}

/** "19 feb 2026 · 180 u" — una línea de la caja de Compras. */
export function textoCompra(c: Compra): string {
  return `${fmtFechaCorta(c.fecha)} · ${fmtNum(c.unidades)} u`;
}

/** "y 3 compras más" — la línea gris del final. `null` = no hay ninguna más y
 *  no se dibuja nada (una línea que dice "y 0" es ruido). */
export function textoRestantes(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "y 1 compra más" : `y ${n} compras más`;
}

// ─── La fila de plata: UNA sola línea, agrupada con lógica ───────────────────
//
// 🩸 EL MISMO NÚMERO APARECÍA TRES VECES. La tarjeta tenía dos filas: una decía
// "Vendí a · me costó · margen" y la de abajo repetía "CIF de hoy" (el mismo
// "me costó") y "FOB" (que Switch manda IGUAL al CIF en el 93% de las líneas).
// O sea que en `NB2570001` el $16.56 se leía TRES veces seguidas. Daniel: *"me
// gusta pero no se siente simple, facil"*. Ahora es UNA fila, y desde el
// 12-ago-2026 va AGRUPADA — Daniel: *"precio prom y precio lista porque estan
// separado"*:
//
//   Precio prom $26.92 · lista $27.00 | Costo CIF $16.56 · FOB $15.05 | margen 39%
//
// Los precios juntos (¿estoy descontando?), los costos juntos (¿cuánto me
// cuesta?), el margen al final.
//
// 🔴 EL COSTO FOB SIGUE SIENDO UNA CUENTA NUESTRA, NO UN DATO DE SWITCH. Daniel
// lo pidió así, textual: *"pon costo fob (calcula fob/1.1)"*. El FOB que manda
// Switch llega igual al CIF en 93 de cada 100 líneas por un error de carga
// conocido, o sea que no distingue nada. La palabra "(calculado)" SE FUE del
// rótulo —Daniel: *"la palabra calculado esta de mas"*— y la explicación de que
// es CIF ÷ 1,10 vive en el ⓘ de la fila. Se reusa `fobEstimado()` de
// `referencia-info`, que ya es la ÚNICA definición de esta división en el repo
// (CIF ÷ 1,10, nunca CIF × 0,9: no es la inversa y da otro número).

/** El costo de la compra ANTERIOR, y para qué lado se movió. */
export interface CambioDeCosto {
  /** CIF de la compra anterior. */
  anterior: number;
  /** `true` = el costo de hoy es MAYOR que el de la compra anterior. */
  subio: boolean;
}

/**
 * El CIF anterior, SOLO si es distinto al de hoy.
 *
 * 🔴 SI NO CAMBIÓ, NO SE MUESTRA NADA. La columna fija "CIF de la compra
 * anterior" repetía el mismo número en la enorme mayoría de los artículos —
 * relleno. Lo que importa es la SEÑAL: te subieron el costo.
 *
 * ⚠️ Se compara a la precisión que se MUESTRA (centavos). Los costos son
 * promedios ponderados de varias líneas, así que dos compras "iguales" pueden
 * diferir en la milésima; anunciar "(antes $16.56)" al lado de "$16.56" sería
 * una señal que no señala nada.
 */
export function cambioDeCosto(cif: number | null, cifAnterior: number | null): CambioDeCosto | null {
  if (cif == null || cifAnterior == null) return null;
  const a = centavos(cif);
  const b = centavos(cifAnterior);
  if (a == null || b == null || a === b) return null;
  return { anterior: cifAnterior, subio: a > b };
}

// ─── La ficha completa ───────────────────────────────────────────────────────

export interface FichaArticulo {
  /** Compré · Vendí · Stock — los primeros tres grandes. Con 2+ llegadas sobre
   *  bodega en 0, Compré y Vendí son de la ÚLTIMA (y el histórico viaja en
   *  `grandes.historico`); Stock es SIEMPRE la existencia real. */
  grandes: TresGrandes;
  /** La línea de venta: cuánto tiempo de venta tiene y qué % va. */
  avance: LineaAvance;
  /** El CUARTO grande (Meses) y el "Vendo X u por mes" de la línea secundaria:
   *  meses y unidades por mes DESDE LA LLEGADA (la misma ancla del avance). */
  ritmo: RitmoVenta;
  /** La vista de las barras: anclada a la llegada o últimos 12 meses. */
  vista: VistaBarras;
  barras: MesBarra[];
  promedio: Promedio;
  /** Meses que alcanza el stock al ritmo desde la llegada. Ya no es una caja:
   *  queda para el Excel. `null` = no se puede decir. */
  alcance: number | null;
  margen: MargenReal;
  temporada: Temporada;
  /** La caja de Compras: fecha y cantidad, sin una sola conclusión. */
  compras: ListaCompras;
  /** La compra más reciente. `null` = no hay ninguna registrada.
   *  ⚠️ Se usa SOLO para el COSTO (el CIF contra el que se calcula el margen y
   *  la fila de costos). No se le atribuye ninguna venta. */
  ultima: Compra | null;
  /** La inmediatamente anterior — solo para saber si el costo cambió. */
  anterior: Compra | null;
  /** Costo FOB CALCULADO (CIF ÷ 1,10). No es el FOB de Switch. */
  fobCalculado: number | null;
  /** El CIF anterior, solo si difiere del de hoy. `null` = no cambió (o no hay
   *  compra anterior) y no se muestra nada. */
  cambioCosto: CambioDeCosto | null;
  /** Las TANDAS (episodios entre ceros de bodega), la más vieja primero.
   *  `null` = una sola tanda o timeline no afirmable: TODO como siempre.
   *  Con 2+, `avance`/`ritmo`/VENDIDO·MESES ya vienen medidos sobre la ACTUAL. */
  tandas: Tanda[] | null;
}

/**
 * Arma todo lo que la pantalla (y el Excel) muestran de un artículo.
 *
 * `art.compras` viene con la MÁS NUEVA PRIMERO (así la arma `armarArticulo`).
 */
export function armarFicha(art: ArticuloCompras, hoyMes: string): FichaArticulo {
  // `serie ?? []` no es paranoia: una respuesta cacheada por un deploy anterior
  // (o un artículo sin una sola venta) llega sin ella, y las barras vacías son
  // una degradación honesta — reventar la pantalla entera no lo sería.
  const barras = barrasDeVentana(art.serie ?? [], hoyMes);
  const promedio = promedioMensual(barras);
  // `compras ?? []` cubre lo mismo que `serie ?? []`: una respuesta vieja
  // cacheada tras un deploy. Degradar es honesto; reventar la pantalla no.
  const todas = art.compras ?? [];
  const ultima = todas[0] ?? null;
  const anterior = todas[1] ?? null;
  const cif = ultima?.costos.cif ?? null;
  // Las tandas solo mandan cuando hay 2+ y el timeline es afirmable; con una
  // sola (o `null`) medirAvance/medirRitmo se comportan EXACTAMENTE como antes.
  const medidaTandas = medirTandas(art, hoyMes);
  const tandasActivas = medidaTandas && medidaTandas.tandas.length >= 2 ? medidaTandas : null;
  const avance = medirAvance(art, hoyMes, tandasActivas);
  const ritmo = medirRitmo(art, hoyMes, avance, promedio, tandasActivas);

  return {
    // 🔴 Con 2+ llegadas, Compré y Vendí son de la ACTUAL (Stock NO: es la
    // existencia real de bodega). Se le pasa la MISMA medida que ya usan el
    // avance y el ritmo — una sola cuenta de llegadas para toda la ficha.
    grandes: tresGrandes(art, tandasActivas),
    avance,
    ritmo,
    tandas: tandasActivas ? tandasActivas.tandas : null,
    vista: vistaDeBarras(art, hoyMes),
    barras,
    promedio,
    // El alcance usa el MISMO ritmo que la pantalla declara — dos bases para
    // "cuánto me dura" serían dos verdades.
    alcance: mesesDeStock(art.existencia, ritmo.porMes),
    margen: margenReal(promedio.venta, promedio.unidades, cif),
    temporada: temporadaFuerte(barras),
    compras: listaDeCompras(art),
    ultima,
    anterior,
    fobCalculado: fobEstimado(cif),
    cambioCosto: cambioDeCosto(cif, anterior?.costos.cif ?? null),
  };
}
