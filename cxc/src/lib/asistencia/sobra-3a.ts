// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SOBRA EN ASISTENCIA — «3a» del mockup del 25-sep-2026.
//
// Daniel aprobó quitar DOS cosas de la pantalla. Ninguna se borra de la base y
// ningún número se mueve: **se dejan de dibujar**, porque el mismo dato ya se
// dice en el lugar donde de verdad se usa.
//
//   1. **Préstamos › Movimientos** tenía su propia lista desplegable de **24
//      quincenas** (`CUANTAS_QUINCENAS`), la CUARTA forma de elegir período del
//      módulo. Desde el 24-sep-2026 manda el selector único de arriba y esa
//      lista ya no se dibujaba; lo que se va ahora es la lista misma, para que
//      no pueda volver sola.
//
//   2. **Colaboradores** abría con la franja amarilla «1 colaborador de 44
//      todavía no sale en la planilla · 1 marca en el reloj y todavía no tiene
//      ficha…». 🔑 **El dato no se pierde**: sale igual en «Antes de cerrar» de
//      la Planilla, como «código del reloj sin ficha» (`antes-de-cerrar.ts`),
//      que es donde frena el cierre. Un cartel permanente arriba de una lista
//      se deja de leer; el mismo aviso pegado al botón que frena, no.
//
// 🔴 `avisoPendientes` SIGUE EXISTIENDO y sigue probada: lo que cambia es que
// la pestaña Colaboradores no la dibuja. Borrar la función sería perder el dato.
//
// ⚠️ Interruptor propio, y no `ASISTENCIA_PANTALLA_2026_09`: aquél se puede
// apagar para devolver las CUATRO pantallas del selector único, y esto es otra
// decisión. En `false` la franja vuelve exactamente donde estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** Hoy prendido. `false` = la franja amarilla vuelve a Colaboradores. */
export const ASISTENCIA_SOBRA_3A = true;

/**
 * Dónde vive ahora el aviso que salía en la franja. Se escribe UNA vez: si
 * mañana cambia de sitio, cambia acá y en el postmortem, no en cinco archivos.
 */
export const DONDE_VIVE_EL_AVISO =
  "«Antes de cerrar», en la Planilla, como «código del reloj sin ficha».";
