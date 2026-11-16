// ─────────────────────────────────────────────────────────────────────────────
// EL GESTO DE VOLVER CIERRA LO QUE SE ABRIÓ (16-nov-2026, aprobado por Daniel).
//
// En el celular, el detalle de un pedido y las hojas que suben desde abajo no
// se sumaban al historial: el gesto de volver de iOS sacaba del módulo. Ahora
// abrir suma una entrada, volver la cierra (`useAtrasCierra`), las pestañas de
// Despachos se abren como pantalla y «‹ Volver» sube con `subirA()`.
// `false` = como estaba antes. Candado: `atras-cierra.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

export const ATRAS_CIERRA_2026_11 = true;
