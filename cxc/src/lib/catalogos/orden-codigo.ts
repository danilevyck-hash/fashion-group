// ─────────────────────────────────────────────────────────────────────────────
// Comparador de CÓDIGOS (SKU) de catálogo — módulo puro, sin imports.
//
// Es la ÚNICA forma de comparar dos códigos en el módulo de catálogos, y existe
// porque el nombre no alcanza para ordenar: medido en producción el 17-ago-2026,
// Tommy tiene 498 productos con solo 19 nombres distintos (103 "Women-Sneakers",
// 99 "Women-Flip Flops") y Calvin 81 con 5. Al empatar el nombre, el orden final
// quedaba como viniera de la base — o sea, arbitrario, y los cuatro `KCMEENA…`
// de Calvin aparecían desperdigados entre los `HW0HW…` y los `KCTO…`.
//
// Lo usan el Excel de la plantilla B2B y el aviso de productos nuevos sin foto
// (vía `ordenarCodigosAZ`) y el DESEMPATE FINAL del orden del catálogo (vendedor,
// público y admin).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orden A-Z entre dos códigos. Total: nunca devuelve 0 para códigos distintos.
 *
 * Deliberadamente NO usa `localeCompare` con opciones: el resultado tiene que
 * ser el mismo en el navegador de Daniel, en Node y en el test, y las tablas de
 * ICU no lo garantizan. Con códigos A-Z0-9 la comparación cruda en MAYÚSCULAS
 * ES el orden alfabético.
 *
 * ⚠️ **El guión NO se quita, y está medido, no supuesto.** Tentaba normalizar
 * (`KCMEENA-A210` contra `KCMEENAA962`), pero al ordenar los 579 SKU reales de
 * Calvin + Tommy en crudo, LOS 41 códigos con guión ya caen pegados a su propia
 * familia: `KCMEENA-A210` justo antes de `KCMEENA004`, `T1A8-32600-313` justo
 * antes de `T1A8-32600313`, `FW0FW06158-DW5` entre `FW0FW06149-DW5` y
 * `FW0FW06447DW5`. Quitarlo sería maquinaria que no cambia ni un caso real y que
 * estrenaría una segunda idea de "qué es el mismo código" al lado de la regla
 * de fotos, donde el pegado por parecido está PROHIBIDO a propósito.
 *
 * Tampoco es numérico (`numeric: true` / `Intl.Collator`): los segmentos de
 * estos SKU son de ancho fijo, así que en crudo `T30400-800 < T30408-800 <
 * T30547-800` ya sale en orden, y la comparación numérica es justo la que
 * depende del entorno.
 */
export function compararCodigos(a: string | null | undefined, b: string | null | undefined): number {
  const ca = String(a ?? "");
  const cb = String(b ?? "");
  const A = ca.toUpperCase();
  const B = cb.toUpperCase();
  if (A < B) return -1;
  if (A > B) return 1;
  // Desempate estable por el código crudo (dos códigos que solo difieren en
  // mayúsculas/minúsculas no pueden quedar en orden aleatorio).
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}
