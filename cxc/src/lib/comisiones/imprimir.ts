// ─────────────────────────────────────────────────────────────────────────────
// 🔄 SIN LECTORES DESDE EL 9-SEP-2026 — Y NO SE BORRA (patrón de la casa).
//
// Los tres papeles del módulo (el reporte de un vendedor, la matriz del mes y la
// del año) son PDF armados en código y ya no pasan por `window.print()`, así que
// nadie llama a esta función. Se conserva porque es la memoria del defecto: el
// día que algo del sistema vuelva a imprimir por el navegador, el archivo NO
// puede llamarse «Fashion Group.pdf» ni dejar la pestaña de toda la app
// renombrada. Escribir esto de nuevo sería repetir el error de cero.
//
// ── Lo que decía cuando tenía lectores ───────────────────────────────────────
// IMPRIMIR CON EL NOMBRE CORRECTO — y devolver el título como estaba.
//
// 🩸 EL PDF SE LLAMABA «Fashion Group.pdf» (6-sep-2026). El reporte se imprime
// con `window.print()` y Chrome nombra el archivo con el `document.title`, que
// en toda la app es «Fashion Group»: los doce reportes de un cierre de mes
// bajaban con el mismo nombre.
//
// 🔴 VIVE EN UN SOLO LUGAR (8-sep-2026). Nació dentro de
// `ComisionesDetalleModal`; desde que la flechita de la celda también imprime
// —sin abrir el detalle— habría hecho falta una segunda copia, que es cómo se
// llega a que un camino restaure el título y el otro deje la pestaña de toda la
// app renombrada.
//
// `afterprint` cubre el caso normal Y el de CANCELAR el diálogo, que es el que
// se olvida; el `setTimeout` es la red por si algún navegador no lo dispara.
// ─────────────────────────────────────────────────────────────────────────────

export function imprimirComo(nombre: string): void {
  const anterior = document.title;
  const restaurar = () => {
    document.title = anterior;
    window.removeEventListener("afterprint", restaurar);
  };
  document.title = nombre;
  window.addEventListener("afterprint", restaurar);
  window.setTimeout(restaurar, 60_000);
  window.print();
}
