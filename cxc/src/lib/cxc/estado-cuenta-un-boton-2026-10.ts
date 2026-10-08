// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN SOLO BOTÓN «ESTADO DE CUENTA», Y EL DEL GRUPO POR OMISIÓN (7-oct-2026,
// propuesta — mockup HOY vs RECOMENDACIÓN, Daniel todavía no dijo que sí).
//
// Hasta hoy había DOS botones para el mismo trabajo —«Enviar estado de
// cuenta» (negro, manda) y «Estado de cuenta» (contorno, solo mira)— en la
// lista de Cuentas por Cobrar, la ficha del cliente y el celular. Y el estado
// de cuenta que se descarga es siempre de UNA empresa, aunque el cliente le
// deba al grupo en varias a la vez (Novedades El Dollar: Fashion Wear ·
// Fashion Shoes · Active Shoes).
//
// Con el interruptor PRENDIDO:
//   · Un solo botón «Estado de cuenta» en la tarjeta del CXC (computadora y
//     celular) y en la ficha del cliente; abre la hoja «Cobrar» de siempre
//     —correo · WhatsApp · copiar · descargar PDF—. El cajón de solo lectura
//     (`EstadoCuentaDrawer`) se deja de abrir desde ahí.
//   · El PDF que se descarga abre con una hoja de GRUPO (total arriba y el
//     desglose por empresa con sus tres tramos) cuando el cliente debe en
//     más de una; con una sola empresa esa hoja no se dibuja. El filtro de
//     empresa de la lista elige qué PDF se descarga (grupo o uno solo); lo
//     que se ENVÍA por correo o WhatsApp sigue sin mirar ese filtro.
//
// Interruptor `ESTADO_CUENTA_UN_BOTON_2026_10`: `false` = todo como antes.
// Candado `estado-cuenta-un-boton-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_CUENTA_UN_BOTON_2026_10 = false;
