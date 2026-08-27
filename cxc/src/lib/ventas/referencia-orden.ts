// ─── ORDENAR LA TABLA DEL MODO PEDIDO POR COLUMNA (25-ago-2026) ──────────────
//
// 🔴 EL ORDEN POR DEFECTO SIGUE SIENDO EL ORDEN PEGADO (`ordenarComoPegado`),
// y eso NO es un detalle: Daniel lee esta tabla con su Excel al lado y el orden
// de su lista es el mapa. Ordenar por una columna es un OVERRIDE que él pide
// tocando el encabezado, y del que se puede volver — por eso el ciclo del
// encabezado es de TRES pasos y el tercero devuelve el orden pegado:
//
//   1er toque  → ordena (texto de la A, números de mayor a menor)
//   2do toque  → invierte
//   3er toque  → vuelve al ORDEN PEGADO
//
// Sin el tercer paso, tocar un encabezado sin querer dejaría la tabla ordenada
// para siempre y el mapa de Daniel perdido. Es el mismo criterio con el que la
// píldora de tramo del CXC se apaga al volver a tocarla.
//
// 🔑 EL SORT NO MIDE NADA. Recibe los valores que la fila YA calculó desde
// `armarFicha` — si acá se volviera a leer el artículo, la columna podría
// ordenar por un número distinto del que muestra, que es el defecto que este
// módulo ya pagó dos veces (el % con dos cuentas, el FOB con dos orígenes).

/** Las columnas que se pueden ordenar. El chevron no es una columna. */
export type ColumnaPedido =
  | "codigo"
  | "compre"
  | "vendi"
  | "stock"
  | "vendido"
  | "meses"
  | "margen"
  | "ultima";

export type DireccionOrden = "asc" | "desc";

/** `null` = el orden PEGADO (el default de la pantalla). */
export type OrdenPedido = { col: ColumnaPedido; dir: DireccionOrden } | null;

/** Los valores que la fila ya tiene, tal como los muestra. `null` = "—". */
export interface ValoresOrden {
  codigo: string;
  compre: number | null;
  vendi: number;
  stock: number | null;
  /** El % vendido como fracción 0-1 (el MISMO campo que pinta la celda). */
  vendido: number | null;
  meses: number | null;
  margen: number | null;
  /** La fecha de la última compra en ISO (`YYYY-MM-DD`), que ordena como texto. */
  ultima: string | null;
}

/** El texto arranca de la A; los números y las fechas, de mayor a menor —
 *  que es lo que se busca cuando alguien toca "Stock" o "Vendido". */
function direccionInicial(col: ColumnaPedido): DireccionOrden {
  return col === "codigo" ? "asc" : "desc";
}

/** El ciclo del encabezado: ordenar → invertir → volver al orden pegado. */
export function siguienteOrden(actual: OrdenPedido, col: ColumnaPedido): OrdenPedido {
  if (actual == null || actual.col !== col) return { col, dir: direccionInicial(col) };
  // Segundo toque en la MISMA columna: se da vuelta.
  if (actual.dir === direccionInicial(col)) {
    return { col, dir: actual.dir === "desc" ? "asc" : "desc" };
  }
  // Tercero: se sale del override y vuelve el orden pegado.
  return null;
}

/** El valor por el que ordena cada columna. `null` = no se puede afirmar. */
function valorDe(v: ValoresOrden, col: ColumnaPedido): number | string | null {
  switch (col) {
    case "codigo":
      return v.codigo;
    case "compre":
      return v.compre;
    case "vendi":
      return v.vendi;
    case "stock":
      return v.stock;
    case "vendido":
      return v.vendido;
    case "meses":
      return v.meses;
    case "margen":
      return v.margen;
    case "ultima":
      return v.ultima;
  }
}

/**
 * Ordena las filas por una columna, dejando la lista TAL CUAL cuando el orden
 * es el pegado (`null`).
 *
 * 🔴 LOS "—" VAN SIEMPRE AL FINAL, en las dos direcciones. Es la regla que este
 * módulo ya aplicaba: un artículo sin margen no es "el de margen más bajo", es
 * uno del que no se puede decir — y llevarlo arriba al ordenar de menor a mayor
 * lo haría pasar por el peor de la lista.
 *
 * ⚠️ EL DESEMPATE ES EL ORDEN PEGADO, y sale gratis: `Array.sort` es estable en
 * JavaScript, así que dos filas con el mismo valor conservan el orden con el
 * que entraron — que es el de la lista de Daniel.
 */
export function ordenarFilas<T>(
  filas: readonly T[],
  orden: OrdenPedido,
  valores: (f: T) => ValoresOrden,
): T[] {
  if (orden == null) return [...filas];
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = valorDe(valores(a), orden.col);
    const vb = valorDe(valores(b), orden.col);
    // Los que no se pueden afirmar quedan al final, mire para donde mire.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      // Comparación CRUDA en mayúsculas, no `localeCompare` con opciones: el
      // orden tiene que ser el mismo en el navegador de Daniel, en Node y en el
      // test, y las tablas de ICU no lo garantizan (la misma decisión que ya
      // rige `compararCodigos` y `ordenarCodigosAZ`).
      const A = va.toUpperCase();
      const B = vb.toUpperCase();
      return signo * (A < B ? -1 : A > B ? 1 : 0);
    }
    return signo * ((va as number) - (vb as number));
  });
}
