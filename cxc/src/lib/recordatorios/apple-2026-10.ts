// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS, ESTILO APPLE (9-oct-2026, propuesta).
//
// La pregunta de la pantalla: «¿qué cheque o recordatorio viene, y ya se
// depositó?». Medido contra producción el 9-oct-2026: la usa SOLO Angela, desde
// la computadora (7 entradas del 25-sep al 9-oct); 8 cheques nuevos desde
// septiembre y 2 notas en toda la historia, las dos del 5 y el 10-sep. Cambios:
//
//   1. Lista agrupada: los renglones de un grupo van en UNA caja con
//      separadores, sin una tarjeta con borde gris a la izquierda por cada uno.
//      El borde rojo se queda donde informa (vencido, devuelto).
//   2. Cada cheque en dos líneas: cliente y monto; fecha · N° · empresa. Sale
//      el chip «Pendiente» cuando lo es: en la lista solo hay abiertos, así que
//      el chip solo aparece cuando dice algo distinto (vencido, devuelto).
//   3. Computadora: «＋ Nuevo» va en la misma fila que Lista | Calendario y el
//      buscador; hoy ocupa una fila sola.
//   4. Sale el renglón «Nuevo recordatorio» de abajo: 2 notas en toda la
//      historia contra 27 cheques (menos de 1 de cada 10). La nota sigue en
//      «＋ Nuevo» › Nota. En el celular había dos «Nuevo» a la vista.
//
// El calendario no se toca (Daniel, 22-sep: «dejarla como está»).
// `false` = la pantalla de hoy, byte por byte. Se prende con el «sí» de Daniel.
// Candado: `src/__tests__/components/recordatorios-apple-apagado.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const RECORDATORIOS_APPLE_2026_10 = false;
