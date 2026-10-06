// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES «COMO LO HARÍA APPLE» (5-oct-2026). PRENDIDO el 5-oct-2026 (Daniel: «aprobado»).
//
// La MISMA lista y la MISMA ficha con las reglas de docs/diseno.md:
//   · Lista: «150 clientes» arriba se va (lo dice el chip «Todos 150»); al
//     buscar, «12 de 150» va al pie. En la computadora la fila entera abre la
//     ficha (con ›); en el celular cada cliente son dos renglones con ›.
//   · Ficha: el orden de Daniel (5-sep-2026) no se mueve. En la tarjeta del
//     saldo, «+90 días $X» en rojo (la MISMA cuenta que CxC); «Ya no está en
//     Switch» con el `<Aviso>` de la casa; en el celular el detalle por empresa
//     son filas (sin tabla que se desliza de lado) y «Enviar estado de cuenta»
//     va fijo abajo. Se sigue editando tocando el dato.
//
// 🔴 NO CAMBIA NINGÚN NÚMERO NI NINGÚN GUARDADO: el +90 días sale de
// `clienteParaCobrar` + `saldoMas90` (los de la hoja de cobro y CxC). Apagado =
// como hoy. Candado: `reclamos-clientes-apple-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como antes. PRENDIDO el 5-oct-2026: Daniel aprobó el mockup HOY vs RECOMENDACIÓN («aprobado»). */
export const CLIENTES_APPLE_2026_10 = true;
