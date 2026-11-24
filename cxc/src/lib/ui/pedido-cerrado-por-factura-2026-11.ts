// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUANDO SWITCH FACTURA UN PEDIDO, SE CIERRA SOLO (24-nov-2026, aprobado por
// Daniel). Medido: en 30 días 77 de 210 pedidos (37 %) se facturaron estando
// «En preparación» o «Preparado» y nadie los marcó «Recibido».
//
// Al leer el N.° de pedido de una factura (`switch_facturas.pedido_referencia`,
// lo hace el sync de facturas), si ese pedido de la MISMA empresa está En
// preparación o Preparado pasa a Recibido con la firma «Facturado en Switch ·
// <N.° de factura>» y rastro en `activity_logs`. Lógica en
// `lib/guias/pedido-cerrado-por-factura.ts`.
//
// `false` = lo de antes (solo la secretaria o la etiqueta lo reciben).
// ─────────────────────────────────────────────────────────────────────────────

export const PEDIDO_SE_CIERRA_CON_FACTURA = true;
