// ─────────────────────────────────────────────────────────────────────────────
// Seis ajustes «como lo haría Apple» (6-oct-2026), detrás de UN interruptor.
// `false` = todo como antes. Se prende con el «sí» de Daniel al mockup.
//
// 1. Guías › Pedidos: un círculo ○ por fila (como Recordatorios de iOS) en vez
//    del botón «Pendiente». Lleno ✓ = preparado. Los permisos no cambian.
// 2. Guías › Pedidos: el título en una línea («8 pendientes · el más viejo, 43 d»)
//    con la frescura al lado si cabe.
// 3. Una sola tipografía: `font-mono` (y la cifra de Caja menuda) pasan a la
//    letra del sistema con cifras tabulares. Una sola palanca en `globals.css`
//    (`html[data-cifras="sistema"]`), que pone `layout.tsx`.
// 4. Multifashion › franja «Hoy»: una línea gris, sin monoespaciada.
// 5. Comisiones en el celular: sin «Toca para ver el detalle ⓘ» (la › ya lo dice).
// 6. Multifashion › Productos: chips «Sin venta en 90 días» y «Agotados».
// ─────────────────────────────────────────────────────────────────────────────

export const AJUSTES_APPLE_6_2026_10 = false;
