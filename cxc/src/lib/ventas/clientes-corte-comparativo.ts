// ─────────────────────────────────────────────────────────────────────────────
// LA DEFINICIÓN ÚNICA DEL CORTE: hasta qué día se suma el PERÍODO ANTERIOR
// cuando el actual todavía no cerró.
//
// Nació el 3-sep-2026 para Ventas › Clientes (de ahí el nombre del archivo) y
// ese mismo día pasó a ser la referencia de TODAS las comparaciones «vs año
// pasado» del sistema: Ventas › Resumen (Anual y Mes×año, vía la RPC
// `ventas_dashboard_prev_same_period_v3`), Vista General › Ventas, Ventas ›
// Productos, Multifashion › Productos (`rangoComparativo`) y Clientes. Es el
// espejo en TS de la regla que vive en SQL (`clientes_empresa_12m_vw`,
// `clientes_anio()` y la RPC de Resumen). jsdom no ejecuta Postgres: estas
// funciones son la referencia con la que los candados fijan la regla con
// fechas fijas, y la que usan los scripts de medición contra producción. Si el
// SQL y esto dicen cosas distintas, el que está mal es el que se apartó de la
// regla.
//
// 🩸 LA REGLA: **un período empezado se compara contra los MISMOS DÍAS del año
// pasado, con la fecha de Panamá.** Una auditoría medida contra producción el
// 3-sep-2026 encontró SEIS pantallas que no la cumplían, cada una a su manera:
// el Anual comparaba 2026 hasta hoy contra ene–sep ENTERO de 2025 (el grupo
// decía −7,0% y crecía +2,5%); Mes×año y Vista General comparaban lo que va del
// mes contra el mes ENTERO (Boston −93,5% en pantalla, +2,2% real); Productos
// cortaba el año pasado en HOY cuando `switch_articulo_diario` llega hasta AYER
// (Multifashion +4,2% en pantalla, +46,1% real); y la RPC de Resumen cortaba en
// UTC (Fashion Wear la noche del 12-may: +1,3% en pantalla, +45,1% real).
//
//   corte      = el último día con datos cargados del período en curso,
//                nunca después de HOY en Panamá
//   cortePrev  = la misma fecha, un año antes (29-feb → 28-feb)
//
// · «Último día cargado» y no «hoy» porque las fuentes llegan con atraso: la
//   vista de Clientes se refresca a las 02:35 de Panamá y `switch_articulo_
//   diario` se carga a las 03:40 — a esa hora el período en curso llega hasta
//   AYER, y cortar el año pasado en «hoy» le regala un día. Si el sync se
//   atrasa, las dos ventanas se acortan JUNTAS.
// · Con tope en HOY para que una factura con fecha futura no corra el corte.
// · HOY es el día de PANAMÁ (UTC−5 fijo): entre las 7 p.m. y la medianoche el
//   reloj UTC ya está en mañana.
// · Un período CERRADO no tiene caso especial: su corte es su último día y un
//   año antes es el mismo día del año anterior — entero contra entero.
// ─────────────────────────────────────────────────────────────────────────────

import { hoyPanama } from "@/lib/fecha-panama";

/** Último día del mes (1..31). Aritmética en UTC, sin zona horaria local. */
function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const dd2 = (n: number): string => String(n).padStart(2, "0");

/**
 * La misma fecha un año antes. El 29-feb cae en el 28 del año no bisiesto.
 *
 * Es el criterio con el que TODA la app corre una ventana un año hacia atrás
 * para comparar contra ella. Se importa de aquí (Multifashion la re-exporta
 * por compatibilidad) en vez de copiarse — una segunda copia diverge (pasó con
 * el % de variación, y por eso existe `src/lib/variacion.ts`).
 */
export function unAnioAntes(fecha: string): string {
  const anio = Number(fecha.slice(0, 4)) - 1;
  const mes = Number(fecha.slice(5, 7));
  const dia = Math.min(Number(fecha.slice(8, 10)), ultimoDiaDelMes(anio, mes));
  return `${anio}-${dd2(mes)}-${dd2(dia)}`;
}

export interface CorteComparativo {
  /** Último día que entra en el período en curso (YYYY-MM-DD, día de Panamá). */
  corte: string;
  /** Hasta dónde se suma el año anterior: la misma fecha, un año antes. */
  cortePrev: string;
}

/**
 * @param ultimoDiaCargado  MAX(fecha) del período en curso ya en día de Panamá
 *                          (`fechaPanamaDe`), o null si todavía no hay datos.
 * @param ahora             El instante de la lectura. Nunca `new Date()` adentro.
 */
export function corteVsAnioAnterior(ultimoDiaCargado: string | null, ahora: Date): CorteComparativo {
  const hoy = hoyPanama(ahora);
  const corte = ultimoDiaCargado && ultimoDiaCargado < hoy ? ultimoDiaCargado : hoy;
  return { corte, cortePrev: unAnioAntes(corte) };
}

export interface VentanaFechas {
  /** YYYY-MM-DD, inclusivo. */
  desde: string;
  /** YYYY-MM-DD, inclusivo. */
  hasta: string;
}

export interface VentanaComparativa extends VentanaFechas {
  /** Último día del período ACTUAL que entra en la comparación. */
  corte: string;
  /** El período actual no llegó a su fin: la comparación se recortó a los
   *  mismos días. Un período cerrado (o uno enteramente futuro) sale `false`. */
  parcial: boolean;
}

/**
 * LA MISMA VENTANA UN AÑO ANTES, recortada a lo que el período actual lleva de
 * verdad. Es la función que usan Ventas › Productos, Multifashion › Productos y
 * cualquier comparación nueva; las tres ramas de siempre caen solas:
 *
 * · Período en curso → [un año antes de `desde`, un año antes del corte], con
 *   corte = min(último día cargado, hoy de Panamá, fin del período).
 * · Período cerrado → su `hasta` es anterior a hoy y a lo cargado: entero
 *   contra entero, sin caso especial.
 * · Período enteramente futuro (hoy antes de `desde`) → no tiene días
 *   transcurridos, no hay nada que recortar: se compara contra el período
 *   completo, como siempre.
 *
 * PURO: `ahora` explícito. El `ultimoDiaCargado` lo trae quien llama, desde la
 * MISMA tabla que va a sumar (`switch_articulo_diario`, `switch_facturas`…):
 * el corte tiene que salir de los datos que se comparan, no de otros.
 */
export function ventanaUnAnioAntes(
  actual: VentanaFechas,
  ultimoDiaCargado: string | null,
  ahora: Date,
): VentanaComparativa {
  const { corte: cargadoHastaHoy } = corteVsAnioAnterior(ultimoDiaCargado, ahora);
  const futuro = cargadoHastaHoy < actual.desde;
  const corte = futuro || cargadoHastaHoy > actual.hasta ? actual.hasta : cargadoHastaHoy;
  return {
    desde: unAnioAntes(actual.desde),
    hasta: unAnioAntes(corte),
    corte,
    parcial: corte < actual.hasta,
  };
}
