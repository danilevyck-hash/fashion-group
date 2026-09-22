// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS NÚMEROS DE STOCK DE LA TARJETA — «Disponibilidad» y «Existencia»
// (22-sep-2026). Módulo PURO: sin React, sin red.
//
// Hoy la tarjeta del catálogo INTERNO dibuja dos renglones, uno debajo del
// otro:
//
//     Disponibilidad 12      ← negrita, color fuerte de la marca
//     Existencia 12          ← gris
//
// Daniel lo vio en su iPhone y preguntó por el espacio. En el teléfono la
// tarjeta ya es alta y esos son dos renglones que casi siempre dicen el MISMO
// número.
//
// ─── MEDIDO CONTRA PRODUCCIÓN EL 22-sep-2026, sobre los 838 productos ACTIVOS
//     de las cuatro marcas (Tommy 455 · Reebok 220 · Calvin 82 · Joybees 81):
//
//     · los dos números son IGUALES en **643 de 838** (77 %)
//     · DIFIEREN en **195** (Reebok 77 · Tommy 75 · Joybees 34 · Calvin 9)
//     · ninguno de los 838 tiene alguno de los dos en NULL
//     · `disponibilidad` NUNCA es mayor que `existencia` (0 de 838) — es lo
//       esperado: disponibilidad = saldo físico − lo ya apartado
//
// ─── LA RECOMENDACIÓN, Y POR QUÉ ────────────────────────────────────────────
// El número que sirve para VENDER es **Disponibilidad**: es lo que el vendedor
// puede comprometer hoy sin prometer mercancía que ya tiene dueño. «Existencia»
// es el saldo físico de bodega —incluye lo apartado—, y prometerlo es la única
// forma de que el número mienta. Cuando los dos coinciden (77 % de las veces)
// la segunda línea no agrega nada; cuando NO coinciden, la que hay que leer es
// igual la primera.
//
// 🔴 PERO ESTO NO SE DECIDE DESDE ACÁ. Cuál de los dos números se queda es un
// dato de NEGOCIO y la decisión es de Daniel. Por eso el interruptor arranca en
// `true` —la pantalla no cambió— y apagarlo es una sola línea, sin tocar el
// componente ni la base.
//
// ⚠️ Los dos números viajan SOLO al catálogo interno (`showStock`). El catálogo
// público NUNCA los recibe (`lib/catalogo/publico-payload.ts`): el cliente no
// ve ni existencia ni disponibilidad. O sea, esta línea la ve el vendedor, no
// el cliente.
// 🔑 Apagar la línea NO toca la COLUMNA `existencia` ni deja de traerla: el
// dato se sigue guardando, se sigue usando para decidir qué está «a la venta»
// y sigue en el Excel. Lo único que cambia es que la tarjeta no lo dibuja.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿La tarjeta dibuja el segundo renglón, «Existencia N»?
 *
 * `true` = como está hoy, los dos renglones.
 * `false` = solo «Disponibilidad N» (la recomendación, PENDIENTE del sí de
 * Daniel).
 */
export const MOSTRAR_EXISTENCIA = true;
