// EL CARRITO VIVE EN LA SESIÓN DE LA PESTAÑA — no en localStorage.
//
// Daniel, 12-ago-2026, textual: *"el carrito no te debe de guardar cuando sales
// del catálogo, no es natural y está creando fricción (así como cuando entro
// después de 2 semanas y veo artículos seleccionados). lo normal es entrar,
// hacer pedido e irse"*. El matiz aprobado: vida de SESIÓN, no de un solo
// render — el carrito tiene que sobrevivir navegar dentro de la misma pestaña
// (catálogo → ficha → checkout), un refresh accidental y el teléfono que se
// bloquea a mitad de un pedido de 40 líneas; y morir al cerrar la pestaña.
// Eso es exactamente `sessionStorage`.
//
// Antes convivían DOS almacenamientos: `sessionStorage` (solo Reebok) y
// `localStorage` (las 4 marcas), leídos en cascada y escritos los dos. O sea
// que el carrito de Reebok "moría" con la sesión solo en apariencia: al no
// encontrar la copia de sesión caía en la de localStorage y resucitaba el
// pedido de hace dos semanas. Por eso la clave es UNA sola (`cartKey`) y el
// único lugar donde se guarda es la sesión.
//
// LOS CARRITOS YA GUARDADOS SE LEEN UNA ÚLTIMA VEZ Y SE LIMPIAN. Descartar en
// silencio el trabajo a medias de alguien que dejó 40 líneas armadas anoche
// sería el peor estreno posible de este cambio: la primera lectura de cada
// clave migra lo que hubiera en localStorage a la sesión y BORRA la copia
// vieja, así que sobrevive una vez —la de hoy— y nunca más.
//
// Fallback en memoria: si el navegador no deja usar `sessionStorage` (Safari en
// modo privado viejo, cuota llena), el carrito igual sobrevive las navegaciones
// del cliente —que en Next son client-side y conservan el módulo vivo— en vez
// de vaciarse entre el grid y el checkout.

// Respaldo en memoria: SOLO se usa cuando el navegador no deja escribir en
// sessionStorage. Mientras la sesión funcione, este Map queda vacío — un espejo
// permanente sería un segundo carrito que puede quedar desincronizado del real.
const memoria = new Map<string, string>();

function leerCrudo(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return memoria.get(key) ?? null;
  }
}

function escribirCrudo(key: string, valor: string): void {
  try {
    sessionStorage.setItem(key, valor);
    memoria.delete(key);
  } catch {
    memoria.set(key, valor);
  }
}

/** Borra la copia vieja en localStorage (el esquema que se retiró). */
function borrarResto(key: string): void {
  try { localStorage.removeItem(key); } catch { /* */ }
}

function parsear<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return []; // data corrupta — carrito vacío
  }
}

/**
 * Carrito de la sesión. Si no hay nada en la sesión, migra por ÚNICA vez lo que
 * quedó en localStorage del esquema anterior (y lo borra de ahí).
 */
export function leerCarrito<T>(key: string): T[] {
  const enSesion = leerCrudo(key);
  if (enSesion !== null) {
    borrarResto(key);
    return parsear<T>(enSesion);
  }
  let viejo: string | null = null;
  try { viejo = localStorage.getItem(key); } catch { /* */ }
  borrarResto(key);
  const items = parsear<T>(viejo);
  if (items.length > 0) escribirCrudo(key, JSON.stringify(items));
  return items;
}

/** Guarda el carrito en la sesión (y limpia cualquier resto del esquema viejo). */
export function guardarCarrito(key: string, items: unknown[]): void {
  escribirCrudo(key, JSON.stringify(items));
  borrarResto(key);
}

/** Vacía el carrito: sesión, memoria y el resto viejo de localStorage. */
export function limpiarCarrito(key: string): void {
  memoria.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* */ }
  borrarResto(key);
}
