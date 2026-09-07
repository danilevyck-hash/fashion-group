/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LO QUE SE RETIRÓ Y NO SE BORRA (7-sep-2026).
 *
 * Cinco caminos que nadie usó nunca salieron de la pantalla. Las COLUMNAS que
 * los alimentaban **no se dropean** (mismo patrón que `mayor_lineas`,
 * `cxc_favorites` y las cinco de `guia_transporte`): quedan sin lectores ni
 * escritores, con su `COMMENT` en la base, y con un candado que pone el build
 * ROJO si una migración las borra o si el código vuelve a tocarlas.
 *
 * Medido contra producción (77 gastos vivos, 3 períodos):
 *   · `caja_gastos.empresa`      — vacía en 61 de 77; no se muestra ni se
 *                                  puede escribir desde ninguna pantalla;
 *   · `caja_gastos.factura`      — vacía en 75 de 77 (la real es `nro_factura`);
 *   · `caja_gastos.ruc`          — vacía en 75 de 77;
 *   · `caja_gastos.dv`           — vacía en 77 de 77;
 *   · `caja_gastos.responsable`  — el NOMBRE como texto, con tres escrituras
 *   · `caja_gastos.responsable_id`  distintas para la misma persona; la
 *                                  responsable pasó a ser del PERÍODO;
 *   · `caja_periodos.repuesto`   — «Aprobar reposición» tuvo 0 usos en toda
 *   · `caja_periodos.repuesto_at`  su historia.
 *
 * ⚠️ Los 77 gastos conservan lo que tienen escrito: nada se vacía, nada se
 * reescribe. Lo que se retira es la LECTURA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Columnas retiradas, por tabla. Ninguna migración puede dropearlas. */
export const COLUMNAS_RETIRADAS_CAJA: Record<string, string[]> = {
  caja_gastos: ["empresa", "factura", "ruc", "dv", "responsable", "responsable_id"],
  caja_periodos: ["repuesto", "repuesto_at"],
};

/** Rutas que se retiraron de la aplicación. No vuelven. */
export const CAMINOS_RETIRADOS_CAJA = [
  "src/app/caja/[periodoId]/nuevo/page.tsx",
];
