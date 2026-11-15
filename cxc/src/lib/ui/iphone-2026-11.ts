/* ─────────────────────────────────────────────────────────────────────────────
 * Arreglos del iPhone (15-nov-2026), aprobados por Daniel en los mockups
 * ios2-01..03. Solo pantalla: ninguna cuenta ni dato cambia.
 * `false` = la pantalla de antes.
 * ──────────────────────────────────────────────────────────────────────────── */

/** ios2-01: los campos de monto y cantidad abren el teclado numérico del iPhone. */
export const TECLADO_NUMERICO_2026_11 = true;

/** Monto (lleva punto): `<input type="number" {...TECLADO_DECIMAL} …>`. */
export const TECLADO_DECIMAL: { inputMode?: "decimal" } = TECLADO_NUMERICO_2026_11 ? { inputMode: "decimal" } : {};

/** Cantidad o año (sin punto). */
export const TECLADO_ENTERO: { inputMode?: "numeric" } = TECLADO_NUMERICO_2026_11 ? { inputMode: "numeric" } : {};

/** ios2-02: Usuarios › Nuevo/Editar usuario — en el celular «Guardar» sube a la cabecera, junto a la ✕. */
export const USUARIO_GUARDAR_ARRIBA_2026_11 = true;

/** ios2-03: Comisiones en el celular — las flechas ‹ › del mes se tocan en 44 × 44. */
export const COMISIONES_FLECHAS_44_2026_11 = true;
