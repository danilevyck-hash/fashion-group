// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — EL AIRE ENTRE LAS COLUMNAS DE LOS RENGLONES, EN UN SOLO LUGAR
// (20-sep-2026).
//
// 🩸 QUÉ SE LEÍA. En la tabla del reclamo, «Subtotal» y «Motivo» salían pegados
// sin un solo píxel en el medio:
//
//     $1,152.00Mercancía manchada
//
// La tabla llevaba `[&_td]:py-3` (aire ARRIBA y ABAJO) y nada a los lados,
// mientras que las tablas de EDICIÓN sí traían `px-5`. O sea: el mismo dato, el
// mismo módulo y dos criterios distintos, y el que se lee todos los días era el
// que no tenía aire. Afecta a los 33 reclamos vivos y sus 126 renglones.
//
// 🔴 POR QUÉ ES UNA CONSTANTE Y NO UNA CLASE ESCRITA TRES VECES: porque la
// primera vez ya se separaron y una quedó atrás. Las tres tablas de renglones
// —la del detalle, la de edición del detalle y la del formulario
// (`ItemsEditor`)— leen ESTA línea. Cambiar el aire es cambiarlo en las tres.
//
// El `first-child`/`last-child` en 0 es a propósito: la tabla sigue alineada
// con el resto de la pantalla, el aire va SOLO entre columna y columna.
// ─────────────────────────────────────────────────────────────────────────────

/** El aire horizontal entre las columnas de una tabla de renglones. */
export const AIRE_ENTRE_COLUMNAS =
  "[&_th]:px-5 [&_td]:px-5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0";
