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

/** Tabla que respalda la lista (existe desde 20260727160000_cheque_vendedores.sql). */
export const TABLA_CHEQUE_VENDEDORES = "cheque_vendedores";

/**
 * Los dos de siempre. Son la semilla de la migración y la respuesta cuando la
 * base no contesta: el desplegable nunca queda vacío, y el vendedor es
 * obligatorio para guardar un cheque.
 */
export const VENDEDORES_POR_DEFECTO = ["Rey", "Edwin"];

/** Clave donde la versión vieja (pre-base) guardaba la lista en el navegador. */
export const LS_CHEQUE_VENDEDORES = "fg_cheque_vendedores";

// Historia (jul-2026): acá vivía `tablaAusente()`, el reconocimiento de
// "PGRST205 / does not exist" con el que `api/cheques/vendedores` degradaba a
// `fuente: "local"` mientras el DDL no corriera. Tolerancia retirada el
// 3-sep-2026: la tabla existe desde 20260727160000 (verificado en producción) y
// el helper se fue con ella — nadie más lo importaba.
