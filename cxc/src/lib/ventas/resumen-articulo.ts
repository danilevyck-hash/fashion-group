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
//   · Los tres GRANDES: **Compré · Vendí · Me quedan** (unidades, tipografía
//     grande). Compré = TODAS las compras registradas; Vendí = ventas netas de
//     toda la historia (NC restadas); Me quedan = `existencia` de Switch, NUNCA
//     deducido.
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

// ─── Los TRES GRANDES: Compré · Vendí · Me quedan ────────────────────────────
//
// 🔴 SON TRES FUENTES DISTINTAS Y NO SE FUERZA EL CUADRE ENTRE ELLAS:
//   · Compré  = suma de TODAS las compras registradas (también las de más de 3
//               años que la lista no muestra). Es `cuadre.comprado`.
//   · Vendí   = ventas NETAS de toda la historia, con las NC ya restadas (la
//               firma del error de signos es que la diferencia da EXACTO el
//               doble). Es `cuadre.vendido`.
//   · Me quedan = `switch_articulo_info.existencia`, la fuente de verdad.
//               NUNCA se deduce de los otros dos.
// Cuando no cierran (ajuste de inventario, venta sin compra registrada, robo —
// Daniel: *"si hay menos es porq robaron"*), los avisos de descuadre que ya
// existen lo explican. Acá cada número dice su verdad.

export interface TresGrandes {
  /** `null` = sin compra registrada: no se inventa un 0 que parecería dato. */
  comprado: number | null;
  /** Neto histórico. Puede ser NEGATIVO (más devoluciones que ventas). */
  vendido: number;
  /** `null` = Switch no tiene este código en el catálogo. */
  quedan: number | null;
  /** vendido ÷ comprado. `null` cuando no se puede decir (sin compras, o
   *  vendido negativo — "el −5% de lo comprado" no es castellano). */
  parteVendida: number | null;
}

export function tresGrandes(
  art: Pick<ArticuloCompras, "cuadre" | "existencia" | "sinCompraRegistrada">,
): TresGrandes {
  // `cuadre` puede faltar en una respuesta vieja cacheada tras un deploy —
  // misma degradación honesta que `serie ?? []`.
  const comprado = art.sinCompraRegistrada || art.cuadre == null ? null : art.cuadre.comprado;
  const vendido = art.cuadre?.vendido ?? 0;
  return {
    comprado,
    vendido,
    quedan: art.existencia,
    parteVendida: comprado != null && comprado > 0 && vendido > 0 ? vendido / comprado : null,
  };
}

/** "el 80% de lo comprado" — el subtítulo de Vendí. `null` = no hay porcentaje
 *  honesto que decir y el que llama pone su propio texto. */
export function textoParteVendida(parte: number | null): string | null {
  if (parte == null || !Number.isFinite(parte)) return null;
  const pct = Math.round(parte * 100);
  if (pct < 1) return "menos del 1% de lo comprado";
  return `el ${pct}% de lo comprado`;
}

// ─── LA LÍNEA DEL 90%: en cuánto se vende una compra ────────────────────────
//
// 🔴 REEMPLAZA AL "VENDO POR MES" COMO PROTAGONISTA. Daniel, textual: *"creo
// que es mas importante saber en cuanto meses se vendio digamos que el 80%?
// 90%? siento que es mas util que unidades por mes"*. Confirmó 90% — viene de
// su regla vieja: la cola no cuenta.
//
// Tres formas, según lo que se pueda AFIRMAR sin inventar:
//   · Compra ÚNICA que ya cruzó el 90%:  "El 90% se vendió en 16 meses"
//   · Compra ÚNICA viva:                 "En 10 meses va el 80% de la compra"
//   · VARIAS compras (o historia vieja): agregado ROTULADO como lo que es —
//     "Desde oct 2025 llegaron 360 u · van vendidas 295". NO se atribuye por
//     tanda: el FIFO sigue prohibido (nadie marcó las cajas).
// El "vendo N u por mes" queda como dato chiquito al final de la línea.
//
// Granularidad: MESES (las ventas llegan agregadas por día pero la pregunta de
// Daniel es en meses). "A los N meses" = diferencia de índice de mes entre la
// llegada y el mes en que el acumulado cruzó el 90%.

/** La parte de la compra que cuenta. La cola (el 10% final) no. */
export const PARTE_NOVENTA = 0.9;

export type LineaNoventa =
  /** Compra única y el acumulado NETO cruzó el 90% y SIGUE arriba: se vendió
   *  en `meses`. `alCruce` = unidades netas acumuladas al mes del cruce. */
  | { tipo: "vendido"; meses: number; alCruce?: number }
  /** Compra única viva: van `parte` (0-1) a los `meses` de llegada.
   *  `retrocedio` = llegó a cruzar el 90% pero las devoluciones lo bajaron. */
  | { tipo: "en-curso"; meses: number; parte: number; retrocedio?: boolean }
  /** Varias compras: agregado desde la primera llegada de la ventana de 12
   *  meses (o la última compra, si ninguna cae en la ventana). */
  | { tipo: "agregado"; desdeMes: string; llegaron: number; van: number }
  /** Sin compra registrada (o sin fecha utilizable): no se inventa. */
  | { tipo: "sin-dato" };

/**
 * Mide la línea del 90% de un artículo.
 *
 * 🔴 CON UNA SOLA COMPRA la cuenta es limpia: todo lo vendido desde que llegó
 * salió de ella. CON VARIAS no se reparte nada — se suma lo llegado desde el
 * ancla y lo vendido desde el ancla, y el texto lo dice tal cual.
 * ⚠️ El mes en curso SÍ entra acá: es un acumulado ("van vendidas"), no un
 * promedio — excluirlo diría menos de lo que ya pasó.
 */
export function medirNoventa(
  art: Pick<ArticuloCompras, "compras" | "comprasFueraDeVentana" | "serie" | "sinCompraRegistrada">,
  hoyMes: string,
): LineaNoventa {
  const todas = art.compras ?? [];
  const fuera = art.comprasFueraDeVentana ?? 0;
  const serie = art.serie ?? [];
  if (art.sinCompraRegistrada || (todas.length === 0 && fuera === 0)) return { tipo: "sin-dato" };
  // Solo compras de más de 3 años: no viajan sus fechas, no hay ancla honesta.
  if (todas.length === 0) return { tipo: "sin-dato" };

  const unica = todas.length === 1 && fuera === 0;
  if (unica) {
    const compra = todas[0];
    const total = compra.unidades;
    if (!(total > 0)) return { tipo: "sin-dato" };
    const mesLlegada = compra.fecha.slice(0, 7);
    const meta = total * PARTE_NOVENTA;
    // 🔴 EL 90% ES SOBRE LA CURVA NETA, Y SOLO SE AFIRMA SI SE SOSTIENE.
    // El caso real que lo exige (4D5077G001, 12-ago-2026): llegó 36 u en
    // marzo, mayo vendió +36 y junio devolvió −18. El acumulado CRUZÓ el 90%
    // en mayo y la devolución lo bajó al 50% — decir "el 90% se vendió en 2
    // meses" es una verdad a medias con la que Daniel COMPRA. Se afirma
    // "vendido" solo si el neto sigue ≥90% hoy: el cruce que vale es el primer
    // mes desde el cual el acumulado nunca volvió a bajar de la meta. Si cruzó
    // y cayó, se dice el estado real en curso, marcado (`retrocedio`).
    let acum = 0;
    let cruce: { mes: string; alCruce: number } | null = null;
    let cruzoAlgunaVez = false;
    for (const m of serie) {
      if (m.mes < mesLlegada || m.mes > hoyMes) continue;
      acum += m.unidades;
      if (acum >= meta) {
        cruzoAlgunaVez = true;
        if (!cruce) cruce = { mes: m.mes, alCruce: acum };
      } else {
        cruce = null;
      }
    }
    if (cruce) {
      return { tipo: "vendido", meses: diffMeses(cruce.mes, mesLlegada), alCruce: cruce.alCruce };
    }
    return {
      tipo: "en-curso",
      meses: diffMeses(hoyMes, mesLlegada),
      parte: acum / total,
      retrocedio: cruzoAlgunaVez,
    };
  }

  // Varias compras: ancla = la primera llegada dentro de los últimos 12 meses
  // completos (la ventana de las barras); si ninguna cae ahí, la más reciente.
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
  const inicioVentana = restarMeses(hoyMes, MESES_VENTANA);
  const enVentana = todas.filter((c) => c.fecha.slice(0, 7) >= inicioVentana);
  const van = (mes: string) =>
    serie.filter((m) => m.mes >= mes && m.mes <= hoyMes).reduce((s, m) => s + m.unidades, 0);
  const llegaronDesde = (mes: string) =>
    todas.filter((c) => c.fecha.slice(0, 7) >= mes).reduce((s, c) => s + c.unidades, 0);

  // `todas` viene la más NUEVA primero.
  let idx = enVentana.length ? todas.indexOf(enVentana[enVentana.length - 1]) : 0;
  for (; idx < todas.length; idx += 1) {
    const mesAncla = todas[idx].fecha.slice(0, 7);
    if (llegaronDesde(mesAncla) >= van(mesAncla) || idx === todas.length - 1) break;
  }
  const mesAncla = todas[Math.min(idx, todas.length - 1)].fecha.slice(0, 7);
  return { tipo: "agregado", desdeMes: mesAncla, llegaron: llegaronDesde(mesAncla), van: van(mesAncla) };
}

/** El texto de la línea del 90%, en español simple. `null` = no hay nada
 *  honesto que decir (la caja de Compras ya dijo lo suyo). */
export function textoNoventa(n: LineaNoventa): string | null {
  switch (n.tipo) {
    case "vendido":
      return `El 90% se vendió en ${textoMeses(n.meses)}`;
    case "en-curso": {
      const cuando = `En ${textoMeses(n.meses)}`;
      // La marca de la devolución: cruzó el 90% y volvió a bajar. Sin esto,
      // pasar de "El 90% se vendió en 2 meses" a "va el 50%" parecería un bug.
      const nota = n.retrocedio ? " (bajó por devoluciones)" : "";
      if (n.parte <= 0) return `${cuando} no se ha vendido nada de la compra${nota}`;
      const pct = Math.round(n.parte * 100);
      return pct < 1
        ? `${cuando} va menos del 1% de la compra${nota}`
        : `${cuando} va el ${pct}% de la compra${nota}`;
    }
    case "agregado":
      return n.van < 0
        ? `Desde ${fmtMesAnio(n.desdeMes)} llegaron ${fmtNum(n.llegaron)} u · van devueltas ${fmtNum(-n.van)}`
        : `Desde ${fmtMesAnio(n.desdeMes)} llegaron ${fmtNum(n.llegaron)} u · van vendidas ${fmtNum(n.van)}`;
    case "sin-dato":
      return null;
  }
}

/** La versión CORTA de la línea del 90% — la usaba la columna "90% en" del
 *  modo pedido (reemplazada por VENDIDO · MESES el 12-ago-2026) y la sigue
 *  usando la verificación contra producción. */
export function textoNoventaCorto(n: LineaNoventa): string {
  switch (n.tipo) {
    case "vendido":
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
//   4K5026G102     24    24     0      90%      2     ← terminado (negro)
//
//   · TERMINADO (el acumulado neto cruzó el 90% y se sostiene): VENDIDO = 90%
//     y MESES = los meses calendario en que se cruzó — CONGELADOS ahí (regla
//     vieja de Daniel: la cola no cuenta). Es EXACTAMENTE el caso "vendido" de
//     `medirNoventa`, sin una segunda medición.
//   · VIVO (no cruzó — con ventas, sin ventas, o retrocedido por devoluciones):
//     VENDIDO = Vendí ÷ Compré (LOS TOTALES de los tres grandes, redondeado a
//     entero al mostrar) y MESES = meses calendario desde la llegada — la MISMA
//     ancla de la ficha (`medirRitmo`): la única compra, o el ancla EXTENDIDA
//     con varias. El mes en curso sigue fuera de todo promedio, pero los meses
//     TRANSCURRIDOS cuentan el calendario real (y una venta de hoy sí mueve
//     el %: Vendí es el neto histórico).
//   · SIN DATO: la celda que no se puede afirmar dice "—", nunca se inventa.
//     Sin compra con fecha → las dos en "—". Vendido > comprado (el caso TERMO:
//     faltan compras EN Switch) → el % sería mentira, pero los meses desde la
//     llegada SÍ se saben y se dicen.
//
// UNA función para pantalla y Excel: si cada una hiciera su cuenta, la tabla y
// la planilla dirían dos cosas distintas de la misma fila.

export interface VendidoMeses {
  /** La celda VENDIDO, como fracción 0-1 (0,9 CONGELADO si terminó).
   *  `null` = "—": no hay porcentaje honesto que afirmar. */
  parte: number | null;
  /** La celda MESES (meses calendario, enteros). `null` = "—": sin fecha. */
  meses: number | null;
  /** `true` = cruzó el 90% sostenido: congelado, va en negro.
   *  `false` = en curso, va en gris. */
  terminado: boolean;
}

export function medirVendidoMeses(
  f: Pick<FichaArticulo, "grandes" | "noventa" | "ritmo">,
): VendidoMeses {
  // Cruzó el 90% y se sostiene: se congela ahí. `noventa.meses` es el mes del
  // cruce, no "cuánto lleva en bodega" — la cola no cuenta.
  if (f.noventa.tipo === "vendido") {
    return { parte: PARTE_NOVENTA, meses: f.noventa.meses, terminado: true };
  }
  const { comprado, vendido } = f.grandes;
  // El % vivo sale de los TOTALES (Vendí ÷ Compré). Un vendido negativo ("el
  // −5% de lo comprado") o mayor que lo comprado (TERMO) no es un % afirmable.
  const parte =
    comprado != null && comprado > 0 && vendido >= 0 && vendido <= comprado
      ? vendido / comprado
      : null;
  // `ritmo.meses` ya es la ancla de la ficha: llegada de la única compra, o el
  // ancla EXTENDIDA del agregado. No se inventa una segunda.
  return { parte, meses: f.ritmo.meses, terminado: false };
}

/** "29%" / "0%" / "90%" / "—" — el texto de la celda VENDIDO. */
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
// El ancla es LA MISMA de la línea del 90% (`medirNoventa`): compra única = su
// llegada; varias compras = el ancla del agregado ("Desde oct 2025 llegaron
// 360…"). Si el ritmo usara otra ventana que el avance, las dos líneas se
// desmentirían entre sí. Sin compra registrada se cae al promedio de los 12
// meses completos, DICIÉNDOLO.
//
// Y el número grande de la fila de KPIs es LOS MESES — Daniel: *"que me diga
// cuanto tiempo lleva alado de los 3 kpi. deberia de ser: compre, vendi, stock,
// meses (de venta) y abajo u/mes"*. El u/mes va abajo, en la línea secundaria.

export interface RitmoVenta {
  /** Meses desde el ancla — el CUARTO número grande. Para una compra ya
   *  vendida (90% sostenido) son los meses QUE TARDÓ. `null` = sin fecha. */
  meses: number | null;
  /** Unidades netas por mes sobre esos meses. `null` = no se puede decir. */
  porMes: number | null;
  base: "unica-vendida" | "unica-viva" | "agregado" | "ventana-12" | null;
  /** El mes del ancla (llegada o inicio del agregado). */
  desdeMes: string | null;
}

export function medirRitmo(
  art: Pick<ArticuloCompras, "compras" | "serie">,
  hoyMes: string,
  noventa: LineaNoventa,
  promedio: Promedio,
): RitmoVenta {
  const serie = art.serie ?? [];
  const vanDesde = (mes: string) =>
    serie.filter((m) => m.mes >= mes && m.mes <= hoyMes).reduce((s, m) => s + m.unidades, 0);
  const llegada = (art.compras ?? [])[0]?.fecha.slice(0, 7) ?? null;

  switch (noventa.tipo) {
    case "vendido": {
      // Compra única ya vendida: el ritmo es el de MIENTRAS se vendía —
      // unidades al cruce ÷ meses del cruce. Dividir entre los meses en bodega
      // diluiría el ritmo con los meses posteriores al agote.
      const alCruce = noventa.alCruce ?? (llegada != null ? vanDesde(llegada) : null);
      const divisor = Math.max(1, noventa.meses);
      return {
        meses: noventa.meses,
        porMes: alCruce != null && alCruce > 0 ? alCruce / divisor : null,
        base: "unica-vendida",
        desdeMes: llegada,
      };
    }
    case "en-curso": {
      const van = llegada != null ? vanDesde(llegada) : 0;
      return {
        meses: noventa.meses,
        porMes: noventa.meses > 0 && van > 0 ? van / noventa.meses : null,
        base: "unica-viva",
        desdeMes: llegada,
      };
    }
    case "agregado": {
      const meses = diffMeses(hoyMes, noventa.desdeMes);
      return {
        meses,
        porMes: meses > 0 && noventa.van > 0 ? noventa.van / meses : null,
        base: "agregado",
        desdeMes: noventa.desdeMes,
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
 *  "Vendo 3.6 u por mes · En 5 meses va el 50% de la compra". Pantalla y
 *  verificación comparan contra ESTO — una sola definición. */
export function textoLineaNoventa(n: LineaNoventa, ritmo: RitmoVenta): string | null {
  const vendo = textoVendoPorMes(ritmo.porMes);
  // Cuando el ritmo NO sale de la llegada (sin compra registrada), se dice de
  // dónde sale — un número con otra base sin rotular sería una mentirita.
  const vendoRotulado =
    vendo && ritmo.base === "ventana-12" ? `${vendo} (promedio de los últimos 12 meses)` : vendo;
  const partes = [vendoRotulado, textoNoventa(n)].filter((t): t is string => t != null);
  return partes.length ? partes.join(" · ") : null;
}

/** El valor del cuarto número grande ("Meses"). */
export function valorGrandeMeses(r: RitmoVenta): string {
  return r.meses == null ? "—" : fmtNum(r.meses);
}

/** El pie del cuarto número grande. Corto a propósito (vive bajo un 34 px). */
export function pieGrandeMeses(r: RitmoVenta): string {
  switch (r.base) {
    case "unica-vendida":
      return "en vender el 90%";
    case "unica-viva":
      return "de venta";
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
  /** Compré · Vendí · Stock — los primeros tres grandes. */
  grandes: TresGrandes;
  /** La línea del 90%: en cuánto se vende una compra. */
  noventa: LineaNoventa;
  /** El CUARTO grande (Meses) y el "Vendo X u por mes" de la línea secundaria:
   *  meses y unidades por mes DESDE LA LLEGADA (la misma ancla del 90%). */
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
  const noventa = medirNoventa(art, hoyMes);
  const ritmo = medirRitmo(art, hoyMes, noventa, promedio);

  return {
    grandes: tresGrandes(art),
    noventa,
    ritmo,
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
