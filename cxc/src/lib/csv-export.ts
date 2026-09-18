// ─────────────────────────────────────────────────────────────────────────────
// 🩸 ESTE ARCHIVO SE QUEDÓ SIN LECTORES EL 17-sep-2026, Y NO SE BORRA.
//
// Daniel, 8-sep-2026, textual: *«en ningún lado quiero exportar csv, solo
// excel»*. El CXC dejó de ofrecer CSV el 4-sep-2026 y el último que quedaba,
// `GET /api/reclamos/export`, se retiró hoy. Medido antes de tocarlo: ni un
// solo llamador desde `src/` — pero cualquier admin o secretaria que supiera la
// dirección se bajaba un CSV con TODOS los reclamos de todas las empresas.
//
// 🔴 EL ARCHIVO SE CONSERVA, COMO `mayor_lineas` Y `cxc_favorites`: acá está
// escrito por qué un CSV de este sistema necesita el BOM (sin él Excel en
// Windows rompe las tildes y la ñ). El día que vuelva a hacer falta un CSV
// —para una importación, no para un export— eso no se vuelve a descubrir.
//
// ⚠️ Nadie puede volver a importarlo sin que Daniel lo pida: el candado
// `reclamos-csv-retirado.test.ts` barre `src/` y pone el build ROJO.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Escapa un valor para CSV (RFC 4180): si contiene el delimitador, comillas o
 * saltos de línea, lo envuelve en comillas y DOBLA las comillas internas.
 * NUNCA mutar el dato (nada de reemplazar ";" por ","): el valor llega intacto
 * a Excel. Estándar del sistema: delimitador COMA en todos los exports
 * (decisión de Daniel 4-jul-2026); el parámetro ";" existe solo para parseo
 * de archivos externos estilo Switch.
 */
export function escapeCsvField(value: unknown, delimiter: "," | ";" = ","): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Construye las líneas CSV escapando cada campo con el delimitador dado. */
export function buildCsv(rows: unknown[][], delimiter: "," | ";" = ","): string {
  return rows.map((row) => row.map((f) => escapeCsvField(f, delimiter)).join(delimiter)).join("\n");
}
