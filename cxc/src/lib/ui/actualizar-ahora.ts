/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA CASA DICE «ACTUALIZAR AHORA», Y NADA MÁS (18-sep-2026).
 *
 * Daniel, viendo el botón nuevo de Etiquetas: *«¿no prefieres Actualizar
 * ahora?»*. Y tiene razón: es lo que dice el resto del sistema.
 *
 * ── 🩸 HABÍA TRES PALABRAS PARA LA MISMA ACCIÓN ─────────────────────────────
 *
 *   · **«Actualizar ahora»** — CXC, Catálogos, Proveedores, Referencia y
 *     Multifashion, o sea la mayoría: `SyncNowButton`.
 *   · **«Buscar otra vez»** — Guías, en el selector de facturas de Nueva guía.
 *   · **«Traer de Switch ahora»** — Etiquetas, estrenado el 17-sep-2026.
 *
 * Las tres hacen lo mismo para quien las toca: ir a buscar datos frescos y
 * volver a dibujar la pantalla. Tres nombres no le enseñan nada a nadie; le
 * hacen dudar de si son tres cosas distintas. Desde hoy son UNA palabra, y
 * estos dos textos viven acá para que la cuarta no se estrene por descuido.
 *
 * ── ⚠️ LA EXCEPCIÓN, Y ES DE VERDAD ────────────────────────────────────────
 *
 * **«Traer ahora» de Asistencia** (`EstadoReloj.tsx`) NO es esto y no se tocó:
 * ése no lee nada, le deja un pedido a una PC concreta para que EMPUJE las
 * marcaciones de SU reloj cuando vuelva a mirar el buzón. Su texto está
 * explicado en su propio archivo. Distinta acción, distinto nombre.
 * ────────────────────────────────────────────────────────────────────────── */

/** Lo que dice el botón que va a buscar datos frescos. En TODO el sistema. */
export const TEXTO_ACTUALIZAR_AHORA = "Actualizar ahora";

/** Lo que dice ese mismo botón mientras corre. */
export const TEXTO_ACTUALIZANDO = "Actualizando…";
