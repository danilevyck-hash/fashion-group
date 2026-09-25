// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS COLUMNAS QUE NACIERON EL 25-sep-2026, Y CÓMO SE FALLA ABIERTO.
//
// `asistencia_marcaciones.lugar_texto` (la dirección en palabras) y
// `asistencia_marcaciones.aparato_id` (el sello del teléfono) viven en la
// migración `20261220120000_asistencia_lugar_y_aparato.sql`, que Daniel aplica
// cuando quiera.
//
// 🔴 MIENTRAS NO ESTÉ, MARCAR TIENE QUE SEGUIR FUNCIONANDO IGUAL. Es lo
// contrario de lo que hace `faltaLaMigracion` con las columnas de septiembre
// —ahí la pantalla NACÍA con la migración, así que degradar habría sido guardar
// algo que no es la marca—. Acá las dos columnas son un EXTRA: sin ellas, la
// marca de siempre entra tal cual y lo único que se pierde es la calle y el
// sello.
//
// Por eso la ruta escribe la fila con los dos campos y, si la base contesta que
// no conoce una de esas columnas, la vuelve a escribir SIN ellas. No hay
// pregunta previa al esquema: una consulta de más en cada marca para un caso
// que dura hasta que alguien corra un archivo.
// ─────────────────────────────────────────────────────────────────────────────

/** Las columnas que la migración agrega. Nada más. */
export const COLUMNAS_NUEVAS = ["lugar_texto", "aparato_id"] as const;

/**
 * ¿Este error es «la base todavía no tiene una de las dos columnas nuevas»?
 *
 * Se exige las DOS cosas: que el error NOMBRE una de ellas y que sea de los
 * códigos de «columna desconocida». Un error de otra cosa que casualmente
 * mencione la palabra no puede hacer que la marca se reescriba en silencio.
 */
export function faltaUnaColumnaNueva(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  if (!COLUMNAS_NUEVAS.some((c) => msg.includes(c))) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    msg.includes("could not find") ||
    msg.includes("does not exist")
  );
}

/** La misma fila, sin las dos columnas nuevas. No toca nada más. */
export function sinLasColumnasNuevas<T extends Record<string, unknown>>(fila: T): T {
  const copia = { ...fila };
  for (const c of COLUMNAS_NUEVAS) delete copia[c];
  return copia;
}
