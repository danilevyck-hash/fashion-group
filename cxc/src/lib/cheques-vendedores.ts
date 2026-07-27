// Piezas compartidas de la lista de vendedores de Cheques — "quién entregó el
// cheque".
//
// Viven fuera del `route.ts` por dos razones: un archivo de ruta de Next solo
// puede exportar los nombres del contrato de rutas (GET, POST, dynamic…) y
// cualquier otro export rompe el build; y el formulario del cliente necesita el
// MISMO valor por defecto, que si no habría que escribir dos veces.
//
// El porqué de todo esto está en
// `supabase/migrations/20260727160000_cheque_vendedores.sql`.

/** Tabla que respalda la lista. Mientras el DDL no corra, no existe. */
export const TABLA_CHEQUE_VENDEDORES = "cheque_vendedores";

/**
 * Los dos de siempre. Son a la vez la semilla de la migración y la respuesta
 * mientras el DDL no se haya corrido: el desplegable nunca queda vacío, y el
 * vendedor es obligatorio para guardar un cheque.
 */
export const VENDEDORES_POR_DEFECTO = ["Rey", "Edwin"];

/** Clave donde la versión vieja (pre-base) guardaba la lista en el navegador. */
export const LS_CHEQUE_VENDEDORES = "fg_cheque_vendedores";

/**
 * ¿El error de PostgREST dice que la tabla no existe? Mismo criterio que
 * `api/admin/vendedor-mapping` y `api/multifashion/caja`.
 */
export function tablaAusente(err: { code?: string; message?: string } | null): boolean {
  return !!err && /PGRST205|does not exist|could not find the table/i.test(`${err.code} ${err.message}`);
}
