// ─────────────────────────────────────────────────────────────────────────────
// Permiso 0001 de Switch (cambiar el precio de una línea) — UNA consulta, no
// una por toque.
//
// La doc de Switch (pág. 11) exige verificar el proceso 0001 antes de mandar un
// precio distinto al de lista. Hasta hoy eso se preguntaba AL FINAL, dentro de
// la pre-validación del envío: Daniel armaba el pedido entero, editaba precios,
// tocaba enviar y recién ahí se enteraba de que no podía. Ahora se pregunta en
// cuanto aparece el primer precio editado — y para que eso no multiplique los
// logins contra Switch, la respuesta se cachea acá y la comparten los DOS
// caminos (la pantalla mientras edita y el motor al enviar).
//
// ⚠️ SESIÓN ÚNICA POR EMPRESA. Cada marca es una empresa de Switch con su
// propio usuario de API y Switch admite UN solo login por empresa: un segundo
// login mata al primero (code 0006). Por eso el caché existe y por eso lo usan
// los dos lados — con él, el sistema hace MENOS logins que antes, no más:
// preguntar mientras se edita y volver a preguntar al enviar cuesta UNA sola
// consulta dentro de la ventana.
//
// 🔴 EL `false` NO SE CACHEA, y no es un olvido. Un "no tenés permiso" manda a
// pedírselo al administrador de Switch; si la negativa quedara pegada, el
// reintento seguiría fallando después de que se lo dieran. Se cachea el SÍ
// (que es el caso normal y el que se repite) y se cachea el ERROR por poco
// tiempo (para no martillar a Switch cuando está caído), nunca la negativa.
//
// 🔴 FAIL-OPEN: si no se puede verificar, `permiso: true` + `verificado: false`
// → aviso y seguir, que es exactamente lo que hacía el motor antes. Endurecerlo
// de contrabando dejaría a Daniel sin poder enviar cada vez que Switch tosa.
// ─────────────────────────────────────────────────────────────────────────────

/** Proceso de Switch que habilita cambiar el precio de una línea. */
export const PROCESO_CAMBIO_PRECIO = "0001";

/** Cuánto vale un "sí" antes de volver a preguntarle a Switch. */
export const TTL_PERMISO_OK_MS = 15 * 60 * 1000;
/** Cuánto se espera tras un fallo de consulta antes de reintentar. */
export const TTL_PERMISO_ERROR_MS = 60 * 1000;

/** Texto ÚNICO del bloqueo (lo muestran la pantalla y la pre-validación). */
export const TEXTO_SIN_PERMISO_PRECIO =
  "El usuario de Switch no tiene permiso para cambiar precios (proceso 0001) — pedirlo al administrador de Switch o usar el precio de lista";
/** Texto ÚNICO del fail-open. */
export const TEXTO_PERMISO_NO_VERIFICADO =
  "No se pudo verificar el permiso de cambio de precio (0001) — se intenta el envío igual";

export interface PermisoPrecio {
  /** ¿Se puede mandar un precio distinto al de lista? (fail-open = true) */
  permiso: boolean;
  /** ¿La respuesta viene de Switch, o es el fail-open? */
  verificado: boolean;
}

interface Entrada {
  valor: PermisoPrecio;
  expira: number;
}

const cache = new Map<string, Entrada>();

/**
 * Permiso 0001 de una empresa, cacheado.
 *
 * `verificar` se inyecta (no se importa el client de Switch acá) para que este
 * módulo siga siendo trivial de testear y para que el llamador decida con qué
 * empresa/token se pregunta.
 */
export async function permisoCambiarPrecio(
  empresaKey: string,
  verificar: () => Promise<boolean>,
  ahora: number = Date.now(),
): Promise<PermisoPrecio> {
  const cacheado = cache.get(empresaKey);
  if (cacheado && cacheado.expira > ahora) return cacheado.valor;

  try {
    const permiso = await verificar();
    const valor: PermisoPrecio = { permiso, verificado: true };
    // Solo el "sí" se guarda: ver la nota de cabecera.
    if (permiso) cache.set(empresaKey, { valor, expira: ahora + TTL_PERMISO_OK_MS });
    else cache.delete(empresaKey);
    return valor;
  } catch {
    const valor: PermisoPrecio = { permiso: true, verificado: false };
    cache.set(empresaKey, { valor, expira: ahora + TTL_PERMISO_ERROR_MS });
    return valor;
  }
}

/** Solo para tests: vacía el caché entre casos. */
export function _resetCachePermisoPrecio(): void {
  cache.clear();
}
