// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLAMA UN CLIENTE EN PANTALLA — un solo lugar, no regado.
//
// El código `D-XXX` es plomería: sirve para atar, no para leer. Un chip que
// dice `D-108` y nada más no le dice nada a nadie — Daniel, textual:
// *"quiero que se llame american classics store en guia porque sino el personal
// no va a saber"*.
//
// 🩸 POR QUÉ EXISTE EL ALIAS, y por qué es UNO y no una tabla nueva. D-108 se
// llama **"Multi Fashion Holding"** en `clientes_master` — la razón social. El
// personal de bodega no la reconoce: para ellos ese destino SIEMPRE fue
// "American Classics Store". Mostrar el nombre oficial sería cambiar `D-108`
// (que no dice nada) por un nombre que tampoco dice nada. El alias es de
// DISPLAY: la base no se toca, el sync de Switch sigue mandando el nombre
// oficial, y si algún día se corrige allá, se borra la línea de acá.
//
// ⚠️ EL ALIAS TAMBIÉN TIENE QUE SER BUSCABLE, y esto NO es un detalle. Medido
// contra producción el 9-ago-2026 con el mismo matcher del selector:
//     "american classics store" → 0 coincidencias
//     "multifashion"            → 1  (D-108)
// O sea: sin agregar el alias a los campos de búsqueda, el chip enseñaría un
// nombre que, tecleado en el selector, NO ENCUENTRA NADA. Una pantalla que se
// contradice a sí misma es peor que la que solo mostraba el código. Por eso
// `camposDeBusquedaCliente()` vive acá al lado del alias: el que muestra y el
// que busca leen la MISMA lista, así que no pueden divergir.
//
// ⚠️ NO es un renombre ni un "mapa de correcciones". Cada entrada nueva es una
// verdad más que la app dice y la base no — se agregan de a una, con el pedido
// explícito de Daniel detrás, y lo correcto a la larga es arreglarlo en Switch.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Código D-XXX → cómo lo llama el personal.
 *
 * D-108 · "Multi Fashion Holding" en la base, "American Classics Store" para
 * quien despacha. (⚠️ `D-201 "American Classics"` es un DUPLICADO sin respaldo
 * en Switch — 0 facturas, 0 CXC. No se le pone alias: no se lo hace más fácil
 * de elegir.)
 */
export const ALIAS_DISPLAY_CLIENTE: Readonly<Record<string, string>> = {
  "D-108": "American Classics Store",
};

/** Normaliza un código para buscarlo en el alias: `" d-108 "` → `"D-108"`. */
function normalizarCodigo(codigo: string | null | undefined): string {
  return (codigo ?? "").trim().toUpperCase();
}

/**
 * El nombre que se muestra: el alias si lo hay, si no el nombre de la base.
 *
 * Devuelve `""` cuando no hay ni alias ni nombre — quien llama decide qué
 * poner en su lugar (el chip, por ejemplo, se queda solo con el código). Nunca
 * inventa un texto.
 */
export function nombreParaMostrar(
  codigo: string | null | undefined,
  nombreOficial?: string | null,
): string {
  const alias = ALIAS_DISPLAY_CLIENTE[normalizarCodigo(codigo)];
  if (alias) return alias;
  return (nombreOficial ?? "").trim();
}

/** Lo mínimo que hace falta para nombrar y buscar un cliente. */
export interface ClienteNombrable {
  codigo?: string | null;
  nombre?: string | null;
  razon_social?: string | null;
}

/**
 * Los campos contra los que se compara una búsqueda de cliente.
 *
 * Nombre + razón social + código, MÁS el alias de display. Se le pasa tal cual
 * a `coincideBusqueda`, que se encarga de ignorar espacios, acentos y
 * mayúsculas. Es la lista ÚNICA: el selector del navegador y el endpoint la
 * usan igual, así que no puede haber dos resultados distintos para la misma
 * consulta según quién filtre.
 */
export function camposDeBusquedaCliente(c: ClienteNombrable): (string | null | undefined)[] {
  const alias = ALIAS_DISPLAY_CLIENTE[normalizarCodigo(c.codigo)];
  return alias
    ? [c.nombre, c.razon_social, c.codigo, alias]
    : [c.nombre, c.razon_social, c.codigo];
}
