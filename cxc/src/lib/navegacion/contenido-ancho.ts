// ─────────────────────────────────────────────────────────────────────────────
// EL CONTENIDO USA EL ANCHO DE LA PANTALLA, CENTRADO (2-oct-2026) — el interruptor.
//
// Daniel, 2-oct-2026: «lo prefiero centrado que a la izquierda, pero ¿se podrá
// que no exista el espacio en blanco como los ERP? ¿Por qué tengo espacio en
// blanco?».
//
// Por qué había blanco: cada pantalla se encerraba en SU caja centrada con un
// ancho máximo distinto (max-w-4xl, 5xl, 6xl, 7xl o 1280 px). En 1440 px con el
// menú plegado, lo que sobraba se repartía a los dos lados: de 76 px por lado
// (Comisiones) a 264 px por lado (detalle de guía).
//
// Qué cambia con `true` (solo desde 768 px, donde aparece el menú lateral):
//   · La caja de cada pantalla (la primera `mx-auto max-w-*`, de 4xl para
//     arriba) usa todo el ancho con 24 px a cada lado —los mismos del camino
//     de migas de arriba— hasta 1600 px; en un monitor más grande se centra.
//   · Nueva guía y el detalle de guía pasan a 2 columnas desde 1024 px: los
//     datos a la izquierda y los envíos a la derecha.
//   · `max-w-3xl` o menos (formularios de una sola columna) no se toca.
//   · En el celular no cambia nada.
//
// Todo vive en UN lugar: la clase que pone `SidebarAwareMain` y su regla en
// `globals.css`. Candado: `src/__tests__/navegacion/contenido-ancho.test.tsx`.
//
// 🔴 `false` = como hoy: cada pantalla en su caja.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El contenido usa el ancho de la pantalla. `false` = cada pantalla en su caja, como hoy. */
export const CONTENIDO_ANCHO_2026_10 = false;

/** La clase que activa la regla de `globals.css`. */
export const CLASE_CONTENIDO_ANCHO = "contenido-ancho";

/**
 * Las 2 columnas de un formulario o detalle, desde 1024 px: datos a la
 * izquierda (2 partes) y envíos a la derecha (3 partes). Los bloques de la
 * izquierda se acomodan solos en las filas de arriba; la última fila (`1fr`)
 * se lleva el alto que sobre, así la izquierda no se estira. Hasta 1024 px no
 * pone nada: en el celular el orden y el aire son los de siempre.
 */
export const DOS_COLUMNAS =
  "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[repeat(5,auto)_1fr] lg:gap-x-8 lg:items-start";

/** El bloque que va a la columna derecha, de arriba abajo. */
export const EN_LA_DERECHA = "lg:col-start-2 lg:row-start-1 lg:row-span-6 lg:!mt-0";

/**
 * Tipo c · fichas y formularios de UNA sola cosa (2-oct-2026). Los datos cortos
 * (código, cédula, teléfono, fecha) se acomodan en tantas columnas como quepan,
 * cada una del ancho que pide su dato: nunca una columna angosta con blanco a
 * los costados ni un campo de 1.300 px para un teléfono. Solo desde 1024 px.
 */
export const CAMPOS_A_SU_ANCHO = "lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]";

/** Tipo c · los bloques de una ficha, de a dos por fila desde 1024 px. */
export const BLOQUES_DE_A_DOS = "lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:space-y-0";
