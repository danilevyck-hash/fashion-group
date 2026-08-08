// ─────────────────────────────────────────────────────────────────────────────
// LO QUE PRODUCTOS RESPONDE **ANTES** DE MOSTRAR LA TABLA.
//
// Daniel, textual: *"no me encanta, piensa como un CEO quisiera ver de manera
// simple rapida y minimalista"*. La pestaña tenía los números bien pero los
// entregaba como planilla: 600 filas × 6 columnas de cifras. Un dueño que la
// abre en el celular tiene que LEERLA entera para sacar una conclusión.
//
// Este módulo es la conclusión. PURO: recibe los renglones ya agregados por
// `productos-ranking.ts` y devuelve las cuatro respuestas, sin tocar base, red
// ni `new Date()`. Ni un número nuevo se inventa acá: todo sale de las mismas
// filas que ya alimentaban la tabla.
//
//   1. `variacion`    — cuánto cambió contra el mismo período del año pasado.
//   2. `topPor`       — los primeros N de un corte, con su barra proporcional.
//   3. `margenFlojo`  — lo que se vende mucho y deja poco (la conclusión de
//                       negocio que los datos ya permitían y nadie mostraba).
//   4. `movimientos`  — qué grupo movió la aguja, en plata, contra el año pasado.
//
// ── LO QUE ACÁ NO SE PUEDE HACER MAL ────────────────────────────────────────
//
// 1. NADA SE ESTIMA. La comparación contra el año pasado es una LECTURA de las
//    mismas filas de `switch_articulo_diario` para el período corrido un año;
//    no es una proyección, ni una regla de tres sobre los días transcurridos.
//    Si el período todavía no cerró, lo que se recorta es el PERÍODO DE
//    COMPARACIÓN (ver `rangoComparativo` en productos-ranking.ts) — nunca se
//    infla el actual.
//
// 2. UN PORCENTAJE SOBRE UNA BASE QUE NO SIRVE ES MENTIRA, igual que el margen.
//    La regla del Δ% de la app es una sola y vive en `@/lib/variacion`: si la
//    base del período anterior no llega a $100 —cero, devolución neta, o los
//    centavos que en su momento produjeron un "+363024750%" en pantalla— no hay
//    porcentaje. El monto absoluto SÍ se muestra siempre.
//
// 3. LA BARRA ES CONTRA EL LÍDER DE SU PROPIA LISTA, NO CONTRA EL TOTAL. Con
//    570 categorías, medir cada barra contra el total del período deja cinco
//    hilos de 1-3 px que no se distinguen entre sí — o sea, una barra que no
//    compara nada. El % del total va como número al lado, que es donde ese dato
//    sí se lee. (Y esa proporción se calcula contra el total COMPLETO del
//    período, no contra la suma de los cinco que se muestran.)
//
// 4. LOS "—" DE MARGEN NO ENTRAN EN LA ALERTA. Un grupo en devolución neta no
//    tiene margen; llamarlo "deja poco" sería inventarle un 0%.
// ─────────────────────────────────────────────────────────────────────────────

import { ordenarRanking, type RenglonRanking } from "./productos-ranking";
import { variacionPct } from "@/lib/variacion";

/** El período de comparación se devuelve LIGERO: la pantalla solo necesita
 *  parear por `clave` y restar. Mandar el renglón completo por segunda vez
 *  duplicaría un payload que ya se mide en cientos de KB. */
export interface RenglonComparativo {
  clave: string;
  unidades: number;
  venta: number;
  utilidad: number;
}

// ── 1. Variación contra el mismo período del año pasado ─────────────────────

export interface Variacion {
  /** Diferencia en la unidad del dato (dólares o piezas). SIEMPRE se puede. */
  abs: number;
  /** El % de variación, o `null` cuando no hay base comparable (punto 2). */
  pct: number | null;
}

/**
 * Cuánto cambió, en absoluto y en porcentaje.
 *
 * 🩸 **El % lo calcula `variacionPct` de `@/lib/variacion`, no este archivo.**
 * Es LA regla del Δ% de toda la app y no se copia: nació porque Daniel vio
 * "+363024750%" en el histórico de Multifashion —mayo 2024 valía **$0,01**, y
 * un guard de `previo > 0` lo dejaba pasar— cuando la misma cuenta estaba
 * escrita a mano en siete archivos y el corte lo tenía uno solo. Esta pantalla
 * tiene exactamente la misma forma de datos (grupos con ventas de centavos en
 * un período y miles en el otro), así que reescribirla acá sería reproducir ese
 * bug. `pct-variacion.test.ts` pone el build rojo si alguien la vuelve a
 * escribir.
 *
 * El ABSOLUTO se muestra siempre, incluso cuando el % es `null`: es un número
 * real, no depende de ninguna base y es el que un dueño usa.
 */
export function variacion(actual: number, anterior: number): Variacion {
  return {
    abs: Math.round((actual - anterior) * 10000) / 10000,
    pct: variacionPct(actual, anterior),
  };
}

// ── 2. Los primeros N de un corte, con barra ────────────────────────────────

/** Columnas por las que tiene sentido armar un "top". El texto no. */
export type ColumnaTop = "unidades" | "venta" | "utilidad";

export interface TopFila {
  clave: string;
  etiqueta: string;
  detalle: string;
  unidades: number;
  venta: number;
  utilidad: number;
  margen: number | null;
  /** El valor de la columna por la que se rankeó (lo que dibuja la barra). */
  valor: number;
  /** 0..1 contra el PRIMERO de esta misma lista — ver punto 3. */
  fraccion: number;
  /** Qué parte del total del período representa. `null` si el total no es > 0. */
  pctDelTotal: number | null;
}

/**
 * Los `n` primeros por `col`, de mayor a menor.
 *
 * Reusa `ordenarRanking` en vez de escribir otro `sort`: así el desempate por
 * etiqueta —el que evita que dos filas empatadas se intercambien solas entre un
 * render y otro— es EL MISMO que usa la tabla. Dos criterios de orden para la
 * misma pantalla es una fila que aparece primera arriba y quinta abajo.
 */
export function topPor(
  filas: readonly RenglonRanking[],
  col: ColumnaTop,
  n: number,
  total: number,
): TopFila[] {
  const orden = ordenarRanking(filas, col, "desc").slice(0, Math.max(0, n));
  const lider = orden.length > 0 ? orden[0][col] : 0;
  return orden.map(f => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    detalle: f.detalle,
    unidades: f.unidades,
    venta: f.venta,
    utilidad: f.utilidad,
    margen: f.margen,
    valor: f[col],
    fraccion: lider > 0 ? Math.max(0, Math.min(1, f[col] / lider)) : 0,
    pctDelTotal: total > 0 ? f[col] / total : null,
  }));
}

// ── 3. Se vende mucho pero deja poco ────────────────────────────────────────

export interface FilaMargenFlojo {
  clave: string;
  etiqueta: string;
  unidades: number;
  venta: number;
  utilidad: number;
  /** Nunca `null`: los "—" quedan fuera por definición (punto 4). */
  margen: number;
  /** Puesto en el ranking por UNIDADES (1 = el más vendido del período). */
  puesto: number;
}

export interface OpcionesMargenFlojo {
  /** Cuántos de los más vendidos se miran. */
  entreLosPrimeros: number;
  /** Cuántos se muestran, de peor margen a mejor. */
  maximo: number;
}

/**
 * De los `entreLosPrimeros` que más UNIDADES venden, los que quedaron por
 * debajo del margen general del período.
 *
 * La regla se dice en pantalla con estas dos palabras exactas — una alerta cuyo
 * criterio no se ve es una alerta en la que nadie confía. Se compara contra el
 * margen GENERAL del período (el mismo que ya mostraba el encabezado) y no
 * contra un umbral inventado: el número contra el que un dueño mide su producto
 * es su propio negocio.
 */
export function margenFlojo(
  filas: readonly RenglonRanking[],
  margenGeneral: number | null,
  opts: OpcionesMargenFlojo,
): FilaMargenFlojo[] {
  if (margenGeneral == null) return [];
  const porUnidades = ordenarRanking(filas, "unidades", "desc").slice(
    0,
    Math.max(0, opts.entreLosPrimeros),
  );
  const flojos: FilaMargenFlojo[] = [];
  porUnidades.forEach((f, i) => {
    if (f.margen == null || f.margen >= margenGeneral) return;
    flojos.push({
      clave: f.clave,
      etiqueta: f.etiqueta,
      unidades: f.unidades,
      venta: f.venta,
      utilidad: f.utilidad,
      margen: f.margen,
      puesto: i + 1,
    });
  });
  // De peor margen a mejor: lo que más urge mirar va primero. Desempate por
  // etiqueta, igual que en todo el resto de la pantalla.
  flojos.sort((a, b) =>
    a.margen !== b.margen ? a.margen - b.margen : a.etiqueta.localeCompare(b.etiqueta, "es"),
  );
  return flojos.slice(0, Math.max(0, opts.maximo));
}

// ── 4. Qué movió la aguja contra el año pasado ──────────────────────────────

export interface Movimiento {
  clave: string;
  etiqueta: string;
  ventaActual: number;
  ventaAnterior: number;
  /** Dólares de diferencia. Positivo = subió. */
  abs: number;
  /** `null` si el año pasado no vendió (base no positiva) — punto 2. */
  pct: number | null;
  /** No vendió nada el año pasado. */
  nuevo: boolean;
  /** Vendía el año pasado y este período no vendió nada. */
  desaparecido: boolean;
}

export interface Movimientos {
  subieron: Movimiento[];
  bajaron: Movimiento[];
}

/**
 * Los `n` grupos que más subieron y los `n` que más bajaron, EN DÓLARES DE
 * VENTA contra el mismo período del año pasado.
 *
 * 🩸 En dólares y no en porcentaje, y no es un detalle de formato: una
 * categoría que pasó de $40 a $200 sube 400% y no mueve el mes; una que pasó de
 * $80.000 a $62.000 baja 22% y se llevó $18.000. Rankear por % pone arriba
 * siempre a la más chica del catálogo, que es justo la que no hay que mirar.
 * El % va igual, al lado, como contexto.
 *
 * Los grupos que DESAPARECIERON entran también: una categoría que dejó de
 * venderse es una caída completa, y si solo se recorriera el período actual
 * sería invisible — el peor de los casos, contado como si no hubiera pasado.
 */
export function movimientos(
  actuales: readonly RenglonRanking[],
  anteriores: readonly RenglonComparativo[],
  n: number,
): Movimientos {
  const antes = new Map<string, RenglonComparativo>();
  for (const a of anteriores) antes.set(a.clave, a);

  const todos: Movimiento[] = [];
  const vistas = new Set<string>();

  for (const f of actuales) {
    vistas.add(f.clave);
    const prev = antes.get(f.clave);
    const ventaAnterior = prev ? prev.venta : 0;
    const v = variacion(f.venta, ventaAnterior);
    todos.push({
      clave: f.clave,
      etiqueta: f.etiqueta,
      ventaActual: f.venta,
      ventaAnterior,
      abs: v.abs,
      pct: v.pct,
      nuevo: ventaAnterior <= 0 && f.venta > 0,
      desaparecido: false,
    });
  }

  for (const a of anteriores) {
    if (vistas.has(a.clave)) continue;
    const v = variacion(0, a.venta);
    todos.push({
      clave: a.clave,
      etiqueta: a.clave,
      ventaActual: 0,
      ventaAnterior: a.venta,
      abs: v.abs,
      pct: v.pct,
      nuevo: false,
      desaparecido: a.venta > 0,
    });
  }

  const porAbs = (dir: 1 | -1) => (x: Movimiento, y: Movimiento) =>
    x.abs !== y.abs ? (y.abs - x.abs) * dir : x.etiqueta.localeCompare(y.etiqueta, "es");

  const tope = Math.max(0, n);
  return {
    subieron: todos.filter(m => m.abs > 0).sort(porAbs(1)).slice(0, tope),
    bajaron: todos.filter(m => m.abs < 0).sort(porAbs(-1)).slice(0, tope),
  };
}
