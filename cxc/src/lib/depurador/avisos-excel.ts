// ─────────────────────────────────────────────────────────────────────────────
// LOS AVISOS, COMPLETOS Y BAJABLES (23-sep-2026)
//
// 🩸 La vista previa decía «12 aviso(s) de datos faltantes» y dibujaba OCHO,
// con un «…y 4 más» que no llevaba a ningún lado. Si 40 artículos vienen sin
// código de barra, la persona ve ocho y arregla ocho.
//
// 🔴 ESTO NO CAMBIA NI UN AVISO. Los textos los sigue escribiendo `processRows`,
// uno por uno, igual que siempre. Acá solo se ordenan en filas para el Excel.
//
// Módulo PURO: sin DOM, sin xlsx. El Excel se arma en la pantalla con
// `workbookBlob` + `filtroDesdeA1`, el camino común de todo export de la casa.
// ─────────────────────────────────────────────────────────────────────────────

/** El encabezado de la hoja. Dos columnas: el número y el aviso tal cual. */
export const ENCABEZADO_AVISOS = ["#", "Aviso"] as const;

/**
 * Las filas del Excel de avisos: encabezado + un renglón por aviso, EN ORDEN.
 *
 * 🔴 Ninguno se recorta y ninguno se agrupa: el Excel se baja justamente para
 * arreglarlos todos antes de subir el archivo a Switch.
 */
export function filasDeAvisos(avisos: readonly string[]): (string | number)[][] {
  return [
    [...ENCABEZADO_AVISOS],
    ...avisos.map((texto, i) => [i + 1, texto] as (string | number)[]),
  ];
}

/** El nombre del archivo que se baja. Lleva la fecha para que dos corridas del
 *  mismo día no se pisen en la carpeta de Descargas. */
export function nombreArchivoAvisos(hoy: string): string {
  return `Avisos-plantilla-switch-${hoy.slice(0, 10)}.xlsx`;
}

/** El rótulo del botón. Una constante para que no se escriba a mano dos veces. */
export const ROTULO_BAJAR_AVISOS = "Bajar la lista";
