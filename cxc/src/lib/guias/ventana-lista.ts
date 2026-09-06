// ─────────────────────────────────────────────────────────────────────────────
// LA VENTANA DE LA LISTA DE GUÍAS — el último mes, y el resto detrás de
// «Ver guías más viejas» (5-sep-2026).
//
// 🩸 `GET /api/guias` no lleva `.limit()` ni paginación: la pantalla se traía
// las **222 guías vivas con sus 532 renglones** de un golpe, y arriba mostraba
// 15 con un «Ver más» que había que tocar **14 veces** para llegar a la primera.
// Medido: **46 guías en el último mes**, o sea que el mes cubre el 21% de la
// historia y el 100% de lo que se está trabajando.
//
// 🔴 EL CORTE ES POR FECHA, NO POR CANTIDAD — la misma decisión que la lista de
// comprobantes de catálogo, y por eso REUSA su aritmética
// (`partirPorVentana`, `lib/catalogo/comprobantes-ventana.ts`) en vez de
// escribir una segunda: «lo del último mes» es una pregunta que se contesta sin
// contar; «las últimas 20» cambia de significado según cuánto se despachó.
//
// ⚠️ Nada se borra ni se deja de pedir: la lista sigue trayendo todo y esto
// solo decide qué se DIBUJA. El día que la ruta gane paginación, este módulo es
// el que dice cuánto pedir.
//
// Módulo PURO: recibe el ahora por parámetro. Nada de `new Date()` adentro.
// ─────────────────────────────────────────────────────────────────────────────

import { partirPorVentana } from "@/lib/catalogo/comprobantes-ventana";
import { diaPanama } from "./pendientes-aviso";

/** Cuántos días abre la lista antes del «Ver guías más viejas». */
export const DIAS_VENTANA_GUIAS = 30;

/** Lo mínimo que la ventana necesita saber de una guía. */
export interface GuiaConFecha {
  fecha?: string | null;
}

/**
 * Parte la lista en lo que se muestra y lo que espera detrás del botón.
 *
 * Una guía SIN fecha (o con una que no se puede leer) cae en `recientes`:
 * esconder una guía por un dato roto sería peor que mostrarla de más — es la
 * misma regla que la lista de comprobantes.
 */
export function partirGuiasPorVentana<T extends GuiaConFecha>(
  guias: readonly T[],
  ahora: Date,
  dias: number = DIAS_VENTANA_GUIAS,
): { recientes: T[]; viejas: T[] } {
  // 🔴 EL CORTE ARRANCA EN EL DÍA, NO EN LA HORA. `fecha` es un día-calendario
  // (`YYYY-MM-DD`, que se lee como medianoche UTC), así que restarle 30 días a
  // «las 10 de la mañana» dejaría afuera la guía de hace exactamente un mes: la
  // ventana valdría 29 días a la tarde y 30 a la madrugada. Se normaliza al día
  // de PANAMÁ, que es el mismo que muestra la lista.
  const hoy = new Date(`${diaPanama(ahora)}T00:00:00Z`);
  const adaptadas = guias.map((g) => ({ created_at: String(g.fecha ?? ""), guia: g }));
  const { recientes, viejos } = partirPorVentana(adaptadas, hoy, dias);
  return { recientes: recientes.map((a) => a.guia), viejas: viejos.map((a) => a.guia) };
}
