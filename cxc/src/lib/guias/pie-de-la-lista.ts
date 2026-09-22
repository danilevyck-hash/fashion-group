// ─────────────────────────────────────────────────────────────────────────────
// EL PIE DE LA LISTA DE GUÍAS — CUÁNTAS SE VEN, DE CUÁNTAS (19-sep-2026).
//
// 🩸 Decía «236 GUÍAS» al pie de una pantalla donde se estaban viendo 47: la
// lista abre con el último mes y el resto espera detrás de «Ver guías más
// viejas», así que el número del pie no era el de lo que había delante. Daniel
// aprobó que diga **«47 guías de 236»**.
//
// 🔴 Con todo a la vista vuelve a ser UN número («236 guías»): el «de N» solo
// aparece cuando de verdad hay algo escondido, para no gastar palabras cuando
// no hay nada que aclarar.
//
// 🔴 Y EL TOTAL DE BULTOS SIGUE A LO QUE SE VE (22-sep-2026). Hasta hoy el
// pie ponía los dos números en la MISMA línea y solo uno seguía al filtro:
// «30 guías de 236 · 8.433 bultos» — los 8.433 son los de las 236. Medido
// contra producción el 22-sep-2026: lo que la lista dibuja al abrir son **30
// guías con 1.629 bultos**, o sea que el número del pie mostraba **5,2 veces**
// lo que había delante. Regla de la casa: *«o el total sigue al filtro, o no
// hay buscador»*.
//
// 🔴 LOS DOS NÚMEROS SALEN DE LA MISMA LISTA. `sumarBultos` recibe exactamente
// el arreglo que se dibujó; escribir la suma sobre otra lista es lo que dejó
// pasar el defecto la primera vez.
//
// 🔄 22-sep-2026 — LA REGLA SE MUDÓ A `lib/ui/pie-de-lista.ts` Y ACÁ SOLO
// QUEDAN LAS PALABRAS. El mismo defecto apareció en Comprobantes de los
// catálogos, y una segunda copia de esta cuenta es justo cómo se llega a que
// una siga al filtro y la otra no. El texto que sale NO cambió.
//
// Módulo PURO: dos números entran, un texto sale.
// ─────────────────────────────────────────────────────────────────────────────

import { textoDelPie } from "@/lib/ui/pie-de-lista";

/** Cómo se nombra lo que esta lista cuenta. */
const PALABRAS = { singular: "guía", plural: "guías" } as const;

/**
 * `mostradas` = las que están dibujadas en la pantalla ahora mismo.
 * `total` = todas las guías vivas, antes de cualquier filtro o ventana.
 */
export function textoPieDeLista(mostradas: number, total: number): string {
  return textoDelPie(mostradas, total, PALABRAS);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS BULTOS DEL PIE — UNA SOLA SUMA PARA LA PANTALLA Y PARA EL EXCEL.
//
// 🩸 Estaba escrita DOS veces con el mismo `reduce` (el pie de `GuiasList` y la
// banda del total del Excel). Dos copias de la misma cuenta es cómo se llega a
// que una siga al filtro y la otra no — que es justo el defecto que este
// módulo vino a cerrar.
//
// 🔴 SE SUMA EL NÚMERO **FINAL**, el que firmó el transportista. `total_bultos`
// lo arma `GET /api/guias` sumando `guia_items.bultos`, que es la columna que
// bodega CORRIGE al despachar; `bultos_original` es el rastro de lo que había
// antes y **no se suma en ninguna parte** — en el papel, el PDF y el Excel sale
// el final, y acá tiene que salir el mismo.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que esta suma necesita de una guía. */
export interface GuiaConBultos {
  /** Los bultos FINALES de la guía: la suma de `guia_items.bultos`. */
  total_bultos?: number | null;
}

/**
 * Los bultos de una lista de guías. Se le pasa **lo que se está mirando**: el
 * pie de la lista le da las filas dibujadas, y el Excel las que exporta.
 */
export function sumarBultos(guias: readonly GuiaConBultos[]): number {
  return guias.reduce((suma, g) => suma + (Number(g.total_bultos) || 0), 0);
}
