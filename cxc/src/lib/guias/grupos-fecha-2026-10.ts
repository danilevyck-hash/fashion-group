// ─────────────────────────────────────────────────────────────────────────────
// DESPACHOS › GUÍAS DE DESPACHO · GRUPOS DE FECHA, SEPARADOS Y MÁS FINOS
// (7-oct-2026, propuesta). Segunda mitad del pedido del 7-oct — la primera
// fue el chip «Pendiente» (commit 4a39e288, ya publicado).
//
// Daniel: «no se ve bien visualmente, algo más separado, mejor visible me
// gustaría, y que sea hoy, ayer, esta semana, semana pasada, este mes, mes
// pasado, algo así». Tras ver el mockup, dos ajustes más:
//   · «quisiera una pequeña separación entre los grupos» → más aire, no solo
//     la línea.
//   · «quiero hasta semana pasada, después es historial» → se sacan «Este
//     mes» y «Mes pasado»; con ellos afuera ya no hay mes que pueda
//     contradecir al selector de arriba, así que esa lógica se retiró
//     entera (vivía acá como `incluirGruposDeMes`).
//
// Dos cambios, nada más:
//
//   1. Los grupos pasan de CUATRO (Hoy · Ayer · Esta semana · Anteriores) a
//      CINCO: Hoy · Ayer · Esta semana · Semana pasada · **Historial** (todo
//      lo más viejo). Un grupo sin guías sigue sin dibujarse
//      (`groupByTimePeriod` ya lo hacía).
//   2. El encabezado del grupo se separa de las filas: más aire arriba y una
//      línea tenue que corta contra el grupo de arriba — mismo
//      `TimeGroupHeader` que usa el resto del sistema, con un prop que nadie
//      más pasa; su pantalla no cambia.
//
// `false` = los CUATRO grupos de hoy, con el encabezado de siempre, byte por
// byte. Candado `guias-grupos-fecha-2026-10`.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El interruptor. `false` = los cuatro grupos de hoy. */
export const GUIAS_GRUPOS_FECHA_2026_10 = false;
