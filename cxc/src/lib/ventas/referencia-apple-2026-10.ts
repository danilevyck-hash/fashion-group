// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA DE ARTÍCULOS, ESTILO APPLE (9-oct-2026, propuesta).
//
// La pregunta de la pantalla: «¿cuánto hay de este artículo y cómo se vende?».
// Medido 25-sep → 9-oct (`visitas_modulo`): 10 entradas, 9 desde el CELULAR,
// de bodega (Bodega, jorman, angel) y un vendedor (rey). Cuatro cambios:
//
//   1. Stock es EL número de la tarjeta; Comprado · Vendido · % vendido van en
//      una línea debajo. Sale el título «Existencias» y la tabla de una fila.
//   2. «Recepciones» y «Últimas recepciones» son UN bloque
//      («Últimas recepciones · 27 desde oct 2022»), y cada recepción dice lo
//      esencial en dos líneas. 🩸 Hoy, a 390 px, «queda 100 %» se parte en dos
//      y «Recepción» y «Cantidad» quedan pegados.
//   3. Celular: cada color en dos líneas (código y Stock; Comprado · Vendido ·
//      %) y el detalle al tocarlo. 🩸 Hoy la tabla de 7 columnas no cabe y
//      «% vendido» se corta a la derecha.
//   4. Sale «1 modelo · 26 colores» de arriba: la tarjeta ya lo dice.
//
// 🔴 NINGÚN NÚMERO CAMBIA: todo sale de `armarTarjetaModelo`, igual que hoy.
// `false` = la pantalla de hoy, byte por byte. Se prende con el «sí» de Daniel.
// Candado: `src/__tests__/ventas/referencia-apple-apagado.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const REFERENCIA_APPLE_2026_10 = false;
