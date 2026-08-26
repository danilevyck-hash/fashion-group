// ─────────────────────────────────────────────────────────────────────────────
// ¿LA GUÍA SE ABRE CON EL FORMULARIO YA ABIERTO?  (módulo PURO)
//
// 🩸 POR QUÉ EXISTE: EL PARPADEO. La página de una guía nacía en modo LECTURA
// (`useState(false)`) y recién DESPUÉS del primer dibujo un `useEffect` leía
// `?editar=1` y la pasaba a edición. O sea que tocar «Editar» en la lista
// pintaba la pantalla de lectura entera —datos, envíos, bloque de despacho— y
// un instante después la reemplazaba por el formulario. Medido con capturas en
// secuencia: a los 100 ms se veía la pantalla equivocada.
//
// 🔑 EL ARREGLO NO ES UN `useEffect` MÁS RÁPIDO: es leer la URL **antes** del
// primer dibujo, en el inicializador perezoso de `useState`. Para eso la
// lectura tiene que ser una función pura que se pueda llamar desde ahí (y
// probar sin navegador), y no un efecto.
//
// ⚠️ Se lee de `window.location` y NO con `useSearchParams`: ese hook obliga a
// envolver la página en un `<Suspense>` para poder compilarla, y además su
// valor tampoco está disponible antes del primer dibujo.
// ─────────────────────────────────────────────────────────────────────────────

/** El query que abre la guía con el formulario abierto. Una sola puerta. */
export const QUERY_EDITAR = "editar";

/**
 * ¿Este query string pide abrir la guía en edición?
 *
 * @param search  `window.location.search` — con o sin el "?" de adelante.
 */
export function abrirEnEdicion(search: string | null | undefined): boolean {
  try {
    return new URLSearchParams(String(search ?? "")).get(QUERY_EDITAR) === "1";
  } catch {
    // Un query roto no puede tumbar la pantalla: se abre en lectura.
    return false;
  }
}

/**
 * La URL de la guía con —o sin— el formulario abierto.
 *
 * 🩸 Al cerrar la edición, la URL seguía diciendo `?editar=1`: recargar,
 * compartir el enlace o darle "atrás" volvía a abrir el formulario que la
 * persona acababa de cerrar. La dirección tiene que decir lo que se está
 * viendo.
 *
 * ⚠️ Se conservan los demás parámetros que traiga la URL: quitarlos sería
 * romper cualquier enlace que llegue con contexto de otra pantalla.
 */
export function urlDeLaGuia(id: string, editando: boolean, search: string | null | undefined = ""): string {
  const p = new URLSearchParams(String(search ?? ""));
  if (editando) p.set(QUERY_EDITAR, "1");
  else p.delete(QUERY_EDITAR);
  const q = p.toString();
  return q ? `/guias/${id}?${q}` : `/guias/${id}`;
}
