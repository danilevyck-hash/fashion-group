/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 UN SOLO AVISO EN LÍNEA (2-oct-2026). PURO: sin base ni red.
 *
 * Daniel, viendo la caja ámbar de Comprobantes («Este pedido ya está en Switch…»
 * con el botón negro en su propia línea) y la de Asistencia (el punto naranja
 * solo en la primera línea): *«esto se puede optimizar, esos tipos de mensaje
 * across el sistema»*.
 *
 * La regla (docs/diseno.md › «Detalles aprendidos»): todo aviso dentro de una
 * pantalla es `<Aviso>` (`src/components/ui/Aviso.tsx`): ícono a la izquierda,
 * texto corto y la acción a la DERECHA en la misma fila; en el celular, si no
 * cabe, la acción baja alineada a la derecha. Tonos de la paleta: aviso ámbar,
 * error rojo, información gris, éxito verde.
 *
 * `false` = cada pantalla dibujaba su caja de antes (`legado`). Con el «sí» de
 * Daniel las cajas de antes se borraron: apagarlo ya no las trae de vuelta.
 * Candado: `src/__tests__/components/aviso-en-linea.test.tsx`.
 * ──────────────────────────────────────────────────────────────────────────── */

// Daniel aprobó el 2-oct-2026: «todo lo demás ok, arregla lo que empeoraste y
// aprobado». Excepción: la nota del rol propio en Usuarios › Editar usuario.
export const AVISOS_2026_10 = true;
