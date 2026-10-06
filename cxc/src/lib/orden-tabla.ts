// ─────────────────────────────────────────────────────────────────────────────
// ORDENAR UNA TABLA TOCANDO EL ENCABEZADO — UNA SOLA REGLA (6-oct-2026).
//
// Daniel, en Multifashion › Productos: *«Quiero poder ordenar por Descripción,
// Unidades, Venta, Margen y Stock. No solo en esta pantalla, sino en todo lo
// que tenga sentido»*.
//
// La regla, la misma en todas las tablas (módulo PURO; el dibujo y la memoria
// viven en `components/ui/OrdenTabla.tsx`):
//   · tocar un encabezado ordena por esa columna; tocarlo otra vez invierte;
//   · la primera vez, los números van de MAYOR a menor y el texto de la A a la Z;
//   · al lado del rótulo, ▲ (de menor a mayor / A→Z) o ▼ (de mayor a menor);
//   · lo que no tiene dato (null, «», NaN) va AL FINAL, mire para donde mire
//     la flecha: no se ordena por un dato que no existe (la regla de Reclamos).
//   · el orden es ESTABLE: a igual valor se respeta el orden en que venía.
//
// Candado: `src/__tests__/lib/orden-tabla.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type Sentido = "asc" | "desc";

export interface Orden<K extends string = string> {
  col: K;
  dir: Sentido;
}

export type ValorOrden = number | string | null | undefined;

/** El sentido de la PRIMERA vez: el texto de la A a la Z, los números de mayor a menor. */
export function sentidoInicial(esTexto: boolean): Sentido {
  return esTexto ? "asc" : "desc";
}

/** Tocar un encabezado: la misma columna se invierte; otra arranca en su sentido. */
export function alTocar<K extends string>(actual: Orden<K> | null, col: K, esTexto: boolean): Orden<K> {
  if (actual && actual.col === col) return { col, dir: actual.dir === "asc" ? "desc" : "asc" };
  return { col, dir: sentidoInicial(esTexto) };
}

/** La flecha chica de al lado del rótulo, o nada si no es la columna ordenada. */
export function flecha<K extends string>(orden: Orden<K> | null, col: K): "▲" | "▼" | "" {
  if (!orden || orden.col !== col) return "";
  return orden.dir === "asc" ? "▲" : "▼";
}

function vacio(v: ValorOrden): boolean {
  return v == null || (typeof v === "number" && Number.isNaN(v)) || (typeof v === "string" && v.trim() === "");
}

const COLLATOR = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Compara dos valores en sentido ascendente; los vacíos NO se tratan acá. */
function comparar(a: Exclude<ValorOrden, null | undefined>, b: Exclude<ValorOrden, null | undefined>): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return COLLATOR.compare(String(a), String(b));
}

/** Ordena una copia de `filas` por `orden`. Vacíos al final; estable. */
export function ordenarFilas<T, K extends string>(
  filas: readonly T[],
  orden: Orden<K> | null,
  valor: (fila: T, col: K) => ValorOrden,
): T[] {
  if (!orden) return [...filas];
  const signo = orden.dir === "asc" ? 1 : -1;
  return filas
    .map((f, i) => ({ f, i, v: valor(f, orden.col) }))
    .sort((x, y) => {
      const vx = vacio(x.v);
      const vy = vacio(y.v);
      if (vx || vy) return vx === vy ? x.i - y.i : vx ? 1 : -1;
      return signo * comparar(x.v as string | number, y.v as string | number) || x.i - y.i;
    })
    .map((x) => x.f);
}

/** «venta:desc» → Orden, o `null` si no es una columna de esta tabla. */
export function leerOrden<K extends string>(texto: string | null | undefined, columnas: readonly K[]): Orden<K> | null {
  const [col, dir] = String(texto ?? "").split(":");
  if (!columnas.includes(col as K) || (dir !== "asc" && dir !== "desc")) return null;
  return { col: col as K, dir };
}

export function escribirOrden(orden: Orden): string {
  return `${orden.col}:${orden.dir}`;
}
