// ─────────────────────────────────────────────────────────────────────────────
// DESPACHOS › GUÍAS DE DESPACHO · GRUPOS DE FECHA, SEPARADOS Y MÁS FINOS
// (7-oct-2026, propuesta). Segunda mitad del pedido del 7-oct — la primera
// fue el chip «Pendiente» (commit 4a39e288, ya publicado).
//
// Daniel: «no se ve bien visualmente, algo más separado, mejor visible me
// gustaría, y que sea hoy, ayer, esta semana, semana pasada, este mes, mes
// pasado, algo así».
//
// Dos cambios, nada más:
//
//   1. Los grupos pasan de CUATRO (Hoy · Ayer · Esta semana · Anteriores) a
//      SIETE: + Semana pasada · Este mes · Mes pasado. Un grupo sin guías
//      sigue sin dibujarse (`groupByTimePeriod` ya lo hacía).
//   2. El encabezado del grupo se separa de las filas (más aire arriba,
//      jerarquía más clara) — mismo `TimeGroupHeader` que usa Cheques, con
//      un prop que Cheques nunca pasa: su pantalla no cambia.
//
// El selector de mes de arriba («‹ Octubre 2026 ›», GUIAS_LISTA_APPLE_2026_10)
// ya recorta la lista a UN mes cuando no se busca. Con un mes puesto, un
// encabezado «Este mes» o «Mes pasado» repite lo que ese selector ya dice —
// y si el mes elegido no es el de hoy, «Mes pasado» pasa a ser directamente
// FALSO (ese mes no es "el mes pasado de hoy", es el que Daniel eligió). Por
// eso esos DOS grupos de mes solo aparecen sin un mes puesto: en «Todo el
// año», o al buscar (que ignora el filtro de mes y mira todas las guías).
// Con un mes elegido, lo que quedaría en «Este mes»/«Mes pasado» cae en
// «Anteriores» — sigue siendo cierto: es más viejo que la semana pasada.
//
// `false` = los CUATRO grupos de hoy, con el encabezado de siempre, byte por
// byte. Candado `guias-grupos-fecha-2026-10`.
// ─────────────────────────────────────────────────────────────────────────────

import { esTodoElAnio } from "@/lib/comisiones/periodo";
import type { PeriodoGuias } from "@/lib/guias/lista-apple-2026-10";

/** 🔴 El interruptor. `false` = los cuatro grupos de hoy. */
export const GUIAS_GRUPOS_FECHA_2026_10 = false;

/**
 * ¿Los grupos «Este mes» y «Mes pasado» aportan algo, o repiten/contradicen
 * el selector de mes de arriba? Solo aportan sin un mes puntual puesto: con
 * «Todo el año», o buscando (la búsqueda siempre mira TODAS las guías, sin
 * importar el período elegido — ver `lista-apple-2026-10.ts`).
 */
export function incluirGruposDeMes(periodo: PeriodoGuias | undefined, buscando: boolean): boolean {
  if (buscando) return true;
  if (!periodo) return true;
  return esTodoElAnio(periodo.mes);
}
