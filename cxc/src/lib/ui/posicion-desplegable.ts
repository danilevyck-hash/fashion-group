// Dónde poner un desplegable que FLOTA por encima de todo (portal + position
// fixed), para que no se meta en el flujo de la tabla que lo contiene.
//
// 🩸 POR QUÉ EXISTE ESTE MÓDULO (30-jul-2026). El selector de cliente de Guías
// dibujaba su lista como `absolute` DENTRO de la fila. La fila vive en un
// `ScrollableTable`, que es un `overflow-x-auto` — y `overflow-x: auto` con
// `overflow-y: visible` computa `overflow-y: auto`: el contenedor RECORTA y, si
// el contenido lo pasa, se vuelve scrolleable. Medido en producción (1440×900,
// build de producción, sesión sembrada):
//
//   cerrado  → scrollHeight 114 == clientHeight 114  (nada que scrollear)
//   abierto  → scrollHeight 397 vs clientHeight 114  (283 px scrolleables)
//              de los 81 px de la lista se veían 5: 76 px recortados
//   al scrollear esos 283 px, la fila entera se va de y=612 a y=329
//
// O sea: abrir la lista convertía la fila en una ventanita con scroll propio, la
// fila se iba para arriba por debajo del `thead` sticky y en el hueco quedaba un
// pedazo de la lista, justo encima de donde estaban DIRECCIÓN / EMPRESA /
// FACTURA(S). Eso es lo que Daniel fotografió y describió como
// *"se esconde… es problema mas de ux"*: no perdía lo tecleado — dejaba de VERLO.
//
// La cura no es ensanchar la tabla ni subir el z-index: mientras la lista sea
// hija del contenedor que recorta, el recorte gana SIEMPRE. Tiene que salir del
// flujo (portal a <body>) y posicionarse en coordenadas de viewport (`fixed`).
// Eso es lo que calcula este módulo, y es PURO para poder probarlo sin layout:
// jsdom no calcula cajas, así que la aritmética se prueba con números a mano.

export interface Ancla {
  /** Caja del campo que abre la lista, en coordenadas de VIEWPORT. */
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PosicionDesplegable {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /** Hacia dónde se abrió, para que el componente lo pueda anunciar/animar. */
  hacia: "abajo" | "arriba";
}

/** Aire entre el campo y la lista (equivalente al `mt-1` de antes). */
export const SEPARACION = 4;
/** Margen mínimo contra los bordes de la pantalla. */
export const MARGEN = 8;
/**
 * Ancho mínimo. Las columnas de la tabla dan ~215 px y los nombres del
 * directorio son largos ("CIA ALIMENTOS DE ANIMALES S.A"): con el ancho de la
 * columna a secas, la lista se lee truncada. El desplegable puede ser MÁS ancho
 * que el campo justamente porque flota.
 */
export const ANCHO_MINIMO = 264;
/** Alto máximo que se le permite (equivale al `max-h-72` de Tailwind). */
export const ALTO_MAXIMO = 288;
/**
 * Alto que hace que valga la pena abrir hacia abajo. Por debajo de esto se
 * prefiere arriba si arriba hay más lugar: 3 opciones de 44 px.
 */
export const ALTO_UTIL_MINIMO = 132;

function acotar(v: number, min: number, max: number): number {
  // Ojo con el orden: si `max < min` (pantalla más angosta que ANCHO_MINIMO),
  // Math.min primero y Math.max después deja `min` ganando, que es lo que
  // queremos — nunca un ancho negativo.
  return Math.max(min, Math.min(v, max));
}

/**
 * Calcula dónde dibujar la lista flotante.
 *
 * Garantías (todas cubiertas por `posicion-desplegable.test.ts`):
 *  - nunca se sale de la pantalla por ningún borde;
 *  - abajo si hay lugar, arriba si abajo no alcanza y arriba sí;
 *  - `maxHeight` siempre cabe en el espacio elegido → no hay recorte invisible;
 *  - el ancho arranca en el del campo y crece hasta `ANCHO_MINIMO` si el campo
 *    es más angosto, sin pasarse del ancho de la pantalla.
 */
export function calcularPosicionDesplegable(
  ancla: Ancla,
  viewport: Viewport,
  altoDeseado = ALTO_MAXIMO,
): PosicionDesplegable {
  const width = acotar(ancla.width, ANCHO_MINIMO, Math.max(0, viewport.width - MARGEN * 2));
  const left = acotar(ancla.left, MARGEN, Math.max(MARGEN, viewport.width - width - MARGEN));

  const espacioAbajo = viewport.height - ancla.bottom - SEPARACION - MARGEN;
  const espacioArriba = ancla.top - SEPARACION - MARGEN;

  const tope = Math.min(altoDeseado, ALTO_MAXIMO);
  // Abajo es el default. Solo se voltea si abajo no da un alto útil Y arriba da
  // más lugar: preferir abajo evita que la lista tape el campo con el teclado
  // del iPhone abierto.
  const abajoAlcanza = espacioAbajo >= Math.min(tope, ALTO_UTIL_MINIMO);
  const hacia: "abajo" | "arriba" = abajoAlcanza || espacioArriba <= espacioAbajo ? "abajo" : "arriba";

  if (hacia === "abajo") {
    return {
      top: ancla.bottom + SEPARACION,
      left,
      width,
      maxHeight: Math.max(0, Math.min(tope, espacioAbajo)),
      hacia,
    };
  }

  const maxHeight = Math.max(0, Math.min(tope, espacioArriba));
  return { top: ancla.top - SEPARACION - maxHeight, left, width, maxHeight, hacia };
}
