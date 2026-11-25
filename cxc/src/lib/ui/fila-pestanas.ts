/**
 * 🩸 La fila de pestañas de la computadora (Despachos, Confecciones Boston).
 *
 * 25-nov-2026 (foto de bodega, Windows/Chrome): al final de la fila salían dos
 * flechitas ▲▼. Era la barra de desplazamiento VERTICAL de Windows: la fila
 * tenía `overflow-x-auto` (que vuelve `auto` también el eje Y) y cada pestaña
 * bajaba 1 px con `-mb-px` para pisar el borde gris → 1 px de desborde. En la
 * Mac la barra no se ve; en Windows sí.
 *
 * Ahora la línea gris es una sombra INTERIOR de la fila (no un borde), las
 * pestañas ya no bajan 1 px, el eje Y no desplaza y la barra nativa no se
 * dibuja (en el teléfono la fila sigue corriendo de lado con el dedo).
 */
export const CLASE_FILA_PESTANAS =
  "flex items-center gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_0_theme(colors.gray.200)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
