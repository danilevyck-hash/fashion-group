// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL VIDRIO DE iOS 26 («liquid glass»), UNO PARA TODO EL SISTEMA (2-oct-2026).
//
// Daniel lo pidió para los menús desplegables. Se usa donde Apple lo usa:
// menús desplegables, hojas que suben, el botón ☰ y la barra fija de abajo.
// Fondo translúcido con desenfoque, borde fino blanco y sombra suave; el radio
// lo pone cada pieza (16 px en paneles, redondo en el ☰).
//
// 🔑 La clase `vidrio` vive en `globals.css`: si el navegador no sabe
// desenfocar (`backdrop-filter`), cae a blanco SÓLIDO —nunca a un fondo
// transparente que deje leer lo de atrás—.
//
// Interruptor `VIDRIO_2026_10`: en `false`, cada pieza conserva su clase de hoy
// letra por letra.
//
// 🔴 UNA SOLA FUENTE (2-oct-2026). Otra rama (agente a3e1968c, catálogo)
// creó su propia constante `VIDRIO` en este mismo archivo, con la receta en
// clases de Tailwind. Al unir, queda ESTE archivo: `VIDRIO` sigue existiendo
// con el mismo nombre (apunta a la clase de `globals.css`), así sus usos en
// `FiltroPrecioChip` y `CatalogoFilters` no cambian. Esa rama tiene que usar
// `vidrioSobre()` o `VIDRIO` de aquí, nunca otra receta.
//
// 🔴 Los `<select>` NATIVOS no se tocan: en el iPhone abren el menú de iOS,
// que en iOS 26 ya es liquid glass.
//
// Candado: `navegacion/vidrio-en-todos-los-menus.test.ts` barre el código y
// falla si un menú o desplegable nuevo no pasa por aquí.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = los menús, hojas, ☰ y barras como estaban.
 *  Daniel aprobó el 2-oct-2026 el liquid glass en los menús: prendido. */
export const VIDRIO_2026_10 = true;

/** 🔴 VIDRIO v2 (2-oct-2026), más cerca del liquid glass de iOS 26: fondo 40 %,
 *  desenfoque 36 px, saturación 200 %, filo blanco arriba que se desvanece,
 *  sombra con tinte y radio 20 px. Cambia SOLO la receta de `.vidrio` en
 *  `globals.css` (se prende con `<html data-vidrio="v2">` en `app/layout.tsx`):
 *  todas las piezas la heredan. `false` = la receta de hoy. */
export const VIDRIO_V2_2026_10 = false;

/** La clase compartida (definida en `globals.css`). */
export const CLASE_VIDRIO = "vidrio";

/** El radio de los paneles de vidrio: 16 px (entre los 14 y 18 de iOS 26). */
export const RADIO_VIDRIO = "rounded-2xl";

/**
 * La clase de una pieza: apagado, la de siempre; prendido, la de vidrio. Se
 * escriben las DOS enteras para que apagar devuelva exactamente lo de hoy.
 */
export function conVidrio(antes: string, vidrio: string, interruptor: boolean = VIDRIO_2026_10): string {
  return interruptor ? vidrio : antes;
}

/** El panel de vidrio con su radio, listo para pegar (nombre de la otra rama). */
export const VIDRIO = `${CLASE_VIDRIO} ${RADIO_VIDRIO}`;

/**
 * Lo que se le quita a un panel blanco para volverlo vidrio: su fondo, su
 * borde, su sombra y su radio (el vidrio trae los suyos). También el `vidrio`
 * ya puesto: aplicarlo dos veces (CatalogoFilters → DesplegableFlotante) no lo
 * repite.
 */
const PROPIO_DEL_PANEL = /^(vidrio|bg-white(\/\d+)?|border|border-(gray|black)-[\w/]+|border-black\/\d+|shadow(-[\w\[\]\/(),.-]+)?|rounded(-[\w\[\]]+)?|ring-\d|ring-black\/\d+|backdrop-[\w-]+)$/;

/**
 * Vuelve vidrio cualquier panel de menú o desplegable SIN reescribir su clase:
 * apagado devuelve la de hoy tal cual; prendido le quita fondo, borde, sombra
 * y radio, y le pone `vidrio` con 16 px. El resto (posición, ancho, padding)
 * queda igual.
 */
export function vidrioSobre(clases: string, interruptor: boolean = VIDRIO_2026_10): string {
  if (!interruptor) return clases;
  const limpias = clases.split(/\s+/).filter((c) => c && !PROPIO_DEL_PANEL.test(c));
  return [...limpias, CLASE_VIDRIO, RADIO_VIDRIO].join(" ");
}
