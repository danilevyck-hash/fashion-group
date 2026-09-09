// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A QUIÉN SE LE COBRA — UNA SOLA REGLA, UN SOLO LUGAR (8-sep-2026).
//
// Daniel: al cliente con **saldo A FAVOR no se le cobra**. Ni botón «Cobrar»,
// ni casilla para mandarle en lote, ni renglón en las descargas.
//
// 🩸 QUÉ PASABA. Medido contra producción el 8-sep-2026: **5 clientes** tienen
// saldo a favor (−$1.220,05 en total), el mayor **Viva Panama Dutty Free con
// −$1.147,52**. A los cinco les salía el botón negro «Cobrar», y el mensaje de
// WhatsApp que ese botón arma decía, textual:
//
//     Total: $-1,147.52
//     Agradecemos su pronta atencion a este saldo.
//
// O sea: le pedíamos que pagara una plata que le debemos NOSOTROS.
//
// ⚠️ EN LA PANTALLA SIGUEN VIÉNDOSE, en su bloque «Saldo a favor» al pie de la
// lista, exactamente como hoy. Esconderlos sería otro defecto: esa plata existe
// y alguien la tiene que ver. Lo que se cierra es el COBRO, no la vista.
//
// ⚠️ El mostrador `TCKCTA` («Ventas Local») **se queda en la cartera** —Daniel:
// *«se queda»*—; hoy tiene −$19,00, así que le aplica esta regla como a
// cualquier otro, por su saldo y no por ser el mostrador.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Se le cobra a este saldo?
 *
 * Solo el saldo POSITIVO es deuda. El cero no llega hasta acá (la cartera ya
 * descarta a quien quedó en 0) y, si llegara, tampoco hay nada que cobrar.
 */
export function seLeCobra(total: number): boolean {
  return total > 0;
}
