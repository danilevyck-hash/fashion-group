// Exportación de CSV compatible con Excel en Windows y Mac.
//
// Excel en Windows interpreta los CSV como ANSI/Latin-1 a menos que el archivo
// empiece con el BOM UTF-8. Sin el BOM, las tildes y la ñ se rompen
// ("Garc?a", "Pe?a"). Con el BOM, Excel detecta UTF-8 y muestra el texto bien
// en ambos sistemas operativos.
//
// Todos los CSV descargables del sistema deben construirse con estos helpers
// para garantizar el BOM y un MIME coherente con la extensión .csv.

/**
 * BOM UTF-8 (U+FEFF): marca el archivo como UTF-8 para que Excel en Windows
 * no rompa tildes/ñ. Se genera con fromCharCode para no incrustar un carácter
 * invisible en el código fuente.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);

/** MIME estándar para CSV en UTF-8. Coherente con la extensión .csv. */
export const CSV_MIME = "text/csv;charset=utf-8";

/** Blob de CSV con BOM, listo para descargar desde el cliente (anchor download). */
export function csvBlob(content: string): Blob {
  return new Blob([CSV_BOM + content], { type: CSV_MIME });
}

/** Antepone el BOM al contenido para devolver un CSV descargable desde un route (servidor). */
export function csvWithBom(content: string): string {
  return CSV_BOM + content;
}

/**
 * Quita el BOM UTF-8 inicial si existe. Usar al parsear CSVs importados:
 * los archivos guardados desde Excel (o re-subidos tras descargar) traen BOM,
 * que de otro modo se pega al primer encabezado y rompe la detección de columnas.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
