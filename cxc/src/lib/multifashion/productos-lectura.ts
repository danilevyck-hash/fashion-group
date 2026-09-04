// ─────────────────────────────────────────────────────────────────────────────
// LA LECTURA de "Multifashion › Productos", en su forma barata.
//
// Módulo PURO: traduce lo que devuelven las dos RPC de agregación a las MISMAS
// formas que la ruta ya consumía (`FilaArticuloDiario` y `FilaMarca`). No toca
// base ni red — la ruta pone el I/O, acá vive la traducción y el criterio de
// "¿la función existe?".
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
// La pantalla se bajaba las filas CRUDAS y las sumaba en JavaScript. Medido
// contra producción el 9-ago-2026 (ventana de 12 meses 2025-09-01 → 2026-08-09):
// 20.483 filas del período + 18.417 del comparativo + 8.454 del diccionario de
// marcas = **48 idas y vueltas SECUENCIALES** a PostgREST (db-max-rows = 1000),
// y **8,6-9,0 s** de respuesta. Postgres puede devolver lo mismo ya sumado:
// 20.483 filas → 4.740 grupos (4,32× menos) en UNA llamada.
//
// ── LO QUE ACÁ NO SE PUEDE HACER MAL ────────────────────────────────────────
//
// 1. 🩸 **ACÁ NO SE FIRMA NADA.** La RPC devuelve MAGNITUDES y `tipo`, igual que
//    la tabla. Las notas de crédito las sigue restando `signoDeTipo()` en
//    `productos-ranking.ts`, que es la única definición del signo que tiene la
//    pantalla y la que tiene candado. Si esta traducción "ayudara" poniendo el
//    signo, habría DOS definiciones — y la firma de ese error es que la
//    diferencia contra Switch da exactamente el DOBLE de las NC (CLAUDE.md,
//    "Signos contables"; ya pasó dos veces en este repo).
//
// 2. **EL ORDEN QUE LLEGA ES EL ORDEN QUE VALE.** La RPC ordena por `MIN(id)`
//    del grupo, que es el mismo orden con el que hoy pagina la tabla
//    (`.order("id")`). De ese orden depende un dato VISIBLE: la segunda línea de
//    "por artículo" es la descripción de la PRIMERA fila que la traiga, y hay
//    **69 de 3.941 códigos con más de una descripción** en la ventana. Por eso
//    la traducción conserva el orden del arreglo y no lo reordena "por prolijo".
//
// 3. **SI LA FUNCIÓN NO ESTÁ, LA PANTALLA NO SE CAE.** En este proyecto las DDL
//    las corre Daniel a mano, así que el código se despliega ANTES que el SQL.
//    `esFuncionAusente()` reconoce ese caso exacto (PGRST202 / 42883) y solo
//    ese: cualquier otro error de la RPC se propaga, porque caerse al camino
//    lento ante un error de verdad es esconder el error.
// ─────────────────────────────────────────────────────────────────────────────

import type { FilaArticuloDiario } from "./productos-ranking";
import type { FilaMarca } from "./productos";

/** Agrega el período pedido: una fila por (artículo, código, descripción, tipo). */
export const RPC_PERIODO = "multifashion_articulo_diario_agrupado_v1";

/** El diccionario `articulo_id → marca` de una empresa, en una sola llamada. */
export const RPC_MARCAS = "multifashion_articulo_marca_v1";

/** Qué camino terminó usando una lectura. Viaja en la respuesta para que se
 *  pueda ver desde afuera que la DDL todavía no está corrida. */
export type FuenteLectura = "rpc" | "paginado";

/** Error de supabase-js tal como llega (solo lo que se mira acá). */
export interface ErrorSupabase {
  code?: string | null;
  message?: string | null;
}

/**
 * ¿El error es "esa función no existe todavía"?
 *
 * PostgREST devuelve `PGRST202` cuando la función no está en el schema cache, y
 * Postgres `42883` (undefined_function) si llegara a ejecutarse sin ella. Se
 * mira también el texto porque el `code` no siempre viaja.
 *
 * ⚠️ Deliberadamente ESTRECHO. Un `esFuncionAusente` generoso convertiría
 * cualquier falla de la base en "leelo por el camino lento" — 48 consultas
 * contra una base que se cayó tres veces por saturación, y sin que nadie se
 * entere de que algo anda mal.
 */
export function esFuncionAusente(err: ErrorSupabase | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "PGRST202" || code === "42883") return true;
  const msg = String(err.message ?? "").toLowerCase();
  // 🩸 Hasta el 3-sep-2026 acá había un `msg.includes("does not exist")` pelado,
  // que hacía que un `relation "x" does not exist` (la TABLA) o un
  // `column x.y does not exist` se leyeran como "no existe la FUNCIÓN" y
  // cayeran al camino lento. El texto tiene que NOMBRAR una función: es lo que
  // dicen Postgres (`function foo(...) does not exist`) y PostgREST
  // (`Could not find the function ...`).
  return (
    msg.includes("could not find the function") ||
    /\bfunction\b[^\n]*does not exist/.test(msg) ||
    msg.includes("no existe la función")
  );
}

/** Lo que devuelve `RPC_PERIODO`: el conteo de filas CRUDAS + los grupos. */
export interface PeriodoAgrupado {
  /** Filas crudas que había en el rango. Es el `filasLeidas` de la respuesta:
   *  el número que prueba que no hubo truncado silencioso. */
  filasCrudas: number;
  filas: FilaArticuloDiario[];
}

const numeroONulo = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

const textoONulo = (x: unknown): string | null => (typeof x === "string" ? x : null);

/**
 * `{ n, f: [...] }` de la RPC → la MISMA forma que devolvía PostgREST.
 *
 * Los montos se dejan tal cual llegan (número o string): `productos-ranking.ts`
 * ya sabe leer las dos formas — es la misma columna `numeric` que PostgREST
 * entregaba como string. No se redondea ni se convierte nada acá.
 *
 * Revienta si la forma no es la esperada, en vez de devolver un arreglo vacío:
 * cero filas y "no entendí la respuesta" se ven idénticos en pantalla y solo
 * uno de los dos es un dato.
 */
export function periodoDesdeRpc(data: unknown, etiqueta: string): PeriodoAgrupado {
  const obj = data as { n?: unknown; f?: unknown } | null;
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.f)) {
    throw new Error(`${etiqueta}: la RPC no devolvió { n, f: [] }`);
  }
  const filas = (obj.f as Array<Record<string, unknown>>).map(r => ({
    articulo_id: numeroONulo(r.a),
    codigo: textoONulo(r.c),
    descripcion: textoONulo(r.d),
    tipo: textoONulo(r.t),
    cantidad_total: r.q as number | string | null,
    venta_total: r.v as number | string | null,
    costo_total: r.k as number | string | null,
  }));
  return { filasCrudas: numeroONulo(obj.n), filas };
}

/** El diccionario de marcas de la RPC → la misma forma de `switch_articulo_marca`. */
export function marcasDesdeRpc(data: unknown, etiqueta: string): FilaMarca[] {
  if (!Array.isArray(data)) throw new Error(`${etiqueta}: la RPC no devolvió un arreglo`);
  return (data as Array<Record<string, unknown>>).map(r => ({
    articulo_id: numeroONulo(r.a),
    marca_id: typeof r.m === "number" ? r.m : null,
    marca_nombre: textoONulo(r.n),
  }));
}
